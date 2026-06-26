import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ingredients, inboundRecords, inboundItems, closingDeductions, recipes, menus, stores, ingredientUnitConversions } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, sql, inArray, desc } from 'drizzle-orm'

const ingredientsRouter = new OpenAPIHono<AppEnv>()

const ingredientSchema = z.object({
  name: z.string().min(1),
  unit: z.enum(['g', 'ml', '개']),
  currentStock: z.coerce.number().min(0).optional(),
  safetyStock: z.coerce.number().min(0).optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  lastInboundDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  nearestExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

const inboundSchema = z.object({
  metadata: z.object({
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    supplierName: z.string().nullable().optional(),
    invoiceNumber: z.string().nullable().optional(),
    totalSupplyAmount: z.number().nullable().optional(),
    totalTax: z.number().nullable().optional(),
    totalAmount: z.number().nullable().optional(),
  }).optional(),
  imageUrl: z.string().url().nullable().optional(),
  items: z.array(z.object({
    ingredientId: z.string().uuid(),
    amount: z.number().positive(),
    unitPrice: z.number().positive().nullable().optional(),
    supplyPrice: z.number().positive().nullable().optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    memo: z.string().nullable().optional(),
  })).min(1),
})

// 재고 목록 조회 (식자재별 가장 가까운 유통기한 포함)
// ?archived=true 로 보관된 식자재 조회
ingredientsRouter.get('/:storeId/ingredients', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const archived = c.req.query('archived') === 'true'

  const list = await db
    .select({
      id: ingredients.id,
      storeId: ingredients.storeId,
      name: ingredients.name,
      unit: ingredients.unit,
      currentStock: ingredients.currentStock,
      safetyStock: ingredients.safetyStock,
      isFavorite: ingredients.isFavorite,
      isArchived: ingredients.isArchived,
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
    .where(and(eq(ingredients.storeId, storeId), eq(ingredients.isArchived, archived)))

  return c.json({ success: true, data: list })
})

ingredientsRouter.post('/:storeId/ingredients', authMiddleware, validate('json', ingredientSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const body = c.req.valid('json')

  const currentStock = body.currentStock ?? 0

  // 가게의 safetyStockPct가 있으면 자동 계산, 아니면 요청값 또는 0
  let safetyStock = body.safetyStock ?? 0
  if (body.safetyStock === undefined) {
    const store = await db.select({ safetyStockPct: stores.safetyStockPct })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1)
    const pct = store[0]?.safetyStockPct
    if (pct != null) {
      safetyStock = Math.max(0, Math.round(currentStock * pct) / 100)
    }
  }

  const [created] = await db.insert(ingredients).values({
    storeId,
    name: body.name,
    unit: body.unit,
    currentStock: String(currentStock),
    safetyStock: String(safetyStock),
  }).returning()
  return c.json({ success: true, data: created }, 201)
})

ingredientsRouter.patch('/:storeId/ingredients/:id', authMiddleware, validate('json', ingredientSchema.partial()), async (c) => {
  const { storeId, id } = c.req.param()
  const body = c.req.valid('json')

  const [updated] = await db.update(ingredients)
    .set({
      ...(body.name && { name: body.name }),
      ...(body.unit && { unit: body.unit }),
      ...(body.currentStock !== undefined && { currentStock: String(body.currentStock) }),
      ...(body.safetyStock !== undefined && { safetyStock: String(body.safetyStock) }),
      ...(body.isFavorite !== undefined && { isFavorite: body.isFavorite }),
      ...(body.isArchived !== undefined && { isArchived: body.isArchived }),
      updatedAt: new Date(),
    })
    .where(and(eq(ingredients.id, id), eq(ingredients.storeId, storeId)))
    .returning()

  if (!updated) return c.json({ success: false, error: { code: 'NOT_FOUND', message: '식자재를 찾을 수 없습니다.' } }, 404)

  // 입고날짜 또는 유통기한 수정 요청이 있는 경우
  if (body.lastInboundDate !== undefined || body.nearestExpiryDate !== undefined) {
    const [latestItem] = await db
      .select({ itemId: inboundItems.id, recordId: inboundRecords.id })
      .from(inboundItems)
      .innerJoin(inboundRecords, eq(inboundItems.inboundRecordId, inboundRecords.id))
      .where(eq(inboundItems.ingredientId, id))
      .orderBy(desc(inboundRecords.createdAt))
      .limit(1)

    if (latestItem) {
      // 기존 입고 기록 업데이트
      if (body.lastInboundDate) {
        await db.update(inboundRecords)
          .set({ createdAt: new Date(body.lastInboundDate) })
          .where(eq(inboundRecords.id, latestItem.recordId))
      }
      if (body.nearestExpiryDate !== undefined) {
        await db.update(inboundItems)
          .set({ expiryDate: body.nearestExpiryDate })
          .where(eq(inboundItems.id, latestItem.itemId))
      }
    } else {
      // 입고 이력이 없으면 새로 생성
      const [newRecord] = await db.insert(inboundRecords)
        .values({
          storeId,
          createdAt: body.lastInboundDate ? new Date(body.lastInboundDate) : new Date(),
        })
        .returning()

      await db.insert(inboundItems).values({
        inboundRecordId: newRecord.id,
        ingredientId: id,
        amount: updated.currentStock,
        expiryDate: body.nearestExpiryDate ?? null,
      })
    }
  }

  return c.json({ success: true, data: updated })
})

ingredientsRouter.delete('/:storeId/ingredients/:id', authMiddleware, async (c) => {
  const { storeId, id } = c.req.param()
  const force = c.req.query('force') === 'true'

  const [{ inboundCount }] = await db
    .select({ inboundCount: sql<number>`count(*)::int` })
    .from(inboundItems)
    .where(eq(inboundItems.ingredientId, id))

  const [{ closingCount }] = await db
    .select({ closingCount: sql<number>`count(*)::int` })
    .from(closingDeductions)
    .where(eq(closingDeductions.ingredientId, id))

  if ((inboundCount > 0 || closingCount > 0) && !force) {
    return c.json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: '관련 기록이 있는 식자재입니다. 강제 삭제하려면 force=true 를 사용하세요.',
        detail: { inboundCount, closingCount },
      },
    }, 409)
  }

  if (force) {
    await db.delete(inboundItems).where(eq(inboundItems.ingredientId, id))
    await db.delete(closingDeductions).where(eq(closingDeductions.ingredientId, id))
  }

  await db.delete(ingredients).where(and(eq(ingredients.id, id), eq(ingredients.storeId, storeId)))
  return c.json({ success: true, data: null })
})

