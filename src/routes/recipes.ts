import { OpenAPIHono } from '@hono/zod-openapi'
import { validate } from '../lib/validator.js'
import { z } from 'zod'
import { db } from '../db/index.js'
import { recipes, menus, ingredients } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

const recipesRouter = new OpenAPIHono<AppEnv>()

const recipeSchema = z.object({
  menuId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  amount: z.number().positive(),
})

recipesRouter.get('/:storeId/recipes', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')

  const storeMenus = await db.select().from(menus).where(eq(menus.storeId, storeId))
  const menuIds = storeMenus.map((m) => m.id)

  if (menuIds.length === 0) return c.json({ success: true, data: [] })

  const allRecipes = await db.select({
    id: recipes.id,
    menuId: recipes.menuId,
    menuName: menus.name,
    ingredientId: recipes.ingredientId,
    ingredientName: ingredients.name,
    ingredientUnit: ingredients.unit,
    amount: recipes.amount,
  })
    .from(recipes)
    .innerJoin(menus, eq(recipes.menuId, menus.id))
    .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
    .where(eq(menus.storeId, storeId))

  return c.json({ success: true, data: allRecipes })
})

recipesRouter.post('/:storeId/recipes', authMiddleware, validate('json', recipeSchema), async (c) => {
  const body = c.req.valid('json')
  const [created] = await db.insert(recipes).values({
    menuId: body.menuId,
    ingredientId: body.ingredientId,
    amount: String(body.amount),
  }).returning()
  return c.json({ success: true, data: created }, 201)
})

recipesRouter.delete('/:storeId/recipes/:recipeId', authMiddleware, async (c) => {
  const recipeId = c.req.param('recipeId')
  await db.delete(recipes).where(eq(recipes.id, recipeId))
  return c.json({ success: true, data: null })
})

// OpenAPI registrations
const storeIdParam = { name: 'storeId', in: 'path' as const, required: true, schema: { type: 'string' as const, format: 'uuid' } }
const bearerSecurity = [{ bearerAuth: [] }]

recipesRouter.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{storeId}/recipes',
  tags: ['Recipes'],
  summary: '레시피 목록 조회',
  security: bearerSecurity,
  parameters: [storeIdParam],
  responses: { 200: { description: '레시피 목록 (메뉴명, 식자재명 포함)' }, 401: { description: '인증 필요' } },
})

recipesRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/recipes',
  tags: ['Recipes'],
  summary: '레시피 생성',
  security: bearerSecurity,
  parameters: [storeIdParam],
  requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['menuId', 'ingredientId', 'amount'], properties: { menuId: { type: 'string', format: 'uuid' }, ingredientId: { type: 'string', format: 'uuid' }, amount: { type: 'number', minimum: 0, exclusiveMinimum: 0 } } } } } },
  responses: { 201: { description: '생성된 레시피' }, 401: { description: '인증 필요' } },
})

recipesRouter.openAPIRegistry.registerPath({
  method: 'delete',
  path: '/{storeId}/recipes/{recipeId}',
  tags: ['Recipes'],
  summary: '레시피 삭제',
  security: bearerSecurity,
  parameters: [storeIdParam, { name: 'recipeId', in: 'path', required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  responses: { 200: { description: '삭제 완료' }, 401: { description: '인증 필요' } },
})

export default recipesRouter


