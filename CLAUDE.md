# BARO 백엔드 프로젝트 컨텍스트

## 서비스 개요

**BARO(바로)** — OCR·AI 기반 통합 가게 운영 SaaS.
소규모 카페·식당 사장님을 위한 주문부터 재고, 발주, 마감까지 관리하는 올인원 플랫폼.

사용자:
- **사장님 (Owner)**: 서비스 주 사용자. 주문 수락, 재고 관리, 발주, 마감 수행
- **손님 (Guest)**: QR 스캔으로 접근하는 비회원. 별도 로그인 없이 주문만 가능

핵심 기능:
1. QR 기반 비대면 주문 시스템 (테이블 QR → 손님 주문 → 사장님 실시간 수신)
2. OCR 기반 입고 데이터 자동화 (거래명세서 촬영 → 자동 디지털화)
3. AI 기반 발주 가이드 (재고 데이터 분석 → 적정 발주량 + 서술형 추천 이유)
4. 마감하기 (판매 메뉴 + 레시피 기반 재고 자동 차감)
5. 통합 대시보드 (실시간 주문·재고·매출 현황 한 화면)

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | Hono (Node.js) |
| 언어 | TypeScript |
| ORM | Drizzle ORM |
| 데이터베이스 | Supabase (PostgreSQL) |
| 인증 | 카카오 OAuth 2.0 + JWT |
| 실시간 | SSE (Server-Sent Events) |
| 배포 | Railway |
| 유효성 검사 | Zod |
| 패키지 매니저 | pnpm |

---

## 프로젝트 구조

```
src/
├─ routes/           # 도메인별 라우터 (프론트 features/ 대응)
│  ├─ auth.ts        # 카카오 OAuth, JWT 발급/갱신
│  ├─ stores.ts      # 가게 정보 CRUD
│  ├─ menus.ts       # 메뉴 CRUD
│  ├─ ingredients.ts # 식자재(재고) CRUD
│  ├─ recipes.ts     # 레시피 CRUD
│  ├─ orders.ts      # 주문 CRUD + SSE
│  ├─ ocr.ts         # OCR 이미지 업로드 + 결과
│  ├─ order-guide.ts # 발주 가이드 (AI 추천)
│  ├─ closing.ts     # 마감하기
│  ├─ dashboard.ts   # 대시보드 통계
│  └─ settings.ts    # 가게·계정 설정
├─ middleware/
│  ├─ auth.ts        # JWT 검증 미들웨어
│  └─ cors.ts        # CORS 설정
├─ db/
│  ├─ schema.ts      # Drizzle 스키마 (테이블 정의)
│  ├─ migrations/    # Drizzle 마이그레이션 파일
│  └─ index.ts       # DB 클라이언트
├─ lib/
│  ├─ jwt.ts         # JWT 유틸 (sign, verify)
│  ├─ kakao.ts       # 카카오 OAuth 유틸
│  └─ sse.ts         # SSE 유틸
├─ types/
│  └─ index.ts       # 공용 타입 (Hono Env 등)
└─ index.ts          # 앱 엔트리포인트
```

---

## DB 스키마 (Drizzle)

### 핵심 테이블

| 테이블 | 설명 |
|---|---|
| `users` | 사장님 계정 (카카오 OAuth) |
| `stores` | 가게 정보 |
| `store_members` | 사장님-가게 연결 (추후 다중 가게 대비) |
| `menus` | 메뉴 |
| `ingredients` | 식자재 (재고) |
| `recipes` | 메뉴별 레시피 항목 (menu ↔ ingredient 연결) |
| `operating_hours` | 가게 운영 시간 (요일별) |
| `orders` | 주문 헤더 |
| `order_items` | 주문 상세 (menu 연결) |
| `inbound_records` | OCR 입고 기록 헤더 |
| `inbound_items` | 입고 상세 항목 |

### 식자재 단위 제약
- 허용 단위: `g` | `ml` | `개` 세 가지만
- OCR 단위 환산은 프론트엔드에서 처리 후 표준 단위로 전송

---

## API 엔드포인트 설계

Base URL: `/v1`

### 인증 (`/v1/auth`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/auth/kakao` | 카카오 OAuth 리다이렉트 |
| GET | `/auth/kakao/callback` | 카카오 콜백 → JWT 발급 |
| POST | `/auth/refresh` | Access Token 갱신 |
| POST | `/auth/logout` | 로그아웃 (refresh token 무효화) |

