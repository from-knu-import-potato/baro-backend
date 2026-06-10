import { Hono } from 'hono'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AppEnv } from '../types/index.js'
import { authMiddleware } from '../middleware/auth.js'

const ocrRouter = new Hono<AppEnv>()
ocrRouter.use('*', authMiddleware)

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

type OcrItem = {
  name: string
  amount: number
  unit: 'g' | 'ml' | '개'
  unitPrice: number | null
}

ocrRouter.post('/:storeId/ocr/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: '파일이 없습니다.' } }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const clovaRes = await fetch(process.env.CLOVA_OCR_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OCR-SECRET': process.env.CLOVA_OCR_SECRET_KEY!,
    },
    body: JSON.stringify({
      version: 'V2',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      images: [{ format: file.type.split('/')[1] ?? 'jpg', name: 'ocr', data: base64 }],
    }),
  })

  if (!clovaRes.ok) {
    return c.json({ success: false, error: { code: 'OCR_FAILED', message: 'OCR 처리에 실패했습니다.' } }, 500)
  }

  const clovaData = await clovaRes.json() as {
    images: { fields: { inferText: string }[] }[]
  }

  const rawText = clovaData.images[0]?.fields?.map((f) => f.inferText).join(' ') ?? ''

  if (!rawText.trim()) {
    return c.json({ success: false, error: { code: 'OCR_EMPTY', message: '텍스트를 인식하지 못했습니다.' } }, 422)
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const prompt = `다음은 거래명세서에서 추출한 텍스트입니다. 식자재 항목만 추출해서 JSON 배열로 반환해주세요.
각 항목은 반드시 name(string), amount(number), unit("g"|"ml"|"개" 중 하나), unitPrice(number|null) 필드를 가져야 합니다.
단위는 반드시 g, ml, 개 중 하나로 변환해주세요. (kg→g 환산, L→ml 환산)
JSON 배열만 반환하고 다른 설명은 하지 마세요.

텍스트:
${rawText}`

  const geminiRes = await model.generateContent(prompt)
  const geminiText = geminiRes.response.text().trim().replace(/```json|```/g, '').trim()

  let items: OcrItem[]
  try {
    items = JSON.parse(geminiText) as OcrItem[]
  } catch {
    return c.json({ success: false, error: { code: 'PARSE_FAILED', message: 'AI 파싱에 실패했습니다.' } }, 500)
  }

  return c.json({ success: true, data: { items, rawText } })
})

export default ocrRouter
