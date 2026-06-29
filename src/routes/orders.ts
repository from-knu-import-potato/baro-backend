import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { orders, orderItems, menus, recipes, ingredients, storeOpens, closings, operatingHours } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, inArray, sql, gte, lt } from 'drizzle-orm'
import { addClient, removeClient, broadcast } from '../lib/sse.js'
import { getBusinessDateStr, getKSTDateRange } from '../lib/kst.js'

const ordersRouter = new OpenAPIHono<AppEnv>()

const createOrderSchema = z.object({
  tableNumber: z.number().int().min(1),
  items: z.array(z.object({
    menuId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).min(1),
  customerNote: z.string().max(200).optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['preparing', 'completed', 'cancelled']),
  restoreStock: z.boolean().optional(),
})

async function getTodayOpenTime(storeId: string): Promise<string | null> {
  const kstDayOfWeek = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()
  const [row] = await db
    .select({ openTime: operatingHours.openTime, isClosed: operatingHours.isClosed })
    .from(operatingHours)
    .where(and(eq(operatingHours.storeId, storeId), eq(operatingHours.dayOfWeek, kstDayOfWeek)))
    .limit(1)
  return row?.isClosed ? null : (row?.openTime ?? null)
}

// 주문 수락(preparing) 또는 취소 시 재고 조정
// sign=1: 차감, sign=-1: 복원
async function adjustStockForOrder(orderId: string, sign: 1 | -1) {
  const itemList = await db
    .select({ menuId: orderItems.menuId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  const menuIds = itemList.map((i) => i.menuId)
  if (menuIds.length === 0) return

  const recipeList = await db
    .select({ menuId: recipes.menuId, ingredientId: recipes.ingredientId, amount: recipes.amount })
    .from(recipes)
    .where(inArray(recipes.menuId, menuIds))

  const deductionMap = new Map<string, number>()
  for (const recipe of recipeList) {
    const item = itemList.find((i) => i.menuId === recipe.menuId)
    if (!item) continue
    const amount = Number(recipe.amount) * item.quantity
    deductionMap.set(recipe.ingredientId, (deductionMap.get(recipe.ingredientId) ?? 0) + amount)
  }

  for (const [ingredientId, amount] of deductionMap.entries()) {
    const delta = sign * amount
    await db.update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} - ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, ingredientId))
  }
}

type StockWarning = {
  ingredientName: string
  required: number
  currentStock: number
  unit: string
}

/**
 * pending 주문 전체에 대해 재고 경고 계산.
 * effectiveStock = currentStock - 다른 pending 주문들의 소요량
 * → effectiveStock < 이 주문의 소요량이면 경고
 */
async function calcPendingStockWarnings(
  storeId: string,
): Promise<Map<string, StockWarning[]>> {
  const openTime = await getTodayOpenTime(storeId)
  const businessDate = getBusinessDateStr(openTime)
  const { start, end } = getKSTDateRange(businessDate)

  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'pending'),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ),
    with: { items: true },
  })

  if (pendingOrders.length === 0) return new Map()

  const allMenuIds = [...new Set(pendingOrders.flatMap((o) => o.items.map((i) => i.menuId)))]

  const recipeList = await db
    .select({
      menuId: recipes.menuId,
      ingredientId: recipes.ingredientId,
      amount: recipes.amount,
      ingredientName: ingredients.name,
      currentStock: ingredients.currentStock,
      unit: ingredients.unit,
    })
    .from(recipes)
    .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
    .where(inArray(recipes.menuId, allMenuIds))

  // orderId → ingredientId → required
  const orderRequirements = new Map<string, Map<string, number>>()
  for (const order of pendingOrders) {
    const reqMap = new Map<string, number>()
    for (const recipe of recipeList) {
      const item = order.items.find((i) => i.menuId === recipe.menuId)
      if (!item) continue
      const amount = Number(recipe.amount) * item.quantity
      reqMap.set(recipe.ingredientId, (reqMap.get(recipe.ingredientId) ?? 0) + amount)
    }
    orderRequirements.set(order.id, reqMap)
  }

  // ingredientId → { currentStock, ingredientName, unit }
  const ingredientInfoMap = new Map<string, { currentStock: number; ingredientName: string; unit: string }>()
  for (const recipe of recipeList) {
    if (!ingredientInfoMap.has(recipe.ingredientId)) {
      ingredientInfoMap.set(recipe.ingredientId, {
        currentStock: Number(recipe.currentStock),
        ingredientName: recipe.ingredientName,
        unit: recipe.unit,
      })
    }
  }

  // 각 pending 주문별 경고 계산
  const result = new Map<string, StockWarning[]>()
  for (const order of pendingOrders) {
    const myReqs = orderRequirements.get(order.id) ?? new Map<string, number>()
    const warnings: StockWarning[] = []

    for (const [ingredientId, myRequired] of myReqs.entries()) {
      const info = ingredientInfoMap.get(ingredientId)
      if (!info) continue

      // 다른 pending 주문들의 소요량 합산
      let othersRequired = 0
      for (const [otherId, otherReqs] of orderRequirements.entries()) {
        if (otherId === order.id) continue
        othersRequired += otherReqs.get(ingredientId) ?? 0
      }

      const effectiveStock = info.currentStock - othersRequired
      if (effectiveStock < myRequired) {
        warnings.push({
          ingredientName: info.ingredientName,
          required: myRequired,
          currentStock: effectiveStock,
          unit: info.unit,
        })
      }
    }

    result.set(order.id, warnings)
  }

  return result
}

