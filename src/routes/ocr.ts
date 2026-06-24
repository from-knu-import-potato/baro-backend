import { OpenAPIHono } from "@hono/zod-openapi";
import { GoogleGenAI } from "@google/genai";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ingredients } from "../db/schema.js";

const ocrRouter = new OpenAPIHono<AppEnv>();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type OcrItem = {
  name: string;
  purchaseUnit: string;
  purchaseAmount: number;
  amount: number | null;
  unit: "g" | "ml" | "개" | null;
  unitPrice: number | null;
  supplyPrice: number | null;
  memo: string | null;
  is_warning: boolean;
  warningReason: string | null;
  ingredientId: string | null;
};

type OcrMetadata = {
  transactionDate: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  totalSupplyAmount: number | null;
  totalTax: number | null;
  totalAmount: number | null;
  is_warning: boolean;
  warningReason: string | null;
};

ocrRouter.post("/:storeId/ocr/upload", authMiddleware, async (c) => {
  const { storeId } = c.req.param();
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || typeof file === "string") {
    return c.json(
      {
        success: false,
        error: { code: "BAD_REQUEST", message: "파일이 없습니다." },
      },
      400,
    );
  }

  const storeIngredients = await db
    .select({ id: ingredients.id, name: ingredients.name })
    .from(ingredients)
    .where(
      and(eq(ingredients.storeId, storeId), eq(ingredients.isArchived, false)),
    );

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const clovaRes = await fetch(process.env.CLOVA_OCR_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OCR-SECRET": process.env.CLOVA_OCR_SECRET_KEY!,
    },
    body: JSON.stringify({
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      images: [
        { format: file.type.split("/")[1] ?? "jpg", name: "ocr", data: base64 },
      ],
    }),
  });

  if (!clovaRes.ok) {
    return c.json(
      {
        success: false,
        error: { code: "OCR_FAILED", message: "OCR 처리에 실패했습니다." },
      },
      500,
    );
  }

  const clovaData = (await clovaRes.json()) as {
    images: { fields: { inferText: string }[] }[];
  };

  const rawText =
    clovaData.images[0]?.fields?.map((f) => f.inferText).join(" ") ?? "";

  if (!rawText.trim()) {
    return c.json(
      {
        success: false,
        error: { code: "OCR_EMPTY", message: "텍스트를 인식하지 못했습니다." },
      },
      422,
    );
  }

  const ingredientListText =
    storeIngredients.length > 0
      ? `\n[이 가게에 등록된 실제 식자재 목록]\n${storeIngredients.map((i) => i.name).join(", ")}\n위 목록과 동일하거나 OCR 오인식으로 유사하게 읽힌 항목은 반드시 목록의 정확한 이름으로 교정할 것.\n`
      : "";

  const prompt = `당신은 한국 카페·식당 식자재 전문가입니다. 다음은 한국 거래명세서에서 OCR로 추출한 텍스트입니다.
아래 JSON 구조로 반환해주세요. JSON 외 설명은 금지입니다.

{
  "metadata": {
    "transactionDate": "YYYY-MM-DD 형식. 거래일자 또는 납품일자. 없으면 null",
    "supplierName": "공급업체(납품업체) 상호명. 없으면 null",
    "invoiceNumber": "거래명세서 번호 또는 전표번호. 없으면 null",
    "totalSupplyAmount": "공급가액 합계(부가세 제외). 숫자만. 없으면 null",
    "totalTax": "부가세 합계. 숫자만. 없으면 null",
    "totalAmount": "총 거래금액(공급가액+부가세). 숫자만. 없으면 null"
  },
  "items": [ ... ]
}
${ingredientListText}
[items 배열 규칙]
1. name: 괄호·규격(용량·중량·개수 표기 등) 제거하고 순수 품목명만. 예) "바게트빵(185G*5EA)" → "바게트빵", "콜라355ml" → "콜라". 식자재답지 않은 단어는 OCR 오인식으로 판단해 올바른 식자재명으로 교정.
2. purchaseUnit: 명세서 단위 열의 원본 단위 문자열을 대문자로 그대로 반환. 없으면 "EA".
3. purchaseAmount: 명세서 수량 열의 숫자 그대로. 상품명 내 용량(예: "콜라355ml"의 "355")은 절대 사용 금지.
4. amount / unit: purchaseUnit에 따라 아래 규칙 적용.
   [자동 변환 가능 — amount·unit 값 있음]
   - EA, 개, PCS → amount = purchaseAmount 그대로, unit = "개"
   - G → amount = purchaseAmount 그대로, unit = "g"
   - KG → amount = purchaseAmount × 1000, unit = "g"
   - ML → amount = purchaseAmount 그대로, unit = "ml"
   - L → amount = purchaseAmount × 1000, unit = "ml"
   [포장 단위 — 내용물이 제품마다 달라 자동 변환 불가, amount·unit 을 null로]
   - BOX, CS, BAG, PK, BTL, CAN, SET, K, 봉, 팩, 박스 등 위 목록 외 단위 → amount = null, unit = null
5. unitPrice:
   - amount가 null이 아닌 경우: 공급가액 있으면 공급가액 ÷ amount (소수점 둘째 자리까지), 단가만 있으면 변환된 amount 기준 재계산
   - amount가 null인 경우: 명세서의 단가/공급가액을 purchaseAmount로 나눈 1구매단위당 가격 (소수점 둘째 자리까지)
   - 모두 없으면 null. 부가세 제외.
6. supplyPrice: 해당 품목의 공급가액(부가세 제외) 원본 금액. 없으면 null.
7. memo: 비고 열의 내용. 없으면 null.
8. 합계·부가세·공급가액 합계·총액 등 집계 행은 제외.
9. 모든 숫자 값은 쉼표 없는 순수 숫자로 반환. 예) 15,000 → 15000.
10. is_warning / warningReason: 수학적 검증(합계 확인, 단가×수량 계산 등)은 절대 하지 마라. 아래 가독성 문제에만 한정해 판단.
    해당하면 is_warning: true, warningReason에 이유를 한국어로 간결하게 작성. 해당 없으면 is_warning: false, warningReason: null.
    - 품목명의 글자 자체를 읽을 수 없는 경우 (흐릿하거나 잘려서 품목명을 전혀 알 수 없음). 등록된 식자재 목록에 없거나 생소한 이름이라도 글자를 읽을 수 있으면 경고 대상이 아님.
    - 단위가 BOX·CS·BAG·PK·BTL·CAN·SET·K·봉·팩·박스 등 포장 단위인 경우는 경고 대상이 아님. 오직 어떤 단위인지 전혀 추측 불가한 문자(예: OCR이 단위 열을 완전히 뭉개버린 경우)일 때만 경고.
    - 수량 또는 단가의 숫자 자체를 명세서에서 읽을 수 없는 경우 (흐릿하거나 잘려 있음)
    - 동일 품목이 중복으로 보이는 경우

[예시]
- "콜라355ml  수량:1  단위:BOX  공급가:19,800" → name:"콜라", purchaseUnit:"BOX", purchaseAmount:1, amount:null, unit:null, unitPrice:19800, supplyPrice:19800, is_warning:false, warningReason:null
- "설탕  수량:3  단위:KG  단가:2,000" → name:"설탕", purchaseUnit:"KG", purchaseAmount:3, amount:3000, unit:"g", unitPrice:2, supplyPrice:null, is_warning:false, warningReason:null
- "?사과?  수량:불명  단위:EA  단가:500" → name:"사과", purchaseUnit:"EA", purchaseAmount:0, amount:0, unit:"개", unitPrice:500, supplyPrice:null, is_warning:true, warningReason:"품목명 및 수량 인식 불가"

텍스트:
${rawText}`;

  let completion: Awaited<ReturnType<typeof genai.models.generateContent>>;
  try {
    completion = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0 },
    });
  } catch {
    return c.json(
      {
        success: false,
        error: { code: "AI_UNAVAILABLE", message: "AI 서비스가 일시적으로 사용 불가합니다. 잠시 후 다시 시도해주세요." },
      },
      503,
    );
  }

  const geminiText = (completion.text ?? "")
    .trim()
    .replace(/```json|```/g, "")
    .trim();

  let parsed: { metadata: OcrMetadata; items: Omit<OcrItem, "ingredientId">[] };
  try {
    parsed = JSON.parse(geminiText) as {
      metadata: OcrMetadata;
      items: Omit<OcrItem, "ingredientId">[];
    };
  } catch {
    return c.json(
      {
        success: false,
        error: { code: "PARSE_FAILED", message: "AI 파싱에 실패했습니다." },
      },
      500,
    );
  }

  const ingredientMap = new Map(storeIngredients.map((i) => [i.name, i.id]));

  const items: OcrItem[] = parsed.items.map((item) => {
    let is_warning = item.is_warning
    let warningReason = item.warningReason

    // 수량 0 이하
    if (item.purchaseAmount <= 0) {
      is_warning = true
      warningReason = warningReason ?? '수량이 0 이하입니다.'
    }

    // 음수 금액
    if ((item.unitPrice != null && item.unitPrice < 0) || (item.supplyPrice != null && item.supplyPrice < 0)) {
      is_warning = true
      warningReason = warningReason ?? '금액이 음수입니다.'
    }

    // 산술 검증: unitPrice × amount(or purchaseAmount) ≈ supplyPrice (3% 초과 오차 시 경고)
    // 절댓값 대신 비율 사용 — g 단위 소액 품목에서 unitPrice 소수점 반올림 오차로 인한 오탐 방지
    if (item.unitPrice != null && item.supplyPrice != null && item.supplyPrice > 0) {
      const base = item.amount ?? item.purchaseAmount
      const expected = item.unitPrice * base
      const diffRatio = Math.abs(expected - item.supplyPrice) / item.supplyPrice
      if (diffRatio > 0.03) {
        is_warning = true
        warningReason = warningReason ?? '단가와 공급가액이 일치하지 않습니다.'
      }
    }

    return {
      ...item,
      is_warning,
      warningReason,
      ingredientId: ingredientMap.get(item.name) ?? null,
    }
  });

  // 메타데이터 합계 검증: 공급가액 + 부가세 = 총 거래금액
  // AI에게 맡기지 않고 서버가 직접 계산
  const metadata: OcrMetadata = { ...parsed.metadata, is_warning: false, warningReason: null }
  if (
    parsed.metadata.totalSupplyAmount != null &&
    parsed.metadata.totalTax != null &&
    parsed.metadata.totalAmount != null
  ) {
    const expectedTotal = parsed.metadata.totalSupplyAmount + parsed.metadata.totalTax
    if (Math.abs(expectedTotal - parsed.metadata.totalAmount) > 10) {
      metadata.is_warning = true
      metadata.warningReason = '공급가액과 부가세의 합계가 총 거래금액과 일치하지 않습니다.'
    }
  }

  return c.json({ success: true, data: { metadata, items, rawText } });
});

// OpenAPI registrations
ocrRouter.openAPIRegistry.registerPath({
  method: 'post',
  path: '/{storeId}/ocr/upload',
  tags: ['OCR'],
  summary: '거래명세서 OCR 업로드',
  description: '거래명세서 이미지를 업로드하면 Clova OCR + Gemini AI로 파싱하여 식자재 입고 정보를 반환합니다.',
  security: [{ bearerAuth: [] }],
  parameters: [{ name: 'storeId', in: 'path', required: true, schema: { type: 'string' as const, format: 'uuid' } }],
  requestBody: {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file'],
          properties: { file: { type: 'string', format: 'binary', description: '거래명세서 이미지 파일' } },
        },
      },
    },
  },
  responses: {
    200: { description: 'OCR 파싱 결과 (metadata, items, rawText)' },
    400: { description: '파일 없음' },
    422: { description: '텍스트 인식 불가' },
    500: { description: 'OCR 또는 AI 파싱 실패' },
    503: { description: 'AI 서비스 일시 불가' },
  },
})

export default ocrRouter;


