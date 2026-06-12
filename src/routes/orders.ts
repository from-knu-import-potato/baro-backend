import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { orders, orderItems, menus } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, inArray } from 'drizzle-orm'
import { addClient, removeClient, broadcast } from '../lib/sse.js'

const ordersRouter = new Hono<AppEnv>()

const createOrderSchema = z.object({
  tableNumber: z.number().int().min(1),
  items: z.array(z.object({
    menuId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).min(1),
})

const updateStatusSchema = z.object({
  status: z.enum(['preparing', 'completed', 'cancelled']),
})

// 주문 목록 조회 (사장님)
ordersRouter.get('/:storeId/orders', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db.query.orders.findMany({
    where: eq(orders.storeId, storeId),
    with: { items: { with: { menu: true } } },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  })
  return c.json({ success: true, data: list })
})

// 주문 생성 (손님, 인증 불필요)
ordersRouter.post('/:storeId/orders', zValidator('json', createOrderSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { tableNumber, items } = c.req.valid('json')

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

  const [order] = await db.insert(orders).values({ storeId, tableNumber, totalPrice }).returning()

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

  broadcast(storeId, 'new-order', created)

  return c.json({ success: true, data: created }, 201)
})

// 주문 상태 변경 (사장님)
ordersRouter.patch('/:storeId/orders/:orderId/status', authMiddleware, zValidator('json', updateStatusSchema), async (c) => {
  const { storeId, orderId } = c.req.param()
  const { status } = c.req.valid('json')

  const [updated] = await db.update(orders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
    .returning()

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '주문을 찾을 수 없습니다.' } }, 404)
  }

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

export default ordersRouter
