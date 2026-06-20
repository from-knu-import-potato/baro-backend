import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { GoogleGenAI } from '@google/genai'
import { db } from '../db/index.js'
import { menus } from '../db/schema.js'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'
import { supabase } from '../lib/supabase.js'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

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
  } catch {
    return c.json({ success: false, error: { code: 'OCR_FAILED', message: 'OCR 요청에 실패했습니다.' } }, 500)
  }

  if (!clovaRes.ok) {
    return c.json({ success: false, error: { code: 'OCR_FAILED', message: 'OCR 처리에 실패했습니다.' } }, 500)
  }

  const clovaData = (await clovaRes.json()) as { images: { fields: { inferText: string }[] }[] }
  const rawText = clovaData.images[0]?.fields?.map((f) => f.inferText).join(' ') ?? ''

  if (!rawText.trim()) {
    return c.json({ success: false, error: { code: 'OCR_EMPTY', message: '텍스트를 인식하지 못했습니다.' } }, 422)
  }

  const prompt = `당신은 한국 카페·식당 메뉴판 분석 전문가입니다. 다음은 한국 메뉴판에서 OCR로 추출한 텍스트입니다.
아래 JSON 배열 구조로 반환해주세요. JSON 외 설명은 금지입니다.

[규칙]
1. name: 메뉴명만. 괄호 안 부가 설명·규격 정보 제거. OCR 오인식은 가장 가까운 실제 메뉴명으로 교정.
2. price: 숫자(원 단위 정수). 가격 표기가 없으면 0. 예) "4,500" → 4500, "4500원" → 4500.
3. description: 메뉴 설명 문구가 있으면 포함, 없으면 null.
4. 카테고리 헤더(예: "커피", "음료", "디저트"), 가게 이름·주소·전화번호·영업시간·SNS 등 비메뉴 정보는 제외.
5. JSON 배열만 반환. 설명 금지.

텍스트:
${rawText}`

  let completion: Awaited<ReturnType<typeof genai.models.generateContent>>
  try {
    completion = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0 },
    })
  } catch {
    return c.json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'AI 서비스가 일시적으로 사용 불가합니다. 잠시 후 다시 시도해주세요.' } }, 503)
  }

  const geminiText = (completion.text ?? '')
    .trim()
    .replace(/```json|```/g, '')
    .trim()

  let items: MenuOcrItem[]
  try {
    items = JSON.parse(geminiText) as MenuOcrItem[]
  } catch {
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
