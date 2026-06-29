import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import {
  closingDeductions,
  closings,
  inboundItems,
  inboundRecords,
  ingredients,
  menuCategories,
  menus,
  operatingHours,
  orderItems,
  orders,
  recipes,
  storeMembers,
  storeOpens,
  stores,
} from './schema.js'

// ── 테스트 사용자 ──────────────────────────────────────────────────────────────
const TEST_USERS = [
  { id: '8028fdce-9fbe-44b7-897e-86701bbca88c', name: 'Test User 01' },
  { id: '77ed6eea-44ac-445d-9077-b35c4b6a2bd9', name: 'Test User 02' },
  { id: '1e2d7737-6c21-4758-869a-c2444a03d849', name: 'Test User 03' },
]

// ── 메뉴 ─────────────────────────────────────────────────────────────────────
const CATEGORY_NAMES = ['커피', '음료', '디저트']

const MENU_DEFS = [
  { name: '아메리카노', price: 3500, catIdx: 0, isFeatured: true },
  { name: '카페라떼',   price: 4500, catIdx: 0, isFeatured: true },
  { name: '카푸치노',   price: 4500, catIdx: 0, isFeatured: false },
  { name: '녹차라떼',   price: 5000, catIdx: 1, isFeatured: true },
  { name: '레모네이드', price: 4500, catIdx: 1, isFeatured: false },
  { name: '초코라떼',   price: 5000, catIdx: 1, isFeatured: false },
  { name: '크로플',     price: 4500, catIdx: 2, isFeatured: true },
  { name: '치즈케이크', price: 6500, catIdx: 2, isFeatured: false },
]

// ── 식자재 ───────────────────────────────────────────────────────────────────
// finalStock: DB에 저장될 현재 재고 (7일치 운영 후 남은 재고)
const INGREDIENT_DEFS: {
  name: string
  unit: 'g' | 'ml' | '개'
  safetyStock: number
  finalStock: number
}[] = [
  { name: '에스프레소 원두',      unit: 'g',  safetyStock: 1000, finalStock: 4886 },
  { name: '우유',                unit: 'ml', safetyStock: 3000, finalStock: 1400 },
  { name: '녹차 파우더',         unit: 'g',  safetyStock: 300,  finalStock: 300  },
  { name: '초코 파우더',         unit: 'g',  safetyStock: 200,  finalStock: 100  },
  { name: '레몬 시럽',           unit: 'ml', safetyStock: 500,  finalStock: 50   },
  { name: '생크림',              unit: 'ml', safetyStock: 500,  finalStock: 900  },
  { name: '크로플 반죽',         unit: '개', safetyStock: 10,   finalStock: 26   },
  { name: '치즈케이크 슬라이스', unit: '개', safetyStock: 5,    finalStock: 6    },
]

// ── 레시피: RECIPE_DEFS[menuIdx] = [[ingredientIdx, amount], ...] ────────────
const RECIPE_DEFS: [number, number][][] = [
  [[0, 18]],                      // 아메리카노: 원두 18g
  [[0, 18], [1, 200]],            // 카페라떼: 원두 18g, 우유 200ml
  [[0, 18], [1, 150], [5, 50]],   // 카푸치노: 원두 18g, 우유 150ml, 생크림 50ml
  [[2, 15], [1, 200]],            // 녹차라떼: 녹차 15g, 우유 200ml
  [[4, 50]],                      // 레모네이드: 레몬 50ml
  [[3, 20], [1, 200]],            // 초코라떼: 초코 20g, 우유 200ml
  [[6, 1], [5, 50]],              // 크로플: 반죽 1개, 생크림 50ml
  [[7, 1]],                       // 치즈케이크: 1개
]

