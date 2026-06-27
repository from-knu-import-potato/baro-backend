import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { db } from '../db/index.js'
import { stores, storeMembers, operatingHours, menus, ingredients, recipes, users, storeOpens, inboundRecords, orderGuides, closings, orders, menuCategories } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { eq, sql, and } from 'drizzle-orm'

const generateInviteCode = () => randomBytes(4).toString('hex').toUpperCase()

const storesRouter = new OpenAPIHono<AppEnv>()

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const setupSchema = z.object({
  basicInfo: z.object({
    storeName: z.string().min(1),
    businessType: z.enum(['franchise', 'directly-operated', 'individual']),
    category: z.enum(['korean', 'western', 'cafe', 'bunsik', 'japanese', 'chinese', 'fastfood', 'other']),
  }),
  operatingHours: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    isOpen: z.boolean(),
    openTime: z.string(),
    closeTime: z.string(),
  })),
  menuItems: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    price: z.number(),
    isFeatured: z.boolean().optional(),
    imageUrl: z.string().optional(),
  })),
  ingredients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    unit: z.enum(['g', 'ml', '개']),
  })),
  recipes: z.array(z.object({
    menuItemId: z.string(),
    ingredients: z.array(z.object({
      ingredientId: z.string(),
      amount: z.number(),
    })),
  })),
})

storesRouter.post('/setup', authMiddleware, validate('json', setupSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')

  const [store] = await db.insert(stores).values({
    name: data.basicInfo.storeName,
    ownerId: userId,
    businessType: data.basicInfo.businessType,
    category: data.basicInfo.category,
    inviteCode: generateInviteCode(),
  }).returning()

  await db.insert(storeMembers).values({
    storeId: store.id,
    userId,
    role: 'owner',
  })

  if (data.operatingHours.length > 0) {
    await db.insert(operatingHours).values(
      data.operatingHours.map((oh) => ({
        storeId: store.id,
        dayOfWeek: DAY_MAP[oh.dayOfWeek],
        openTime: oh.isOpen ? oh.openTime : null,
        closeTime: oh.isOpen ? oh.closeTime : null,
        isClosed: !oh.isOpen,
      }))
    )
  }

  const menuIdMap: Record<string, string> = {}
  if (data.menuItems.length > 0) {
    const insertedMenus = await db.insert(menus).values(
      data.menuItems.map((m) => ({
        storeId: store.id,
        name: m.name,
        price: m.price,
        description: m.description ?? null,
        imageUrl: m.imageUrl ?? null,
        isFeatured: m.isFeatured ?? false,
      }))
    ).returning()
    insertedMenus.forEach((menu, i) => {
      menuIdMap[data.menuItems[i].id] = menu.id
    })
  }

  const ingredientIdMap: Record<string, string> = {}
  if (data.ingredients.length > 0) {
    const insertedIngredients = await db.insert(ingredients).values(
      data.ingredients.map((ing) => ({
        storeId: store.id,
        name: ing.name,
        unit: ing.unit as 'g' | 'ml' | '개',
      }))
    ).returning()
    insertedIngredients.forEach((ing, i) => {
      ingredientIdMap[data.ingredients[i].id] = ing.id
    })
  }

  for (const recipe of data.recipes) {
    const dbMenuId = menuIdMap[recipe.menuItemId]
    if (!dbMenuId) continue
    for (const ri of recipe.ingredients) {
      const dbIngredientId = ingredientIdMap[ri.ingredientId]
      if (!dbIngredientId) continue
      await db.insert(recipes).values({
        menuId: dbMenuId,
        ingredientId: dbIngredientId,
        amount: String(ri.amount),
      })
    }
  }

  return c.json({ success: true, data: { storeId: store.id } }, 201)
})

