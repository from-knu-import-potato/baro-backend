# baro-backend

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
  <a href="https://github.com/from-knu-import-potato/baro-frontend">
    <img src="https://img.shields.io/badge/🖥️ 프론트엔드 레포-Click-E8A838?style=flat-square" />
  </a>
</div>

<br/>

**BARO(바로)** 는 소규모 카페·식당 사장님을 위한 OCR·AI 기반 통합 가게 운영 SaaS입니다. QR 주문부터 재고 관리, AI 발주 가이드, 마감 정산까지 하나의 플랫폼에서 처리할 수 있습니다. 이 레포지토리는 BARO의 백엔드 API 서버입니다.

<br/>

## 기술 스택

<img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" /> <img src="https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white" /> <img src="https://img.shields.io/badge/Drizzle ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black" /> <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white" /> <img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" />

<br/>

## 시작하기 (Getting Started)

#### 1. 프로젝트 복제 및 의존성 설치

##### 1-1. 레포지토리 클론

```
git clone https://github.com/from-knu-import-potato/baro-backend.git
```

##### 1-2. 프로젝트 폴더로 이동

```
cd baro-backend
```

##### 1-3. 의존성 설치 (pnpm이 설치되어 있어야 합니다)

```
pnpm install
```

<br/>

#### 2. 환경변수 설정

`.env.example`을 복사해 `.env` 파일을 생성하고 값을 채웁니다.

```
cp .env.example .env
```

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 |
| `JWT_SECRET` | Access Token 서명 시크릿 |
| `JWT_REFRESH_SECRET` | Refresh Token 서명 시크릿 |
| `KAKAO_CLIENT_ID` | 카카오 앱 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 카카오 앱 시크릿 |
| `KAKAO_REDIRECT_URI` | 카카오 OAuth 콜백 URI |
| `GEMINI_API_KEY` | Gemini API 키 (발주 가이드 AI) |
| `CLOVA_OCR_API_URL` | CLOVA OCR API URL |
| `CLOVA_OCR_SECRET_KEY` | CLOVA OCR 시크릿 키 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role 키 |
| `FRONTEND_URL` | 프론트엔드 URL (CORS 허용) |
| `REGISTER_CODE` | 로컬 회원가입 초대 코드 (데모용) |
| `PORT` | 서버 포트 (기본값: 3000) |

<br/>

#### 3. 개발 서버 실행

```
pnpm dev
```

서버가 실행되면 [http://localhost:3000](http://localhost:3000) 에서 확인할 수 있습니다.