// ── 날별 판매량 [아메, 라떼, 카푸, 녹차, 레모, 초코, 크로플, 치즈] ────────────
// 모든 날 합산 → finalStock 검증:
//   원두  5000 + 3000(입고) - (414+378+540+648+864+270) = 4886 ✓
//   우유  15000+15000(입고) - (3850+3800+4950+5900+7600+2500) = 1400 ✓
//   생크림 2500+2000(입고) - (450+450+600+700+1150+250) = 900 ✓
const DAILY_SALES: Record<string, number[]> = {
  '2026-06-23': [12, 8, 3, 5, 4, 4, 6, 3],  // Tue
  '2026-06-24': [10, 7, 4, 6, 3, 3, 5, 2],  // Wed
  '2026-06-25': [15, 10, 5, 7, 5, 4, 7, 4], // Thu (입고일)
  '2026-06-26': [18, 12, 6, 8, 6, 5, 8, 5], // Fri
  '2026-06-27': [25, 15, 8, 10, 8, 7, 15, 8], // Sat (입고일)
  '2026-06-29': [8, 5, 2, 4, 3, 2, 3, 2],   // Mon
}
// 6/28 (Sun) 휴무 - 데이터 없음

// ── 입고 ────────────────────────────────────────────────────────────────────
const INBOUND_DEFS: Record<string, { ingIdx: number; amount: number; unitPrice: number }[]> = {
  '2026-06-25': [
    { ingIdx: 0, amount: 3000,  unitPrice: 8    }, // 원두 3kg
    { ingIdx: 1, amount: 15000, unitPrice: 1    }, // 우유 15L
  ],
  '2026-06-27': [
    { ingIdx: 5, amount: 2000,  unitPrice: 3    }, // 생크림 2L
    { ingIdx: 6, amount: 30,    unitPrice: 800  }, // 크로플 반죽 30개
    { ingIdx: 7, amount: 12,    unitPrice: 4000 }, // 치즈케이크 12개
  ],
}

// ── 운영 시간 (KST) ─────────────────────────────────────────────────────────
const OPEN_HOURS: Record<string, { open: number; close: number }> = {
  '2026-06-23': { open: 9, close: 21 },
  '2026-06-24': { open: 9, close: 21 },
  '2026-06-25': { open: 9, close: 21 },
  '2026-06-26': { open: 9, close: 21 },
  '2026-06-27': { open: 10, close: 20 }, // 토요일
  '2026-06-29': { open: 9, close: 21 },
}

// 7일 운영 시작 전 재고 (검증 기준값)
const STARTING_STOCK = [5000, 15000, 900, 600, 1500, 2500, 40, 18]

// ── 유틸 ────────────────────────────────────────────────────────────────────
function kstToUTC(dateStr: string, kstHour: number, kstMinute = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  // JS Date handles minute overflow correctly (e.g., minute=150 → +2h30m)
  return new Date(Date.UTC(y, m - 1, d, kstHour - 9, kstMinute))
}

function calcDayDeductions(sales: number[]): number[] {
  const deductions = new Array(INGREDIENT_DEFS.length).fill(0)
  sales.forEach((qty, menuIdx) => {
    RECIPE_DEFS[menuIdx].forEach(([ingIdx, amount]) => {
      deductions[ingIdx] += qty * amount
    })
  })
  return deductions
}

type OrderDef = {
  tableNumber: number
  status: 'completed' | 'cancelled'
  createdAt: Date
  items: { menuIdx: number; qty: number }[]
}

function buildOrders(sales: number[], date: string, openKST: number, closeKST: number): OrderDef[] {
  // 라운드로빈으로 메뉴 아이템 인터리빙
  const pool: number[] = []
  const remaining = [...sales]
  while (remaining.some(r => r > 0)) {
    for (let m = 0; m < remaining.length; m++) {
      if (remaining[m] > 0) {
        pool.push(m)
        remaining[m]--
      }
    }
  }

  // 아이템을 주문 단위로 묶기 (1~3개 아이템씩, 패턴 반복)
  const sizePattern = [2, 2, 3, 1, 2, 3, 2, 1, 3, 2]
  const rawOrders: number[][] = []
  let i = 0
  let patIdx = 0
  while (i < pool.length) {
    const size = sizePattern[patIdx % sizePattern.length]
    rawOrders.push(pool.slice(i, i + size))
    i += size
    patIdx++
  }

  const totalMinutes = (closeKST - openKST) * 60 - 30

  return rawOrders.map((items, orderIdx) => {
    const qtys = new Map<number, number>()
    items.forEach(m => qtys.set(m, (qtys.get(m) ?? 0) + 1))

    const minuteOffset = Math.floor((orderIdx / rawOrders.length) * totalMinutes) + 10
    const createdAt = kstToUTC(date, openKST, minuteOffset)

    return {
      tableNumber: (orderIdx % 6) + 1,
      status: 'completed' as const,
      createdAt,
      items: [...qtys.entries()].map(([menuIdx, qty]) => ({ menuIdx, qty })),
    }
  })
}

