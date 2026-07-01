<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/from-knu-import-potato/baro-frontend/main/public/assets/baro-banner-black.png">
  <img alt="Baro Banner" src="https://raw.githubusercontent.com/from-knu-import-potato/baro-frontend/main/public/assets/baro-banner-white.png">
</picture>

<br/>

<div align="center">
  <a href="https://baro-web.vercel.app/">
    <img src="https://img.shields.io/badge/🌐 서비스 바로가기-Click-449CD4?style=flat-square" />
  </a>
  &nbsp;&nbsp;
  <a href="https://qa-baro-web.vercel.app/">
    <img src="https://img.shields.io/badge/🧪 테스트 서비스-Click-679436?style=flat-square" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/from-knu-import-potato/baro-frontend">
    <img src="https://img.shields.io/badge/🖥️ 프론트엔드 레포-Click-E8A838?style=flat-square" />
  </a>
  &nbsp;&nbsp;
  <a href="https://baro-backend-production-c908.up.railway.app/doc">
    <img src="https://img.shields.io/badge/📄 API 문서 (Swagger)-Click-85EA2D?style=flat-square" />
  </a>
</div>

<br/>

**BARO(바로)** 백엔드 API 서버입니다. QR 주문부터 OCR 입고 처리, AI 발주 가이드, 레시피 기반 마감 정산까지 — BARO 서비스의 모든 비즈니스 로직을 담당합니다.

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=기술%20스택&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

| 분류 | 기술 | 버전 | 선택 이유 |
|---|---|---|---|
| **프레임워크** | Hono | 4.12 | 초경량 Node.js 프레임워크, OpenAPI/Swagger 내장, Railway 배포 최적 |
| **언어** | TypeScript | 5.8 | 엔드투엔드 타입 안전성, 프론트·백 타입 공유 |
| **ORM** | Drizzle ORM | 0.45 | 타입 안전 쿼리 빌더, Supabase 직접 연결, 경량 마이그레이션 |
| **데이터베이스** | Supabase (PostgreSQL) | — | DB + 파일 스토리지를 단일 플랫폼으로 운영 |
| **인증** | jose (JWT) + bcrypt | 6.2 | Web Crypto API 기반 표준 JWT, 카카오 OAuth 2.0 |
| **유효성 검사** | Zod | 4.4 | 런타임 스키마 검증 + OpenAPI 문서 자동 생성 |
| **AI** | Google Gemini 2.5 Flash | — | OCR 파싱·발주 분석·메뉴 스캔 멀티모달 처리 |
| **OCR** | Naver CLOVA OCR | — | 한국어 거래명세서 특화, 표 구조 인식 정확도 우수 |
| **실시간** | SSE (Server-Sent Events) | — | 주문 실시간 수신, HTTP 기반으로 Railway 환경 안정 |
| **파일 스토리지** | Supabase Storage | — | 거래명세서 이미지, 메뉴 이미지 S3 호환 저장 |
| **배포** | Railway | — | Nixpacks 자동 빌드, Node.js 서버 최적 배포 환경 |
| **패키지 매니저** | pnpm | ≥10 | 빠른 설치, 엄격한 의존성 관리 |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=배포%20환경&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

| 구분 | URL |
|---|---|
| 백엔드 API | https://baro-backend-production-c908.up.railway.app/v1/ |
| API 문서 (Swagger UI) | https://baro-backend-production-c908.up.railway.app/doc |
| OpenAPI 스펙 (JSON) | https://baro-backend-production-c908.up.railway.app/openapi.json |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=시작하기&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

**사전 요구사항**: Node.js >= 22, pnpm >= 10, Supabase 프로젝트

