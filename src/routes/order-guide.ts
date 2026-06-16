import { Hono } from 'hono'
import Groq from 'groq-sdk'
import { db } from '../db/index.js'
import { ingredients, recipes, menus, orders, closings, closingDeductions, orderGuides, orderGuideItems } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, sql, inArray, gte, desc } from 'drizzle-orm'

const orderGuideRouter = new Hono<AppEnv>()

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

type OrderGuideStatus = 'critical' | 'warning' | 'expiry'

type OrderGuideItem = {
  ingredientId: string
  ingredientName: string
  unit: 'g' | 'ml' | '개'
  currentStock: number
  safetyStock: number
  status: OrderGuideStatus
  recommendedOrderAmount: number
  reason: string
}

function calcStatus(current: number, safety: number): 'critical' | 'warning' {
  if (current < safety * 0.5) return 'critical'
  return 'warning'
}

function calcRecommendedAmount(current: number, safety: number): number {
  return Math.max(0, safety * 2 - current)
}

// 발주 가이드 조회 — 가장 최근 AI 생성 결과 반환
orderGuideRouter.get('/:storeId/order-guide', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const [latestGuide] = await db
    .select()
    .from(orderGuides)
    .where(eq(orderGuides.storeId, storeId))
    .orderBy(desc(orderGuides.generatedAt))
    .limit(1)

  if (!latestGuide) {
    return c.json({
      success: true,
      data: { generatedAt: null, summary: null, items: [] },
    })
  }

  const items = await db
    .select()
    .from(orderGuideItems)
    .where(eq(orderGuideItems.orderGuideId, latestGuide.id))

  return c.json({
    success: true,
    data: {
      generatedAt: latestGuide.generatedAt.toISOString(),
      summary: latestGuide.summary,
      items: items.map((item) => ({
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        unit: item.unit,
        currentStock: Number(item.currentStock),
        safetyStock: Number(item.safetyStock),
        status: item.status as OrderGuideStatus,
        recommendedOrderAmount: Number(item.recommendedOrderAmount),
        reason: item.reason,
      })),
    },
  })
})