storesRouter.post('/join', authMiddleware, validate('json', z.object({ inviteCode: z.string().min(1) })), async (c) => {
  const userId = c.get('userId')
  const { inviteCode } = c.req.valid('json')

  const store = await db.query.stores.findFirst({
    where: eq(stores.inviteCode, inviteCode.toUpperCase()),
  })
  if (!store) {
    return c.json({ success: false, error: { code: 'INVALID_INVITE_CODE', message: '유효하지 않은 초대코드입니다.' } }, 404)
  }

  const existing = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, userId)),
  })
  if (existing) {
    return c.json({ success: false, error: { code: 'ALREADY_MEMBER', message: '이미 참여한 가게입니다.' } }, 409)
  }

  await db.insert(storeMembers).values({
    storeId: store.id,
    userId,
    role: 'staff',
  })

  return c.json({ success: true, data: { storeId: store.id, storeName: store.name, role: 'staff' } }, 201)
})

const DAY_OF_WEEK_LABELS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

storesRouter.get('/:storeId', async (c) => {
  const storeId = c.req.param('storeId')

  let currentUserId: string | null = null
  const authorization = c.req.header('Authorization')
  if (authorization?.startsWith('Bearer ')) {
    try {
      const payload = await verifyAccessToken(authorization.slice(7))
      currentUserId = payload.userId
    } catch {
      // 유효하지 않은 토큰은 비인증으로 처리
    }
  }

  const [result] = await db
    .select({
      id: stores.id,
      name: stores.name,
      ownerId: stores.ownerId,
      ownerName: users.name,
      ownerProfileImage: users.profileImage,
      businessType: stores.businessType,
      category: stores.category,
      inviteCode: stores.inviteCode,
      memo: stores.memo,
      safetyStockPct: stores.safetyStockPct,
      tableCount: stores.tableCount,
      themeColor: stores.themeColor,
      layout: stores.layout,
      bannerImageUrl: stores.bannerImageUrl,
      bannerPosition: stores.bannerPosition,
      createdAt: stores.createdAt,
      updatedAt: stores.updatedAt,
    })
    .from(stores)
    .leftJoin(users, eq(stores.ownerId, users.id))
    .where(eq(stores.id, storeId))

  if (!result) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  }

  let myRole: 'owner' | 'staff' | null = null
  if (currentUserId) {
    const member = await db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, currentUserId)),
    })
    myRole = member?.role ?? null
  }

  const hours = await db
    .select()
    .from(operatingHours)
    .where(eq(operatingHours.storeId, storeId))
    .orderBy(operatingHours.dayOfWeek)

  const operatingHoursList = hours.map((h) => ({
    dayOfWeek: DAY_OF_WEEK_LABELS[h.dayOfWeek],
    isOpen: !h.isClosed,
    openTime: h.openTime ?? null,
    closeTime: h.closeTime ?? null,
  }))

  const { ownerName, ownerProfileImage, ...storeData } = result
  return c.json({
    success: true,
    data: {
      ...storeData,
      owner: { id: storeData.ownerId, name: ownerName, profileImage: ownerProfileImage },
      myRole,
      operatingHours: operatingHoursList,
    },
  })
})

const updateStoreSchema = z.object({
  storeName: z.string().min(1).optional(),
  ownerId: z.string().uuid().optional(),
  businessType: z.enum(['franchise', 'directly-operated', 'individual']).optional(),
  category: z.enum(['korean', 'western', 'cafe', 'bunsik', 'japanese', 'chinese', 'fastfood', 'other']).optional(),
  memo: z.string().nullable().optional(),
  safetyStockPct: z.number().int().min(0).max(100).nullable().optional(),
  tableCount: z.number().int().min(1).max(100).optional(),
})

