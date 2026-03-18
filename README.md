# ADA Auth — Apple Developer Academy @ POSTECH 인증 서버

ADA(Apple Developer Academy @ POSTECH) 커뮤니티를 위한 중앙 인증 서버 및 SDK입니다. Apple Sign-In과 매직 링크(이메일) 인증을 지원하며, 서브도메인 간 SSO를 제공합니다.

## 주요 기능

- **Apple Sign-In** — OAuth 2.0 기반 Apple 로그인
- **매직 링크** — `@pos.idserve.net` 이메일로 비밀번호 없이 로그인
- **서브도메인 SSO** — `*.ada-kr-pos.com` 전체에서 세션 쿠키 공유
- **프로필 관리** — 사진 업로드, 닉네임, SNS 링크 등 프로필 편집
- **이메일 인증** — `@pos.idserve.net` 인증으로 Academy 멤버 확인
- **개발자 포털** — API 키 발급 및 앱 관리
- **Auth SDK** — Hono, Express, Cloudflare Workers 등 다양한 환경 지원

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| **프레임워크** | [React Router v7](https://reactrouter.com/) (SSR) |
| **런타임** | [Cloudflare Workers](https://workers.cloudflare.com/) / Pages |
| **데이터베이스** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| **세션 저장소** | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| **파일 저장소** | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **빌드** | [Vite](https://vite.dev/) |
| **이메일** | [Resend](https://resend.com/) |
| **테스트** | [Vitest](https://vitest.dev/) |
| **린터/포매터** | [Biome](https://biomejs.dev/) |
| **패키지 매니저** | [pnpm](https://pnpm.io/) (workspace) |
| **Node.js** | v20 |

---

## 프로젝트 구조

```
ada-kr-pos/
├── apps/
│   └── auth/                     # 인증 서버 (React Router + Cloudflare Workers)
│       ├── app/
│       │   ├── db/               # Drizzle ORM 스키마 및 DB 연결
│       │   ├── lib/              # 서버 로직 (세션, 인증, 이메일, 로깅 등)
│       │   ├── middleware/       # 인증/CSRF 미들웨어
│       │   ├── routes/           # 페이지 및 API 라우트
│       │   ├── styles/           # CSS
│       │   ├── types/            # TypeScript 타입 정의
│       │   └── __tests__/        # 테스트
│       ├── migrations/           # D1 마이그레이션 SQL
│       ├── public/               # 정적 파일
│       └── scripts/              # 유틸리티 스크립트
├── packages/
│   └── auth-sdk/                 # @adakrpos/auth SDK 패키지
│       └── src/
│           ├── client.ts         # 코어 클라이언트
│           ├── hono.ts           # Hono 미들웨어
│           ├── express.ts        # Express 미들웨어
│           ├── generic.ts        # Web Standard (Workers, Deno, Bun)
│           ├── cache.ts          # API 키 캐시
│           └── types.ts          # 공유 타입
├── docs/                         # 문서
│   ├── apple-setup.md            # Apple Sign-In 설정 가이드
│   ├── callback-url.md           # callbackUrl 리다이렉트 가이드
│   └── remaining-work.md         # 프로덕션 배포 체크리스트
├── biome.json                    # Biome 린터/포매터 설정
├── tsconfig.json                 # 루트 TypeScript 설정
├── vitest.workspace.ts           # Vitest 워크스페이스 설정
└── pnpm-workspace.yaml           # pnpm 워크스페이스 설정
```

---

## 시작하기

### 사전 요구사항

- Node.js v20+
- pnpm v9+
- Cloudflare 계정 (Workers, D1, KV, R2)
- Apple Developer Program 계정 ($99/년)
- Resend 계정 (이메일 발송)

### 설치

```bash
git clone https://github.com/<org>/ada-kr-pos.git
cd ada-kr-pos
pnpm install
```

### 로컬 환경 변수 설정

`apps/auth/.dev.vars` 파일을 생성하고 아래 값을 입력합니다:

```env
APPLE_CLIENT_ID=tech.adakrpos.auth.service
APPLE_TEAM_ID=<your-team-id>
APPLE_KEY_ID=<your-key-id>
APPLE_PRIVATE_KEY=<.p8-파일-전체-내용>
RESEND_API_KEY=<your-resend-api-key>
AUTH_SECRET=<openssl-rand-base64-32-결과>
```

> `AUTH_SECRET`은 `openssl rand -base64 32`로 생성합니다.

### 개발 서버 실행

```bash
pnpm dev
```

`http://localhost:5173`에서 개발 서버가 시작됩니다.

> **참고**: Apple OAuth는 HTTPS와 등록된 도메인이 필요하므로 localhost에서 Apple Sign-In 테스트가 제한됩니다. [ngrok](https://ngrok.com/)을 사용하거나 프로덕션 환경에서 테스트하세요. 자세한 내용은 [`docs/apple-setup.md`](docs/apple-setup.md)를 참고하세요.

---

## 명령어

프로젝트 루트에서 실행합니다:

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | 개발 서버 실행 (auth 앱) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm test` | 전체 테스트 실행 (auth + SDK) |
| `pnpm typecheck` | TypeScript 타입 검사 |
| `pnpm lint` | Biome 린트 검사 |
| `pnpm deploy` | Cloudflare Pages 배포 |

---

## 인증 흐름

### Apple Sign-In

```
사용자 → /login (Apple 버튼 클릭)
      → Apple 인증 화면 (appleid.apple.com)
      → Apple callback (POST /api/auth/apple/callback)
      → ID 토큰 검증 + 사용자 생성/조회
      → 세션 생성 (KV) + 쿠키 설정
      → /mypage (또는 callbackUrl)
```

### 매직 링크

```
사용자 → /login (이메일 입력, @pos.idserve.net만 허용)
      → POST /api/auth/magic/send (토큰 생성 + 이메일 발송)
      → 이메일의 링크 클릭
      → GET /api/auth/magic/verify?token=... (토큰 검증)
      → 사용자 생성/조회 + 이메일 자동 인증
      → 세션 생성 (KV) + 쿠키 설정
      → /mypage (또는 callbackUrl)
```

### 서브도메인 SSO

세션 쿠키가 `.ada-kr-pos.com` 도메인으로 설정되어 모든 서브도메인에서 공유됩니다.

```
divelog.ada-kr-pos.com (미인증)
  → ada-kr-pos.com/login?callbackUrl=https://divelog.ada-kr-pos.com/write
  → 로그인 완료
  → divelog.ada-kr-pos.com/write 로 리다이렉트 (세션 쿠키 공유)
```

`callbackUrl`은 `https://` 프로토콜의 `*.ada-kr-pos.com` 도메인만 허용됩니다 (Open Redirect 방지). 자세한 내용은 [`docs/callback-url.md`](docs/callback-url.md)를 참고하세요.

---

## API 라우트

### 페이지

| 경로 | 설명 |
|------|------|
| `/` | 랜딩 페이지 |
| `/login` | 로그인 (Apple + 매직 링크) |
| `/mypage` | 프로필 관리 (인증 필요) |
| `/developer` | 개발자 포털 — API 키/앱 관리 (인증 필요) |

### 인증 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/auth/apple` | Apple OAuth 시작 |
| POST | `/api/auth/apple/callback` | Apple OAuth 콜백 |
| POST | `/api/auth/magic/send` | 매직 링크 이메일 발송 |
| GET | `/api/auth/magic/verify` | 매직 링크 토큰 검증 |
| GET/POST | `/api/auth/logout` | 로그아웃 |
| POST | `/api/auth/unlink-apple` | Apple 계정 연결 해제 |

### 사용자 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/PATCH | `/api/me` | 내 프로필 조회/수정 |
| POST | `/api/me/photo` | 프로필 사진 업로드 |
| POST | `/api/verify/send` | 이메일 인증 코드 발송 |
| POST | `/api/verify/confirm` | 이메일 인증 코드 확인 |
| GET | `/api/photos/*` | 프로필 사진 프록시 |

### 개발자 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/POST | `/api/developer/apps` | 앱 목록 조회/생성 |
| GET/PATCH/DELETE | `/api/developer/apps/:id` | 앱 상세/수정/삭제 |

### SDK API (API 키 인증)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/sdk/verify-session` | 세션 검증 |
| GET | `/api/sdk/verify-key` | API 키 검증 |
| GET | `/api/sdk/users/:id` | 사용자 조회 |

### 기타

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스 체크 |

---

## 데이터베이스 스키마

Drizzle ORM으로 관리되며, Cloudflare D1 (SQLite)을 사용합니다.

### `users`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT (PK) | 사용자 ID |
| `apple_sub` | TEXT | Apple 사용자 식별자 |
| `apple_email` | TEXT | Apple 이메일 |
| `verified_email` | TEXT | 인증된 `@pos.idserve.net` 이메일 |
| `nickname` | TEXT | 닉네임 |
| `name` | TEXT | 이름 |
| `profile_photo_url` | TEXT | 프로필 사진 URL |
| `bio` | TEXT | 자기소개 |
| `contact` | TEXT | 연락처 |
| `sns_links` | TEXT | SNS 링크 (JSON) |
| `cohort` | TEXT | 기수 (예: `cohort-2026`) |
| `is_verified` | INTEGER | `@pos.idserve.net` 인증 여부 |
| `created_at` | INTEGER | 생성 시각 (timestamp) |
| `updated_at` | INTEGER | 수정 시각 (timestamp) |

### `developer_apps`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT (PK) | 앱 ID (UUID) |
| `user_id` | TEXT (FK) | 소유자 사용자 ID |
| `name` | TEXT | 앱 이름 |
| `description` | TEXT | 앱 설명 |
| `api_key_hash` | TEXT | API 키 SHA-256 해시 |
| `api_key_prefix` | TEXT | API 키 앞 8자 (표시용) |
| `redirect_urls` | TEXT | 허용된 리다이렉트 URL (JSON) |
| `is_active` | INTEGER | 활성 여부 |
| `created_at` | INTEGER | 생성 시각 |
| `updated_at` | INTEGER | 수정 시각 |

### 마이그레이션

```bash
cd apps/auth

# 마이그레이션 생성
npx drizzle-kit generate

# 마이그레이션 적용 (프로덕션)
wrangler d1 migrations apply ada-kr-pos-auth-db
```

---

## Auth SDK (`@adakrpos/auth`)

서브도메인 앱에서 인증을 연동하기 위한 SDK입니다. Hono, Express, Cloudflare Workers 등 다양한 환경을 지원합니다.

### 설치

```bash
pnpm add @adakrpos/auth
```

### Hono

```typescript
import { adakrposAuth, getAuth, requireAuth } from '@adakrpos/auth/hono';

// 선택적 인증 — 직접 확인
app.use('*', adakrposAuth({ apiKey: env.ADAKRPOS_API_KEY }));

app.get('/profile', async (c) => {
  const auth = await getAuth(c);
  if (!auth.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: auth.user });
});

// 필수 인증 — 미인증 시 자동 401
app.get('/dashboard', requireAuth({ apiKey: env.ADAKRPOS_API_KEY }), (c) => {
  return c.json({ message: 'Welcome!' });
});
```

### Express

```typescript
import { adakrposAuthExpress, requireAuthExpress } from '@adakrpos/auth/express';

app.use(adakrposAuthExpress({ apiKey: process.env.ADAKRPOS_API_KEY! }));

app.get('/profile', async (req, res) => {
  const auth = await req.auth?.();
  if (!auth?.isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: auth.user });
});
```

### Generic (Web Standard)

Cloudflare Workers, Deno, Bun 등에서 사용:

```typescript
import { verifyRequest } from '@adakrpos/auth/generic';

export default {
  async fetch(request: Request, env: Env) {
    const auth = await verifyRequest(request, { apiKey: env.ADAKRPOS_API_KEY });
    if (!auth.isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return new Response(JSON.stringify({ user: auth.user }));
  }
};
```

> SDK에 대한 자세한 문서는 [`packages/auth-sdk/README.md`](packages/auth-sdk/README.md)를 참고하세요.

---

## Cloudflare 인프라

### 바인딩

| 바인딩 | 타입 | 용도 |
|--------|------|------|
| `DB` | D1 | 사용자/앱 데이터 |
| `SESSIONS` | KV | 세션 저장 (TTL 7일, 50% 경과 시 자동 갱신) |
| `EMAIL_TOKENS` | KV | 이메일 인증 토큰 |
| `MAGIC_TOKENS` | KV | 매직 링크 토큰 (TTL 15분) |
| `RATE_LIMITS` | KV | API 키별 레이트 리밋 (100req/min) |
| `PROFILE_PHOTOS` | R2 | 프로필 사진 파일 저장 |

### 시크릿

| 이름 | 설명 |
|------|------|
| `APPLE_CLIENT_ID` | Apple Services ID |
| `APPLE_TEAM_ID` | Apple Team ID |
| `APPLE_KEY_ID` | Apple Key ID |
| `APPLE_PRIVATE_KEY` | Apple `.p8` 키 전체 내용 |
| `RESEND_API_KEY` | Resend API 키 |
| `AUTH_SECRET` | 세션 서명 비밀 키 |

시크릿 일괄 등록:

```bash
cd apps/auth
bash scripts/setup-secrets.sh
```

---

## 보안

- **세션**: KV 기반, 7일 TTL, 50% 경과 시 자동 갱신 (sliding expiration)
- **API 키**: SHA-256 해시 저장, 평문 미보관
- **레이트 리밋**: API 키당 100 requests/minute
- **CSRF 보호**: 상태 변경 요청에 대한 CSRF 검증
- **callbackUrl 검증**: `https://` + `*.ada-kr-pos.com` 화이트리스트 (Open Redirect 방지)
- **로깅 마스킹**: API 키, 세션 ID, 이메일, 시크릿은 자동 마스킹 처리
- **매직 링크 도메인 제한**: `@pos.idserve.net` 이메일만 허용

---

## 배포

### 수동 배포

```bash
# 빌드
pnpm build

# Cloudflare Pages 배포
pnpm deploy
```

### 프로덕션 배포 체크리스트

프로덕션 환경을 처음 구성하는 경우 [`docs/remaining-work.md`](docs/remaining-work.md)의 단계별 가이드를 따르세요:

1. Cloudflare 리소스 생성 (D1, KV ×4, R2)
2. `wrangler.toml` ID 교체
3. D1 마이그레이션 실행
4. Apple Developer Console 설정
5. Resend 계정 + 도메인 인증
6. Wrangler 시크릿 등록 (6개)
7. 도메인 DNS 설정
8. 빌드 및 배포
9. 배포 후 확인

---

## 테스트

```bash
# 전체 테스트
pnpm test

# 특정 패키지 테스트
pnpm --filter auth test          # 인증 서버
pnpm --filter @adakrpos/auth test  # SDK

# watch 모드
pnpm --filter auth test:watch
```

---

## 문서

| 문서 | 설명 |
|------|------|
| [`docs/apple-setup.md`](docs/apple-setup.md) | Apple Sign-In 설정 (step-by-step) |
| [`docs/callback-url.md`](docs/callback-url.md) | callbackUrl 리다이렉트 가이드 |
| [`docs/remaining-work.md`](docs/remaining-work.md) | 프로덕션 배포 체크리스트 |
| [`packages/auth-sdk/README.md`](packages/auth-sdk/README.md) | Auth SDK 상세 문서 |

---

## 라이선스

Private — Apple Developer Academy @ POSTECH 내부 사용
