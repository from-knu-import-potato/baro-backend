import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { orders, orderItems, menus, recipes, ingredients, closings, closingDeductions, operatingHours } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, inArray, gte, lt, sql, desc, or } from 'drizzle-orm'
import { toKSTDateStr, getKSTDateRange, getBusinessDateStr, isValidClosingDate } from '../lib/kst.js'

const closingRouter = new OpenAPIHono<AppEnv>()

async function getTodayOpenTime(storeId: string): Promise<string | null> {
  const kstDayOfWeek = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()
  const [row] = await db
    .select({ openTime: operatingHours.openTime, isClosed: operatingHours.isClosed })
    .from(operatingHours)
    .where(and(eq(operatingHours.storeId, storeId), eq(operatingHours.dayOfWeek, kstDayOfWeek)))
    .limit(1)
  return row?.isClosed ? null : (row?.openTime ?? null)
}

// 특정 날짜의 수락된 주문(preparing + completed) 기반 식자재별 차감량 계산
async function calcOrderDeductedMap(storeId: string, dateStr: string): Promise<Map<string, number>> {
  const { start, end } = getKSTDateRange(dateStr)

  const dayOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      or(eq(orders.status, 'preparing'), eq(orders.status, 'completed')),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ),
    with: { items: true },
  })

  const allMenuIds = [...new Set(dayOrders.flatMap((o) => o.items.map((i) => i.menuId)))]
  const deductedMap = new Map<string, number>()

  if (allMenuIds.length === 0) return deductedMap

  const recipeList = await db
    .select({ menuId: recipes.menuId, ingredientId: recipes.ingredientId, amount: recipes.amount })
    .from(recipes)
    .where(inArray(recipes.menuId, allMenuIds))

  for (const order of dayOrders) {
    for (const item of order.items) {
      for (const recipe of recipeList.filter((r) => r.menuId === item.menuId)) {
        const amount = Number(recipe.amount) * item.quantity
        deductedMap.set(recipe.ingredientId, (deductedMap.get(recipe.ingredientId) ?? 0) + amount)
      }
    }
  }

  return deductedMap
}

// 마감 미리보기 조회 (#120)
closingRouter.get('/:storeId/closing/preview', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const dateParam = c.req.query('date')

  let dateStr: string
  if (dateParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam) || !isValidClosingDate(dateParam)) {
      return c.json({
        success: false,
        error: { code: 'BAD_REQUEST', message: '소급 마감은 어제까지만 가능합니다.' },
      }, 400)
    }
    dateStr = dateParam
  } else {
    const openTime = await getTodayOpenTime(storeId)
    dateStr = getBusinessDateStr(openTime)
  }

  const { start, end } = getKSTDateRange(dateStr)

  const [existingClosing] = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.storeId, storeId), eq(closings.date, dateStr)))
    .limit(1)

  const isClosed = !!existingClosing
  const closingId = existingClosing?.id ?? null

  // 완료된 주문으로 매출 계산
  const completedOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'completed'),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ),
    with: { items: true },
  })

  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0)

  // 판매 메뉴 집계 (completed 기준)
  const menuQuantityMap = new Map<string, number>()
  const menuPriceMap = new Map<string, number>()
  for (const order of completedOrders) {
    for (const item of order.items) {
      menuQuantityMap.set(item.menuId, (menuQuantityMap.get(item.menuId) ?? 0) + item.quantity)
      menuPriceMap.set(item.menuId, item.unitPrice)
    }
  }

  const menuIds = [...menuQuantityMap.keys()]
  let soldMenus: { menuId: string; menuName: string; quantity: number; unitPrice: number; subtotal: number }[] = []

  if (menuIds.length > 0) {
    const menuList = await db
      .select({ id: menus.id, name: menus.name })
      .from(menus)
      .where(inArray(menus.id, menuIds))

    const menuNameMap = new Map(menuList.map((m) => [m.id, m.name]))
    soldMenus = menuIds.map((menuId) => {
      const quantity = menuQuantityMap.get(menuId)!
      const unitPrice = menuPriceMap.get(menuId)!
      return { menuId, menuName: menuNameMap.get(menuId) ?? '', quantity, unitPrice, subtotal: quantity * unitPrice }
    })
  }

  // 수락된 주문(preparing + completed) 기반 식자재별 차감량 계산
  const orderDeductedMap = await calcOrderDeductedMap(storeId, dateStr)

  // 차감된 식자재 목록 구성
  const deductedIngredientIds = [...orderDeductedMap.keys()]
  let inventoryDeductions: {
    ingredientId: string
    ingredientName: string
    unit: string
    openingStock: number
    orderDeductedAmount: number
    currentStock: number
    isNegative: boolean
  }[] = []

  if (deductedIngredientIds.length > 0) {
    const ingredientList = await db
      .select({ id: ingredients.id, name: ingredients.name, unit: ingredients.unit, currentStock: ingredients.currentStock })
      .from(ingredients)
      .where(inArray(ingredients.id, deductedIngredientIds))

    inventoryDeductions = ingredientList.map((ingr) => {
      const orderDeductedAmount = orderDeductedMap.get(ingr.id) ?? 0
      const currentStock = Number(ingr.currentStock)
      const openingStock = currentStock + orderDeductedAmount
      return {
        ingredientId: ingr.id,
        ingredientName: ingr.name,
        unit: ingr.unit,
        openingStock,
        orderDeductedAmount,
        currentStock,
        isNegative: currentStock < 0,
      }
    })
  }

  return c.json({
    success: true,
    data: { date: dateStr, isClosed, closingId, totalRevenue, soldMenus, inventoryDeductions },
  })
})

