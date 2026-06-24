import { OpenAPIHono } from '@hono/zod-openapi'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { users, stores, storeMembers } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'

const usersRouter = new OpenAPIHono<AppEnv>()

usersRouter.use('*', authMiddleware)

usersRouter.get('/me', async (c) => {
  const userId = c.get('userId')
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } }, 404)
  }
  return c.json({ success: true, data: { id: user.id, name: user.name, email: user.email, profileImage: user.profileImage } })
})

usersRouter.get('/me/store', async (c) => {
  const userId = c.get('userId')
  const member = await db.query.storeMembers.findFirst({
    where: eq(storeMembers.userId, userId),
    with: { store: true },
  })
  if (!member) {
    return c.json({ success: true, data: null })
  }
  return c.json({ success: true, data: { storeId: member.storeId, storeName: member.store.name } })
})

usersRouter.get('/me/stores', async (c) => {
  const userId = c.get('userId')
  const members = await db.query.storeMembers.findMany({
    where: eq(storeMembers.userId, userId),
    with: { store: true },
  })
  return c.json({
    success: true,
    data: members.map((m) => ({
      storeId: m.storeId,
      storeName: m.store.name,
      role: m.role,
      themeColor: m.store.themeColor,
    })),
  })
})

const updateUserSchema = z.object({
  name: z.string().min(1),
})

usersRouter.patch('/me', zValidator('json', updateUserSchema), async (c) => {
  const userId = c.get('userId')
  const { name } = c.req.valid('json')

  const [updated] = await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  return c.json({ success: true, data: { id: updated.id, name: updated.name, email: updated.email, profileImage: updated.profileImage } })
})

usersRouter.delete('/me', async (c) => {
  const userId = c.get('userId')

  const ownedStores = await db.query.storeMembers.findMany({
    where: eq(storeMembers.userId, userId),
  })

  for (const member of ownedStores) {
    await db.delete(stores).where(eq(stores.id, member.storeId))
  }

  await db.delete(users).where(eq(users.id, userId))

  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const bearerSecurity = [{ bearerAuth: [] }]

usersRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  summary: '내 계정 정보 조회',
  security: bearerSecurity,
  responses: { 200: { description: '계정 정보 (id, name, email, profileImage)' }, 401: { description: '인증 필요' }, 404: { description: '사용자 없음' } },
})

usersRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/me/store',
  tags: ['Users'],
  summary: '내 가게 정보 조회 (단일)',
  security: bearerSecurity,
  responses: { 200: { description: '가게 정보 또는 null' }, 401: { description: '인증 필요' } },
})

usersRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/me/stores',
  tags: ['Users'],
  summary: '내 가게 목록 조회',
  security: bearerSecurity,
  responses: { 200: { description: '참여한 가게 목록 (storeId, storeName, role, themeColor)' }, 401: { description: '인증 필요' } },
})

usersRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/me',
  tags: ['Users'],
  summary: '계정 정보 수정',
  security: bearerSecurity,
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } } } },
  responses: { 200: { description: '수정된 계정 정보' }, 401: { description: '인증 필요' } },
})

usersRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/me',
  tags: ['Users'],
  summary: '회원 탈퇴 (소유 가게 모두 삭제)',
  security: bearerSecurity,
  responses: { 200: { description: '탈퇴 완료' }, 401: { description: '인증 필요' } },
})

export default usersRouter
