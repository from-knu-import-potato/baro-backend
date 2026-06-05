import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from './routes/auth.js'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:5173', 'https://baro-web.vercel.app'],
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}))

app.route('/v1/auth', auth)

app.get('/', (c) => c.json({ success: true, data: { message: 'BARO API' } }))

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