// 마감 이력 조회
closingRouter.get('/:storeId/closing', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const history = await db
    .select({
      id: closings.id,
      date: closings.date,
      totalRevenue: closings.totalRevenue,
      createdAt: closings.createdAt,
    })
    .from(closings)
    .where(eq(closings.storeId, storeId))
    .orderBy(desc(closings.date))

  return c.json({ success: true, data: history })
})

// 특정 마감 상세 조회
closingRouter.get('/:storeId/closing/:closingId', authMiddleware, async (c) => {
  const { storeId, closingId } = c.req.param()

  const [closing] = await db
    .select({ id: closings.id, date: closings.date, totalRevenue: closings.totalRevenue, createdAt: closings.createdAt })
    .from(closings)
    .where(and(eq(closings.id, closingId), eq(closings.storeId, storeId)))
    .limit(1)

  if (!closing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '마감 기록을 찾을 수 없습니다.' } }, 404)
  }

  const deductions = await db
    .select({
      ingredientId: closingDeductions.ingredientId,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      orderDeductedAmount: closingDeductions.orderDeductedAmount,
      actualUsage: closingDeductions.actualUsage,
      adjustmentAmount: closingDeductions.adjustmentAmount,
      remainingStock: closingDeductions.remainingStock,
    })
    .from(closingDeductions)
    .innerJoin(ingredients, eq(closingDeductions.ingredientId, ingredients.id))
    .where(eq(closingDeductions.closingId, closingId))

  const { start, end } = getKSTDateRange(closing.date)

  const completedOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'completed'),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ),
    with: { items: true },
  })

  const menuQuantityMap = new Map<string, number>()
  const menuPriceMap = new Map<string, number>()
  for (const order of completedOrders) {
    for (const item of order.items) {
      menuQuantityMap.set(item.menuId, (menuQuantityMap.get(item.menuId) ?? 0) + item.quantity)
      menuPriceMap.set(item.menuId, item.unitPrice)
    }
  }

  const menuIds = [...menuQuantityMap.keys()]
  let soldMenus: { menuId: string; menuName: string; quantity: number; unitPrice: number; subtotal: number }[] = []

  if (menuIds.length > 0) {
    const menuList = await db
      .select({ id: menus.id, name: menus.name })
      .from(menus)
      .where(inArray(menus.id, menuIds))

    const menuNameMap = new Map(menuList.map((m) => [m.id, m.name]))
    soldMenus = menuIds.map((menuId) => {
      const quantity = menuQuantityMap.get(menuId)!
      const unitPrice = menuPriceMap.get(menuId)!
      return { menuId, menuName: menuNameMap.get(menuId) ?? '', quantity, unitPrice, subtotal: quantity * unitPrice }
    })
  }

  return c.json({
    success: true,
    data: {
      id: closing.id,
      date: closing.date,
      totalRevenue: closing.totalRevenue,
      createdAt: closing.createdAt,
      soldMenus,
      inventoryDeductions: deductions.map((d) => ({
        ingredientId: d.ingredientId,
        ingredientName: d.ingredientName,
        unit: d.unit,
        orderDeductedAmount: Number(d.orderDeductedAmount),
        actualUsage: Number(d.actualUsage),
        adjustmentAmount: Number(d.adjustmentAmount),
        remainingStock: Number(d.remainingStock),
      })),
    },
  })
})

