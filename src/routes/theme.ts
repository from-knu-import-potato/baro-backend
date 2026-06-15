import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { stores } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'
import { supabase } from '../lib/supabase.js'

const themeRouter = new Hono<AppEnv>()

const THEME_COLORS = [
  'navy', 'slate', 'teal', 'charcoal',
  'mauve', 'sage', 'lavender', 'terra',
  'warmgray', 'coolgray',
  'blue', 'green',
] as const
const LAYOUTS = ['list', 'grid'] as const

const themeSchema = z.object({
  themeColor: z.enum(THEME_COLORS).optional(),
  layout: z.enum(LAYOUTS).optional(),
  bannerImageUrl: z.string().url().nullable().optional(),
  bannerPosition: z.string().default('50% 50%').optional(),
})

const toThemeResponse = (store: typeof stores.$inferSelect) => ({
  themeColor: store.themeColor,
  layout: store.layout,
  bannerImageUrl: store.bannerImageUrl,
  bannerPosition: store.bannerPosition,
})

themeRouter.get('/:storeId/theme', async (c) => {
  const storeId = c.req.param('storeId')
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) })
  if (!store)
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  return c.json({ success: true, data: toThemeResponse(store) })
})

themeRouter.patch('/:storeId/theme', authMiddleware, zValidator('json', themeSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const body = c.req.valid('json')

  if (Object.keys(body).length === 0)
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '변경할 항목이 없습니다.' } }, 400)

  const [updated] = await db
    .update(stores)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(stores.id, storeId))
    .returning()

  if (!updated)
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)

  return c.json({ success: true, data: toThemeResponse(updated) })
})

themeRouter.post('/:storeId/theme/banner', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string')
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '파일이 없습니다.' } }, 400)

  const arrayBuffer = await file.arrayBuffer()
  const ext = file.name.split('.').pop()
  const path = `${storeId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('banners')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (error)
    return c.json({ success: false, error: { code: 'UPLOAD_FAILED', message: error.message } }, 500)

  const { data } = supabase.storage.from('banners').getPublicUrl(path)
  const bannerImageUrl = data.publicUrl

  const [updated] = await db
    .update(stores)
    .set({ bannerImageUrl, updatedAt: new Date() })
    .where(eq(stores.id, storeId))
    .returning()

  if (!updated)
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)

  return c.json({ success: true, data: toThemeResponse(updated) }, 201)
})

export default themeRouter
