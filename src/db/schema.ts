import { pgTable, uuid, text, integer, numeric, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const orderStatusEnum = pgEnum('order_status', ['pending', 'preparing', 'completed', 'cancelled'])
export const unitEnum = pgEnum('unit', ['g', 'ml', '개'])
export const memberRoleEnum = pgEnum('member_role', ['owner', 'staff'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  kakaoId: text('kakao_id').unique().notNull(),
  name: text('name').notNull(),
  email: text('email'),
  profileImage: text('profile_image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerName: text('owner_name').notNull(),
  businessType: text('business_type'),
  category: text('category'),
  inviteCode: text('invite_code').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const storeMembers = pgTable('store_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: memberRoleEnum('role').default('owner').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const operatingHours = pgTable('operating_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 0=일, 6=토
  openTime: text('open_time'),  // HH:mm
  closeTime: text('close_time'), // HH:mm
  isClosed: boolean('is_closed').default(false).notNull(),
})

export const menus = pgTable('menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  isAvailable: boolean('is_available').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const ingredients = pgTable('ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  unit: unitEnum('unit').notNull(),
  currentStock: numeric('current_stock').default('0').notNull(),
  safetyStock: numeric('safety_stock').default('0').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const recipes = pgTable('recipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuId: uuid('menu_id').references(() => menus.id, { onDelete: 'cascade' }).notNull(),
  ingredientId: uuid('ingredient_id').references(() => ingredients.id, { onDelete: 'cascade' }).notNull(),
  amount: numeric('amount').notNull(),
})

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  tableNumber: integer('table_number').notNull(),
  status: orderStatusEnum('status').default('pending').notNull(),
  totalPrice: integer('total_price').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  menuId: uuid('menu_id').references(() => menus.id, { onDelete: 'cascade' }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
})

export const inboundRecords = pgTable('inbound_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const inboundItems = pgTable('inbound_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  inboundRecordId: uuid('inbound_record_id').references(() => inboundRecords.id, { onDelete: 'cascade' }).notNull(),
  ingredientId: uuid('ingredient_id').references(() => ingredients.id).notNull(),
  amount: numeric('amount').notNull(),
})

export const storeMembersRelations = relations(storeMembers, ({ one }) => ({
  store: one(stores, { fields: [storeMembers.storeId], references: [stores.id] }),
  user: one(users, { fields: [storeMembers.userId], references: [users.id] }),
}))

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menu: one(menus, { fields: [orderItems.menuId], references: [menus.id] }),
}))
