import { OpenAPIHono } from '@hono/zod-openapi'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { menuCategories } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and, asc } from 'drizzle-orm'

const menuCategoriesRouter = new OpenAPIHono<AppEnv>()

const toResponse = (cat: typeof menuCategories.$inferSelect) => ({
  id: cat.id,
  name: cat.name,
  order: cat.sortOrder,
})

menuCategoriesRouter.get('/:storeId/menu-categories', async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.storeId, storeId))
    .orderBy(asc(menuCategories.sortOrder))
  return c.json({ success: true, data: list.map(toResponse) })
})

menuCategoriesRouter.post(
  '/:storeId/menu-categories',
  authMiddleware,
  zValidator('json', z.object({ name: z.string().min(1) })),
  async (c) => {
    const storeId = c.req.param('storeId')
    const { name } = c.req.valid('json')

    const existing = await db
      .select({ sortOrder: menuCategories.sortOrder })
      .from(menuCategories)
      .where(eq(menuCategories.storeId, storeId))
      .orderBy(asc(menuCategories.sortOrder))

    const nextOrder = existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 0

    const [created] = await db
      .insert(menuCategories)
      .values({ storeId, name, sortOrder: nextOrder })
      .returning()

    return c.json({ success: true, data: toResponse(created) }, 201)
  },
)

// reorder는 /:categoryId 보다 먼저 정의해야 정적 경로가 우선 매칭됨
menuCategoriesRouter.patch(
  '/:storeId/menu-categories/reorder',
  authMiddleware,
  zValidator('json', z.object({ categoryIds: z.array(z.string().uuid()).min(1) })),
  async (c) => {
    const storeId = c.req.param('storeId')
    const { categoryIds } = c.req.valid('json')

    await Promise.all(
      categoryIds.map((id, index) =>
        db
          .update(menuCategories)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(menuCategories.id, id), eq(menuCategories.storeId, storeId))),
      ),
    )

    return c.json({ success: true, data: null })
  },
)

menuCategoriesRouter.patch(
  '/:storeId/menu-categories/:categoryId',
  authMiddleware,
  zValidator('json', z.object({ name: z.string().min(1) })),
  async (c) => {
    const { storeId, categoryId } = c.req.param()
    const { name } = c.req.valid('json')

    const [updated] = await db
      .update(menuCategories)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.storeId, storeId)))
      .returning()

    if (!updated)
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: '카테고리를 찾을 수 없습니다.' } },
        404,
      )

    return c.json({ success: true, data: toResponse(updated) })
  },
)

menuCategoriesRouter.delete('/:storeId/menu-categories/:categoryId', authMiddleware, async (c) => {
  const { storeId, categoryId } = c.req.param()
  await db
    .delete(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.storeId, storeId)))
  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const categoryIdParam = { name: 'categoryId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

menuCategoriesRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/menu-categories',
  tags: ['Menu Categories'],
  summary: '메뉴 카테고리 목록 조회',
  parameters: [storeIdParam],
  responses: { 200: { description: '카테고리 목록 (sortOrder 순)' } },
})

menuCategoriesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/menu-categories',
  tags: ['Menu Categories'],
  summary: '메뉴 카테고리 생성',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } } } },
  responses: { 201: { description: '생성된 카테고리' }, 401: { description: '인증 필요' } },
})

menuCategoriesRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}/menu-categories/reorder',
  tags: ['Menu Categories'],
  summary: '카테고리 순서 변경',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['categoryIds'], properties: { categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 } } } } } },
  responses: { 200: { description: '순서 변경 완료' }, 401: { description: '인증 필요' } },
})

menuCategoriesRouter.openAPIRegistry.registerPath({
  method: 'patch',
  path: '/{storeId}/menu-categories/{categoryId}',
  tags: ['Menu Categories'],
  summary: '카테고리 이름 수정',
  security: bearerSecurity,
  parameters: [storeIdParam, categoryIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } } } },
  responses: { 200: { description: '수정된 카테고리' }, 401: { description: '인증 필요' }, 404: { description: '카테고리 없음' } },
})

menuCategoriesRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/menu-categories/{categoryId}',
  tags: ['Menu Categories'],
  summary: '카테고리 삭제',
  security: bearerSecurity,
  parameters: [storeIdParam, categoryIdParam],
  responses: { 200: { description: '삭제 완료' }, 401: { description: '인증 필요' } },
})

export default menuCategoriesRouter


