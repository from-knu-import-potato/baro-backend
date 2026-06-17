import { Hono } from "hono";
import Groq from "groq-sdk";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { ingredients } from "../db/schema.js";

const ocrRouter = new Hono<AppEnv>();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

type OcrItem = {
  name: string;
  amount: number;
  unit: "g" | "ml" | "개";
  unitPrice: number | null;
  ingredientId: string | null;
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

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "당신은 한국 카페·식당 식자재 전문가입니다. 모든 항목은 반드시 실제 식자재·식품·소모품 이름이어야 합니다. OCR 오인식으로 식자재답지 않은 단어가 나오면 가장 가까운 실제 식자재 이름으로 교정하세요.",
      },
      {
        role: "user",
        content: `다음은 한국 거래명세서에서 OCR로 추출한 텍스트입니다. 식자재/상품 항목만 추출해서 JSON 배열로 반환해주세요.
${ingredientListText}
[규칙]
1. name: 괄호 안 규격 정보 제거하고 순수 품목명만. 예) "바게트빵(185G*5EA)" → "바게트빵", "생크림(매일 500ml)" → "생크림". 식자재답지 않은 단어는 OCR 오인식으로 판단하고 올바른 식자재명으로 교정.
2. amount: 수량 열(EA/BOX/개 기준)의 숫자. 예) "185G*5EA" → 5, "3BOX" → 3
3. unit: 품목명·규격 안의 단위(예: 500ml, 1kg)는 무시. 수량 열의 단위 기준으로 판단.
   - EA, ea, 개, PCS, 봉, 팩, 박스, BOX, SET → "개"
   - 수량 열 단위가 G/g → "g", KG/kg → g로 환산(×1000)
   - 수량 열 단위가 ML/ml → "ml", L/l → ml로 환산(×1000)
   - 수량 열 단위가 불명확하면 → "개"
4. unitPrice: 단가(원) 숫자. 없으면 null.
5. 합계, 부가세, 공급가액, 총액 등 금액 행은 제외.
6. JSON 배열만 반환. 설명 금지.

텍스트:
${rawText}`,
      },
    ],
    temperature: 0,
  });

  const groqText = (completion.choices[0]?.message?.content ?? "")
    .trim()
    .replace(/```json|```/g, "")
    .trim();

  let parsed: Omit<OcrItem, "ingredientId">[];
  try {
    parsed = JSON.parse(groqText) as Omit<OcrItem, "ingredientId">[];
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

  const items: OcrItem[] = parsed.map((item) => ({
    ...item,
    ingredientId: ingredientMap.get(item.name) ?? null,
  }));

  return c.json({ success: true, data: { items, rawText } });
});

export default ocrRouter;