// ── 가게 시딩 ────────────────────────────────────────────────────────────────
async function seedStore(userId: string, userName: string) {
  console.log(`\n▶ ${userName} 가게 시딩 중...`)

  // 1. 가게 생성
  const [store] = await db.insert(stores).values({
    name: '바로 카페',
    ownerId: userId,
    businessType: '카페',
    category: '음료',
    tableCount: 6,
    safetyStockPct: 20,
    themeColor: 'blue',
    layout: 'list',
  }).returning()

  // 2. 스토어 멤버
  await db.insert(storeMembers).values({ storeId: store.id, userId, role: 'owner' })

  // 3. 운영 시간
  await db.insert(operatingHours).values([
    { storeId: store.id, dayOfWeek: 0, isClosed: true },
    { storeId: store.id, dayOfWeek: 1, openTime: '09:00', closeTime: '21:00', isClosed: false },
    { storeId: store.id, dayOfWeek: 2, openTime: '09:00', closeTime: '21:00', isClosed: false },
    { storeId: store.id, dayOfWeek: 3, openTime: '09:00', closeTime: '21:00', isClosed: false },
    { storeId: store.id, dayOfWeek: 4, openTime: '09:00', closeTime: '21:00', isClosed: false },
    { storeId: store.id, dayOfWeek: 5, openTime: '09:00', closeTime: '21:00', isClosed: false },
    { storeId: store.id, dayOfWeek: 6, openTime: '10:00', closeTime: '20:00', isClosed: false },
  ])

  // 4. 메뉴 카테고리
  const catRows = await db.insert(menuCategories).values(
    CATEGORY_NAMES.map((name, sortOrder) => ({ storeId: store.id, name, sortOrder }))
  ).returning()

  // 5. 메뉴
  const menuRows = await db.insert(menus).values(
    MENU_DEFS.map(m => ({
      storeId: store.id,
      categoryId: catRows[m.catIdx].id,
      name: m.name,
      price: m.price,
      isAvailable: true,
      isFeatured: m.isFeatured,
    }))
  ).returning()
  const menuIds = menuRows.map(r => r.id)

  // 6. 식자재 (현재 재고 = 7일 운영 후 남은 재고)
  const ingRows = await db.insert(ingredients).values(
    INGREDIENT_DEFS.map(ing => ({
      storeId: store.id,
      name: ing.name,
      unit: ing.unit,
      currentStock: String(ing.finalStock),
      safetyStock: String(ing.safetyStock),
    }))
  ).returning()
  const ingIds = ingRows.map(r => r.id)

  // 7. 레시피
  await db.insert(recipes).values(
    RECIPE_DEFS.flatMap((parts, menuIdx) =>
      parts.map(([ingIdx, amount]) => ({
        menuId: menuIds[menuIdx],
        ingredientId: ingIds[ingIdx],
        amount: String(amount),
      }))
    )
  )

  // 8. 일별 시뮬레이션
  const runningStock = [...STARTING_STOCK]
  const dates = Object.keys(DAILY_SALES)

  for (const date of dates) {
    const sales = DAILY_SALES[date]
    const { open: openKST, close: closeKST } = OPEN_HOURS[date]

    // storeOpen
    await db.insert(storeOpens).values({
      storeId: store.id,
      businessDate: date,
      openedAt: kstToUTC(date, openKST, 3),
    })

    // 입고 (영업 시작 후 오전 중 처리)
    const inboundDef = INBOUND_DEFS[date]
    if (inboundDef) {
      const supplierName = date === '2026-06-25' ? '한국식자재유통' : '로컬마켓'
      const [record] = await db.insert(inboundRecords).values({
        storeId: store.id,
        transactionDate: date,
        supplierName,
        createdAt: kstToUTC(date, openKST + 1, 0),
      }).returning()

      await db.insert(inboundItems).values(
        inboundDef.map(({ ingIdx, amount, unitPrice }) => ({
          inboundRecordId: record.id,
          ingredientId: ingIds[ingIdx],
          amount: String(amount),
          unitPrice: String(unitPrice),
          supplyPrice: String(amount * unitPrice),
        }))
      )

      inboundDef.forEach(({ ingIdx, amount }) => {
        runningStock[ingIdx] += amount
      })
    }

    // 주문 생성
    const dayOrders = buildOrders(sales, date, openKST, closeKST)
    for (const od of dayOrders) {
      const totalPrice = od.items.reduce(
        (sum, it) => sum + it.qty * MENU_DEFS[it.menuIdx].price,
        0
      )
      const [order] = await db.insert(orders).values({
        storeId: store.id,
        tableNumber: od.tableNumber,
        status: od.status,
        totalPrice,
        createdAt: od.createdAt,
        updatedAt: od.createdAt,
      }).returning()

      await db.insert(orderItems).values(
        od.items.map(it => ({
          orderId: order.id,
          menuId: menuIds[it.menuIdx],
          quantity: it.qty,
          unitPrice: MENU_DEFS[it.menuIdx].price,
        }))
      )
    }

    // 재고 차감
    const deductions = calcDayDeductions(sales)
    deductions.forEach((d, i) => { runningStock[i] -= d })

    // 매출 (completed 주문 합계)
    const revenue = dayOrders
      .filter(o => o.status === 'completed')
      .reduce(
        (sum, o) => sum + o.items.reduce((s, it) => s + it.qty * MENU_DEFS[it.menuIdx].price, 0),
        0
      )

    // 마감
    const [closing] = await db.insert(closings).values({
      storeId: store.id,
      date,
      totalRevenue: revenue,
      createdAt: kstToUTC(date, closeKST, 30),
    }).returning()

    // 마감 차감 이력
    await db.insert(closingDeductions).values(
      deductions
        .map((d, ingIdx) => ({
          closingId: closing.id,
          ingredientId: ingIds[ingIdx],
          orderDeductedAmount: String(d),
          actualUsage: String(d),
          adjustmentAmount: '0',
          remainingStock: String(runningStock[ingIdx]),
        }))
        .filter((_, i) => deductions[i] > 0)
    )
  }

  console.log(`  ✅ storeId: ${store.id}`)
}

// ── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 테스트 계정 3개 시딩 시작...')
  console.log('   기간: 2026-06-23(화) ~ 2026-06-29(월), 6/28(일) 휴무')

  // 기존 테스트 가게 정리
  for (const user of TEST_USERS) {
    const existing = await db.select().from(stores).where(eq(stores.ownerId, user.id))
    if (existing.length > 0) {
      console.log(`  ⚠️  ${user.name} 기존 가게 ${existing.length}개 삭제 중...`)
      await db.delete(stores).where(eq(stores.ownerId, user.id))
    }
  }

  for (const user of TEST_USERS) {
    await seedStore(user.id, user.name)
  }

  console.log('\n🎉 시딩 완료!')
  console.log('\n최종 재고 상태 (발주 가이드 데모용):')
  console.log('  우유      1,400ml  → CRITICAL (안전재고 3,000ml)')
  console.log('  초코파우더  100g   → CRITICAL (안전재고 200g)')
  console.log('  레몬시럽    50ml   → CRITICAL (안전재고 500ml)')
  console.log('  녹차파우더  300g   → WARNING  (안전재고 300g, 경계)')

  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
