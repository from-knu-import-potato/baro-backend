import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ingredients } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

const ingredientsRouter = new Hono<AppEnv>()

const ingredientSchema = z.object({
  name: z.string().min(1),
  unit: z.enum(['g', 'ml', '개']),
  currentStock: z.number().min(0).optional(),
  safetyStock: z.number().min(0).optional(),
})

ingredientsRouter.get('/:storeId/ingredients', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db.select().from(ingredients).where(eq(ingredients.storeId, storeId))
  return c.json({ success: true, data: list })
})

ingredientsRouter.post('/:storeId/ingredients', authMiddleware, zValidator('json', ingredientSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const body = c.req.valid('json')
  const [created] = await db.insert(ingredients).values({
    storeId,
    name: body.name,
    unit: body.unit,
    currentStock: String(body.currentStock ?? 0),
    safetyStock: String(body.safetyStock ?? 0),
  }).returning()
  return c.json({ success: true, data: created }, 201)
})

ingredientsRouter.patch('/:storeId/ingredients/:id', authMiddleware, zValidator('json', ingredientSchema.partial()), async (c) => {
  const { storeId, id } = c.req.param()
  const body = c.req.valid('json')
  const [updated] = await db.update(ingredients)
    .set({
      ...(body.name && { name: body.name }),
      ...(body.unit && { unit: body.unit }),
      ...(body.currentStock !== undefined && { currentStock: String(body.currentStock) }),
      ...(body.safetyStock !== undefined && { safetyStock: String(body.safetyStock) }),
      updatedAt: new Date(),
    })
    .where(and(eq(ingredients.id, id), eq(ingredients.storeId, storeId)))
    .returning()
  if (!updated) return c.json({ success: false, error: { code: 'NOT_FOUND', message: '식자재를 찾을 수 없습니다.' } }, 404)
  return c.json({ success: true, data: updated })
})

ingredientsRouter.delete('/:storeId/ingredients/:id', authMiddleware, async (c) => {
  const { storeId, id } = c.req.param()
  await db.delete(ingredients).where(and(eq(ingredients.id, id), eq(ingredients.storeId, storeId)))
  return c.json({ success: true, data: null })
})

export default ingredientsRouter