### 가게 (`/v1/stores`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/stores` | 가게 생성 (초기 세팅) |
| GET | `/stores/:storeId` | 가게 정보 조회 |
| PATCH | `/stores/:storeId` | 가게 정보 수정 |
| DELETE | `/stores/:storeId` | 가게 삭제 (탈퇴 시) |

### 메뉴 (`/v1/stores/:storeId/menus`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/menus` | 메뉴 목록 |
| POST | `/menus` | 메뉴 생성 |
| PATCH | `/menus/:menuId` | 메뉴 수정 |
| DELETE | `/menus/:menuId` | 메뉴 삭제 |

### 식자재/재고 (`/v1/stores/:storeId/ingredients`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/ingredients` | 재고 목록 |
| POST | `/ingredients` | 식자재 등록 |
| PATCH | `/ingredients/:id` | 식자재 수정 |
| DELETE | `/ingredients/:id` | 식자재 삭제 |
| POST | `/ingredients/inbound` | 입고 처리 (OCR 확정 후) |

### 레시피 (`/v1/stores/:storeId/recipes`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/recipes` | 레시피 목록 |
| POST | `/recipes` | 레시피 생성 |
| PATCH | `/recipes/:id` | 레시피 수정 |
| DELETE | `/recipes/:id` | 레시피 삭제 |

### 주문 (`/v1/stores/:storeId/orders`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/orders` | 주문 목록 |
| POST | `/orders` | 주문 생성 (손님, 인증 불필요) |
| PATCH | `/orders/:orderId/status` | 주문 상태 변경 |
| GET | `/orders/stream` | SSE 실시간 주문 스트림 |

### OCR (`/v1/stores/:storeId/ocr`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/ocr/upload` | 거래명세서 이미지 업로드 → OCR 결과 반환 |

### 발주 가이드 (`/v1/stores/:storeId/order-guide`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/order-guide` | AI 발주 추천 목록 |

### 마감 (`/v1/stores/:storeId/closing`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/closing/preview` | 마감 전 이론 사용량 미리보기 |
| POST | `/closing/confirm` | 마감 확정 (재고 차감) |

### 대시보드 (`/v1/stores/:storeId/dashboard`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/dashboard/stats` | 오늘 매출, 주문 수, 재고 현황 요약 |
| GET | `/dashboard/sales` | 월별 매출/소비 데이터 |