storesRouter.patch('/:storeId', authMiddleware, validate('json', updateStoreSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const data = c.req.valid('json')

  if (data.ownerId) {
    const member = await db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, data.ownerId)),
    })
    if (!member) {
      return c.json({ success: false, error: { code: 'INVALID_OWNER', message: '해당 사용자는 가게 멤버가 아닙니다.' } }, 400)
    }
  }

  const [updated] = await db.update(stores)
    .set({
      ...(data.storeName && { name: data.storeName }),
      ...(data.ownerId && { ownerId: data.ownerId }),
      ...(data.businessType && { businessType: data.businessType }),
      ...(data.category && { category: data.category }),
      ...('memo' in data && { memo: data.memo ?? null }),
      ...('safetyStockPct' in data && { safetyStockPct: data.safetyStockPct ?? null }),
      ...(data.tableCount != null && { tableCount: data.tableCount }),
      updatedAt: new Date(),
    })
    .where(eq(stores.id, storeId))
    .returning()

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  }

  // safetyStockPct가 변경된 경우 전체 식자재 안전재고 일괄 업데이트
  if ('safetyStockPct' in data && data.safetyStockPct != null) {
    await db.update(ingredients)
      .set({
        safetyStock: sql`GREATEST(0, ROUND(${ingredients.currentStock} * ${data.safetyStockPct} / 100.0, 2))`,
        updatedAt: new Date(),
      })
      .where(eq(ingredients.storeId, storeId))
  }

  return c.json({ success: true, data: updated })
})

const updateOperatingHoursSchema = z.object({
  operatingHours: z.array(z.object({
    dayOfWeek: z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']),
    isOpen: z.boolean(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
  })).min(1),
})

storesRouter.patch('/:storeId/operating-hours', authMiddleware, validate('json', updateOperatingHoursSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { operatingHours: hoursData } = c.req.valid('json')

  for (const oh of hoursData) {
    await db
      .update(operatingHours)
      .set({
        openTime: oh.isOpen ? oh.openTime : null,
        closeTime: oh.isOpen ? oh.closeTime : null,
        isClosed: !oh.isOpen,
      })
      .where(and(
        eq(operatingHours.storeId, storeId),
        eq(operatingHours.dayOfWeek, DAY_MAP[oh.dayOfWeek]),
      ))
  }

  const updated = await db
    .select()
    .from(operatingHours)
    .where(eq(operatingHours.storeId, storeId))
    .orderBy(operatingHours.dayOfWeek)

  return c.json({
    success: true,
    data: {
      operatingHours: updated.map((h) => ({
        dayOfWeek: DAY_OF_WEEK_LABELS[h.dayOfWeek],
        isOpen: !h.isClosed,
        openTime: h.openTime ?? null,
        closeTime: h.closeTime ?? null,
      })),
    },
  })
})

storesRouter.get('/:storeId/members', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const userId = c.get('userId')

  const requester = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!requester) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }, 403)
  }

  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      profileImage: users.profileImage,
      role: storeMembers.role,
      joinedAt: storeMembers.createdAt,
    })
    .from(storeMembers)
    .innerJoin(users, eq(storeMembers.userId, users.id))
    .where(eq(storeMembers.storeId, storeId))

  return c.json({ success: true, data: members })
})

storesRouter.delete('/:storeId/members/me', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const userId = c.get('userId')

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!member) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '해당 가게의 멤버가 아닙니다.' } }, 404)
  }
  if (member.role === 'owner') {
    return c.json({ success: false, error: { code: 'OWNER_CANNOT_LEAVE', message: '가게 owner는 나갈 수 없습니다. 가게를 삭제해주세요.' } }, 400)
  }

  await db.delete(storeMembers).where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)))

  return c.json({ success: true, data: null })
})

storesRouter.delete('/:storeId/members/:targetUserId', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const targetUserId = c.req.param('targetUserId')
  const userId = c.get('userId')

  const requester = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!requester || requester.role !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }, 403)
  }

  if (targetUserId === userId) {
    return c.json({ success: false, error: { code: 'CANNOT_REMOVE_SELF', message: '자기 자신을 내보낼 수 없습니다.' } }, 400)
  }

  const target = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)),
  })
  if (!target) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '해당 멤버를 찾을 수 없습니다.' } }, 404)
  }

  await db.delete(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUserId)))

  return c.json({ success: true, data: null })
})