```bash
git clone https://github.com/from-knu-import-potato/baro-backend.git
cd baro-backend
pnpm install
cp .env.example .env
# .env 환경 변수 설정 후 실행
pnpm db:migrate     # DB 마이그레이션
pnpm dev            # 개발 서버 실행
# http://localhost:3000
# Swagger UI: http://localhost:3000/doc
```

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 실행 (tsx watch, 핫 리로드) |
| `pnpm build` | TypeScript 컴파일 → `dist/` |
| `pnpm start` | 프로덕션 서버 실행 (`dist/index.js`) |
| `pnpm db:generate` | 스키마 변경으로 마이그레이션 파일 생성 |
| `pnpm db:migrate` | 마이그레이션 실행 |
| `pnpm db:push` | 스키마를 DB에 직접 반영 |
| `pnpm db:studio` | Drizzle Studio (DB 웹 UI) 실행 |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=환경%20변수&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

```env
# 데이터베이스
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres

# JWT 시크릿
JWT_SECRET=your-access-token-secret
JWT_REFRESH_SECRET=your-refresh-token-secret

# Kakao OAuth
KAKAO_CLIENT_ID=your-kakao-app-key
KAKAO_CLIENT_SECRET=your-kakao-client-secret
KAKAO_REDIRECT_URI=http://localhost:3000/v1/auth/kakao/callback

# AI / OCR
GEMINI_API_KEY=your-google-gemini-api-key
CLOVA_OCR_API_URL=https://your-clova-ocr-endpoint
CLOVA_OCR_SECRET_KEY=your-clova-secret-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key

# 기타
FRONTEND_URL=http://localhost:5173
REGISTER_CODE=your-invite-code-for-local-testing
PORT=3000
```

