import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { orders, orderItems, menus, recipes, ingredients, closings, closingDeductions } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, inArray, gte, lt, sql, desc } from 'drizzle-orm'

const closingRouter = new Hono<AppEnv>()

// KST(UTC+9) 기준 오늘 날짜 범위
function getKSTTodayRange() {
  const nowUTC = new Date()
  const kstMs = 9 * 60 * 60 * 1000
  const nowKST = new Date(nowUTC.getTime() + kstMs)
  const todayStartKST = new Date(Date.UTC(nowKST.getUTCFullYear(), nowKST.getUTCMonth(), nowKST.getUTCDate()))
  const tomorrowStartKST = new Date(todayStartKST.getTime() + 86400000)
  const yy = nowKST.getUTCFullYear()
  const mm = String(nowKST.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(nowKST.getUTCDate()).padStart(2, '0')
  return {
    start: new Date(todayStartKST.getTime() - kstMs),
    end: new Date(tomorrowStartKST.getTime() - kstMs),
    dateStr: `${yy}-${mm}-${dd}`,
  }
}

// 마감 미리보기 조회
closingRouter.get('/:storeId/closing/preview', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const { start, end, dateStr } = getKSTTodayRange()

  const [todayClosing] = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.storeId, storeId), eq(closings.date, dateStr)))
    .limit(1)

  const isClosed = !!todayClosing
  const closingId = todayClosing?.id ?? null

  const todayOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'completed'),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
    ),
    with: { items: true },
  })

  if (todayOrders.length === 0) {
    return c.json({
      success: true,
      data: { date: dateStr, isClosed, closingId, totalRevenue: 0, soldMenus: [], inventoryDeductions: [] },
    })
  }

  const totalRevenue = todayOrders.reduce((sum, o) => sum + o.totalPrice, 0)

  // 메뉴별 판매 수량·단가 집계
  const menuQuantityMap = new Map<string, number>()
  const menuPriceMap = new Map<string, number>()
  for (const order of todayOrders) {
    for (const item of order.items) {
      menuQuantityMap.set(item.menuId, (menuQuantityMap.get(item.menuId) ?? 0) + item.quantity)
      menuPriceMap.set(item.menuId, item.unitPrice)
    }
  }

  const menuIds = [...menuQuantityMap.keys()]

  const menuList = await db
    .select({ id: menus.id, name: menus.name })
    .from(menus)
    .where(inArray(menus.id, menuIds))

  const menuNameMap = new Map(menuList.map((m) => [m.id, m.name]))

  const soldMenus = menuIds.map((menuId) => {
    const quantity = menuQuantityMap.get(menuId)!
    const unitPrice = menuPriceMap.get(menuId)!
    return {
      menuId,
      menuName: menuNameMap.get(menuId) ?? '',
      quantity,
      unitPrice,
      subtotal: quantity * unitPrice,
    }
  })

  // 레시피 기반 이론 차감량 계산
  const recipeList = await db
    .select({
      menuId: recipes.menuId,
      ingredientId: recipes.ingredientId,
      amount: recipes.amount,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
    })
    .from(recipes)
    .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
    .where(inArray(recipes.menuId, menuIds))

  const ingredientMap = new Map<string, {
    ingredientId: string
    ingredientName: string
    unit: string
    theoreticalUsage: number
    currentStock: number
  }>()

  for (const recipe of recipeList) {
    const qty = menuQuantityMap.get(recipe.menuId) ?? 0
    const usage = Number(recipe.amount) * qty
    const existing = ingredientMap.get(recipe.ingredientId)
    if (existing) {
      existing.theoreticalUsage += usage
    } else {
      ingredientMap.set(recipe.ingredientId, {
        ingredientId: recipe.ingredientId,
        ingredientName: recipe.ingredientName,
        unit: recipe.unit,
        theoreticalUsage: usage,
        currentStock: Number(recipe.currentStock),
      })
    }
  }

  return c.json({
    success: true,
    data: {
      date: dateStr,
      isClosed,
      closingId,
      totalRevenue,
      soldMenus,
      inventoryDeductions: [...ingredientMap.values()],
    },
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

// 마감 완료 처리
const closingConfirmSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inventoryDeductions: z.array(z.object({
    ingredientId: z.string().uuid(),
    actualUsage: z.number().min(0),
  })).min(1),
})

closingRouter.post('/:storeId/closing', authMiddleware, zValidator('json', closingConfirmSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { date, inventoryDeductions } = c.req.valid('json')

  // 동일 날짜 중복 마감 방지
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

  // 해당 가게 식자재인지 검증
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

  // 오늘 완료 주문 총 매출
  const { start, end } = getKSTTodayRange()
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

  const [closing] = await db.insert(closings).values({ storeId, date, totalRevenue }).returning()

  const deductedIngredients: {
    ingredientId: string
    ingredientName: string
    unit: string
    usedAmount: number
    remainingStock: number
  }[] = []

  for (const deduction of inventoryDeductions) {
    const [ingr] = await db
      .select({ id: ingredients.id, name: ingredients.name, unit: ingredients.unit, currentStock: ingredients.currentStock })
      .from(ingredients)
      .where(eq(ingredients.id, deduction.ingredientId))

    const newStock = Math.max(0, Number(ingr.currentStock) - deduction.actualUsage)

    await db.update(ingredients)
      .set({ currentStock: String(newStock), updatedAt: new Date() })
      .where(eq(ingredients.id, deduction.ingredientId))

    await db.insert(closingDeductions).values({
      closingId: closing.id,
      ingredientId: deduction.ingredientId,
      usedAmount: String(deduction.actualUsage),
      remainingStock: String(newStock),
    })

    deductedIngredients.push({
      ingredientId: ingr.id,
      ingredientName: ingr.name,
      unit: ingr.unit,
      usedAmount: deduction.actualUsage,
      remainingStock: newStock,
    })
  }

  return c.json({
    success: true,
    data: { closingId: closing.id, totalRevenue, deductedIngredients },
  }, 201)
})

// 마감 취소
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

  // 차감된 재고 복구
  const deductions = await db
    .select({ ingredientId: closingDeductions.ingredientId, usedAmount: closingDeductions.usedAmount })
    .from(closingDeductions)
    .where(eq(closingDeductions.closingId, closingId))

  for (const deduction of deductions) {
    await db.update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} + ${deduction.usedAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, deduction.ingredientId))
  }

  // 마감 삭제 (closing_deductions는 cascade로 자동 삭제)
  await db.delete(closings).where(eq(closings.id, closingId))

  return c.json({ success: true, data: null })
})

export default closingRouter
