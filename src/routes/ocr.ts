import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ingredients } from "../db/schema.js";

const ocrRouter = new Hono<AppEnv>();

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

type OcrItem = {
  name: string;
  amount: number;
  unit: "g" | "ml" | "개";
  unitPrice: number | null;
  supplyPrice: number | null;
  memo: string | null;
  ingredientId: string | null;
};

type OcrMetadata = {
  transactionDate: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  totalSupplyAmount: number | null;
  totalTax: number | null;
  totalAmount: number | null;
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
1. name: 괄호 안 규격 정보 제거하고 순수 품목명만. 예) "바게트빵(185G*5EA)" → "바게트빵". 식자재답지 않은 단어는 OCR 오인식으로 판단해 올바른 식자재명으로 교정.
2. amount: 수량 열(EA/BOX/개 기준)의 숫자.
3. unit: 수량 열의 단위 기준으로 판단.
   - EA, ea, 개, PCS, 봉, 팩, 박스, BOX, SET → "개"
   - G/g → "g", KG/kg → g로 환산(×1000)
   - ML/ml → "ml", L/l → ml로 환산(×1000)
   - 불명확하면 → "개"
4. unitPrice: 저장 단위(g, ml, 개) 1단위당 가격(원).
   - 공급가액이 있으면: 공급가액 ÷ 변환된 amount (소수점 반올림)
   - 공급가액 없이 단가만 있으면: KG→g 변환한 경우 단가÷1000, L→ml 변환한 경우 단가÷1000, 그 외 단가 그대로
   - 단가·공급가액 모두 없으면: null
   - 부가세 금액 반드시 제외
5. supplyPrice: 해당 품목의 공급가액(부가세 제외) 원본 금액. 없으면 null.
6. memo: 비고 열의 내용. 없으면 null.
7. 합계·부가세·공급가액 합계·총액 등 집계 행은 제외.

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

  const items: OcrItem[] = parsed.items.map((item) => ({
    ...item,
    ingredientId: ingredientMap.get(item.name) ?? null,
  }));

  return c.json({ success: true, data: { metadata: parsed.metadata, items, rawText } });
});

export default ocrRouter;