| 변수 | 설명 | 발급처 |
|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 | [Supabase](https://supabase.com) |
| `JWT_SECRET` | Access Token 서명 시크릿 (HS256) | 직접 생성 |
| `JWT_REFRESH_SECRET` | Refresh Token 서명 시크릿 | 직접 생성 |
| `KAKAO_CLIENT_ID` | 카카오 앱 REST API 키 | [Kakao Developers](https://developers.kakao.com) |
| `KAKAO_CLIENT_SECRET` | 카카오 앱 시크릿 | [Kakao Developers](https://developers.kakao.com) |
| `KAKAO_REDIRECT_URI` | 카카오 OAuth 콜백 URI | 카카오 앱 설정에서 등록 |
| `GEMINI_API_KEY` | Google Gemini API 키 | [Google AI Studio](https://aistudio.google.com) |
| `CLOVA_OCR_API_URL` | Naver CLOVA OCR API 엔드포인트 | [Naver CLOVA](https://clova.ai/ocr) |
| `CLOVA_OCR_SECRET_KEY` | CLOVA OCR 시크릿 키 | [Naver CLOVA](https://clova.ai/ocr) |
| `SUPABASE_URL` | Supabase 프로젝트 URL | [Supabase](https://supabase.com) |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role 키 (스토리지 접근) | [Supabase](https://supabase.com) |
| `FRONTEND_URL` | 프론트엔드 URL (CORS·카카오 콜백 리다이렉트) | 직접 설정 |
| `REGISTER_CODE` | 아이디/비밀번호 회원가입 초대 코드 | 직접 설정 |
| `PORT` | 서버 포트 (기본값: 3000) | 직접 설정 |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=프로젝트%20구조&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

```
baro-backend/
├─ src/
│  ├─ index.ts               # 진입점 — 라우터 등록, CORS, OpenAPI/Swagger 설정
│  ├─ routes/                # 도메인별 라우터 (OpenAPIHono)
│  │  ├─ auth.ts             # 카카오 OAuth, 아이디/비밀번호 로그인, JWT 발급·갱신
│  │  ├─ stores.ts           # 가게 CRUD, 멤버 관리, 초대 코드, 영업시간
│  │  ├─ users.ts            # 내 계정 조회·수정·탈퇴, 가게 목록
│  │  ├─ menus.ts            # 메뉴 CRUD, 이미지 업로드, AI 메뉴 스캔
│  │  ├─ menu-categories.ts  # 메뉴 카테고리 CRUD, 순서 변경
│  │  ├─ ingredients.ts      # 식자재(재고) CRUD, 입고 기록
│  │  ├─ recipes.ts          # 레시피 (메뉴 ↔ 식자재 매핑)
│  │  ├─ orders.ts           # 주문 CRUD, SSE 실시간 스트림, 재고 즉시 차감
│  │  ├─ ocr.ts              # 거래명세서 OCR — CLOVA + Gemini 파이프라인
│  │  ├─ order-guide.ts      # AI 발주 가이드 생성·조회
│  │  ├─ closing.ts          # 마감 미리보기·확정·취소, 재고 보정값 기록
│  │  ├─ dashboard.ts        # 대시보드 통계, 12개월 매출 데이터
│  │  ├─ theme.ts            # 손님 주문 페이지 테마 (색상·레이아웃·배너)
│  │  └─ open.ts             # 영업 개점 처리, businessDate 생성
│  ├─ middleware/
│  │  └─ auth.ts             # JWT Bearer 토큰 검증 미들웨어
│  ├─ db/
│  │  ├─ schema.ts           # Drizzle 스키마 (18개 테이블 정의)
│  │  ├─ index.ts            # postgres 클라이언트 + Drizzle 인스턴스 초기화
│  │  ├─ migrations/         # Drizzle 마이그레이션 파일
│  │  └─ seed-*.ts           # 개발용 시드 스크립트
│  ├─ lib/
│  │  ├─ jwt.ts              # Access(15m) / Refresh(7d) 토큰 생성·검증 (jose)
│  │  ├─ sse.ts              # SSE 클라이언트 Map 관리 + 브로드캐스트
│  │  ├─ supabase.ts         # Supabase 클라이언트 (파일 스토리지용)
│  │  ├─ kst.ts              # KST 타임존 유틸 — businessDate 계산, 날짜 범위
│  │  └─ validator.ts        # Zod 스키마 검증 헬퍼
│  ├─ openapi/
│  │  └─ common.ts           # 공용 OpenAPI 응답 스키마
│  └─ types/
│     └─ index.ts            # Hono AppEnv 타입 (Variables: userId, storeId)
├─ drizzle.config.ts         # Drizzle Kit 설정 (schema, migrations 경로)
├─ nixpacks.toml             # Railway 빌드 설정
├─ railway.json              # Railway 배포 설정
└─ tsconfig.json             # TypeScript 컴파일 설정
```

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=DB%20스키마&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

Drizzle ORM으로 정의된 18개 테이블입니다. 스키마 파일: [`src/db/schema.ts`](src/db/schema.ts)

<br/>

<img src="https://raw.githubusercontent.com/from-knu-import-potato/.github/main/profile/assets/erd.png" alt="ERD" width="100%" />

| 테이블 | 설명 |
|---|---|
| `users` | 사장님 계정 — 카카오 OAuth(`kakao_id`) 또는 아이디/비밀번호(`username`, `password_hash`) 로그인 모두 지원 |
| `stores` | 가게 정보 — 업종, 카테고리, 초대 코드, 안전재고 비율, 테이블 수, 테마 설정 포함 |
| `store_members` | 사장님-가게 연결 — `owner` / `staff` 역할 구분, 멀티 스토어 지원 |
| `operating_hours` | 요일별(0=일~6=토) 영업 시간, 휴무일(`is_closed`) 설정 |
| `menu_categories` | 메뉴 카테고리 — `sort_order`로 순서 관리 |
| `menus` | 메뉴 — 카테고리 연결, 이미지, 판매 여부(`is_available`), 대표 메뉴(`is_featured`) |
| `ingredients` | 식자재(재고) — 단위(`g`/`ml`/`개` 고정), 현재 재고, 안전 재고, 즐겨찾기, 보관처리 |
| `recipes` | 메뉴별 레시피 — 메뉴 ↔ 식자재 매핑 + 소요량(`amount`) |
| `orders` | 주문 헤더 — 테이블 번호, 상태(`pending`/`preparing`/`completed`/`cancelled`), 총액 |
| `order_items` | 주문 상세 — 메뉴 연결, 수량, 단가 |
| `inbound_records` | OCR 입고 기록 헤더 — 공급사, 명세서 번호, 금액, 명세서 이미지 URL |
| `inbound_items` | 입고 상세 — 식자재 연결, 수량, 단가, 유통기한 |
| `store_opens` | 영업 개점 기록 — `business_date`를 별도 컬럼으로 관리 (심야 영업 지원) |
| `closings` | 마감 헤더 — 날짜, 당일 매출 합계 |
| `closing_deductions` | 마감 식자재 차감 상세 — 이론 차감량/실제 사용량/보정값/잔여 재고 기록 |
| `order_guides` | AI 발주 가이드 결과 헤더 — 생성 시각, 요약 |
| `order_guide_items` | 발주 가이드 식자재별 항목 — 권장 발주량, 긴급도(status), AI 추천 이유 |
| `ingredient_unit_conversions` | 식자재 단위 변환 계수 — 입고 단위(BOX·BTL)↔재고 단위(g·ml) 변환, `(ingredient_id, purchase_unit)` 고유 제약 |

<br/>

**Enum 타입**

| Enum | 값 |
|---|---|
| `order_status` | `pending` \| `preparing` \| `completed` \| `cancelled` |
| `unit` | `g` \| `ml` \| `개` |
| `member_role` | `owner` \| `staff` |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=API%20엔드포인트&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

Base URL: `/v1` · 전체 인터랙티브 문서: [Swagger UI](https://baro-backend-production-c908.up.railway.app/doc)

<details>
<summary><b>Auth — 인증</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/auth/kakao` | 카카오 OAuth 리다이렉트 (`?returnUrl=`) | ❌ |
| GET | `/auth/kakao/callback` | 카카오 콜백 처리 → JWT 발급 → 프론트엔드 리다이렉트 | ❌ |
| POST | `/auth/register` | 아이디/비밀번호 회원가입 (초대 코드 필요) | ❌ |
| POST | `/auth/login` | 아이디/비밀번호 로그인 | ❌ |
| POST | `/auth/refresh` | Access Token 갱신 (Refresh Token 필요) | ❌ |
| POST | `/auth/logout` | 로그아웃 | ❌ |

<br/>
</details>

<details>
<summary><b>Users — 계정</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/users/me` | 내 계정 정보 조회 | ✅ |
| PATCH | `/users/me` | 이름 변경 | ✅ |
| DELETE | `/users/me` | 회원 탈퇴 | ✅ |
| GET | `/users/me/stores` | 내가 속한 가게 목록 | ✅ |

<br/>
</details>

<details>
<summary><b>Stores — 가게</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| POST | `/stores/setup` | 가게 초기 세팅 (생성) | ✅ |
| POST | `/stores/join` | 초대 코드로 가게 합류 (Staff) | ✅ |
| GET | `/stores/:id` | 가게 정보 조회 (인증 선택 — 토큰 있으면 myRole 포함) | ❌ |
| PATCH | `/stores/:id` | 가게 기본 정보 수정 | ✅ |
| DELETE | `/stores/:id` | 가게 삭제 | ✅ |
| POST | `/stores/:id/invite-code` | 초대 코드 재발급 | ✅ |
| POST | `/stores/:id/reset` | 가게 데이터 초기화 | ✅ |
| PATCH | `/stores/:id/operating-hours` | 영업 시간 수정 | ✅ |
| GET | `/stores/:id/members` | 멤버 목록 조회 | ✅ |
| DELETE | `/stores/:id/members/:userId` | 멤버 강퇴 (Owner 전용) | ✅ |
| DELETE | `/stores/:id/members/me` | 가게 나가기 (Staff 전용) | ✅ |

<br/>
</details>

<details>
<summary><b>Open — 영업 개점</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| POST | `/stores/:id/open` | 영업 개점 — `businessDate` 생성 | ✅ |
| GET | `/stores/:id/open/status` | 오늘 개점 상태 조회 | ✅ |

<br/>
</details>

<details>
<summary><b>Orders — 주문</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| POST | `/stores/:id/orders` | 주문 생성 (손님, 인증 불필요) | ❌ |
| GET | `/stores/:id/orders` | 주문 목록 조회 | ✅ |
| PATCH | `/stores/:id/orders/:orderId/status` | 주문 상태 변경 — `preparing` 전환 시 재고 즉시 차감 | ✅ |
| GET | `/stores/:id/orders/stream` | SSE 실시간 주문 스트림 | ✅ |

<br/>
</details>

<details>
<summary><b>Menus — 메뉴</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/menus` | 메뉴 목록 | ✅ |
| POST | `/stores/:id/menus` | 메뉴 생성 | ✅ |
| PATCH | `/stores/:id/menus/:menuId` | 메뉴 수정 (대표 메뉴, 판매 여부 포함) | ✅ |
| DELETE | `/stores/:id/menus/:menuId` | 메뉴 삭제 | ✅ |
| POST | `/stores/:id/menus/upload` | 메뉴 이미지 업로드 (Supabase Storage) | ✅ |
| POST | `/stores/:id/menus/ocr-scan` | AI 메뉴판 스캔 (Gemini 멀티모달) | ✅ |

<br/>
</details>

<details>
<summary><b>Menu Categories — 메뉴 카테고리</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/menu-categories` | 카테고리 목록 | ✅ |
| POST | `/stores/:id/menu-categories` | 카테고리 생성 | ✅ |
| PATCH | `/stores/:id/menu-categories/:id` | 카테고리 이름 수정 | ✅ |
| PATCH | `/stores/:id/menu-categories/reorder` | 카테고리 순서 변경 | ✅ |
| DELETE | `/stores/:id/menu-categories/:id` | 카테고리 삭제 | ✅ |

<br/>
</details>

<details>
<summary><b>Ingredients — 식자재·재고</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/ingredients` | 재고 목록 | ✅ |
| POST | `/stores/:id/ingredients` | 식자재 등록 | ✅ |
| PATCH | `/stores/:id/ingredients/:id` | 식자재 수정 | ✅ |
| DELETE | `/stores/:id/ingredients/:id` | 식자재 삭제 | ✅ |
| POST | `/stores/:id/ingredients/inbound` | 입고 등록 (OCR 검수 확정 후 호출) | ✅ |

<br/>
</details>

<details>
<summary><b>Recipes — 레시피</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/recipes` | 레시피 목록 | ✅ |
| POST | `/stores/:id/recipes` | 레시피 생성 | ✅ |
| DELETE | `/stores/:id/recipes/:recipeId` | 레시피 삭제 | ✅ |

<br/>
</details>

<details>
<summary><b>Unit Conversions — 단위 변환</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/unit-conversions` | 단위 변환 계수 전체 조회 | ✅ |
| PUT | `/stores/:id/unit-conversions` | 단위 변환 계수 등록/수정 (Upsert) | ✅ |
| DELETE | `/stores/:id/unit-conversions/:id` | 단위 변환 계수 삭제 | ✅ |

<br/>
</details>

<details>
<summary><b>OCR — 거래명세서</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| POST | `/stores/:id/ocr/upload` | 거래명세서 이미지 업로드 → CLOVA OCR + Gemini 파싱 | ✅ |
| DELETE | `/stores/:id/ocr/invoice-image` | 거래명세서 이미지 삭제 (Supabase Storage) | ✅ |

<br/>
</details>

<details>
<summary><b>Order Guide — AI 발주 가이드</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/order-guide` | 가장 최근 발주 가이드 조회 | ✅ |
| POST | `/stores/:id/order-guide/generate` | 최신 재고·소비 데이터로 발주 가이드 생성 | ✅ |

<br/>
</details>

<details>
<summary><b>Closing — 마감</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/closing/preview` | 마감 전 이론 차감량 미리보기 | ✅ |
| GET | `/stores/:id/closing` | 마감 이력 목록 | ✅ |
| GET | `/stores/:id/closing/:closingId` | 마감 상세 (판매 메뉴별 수량, 재고 차감 결과) | ✅ |
| POST | `/stores/:id/closing` | 마감 확정 (실측 재고 입력 → 보정값 기록) | ✅ |
| DELETE | `/stores/:id/closing/:closingId` | 마감 취소 (보정값만 복원, 주문 차감분 유지) | ✅ |

<br/>
</details>

<details>
<summary><b>Theme — 가게 테마</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/theme` | 손님 주문 페이지 테마 조회 | ✅ |
| PATCH | `/stores/:id/theme` | 테마 색상·레이아웃 수정 | ✅ |
| POST | `/stores/:id/theme/banner` | 배너 이미지 업로드 | ✅ |

<br/>
</details>

<details>
<summary><b>Dashboard — 대시보드</b></summary>
<br/>

| 메서드 | 경로 | 설명 | 인증 |
|---|---|---|---|
| GET | `/stores/:id/dashboard/stats` | 오늘 매출·주문 수·재고 현황 요약 | ✅ |
| GET | `/stores/:id/dashboard/sales` | 최근 12개월 월별 매출 데이터 | ✅ |

<br/>
</details>

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=인증%20흐름&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

**카카오 OAuth 2.0 흐름**

```
1. 프론트 → GET /auth/kakao?returnUrl=... → 카카오 로그인 페이지 리다이렉트
2. 카카오 → GET /auth/kakao/callback?code=...&state=...
3. 서버: 카카오 토큰 교환 → 사용자 정보 조회 → DB upsert (신규/기존 구분)
4. 서버: Access Token (15분) + Refresh Token (7일) 발급 (jose, HS256)
5. 서버: 프론트엔드 /auth/callback 으로 토큰 파라미터와 함께 리다이렉트
6. 프론트: Authorization: Bearer {accessToken} 헤더로 API 호출
7. 만료 시: POST /auth/refresh → 새 Access Token 발급
```

**아이디/비밀번호 로그인 흐름**

```
1. POST /auth/register (초대 코드 + username + password + name)
   → bcrypt(10 rounds) 해시 저장 → JWT 발급
2. POST /auth/login (username + password)
   → bcrypt 검증 → JWT 발급
```

**JWT 미들웨어**

모든 `/v1` 라우트에 JWT 검증 적용. 손님 주문(`POST /stores/:id/orders`)만 인증 제외.

```typescript
// Bearer 토큰 검증 후 Hono Context에 userId 주입
c.set('userId', payload.userId)
```

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=핵심%20기능%20플로우&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

<details>
<summary><b>실시간 주문 (SSE)</b></summary>
<br/>

인메모리 `Map<storeId, Set<SseClient>>`로 가게별 SSE 연결을 관리합니다. 새 주문 생성 또는 상태 변경 시 해당 가게의 모든 연결된 클라이언트에 브로드캐스트합니다.

```
손님: POST /stores/:id/orders
  → DB 저장 + 재고 경고 계산
  → SSE broadcast(storeId, 'new-order', { order, stockWarnings })
  → 사장님 화면: 실시간 주문 알림

사장님: PATCH /stores/:id/orders/:orderId/status → 'preparing'
  → adjustStockForOrder(orderId, sign=1) — 레시피 기반 재고 즉시 차감
  → SSE broadcast(storeId, 'order-status-changed', ...)

취소 시: status → 'cancelled'
  → adjustStockForOrder(orderId, sign=-1) — 차감분 즉시 복원
```

이벤트 타입: `new-order` | `order-status-changed`

> 브라우저 내장 `EventSource`는 Authorization 헤더를 지원하지 않아, 프론트엔드는 `fetch()` + `ReadableStream`으로 커스텀 SSE 파서를 구현합니다.

<br/>
</details>

<details>
<summary><b>OCR 입고 처리 파이프라인</b></summary>
<br/>

```
사장님: POST /stores/:id/ocr/upload (이미지 파일)
  1. 이미지 → base64 변환
  2. Naver CLOVA OCR → 원시 텍스트 추출 (fields 배열)
  3. Google Gemini 2.5 Flash 구조화 파싱
     - temperature=0 (일관된 출력)
     - 식자재 목록 참고 제공 (ID 매핑용, 이름 교정 금지)
     - isInvoice / metadata / items 구조 반환
  4. isInvoice=false → 422 NOT_INVOICE 에러 즉시 반환
  5. 서버사이드 검증:
     - 수량 0 이하, 음수 금액, 단가×수량 3% 초과 오차
     - 공급가액 + 부가세 = 총액 메타데이터 검증
  6. Supabase Storage (invoice-images 버킷) 이미지 저장
  7. 식자재 이름 매핑 (storeIngredients 대조)
  8. 파싱 결과 반환 (items, metadata, imageUrl, warnings)

프론트엔드: 비표준 단위(BOX·BTL) spec 파싱 → 변환 계수 계산
사장님: 검수 화면에서 품목·수량·단가·매핑 확인 후 확정
  → POST /stores/:id/ingredients/inbound → currentStock 업데이트
```

**OCR 금지 사항**: OCR 결과 자동 확정 금지. 반드시 사용자 검수 후 `/inbound` 호출.

<br/>
</details>

<details>
<summary><b>AI 발주 가이드 생성</b></summary>
<br/>

```
POST /stores/:id/order-guide/generate
  1. 6가지 트리거로 발주 필요 식자재 필터링:
     - 안전재고 미달 (currentStock < safetyStock)
     - 유통기한 5일 이내 임박
     - 14일 평균 소비 기준 3일 내 소진 예상
     - 선제 발주: 현재 안전 수준이나 7일 내 미달 예상
     - 소비 가속: 최근 3일 평균이 14일 평균 대비 50% 이상 급증
     - 재발주 주기 초과: 마지막 입고 후 평균 주기의 1.2배 초과
  2. 식자재별 컨텍스트 블록 구성:
     - 14일·3일 소비 평균, 예상 소진일, 유통기한, 연관 메뉴
  3. 매장 전체 패턴 수집:
     - 최근 7일 일평균 매출, 요일별 매출 패턴(8주), 내일 요일 예측
  4. Gemini 2.5 Flash 호출 (temperature=0.3)
     → ingredientId + recommendedOrderAmount + reason 반환
  5. 서버사이드 긴급도 계산: critical / warning / expiry / recommend
  6. purchaseConversions 역산 → BOX·BTL 단위 발주 수량 변환
  7. DB 저장 + 결과 반환

  AI 파싱 실패 시: 룰 기반 폴백 자동 실행
```

| status | 의미 | recommendedOrderAmount |
|---|---|---|
| `critical` | 안전재고 50% 미만 — 즉시 발주 | > 0 |
| `warning` | 안전재고 미달 — 발주 필요 | > 0 |
| `expiry` | 유통기한 임박 + 재발주 필요 | > 0 |
| `recommend` | 유통기한 임박이나 발주 불필요 (소진 후 재발주 권장) | = 0 |

<br/>
</details>

<details>
<summary><b>마감 플로우 (하이브리드 재고 차감)</b></summary>
<br/>

```
영업 중:
  주문 수락(preparing) → adjustStockForOrder(sign=1) — 레시피 기반 즉시 차감
  주문 취소 → adjustStockForOrder(sign=-1) — 즉시 복원

마감 미리보기 (GET /closing/preview):
  preparing + completed 주문 × 레시피 → orderDeductedAmount 합산
  openingStock = currentStock + orderDeductedAmount (영업 시작 재고 역산)
  → {openingStock, orderDeductedAmount, isNegative} 반환

마감 확정 (POST /closing):
  사장님이 식자재별 실제 잔여 재고(remainingStock) 직접 입력
  actualUsage = openingStock - remainingStock
  adjustmentAmount = actualUsage - orderDeductedAmount  ← 이론·실제 괴리값
  currentStock = remainingStock 저장 + closingDeductions 기록

마감 취소 (DELETE /closing/:closingId):
  currentStock += adjustmentAmount  ← 보정값만 복원 (주문 차감분 유지)
```

> **소급 마감 지원**: 당일 또는 전일 마감만 허용 (`isValidClosingDate()`), 2일 이상 소급 불가.

<br/>
</details>

<details>
<summary><b>businessDate 설계 (심야 영업 지원)</b></summary>
<br/>

단순 `new Date()`로 날짜를 판단하면 자정 이후 주문이 다음 날로 분류됩니다. BARO는 개점(`POST /open`) 시 `businessDate`를 별도 컬럼으로 기록하여, 마감 전까지의 모든 트랜잭션을 해당 날짜에 귀속시킵니다.

```typescript
// lib/kst.ts
// openTime(HH:mm) 기준으로 businessDate 계산
// 현재 KST 시각 < openTime → 어제 날짜 반환 (자정 영업 지원)
export function getBusinessDateStr(openTime: string | null): string
```

<br/>
</details>

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=응답%20형식&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

모든 API는 아래 형식으로 응답합니다.

```json
// 성공
{ "success": true, "data": { ... } }

// 실패
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "인증이 필요합니다." } }
```

| 에러 코드 | HTTP | 의미 |
|---|---|---|
| `BAD_REQUEST` | 400 | 요청 형식 또는 값 오류 |
| `UNAUTHORIZED` | 401 | 인증 필요 또는 토큰 만료 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `CONFLICT` | 409 | 중복 데이터 |
| `KAKAO_AUTH_FAILED` | 400 | 카카오 인증 실패 |
| `NOT_INVOICE` | 422 | OCR 이미지가 거래명세서가 아님 |

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=개발%20컨벤션&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

**네이밍**

| 대상 | 규칙 | 예시 |
|---|---|---|
| 파일 | kebab-case | `auth.ts`, `order-guide.ts`, `menu-categories.ts` |
| 함수 | 동사 + camelCase | `createOrder`, `adjustStockForOrder` |
| DB 컬럼 | snake_case | `created_at`, `store_id` |
| 상수 | UPPER_SNAKE_CASE | `KST_OFFSET_MS` |
| 라우터 변수 | camelCase + `Router` 접미사 | `ordersRouter`, `closingRouter` |

**금지 사항**

- `any` 타입 사용 금지
- `console.log` 프로덕션 코드 잔류 금지
- API 키·민감 정보 하드코딩 금지
- OCR 결과 자동 확정 금지 (반드시 `/inbound` 명시적 호출)
- 마감 자동 재고 차감 금지 (`POST /closing` 명시적 호출만 허용)

**브랜치·커밋 컨벤션**

```
브랜치: 작업유형/이슈번호-작업이름
  예) feature/15-menu-ocr-scan

커밋: [gitmoji] [태그]: [제목]
  ✨ feat     새 기능
  🐛 fix      버그 수정
  ♻️ refactor  리팩토링
  🗃️ db        DB 스키마·마이그레이션
  🔧 chore     설정·빌드
  📝 docs      문서
```

**작업 규칙**

- 모든 작업은 작업 브랜치 생성 후 진행
- 작업 시작 전 GitHub 이슈 먼저 생성 (`.github/ISSUE_TEMPLATE/` 템플릿 사용)
- PR 생성 시 `.github/PULL_REQUEST_TEMPLATE.md` 사용

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<img src="https://capsule-render.vercel.app/api?type=rect&color=449CD4&height=45&text=배포%20규칙&fontSize=18&fontColor=ffffff&fontAlign=50&fontAlignY=50" width="100%" />

**버전 관리**: Semantic Versioning (`Major.Minor.Patch`)

**배포 흐름**

```
develop → release/vX.Y.Z → main
```

1. 배포 이슈 생성 (`.github/ISSUE_TEMPLATE/deploy.md` 템플릿)
2. `develop`에서 `release/vX.Y.Z` 브랜치 생성
3. PR 생성: `release/vX.Y.Z` → `main`
   - PR 제목 형식: `🚀 (#배포이슈번호) deploy: 배포 버전과 배포 제목`
4. `main` 머지 후 GitHub Release 및 태그(`vX.Y.Z`) 생성

Railway는 `main` 브랜치 푸시 시 Nixpacks로 자동 빌드·배포합니다.
