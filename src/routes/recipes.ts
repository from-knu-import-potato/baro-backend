import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { recipes, menus, ingredients } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

const recipesRouter = new Hono<AppEnv>()

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

recipesRouter.post('/:storeId/recipes', authMiddleware, zValidator('json', recipeSchema), async (c) => {
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

export default recipesRouter