// 주문 목록 조회 (사장님)
ordersRouter.get('/:storeId/orders', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db.query.orders.findMany({
    where: eq(orders.storeId, storeId),
    with: { items: { with: { menu: true } } },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  })

  const pendingWarningsMap = await calcPendingStockWarnings(storeId)

  const data = list.map((order) => ({
    ...order,
    stockWarnings: order.status === 'pending' ? (pendingWarningsMap.get(order.id) ?? []) : [],
  }))

  return c.json({ success: true, data })
})

// 주문 생성 (손님, 인증 불필요)
ordersRouter.post('/:storeId/orders', validate('json', createOrderSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { tableNumber, items, customerNote } = c.req.valid('json')

  // 개점 여부 검증 (#114)
  const openTime = await getTodayOpenTime(storeId)
  const businessDate = getBusinessDateStr(openTime)

  const [openRecord] = await db
    .select({ id: storeOpens.id })
    .from(storeOpens)
    .where(and(eq(storeOpens.storeId, storeId), eq(storeOpens.businessDate, businessDate)))
    .limit(1)

  if (!openRecord) {
    return c.json({ success: false, error: { code: 'STORE_CLOSED', message: '현재 영업 중이 아닙니다.' } }, 400)
  }

  const [closingRecord] = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.storeId, storeId), eq(closings.date, businessDate)))
    .limit(1)

  if (closingRecord) {
    return c.json({ success: false, error: { code: 'STORE_CLOSED', message: '오늘 영업이 마감되었습니다.' } }, 400)
  }

  // 메뉴 유효성 검사
  const menuIds = items.map((i) => i.menuId)
  const menuList = await db.select().from(menus).where(
    and(eq(menus.storeId, storeId), inArray(menus.id, menuIds))
  )

  if (menuList.length !== menuIds.length) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '유효하지 않은 메뉴가 포함되어 있습니다.' } }, 400)
  }

  const menuMap = new Map(menuList.map((m) => [m.id, m]))
  const totalPrice = items.reduce((sum, item) => {
    return sum + menuMap.get(item.menuId)!.price * item.quantity
  }, 0)

  const [order] = await db.insert(orders).values({ storeId, tableNumber, totalPrice, customerNote }).returning()

  await db.insert(orderItems).values(
    items.map((item) => ({
      orderId: order.id,
      menuId: item.menuId,
      quantity: item.quantity,
      unitPrice: menuMap.get(item.menuId)!.price,
    }))
  )

  const created = await db.query.orders.findFirst({
    where: eq(orders.id, order.id),
    with: { items: { with: { menu: true } } },
  })

  // 재고 부족 경고 계산 — pending 주문 전체 기준 (#127)
  const pendingWarningsMap = await calcPendingStockWarnings(storeId)
  const stockWarnings = pendingWarningsMap.get(order.id) ?? []

  broadcast(storeId, 'new-order', { ...created, stockWarnings })

  return c.json({ success: true, data: created }, 201)
})