// 입고 처리 (OCR 확정 후 호출)
ingredientsRouter.post('/:storeId/ingredients/inbound', authMiddleware, validate('json', inboundSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const { metadata, items, imageUrl } = c.req.valid('json')

  // 해당 가게 식자재인지 검증
  const uniqueIngredientIds = [...new Set(items.map((i) => i.ingredientId))]
  const owned = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(
      eq(ingredients.storeId, storeId),
      inArray(ingredients.id, uniqueIngredientIds),
    ))

  if (owned.length !== uniqueIngredientIds.length) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '유효하지 않은 식자재가 포함되어 있습니다.' } }, 400)
  }

  const [record] = await db.insert(inboundRecords).values({
    storeId,
    transactionDate: metadata?.transactionDate ?? null,
    supplierName: metadata?.supplierName ?? null,
    invoiceNumber: metadata?.invoiceNumber ?? null,
    totalSupplyAmount: metadata?.totalSupplyAmount != null ? String(metadata.totalSupplyAmount) : null,
    totalTax: metadata?.totalTax != null ? String(metadata.totalTax) : null,
    totalAmount: metadata?.totalAmount != null ? String(metadata.totalAmount) : null,
    invoiceImageUrl: imageUrl ?? null,
  }).returning()

  await db.insert(inboundItems).values(
    items.map((item) => ({
      inboundRecordId: record.id,
      ingredientId: item.ingredientId,
      amount: String(item.amount),
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
      supplyPrice: item.supplyPrice != null ? String(item.supplyPrice) : null,
      expiryDate: item.expiryDate ?? null,
      memo: item.memo ?? null,
    }))
  )

  const [store] = await db.select({ safetyStockPct: stores.safetyStockPct })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1)
  const pct = store?.safetyStockPct

  // currentStock 누적 + safetyStock 재계산
  for (const item of items) {
    const [ingr] = await db
      .select({ currentStock: ingredients.currentStock })
      .from(ingredients)
      .where(eq(ingredients.id, item.ingredientId))

    const newStock = Number(ingr.currentStock) + item.amount
    const newSafetyStock = pct != null ? String(Math.max(0, Math.round(newStock * pct) / 100)) : undefined

    await db
      .update(ingredients)
      .set({
        currentStock: String(newStock),
        ...(newSafetyStock !== undefined && { safetyStock: newSafetyStock }),
        updatedAt: new Date(),
      })
      .where(eq(ingredients.id, item.ingredientId))
  }

  return c.json({ success: true, data: { inboundRecordId: record.id } }, 201)
})