storesRouter.post('/:storeId/invite-code', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const userId = c.get('userId')

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!member || member.role !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }, 403)
  }

  const [updated] = await db.update(stores)
    .set({ inviteCode: generateInviteCode(), updatedAt: new Date() })
    .where(eq(stores.id, storeId))
    .returning({ inviteCode: stores.inviteCode })

  return c.json({ success: true, data: { inviteCode: updated.inviteCode } })
})

storesRouter.delete('/:storeId', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const userId = c.get('userId')

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!member || member.role !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }, 403)
  }

  const [deleted] = await db.delete(stores).where(eq(stores.id, storeId)).returning({ id: stores.id })
  if (!deleted) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  }

  return c.json({ success: true, data: null })
})

storesRouter.post('/:storeId/reset', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const userId = c.get('userId')

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId)),
  })
  if (!member || member.role !== 'owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }, 403)
  }

  await db.delete(storeOpens).where(eq(storeOpens.storeId, storeId))
  await db.delete(inboundRecords).where(eq(inboundRecords.storeId, storeId))
  await db.delete(orderGuides).where(eq(orderGuides.storeId, storeId))
  await db.delete(closings).where(eq(closings.storeId, storeId))
  await db.delete(orders).where(eq(orders.storeId, storeId))
  await db.delete(menus).where(eq(menus.storeId, storeId))
  await db.delete(menuCategories).where(eq(menuCategories.storeId, storeId))
  await db.delete(ingredients).where(eq(ingredients.storeId, storeId))

  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

storesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/setup',
  tags: ['Stores'],
  summary: '가게 초기 세팅 (가게 생성)',
  security: bearerSecurity,
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: '가게 세팅 정보 (basicInfo, operatingHours, menuItems, ingredients, recipes)' } } } },
  responses: { 201: { description: '가게 생성 완료' }, 401: { description: '인증 필요' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/join',
  tags: ['Stores'],
  summary: '초대 코드로 가게 참여',
  security: bearerSecurity,
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['inviteCode'], properties: { inviteCode: { type: 'string' } } } } } },
  responses: { 201: { description: '가게 참여 완료' }, 404: { description: '유효하지 않은 초대 코드' }, 409: { description: '이미 참여한 가게' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}',
  tags: ['Stores'],
  summary: '가게 정보 조회',
  parameters: [storeIdParam],
  responses: { 200: { description: '가게 정보' }, 404: { description: '가게 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}',
  tags: ['Stores'],
  summary: '가게 정보 수정',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: '수정할 가게 정보' } } } },
  responses: { 200: { description: '수정 완료' }, 401: { description: '인증 필요' }, 404: { description: '가게 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}/operating-hours',
  tags: ['Stores'],
  summary: '운영 시간 수정',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['operatingHours'], properties: { operatingHours: { type: 'array', items: { type: 'object' } } } } } } },
  responses: { 200: { description: '운영 시간 수정 완료' }, 401: { description: '인증 필요' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/members',
  tags: ['Stores'],
  summary: '가게 멤버 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '멤버 목록' }, 401: { description: '인증 필요' }, 403: { description: '권한 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/members/me',
  tags: ['Stores'],
  summary: '가게에서 탈퇴 (본인)',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '탈퇴 완료' }, 400: { description: 'Owner는 탈퇴 불가' }, 404: { description: '멤버 아님' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/members/{targetUserId}',
  tags: ['Stores'],
  summary: '멤버 강제 퇴출 (Owner 전용)',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'targetUserId', in: 'path', required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  responses: { 200: { description: '퇴출 완료' }, 403: { description: '권한 없음' }, 404: { description: '멤버 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/invite-code',
  tags: ['Stores'],
  summary: '초대 코드 재발급',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '새 초대 코드 반환' }, 403: { description: '권한 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}',
  tags: ['Stores'],
  summary: '가게 삭제',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '삭제 완료' }, 403: { description: '권한 없음' }, 404: { description: '가게 없음' } },
})

storesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/reset',
  tags: ['Stores'],
  summary: '가게 데이터 초기화',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '초기화 완료' }, 403: { description: '권한 없음' } },
})

export default storesRouter