// 주문 상태 변경 (사장님)
ordersRouter.patch('/:storeId/orders/:orderId/status', authMiddleware, validate('json', updateStatusSchema), async (c) => {
  const { storeId, orderId } = c.req.param()
  const { status, restoreStock } = c.req.valid('json')

  const [currentOrder] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .limit(1)

  if (!currentOrder) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '주문을 찾을 수 없습니다.' } }, 404)
  }

  const prevStatus = currentOrder.status

  // 유효하지 않은 상태 전환 방지
  if (prevStatus === 'cancelled') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '이미 취소된 주문입니다.' } }, 400)
  }
  if (prevStatus === 'completed' && status === 'preparing') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '완료된 주문은 수락 상태로 되돌릴 수 없습니다.' } }, 400)
  }

  // 재고 조정 (#116, #117)
  if (status === 'preparing' && prevStatus === 'pending') {
    await adjustStockForOrder(orderId, 1) // 수락 시 차감
  } else if (status === 'cancelled' && prevStatus === 'preparing') {
    await adjustStockForOrder(orderId, -1) // preparing 취소 시 복원
  } else if (status === 'cancelled' && prevStatus === 'completed' && restoreStock === true) {
    await adjustStockForOrder(orderId, -1) // completed 취소 + 재고 복원 선택 시
  }

  const [updated] = await db.update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning()

  broadcast(storeId, 'order-status-changed', updated)

  return c.json({ success: true, data: updated })
})

// SSE 실시간 스트림 (사장님)
ordersRouter.get('/:storeId/orders/stream', authMiddleware, (c) => {
  const storeId = c.req.param('storeId')

  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (data: string) => controller.enqueue(new TextEncoder().encode(data))

        addClient(storeId, send)
        send(': connected\n\n')

        c.req.raw.signal.addEventListener('abort', () => {
          removeClient(storeId, send)
          controller.close()
        })
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  )
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

ordersRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/orders',
  tags: ['Orders'],
  summary: '주문 목록 조회 (사장님)',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '주문 목록 (items, menu 포함). pending 주문에는 stockWarnings 필드 포함.' }, 401: { description: '인증 필요' } },
})

ordersRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/orders',
  tags: ['Orders'],
  summary: '주문 생성 (손님, 인증 불필요)',
  description: '개점된 가게에만 주문 가능. SSE new-order 이벤트 페이로드에 stockWarnings 포함.',
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['tableNumber', 'items'], properties: { tableNumber: { type: 'integer', minimum: 1 }, items: { type: 'array', items: { type: 'object', required: ['menuId', 'quantity'], properties: { menuId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1 } } }, minItems: 1 }, customerNote: { type: 'string', maxLength: 200 } } } } } },
  responses: { 201: { description: '생성된 주문 (SSE 이벤트 발생, stockWarnings 포함)' }, 400: { description: '유효하지 않은 메뉴 또는 미개점 상태' } },
})

ordersRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}/orders/{orderId}/status',
  tags: ['Orders'],
  summary: '주문 상태 변경 (사장님)',
  description: 'preparing 전환 시 재고 차감, cancelled 전환 시 복원. completed→cancelled 는 restoreStock 옵션으로 재고 복원 여부 선택.',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'orderId', in: 'path', required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['preparing', 'completed', 'cancelled'] }, restoreStock: { type: 'boolean', description: 'completed→cancelled 시 재고 복원 여부' } } } } } },
  responses: { 200: { description: '업데이트된 주문 상태 (SSE 이벤트 발생)' }, 400: { description: '유효하지 않은 상태 전환' }, 401: { description: '인증 필요' }, 404: { description: '주문 없음' } },
})

ordersRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/orders/stream',
  tags: ['Orders'],
  summary: 'SSE 실시간 주문 스트림 (사장님)',
  description: 'Server-Sent Events 스트림. 새 주문 및 상태 변경 시 실시간 이벤트 수신.',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: 'SSE 스트림 (text/event-stream)', content: { 'text/event-stream': { schema: { type: 'string' as const } } } } },
})

export default ordersRouter
