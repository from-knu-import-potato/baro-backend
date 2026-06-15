import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { menus } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'
import { supabase } from '../lib/supabase.js'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

type MenuOcrItem = {
  name: string
  price: number
  description: string | null
}

const menusRouter = new Hono<AppEnv>()

const menuSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  isAvailable: z.boolean().optional(),
  categoryId: z.string().uuid().nullable().optional(),
})

menusRouter.post('/:storeId/menus/upload', authMiddleware, async (c) => {
  const storeId = c.req.param('storeId')
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '파일이 없습니다.' } }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const ext = file.name.split('.').pop()
  const path = `${storeId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('menu-images')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

  if (error) {
    return c.json({ success: false, error: { code: 'UPLOAD_FAILED', message: error.message } }, 500)
  }

  const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
  return c.json({ success: true, data: { url: data.publicUrl } }, 201)
})

menusRouter.post('/:storeId/menus/ocr-scan', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '파일이 없습니다.' } }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  let clovaRes: Response
  try {
    clovaRes = await fetch(process.env.CLOVA_OCR_API_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': process.env.CLOVA_OCR_SECRET_KEY!,
      },
      body: JSON.stringify({
        version: 'V2',
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        images: [{ format: file.type.split('/')[1] ?? 'jpg', name: 'menu-ocr', data: base64 }],
      }),
    })
  } catch (err) {
    console.error('[menu-ocr] Clova fetch error:', err)
    return c.json({ success: false, error: { code: 'OCR_FAILED', message: 'OCR 요청에 실패했습니다.' } }, 500)
  }

  if (!clovaRes.ok) {
    const errBody = await clovaRes.text().catch(() => '')
    console.error('[menu-ocr] Clova OCR non-ok:', clovaRes.status, errBody)
    return c.json({ success: false, error: { code: 'OCR_FAILED', message: 'OCR 처리에 실패했습니다.' } }, 500)
  }

  const clovaData = (await clovaRes.json()) as { images: { fields: { inferText: string }[] }[] }
  const rawText = clovaData.images[0]?.fields?.map((f) => f.inferText).join(' ') ?? ''

  if (!rawText.trim()) {
    return c.json({ success: false, error: { code: 'OCR_EMPTY', message: '텍스트를 인식하지 못했습니다.' } }, 422)
  }

  let completion: Awaited<ReturnType<typeof groq.chat.completions.create>>
  try {
    completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            '당신은 한국 카페·식당 메뉴판 분석 전문가입니다. OCR로 추출한 텍스트에서 메뉴 항목만 정확히 식별하세요. 메뉴명이 아닌 가게 정보, 영업시간, 주소 등은 제외하세요.',
        },
        {
          role: 'user',
          content: `다음은 한국 카페·식당 메뉴판에서 OCR로 추출한 텍스트입니다. 메뉴 항목을 JSON 배열로 반환해주세요.

[규칙]
1. name: 메뉴명만. 괄호 안 부가 설명 제거. OCR 오인식은 가장 가까운 실제 메뉴명으로 교정.
2. price: 숫자(원). 가격 표기가 없으면 0. 예) "4,500" → 4500, "4500원" → 4500.
3. description: 메뉴 설명이 있으면 포함, 없으면 null.
4. 카테고리 헤더(예: "커피", "음료", "디저트"), 가게 정보, 영업시간은 제외.
5. JSON 배열만 반환. 설명 금지.

텍스트:
${rawText}`,
        },
      ],
      temperature: 0,
    })
  } catch (err) {
    console.error('[menu-ocr] Groq error:', err)
    return c.json({ success: false, error: { code: 'AI_FAILED', message: 'AI 분석에 실패했습니다.' } }, 500)
  }

  const groqText = (completion.choices[0]?.message?.content ?? '')
    .trim()
    .replace(/```json|```/g, '')
    .trim()

  let items: MenuOcrItem[]
  try {
    items = JSON.parse(groqText) as MenuOcrItem[]
  } catch {
    console.error('[menu-ocr] JSON parse failed. groqText:', groqText)
    return c.json({ success: false, error: { code: 'PARSE_FAILED', message: 'AI 파싱에 실패했습니다.' } }, 500)
  }

  return c.json({ success: true, data: { items, rawText } })
})

menusRouter.get('/:storeId/menus', async (c) => {
  const storeId = c.req.param('storeId')
  const list = await db.select().from(menus).where(eq(menus.storeId, storeId))
  return c.json({ success: true, data: list })
})

menusRouter.post('/:storeId/menus', authMiddleware, zValidator('json', menuSchema), async (c) => {
  const storeId = c.req.param('storeId')
  const body = c.req.valid('json')
  const [created] = await db.insert(menus).values({ storeId, ...body }).returning()
  return c.json({ success: true, data: created }, 201)
})

menusRouter.patch('/:storeId/menus/:menuId', authMiddleware, zValidator('json', menuSchema.partial()), async (c) => {
  const { storeId, menuId } = c.req.param()
  const body = c.req.valid('json')
  const [updated] = await db.update(menus)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(menus.id, menuId), eq(menus.storeId, storeId)))
    .returning()
  if (!updated) return c.json({ success: false, error: { code: 'NOT_FOUND', message: '메뉴를 찾을 수 없습니다.' } }, 404)
  return c.json({ success: true, data: updated })
})

menusRouter.delete('/:storeId/menus/:menuId', authMiddleware, async (c) => {
  const { storeId, menuId } = c.req.param()
  await db.delete(menus).where(and(eq(menus.id, menuId), eq(menus.storeId, storeId)))
  return c.json({ success: true, data: null })
})

export default menusRouter
