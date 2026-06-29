import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { db } from './index.js'
import { menus, stores } from './schema.js'

const TEST_USER_IDS = [
  '8028fdce-9fbe-44b7-897e-86701bbca88c',
  '77ed6eea-44ac-445d-9077-b35c4b6a2bd9',
  '1e2d7737-6c21-4758-869a-c2444a03d849',
]

const DESCRIPTIONS: Record<string, string> = {
  '아메리카노':   '깔끔하고 진한 에스프레소에 물을 더해 부드럽게 즐기는 클래식 커피',
  '카페라떼':    '부드러운 스팀 밀크와 에스프레소의 조화, 고소하고 크리미한 맛',
  '카푸치노':    '에스프레소 위에 풍성한 우유 거품을 얹은 이탈리아 정통 커피',
  '녹차라떼':    '제주 말차 파우더와 부드러운 스팀 밀크의 달콤 쌉쌀한 조화',
  '레모네이드':  '상큼한 레몬 시럽과 탄산수로 만든 시원하고 달콤한 수제 음료',
  '초코라떼':    '진한 벨기에 초코 파우더와 부드러운 우유로 만든 달콤한 음료',
  '크로플':      '바삭한 크로아상 반죽을 와플 기계에 구워 생크림을 곁들인 디저트',
  '치즈케이크':  '진하고 부드러운 뉴욕 스타일 치즈케이크 한 조각',
}

async function main() {
  console.log('🖊️  메뉴 설명 업데이트 시작...')

  for (const userId of TEST_USER_IDS) {
    const storeList = await db.select().from(stores).where(eq(stores.ownerId, userId))
    if (storeList.length === 0) {
      console.log(`  ⚠️  userId ${userId} 가게 없음, 건너뜀`)
      continue
    }

    for (const store of storeList) {
      for (const [name, description] of Object.entries(DESCRIPTIONS)) {
        await db
          .update(menus)
          .set({ description })
          .where(and(eq(menus.storeId, store.id), eq(menus.name, name)))
      }
      console.log(`  ✅ storeId: ${store.id} 완료`)
    }
  }

  console.log('\n🎉 메뉴 설명 업데이트 완료!')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
