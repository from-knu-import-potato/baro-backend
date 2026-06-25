import { OpenAPIHono } from '@hono/zod-openapi'
import { GoogleGenAI } from '@google/genai'
import { db } from '../db/index.js'
import {
  ingredients,
  recipes,
  menus,
  orders,
  closings,
  closingDeductions,
  orderGuides,
  orderGuideItems,
  ingredientUnitConversions,
  inboundRecords,
  inboundItems,
} from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, sql, inArray, gte, desc } from 'drizzle-orm'

const orderGuideRouter = new OpenAPIHono<AppEnv>()

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

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

async function fetchConversionsMap(
  ingredientIds: string[],
): Promise<Map<string, { purchaseUnit: string; factor: number }[]>> {
  if (ingredientIds.length === 0) return new Map()
  const rows = await db
    .select({
      ingredientId: ingredientUnitConversions.ingredientId,
      purchaseUnit: ingredientUnitConversions.purchaseUnit,
      factor: ingredientUnitConversions.factor,
    })
    .from(ingredientUnitConversions)
    .where(inArray(ingredientUnitConversions.ingredientId, ingredientIds))
  const map = new Map<string, { purchaseUnit: string; factor: number }[]>()
  for (const row of rows) {
    const list = map.get(row.ingredientId) ?? []
    list.push({ purchaseUnit: row.purchaseUnit, factor: Number(row.factor) })
    map.set(row.ingredientId, list)
  }
  return map
}

function resolvePurchaseConversions(
  map: Map<string, { purchaseUnit: string; factor: number }[]>,
  ingredientId: string,
  recommendedOrderAmount: number,
): { purchaseUnit: string; purchaseAmount: number }[] {
  return (map.get(ingredientId) ?? []).map(({ purchaseUnit, factor }) => ({
    purchaseUnit,
    factor,
    purchaseAmount: Math.ceil(recommendedOrderAmount / factor),
  }))
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

  const conversionsMap = await fetchConversionsMap(items.map((i) => i.ingredientId))

  return c.json({
    success: true,
    data: {
      generatedAt: latestGuide.generatedAt.toISOString(),
      summary: latestGuide.summary,
      items: items.map((item) => {
        const recommendedOrderAmount = Number(item.recommendedOrderAmount)
        return {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          unit: item.unit,
          currentStock: Number(item.currentStock),
          safetyStock: Number(item.safetyStock),
          status: item.status as OrderGuideStatus,
          recommendedOrderAmount,
          reason: item.reason,
          purchaseConversions: resolvePurchaseConversions(
            conversionsMap,
            item.ingredientId,
            recommendedOrderAmount,
          ),
        }
      }),
    },
  })
})

