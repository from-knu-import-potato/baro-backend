import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth.js'
import stores from './routes/stores.js'
import users from './routes/users.js'
import menus from './routes/menus.js'
import ingredients from './routes/ingredients.js'
import recipesRouter from './routes/recipes.js'
import ocrRouter from './routes/ocr.js'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'https://baro-web.vercel.app', 'https://qa-baro-web.vercel.app'],
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}))

app.route('/v1/auth', auth)
app.route('/v1/stores', stores)
app.route('/v1/stores', menus)
app.route('/v1/stores', ingredients)
app.route('/v1/stores', recipesRouter)
app.route('/v1/users', users)
app.route('/v1/stores', ocrRouter)

app.get('/', (c) => c.json({ success: true, data: { message: 'BARO API' } }))

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
