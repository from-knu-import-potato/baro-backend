import { Hono } from 'hono'
import { db } from '../db/index.js'
import { orders, ingredients, inboundItems, inboundRecords } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, gte, lt, ne, count, sql } from 'drizzle-orm'

const dashboardRouter = new Hono<AppEnv>()

// 대시보드 통계 요약
dashboardRouter.get('/:storeId/dashboard/stats', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [{ total: totalInventory }] = await db
    .select({ total: count() })
    .from(ingredients)
    .where(eq(ingredients.storeId, storeId))

  // 안전재고 미달 수 (발주 가이드 API 구현 전 임시)
  const [{ total: lowStockCount }] = await db
    .select({ total: count() })
    .from(ingredients)
    .where(and(
      eq(ingredients.storeId, storeId),
      sql`${ingredients.currentStock} < ${ingredients.safetyStock}`,
    ))

  // 유통기한 7일 이내 식자재 수 (중복 제거)
  const [{ total: expiringCount }] = await db
    .select({ total: sql<number>`cast(count(distinct ${inboundItems.ingredientId}) as int)` })
    .from(inboundItems)
    .innerJoin(ingredients, eq(inboundItems.ingredientId, ingredients.id))
    .where(and(
      eq(ingredients.storeId, storeId),
      sql`${inboundItems.expiryDate} >= CURRENT_DATE`,
      sql`${inboundItems.expiryDate} <= CURRENT_DATE + INTERVAL '7 days'`,
    ))

  const [{ total: thisMonthRevenue }] = await db
    .select({ total: sql<string>`coalesce(sum(${orders.totalPrice}), 0)` })
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      ne(orders.status, 'cancelled'),
      gte(orders.createdAt, thisMonthStart),
      lt(orders.createdAt, nextMonthStart),
    ))

  const [{ total: lastMonthRevenue }] = await db
    .select({ total: sql<string>`coalesce(sum(${orders.totalPrice}), 0)` })
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      ne(orders.status, 'cancelled'),
      gte(orders.createdAt, lastMonthStart),
      lt(orders.createdAt, thisMonthStart),
    ))

  const thisMonth = Number(thisMonthRevenue)
  const lastMonth = Number(lastMonthRevenue)
  const monthlyConsumptionChange =
    lastMonth === 0 ? 0 : Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10

  return c.json({
    success: true,
    data: {
      totalInventory,
      expiringItems: expiringCount,
      aiOrderRecommendations: lowStockCount,
      monthlyConsumption: thisMonth,
      monthlyConsumptionChange,
      lastUpdated: now.toISOString(),
    },
  })
})

// 월별 매출 데이터 (최근 12개월)
dashboardRouter.get('/:storeId/dashboard/sales', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const now = new Date()

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return {
      label: `${d.getMonth() + 1}월`,
      start: d,
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    }
  })

  const periodStart = months[0].start
  const periodEnd = months[11].end

  const allOrders = await db
    .select({ createdAt: orders.createdAt, totalPrice: orders.totalPrice })
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      ne(orders.status, 'cancelled'),
      gte(orders.createdAt, periodStart),
      lt(orders.createdAt, periodEnd),
    ))

  // 월별 입고 비용 (수량 × 단가 합계)
  const allInbound = await db
    .select({
      createdAt: inboundRecords.createdAt,
      cost: sql<string>`coalesce(${inboundItems.amount} * ${inboundItems.unitPrice}, 0)`,
    })
    .from(inboundRecords)
    .innerJoin(inboundItems, eq(inboundItems.inboundRecordId, inboundRecords.id))
    .where(and(
      eq(inboundRecords.storeId, storeId),
      gte(inboundRecords.createdAt, periodStart),
      lt(inboundRecords.createdAt, periodEnd),
    ))

  const salesData = months.map(({ label, start, end }) => {
    const sales = allOrders
      .filter((o) => o.createdAt >= start && o.createdAt < end)
      .reduce((sum, o) => sum + o.totalPrice, 0)
    const consumption = allInbound
      .filter((i) => i.createdAt >= start && i.createdAt < end)
      .reduce((sum, i) => sum + Number(i.cost), 0)
    return { month: label, consumption, sales }
  })

  return c.json({ success: true, data: salesData })
})

export default dashboardRouter
