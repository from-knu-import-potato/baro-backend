import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { storeOpens, closings, operatingHours } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, desc } from 'drizzle-orm'
import { toKSTDateStr } from '../lib/kst.js'

const openRouter = new OpenAPIHono<AppEnv>()

const openSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// 개점 처리 (멱등성: 같은 businessDate 중복 호출 시 기존 레코드 반환)
openRouter.post('/:storeId/open', authMiddleware, validate('json', openSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { businessDate } = c.req.valid('json')

  const [existing] = await db
    .select()
    .from(storeOpens)
    .where(and(eq(storeOpens.storeId, storeId), eq(storeOpens.businessDate, businessDate)))
    .limit(1)

  if (existing) {
    return c.json({
      success: true,
      data: {
        businessDate: existing.businessDate,
        openedAt: existing.openedAt.toISOString(),
      },
    })
  }

  const [created] = await db
    .insert(storeOpens)
    .values({ storeId, businessDate })
    .returning()

  return c.json({
    success: true,
    data: {
      businessDate: created.businessDate,
      openedAt: created.openedAt.toISOString(),
    },
  }, 201)
})

// 개점 상태 조회
// isOpen: true = 오늘 businessDate 기준 open 기록 있음 + closing 기록 없음
openRouter.get('/:storeId/open/status', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  // 오늘 요일 기준 openTime 조회
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstDayOfWeek = kstNow.getUTCDay() // 0=일, 6=토

  const [todayHours] = await db
    .select({ openTime: operatingHours.openTime, isClosed: operatingHours.isClosed })
    .from(operatingHours)
    .where(and(eq(operatingHours.storeId, storeId), eq(operatingHours.dayOfWeek, kstDayOfWeek)))
    .limit(1)

  // openTime 기반으로 현재 businessDate 계산
  const openTime = todayHours?.isClosed ? null : (todayHours?.openTime ?? null)
  let currentBusinessDate: string

  if (!openTime) {
    currentBusinessDate = toKSTDateStr(new Date())
  } else {
    const [openHour, openMinute] = openTime.split(':').map(Number)
    const kstHour = kstNow.getUTCHours()
    const kstMinute = kstNow.getUTCMinutes()
    const isBeforeOpen = kstHour < openHour || (kstHour === openHour && kstMinute < openMinute)
    currentBusinessDate = isBeforeOpen
      ? toKSTDateStr(new Date(Date.now() - 86400000))
      : toKSTDateStr(new Date())
  }

  // 현재 businessDate 기준 open 기록 조회
  const [openRecord] = await db
    .select()
    .from(storeOpens)
    .where(and(eq(storeOpens.storeId, storeId), eq(storeOpens.businessDate, currentBusinessDate)))
    .limit(1)

  if (!openRecord) {
    return c.json({
      success: true,
      data: { isOpen: false, businessDate: null, openedAt: null },
    })
  }

  // 해당 businessDate 마감 여부 확인
  const [closingRecord] = await db
    .select({ id: closings.id })
    .from(closings)
    .where(and(eq(closings.storeId, storeId), eq(closings.date, currentBusinessDate)))
    .limit(1)

  const isOpen = !closingRecord

  return c.json({
    success: true,
    data: {
      isOpen,
      businessDate: isOpen ? openRecord.businessDate : null,
      openedAt: isOpen ? openRecord.openedAt.toISOString() : null,
    },
  })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

openRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/open',
  tags: ['Store Open'],
  summary: '개점 처리',
  description: '가게 개점을 기록합니다. 같은 businessDate 중복 호출 시 기존 레코드를 반환합니다 (멱등성).',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['businessDate'], properties: { businessDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '영업 기준 날짜 (YYYY-MM-DD)' } } } } } },
  responses: { 200: { description: '이미 개점된 날짜 (기존 레코드 반환)' }, 201: { description: '개점 완료' }, 401: { description: '인증 필요' } },
})

openRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/open/status',
  tags: ['Store Open'],
  summary: '개점 상태 조회',
  description: '현재 영업 기준 날짜의 개점/마감 상태를 반환합니다.',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '개점 상태 (isOpen, businessDate, openedAt)' }, 401: { description: '인증 필요' } },
})

export default openRouter