// AI 발주 가이드 생성 및 DB 저장 (마감 후 호출)
orderGuideRouter.post('/:storeId/order-guide/generate', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const body = await c.req.json<{ closingId?: string }>().catch(() => ({}))
  const closingId = body.closingId ?? null

  // 1. 전체 식자재 + 가장 가까운 유통기한
  const allIngredients = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      safetyStock: ingredients.safetyStock,
      nearestExpiryDate: sql<string | null>`(
        SELECT MIN(ii.expiry_date)
        FROM inbound_items ii
        WHERE ii.ingredient_id = "ingredients"."id"
          AND ii.expiry_date >= CURRENT_DATE
      )`,
    })
    .from(ingredients)
    .where(eq(ingredients.storeId, storeId))

  if (allIngredients.length === 0) {
    const [guide] = await db.insert(orderGuides).values({
      storeId,
      closingId,
      summary: '등록된 식자재가 없습니다.',
    }).returning()
    return c.json({
      success: true,
      data: { generatedAt: guide.generatedAt.toISOString(), summary: guide.summary, items: [] },
    })
  }

  // 2. 식자재별 관련 메뉴 (레시피 기반)
  const ingredientIds = allIngredients.map((i) => i.id)
  const recipeRows = await db
    .select({ ingredientId: recipes.ingredientId, menuName: menus.name })
    .from(recipes)
    .innerJoin(menus, eq(recipes.menuId, menus.id))
    .where(inArray(recipes.ingredientId, ingredientIds))

  const relatedMenusMap = new Map<string, string[]>()
  for (const row of recipeRows) {
    const list = relatedMenusMap.get(row.ingredientId) ?? []
    list.push(row.menuName)
    relatedMenusMap.set(row.ingredientId, list)
  }

  // 3. 최근 14일 마감 이력 기반 일일 평균 소비량
  const today = new Date()
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 86400000)
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0]

  const deductionRows = await db
    .select({
      ingredientId: closingDeductions.ingredientId,
      usedAmount: closingDeductions.usedAmount,
      date: closings.date,
    })
    .from(closingDeductions)
    .innerJoin(closings, eq(closingDeductions.closingId, closings.id))
    .where(and(
      eq(closings.storeId, storeId),
      sql`${closings.date} >= ${fourteenDaysAgoStr}`,
    ))

  const deductionMap = new Map<string, { totalUsed: number; days: Set<string> }>()
  for (const row of deductionRows) {
    const entry = deductionMap.get(row.ingredientId) ?? { totalUsed: 0, days: new Set<string>() }
    entry.totalUsed += Number(row.usedAmount)
    entry.days.add(row.date)
    deductionMap.set(row.ingredientId, entry)
  }

  // 4. 최근 7일 일평균 매출
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)
  const [{ weekRevenue }] = await db
    .select({ weekRevenue: sql<string>`coalesce(sum(${orders.totalPrice}), 0)` })
    .from(orders)
    .where(and(
      eq(orders.storeId, storeId),
      eq(orders.status, 'completed'),
      gte(orders.createdAt, sevenDaysAgo),
    ))
  const avgDailyRevenue = Math.round(Number(weekRevenue) / 7)

  // 5. 발주 필요 식자재 필터링: 안전재고 미달 OR 유통기한 5일 이내 OR 소진 예상 3일 이내
  const fiveDaysLaterStr = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0]

  const targetIngredients = allIngredients.filter((ing) => {
    const current = Number(ing.currentStock)
    const safety = Number(ing.safetyStock)
    const deduction = deductionMap.get(ing.id)
    const avgDailyUsage = deduction && deduction.days.size > 0 ? deduction.totalUsed / deduction.days.size : 0
    const daysUntilEmpty = avgDailyUsage > 0 ? current / avgDailyUsage : Infinity
    const nearExpiry = ing.nearestExpiryDate !== null && ing.nearestExpiryDate <= fiveDaysLaterStr

    return current < safety || nearExpiry || daysUntilEmpty < 3
  })

  if (targetIngredients.length === 0) {
    const [guide] = await db.insert(orderGuides).values({
      storeId,
      closingId,
      summary: '현재 발주가 필요한 식자재가 없습니다. 모든 재고가 안전 수준입니다.',
    }).returning()
    return c.json({
      success: true,
      data: { generatedAt: guide.generatedAt.toISOString(), summary: guide.summary, items: [] },
    })
  }

  // 6. AI 프롬프트용 식자재 컨텍스트 구성
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()]
  const todayStr = today.toISOString().split('T')[0]

  const contextBlocks = targetIngredients.map((ing) => {
    const current = Number(ing.currentStock)
    const safety = Number(ing.safetyStock)
    const deduction = deductionMap.get(ing.id)
    const avgDailyUsage = deduction && deduction.days.size > 0
      ? Math.round((deduction.totalUsed / deduction.days.size) * 10) / 10
      : null
    const daysUntilEmpty = avgDailyUsage && avgDailyUsage > 0
      ? Math.round((current / avgDailyUsage) * 10) / 10
      : null
    const stockRatio = safety > 0 ? Math.round((current / safety) * 100) : null
    const relatedMenus = relatedMenusMap.get(ing.id) ?? []
    const daysUntilExpiry = ing.nearestExpiryDate
      ? Math.ceil((new Date(ing.nearestExpiryDate).getTime() - today.getTime()) / 86400000)
      : null

    const lines = [
      `[${ing.name} (${ing.unit})]`,
      `  ID: ${ing.id}`,
      `  현재 재고: ${current}${ing.unit}${stockRatio !== null ? ` (안전재고의 ${stockRatio}%)` : ''}`,
      `  안전재고: ${safety}${ing.unit}`,
    ]
    if (avgDailyUsage !== null) lines.push(`  최근 14일 일평균 소비량: ${avgDailyUsage}${ing.unit}`)
    if (daysUntilEmpty !== null) lines.push(`  예상 소진까지: ${daysUntilEmpty}일`)
    if (daysUntilExpiry !== null) lines.push(`  가장 가까운 유통기한: ${ing.nearestExpiryDate} (${daysUntilExpiry}일 후)`)
    if (relatedMenus.length > 0) lines.push(`  사용 메뉴: ${relatedMenus.join(', ')}`)
    return lines.join('\n')
  }).join('\n\n')

  type AiItem = { ingredientId: string; recommendedOrderAmount: number; reason: string }
  let aiItems: AiItem[] = []
  let summary = ''

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: '당신은 한국 카페·식당 발주 관리 전문가입니다. 재고·소비·유통기한·메뉴 데이터를 분석해 구체적이고 실용적인 발주 가이드를 JSON으로 반환합니다. 반드시 한국어로만 작성하세요. 영어, 태국어, 일본어 등 다른 언어 문자를 절대 사용하지 마세요.',
        },
        {
          role: 'user',
          content: `오늘은 ${todayStr} (${dayOfWeek}요일)이며, 최근 7일 일평균 매출은 ${avgDailyRevenue.toLocaleString()}원입니다.

아래 식자재들의 발주를 검토해주세요:

${contextBlocks}

각 식자재에 대해 JSON으로 반환해주세요.

[reason 작성 가이드]
- 제공된 데이터(소비량, 유통기한, 메뉴 연관성, 요일 트렌드 등)를 활용해 구체적인 수치를 포함한 2문장 이내로 작성
- 예시: "현재 재고가 주간 평균 소비량(1.2kg)의 17% 수준이에요. 2~3일 내 소진될 가능성이 높아요."
- 예시: "유통기한이 3일 남았고, 바닐라 라떼·크림 음료에 가장 많이 쓰이는 시럽이에요. 미리 발주해 두는 게 좋아요."
- 예시: "재고가 안전재고의 30% 미만이에요. 크림 라떼·크림 음료 전반에 들어가는 재료라 빠른 보충이 필요해요."

[recommendedOrderAmount]
- 소비 데이터가 있으면 7일치 소비량 기준으로 계산 (정수)
- 없으면 안전재고 2배까지 채우는 양으로 계산 (정수)

[summary] 전체 발주 상황 한 줄 요약 (50자 이내)

반환 형식 (JSON만, 설명 없이):
{
  "summary": "...",
  "items": [
    { "ingredientId": "uuid", "recommendedOrderAmount": 숫자, "reason": "..." }
  ]
}`,
        },
      ],
    })

    const raw = (completion.choices[0]?.message?.content ?? '')
      .trim()
      .replace(/```json|```/g, '')
      .trim()

    const parsed = JSON.parse(raw) as { summary: string; items: AiItem[] }
    summary = parsed.summary ?? ''
    aiItems = parsed.items ?? []
  } catch {
    // AI 실패 시 룰 기반 폴백
    summary = `${targetIngredients.length}개 식자재 발주가 필요합니다.`
    aiItems = targetIngredients.map((ing) => {
      const current = Number(ing.currentStock)
      const safety = Number(ing.safetyStock)
      const deduction = deductionMap.get(ing.id)
      const avgDailyUsage = deduction && deduction.days.size > 0 ? deduction.totalUsed / deduction.days.size : null
      const ratio = safety > 0 ? Math.round((current / safety) * 100) : 0
      const daysUntilExpiry = ing.nearestExpiryDate
        ? Math.ceil((new Date(ing.nearestExpiryDate).getTime() - today.getTime()) / 86400000)
        : null

      let reason: string
      if (daysUntilExpiry !== null && daysUntilExpiry <= 5) {
        reason = `유통기한이 ${daysUntilExpiry}일 후입니다. 빠른 발주가 필요해요.`
      } else if (avgDailyUsage) {
        const daysLeft = Math.round(current / avgDailyUsage * 10) / 10
        reason = `현재 재고로 약 ${daysLeft}일 사용 가능해요. 보충을 권장해요.`
      } else {
        reason = `현재 재고가 안전재고의 ${ratio}% 수준입니다.`
      }

      return {
        ingredientId: ing.id,
        recommendedOrderAmount: avgDailyUsage
          ? Math.round(avgDailyUsage * 7)
          : calcRecommendedAmount(current, safety),
        reason,
      }
    })
  }

  // AI 결과와 DB 데이터 병합
  const aiMap = new Map(aiItems.map((item) => [item.ingredientId, item]))

  const items: OrderGuideItem[] = targetIngredients.map((ing) => {
    const current = Number(ing.currentStock)
    const safety = Number(ing.safetyStock)
    const ai = aiMap.get(ing.id)
    const daysUntilExpiry = ing.nearestExpiryDate
      ? Math.ceil((new Date(ing.nearestExpiryDate).getTime() - today.getTime()) / 86400000)
      : null
    const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry <= 5

    let status: OrderGuideStatus
    if (isNearExpiry && current >= safety) {
      status = 'expiry'
    } else {
      status = calcStatus(current, safety)
    }

    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      currentStock: current,
      safetyStock: safety,
      status,
      recommendedOrderAmount: ai?.recommendedOrderAmount ?? calcRecommendedAmount(current, safety),
      reason: ai?.reason ?? '발주가 필요합니다.',
    }
  })

  // DB 저장
  const [guide] = await db.insert(orderGuides).values({ storeId, closingId, summary }).returning()

  if (items.length > 0) {
    await db.insert(orderGuideItems).values(
      items.map((item) => ({
        orderGuideId: guide.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        unit: item.unit,
        currentStock: String(item.currentStock),
        safetyStock: String(item.safetyStock),
        status: item.status,
        recommendedOrderAmount: String(item.recommendedOrderAmount),
        reason: item.reason,
      }))
    )
  }

  return c.json({
    success: true,
    data: { generatedAt: guide.generatedAt.toISOString(), summary, items },
  })
})

export default orderGuideRouter
