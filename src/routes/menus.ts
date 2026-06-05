import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { menus } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'
import { supabase } from '../lib/supabase.js'

const menusRouter = new Hono<AppEnv>()
menusRouter.use('*', authMiddleware)

const menuSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  isAvailable: z.boolean().optional(),
})

menusRouter.post('/:storeId/menus/upload', async (c) => {
  const storeId = c.req.param('storeId')
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '파일이 없습니다.' } }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const ext = file.name.split('.').pop()
  const path = `${storeId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('menu-images')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (error) {
    return c.json({ success: false, error: { code: 'UPLOAD_FAILED', message: error.message } }, 500)
  }

  const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
  return c.json({ success: true, data: { url: data.publicUrl } }, 201)
})

menusRouter.get('/:storeId/menus', async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db.select().from(menus).where(eq(menus.storeId, storeId))
  return c.json({ success: true, data: list })
})

menusRouter.post('/:storeId/menus', zValidator('json', menuSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const body = c.req.valid('json')
  const [created] = await db.insert(menus).values({ storeId, ...body }).returning()
  return c.json({ success: true, data: created }, 201)
})

menusRouter.patch('/:storeId/menus/:menuId', zValidator('json', menuSchema.partial()), async (c) => {
  const { storeId, menuId } = c.req.param()
  const body = c.req.valid('json')
  const [updated] = await db.update(menus)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(menus.id, menuId), eq(menus.storeId, storeId)))
    .returning()
  if (!updated) return c.json({ success: false, error: { code: 'NOT_FOUND', message: '메뉴를 찾을 수 없습니다.' } }, 404)
  return c.json({ success: true, data: updated })
})

menusRouter.delete('/:storeId/menus/:menuId', async (c) => {
  const { storeId, menuId } = c.req.param()
  await db.delete(menus).where(and(eq(menus.id, menuId), eq(menus.storeId, storeId)))
  return c.json({ success: true, data: null })
})

export default menusRouter
