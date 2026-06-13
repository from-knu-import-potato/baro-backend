import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { stores, storeMembers, operatingHours, menus, ingredients, recipes } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq } from 'drizzle-orm'

const storesRouter = new Hono<AppEnv>()

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const setupSchema = z.object({
  basicInfo: z.object({
    ownerName: z.string(),
    storeName: z.string().min(1),
    businessType: z.enum(['franchise', 'directly-operated', 'individual']),
    category: z.enum(['korean', 'western', 'cafe', 'bunsik', 'japanese', 'chinese', 'fastfood', 'other']),
  }),
  operatingHours: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    isOpen: z.boolean(),
    openTime: z.string(),
    closeTime: z.string(),
  })),
  menuItems: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    price: z.number(),
    isFeatured: z.boolean().optional(),
    imageUrl: z.string().optional(),
  })),
  ingredients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    unit: z.enum(['g', 'ml', '개']),
  })),
  recipes: z.array(z.object({
    menuItemId: z.string(),
    ingredients: z.array(z.object({
      ingredientId: z.string(),
      amount: z.number(),
    })),
  })),
})

storesRouter.post('/setup', authMiddleware, zValidator('json', setupSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')

  const [store] = await db.insert(stores).values({
    name: data.basicInfo.storeName,
    ownerName: data.basicInfo.ownerName,
    businessType: data.basicInfo.businessType,
    category: data.basicInfo.category,
  }).returning()

  await db.insert(storeMembers).values({
    storeId: store.id,
    userId,
    role: 'owner',
  })

  if (data.operatingHours.length > 0) {
    await db.insert(operatingHours).values(
      data.operatingHours.map((oh) => ({
        storeId: store.id,
        dayOfWeek: DAY_MAP[oh.dayOfWeek],
        openTime: oh.isOpen ? oh.openTime : null,
        closeTime: oh.isOpen ? oh.closeTime : null,
        isClosed: !oh.isOpen,
      }))
    )
  }

  const menuIdMap: Record<string, string> = {}
  if (data.menuItems.length > 0) {
    const insertedMenus = await db.insert(menus).values(
      data.menuItems.map((m) => ({
        storeId: store.id,
        name: m.name,
        price: m.price,
        description: m.description ?? null,
        imageUrl: m.imageUrl ?? null,
      }))
    ).returning()
    insertedMenus.forEach((menu, i) => {
      menuIdMap[data.menuItems[i].id] = menu.id
    })
  }

  const ingredientIdMap: Record<string, string> = {}
  if (data.ingredients.length > 0) {
    const insertedIngredients = await db.insert(ingredients).values(
      data.ingredients.map((ing) => ({
        storeId: store.id,
        name: ing.name,
        unit: ing.unit as 'g' | 'ml' | '개',
      }))
    ).returning()
    insertedIngredients.forEach((ing, i) => {
      ingredientIdMap[data.ingredients[i].id] = ing.id
    })
  }

  for (const recipe of data.recipes) {
    const dbMenuId = menuIdMap[recipe.menuItemId]
    if (!dbMenuId) continue
    for (const ri of recipe.ingredients) {
      const dbIngredientId = ingredientIdMap[ri.ingredientId]
      if (!dbIngredientId) continue
      await db.insert(recipes).values({
        menuId: dbMenuId,
        ingredientId: dbIngredientId,
        amount: String(ri.amount),
      })
    }
  }

  return c.json({ success: true, data: { storeId: store.id } }, 201)
})

storesRouter.get('/:storeId', async (c) => {
  const storeId = c.req.param('storeId')
  const store = await db.query.stores.findFirst({ where: eq(stores.id, storeId) })
  if (!store) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  }
  return c.json({ success: true, data: store })
})

const updateStoreSchema = z.object({
  storeName: z.string().min(1).optional(),
  ownerName: z.string().optional(),
  businessType: z.enum(['franchise', 'directly-operated', 'individual']).optional(),
  category: z.enum(['korean', 'western', 'cafe', 'bunsik', 'japanese', 'chinese', 'fastfood', 'other']).optional(),
  memo: z.string().nullable().optional(),
  safetyStockPct: z.number().int().min(0).max(100).nullable().optional(),
})

storesRouter.patch('/:storeId', authMiddleware, zValidator('json', updateStoreSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const data = c.req.valid('json')

  const [updated] = await db.update(stores)
    .set({
      ...(data.storeName && { name: data.storeName }),
      ...(data.ownerName && { ownerName: data.ownerName }),
      ...(data.businessType && { businessType: data.businessType }),
      ...(data.category && { category: data.category }),
      ...('memo' in data && { memo: data.memo ?? null }),
      ...('safetyStockPct' in data && { safetyStockPct: data.safetyStockPct ?? null }),
      updatedAt: new Date(),
    })
    .where(eq(stores.id, storeId))
    .returning()

  if (!updated) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: '가게를 찾을 수 없습니다.' } }, 404)
  }

  return c.json({ success: true, data: updated })
})

export default storesRouter
