import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ingredients, inboundRecords, inboundItems, recipes, menus } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, sql, inArray } from 'drizzle-orm'

const ingredientsRouter = new Hono<AppEnv>()

const ingredientSchema = z.object({
  name: z.string().min(1),
  unit: z.enum(['g', 'ml', '개']),
  currentStock: z.number().min(0).optional(),
  safetyStock: z.number().min(0).optional(),
  isFavorite: z.boolean().optional(),
})

const inboundSchema = z.object({
  items: z.array(z.object({
    ingredientId: z.string().uuid(),
    amount: z.number().positive(),
    unitPrice: z.number().positive().nullable().optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })).min(1),
})

// 재고 목록 조회 (식자재별 가장 가까운 유통기한 포함)
ingredientsRouter.get('/:storeId/ingredients', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const list = await db
    .select({
      id: ingredients.id,
      storeId: ingredients.storeId,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      safetyStock: ingredients.safetyStock,
      isFavorite: ingredients.isFavorite,
      createdAt: ingredients.createdAt,
      updatedAt: ingredients.updatedAt,
      nearestExpiryDate: sql<string | null>`(
        SELECT MIN(ii.expiry_date)
        FROM inbound_items ii
        WHERE ii.ingredient_id = "ingredients"."id"
          AND ii.expiry_date >= CURRENT_DATE
      )`,
      lastInboundDate: sql<string | null>`(
        SELECT MAX(ir.created_at)
        FROM inbound_records ir
        JOIN inbound_items ii ON ii.inbound_record_id = ir.id
        WHERE ii.ingredient_id = "ingredients"."id"
      )`,
      relatedMenus: sql<string[]>`(
        SELECT COALESCE(array_agg(m.name ORDER BY m.name), ARRAY[]::text[])
        FROM recipes r
        JOIN menus m ON r.menu_id = m.id
        WHERE r.ingredient_id = "ingredients"."id"
      )`,
    })
    .from(ingredients)
    .where(eq(ingredients.storeId, storeId))

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
      ...(body.isFavorite !== undefined && { isFavorite: body.isFavorite }),
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

// 입고 처리 (OCR 확정 후 호출)
ingredientsRouter.post('/:storeId/ingredients/inbound', authMiddleware, zValidator('json', inboundSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { items } = c.req.valid('json')

  // 해당 가게 식자재인지 검증
  const ingredientIds = items.map((i) => i.ingredientId)
  const owned = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(
      eq(ingredients.storeId, storeId),
      inArray(ingredients.id, ingredientIds),
    ))

  if (owned.length !== ingredientIds.length) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '유효하지 않은 식자재가 포함되어 있습니다.' } }, 400)
  }

  const [record] = await db.insert(inboundRecords).values({ storeId }).returning()

  await db.insert(inboundItems).values(
    items.map((item) => ({
      inboundRecordId: record.id,
      ingredientId: item.ingredientId,
      amount: String(item.amount),
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
      expiryDate: item.expiryDate ?? null,
    }))
  )

  // currentStock 누적
  for (const item of items) {
    await db
      .update(ingredients)
      .set({
        currentStock: sql`${ingredients.currentStock} + ${String(item.amount)}`,
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, item.ingredientId))
  }

  return c.json({ success: true, data: { inboundRecordId: record.id } }, 201)
})

export default ingredientsRouter
