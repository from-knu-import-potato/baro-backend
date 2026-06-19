import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { users, stores, storeMembers } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'

const usersRouter = new Hono<AppEnv>()

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

export default usersRouter