### 계정 (`/v1/users`)
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/users/me` | 내 계정 정보 |
| PATCH | `/users/me` | 계정 정보 수정 |
| DELETE | `/users/me` | 회원 탈퇴 |

---

## 인증 흐름

```
1. 프론트 → GET /auth/kakao → 카카오 로그인 페이지 리다이렉트
2. 카카오 → GET /auth/kakao/callback (code 포함)
3. 서버: 카카오 토큰 교환 → 유저 정보 조회 → DB upsert
4. 서버: access token (15m) + refresh token (7d) 발급
5. 프론트: Authorization: Bearer {accessToken} 헤더로 API 호출
6. 만료 시: POST /auth/refresh → 새 access token 발급
```

---

## JWT 미들웨어

모든 `/v1` 라우트에 JWT 검증 적용 (손님 주문 `POST /orders` 제외).

```typescript
// Hono Context에 user 주입
type Env = {
  Variables: {
    userId: string
    storeId: string
  }
}
```

---

## 실시간 주문 (SSE)

- `GET /orders/stream` — 사장님 대시보드에서 연결 유지
- 새 주문 생성 시 해당 가게 SSE 채널로 이벤트 푸시
- 이벤트 타입: `new-order` | `order-status-changed`

---

## 응답 형식

```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "인증이 필요합니다." } }
```

---

## 환경 변수

```env
DATABASE_URL=           # Supabase PostgreSQL connection string
JWT_SECRET=             # JWT 서명 시크릿
JWT_REFRESH_SECRET=     # Refresh token 서명 시크릿
KAKAO_CLIENT_ID=        # 카카오 앱 REST API 키
KAKAO_CLIENT_SECRET=    # 카카오 앱 시크릿
KAKAO_REDIRECT_URI=     # 카카오 콜백 URI
PORT=3000
```

---

## 개발 컨벤션

### 네이밍
- 파일: camelCase (`authMiddleware.ts`, `orderRoutes.ts`)
- 함수: 동사 + camelCase (`createOrder`, `validateToken`)
- DB 컬럼: snake_case (`created_at`, `store_id`)
- 상수: UPPER_SNAKE_CASE

### 금지 사항
- `any` 타입 금지
- `console.log` 프로덕션 코드 잔류 금지
- API 키·민감 정보 하드코딩 금지
- OCR 결과 자동 확정 금지 (반드시 프론트 검수 후 `/inbound` 호출)
- 마감하기 자동 재고 차감 금지 (`/closing/confirm` 명시적 호출만 허용)

---

## 작업 규칙

1. **브랜치 필수**: 모든 작업은 작업 브랜치를 생성한 후 진행. 형식: `작업유형/이슈번호-작업이름` (예: `feature/15-menu-ocr-scan`)
2. **이슈 먼저**: 작업 시작 전 반드시 GitHub 이슈를 먼저 생성하고 이슈 번호를 브랜치명에 포함할 것. 이슈 생성 시 `.github/ISSUE_TEMPLATE/` 의 템플릿을 반드시 사용할 것.
3. **PR 템플릿 사용**: PR 생성 시 `.github/PULL_REQUEST_TEMPLATE.md` 템플릿을 반드시 사용할 것.
4. **커밋·머지·푸시 금지**: "커밋해줘", "푸시해줘" 등 명시적인 명령이 없는 이상 커밋, 머지, 푸시 단독으로 진행하지 않음. 사용자가 직접 테스트 후 명령할 때까지 대기.
5. **담당자 설정 필수**: 이슈·PR 생성 시 `gh api user --jq .login` 으로 현재 GitHub 사용자를 확인해 `--assignee` 옵션으로 설정

---

## Git 커밋 컨벤션

형식: `[gitmoji] [태그]: [제목]`

| gitmoji | 태그 | 용도 |
|---|---|---|
| ✨ | `feat` | 새 기능 |
| 🐛 | `fix` | 버그 수정 |
| ♻️ | `refactor` | 리팩토링 |
| 🗃️ | `db` | DB 스키마·마이그레이션 |
| 🔧 | `chore` | 설정·빌드 |
| 📝 | `docs` | 문서 |

---

## 프론트엔드 연동 참고

### 프론트 Base URL
```
VITE_API_BASE_URL=http://localhost:3000/v1  # 개발
VITE_API_BASE_URL=https://[railway-url]/v1  # 프로덕션
```

### 프론트 도메인-백엔드 라우트 대응

| 프론트 features/ | 백엔드 라우트 |
|---|---|
| `auth/` | `/auth` |
| `dashboard/` | `/dashboard` |
| `inventory/` | `/ingredients` |
| `ocr-inbound/` | `/ocr`, `/ingredients/inbound` |
| `order-guide/` | `/order-guide` |
| `customer-order/` | `/orders` |
| `store-settings/` | `/stores`, `/menus`, `/recipes`, `/ingredients` |
| `account-settings/` | `/users/me` |
| `initial-setup/` | `/stores` (POST), `/menus`, `/ingredients`, `/recipes` |

### 프론트 주요 타입 참고

**주문 상태**: `pending` | `preparing` | `completed` | `cancelled`

**재고 상태 계산** (프론트에서 계산, 백엔드는 raw 데이터만 반환):
- `critical`: 현재 재고 < 안전 재고 × 0.5
- `warning`: 현재 재고 < 안전 재고
- `normal`: 현재 재고 ≥ 안전 재고

**식자재 단위**: `g` | `ml` | `개`

### 프론트엔드 구조

```
baro-frontend/src/
├─ features/
│  ├─ auth/                  # KakaoLoginButton
│  ├─ customer-order/        # 손님 주문 UI + 상태관리 (Zustand)
│  ├─ dashboard/             # 대시보드 카드들
│  ├─ initial-setup/         # 초기 세팅 4단계 폼
│  ├─ inventory/             # 재고 테이블
│  ├─ ocr-inbound/           # OCR 업로드·검수 UI
│  ├─ order-guide/           # AI 발주 추천 UI
│  ├─ store-settings/        # 가게 설정 (메뉴·레시피·식자재)
│  └─ account-settings/      # 계정 설정
├─ shared/
│  ├─ api/axiosInstance.ts   # Bearer 토큰 자동 주입, 401 시 자동 로그아웃
│  └─ store/authStore.ts     # JWT 클라이언트 상태 관리 (Zustand)
└─ pages/                    # 라우팅 페이지 (UI 없음, features 조합만)
```