// 입고 이력 목록 조회
ingredientsRouter.get('/:storeId/ingredients/inbound', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const list = await db
    .select({
      id: inboundRecords.id,
      transactionDate: inboundRecords.transactionDate,
      supplierName: inboundRecords.supplierName,
      invoiceNumber: inboundRecords.invoiceNumber,
      totalSupplyAmount: inboundRecords.totalSupplyAmount,
      totalTax: inboundRecords.totalTax,
      totalAmount: inboundRecords.totalAmount,
      invoiceImageUrl: inboundRecords.invoiceImageUrl,
      createdAt: inboundRecords.createdAt,
      itemCount: sql<number>`(
        SELECT COUNT(*)::int FROM inbound_items ii WHERE ii.inbound_record_id = "inbound_records"."id"
      )`,
    })
    .from(inboundRecords)
    .where(eq(inboundRecords.storeId, storeId))
    .orderBy(desc(inboundRecords.createdAt))

  return c.json({ success: true, data: list })
})

// 입고 이력 상세 조회
ingredientsRouter.get('/:storeId/ingredients/inbound/:recordId', authMiddleware, async (c) => {
  const { storeId, recordId } = c.req.param()

  const [record] = await db
    .select()
    .from(inboundRecords)
    .where(and(eq(inboundRecords.id, recordId), eq(inboundRecords.storeId, storeId)))
    .limit(1)

  if (!record) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '입고 기록을 찾을 수 없습니다.' } }, 404)
  }

  const items = await db
    .select({
      id: inboundItems.id,
      ingredientId: inboundItems.ingredientId,
      ingredientName: ingredients.name,
      unit: ingredients.unit,
      amount: inboundItems.amount,
      unitPrice: inboundItems.unitPrice,
      supplyPrice: inboundItems.supplyPrice,
      expiryDate: inboundItems.expiryDate,
      memo: inboundItems.memo,
    })
    .from(inboundItems)
    .innerJoin(ingredients, eq(inboundItems.ingredientId, ingredients.id))
    .where(eq(inboundItems.inboundRecordId, recordId))

  return c.json({
    success: true,
    data: {
      id: record.id,
      transactionDate: record.transactionDate,
      supplierName: record.supplierName,
      invoiceNumber: record.invoiceNumber,
      totalSupplyAmount: record.totalSupplyAmount,
      totalTax: record.totalTax,
      totalAmount: record.totalAmount,
      invoiceImageUrl: record.invoiceImageUrl,
      createdAt: record.createdAt,
      items,
    },
  })
})

const unitConversionUpsertSchema = z.array(z.object({
  ingredientId: z.string().uuid(),
  purchaseUnit: z.string().min(1),
  baseUnit: z.enum(['g', 'ml', '개']),
  factor: z.coerce.number().positive(),
})).min(1)

// 가게의 구매 단위 변환 factor 전체 조회
ingredientsRouter.get('/:storeId/unit-conversions', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const list = await db
    .select({
      id: ingredientUnitConversions.id,
      ingredientId: ingredientUnitConversions.ingredientId,
      purchaseUnit: ingredientUnitConversions.purchaseUnit,
      baseUnit: ingredientUnitConversions.baseUnit,
      factor: ingredientUnitConversions.factor,
    })
    .from(ingredientUnitConversions)
    .where(eq(ingredientUnitConversions.storeId, storeId))

  return c.json({ success: true, data: list })
})

// 구매 단위 변환 factor 저장/갱신 (bulk upsert)
ingredientsRouter.put('/:storeId/unit-conversions', authMiddleware, validate('json', unitConversionUpsertSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const items = c.req.valid('json')

  const ingredientIds = items.map((i) => i.ingredientId)
  const owned = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(and(eq(ingredients.storeId, storeId), inArray(ingredients.id, ingredientIds)))

  if (owned.length !== ingredientIds.length) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '유효하지 않은 식자재가 포함되어 있습니다.' } }, 400)
  }

  const now = new Date()
  await db
    .insert(ingredientUnitConversions)
    .values(items.map((item) => ({
      storeId,
      ingredientId: item.ingredientId,
      purchaseUnit: item.purchaseUnit.toUpperCase(),
      baseUnit: item.baseUnit,
      factor: String(item.factor),
    })))
    .onConflictDoUpdate({
      target: [ingredientUnitConversions.ingredientId, ingredientUnitConversions.purchaseUnit],
      set: {
        baseUnit: sql`excluded.base_unit`,
        factor: sql`excluded.factor`,
        updatedAt: now,
      },
    })

  return c.json({ success: true, data: null })
})