// AI 발주 가이드 생성 및 DB 저장
orderGuideRouter.post('/:storeId/order-guide/generate', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const body = await c.req.json<{ closingId?: string }>().catch(() => ({ closingId: undefined }))
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
    const [guide] = await db
      .insert(orderGuides)
      .values({ storeId, closingId, summary: '등록된 식자재가 없습니다.' })
      .returning()
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

  const today = new Date()

  // 3. 최근 14일 소비량 — 일평균 소비 기준선
  const fourteenDaysAgoStr = new Date(today.getTime() - 14 * 86400000).toISOString().split('T')[0]
  const deductionRows = await db
    .select({
      ingredientId: closingDeductions.ingredientId,
      actualUsage: closingDeductions.actualUsage,
      date: closings.date,
    })
    .from(closingDeductions)
    .innerJoin(closings, eq(closingDeductions.closingId, closings.id))
    .where(and(eq(closings.storeId, storeId), sql`${closings.date} >= ${fourteenDaysAgoStr}`))

  const deductionMap = new Map<string, { totalUsed: number; days: Set<string> }>()
  for (const row of deductionRows) {
    const entry = deductionMap.get(row.ingredientId) ?? { totalUsed: 0, days: new Set<string>() }
    entry.totalUsed += Number(row.actualUsage)
    entry.days.add(row.date)
    deductionMap.set(row.ingredientId, entry)
  }

  // 3b. 최근 3일 소비량 — 소비 가속 감지용 (Direction 3)
  const threeDaysAgoStr = new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0]
  const recentDeductionRows = await db
    .select({
      ingredientId: closingDeductions.ingredientId,
      actualUsage: closingDeductions.actualUsage,
      date: closings.date,
    })
    .from(closingDeductions)
    .innerJoin(closings, eq(closingDeductions.closingId, closings.id))
    .where(and(eq(closings.storeId, storeId), sql`${closings.date} >= ${threeDaysAgoStr}`))

  const recentDeductionMap = new Map<string, { totalUsed: number; days: Set<string> }>()
  for (const row of recentDeductionRows) {
    const entry = recentDeductionMap.get(row.ingredientId) ?? { totalUsed: 0, days: new Set<string>() }
    entry.totalUsed += Number(row.actualUsage)
    entry.days.add(row.date)
    recentDeductionMap.set(row.ingredientId, entry)
  }

  // 4. 최근 7일 일평균 매출
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)
  const [{ weekRevenue }] = await db
    .select({ weekRevenue: sql<string>`coalesce(sum(${orders.totalPrice}), 0)` })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.status, 'completed'), gte(orders.createdAt, sevenDaysAgo)))
  const avgDailyRevenue = Math.round(Number(weekRevenue) / 7)

  // 4b. 요일별 매출 패턴 — 최근 8주 (Direction 2)
  const eightWeeksAgo = new Date(today.getTime() - 56 * 86400000)
  const dowRevenueRows = await db
    .select({
      dow: sql<number>`EXTRACT(DOW FROM ${orders.createdAt} AT TIME ZONE 'Asia/Seoul')::int`,
      totalRevenue: sql<string>`COALESCE(SUM(${orders.totalPrice}), 0)`,
      dayCount: sql<string>`COUNT(DISTINCT DATE(${orders.createdAt} AT TIME ZONE 'Asia/Seoul'))`,
    })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.status, 'completed'), gte(orders.createdAt, eightWeeksAgo)))
    .groupBy(sql`EXTRACT(DOW FROM ${orders.createdAt} AT TIME ZONE 'Asia/Seoul')`)

  const dowNames = ['일', '월', '화', '수', '목', '금', '토']
  const dowAvgMap = new Map<number, number>()
  for (const row of dowRevenueRows) {
    const dayCount = Number(row.dayCount)
    if (dayCount > 0) dowAvgMap.set(Number(row.dow), Math.round(Number(row.totalRevenue) / dayCount))
  }

  const dowPatternText = dowNames
    .map((name, i) => {
      const avg = dowAvgMap.get(i)
      return avg != null ? `${name}: ${avg.toLocaleString()}원` : null
    })
    .filter(Boolean)
    .join(', ')

  const tomorrowDow = (today.getDay() + 1) % 7
  const tomorrowAvg = dowAvgMap.get(tomorrowDow)
  let tomorrowRatioText: string | null = null
  if (tomorrowAvg != null && avgDailyRevenue > 0) {
    const ratio = Math.round(((tomorrowAvg - avgDailyRevenue) / avgDailyRevenue) * 100)
    if (ratio > 0) tomorrowRatioText = `내일(${dowNames[tomorrowDow]}): 일평균 대비 +${ratio}% 예상`
    else if (ratio < 0) tomorrowRatioText = `내일(${dowNames[tomorrowDow]}): 일평균 대비 ${ratio}% 예상`
  }

  // 4c. 식자재별 입고 이력 — 재발주 주기 감지용 (Direction 4)
  const inboundRows = await db
    .select({
      ingredientId: inboundItems.ingredientId,
      date: sql<string>`COALESCE(${inboundRecords.transactionDate}::text, DATE(${inboundRecords.createdAt} AT TIME ZONE 'Asia/Seoul')::text)`,
    })
    .from(inboundItems)
    .innerJoin(inboundRecords, eq(inboundItems.inboundRecordId, inboundRecords.id))
    .where(and(eq(inboundRecords.storeId, storeId), inArray(inboundItems.ingredientId, ingredientIds)))

  const inboundDatesMap = new Map<string, string[]>()
  for (const row of inboundRows) {
    const list = inboundDatesMap.get(row.ingredientId) ?? []
    list.push(row.date)
    inboundDatesMap.set(row.ingredientId, list)
  }

  type InboundInfo = { lastInboundDaysAgo: number; avgCycleDays: number | null }
  const inboundInfoMap = new Map<string, InboundInfo>()
  for (const [ingId, dates] of inboundDatesMap) {
    const sorted = [...new Set(dates)].sort().reverse()
    const lastInboundDaysAgo = Math.floor((today.getTime() - new Date(sorted[0]).getTime()) / 86400000)
    let avgCycleDays: number | null = null
    if (sorted.length >= 2) {
      let totalGap = 0
      for (let i = 0; i < sorted.length - 1; i++) {
        totalGap += (new Date(sorted[i]).getTime() - new Date(sorted[i + 1]).getTime()) / 86400000
      }
      avgCycleDays = Math.round(totalGap / (sorted.length - 1))
    }
    inboundInfoMap.set(ingId, { lastInboundDaysAgo, avgCycleDays })
  }

  // 5. 발주 필요 식자재 필터링 — 기존 3가지 + 신규 3가지
  const fiveDaysLaterStr = new Date(today.getTime() + 5 * 86400000).toISOString().split('T')[0]

  const targetIngredients = allIngredients.filter((ing) => {
    const current = Number(ing.currentStock)
    const safety = Number(ing.safetyStock)

    const deduction = deductionMap.get(ing.id)
    const avgDailyUsage =
      deduction && deduction.days.size > 0 ? deduction.totalUsed / deduction.days.size : 0

    const recentDeduction = recentDeductionMap.get(ing.id)
    const recentAvgDailyUsage =
      recentDeduction && recentDeduction.days.size > 0
        ? recentDeduction.totalUsed / recentDeduction.days.size
        : 0

    const daysUntilEmpty = avgDailyUsage > 0 ? current / avgDailyUsage : Infinity
    const nearExpiry = ing.nearestExpiryDate !== null && ing.nearestExpiryDate <= fiveDaysLaterStr

    // 기존: 안전재고 미달 / 유통기한 임박 / 소진 3일 이내
    const isBelowSafety = current < safety
    const isNearExpiry = nearExpiry
    const isRunningOut = daysUntilEmpty < 3

    // Direction 1: 선제 감지 — 현재는 OK이지만 7일 이내 안전재고 미달 예상
    const daysUntilBelowSafety = avgDailyUsage > 0 ? (current - safety) / avgDailyUsage : Infinity
    const willBeBelowSafetySoon = current >= safety && daysUntilBelowSafety > 0 && daysUntilBelowSafety < 7

    // Direction 3: 소비 가속 — 최근 3일 평균이 14일 평균 대비 50%↑ 이고 현재 속도로 7일 내 소진
    const isSpiking = avgDailyUsage > 0 && recentAvgDailyUsage > avgDailyUsage * 1.5
    const daysUntilEmptyRecent = recentAvgDailyUsage > 0 ? current / recentAvgDailyUsage : Infinity
    const isSpikingAndRunningOut = isSpiking && daysUntilEmptyRecent < 7

    // Direction 4: 재발주 주기 초과 — 마지막 입고 후 평균 주기 20% 초과 경과
    // 단, 현재 소비 추세상 평균 주기의 1.5배 이내에 소진될 때만 (재고 충분 시 제외)
    const inboundInfo = inboundInfoMap.get(ing.id)
    const isOverdueReorder =
      inboundInfo?.avgCycleDays != null &&
      inboundInfo.lastInboundDaysAgo > inboundInfo.avgCycleDays * 1.2 &&
      daysUntilEmpty < inboundInfo.avgCycleDays * 1.5

    return (
      isBelowSafety ||
      isNearExpiry ||
      isRunningOut ||
      willBeBelowSafetySoon ||
      isSpikingAndRunningOut ||
      isOverdueReorder
    )
  })

  if (targetIngredients.length === 0) {
    const [guide] = await db
      .insert(orderGuides)
      .values({
        storeId,
        closingId,
        summary: '현재 발주가 필요한 식자재가 없습니다. 모든 재고가 안전 수준입니다.',
      })
      .returning()
    return c.json({
      success: true,
      data: { generatedAt: guide.generatedAt.toISOString(), summary: guide.summary, items: [] },
    })
  }

  // 6. AI 프롬프트용 컨텍스트 구성 (트리거 명시 + 소비 가속 + 입고 이력 포함)
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()]
  const todayStr = today.toISOString().split('T')[0]

  const contextBlocks = targetIngredients
    .map((ing) => {
      const current = Number(ing.currentStock)
      const safety = Number(ing.safetyStock)

      const deduction = deductionMap.get(ing.id)
      const avgDailyUsage =
        deduction && deduction.days.size > 0
          ? Math.round((deduction.totalUsed / deduction.days.size) * 10) / 10
          : null

      const recentDeduction = recentDeductionMap.get(ing.id)
      const recentAvgDailyUsage =
        recentDeduction && recentDeduction.days.size > 0
          ? Math.round((recentDeduction.totalUsed / recentDeduction.days.size) * 10) / 10
          : null

      const daysUntilEmpty =
        avgDailyUsage && avgDailyUsage > 0
          ? Math.round((current / avgDailyUsage) * 10) / 10
          : null
      const daysUntilEmptyRecent =
        recentAvgDailyUsage && recentAvgDailyUsage > 0
          ? Math.round((current / recentAvgDailyUsage) * 10) / 10
          : null

      const stockRatio = safety > 0 ? Math.round((current / safety) * 100) : null
      const relatedMenus = relatedMenusMap.get(ing.id) ?? []
      const daysUntilExpiry = ing.nearestExpiryDate
        ? Math.ceil((new Date(ing.nearestExpiryDate).getTime() - today.getTime()) / 86400000)
        : null
      const inboundInfo = inboundInfoMap.get(ing.id)

      // 발주 트리거 명시
      const triggers: string[] = []
      if (current < safety) triggers.push('안전재고 미달')
      if (daysUntilExpiry !== null && daysUntilExpiry <= 5) triggers.push(`유통기한 ${daysUntilExpiry}일 이내`)
      if (daysUntilEmpty !== null && daysUntilEmpty < 3) triggers.push('소진 예상 3일 이내')
      if (current >= safety && avgDailyUsage) {
        const daysUntilBelowSafety = Math.round(((current - safety) / avgDailyUsage) * 10) / 10
        if (daysUntilBelowSafety > 0 && daysUntilBelowSafety < 7) {
          triggers.push(`선제 발주 (${daysUntilBelowSafety}일 후 안전재고 미달 예상)`)
        }
      }
      if (avgDailyUsage && recentAvgDailyUsage && recentAvgDailyUsage > avgDailyUsage * 1.5) {
        const spikeRatio = Math.round((recentAvgDailyUsage / avgDailyUsage - 1) * 100)
        triggers.push(`소비 가속 (+${spikeRatio}%, 최근 3일)`)
      }
      if (
        inboundInfo?.avgCycleDays != null &&
        inboundInfo.lastInboundDaysAgo > inboundInfo.avgCycleDays * 1.2
      ) {
        triggers.push(`재발주 주기 초과 (평균 ${inboundInfo.avgCycleDays}일 / ${inboundInfo.lastInboundDaysAgo}일 경과)`)
      }

      const lines = [
        `[${ing.name} (${ing.unit})]`,
        `  ID: ${ing.id}`,
        `  발주 트리거: ${triggers.join(' / ')}`,
        `  현재 재고: ${current}${ing.unit}${stockRatio !== null ? ` (안전재고의 ${stockRatio}%)` : ''}`,
        `  안전재고: ${safety}${ing.unit}`,
      ]
      if (avgDailyUsage !== null) lines.push(`  14일 일평균 소비량: ${avgDailyUsage}${ing.unit}`)
      if (recentAvgDailyUsage !== null && avgDailyUsage !== null) {
        const changeRatio = Math.round((recentAvgDailyUsage / avgDailyUsage - 1) * 100)
        const changeText = changeRatio > 0 ? `↑+${changeRatio}%` : changeRatio < 0 ? `↓${changeRatio}%` : '변동 없음'
        lines.push(`  최근 3일 일평균 소비량: ${recentAvgDailyUsage}${ing.unit} (14일 대비 ${changeText})`)
      }
      if (daysUntilEmpty !== null) lines.push(`  14일 평균 기준 예상 소진: ${daysUntilEmpty}일`)
      if (daysUntilEmptyRecent !== null && daysUntilEmptyRecent !== daysUntilEmpty) {
        lines.push(`  최근 소비 기준 예상 소진: ${daysUntilEmptyRecent}일`)
      }
      if (daysUntilExpiry !== null) {
        lines.push(`  가장 가까운 유통기한: ${ing.nearestExpiryDate} (${daysUntilExpiry}일 후)`)
      }
      if (inboundInfo) {
        const cycleText = inboundInfo.avgCycleDays ? `, 평균 입고 주기 ${inboundInfo.avgCycleDays}일` : ''
        lines.push(`  마지막 입고: ${inboundInfo.lastInboundDaysAgo}일 전${cycleText}`)
      }
      if (relatedMenus.length > 0) lines.push(`  사용 메뉴: ${relatedMenus.join(', ')}`)
      return lines.join('\n')
    })
    .join('\n\n')

  type AiItem = { ingredientId: string; recommendedOrderAmount: number; reason: string }
  let aiItems: AiItem[] = []
  let summary = ''

  const dowPatternSection =
    dowPatternText
      ? `\n[요일별 일평균 매출 (최근 8주)]\n${dowPatternText}${tomorrowRatioText ? `\n→ ${tomorrowRatioText}` : ''}\n`
      : ''

  try {
    const completion = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `오늘은 ${todayStr} (${dayOfWeek}요일)이며, 최근 7일 일평균 매출은 ${avgDailyRevenue.toLocaleString()}원입니다.
${dowPatternSection}
아래 식자재들의 발주를 검토해주세요:

${contextBlocks}

각 식자재에 대해 JSON으로 반환해주세요.

[reason 작성 가이드]
- 발주 트리거와 제공 데이터를 바탕으로 구체적인 수치를 포함해 2문장 이내로 작성
- 예시 (안전재고 미달): "현재 재고가 안전재고의 17% 수준이에요. 크림 라떼·크림 음료에 필수 재료라 빠른 보충이 필요해요."
- 예시 (소비 가속): "최근 3일 소비가 14일 평균 대비 80% 증가했어요. 현재 속도로는 4일 후 소진 예상이에요."
- 예시 (선제 발주): "현재 재고는 안전 수준이지만 소비 추세상 10일 후 안전재고 미달이 예상돼요. 지금 발주해두면 여유 있어요."
- 예시 (유통기한): "유통기한이 3일 남았고, 바닐라 라떼·크림 음료에 가장 많이 쓰이는 시럽이에요. 먼저 소진 후 재발주를 권장해요."
- 예시 (재발주 주기 초과): "평균 7일마다 입고하던 재료인데 마지막 입고 후 12일이 경과됐어요. 발주가 지연된 상태예요."
- 예시 (요일 패턴): "내일이 토요일로 주중 대비 매출이 높은 날이에요. 주말 소비량을 고려해 넉넉히 발주하는 게 좋아요."

[recommendedOrderAmount]
- max(14일 평균, 최근 3일 평균) 기준 7일치 소비량으로 계산 (정수)
- 요일 패턴상 다음 7일 내 성수기 요일이 포함되면 +20% 버퍼 추가
- 소비 데이터가 없으면 안전재고 2배까지 채우는 양으로 계산 (정수)

[summary] 전체 발주 상황 한 줄 요약 (예: "3종 발주 필요. 우유·크림은 긴급, 설탕은 선제 발주 권장이에요.", 50자 이내)

반환 형식 (JSON만, 설명 없이):
{
  "summary": "...",
  "items": [
    { "ingredientId": "uuid", "recommendedOrderAmount": 숫자, "reason": "..." }
  ]
}`,
      config: {
        temperature: 0.3,
        systemInstruction:
          '당신은 한국 카페·식당 발주 관리 전문가입니다. 재고·소비·유통기한·메뉴 데이터를 분석해 구체적이고 실용적인 발주 가이드를 JSON으로 반환합니다. JSON 외 설명은 금지입니다.',
      },
    })

    const raw = (completion.text ?? '').trim().replace(/```json|```/g, '').trim()
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
      const avgDailyUsage =
        deduction && deduction.days.size > 0 ? deduction.totalUsed / deduction.days.size : null
      const recentDeduction = recentDeductionMap.get(ing.id)
      const recentAvgDailyUsage =
        recentDeduction && recentDeduction.days.size > 0
          ? recentDeduction.totalUsed / recentDeduction.days.size
          : null
      const effectiveAvg = Math.max(avgDailyUsage ?? 0, recentAvgDailyUsage ?? 0) || null
      const ratio = safety > 0 ? Math.round((current / safety) * 100) : 0
      const daysUntilExpiry = ing.nearestExpiryDate
        ? Math.ceil((new Date(ing.nearestExpiryDate).getTime() - today.getTime()) / 86400000)
        : null
      const inboundInfo = inboundInfoMap.get(ing.id)

      let reason: string
      if (daysUntilExpiry !== null && daysUntilExpiry <= 5) {
        reason = `유통기한이 ${daysUntilExpiry}일 후예요. 빠른 발주가 필요해요.`
      } else if (
        recentAvgDailyUsage &&
        avgDailyUsage &&
        recentAvgDailyUsage > avgDailyUsage * 1.5
      ) {
        const daysLeft = Math.round((current / recentAvgDailyUsage) * 10) / 10
        reason = `최근 소비가 급증했어요. 현재 속도로는 ${daysLeft}일 후 소진 예상이에요.`
      } else if (effectiveAvg) {
        const daysLeft = Math.round((current / effectiveAvg) * 10) / 10
        reason = `현재 재고로 약 ${daysLeft}일 사용 가능해요. 보충을 권장해요.`
      } else if (
        inboundInfo?.avgCycleDays &&
        inboundInfo.lastInboundDaysAgo > inboundInfo.avgCycleDays
      ) {
        reason = `평균 ${inboundInfo.avgCycleDays}일 주기로 입고하는 재료인데 ${inboundInfo.lastInboundDaysAgo}일이 경과됐어요.`
      } else {
        reason = `현재 재고가 안전재고의 ${ratio}% 수준이에요.`
      }

      return {
        ingredientId: ing.id,
        recommendedOrderAmount: effectiveAvg
          ? Math.round(effectiveAvg * 7)
          : calcRecommendedAmount(current, safety),
        reason,
      }
    })
  }

  // AI 결과와 DB 데이터 병합
  const aiMap = new Map(aiItems.map((item) => [item.ingredientId, item]))
  const conversionsMap = await fetchConversionsMap(targetIngredients.map((i) => i.id))

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

    const recommendedOrderAmount = ai?.recommendedOrderAmount ?? calcRecommendedAmount(current, safety)
    return {
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      currentStock: current,
      safetyStock: safety,
      status,
      recommendedOrderAmount,
      reason: ai?.reason ?? '발주가 필요합니다.',
      purchaseConversions: resolvePurchaseConversions(conversionsMap, ing.id, recommendedOrderAmount),
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
      })),
    )
  }

  return c.json({
    success: true,
    data: { generatedAt: guide.generatedAt.toISOString(), summary, items },
  })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

orderGuideRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/order-guide',
  tags: ['Order Guide'],
  summary: '발주 가이드 조회 (최근 AI 생성 결과)',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '발주 가이드 (generatedAt, summary, items, purchaseConversions 포함)' }, 401: { description: '인증 필요' } },
})

orderGuideRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/order-guide/generate',
  tags: ['Order Guide'],
  summary: 'AI 발주 가이드 생성',
  description: '재고·소비·유통기한 데이터를 분석하여 Gemini AI로 발주 추천 가이드를 생성하고 DB에 저장합니다.',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { closingId: { type: 'string', format: 'uuid', description: '연결할 마감 ID (선택)' } } } } } },
  responses: { 200: { description: '생성된 발주 가이드' }, 401: { description: '인증 필요' } },
})

export default orderGuideRouter