// 마감 확정 처리 (#118)
const closingConfirmSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inventoryDeductions: z.array(z.object({
    ingredientId: z.string().uuid(),
    remainingStock: z.number().min(0),
  })),
})

closingRouter.post('/:storeId/closing', authMiddleware, validate('json', closingConfirmSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { date: dateParam, inventoryDeductions } = c.req.valid('json')

  const openTime = await getTodayOpenTime(storeId)
  const date = dateParam ?? getBusinessDateStr(openTime)

  if (!isValidClosingDate(date)) {
    return c.json({
      success: false,
      error: { code: 'BAD_REQUEST', message: '소급 마감은 어제까지만 가능합니다.' },
    }, 400)
  }

  const existing = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.storeId, storeId), eq(closings.date, date)))
    .limit(1)

  if (existing.length > 0) {
    return c.json({
      success: false,
      error: { code: 'CONFLICT', message: '이미 마감된 날짜입니다.' },
    }, 409)
  }

  const ingredientIds = inventoryDeductions.map((d) => d.ingredientId)
  const owned = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.storeId, storeId), inArray(ingredients.id, ingredientIds)))

  if (owned.length !== ingredientIds.length) {
    return c.json({
      success: false,
      error: { code: 'BAD_REQUEST', message: '유효하지 않은 식자재가 포함되어 있습니다.' },
    }, 400)
  }

  // 오늘 매출 계산
  const { start, end } = getKSTDateRange(date)
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${orders.totalPrice}), 0)` })
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'completed'),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ))

  const totalRevenue = Number(total)

  // 오늘 수락된 주문 기반 식자재별 차감량 계산
  const orderDeductedMap = await calcOrderDeductedMap(storeId, date)

  const [closing] = await db.insert(closings).values({ storeId, date, totalRevenue }).returning()

  const result: {
    ingredientId: string
    ingredientName: string
    unit: string
    orderDeductedAmount: number
    actualUsage: number
    adjustmentAmount: number
    remainingStock: number
  }[] = []

  for (const deduction of inventoryDeductions) {
    const [ingr] = await db
      .select({ id: ingredients.id, name: ingredients.name, unit: ingredients.unit, currentStock: ingredients.currentStock })
      .from(ingredients)
      .where(eq(ingredients.id, deduction.ingredientId))

    const orderDeductedAmount = orderDeductedMap.get(deduction.ingredientId) ?? 0
    const currentStock = Number(ingr.currentStock)
    const openingStock = currentStock + orderDeductedAmount
    const actualUsage = openingStock - deduction.remainingStock
    const adjustmentAmount = actualUsage - orderDeductedAmount  // = currentStock - remainingStock

    await db.update(ingredients)
      .set({ currentStock: String(deduction.remainingStock), updatedAt: new Date() })
      .where(eq(ingredients.id, deduction.ingredientId))

    await db.insert(closingDeductions).values({
      closingId: closing.id,
      ingredientId: deduction.ingredientId,
      orderDeductedAmount: String(orderDeductedAmount),
      actualUsage: String(actualUsage),
      adjustmentAmount: String(adjustmentAmount),
      remainingStock: String(deduction.remainingStock),
    })

    result.push({
      ingredientId: ingr.id,
      ingredientName: ingr.name,
      unit: ingr.unit,
      orderDeductedAmount,
      actualUsage,
      adjustmentAmount,
      remainingStock: deduction.remainingStock,
    })
  }

  return c.json({
    success: true,
    data: { closingId: closing.id, date, totalRevenue, deductedIngredients: result },
  }, 201)
})

// 마감 취소 (#119)
closingRouter.delete('/:storeId/closing/:closingId', authMiddleware, async (c) => {
  const { storeId, closingId } = c.req.param()

  const [closing] = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.id, closingId), eq(closings.storeId, storeId)))
    .limit(1)

  if (!closing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '마감 기록을 찾을 수 없습니다.' } }, 404)
  }

  // 보정값(adjustmentAmount)만 복원 — 주문별 차감은 건드리지 않음
  const deductions = await db
    .select({ ingredientId: closingDeductions.ingredientId, adjustmentAmount: closingDeductions.adjustmentAmount })
    .from(closingDeductions)
    .where(eq(closingDeductions.closingId, closingId))

  for (const deduction of deductions) {
    await db.update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} + ${deduction.adjustmentAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, deduction.ingredientId))
  }

  await db.delete(closings).where(eq(closings.id, closingId))

  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const closingIdParam = { name: 'closingId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

closingRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/closing/preview',
  tags: ['Closing'],
  summary: '마감 미리보기',
  description: '개점 시 재고(역산), 오늘 주문 차감량, 마이너스 재고 항목을 포함한 마감 전 현황을 반환합니다.',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'date', in: 'query', required: false, schema: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: '소급 마감 날짜 (어제까지만 가능)' }],
  responses: { 200: { description: '마감 미리보기 (soldMenus, inventoryDeductions 포함)' }, 400: { description: '소급 마감 범위 초과' }, 401: { description: '인증 필요' } },
})

closingRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/closing',
  tags: ['Closing'],
  summary: '마감 이력 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '마감 이력 목록 (날짜 내림차순)' }, 401: { description: '인증 필요' } },
})

closingRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/closing/{closingId}',
  tags: ['Closing'],
  summary: '특정 마감 상세 조회',
  security: bearerSecurity,
  parameters: [storeIdParam, closingIdParam],
  responses: { 200: { description: '마감 상세 (soldMenus, inventoryDeductions 포함)' }, 401: { description: '인증 필요' }, 404: { description: '마감 기록 없음' } },
})

closingRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/closing',
  tags: ['Closing'],
  summary: '마감 확정 (보정값 적용)',
  description: '사장님이 직접 확인한 잔여 재고(remainingStock)를 입력하면, 주문 차감분과의 차이(adjustmentAmount)를 계산해 재고를 remainingStock으로 맞춥니다.',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['inventoryDeductions'], properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '소급 마감 날짜 (생략 시 오늘)' }, inventoryDeductions: { type: 'array', items: { type: 'object', required: ['ingredientId', 'remainingStock'], properties: { ingredientId: { type: 'string', format: 'uuid' }, remainingStock: { type: 'number', minimum: 0, description: '사장님이 직접 확인한 현재 잔여 재고량' } } } } } } } } },
  responses: { 201: { description: '마감 완료, closingId 반환' }, 400: { description: '유효하지 않은 날짜 또는 식자재' }, 401: { description: '인증 필요' }, 409: { description: '이미 마감된 날짜' } },
})

closingRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/closing/{closingId}',
  tags: ['Closing'],
  summary: '마감 취소 (보정값만 복원)',
  description: '마감 시 적용된 보정값(adjustmentAmount)만 복원합니다. 주문별 실시간 차감량은 유지됩니다.',
  security: bearerSecurity,
  parameters: [storeIdParam, closingIdParam],
  responses: { 200: { description: '마감 취소 및 보정값 복원 완료' }, 401: { description: '인증 필요' }, 404: { description: '마감 기록 없음' } },
})

export default closingRouter