// 구매 단위 변환 삭제
ingredientsRouter.delete('/:storeId/unit-conversions/:id', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const id = c.req.param('id')

  const [deleted] = await db
    .delete(ingredientUnitConversions)
    .where(and(eq(ingredientUnitConversions.id, id), eq(ingredientUnitConversions.storeId, storeId)))
    .returning({ id: ingredientUnitConversions.id })

  if (!deleted) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '해당 단위 변환을 찾을 수 없습니다.' } }, 404)
  }

  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const ingredientIdParam = { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/ingredients',
  tags: ['Ingredients'],
  summary: '식자재 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'archived', in: 'query', required: false, schema: { type: 'boolean' as const }, description: 'true이면 보관된 식자재 조회' }],
  responses: { 200: { description: '식자재 목록 (유통기한 및 입고일 포함)' }, 401: { description: '인증 필요' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/ingredients',
  tags: ['Ingredients'],
  summary: '식자재 등록',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'unit'], properties: { name: { type: 'string' }, unit: { type: 'string', enum: ['g', 'ml', '개'] }, currentStock: { type: 'number' }, safetyStock: { type: 'number' } } } } } },
  responses: { 201: { description: '생성된 식자재' }, 401: { description: '인증 필요' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}/ingredients/{id}',
  tags: ['Ingredients'],
  summary: '식자재 수정',
  security: bearerSecurity,
  parameters: [storeIdParam, ingredientIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: '수정할 식자재 정보 (partial)' } } } },
  responses: { 200: { description: '수정된 식자재' }, 401: { description: '인증 필요' }, 404: { description: '식자재 없음' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/ingredients/{id}',
  tags: ['Ingredients'],
  summary: '식자재 삭제',
  security: bearerSecurity,
  parameters: [storeIdParam, ingredientIdParam, { name: 'force', in: 'query', required: false, schema: { type: 'boolean' as const }, description: 'true이면 관련 기록 포함 강제 삭제' }],
  responses: { 200: { description: '삭제 완료' }, 401: { description: '인증 필요' }, 409: { description: '관련 기록 존재 (force=true로 강제 삭제)' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/ingredients/inbound',
  tags: ['Ingredients'],
  summary: '입고 처리 (OCR 확정 후)',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { metadata: { type: 'object', description: '거래 메타데이터' }, imageUrl: { type: 'string', nullable: true, description: 'OCR 업로드 시 반환된 명세서 이미지 URL' }, items: { type: 'array', items: { type: 'object' }, minItems: 1 } } } } } },
  responses: { 201: { description: '입고 처리 완료, inboundRecordId 반환' }, 400: { description: '유효하지 않은 식자재' }, 401: { description: '인증 필요' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/ingredients/inbound',
  tags: ['Ingredients'],
  summary: '입고 이력 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '입고 이력 목록 (날짜, 공급업체, 총액, 명세서 이미지 URL, 품목 수)' }, 401: { description: '인증 필요' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/ingredients/inbound/{recordId}',
  tags: ['Ingredients'],
  summary: '입고 이력 상세 조회',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'recordId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  responses: { 200: { description: '입고 상세 (메타데이터 + 품목별 식자재명·수량·단가)' }, 401: { description: '인증 필요' }, 404: { description: '입고 기록 없음' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/unit-conversions',
  tags: ['Ingredients'],
  summary: '구매 단위 변환 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '단위 변환 목록' }, 401: { description: '인증 필요' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/unit-conversions/{id}',
  tags: ['Ingredients'],
  summary: '구매 단위 변환 삭제',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  responses: { 200: { description: '삭제 완료' }, 401: { description: '인증 필요' }, 404: { description: '단위 변환 없음' } },
})

ingredientsRouter.openAPIRegistry.registerPath({
  method: 'put',
  path: '/{storeId}/unit-conversions',
  tags: ['Ingredients'],
  summary: '구매 단위 변환 저장/갱신 (bulk upsert)',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'array', items: { type: 'object', required: ['ingredientId', 'purchaseUnit', 'baseUnit', 'factor'], properties: { ingredientId: { type: 'string', format: 'uuid' }, purchaseUnit: { type: 'string' }, baseUnit: { type: 'string', enum: ['g', 'ml', '개'] }, factor: { type: 'number', minimum: 0 } } }, minItems: 1 } } } },
  responses: { 200: { description: '저장 완료' }, 400: { description: '유효하지 않은 식자재' }, 401: { description: '인증 필요' } },
})

export default ingredientsRouter


