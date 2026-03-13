# ADA Auth Server — Apple Developer Academy 인증 서버 + SSO

## TL;DR

> **Quick Summary**: Apple Developer Academy 구성원을 위한 중앙 인증 서버를 Cloudflare에 구축한다. **Apple Sign-In + @pos.idserve.net 매직링크** 두 가지 로그인 수단을 제공하고, *.adapos.tech 전체에서 SSO 세션을 공유한다. 매직링크 로그인 시 구성원 인증이 자동 완료된다. 개발자가 쉽게 연동할 수 있도록 npm SDK + HTTP API를 제공하되, API 키가 필수다.
>
> **Deliverables**:
> - adapos.tech 인증 서버 (**Remix / React Router v7** on CF Pages) — 로그인, 마이페이지, 개발자 포털 UI + Auth API
> - @adapos/auth npm SDK 패키지 — Hono/Express 미들웨어 + HTTP 클라이언트
> - D1 스키마 (유저, 개발자 앱) + KV 세션/매직링크 토큰 스토어
> - Apple Sign in with Apple 설정 가이드 문서
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 6 waves
> **Critical Path**: Scaffold → D1 Schema → Session → Apple Sign-In + Magic Link → Login Page → SDK → E2E

---

## Context

### Original Request
Apple Developer Academy 구성원이 구성원에게 필요한 서비스를 만들때 Auth로 사용할 인증서버. adapos.tech에서 Apple 로그인, 마이페이지 프로필 관리, pos.idserve.net 이메일 인증, *.adapos.tech SSO, 개발자 API 키 시스템.

### Interview Summary
**Key Discussions**:
- **Framework**: 유저가 Remix 요청 → 초기에 Hono 제안했으나, UI 페이지(프로필, 대시보드, 폼 처리)에 Hono JSX의 한계 인정 → **Remix (React Router v7) on CF Pages**로 최종 결정. SSR + progressive enhancement + action/loader 패턴이 폼 중심 UI에 최적.
- **로그인 수단**: **2가지** — Apple Sign-In + @pos.idserve.net 매직링크. 매직링크로 로그인 시 구성원 인증(is_verified) 자동 완료.
- **DB**: KV(세션, 매직링크 토큰) + D1(유저 프로필, 개발자 앱) 하이브리드
- **SDK**: npm 패키지(@adapos/auth) + HTTP API 둘 다 제공. API 키 필수.
- **개발자 등록**: 셀프서비스 — pos.idserve.net 이메일 인증 완료된 구성원이면 앱 등록 + API 키 자동 발급
- **이메일**: Resend (CF Workers 공식 지원)
- **프로필 필드**: 확장 (닉네임, 이름, 프로필 사진, 소개글, 연락처, SNS 링크)
- **Apple**: Developer 계정은 있지만 Sign in with Apple 웹 설정 미완 → 가이드 포함
- **DNS**: Cloudflare DNS 사용 중 → 바로 배포 가능
- **테스트**: TDD 방식
- **계정 연결**: Apple 로그인 유저가 나중에 매직링크 사용 (또는 반대) → pos.idserve.net 이메일을 키로 계정 자동 연결

**Research Findings**:
- Apple Sign-In: email/name은 첫 로그인에만 제공됨 → 첫 로그인 시 반드시 저장
- `jose` 라이브러리 사용 필수 (CF Workers 호환). `jsonwebtoken`은 Node.js crypto 의존으로 사용 불가
- Apple client_secret JWT는 최대 6개월 수명 → 생성 유틸리티 + 로테이션 전략 필요
- .p8 키 파일은 1회만 다운로드 가능 → wrangler secret에 저장
- 세션 sliding window: 50% TTL 지나면 자동 연장 (Lucia 패턴)
- CSRF: Origin 헤더 검증 필수 (cookie-based auth이므로)
- SDK: auth를 lazy function으로 노출 (Clerk 패턴), API key 검증은 in-memory Map 30s TTL 캐싱

### Metis Review
**Identified Gaps** (addressed):
- Apple client_secret 6개월 만료 → 생성 유틸리티 + 로테이션 문서화
- CSRF 보호 누락 → Origin 헤더 검증 미들웨어 추가
- 세션 sliding window 미고려 → 50% TTL 자동 연장 구현
- SDK 인증 패턴 미정 → lazy function 패턴 적용 (Clerk 참고)
- API key 캐싱 미고려 → in-memory Map 30s TTL
- jose vs jsonwebtoken 미결정 → jose 선택 (Workers 호환)
- 프로필 사진 저장소 미정 → Cloudflare R2 사용
- 매직링크 로그인 미고려 → @pos.idserve.net 전용 매직링크 추가 (로그인 + 인증 동시)
- 계정 연결 미고려 → pos.idserve.net 이메일 기반 자동 연결

---

## Work Objectives

### Core Objective
Apple Developer Academy 구성원 전용 인증 서버를 구축하여, *.adapos.tech 서브도메인 서비스들이 SSO로 통합 인증을 사용할 수 있게 한다.

### Concrete Deliverables
- `apps/auth/` — **Remix (React Router v7)** 기반 인증 서버 (CF Pages 배포)
  - `/login` — 로그인 페이지 (Apple Sign-In 버튼 + 매직링크 이메일 입력)
  - `/mypage` — 프로필 편집 페이지
  - `/developer` — 개발자 포털 (앱 등록, API 키 관리)
  - `/api/auth/apple` + `/api/auth/apple/callback` — Apple OAuth 플로우
  - `/api/auth/magic/send` + `/api/auth/magic/verify` — 매직링크 플로우
  - `/api/me` — 유저 정보 API
  - `/api/developer/*` — 개발자 API
  - `/api/sdk/*` — SDK용 세션 검증 API
- `packages/auth-sdk/` — @adapos/auth npm 패키지
  - Hono 미들웨어 (`adaposAuth()`)
  - Express 미들웨어 (`adaposAuthExpress()`)
  - HTTP 클라이언트 (`AdaposAuthClient`)
  - TypeScript 타입 전체 export
- D1 데이터베이스 스키마 + 마이그레이션
- KV 네임스페이스 (sessions, magic-link-tokens, email-verification-tokens)
- R2 버킷 (profile-photos)
- Apple Sign in with Apple 설정 가이드 (`docs/apple-setup.md`)

### Definition of Done
- [ ] `pnpm dev` → 로컬 서버 기동 (miniflare)
- [ ] Apple Sign-In → 세션 생성 → 쿠키 설정 (Domain=.adapos.tech)
- [ ] pos.idserve.net 이메일 인증 메일 발송 → 인증 완료
- [ ] 마이페이지에서 프로필 편집 + 사진 업로드 → 저장
- [ ] 개발자 포털에서 앱 등록 → API 키 발급
- [ ] SDK: `adaposAuth({ apiKey })` 미들웨어 → 인증된 유저 정보 반환
- [ ] `pnpm test` → 전체 테스트 PASS
- [ ] `pnpm deploy` → CF Workers 배포 성공

### Must Have
- **로그인 수단 2가지**: Apple Sign-In + @pos.idserve.net 매직링크
- 매직링크 로그인 시 자동으로 is_verified = true (구성원 인증 동시 완료)
- Apple Sign-In 유저는 별도 pos.idserve.net 이메일 인증 필요
- **계정 연결**: 동일 pos.idserve.net 이메일로 Apple + 매직링크 사용 시 같은 계정으로 연결
- *.adapos.tech 전체 SSO (domain-scoped cookie)
- API 키 없이는 SDK/API 사용 불가
- 모든 비-GET 요청에 CSRF 보호 (Origin 헤더 검증)
- 세션 sliding window (50% TTL 지나면 자동 연장)
- `jose` 라이브러리로 JWT 처리 (Workers 호환)
- TDD — 핵심 로직에 테스트 우선

### Must NOT Have (Guardrails)
- `jsonwebtoken` 패키지 사용 금지 (Node.js crypto 의존)
- 클라이언트사이드 API 키 노출 금지 (서버사이드 전용)
- SDK 사용자에게 KV/D1 바인딩 요구 금지 (SDK는 HTTP 통신만)
- Apple .p8 키를 코드나 git에 포함 금지 (wrangler secret으로만 관리)
- 프로필 사진을 D1에 base64로 저장 금지 (R2 사용)
- 비밀번호/이메일+비밀번호 로그인 구현 금지 (매직링크만, 비밀번호 없음)
- 과도한 추상화 금지 (auth provider 인터페이스 등)
- 매직링크 이메일에 @pos.idserve.net 외 도메인 허용 금지

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (빈 프로젝트)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: Vitest + miniflare (CF Workers 테스트 환경)
- **TDD**: 각 태스크에서 테스트 먼저 작성 → 실패 확인 → 구현 → 통과

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **UI Pages**: Playwright — Navigate, interact, assert DOM, screenshot
- **API Endpoints**: Bash (curl) — Send requests, assert status + response fields
- **SDK**: Bash (bun/node REPL) — Import, call functions, compare output
- **Auth Flows**: Playwright + curl combination — Full flow verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1a (Scaffold — 반드시 먼저 실행):
└── Task 1: Remix 모노레포 스캐폴딩 + 도구 설정 [quick]

Wave 1b (Foundation — T1 완료 후, 서로 병렬):
├── Task 2: D1 스키마 + Drizzle ORM 설정 [quick]
├── Task 3: TypeScript 타입 정의 [quick]
├── Task 4: Vitest + miniflare 테스트 인프라 [quick]
├── Task 5: Apple Sign in with Apple 설정 가이드 문서 [writing] ← T1 불필요, 병렬 가능
└── Task 14: Remix 공유 레이아웃 + 스타일 (root.tsx, CSS) [visual-engineering]

Wave 2a (Core Auth — T2,T3,T4 완료 후, 서로 병렬):
├── Task 6: Apple Sign-In 플로우 [deep]
└── Task 7: 세션 관리 (KV CRUD, sliding window, cookie) [deep]

Wave 2b (Auth Utilities — T7 완료 후):
└── Task 8: CSRF 유틸 + Auth 유틸 (Remix loader/action 헬퍼) [quick]

Wave 2c (User + Email — T8 완료 후, 서로 병렬):
├── Task 9: 유저 CRUD + 계정 연결 로직 [unspecified-high]
├── Task 10: 이메일 발송 + 인증 플로우 (Resend) [unspecified-high]
└── Task 15: @adapos/auth SDK 코어 (T3만 필요, 병렬 가능) [unspecified-high]

Wave 2d (Magic Link — T9,T10 완료 후):
└── Task 10b: 매직링크 로그인 플로우 (@pos.idserve.net 전용) [deep]

Wave 3 (UI Pages — T6,T8,T10b,T14 완료 후, 서로 병렬):
├── Task 11: 로그인 페이지 (Apple Sign-In + 매직링크 폼) [visual-engineering]
├── Task 12: 마이페이지 (프로필 조회/편집, R2 사진 업로드) [visual-engineering]
├── Task 13: 개발자 포털 (앱 등록, API 키 발급/관리) [visual-engineering]
├── Task 16: Hono 미들웨어 (T15 완료 후) [unspecified-high]
└── Task 17: Express/generic 미들웨어 (T15 완료 후) [quick]

Wave 4 (Docs + Integration endpoints):
├── Task 18: SDK README + 사용 예제 (T16,T17 완료 후) [writing]
├── Task 20: API 키 검증 엔드포인트 + Rate limiting (T9,T13 완료 후) [unspecified-high]
└── Task 22: 에러 핸들링 + 로깅 통합 (T1 완료 후) [quick]

Wave 5 (SSO + Deploy — T20 완료 후):
├── Task 19: SSO 쿠키 설정 + 서브도메인 통합 테스트 (T7,T11,T16,T20 완료 후) [deep]
└── Task 21: Cloudflare Pages 배포 설정 (T19,T20 완료 후) [quick]

Wave FINAL (Verification — T21 완료 후, 4개 병렬):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA — Playwright [unspecified-high]
└── Task F4: Scope fidelity check [deep]

Critical Path: T1 → T3 → T7 → T8 → T9 → T10b → T11 → T20 → T19 → T21 → F1-F4
Max Concurrent: 5 (Wave 1b, Wave 2c)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2,3,4,5,6,7,8,9,10,10b,11,12,13,14,15,16,17,18,19,20,21,22 |
| 2 | 1 | 6,9,10,10b,13 |
| 3 | 1 | 6,7,8,9,10,10b,15,16,17 |
| 4 | 1 | 6,7,8,9,10,10b |
| 5 | — | — (독립 문서) |
| 6 | 2,3,4 | 11 |
| 7 | 3,4 | 8,10b,11,19 |
| 8 | 3,7 | 9,10,10b,11,12,13 |
| 9 | 2,3,8 | 10,10b,12,13 |
| 10 | 2,3,8,9 | 10b,12,13 |
| **10b** | **7,8,9,10** | **11** |
| 11 | 6,7,8,10b,14 | 19 |
| 12 | 8,9,10,14 | 19 |
| 13 | 8,9,10,14 | 20 |
| 14 | 1 | 11,12,13 |
| 15 | 3 | 16,17 |
| 16 | 3,15 | 18,19 |
| 17 | 3,15 | 18 |
| 18 | 16,17 | — |
| 19 | 7,11,16,**20** | 21 |
| 20 | 9,13 | 21 |
| 21 | 19,20 | F1-F4 |
| 22 | 1 | 21 |

### Agent Dispatch Summary

| Wave | Tasks | Count | Categories |
|------|-------|-------|-----------|
| 1a | T1 | 1 | T1 → `quick` |
| 1b | T2, T3, T4, T5, T14 | 5 | T2-T4 → `quick`, T5 → `writing`, T14 → `visual-engineering` |
| 2a | T6, T7 | 2 | T6 → `deep`, T7 → `deep` |
| 2b | T8 | 1 | T8 → `quick` |
| 2c | T9, T10, T15 | 3 | T9 → `unspecified-high`, T10 → `unspecified-high`, T15 → `unspecified-high` |
| 2d | T10b | 1 | T10b → `deep` |
| 3 | T11, T12, T13, T16, T17 | 5 | T11-T13 → `visual-engineering`, T16 → `unspecified-high`, T17 → `quick` |
| 4 | T18, T20, T22 | 3 | T18 → `writing`, T20 → `unspecified-high`, T22 → `quick` |
| 5 | T19, T21 | 2 | T19 → `deep`, T21 → `quick` |
| FINAL | F1, F2, F3, F4 | 4 | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Remix 모노레포 스캐폴딩 + 도구 설정

  **What to do**:
  - pnpm workspace 초기화: `pnpm-workspace.yaml`에 `apps/*`, `packages/*` 등록
  - `apps/auth/` — **Remix (React Router v7) 앱 스캐폴드**: `npx create-react-router@latest apps/auth --template cloudflare`
    - Remix on Cloudflare Pages 템플릿 사용
    - `app/` 디렉토리: `root.tsx`, `routes/`, `lib/`
    - `wrangler.toml` — CF Pages 설정 (D1, KV, R2 바인딩 선언)
  - `packages/auth-sdk/` — 빈 TS 패키지 스캐폴드 (package.json name: `@adapos/auth`)
  - 루트 `package.json` — 워크스페이스 스크립트 (`dev`, `build`, `test`, `typecheck`, `deploy`)
  - 루트 `tsconfig.json` — base config + path aliases
  - `apps/auth/app/routes/api.health.ts` — 헬스체크 리소스 라우트 (`loader: GET /api/health → {"status":"ok"}`)
  - `.gitignore`, `.nvmrc` (Node 20), `biome.json` (린터/포매터)
  - git 초기화

  **Must NOT do**:
  - Hono 단독 사용 금지 (Remix가 메인 프레임워크)
  - Next.js, Astro 사용 금지
  - 단일 패키지 구조 금지 (반드시 모노레포)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 파일 생성과 설정만 하는 스캐폴딩 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO (모든 후속 작업의 기반)
  - **Parallel Group**: Wave 1a (단독 실행 — 모든 후속 작업의 기반)
  - **Blocks**: T2, T3, T4, T6-T22
  - **Blocked By**: None

  **References**:
  - React Router v7 + Cloudflare: `npx create-react-router@latest --template cloudflare`
  - React Router v7 docs: https://reactrouter.com/start/framework/installation
  - Remix → RR7 마이그레이션: https://reactrouter.com/upgrading/remix
  - pnpm workspace: https://pnpm.io/workspaces
  - wrangler.toml 바인딩: D1 `[[d1_databases]]`, KV `[[kv_namespaces]]`, R2 `[[r2_buckets]]`
  - Remix on CF Pages `load-context.ts`: `getLoadContext()`에서 CF 바인딩을 Remix context로 전달

  **Acceptance Criteria**:
  - [ ] `pnpm install` 성공 (워크스페이스 심볼릭 링크 생성)
  - [ ] `pnpm --filter auth dev` → Remix 로컬 서버 기동
  - [ ] `curl http://localhost:5173/api/health` → `{"status":"ok"}`
  - [ ] `pnpm typecheck` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Health check endpoint responds correctly
    Tool: Bash (curl)
    Preconditions: `pnpm --filter auth dev` running
    Steps:
      1. curl -s http://localhost:5173/api/health
      2. Parse JSON response
      3. Assert response body is {"status":"ok"}
      4. Assert HTTP status is 200
    Expected Result: status 200, body {"status":"ok"}
    Failure Indicators: Connection refused, non-200 status, missing body
    Evidence: .sisyphus/evidence/task-1-health-check.txt

  Scenario: Workspace structure is correct
    Tool: Bash
    Preconditions: pnpm install completed
    Steps:
      1. ls apps/auth/app/root.tsx — Remix root exists
      2. ls apps/auth/app/routes/ — routes directory exists
      3. ls packages/auth-sdk/package.json — SDK package exists
      4. cat packages/auth-sdk/package.json | grep '"@adapos/auth"' — name correct
      5. cat pnpm-workspace.yaml — contains 'apps/*' and 'packages/*'
      6. ls apps/auth/wrangler.toml — CF config exists
    Expected Result: All files exist with correct content
    Failure Indicators: Missing files, wrong package name
    Evidence: .sisyphus/evidence/task-1-workspace-structure.txt
  ```

  **Commit**: YES
  - Message: `chore: scaffold monorepo with remix, pnpm workspaces, vitest`
  - Files: `package.json, pnpm-workspace.yaml, apps/auth/*, packages/auth-sdk/*, tsconfig.json, biome.json, .gitignore, .nvmrc`

- [x] 2. D1 스키마 + Drizzle ORM 설정

  **What to do**:
  - `drizzle-orm` + `drizzle-kit` 설치 (`apps/auth`)
  - `apps/auth/app/db/schema.ts` — Drizzle 스키마 정의:
    - `users` 테이블: id (TEXT PK, Apple sub), apple_email, verified_email, nickname, name, profile_photo_url, bio, contact, sns_links (JSON), is_verified (BOOLEAN), created_at, updated_at
    - `developer_apps` 테이블: id (TEXT PK, uuid), user_id (FK→users), name, description, api_key_hash (TEXT), api_key_prefix (TEXT, 처음 8자), redirect_urls (JSON), is_active (BOOLEAN), created_at, updated_at
  - `apps/auth/app/db/index.ts` — Drizzle 클라이언트 생성 함수 (`createDb(d1: D1Database)`)
  - `apps/auth/drizzle.config.ts` — Drizzle Kit 설정
  - `apps/auth/migrations/` — 초기 마이그레이션 SQL 생성 (`drizzle-kit generate`)
  - 테스트: 스키마 정의가 올바른 SQL로 변환되는지 확인

  **Must NOT do**:
  - 프로필 사진을 D1에 base64로 저장하는 컬럼 추가 금지
  - 비밀번호 관련 컬럼 추가 금지
  - API 키를 평문으로 저장하는 컬럼 금지 (hash만 저장)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 스키마 정의 + ORM 설정. 파일 수 적고 명확한 작업.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T3, T4, T5, T14와 병렬)
  - **Parallel Group**: Wave 1b (T1 완료 후)
  - **Blocks**: T6, T9, T10, T13
  - **Blocked By**: T1

  **References**:
  - Drizzle + D1: https://orm.drizzle.team/docs/get-started/d1-new
  - D1 SQLite 제한사항: INTEGER for timestamps (Unix epoch), TEXT for JSON

  **Acceptance Criteria**:
  - [ ] `drizzle-kit generate` → 마이그레이션 SQL 파일 생성
  - [ ] SQL에 users, developer_apps 테이블 존재
  - [ ] api_key_hash 컬럼 존재, api_key 평문 컬럼 없음
  - [ ] `pnpm typecheck` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Schema generates valid migration SQL
    Tool: Bash
    Preconditions: drizzle-kit installed, schema.ts written
    Steps:
      1. Run `pnpm --filter auth drizzle-kit generate`
      2. ls apps/auth/migrations/ — at least 1 .sql file
      3. cat the generated .sql file
      4. Assert contains "CREATE TABLE users"
      5. Assert contains "CREATE TABLE developer_apps"
      6. Assert contains "api_key_hash" column
      7. Assert does NOT contain "password" column
    Expected Result: Valid SQL with both tables, hash column present, no password column
    Failure Indicators: Missing tables, plain api_key column, password column
    Evidence: .sisyphus/evidence/task-2-migration-sql.txt

  Scenario: Drizzle client creates correctly
    Tool: Bash (vitest)
    Preconditions: Test file for db module
    Steps:
      1. Write test that imports createDb and schema
      2. Verify schema exports users and developer_apps
      3. Verify column types match expected (text, integer, etc.)
    Expected Result: All schema exports correct with proper types
    Evidence: .sisyphus/evidence/task-2-schema-test.txt
  ```

  **Commit**: YES (groups with T3)
  - Message: `feat(db): add D1 schema, drizzle ORM, and type definitions`
  - Files: `apps/auth/app/db/*, apps/auth/drizzle.config.ts, apps/auth/migrations/*`
  - Pre-commit: `pnpm typecheck`

- [x] 3. TypeScript 타입 정의

  **What to do**:
  - `packages/auth-sdk/src/types.ts` — 공유 타입 (SDK와 서버 모두 사용):
    ```typescript
    export interface AdaposUser {
      id: string;
      email: string | null;        // Apple email
      verifiedEmail: string | null; // pos.idserve.net
      nickname: string | null;
      name: string | null;
      profilePhotoUrl: string | null;
      bio: string | null;
      contact: string | null;
      snsLinks: Record<string, string>;
      isVerified: boolean;
      createdAt: number;
      updatedAt: number;
    }
    export interface AdaposSession {
      id: string;
      userId: string;
      expiresAt: number;
      createdAt: number;
    }
    export interface AdaposAuthContext {
      user: AdaposUser;
      session: AdaposSession;
      isAuthenticated: true;
    }
    export interface AdaposUnauthContext {
      user: null;
      session: null;
      isAuthenticated: false;
    }
    export type AuthContext = AdaposAuthContext | AdaposUnauthContext;
    export interface DeveloperApp { ... }
    export interface ApiKeyInfo { ... }
    ```
  - `apps/auth/app/types/env.ts` — CF Workers Env 바인딩 타입:
    ```typescript
    export interface Env {
      DB: D1Database;
      SESSIONS: KVNamespace;
      EMAIL_TOKENS: KVNamespace;
      MAGIC_TOKENS: KVNamespace;
      RATE_LIMITS: KVNamespace;
      PROFILE_PHOTOS: R2Bucket;
      APPLE_CLIENT_ID: string;
      APPLE_TEAM_ID: string;
      APPLE_KEY_ID: string;
      APPLE_PRIVATE_KEY: string;
      RESEND_API_KEY: string;
      AUTH_SECRET: string; // session signing
      COOKIE_DOMAIN: string; // ".adapos.tech" (prod) or "" (local)
    }
    ```
  - 타입만 정의. 구현 없음.

  **Must NOT do**:
  - 구현 코드 작성 금지 (타입/인터페이스만)
  - AuthProvider 추상화 금지 (Apple만 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 타입 파일만 작성. 명확하고 간단.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T2, T4, T5, T14와 병렬)
  - **Parallel Group**: Wave 1b (T1 완료 후)
  - **Blocks**: T6, T7, T8, T9, T10, T15, T16, T17
  - **Blocked By**: T1

  **References**:
  - CF Workers 타입: `@cloudflare/workers-types`
  - Hono Env 바인딩: https://hono.dev/docs/getting-started/cloudflare-workers#bindings

  **Acceptance Criteria**:
  - [ ] `packages/auth-sdk/src/types.ts` 에서 모든 타입 export
  - [ ] `apps/auth/app/types/env.ts` 에서 Env 타입 export
  - [ ] `pnpm typecheck` → 0 errors
  - [ ] SDK 패키지에서 타입 import 가능 확인

  **QA Scenarios**:
  ```
  Scenario: Types are importable from SDK package
    Tool: Bash
    Preconditions: pnpm install completed, types.ts written
    Steps:
      1. Create a temp .ts file that imports { AdaposUser, AuthContext } from '@adapos/auth'
      2. Run tsc --noEmit on the temp file
      3. Assert 0 errors
    Expected Result: Types import cleanly with 0 TypeScript errors
    Failure Indicators: Module not found, type export missing
    Evidence: .sisyphus/evidence/task-3-type-import.txt

  Scenario: Env type includes all required bindings
    Tool: Bash (grep)
    Preconditions: env.ts written
    Steps:
      1. grep "DB: D1Database" apps/auth/app/types/env.ts
      2. grep "SESSIONS: KVNamespace" apps/auth/app/types/env.ts
      3. grep "PROFILE_PHOTOS: R2Bucket" apps/auth/app/types/env.ts
      4. grep "APPLE_CLIENT_ID" apps/auth/app/types/env.ts
      5. grep "RESEND_API_KEY" apps/auth/app/types/env.ts
    Expected Result: All bindings present in Env type
    Failure Indicators: Missing binding declaration
    Evidence: .sisyphus/evidence/task-3-env-bindings.txt
  ```

  **Commit**: YES (groups with T2)
  - Message: `feat(db): add D1 schema, drizzle ORM, and type definitions`
  - Files: `packages/auth-sdk/src/types.ts, apps/auth/app/types/env.ts`
  - Pre-commit: `pnpm typecheck`

- [x] 4. Vitest + miniflare 테스트 인프라

  **What to do**:
  - `vitest` + `@cloudflare/vitest-pool-workers` 설치 (apps/auth)
  - `apps/auth/vitest.config.ts` — miniflare pool 설정 (D1, KV, R2 바인딩 포함)
  - `apps/auth/app/__tests__/setup.ts` — 테스트 헬퍼:
    - `seedTestUser(db)` → D1에 테스트 유저 생성, 유저 ID 반환
    - `createTestSession(kv, userId)` → KV에 테스트 세션 생성, 세션 ID 반환
    - `createTestMagicToken(kv, email)` → KV에 매직링크 토큰 생성, 토큰 반환
    - `createVerifiedUser(db, kv)` → 인증 완료된 유저 + 세션 한번에 생성
    - `createTestApp(db, userId)` → 개발자 앱 + API 키 생성, { appId, apiKey } 반환
    - **`mockResend()`** → Resend API를 모킹하여 발송된 이메일을 캡처하는 헬퍼:
      - `mockResend.getLastEmail()` → 마지막 발송된 이메일의 { to, subject, html } 반환
      - `mockResend.extractMagicLink()` → 이메일 HTML에서 매직링크 URL 파싱 → token 추출
      - `mockResend.extractVerifyLink()` → 이메일 HTML에서 인증 링크 URL 파싱 → token 추출
      - 구현: `global.fetch`를 모킹하여 Resend API 호출을 인터셉트, 발송 내용을 메모리에 저장
    - 모든 QA 시나리오의 "Preconditions"에서 이 헬퍼들을 사용
    - **매직링크/이메일 인증 QA에서 토큰을 얻는 유일한 방법**: `mockResend.extractMagicLink()` (KV wildcard 조회는 불가)
  - `apps/auth/app/__tests__/health.test.ts` — 샘플 테스트: GET /api/health → 200
  - `packages/auth-sdk/vitest.config.ts` — SDK용 vitest 설정 (일반 Node 환경)
  - 루트 `vitest.workspace.ts` — 워크스페이스 테스트 설정
  - `pnpm test` 스크립트가 전체 워크스페이스 테스트 실행하도록 설정

  **Must NOT do**:
  - Jest 사용 금지 (Vitest + miniflare이 CF Workers 공식 지원)
  - 실제 Cloudflare API 호출하는 테스트 금지 (miniflare 로컬 에뮬레이션만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 설정 파일 + 샘플 테스트 1개. 명확한 작업.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T2, T3, T5, T14와 병렬)
  - **Parallel Group**: Wave 1b (T1 완료 후)
  - **Blocks**: T6, T7, T8, T9, T10
  - **Blocked By**: T1

  **References**:
  - CF Workers Vitest Integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
  - `@cloudflare/vitest-pool-workers` 설정 패턴

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test` → health.test.ts PASS
  - [ ] `pnpm test` → 워크스페이스 전체 테스트 PASS
  - [ ] miniflare에서 D1, KV, R2 바인딩 사용 가능 확인

  **QA Scenarios**:
  ```
  Scenario: Health check test passes
    Tool: Bash
    Preconditions: vitest configured, health.test.ts written
    Steps:
      1. Run `pnpm --filter auth test`
      2. Assert output contains "health" test suite
      3. Assert output contains "PASS" or "✓"
      4. Assert exit code is 0
    Expected Result: Test passes with exit code 0
    Failure Indicators: Test failure, miniflare startup error, binding errors
    Evidence: .sisyphus/evidence/task-4-test-run.txt

  Scenario: Miniflare bindings available in tests
    Tool: Bash
    Preconditions: vitest.config.ts configured with miniflare pool
    Steps:
      1. Write test that accesses env.DB (D1)
      2. Write test that accesses env.SESSIONS (KV)
      3. Run tests
      4. Assert both bindings are accessible (not undefined)
    Expected Result: All CF bindings accessible in test environment
    Evidence: .sisyphus/evidence/task-4-bindings-test.txt
  ```

  **Commit**: YES
  - Message: `chore(test): configure vitest with miniflare for CF Workers testing`
  - Files: `apps/auth/vitest.config.ts, apps/auth/app/__tests__/*, packages/auth-sdk/vitest.config.ts, vitest.workspace.ts`
  - Pre-commit: `pnpm test`

- [x] 5. Apple Sign in with Apple 설정 가이드 문서

  **What to do**:
  - `docs/apple-setup.md` 작성 — Apple Developer Console에서의 설정 단계:
    1. App ID 생성 (Sign in with Apple capability 활성화)
    2. Services ID 생성 (웹 클라이언트 ID로 사용)
       - Domain: `adapos.tech`
       - Return URL: `https://adapos.tech/api/auth/apple/callback`
    3. Key 생성 (Sign in with Apple용)
       - Key ID 기록
       - .p8 파일 다운로드 (**1회만 가능!** 안전하게 보관)
    4. Team ID 확인 (Membership 페이지)
    5. Cloudflare 시크릿 등록:
       ```bash
       wrangler secret put APPLE_CLIENT_ID    # Services ID
       wrangler secret put APPLE_TEAM_ID      # Team ID
       wrangler secret put APPLE_KEY_ID       # Key ID
       wrangler secret put APPLE_PRIVATE_KEY  # .p8 파일 내용
       ```
    6. client_secret JWT 생성 로직 설명 (6개월 만료, 로테이션 전략)
  - 스크린샷 위치 표시 (실제 스크린샷은 유저가 추가)

  **Must NOT do**:
  - 실제 Apple 자격증명을 문서에 포함 금지
  - .p8 파일을 git에 커밋하라는 안내 금지

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Reason: 순수 문서 작성 작업.

  **Parallelization**:
  - **Can Run In Parallel**: YES (완전 독립 — T1조차 필요 없음)
  - **Parallel Group**: Wave 1b (T2-T4, T14와 병렬, 완전 독립)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - Apple 공식: https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple
  - Apple REST API: https://developer.apple.com/documentation/signinwithapplerestapi
  - client_secret JWT 생성: ES256 알고리즘, iss=Team ID, sub=Services ID, aud=https://appleid.apple.com, exp=최대 6개월

  **Acceptance Criteria**:
  - [ ] `docs/apple-setup.md` 파일 존재
  - [ ] 6단계 모두 포함 (App ID, Services ID, Key, Team ID, Secrets, Rotation)
  - [ ] wrangler secret 명령어 예시 포함
  - [ ] .p8 파일 보관 경고 포함

  **QA Scenarios**:
  ```
  Scenario: Document is complete and well-structured
    Tool: Bash (grep)
    Preconditions: docs/apple-setup.md written
    Steps:
      1. grep "Services ID" docs/apple-setup.md — present
      2. grep "wrangler secret put" docs/apple-setup.md — present
      3. grep ".p8" docs/apple-setup.md — present with warning
      4. grep "6개월" or "rotation" docs/apple-setup.md — rotation strategy mentioned
      5. grep "APPLE_PRIVATE_KEY" docs/apple-setup.md — secret name correct
    Expected Result: All key sections present in document
    Failure Indicators: Missing sections, wrong secret names
    Evidence: .sisyphus/evidence/task-5-doc-check.txt
  ```

  **Commit**: YES
  - Message: `docs: add Apple Sign in with Apple setup guide`
  - Files: `docs/apple-setup.md`

- [ ] 6. Apple Sign-In 플로우 (client_secret 생성, 토큰 교환, JWKS 검증)

  **What to do**:
  - TDD: 먼저 테스트 작성 → 실패 확인 → 구현
  - `apps/auth/app/lib/apple.server.ts`:
    - `generateClientSecret(env)` — ES256 JWT 생성 (`jose` 사용). iss=APPLE_TEAM_ID, sub=APPLE_CLIENT_ID, aud="https://appleid.apple.com", exp=6개월. APPLE_PRIVATE_KEY에서 키 import.
    - `exchangeAuthorizationCode(code, env)` — Apple `https://appleid.apple.com/auth/token`에 POST. grant_type=authorization_code. 응답에서 id_token 추출.
    - `verifyIdToken(idToken)` — `jose`의 `createRemoteJWKSet` + `jwtVerify` 사용. Apple JWKS URL: `https://appleid.apple.com/auth/keys`. iss 검증 (`https://appleid.apple.com`), aud 검증 (APPLE_CLIENT_ID).
    - `extractUserInfo(idToken)` — sub, email, email_verified 추출. **중요: email은 첫 로그인에만 제공됨**.
  - `apps/auth/app/routes/api.auth.apple.ts` — Remix 리소스 라우트:
    - `loader (GET)`: Apple OAuth 리다이렉트 생성 (state, nonce 포함)
  - `apps/auth/app/routes/api.auth.apple.callback.ts` — Remix 리소스 라우트:
    - `action (POST)`: authorization code 수신 → exchangeAuthorizationCode → verifyIdToken → 유저 생성/조회 → 세션 생성 → 쿠키 설정 → /mypage 리다이렉트
  - `apps/auth/app/__tests__/apple.test.ts` — 단위 테스트:
    - client_secret JWT 구조 검증 (header, payload)
    - ID token 검증 로직 (유효/무효/만료 토큰)
    - 유저 정보 추출 (email 있는 경우/없는 경우)

  **Must NOT do**:
  - `jsonwebtoken` 패키지 사용 금지 → `jose` 사용
  - Apple .p8 키를 하드코딩 금지
  - email이 없는 재로그인 시 에러 발생 금지 (sub로 기존 유저 조회)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 암호화 JWT 생성, JWKS 검증, OAuth 플로우 — 복잡한 인증 로직. 정확성 필수.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T7과 병렬)
  - **Parallel Group**: Wave 2a (T2, T3, T4 완료 후)
  - **Blocks**: T7, T11
  - **Blocked By**: T2, T3, T4

  **References**:
  - `jose` API: `import { SignJWT, jwtVerify, createRemoteJWKSet, importPKCS8 } from 'jose'`
  - Apple auth/token: POST https://appleid.apple.com/auth/token (application/x-www-form-urlencoded)
  - Apple auth/keys: GET https://appleid.apple.com/auth/keys (JWKS)
  - Apple OAuth params: client_id (Services ID), redirect_uri, response_type=code, scope="name email", response_mode=form_post
  - **중요**: Apple은 form_post로 callback 데이터를 보냄 → POST 핸들러 필요

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- apple` → ALL PASS
  - [ ] generateClientSecret가 유효한 ES256 JWT 반환
  - [ ] verifyIdToken이 유효한 토큰 → { sub, email } 반환
  - [ ] verifyIdToken이 무효한 토큰 → 에러 throw
  - [ ] 콜백 라우트가 세션 쿠키 설정

  **QA Scenarios**:
  ```
  Scenario: Apple Sign-In redirect URL is correct
    Tool: Bash (curl)
    Preconditions: Auth server running locally
    Steps:
      1. curl -s -o /dev/null -w "%{redirect_url}" http://localhost:5173/api/auth/apple
      2. Assert redirect URL starts with "https://appleid.apple.com/auth/authorize"
      3. Assert URL contains "client_id=" parameter
      4. Assert URL contains "redirect_uri=" parameter
      5. Assert URL contains "scope=name%20email"
      6. Assert URL contains "response_mode=form_post"
    Expected Result: Valid Apple OAuth redirect URL with all required params
    Failure Indicators: Missing params, wrong URL, 500 error
    Evidence: .sisyphus/evidence/task-6-apple-redirect.txt

  Scenario: Invalid callback code returns error
    Tool: Bash (curl)
    Preconditions: Auth server running locally
    Steps:
      1. curl -s -X POST http://localhost:5173/api/auth/apple/callback -d "code=invalid_code&state=test"
      2. Assert HTTP status is 400 or 401
      3. Assert response contains error message
    Expected Result: Graceful error response, no 500
    Failure Indicators: 500 error, unhandled exception
    Evidence: .sisyphus/evidence/task-6-invalid-callback.txt
  ```

  **Commit**: YES (groups with T7)
  - Message: `feat(auth): implement Apple Sign-In flow and session management`
  - Files: `apps/auth/app/lib/apple.ts, apps/auth/app/routes/auth.ts, apps/auth/app/__tests__/apple.test.ts`
  - Pre-commit: `pnpm test`

- [ ] 7. 세션 관리 (KV CRUD, sliding window, cookie)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `apps/auth/app/lib/session.server.ts`:
    - `createSession(kv, userId)` — crypto.randomUUID()로 세션 ID 생성 → KV에 저장 (TTL: 7일). 반환: { sessionId, expiresAt }
    - `getSession(kv, sessionId)` — KV에서 세션 조회. **Sliding window**: 남은 TTL이 50% 미만이면 TTL 갱신 (KV re-put + 새 만료시간 반환)
    - `deleteSession(kv, sessionId)` — KV에서 세션 삭제 (로그아웃)
    - `deleteAllUserSessions(kv, userId)` — 유저의 모든 세션 삭제 (보안 용도)
  - `apps/auth/app/lib/cookie.server.ts`:
    - `setSessionCookie(sessionId, expiresAt)` — `Set-Cookie` 헤더 생성: `session={id}; Domain=.adapos.tech; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={seconds}`
    - `clearSessionCookie()` — 세션 쿠키 삭제 (Max-Age=0)
    - `getSessionIdFromCookie(cookieHeader)` — Cookie 헤더에서 session ID 파싱
  - `apps/auth/app/__tests__/session.test.ts` — 단위 테스트:
    - 세션 생성 → KV에 저장 확인
    - 세션 조회 → 올바른 데이터 반환
    - Sliding window: 50% 지난 세션 → TTL 갱신 확인
    - 세션 삭제 → KV에서 제거 확인
    - 쿠키 생성 → Domain, HttpOnly, Secure 속성 확인

  **Must NOT do**:
  - JWT를 세션 토큰으로 사용 금지 (opaque token + KV lookup 방식)
  - 로컬 개발에서도 Domain 속성 하드코딩 금지 (환경변수로 제어)
  - 세션 데이터에 민감 정보 저장 금지 (userId만 저장)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: Sliding window 로직, 쿠키 보안 설정 — 인증 시스템의 핵심. 정확성 필수.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T6과 병렬)
  - **Parallel Group**: Wave 2a (T3, T4 완료 후)
  - **Blocks**: T8, T11, T19
  - **Blocked By**: T3, T4

  **References**:
  - KV TTL: `kv.put(key, value, { expirationTtl: seconds })` — 최소 60초
  - KV metadata: `kv.getWithMetadata(key)` — metadata에 createdAt 저장 가능
  - Lucia session pattern: 50% TTL → fresh → extend
  - Cookie Domain: `.adapos.tech` (leading dot for subdomain inclusion)

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- session` → ALL PASS
  - [ ] createSession → KV에 TTL 7일로 저장
  - [ ] getSession → 50% 지난 세션의 TTL 갱신 확인
  - [ ] setSessionCookie → Domain=.adapos.tech, HttpOnly, Secure, SameSite=Lax 포함
  - [ ] deleteSession → KV에서 제거 확인

  **QA Scenarios**:
  ```
  Scenario: Session creation and retrieval
    Tool: Bash (vitest)
    Preconditions: miniflare KV available in test
    Steps:
      1. Call createSession(kv, "user-123")
      2. Assert returns { sessionId: string, expiresAt: number }
      3. Call getSession(kv, sessionId)
      4. Assert returns { userId: "user-123", ... }
    Expected Result: Session persisted and retrievable from KV
    Failure Indicators: KV write failure, missing data
    Evidence: .sisyphus/evidence/task-7-session-crud.txt

  Scenario: Cookie has correct SSO attributes
    Tool: Bash (vitest)
    Preconditions: cookie.ts implemented
    Steps:
      1. Call setSessionCookie("sess-123", futureTimestamp)
      2. Parse the Set-Cookie header string
      3. Assert contains "Domain=.adapos.tech"
      4. Assert contains "HttpOnly"
      5. Assert contains "Secure"
      6. Assert contains "SameSite=Lax"
      7. Assert does NOT contain "SameSite=Strict" (would break SSO)
    Expected Result: Cookie with all required security + SSO attributes
    Failure Indicators: Missing Domain, wrong SameSite, missing HttpOnly
    Evidence: .sisyphus/evidence/task-7-cookie-attrs.txt
  ```

  **Commit**: YES (groups with T6)
  - Message: `feat(auth): implement Apple Sign-In flow and session management`
  - Files: `apps/auth/app/lib/session.ts, apps/auth/app/lib/cookie.ts, apps/auth/app/__tests__/session.test.ts`
  - Pre-commit: `pnpm test`

- [x] 8. CSRF 유틸 + Auth 유틸 (Remix loader/action 헬퍼)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - **Remix에는 Hono처럼 `app.use()` 미들웨어가 없음**. 대신 loader/action에서 호출하는 유틸리티 함수를 만든다.
  - `apps/auth/app/middleware/csrf.server.ts`:
    - `validateCsrf(request: Request)` — 비-GET 요청에서 Origin 헤더 검증. 불일치 시 `throw new Response('Forbidden', { status: 403 })`. GET/HEAD/OPTIONS → 패스.
    - Remix action 내에서 호출: `await validateCsrf(request);`
  - `apps/auth/app/middleware/auth.server.ts`:
    - `getAuthContext(request: Request, context: AppLoadContext)` → 세션 쿠키 파싱 → getSession(kv, sessionId) → getUserById(db, userId) → `AuthContext | null` 반환. 내부 공통 로직. 에러 없음.
    - `requireAuthPage(request: Request, context: AppLoadContext)` → getAuthContext 호출. 미인증 시 `throw redirect('/login')`. **Remix page loader/action 전용** (HTML 리다이렉트).
    - `requireAuthApi(request: Request, context: AppLoadContext)` → getAuthContext 호출. 미인증 시 `throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })`. **Remix API resource route 전용** (JSON 응답).
    - `optionalAuth(request: Request, context: AppLoadContext)` → 세션 있으면 `AdaposAuthContext`, 없으면 `AdaposUnauthContext`. 에러 없음.
    - **사용 패턴**:
      - Page loaders/actions (login.tsx, mypage.tsx, developer.tsx):
        ```typescript
        export async function loader({ request, context }: LoaderFunctionArgs) {
          const auth = await requireAuthPage(request, context);
          return json({ user: auth.user });
        }
        ```
      - API resource routes (api.me.ts, api.developer.apps.ts):
        ```typescript
        export async function loader({ request, context }: LoaderFunctionArgs) {
          const auth = await requireAuthApi(request, context);
          return json({ user: auth.user });
        }
        ```
    - `context.cloudflare.env`에서 KV/D1 바인딩 접근
  - `apps/auth/app/__tests__/middleware.test.ts` — 단위 테스트:
    - CSRF: POST without Origin → 403 throw
    - CSRF: POST with valid Origin → 통과 (no throw)
    - CSRF: GET → 항상 통과
    - requireAuthPage: 유효한 세션 쿠키 → AuthContext 반환
    - requireAuthPage: 세션 없음 → `redirect('/login')` throw
    - requireAuthApi: 유효한 세션 쿠키 → AuthContext 반환
    - requireAuthApi: 세션 없음 → `Response({ error: 'Unauthorized' }, 401)` throw
    - OptionalAuth: 세션 없음 → UnauthContext 반환 (에러 없음)

  **Must NOT do**:
  - Hono `c.set()` / `c.get()` / `app.use()` 패턴 사용 금지 — Remix에서 사용 불가
  - CSRF 토큰 (hidden form field) 방식 금지 — Origin 헤더 검증만
  - auth 유틸에서 DB 직접 접근 금지 — session.server.ts, user.server.ts 함수 사용

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 유틸 함수 2개 작성. 패턴이 명확하고 로직이 간단.

  **Parallelization**:
  - **Can Run In Parallel**: NO (T7 완료 후 시작)
  - **Parallel Group**: Wave 2b (T7 직후)
  - **Blocks**: T9, T10, T10b, T11, T12, T13
  - **Blocked By**: T3, T7

  **References**:
  - Lucia CSRF 패턴: `verifyRequestOrigin(origin, [host])`
  - Remix loader context: `context.cloudflare.env` (CF Pages 바인딩 접근)
  - Remix redirect: `import { redirect } from 'react-router'`
  - Remix LoaderFunctionArgs: `{ request: Request, context: AppLoadContext, params }`
  - React Router v7 middleware (실험적): https://reactrouter.com/explanation/middleware — 아직 unstable이므로 유틸 함수 방식 채택

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- middleware` → ALL PASS
  - [ ] validateCsrf: POST without Origin → 403 Response throw
  - [ ] validateCsrf: POST with valid Origin → 통과 (return void)
  - [ ] requireAuthPage: 유효 세션 → AuthContext 반환
  - [ ] requireAuthPage: 미인증 → redirect('/login') throw
  - [ ] requireAuthApi: 유효 세션 → AuthContext 반환
  - [ ] requireAuthApi: 미인증 → 401 JSON Response throw
  - [ ] optionalAuth: 미인증 → UnauthContext 반환 (에러 없음)

  **QA Scenarios**:
  ```
  Scenario: CSRF validation rejects POST without Origin
    Tool: Bash (vitest)
    Preconditions: validateCsrf function implemented
    Steps:
      1. Create mock Request: new Request('http://localhost/api/test', { method: 'POST' }) — no Origin header
      2. Call validateCsrf(request)
      3. Assert it throws a Response with status 403
    Expected Result: 403 Response thrown
    Failure Indicators: No throw, wrong status code
    Evidence: .sisyphus/evidence/task-8-csrf-unit.txt

  Scenario: requireAuthPage returns user context for valid session
    Tool: Bash (vitest)
    Preconditions: Test user + session created via `const { userId } = await seedTestUser(db); const { sessionId } = await createTestSession(kv, userId);`
    Steps:
      1. Create mock Request with Cookie header: `Cookie: session={sessionId}`
      2. Create mock context with env bindings (KV, D1 from miniflare)
      3. Call requireAuthPage(request, context)
      4. Assert return value has { user, session, isAuthenticated: true }
      5. Assert user.id matches expected userId
    Expected Result: AuthContext with correct user data
    Failure Indicators: Throw instead of return, missing user data
    Evidence: .sisyphus/evidence/task-8-authpage-unit.txt

  Scenario: requireAuthPage redirects for missing session
    Tool: Bash (vitest)
    Preconditions: No session cookie
    Steps:
      1. Create mock Request without Cookie header
      2. Call requireAuthPage(request, context)
      3. Assert it throws a redirect Response to '/login' (status 302)
    Expected Result: Redirect to /login
    Failure Indicators: Returns null instead of throw, wrong redirect target
    Evidence: .sisyphus/evidence/task-8-authpage-redirect.txt

  Scenario: requireAuthApi returns 401 JSON for missing session
    Tool: Bash (vitest)
    Preconditions: No session cookie
    Steps:
      1. Create mock Request without Cookie header
      2. Call requireAuthApi(request, context)
      3. Assert it throws a Response with status 401
      4. Parse the response body as JSON
      5. Assert body contains { error: "Unauthorized" }
    Expected Result: 401 JSON response (NOT redirect)
    Failure Indicators: Redirect instead of 401, non-JSON response
    Evidence: .sisyphus/evidence/task-8-authapi-401.txt

  Scenario: requireAuthApi returns user context for valid session
    Tool: Bash (vitest)
    Preconditions: Test user + session created via `const { userId } = await seedTestUser(db); const { sessionId } = await createTestSession(kv, userId);`
    Steps:
      1. Create mock Request with Cookie header: `Cookie: session={sessionId}`
      2. Call requireAuthApi(request, context)
      3. Assert return value has { user, session, isAuthenticated: true }
    Expected Result: AuthContext with correct user data
    Failure Indicators: 401 thrown despite valid session
    Evidence: .sisyphus/evidence/task-8-authapi-unit.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add CSRF validation and auth helper utilities for Remix`
  - Files: `apps/auth/app/middleware/csrf.server.ts, apps/auth/app/middleware/auth.server.ts, apps/auth/app/__tests__/middleware.test.ts`
  - Pre-commit: `pnpm test`

- [x] 9. 유저 CRUD (D1 쿼리, Drizzle)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `apps/auth/app/lib/user.server.ts`:
    - `createUser(db, appleUser)` — Apple sub를 ID로 유저 생성. email은 첫 로그인 시 저장.
    - `getUserById(db, userId)` — ID로 유저 조회
    - `getUserByEmail(db, email)` — 이메일로 유저 조회
    - `updateUserProfile(db, userId, profile)` — 프로필 필드 업데이트 (닉네임, 이름, bio, contact, snsLinks)
    - `updateProfilePhoto(db, userId, photoUrl)` — 프로필 사진 URL 업데이트
    - `verifyUserEmail(db, userId, verifiedEmail)` — pos.idserve.net 이메일 인증 완료 마킹
    - `findOrCreateUser(db, appleUser)` — 기존 유저 있으면 반환, 없으면 생성. **첫 로그인 email 저장 보장.**
  - `apps/auth/app/routes/api.me.ts` — Remix 리소스 라우트:
    - `loader (GET)`: 현재 유저 정보 반환 (`requireAuthApi` — API 라우트이므로 401 JSON)
    - `action (PATCH)`: 프로필 업데이트 (`requireAuthApi`)
  - `apps/auth/app/routes/api.me.photo.ts` — Remix 리소스 라우트:
    - `action (POST)`: 프로필 사진 업로드 → R2 저장 → URL 반환 (`requireAuthApi`)
  - `apps/auth/app/__tests__/user.test.ts` — 단위 테스트

  **Must NOT do**:
  - 비밀번호 관련 로직 추가 금지
  - API 키를 평문으로 반환 금지 (prefix만)
  - 프로필 사진을 D1에 직접 저장 금지 (R2 URL만)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: DB CRUD + R2 업로드 + API 라우트. 중간 복잡도.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T10, T15와 병렬)
  - **Parallel Group**: Wave 2c (T8 완료 후)
  - **Blocks**: T10, T12, T13
  - **Blocked By**: T2, T3, T8

  **References**:
  - Drizzle select: `db.select().from(users).where(eq(users.id, userId))`
  - Drizzle insert: `db.insert(users).values({ ... })`
  - R2 put: `bucket.put(key, body, { httpMetadata: { contentType } })`
  - R2 public URL: Workers에서 `R2_BUCKET.get(key)` → `Response` 생성

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- user` → ALL PASS
  - [ ] findOrCreateUser: 신규 → 생성, 기존 → 반환
  - [ ] GET /api/me → 인증된 유저 정보 JSON
  - [ ] PATCH /api/me → 프로필 업데이트 → 200
  - [ ] POST /api/me/photo → R2 업로드 → URL 반환

  **QA Scenarios**:
  ```
  Scenario: Get current user profile
    Tool: Bash (vitest)
    Preconditions: Auth server running via miniflare, test user + session created via `seedTestUser(db)` + `createTestSession(kv, userId)`
    Steps:
      1. Use test helper: `const { userId } = await seedTestUser(db); const { sessionId } = await createTestSession(kv, userId);`
      2. Make request with cookie: `GET /api/me` with `Cookie: session={sessionId}`
      2. Parse JSON response
      3. Assert response contains "id", "nickname", "isVerified" fields
      4. Assert HTTP status 200
    Expected Result: User profile JSON with expected fields
    Failure Indicators: 401 (session not found), missing fields
    Evidence: .sisyphus/evidence/task-9-get-me.txt

  Scenario: Unauthenticated access returns 401
    Tool: Bash (curl)
    Preconditions: Auth server running, no session cookie
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/me
      2. Assert HTTP status is 401
    Expected Result: 401 Unauthorized
    Failure Indicators: 200 (auth not enforced), 500
    Evidence: .sisyphus/evidence/task-9-unauth.txt
  ```

  **Commit**: YES (groups with T10)
  - Message: `feat(user): add user CRUD and email verification with Resend`
  - Files: `apps/auth/app/lib/user.ts, apps/auth/app/routes/me.ts, apps/auth/app/__tests__/user.test.ts`
  - Pre-commit: `pnpm test`

- [x] 10. 이메일 인증 플로우 (Resend 연동)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `apps/auth/app/lib/email.server.ts`:
    - `sendVerificationEmail(resendApiKey, toEmail, token)` — Resend API로 인증 메일 발송. From: `noreply@adapos.tech`. 인증 링크: `https://adapos.tech/api/verify/confirm?token={token}&email={email}`
    - `generateVerificationToken()` — crypto.randomUUID()
    - `storeVerificationToken(kv, email, token)` — KV에 저장 (TTL: 24시간). key: `verify:{email}`
    - `validateVerificationToken(kv, email, token)` — KV에서 토큰 비교. 성공 → 삭제. 실패 → false.
  - `apps/auth/app/routes/api.verify.send.ts` — Remix 리소스 라우트:
    - `action (POST)`: pos.idserve.net 이메일 입력 → 도메인 검증 → 토큰 생성 → 메일 발송 (`requireAuthApi` — API 리소스 라우트이므로 401 JSON)
  - `apps/auth/app/routes/api.verify.confirm.ts` — Remix 리소스 라우트:
    - `loader (GET)`: 토큰 검증 → 유저 verified 마킹 → 성공 페이지 렌더
  - 이메일 도메인 검증: `email.endsWith('@pos.idserve.net')` — 다른 도메인 거부
  - `apps/auth/app/__tests__/email.test.ts` — 테스트 (Resend API는 모킹)

  **Must NOT do**:
  - Resend API 키를 클라이언트에 노출 금지
  - pos.idserve.net 외 도메인 이메일 인증 허용 금지
  - 인증 토큰 재사용 허용 금지 (사용 후 즉시 삭제)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: 이메일 서비스 연동 + 토큰 플로우 + 도메인 검증.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T9, T15와 병렬)
  - **Parallel Group**: Wave 2c (T8 완료 후, T9과 병렬)
  - **Blocks**: T12, T13
  - **Blocked By**: T2, T3, T8, T9

  **References**:
  - Resend SDK: `import { Resend } from 'resend'`; `resend.emails.send({ from, to, subject, html })`
  - CF Workers + Resend: https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend
  - KV TTL: `kv.put(key, value, { expirationTtl: 86400 })` (24시간)

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- email` → ALL PASS
  - [ ] POST /api/verify/send with non-pos.idserve.net email → 400
  - [ ] POST /api/verify/send with valid email → 200 + 메일 발송 (모킹 확인)
  - [ ] GET /api/verify/confirm with valid token → 유저 verified 마킹
  - [ ] GET /api/verify/confirm with expired/invalid token → 400

  **QA Scenarios**:
  ```
  Scenario: Email domain validation rejects non-pos.idserve.net
    Tool: Bash (vitest)
    Preconditions: Test user + session created via `const { userId } = await seedTestUser(db); const { sessionId } = await createTestSession(kv, userId);`
    Steps:
      1. Make POST /api/verify/send with `Cookie: session={sessionId}`, `Origin: http://localhost:5173`, body `{"email":"user@gmail.com"}`
      2. Assert HTTP status is 400
      3. Assert response JSON contains error about invalid domain
    Expected Result: 400 with domain validation error
    Failure Indicators: 200 (any domain accepted), 500
    Evidence: .sisyphus/evidence/task-10-domain-reject.txt

  Scenario: Valid pos.idserve.net email triggers verification
    Tool: Bash (vitest)
    Preconditions: Test user + session via `const { userId } = await seedTestUser(db); const { sessionId } = await createTestSession(kv, userId);`, mockResend() configured
    Steps:
      1. Make POST /api/verify/send with `Cookie: session={sessionId}`, `Origin: http://localhost:5173`, body `{"email":"user@pos.idserve.net"}`
      2. Assert HTTP status is 200
      3. Assert response contains success message
      4. Call `mockResend.getLastEmail()` → assert `to` is "user@pos.idserve.net"
      5. Call `mockResend.extractVerifyLink()` → assert URL contains `/api/verify/confirm?token=`
    Expected Result: 200 with verification email sent, email captured by mock
    Failure Indicators: 400, 500, Resend API error
    Evidence: .sisyphus/evidence/task-10-email-send.txt
  ```

  **Commit**: YES (groups with T9)
  - Message: `feat(user): add user CRUD and email verification with Resend`
  - Files: `apps/auth/app/lib/email.server.ts, apps/auth/app/routes/api.verify.*.ts, apps/auth/app/__tests__/email.test.ts`
  - Pre-commit: `pnpm test`

- [x] 10b. 매직링크 로그인 플로우 (@pos.idserve.net 전용)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `apps/auth/app/lib/magic-link.server.ts`:
    - `sendMagicLink(resendApiKey, kv, email)`:
      1. 이메일 도메인 검증: `email.endsWith('@pos.idserve.net')` — 아니면 에러
      2. 매직링크 토큰 생성: `crypto.randomUUID()`
      3. KV에 토큰 저장: key=`magic:{token}`, value=`{email, createdAt}`, TTL=15분
      4. Resend로 매직링크 이메일 발송: `https://adapos.tech/api/auth/magic/verify?token={token}`
    - `verifyMagicLink(kv, db, token)`:
      1. KV에서 토큰 조회 → 없으면 만료/무효 에러
      2. 토큰에서 이메일 추출
      3. **계정 연결 로직**:
         - `verified_email`이 해당 이메일인 기존 유저 검색
         - 있으면 → 기존 계정에 로그인 (Apple로 먼저 가입한 유저)
         - 없으면 → 새 유저 생성 (id: `magic_{uuid}`, verified_email: 해당 이메일, **is_verified: true 자동**)
      4. 세션 생성 → 쿠키 설정
      5. KV에서 토큰 삭제 (1회용)
  - `apps/auth/app/routes/api.auth.magic.send.ts` — Remix 리소스 라우트:
    - `action (POST)`: 이메일 입력 받기 → sendMagicLink 호출 → 성공/실패 JSON 반환
  - `apps/auth/app/routes/api.auth.magic.verify.ts` — Remix 리소스 라우트:
    - `loader (GET)`: 토큰 파라미터 → verifyMagicLink 호출 → 세션 쿠키 설정 → /mypage 리다이렉트
  - `apps/auth/app/__tests__/magic-link.test.ts` — 단위 테스트:
    - pos.idserve.net 이메일만 허용 확인
    - 토큰 생성 → KV 저장 → 검증 → 삭제 플로우
    - 기존 Apple 유저와 계정 연결 확인
    - 새 유저 생성 시 is_verified=true 확인
    - 만료된 토큰 거부 확인
    - 동일 토큰 재사용 거부 확인

  **Must NOT do**:
  - @pos.idserve.net 외 도메인 허용 금지
  - 매직링크 토큰 재사용 허용 금지 (검증 후 즉시 삭제)
  - 매직링크 TTL 15분 초과 금지
  - 비밀번호 저장/요구 금지

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 계정 연결 로직이 복잡 (기존 Apple 유저 ↔ 매직링크 유저 병합). 보안 플로우 정확성 필수.

  **Parallelization**:
  - **Can Run In Parallel**: NO (T9, T10 완료 후 시작)
  - **Parallel Group**: Wave 2d (T7, T8, T9, T10 완료 후)
  - **Blocks**: T11
  - **Blocked By**: T7, T8, T9, T10 (Resend 연동 공유)

  **References**:
  - KV TTL: `kv.put(key, value, { expirationTtl: 900 })` (15분)
  - Resend 이메일 발송: T10에서 이미 구현한 `email.server.ts` 재사용
  - 계정 연결 키: `users.verified_email` 컬럼 — Apple 유저가 인증한 이메일과 매직링크 이메일 매칭
  - Remix resource route: `export async function action({ request, context })` / `export async function loader({ request, context })`

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- magic-link` → ALL PASS
  - [ ] POST /api/auth/magic/send with `user@gmail.com` → 400 (도메인 거부)
  - [ ] POST /api/auth/magic/send with `user@pos.idserve.net` → 200 + 이메일 발송
  - [ ] GET /api/auth/magic/verify?token=valid → 세션 쿠키 설정 + /mypage 리다이렉트
  - [ ] 매직링크 유저 → is_verified=true 자동 설정 확인
  - [ ] Apple 유저가 동일 이메일로 매직링크 → 기존 계정에 연결 (새 계정 생성 안 함)
  - [ ] 만료/사용된 토큰 → 400 에러

  **QA Scenarios**:
  ```
  Scenario: Magic link login creates verified user
    Tool: Bash (curl)
    Preconditions: Auth server running, no existing user
    Steps:
      1. POST /api/auth/magic/send with {"email":"newuser@pos.idserve.net"} + Origin header
      2. Assert 200 + success message
      3. Extract magic token via mock Resend: `const { token } = mockResend.extractMagicLink()` — parses the magic link URL from the captured email HTML
      4. GET /api/auth/magic/verify?token={extracted_token}
      5. Assert 302 redirect to /mypage
      6. Assert Set-Cookie header contains "session=" with "Domain=.adapos.tech"
      7. Use session cookie to GET /api/me
      8. Assert user.isVerified === true
      9. Assert user.verifiedEmail === "newuser@pos.idserve.net"
    Expected Result: New verified user created, session active, auto-verified
    Failure Indicators: is_verified=false, no session cookie, redirect to login
    Evidence: .sisyphus/evidence/task-10b-magic-login.txt

  Scenario: Magic link links to existing Apple Sign-In account
    Tool: Bash (curl + vitest)
    Preconditions: Existing Apple user with verified_email="existing@pos.idserve.net"
    Steps:
      1. POST /api/auth/magic/send with {"email":"existing@pos.idserve.net"} + Origin header
      2. Assert 200
      3. Verify magic link token
      4. GET /api/auth/magic/verify?token={token}
      5. Use session cookie to GET /api/me
      6. Assert user.id matches the EXISTING Apple user's id (not a new user)
    Expected Result: Logged into existing Apple user account, no duplicate
    Failure Indicators: New user created, different user.id
    Evidence: .sisyphus/evidence/task-10b-account-link.txt

  Scenario: Non-pos.idserve.net email rejected
    Tool: Bash (curl)
    Preconditions: Auth server running
    Steps:
      1. POST /api/auth/magic/send with {"email":"user@gmail.com"} + Origin header
      2. Assert HTTP status 400
      3. Assert response contains domain validation error
    Expected Result: 400 with clear error message
    Failure Indicators: 200 (any domain accepted)
    Evidence: .sisyphus/evidence/task-10b-domain-reject.txt

  Scenario: Expired/reused token rejected
    Tool: Bash (curl)
    Preconditions: Auth server running
    Steps:
      1. GET /api/auth/magic/verify?token=nonexistent-token
      2. Assert HTTP status 400 or 401
      3. (For reuse) Complete a valid magic link flow
      4. GET /api/auth/magic/verify?token={same_token_again}
      5. Assert HTTP status 400 or 401
    Expected Result: Invalid/reused tokens rejected
    Failure Indicators: 200 on reuse, session created
    Evidence: .sisyphus/evidence/task-10b-token-reject.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add magic link login with @pos.idserve.net and account linking`
  - Files: `apps/auth/app/lib/magic-link.server.ts, apps/auth/app/routes/api.auth.magic.*.ts, apps/auth/app/__tests__/magic-link.test.ts`
  - Pre-commit: `pnpm test`

- [x] 11. 로그인 페이지 (Apple Sign-In + 매직링크 폼)

  **What to do**:
  - `apps/auth/app/routes/login.tsx` — Remix 로그인 페이지 라우트:
    - `loader`: `optionalAuth` 사용 → 이미 인증된 유저 → `/mypage` 리다이렉트
    - `action`: 매직링크 폼 제출 처리 (Remix action → `/api/auth/magic/send` 호출)
    - UI 구성:
      1. **Apple Sign-In 버튼** (Apple HIG 준수: 검은색, Apple 로고) → `/api/auth/apple` 이동
      2. **구분선** ("또는" / "or")
      3. **매직링크 이메일 폼**: @pos.idserve.net 이메일 입력 필드 + "로그인 링크 보내기" 버튼
      4. 폼 제출 후 상태 메시지: "이메일을 확인해주세요" (Remix `useActionData`)
    - 깔끔하고 심플한 디자인 (Apple HIG 영감)
  - `apps/auth/app/routes/_index.tsx` — 루트 라우트:
    - 인증 여부 → /mypage 또는 /login 리다이렉트
  - `apps/auth/app/routes/api.auth.logout.ts` — 로그아웃:
    - `action (POST)`: 세션 삭제 → /login 리다이렉트

  **Must NOT do**:
  - 비밀번호 입력 폼 추가 금지
  - Apple 로고를 커스텀 제작 금지 (공식 리소스 사용)
  - 매직링크 이메일 필드에 @pos.idserve.net 외 도메인 힌트 표시 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: 두 가지 로그인 방법이 깔끔하게 공존하는 UI 디자인.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T12, T13, T16, T17과 병렬)
  - **Parallel Group**: Wave 3 (T6, T8, T10b, T14 완료 후)
  - **Blocks**: T19
  - **Blocked By**: T6, T7, T8, T10b, T14

  **References**:
  - Apple Sign-In 버튼 HIG: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
  - Remix `useActionData`: https://reactrouter.com/start/framework/data-loading
  - Remix form: `<Form method="post">` — progressive enhancement (JS 없어도 동작)
  - 로그인 페이지 UX 패턴: 2가지 수단은 "or" 구분선으로 분리 (Google/GitHub 로그인 패턴 참고)

  **Acceptance Criteria**:
  - [ ] GET /login → 로그인 페이지 렌더 (200)
  - [ ] Apple Sign-In 버튼 존재 + /api/auth/apple 연결
  - [ ] 매직링크 이메일 입력 폼 존재
  - [ ] 매직링크 폼 제출 → "이메일 확인" 메시지 표시
  - [ ] 로그인된 상태에서 GET / → /mypage 리다이렉트
  - [ ] POST /api/auth/logout → 세션 삭제 + /login 리다이렉트

  **QA Scenarios**:
  ```
  Scenario: Login page renders with both login methods
    Tool: Playwright
    Preconditions: Auth server running on localhost:5173
    Steps:
      1. Navigate to http://localhost:5173/login
      2. Wait for page load
      3. Assert page contains Apple Sign-In button (text "Sign in with Apple" or apple logo)
      4. Assert Apple button links to /api/auth/apple
      5. Assert page contains email input field (type="email" or placeholder with pos.idserve.net)
      6. Assert page contains magic link submit button
      7. Take screenshot
    Expected Result: Both Apple Sign-In button and magic link form visible
    Failure Indicators: Missing one of the two methods, broken layout
    Evidence: .sisyphus/evidence/task-11-login-dual.png

  Scenario: Magic link form shows confirmation after submit
    Tool: Playwright
    Preconditions: Auth server running, Resend mocked
    Steps:
      1. Navigate to /login
      2. Type "test@pos.idserve.net" into email input
      3. Click submit button
      4. Wait for page update
      5. Assert page contains confirmation text (e.g., "이메일을 확인" or "check your email")
    Expected Result: Confirmation message displayed after form submission
    Failure Indicators: Error message, page crash, no feedback
    Evidence: .sisyphus/evidence/task-11-magic-form.png

  Scenario: Authenticated user redirected from root to mypage
    Tool: Bash (vitest)
    Preconditions: Test user + session created via `seedTestUser(db)` + `createTestSession(kv, userId)` in miniflare test env
    Steps:
      1. Create test session via helper: `const { sessionId } = await createTestSession(kv, userId)`
      2. Make GET / request with Cookie: `session={sessionId}`
      3. Assert response is 302 redirect to /mypage
    Expected Result: Redirect to my page
    Failure Indicators: Stays on login, 500 error
    Evidence: .sisyphus/evidence/task-11-auth-redirect.png
  ```

  **Commit**: YES (groups with T12, T13, T14)
  - Message: `feat(ui): add login page, my page, developer portal with shared layout`
  - Files: `apps/auth/app/routes/login.tsx, apps/auth/app/routes/_index.tsx, apps/auth/app/routes/api.auth.logout.ts`

- [x] 12. 마이페이지 (프로필 조회/편집, R2 사진 업로드)

  **What to do**:
  - `apps/auth/app/routes/mypage.tsx` — Remix 마이페이지 라우트 (`loader` + `action`):
    - `loader`: `requireAuthPage` 사용 (미인증 → /login 리다이렉트)
    - `action`: `requireAuthPage` 사용 + `validateCsrf`
    - 프로필 카드: 사진, 닉네임, 이름, 이메일(Apple), 인증 이메일(pos.idserve.net), 소개글, 연락처, SNS
    - 프로필 편집 폼: 각 필드 수정 가능 (HTML form + POST)
    - 사진 업로드: file input → POST /api/me/photo → 미리보기 업데이트
    - 이메일 인증 섹션: 미인증 → "pos.idserve.net 이메일 인증" 버튼. 인증 완료 → 녹색 배지
    - 로그아웃 버튼
  - SNS 링크: key-value 형태 (플랫폼명: URL). 동적으로 추가/삭제 가능 (최소 JS 사용)
  - 프로필 편집 제출 → PATCH /api/me → 성공 시 페이지 새로고침

  **Must NOT do**:
  - 클라이언트 사이드 상태 관리 라이브러리 사용 금지 (Remix loader/action으로 충분)
  - 프로필 사진 클라이언트 리사이즈 금지 (서버에서 처리 또는 원본 업로드)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: 프로필 편집 UI + 파일 업로드 + 동적 요소.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T11, T13, T16, T17과 병렬)
  - **Parallel Group**: Wave 3 (T8, T9, T10, T14 완료 후)
  - **Blocks**: T19
  - **Blocked By**: T8, T9, T10, T14

  **References**:
  - R2 파일 업로드: `bucket.put(key, request.body)` with `httpMetadata`
  - Hono multipart: `import { parseFormData } from 'hono/multipart'` 또는 native `request.formData()`
  - HTML form multipart: `enctype="multipart/form-data"`

  **Acceptance Criteria**:
  - [ ] GET /mypage → 프로필 페이지 렌더 (인증 필요)
  - [ ] 모든 프로필 필드 표시 (닉네임, 이름, bio, contact, snsLinks)
  - [ ] 프로필 편집 폼 제출 → PATCH /api/me → 성공
  - [ ] 사진 업로드 → R2 저장 → 미리보기
  - [ ] 이메일 미인증 → 인증 버튼 표시
  - [ ] 이메일 인증 완료 → 녹색 배지

  **QA Scenarios**:
  ```
  Scenario: Profile edit form works end-to-end
    Tool: Playwright
    Preconditions: Auth server running on localhost:5173. Test user + session pre-seeded: run `await seedTestUser(db)` + `await createTestSession(kv, userId)` in test setup, then set browser cookie `session={sessionId}` on localhost:5173 domain before navigation
    Steps:
      1. Set cookie: `document.cookie = "session={sessionId}; path=/"`
      2. Navigate to http://localhost:5173/mypage
      3. Assert page loads (not redirected to /login)
      4. Find nickname input field (input[name="nickname"] or label "닉네임")
      5. Clear and type "TestNickname"
      6. Find and click submit/save button (button[type="submit"])
      7. Wait for page reload (wait for "TestNickname" text)
      8. Assert nickname field now shows "TestNickname"
    Expected Result: Profile updated and displayed correctly
    Failure Indicators: Redirected to /login (auth failed), form submission error, old value persists
    Evidence: .sisyphus/evidence/task-12-profile-edit.png

  Scenario: Unverified email shows verification button
    Tool: Playwright
    Preconditions: Auth server running. Test user created with `is_verified=false` via `seedTestUser(db, { isVerified: false })` + session via `createTestSession(kv, userId)`. Browser cookie set.
    Steps:
      1. Set cookie: `document.cookie = "session={sessionId}; path=/"`
      2. Navigate to http://localhost:5173/mypage
      3. Find email verification section
      4. Assert "인증" or "verify" button is visible (button or a element containing verification text)
      5. Assert NO green badge/checkmark present (no .verified-badge or ✓ icon)
    Expected Result: Verification button visible, no verified badge
    Failure Indicators: Badge shown for unverified user, button missing
    Evidence: .sisyphus/evidence/task-12-unverified.png
  ```

  **Commit**: YES (groups with T11, T13, T14)
  - Message: `feat(ui): add login page, my page, developer portal with shared layout`
  - Files: `apps/auth/app/pages/mypage.tsx`

- [x] 13. 개발자 포털 (앱 등록, API 키 발급/관리)

  **What to do**:
  - `apps/auth/app/routes/developer.tsx` — Remix 개발자 포털 라우트 (`loader` + `action`):
    - `loader`: `requireAuthPage` 사용 (미인증 → /login 리다이렉트) + isVerified 체크
    - `action`: `requireAuthPage` + `validateCsrf`
    - 접근 조건: requireAuthPage + isVerified (pos.idserve.net 인증 완료 필수)
    - 미인증 유저 → "이메일 인증 후 이용 가능" 안내 + 마이페이지 링크
    - 앱 목록: 등록된 앱들 (이름, API 키 prefix, 생성일, 상태)
    - 앱 등록 폼: 앱 이름, 설명, Redirect URL (선택)
    - API 키: **생성 시 1회만 전체 표시** → 이후에는 prefix만 표시 (ak_xxxx...)
    - 앱 삭제/비활성화 버튼
  - `apps/auth/app/routes/api.developer.apps.ts` — Remix 리소스 라우트:
    - `loader (GET)`: 유저의 앱 목록 (`requireAuthApi` + verified 체크)
    - `action (POST)`: 앱 등록 → API 키 생성 → **평문 키는 응답에만 포함, DB에는 hash 저장** (`requireAuthApi`)
  - `apps/auth/app/routes/api.developer.apps.$id.ts` — Remix 동적 리소스 라우트:
    - `action (DELETE)`: 앱 삭제 (`requireAuthApi`)
    - `action (PATCH)`: 앱 정보 수정 / 키 재발급 (`requireAuthApi`)
  - `apps/auth/app/lib/apikey.server.ts`:
    - `generateApiKey()` — `ak_` prefix + crypto.randomUUID() → `ak_xxxxxxxx-xxxx-...`
    - `hashApiKey(key)` — SHA-256 해시
    - `verifyApiKey(key, hash)` — 해시 비교
  - `apps/auth/app/__tests__/developer.test.ts`

  **Must NOT do**:
  - API 키를 DB에 평문 저장 금지 (hash만)
  - 생성 이후 API 키 전체 조회 기능 금지 (보안상 1회만 표시)
  - 이메일 미인증 유저의 앱 등록 허용 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: 개발자 대시보드 UI + CRUD API + API 키 보안 로직.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T11, T12, T16, T17과 병렬)
  - **Parallel Group**: Wave 3 (T8, T9, T10, T14 완료 후)
  - **Blocks**: T20
  - **Blocked By**: T8, T9, T10, T14

  **References**:
  - API 키 해싱: `crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))`
  - CF Workers crypto: Web Crypto API 사용 (Node.js crypto 아님)
  - API 키 prefix 패턴: Stripe (`sk_live_`), Resend (`re_`), 우리는 `ak_`

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- developer` → ALL PASS
  - [ ] 미인증 유저 → 개발자 포털 접근 차단
  - [ ] POST /api/developer/apps → 앱 생성 + 평문 API 키 1회 반환
  - [ ] GET /api/developer/apps → API 키 prefix만 반환 (전체 키 없음)
  - [ ] DELETE /api/developer/apps/:id → 앱 삭제

  **QA Scenarios**:
  ```
  Scenario: App registration returns API key exactly once
    Tool: Bash (vitest)
    Preconditions: Verified user + session via `const { userId } = await createVerifiedUser(db, kv);` (creates user with is_verified=true and active session, returns { userId, sessionId })
    Steps:
      1. POST /api/developer/apps with `Cookie: session={sessionId}`, `Origin: http://localhost:5173`, body `{"name":"Test App"}`
      2. Assert HTTP status 200/201
      3. Assert response JSON contains "apiKey" field starting with "ak_"
      4. Save the full API key value
      5. GET /api/developer/apps with `Cookie: session={sessionId}`
      6. Find the created app in the response list
      7. Assert the app's apiKeyPrefix field shows only prefix (e.g., "ak_xxxx")
      8. Assert the full API key string is NOT present anywhere in the list response body
    Expected Result: Full key on creation only, prefix on subsequent reads
    Failure Indicators: Full key in list, no key on creation, missing apiKeyPrefix
    Evidence: .sisyphus/evidence/task-13-api-key-once.txt

  Scenario: Unverified user cannot access developer portal API
    Tool: Bash (vitest)
    Preconditions: Unverified user + session via `const { userId } = await seedTestUser(db, { isVerified: false }); const { sessionId } = await createTestSession(kv, userId);`
    Steps:
      1. GET /api/developer/apps with `Cookie: session={sessionId}`
      2. Assert HTTP status is 403
      3. Assert response JSON contains error about verification required
    Expected Result: 403 Forbidden with clear error message
    Failure Indicators: 200 (verification not checked), 401 (wrong error type)
    Evidence: .sisyphus/evidence/task-13-unverified-block.txt
  ```

  **Commit**: YES (groups with T11, T12, T14)
  - Message: `feat(ui): add login page, my page, developer portal with shared layout`
  - Files: `apps/auth/app/pages/developer.tsx, apps/auth/app/routes/developer.ts, apps/auth/app/lib/apikey.ts, apps/auth/app/__tests__/developer.test.ts`

- [x] 14. Remix 공유 레이아웃 + 스타일 (root.tsx, CSS, 네비게이션)

  **What to do**:
  - `apps/auth/app/root.tsx` — Remix 루트 레이아웃:
    - 헤더: adapos.tech 로고/타이틀 + 네비게이션 (마이페이지, 개발자 포털, 로그아웃)
    - 헤더는 인증 상태에 따라 변경 (미로그인: Sign In만, 로그인: 네비게이션 전체)
    - 메인 콘텐츠 영역
    - 푸터: © Apple Developer Academy @ POSTECH
  - `apps/auth/app/styles/global.css` — 글로벌 스타일 (Remix `links` export로 로드):
    - 심플하고 클린한 디자인 (Apple HIG 영감)
    - 모바일 반응형
    - 다크모드 지원 (prefers-color-scheme)
    - 폰트: system-ui (Apple 기기 최적화)
  - Remix `<NavLink>` 컴포넌트로 네비게이션 (active 상태 자동 표시)

  **Must NOT do**:
  - Tailwind, styled-components 등 CSS 프레임워크 금지 (바닐라 CSS)
  - 외부 폰트 로드 금지 (system-ui로 통일)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: 레이아웃 + CSS 디자인.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T2-T5와 병렬)
  - **Parallel Group**: Wave 1b (T1 완료 후, Wave 3 시작 전에 완료 필요 — T11, T12, T13이 의존)
  - **Blocks**: T11, T12, T13
  - **Blocked By**: T1

  **References**:
  - Remix root.tsx: https://reactrouter.com/start/framework/route-module#layout-export
  - Remix links: `export const links: LinksFunction` for CSS loading
  - Remix NavLink: `import { NavLink } from 'react-router'` — active 상태 자동 관리
  - Apple HIG: 심플한 컬러 팔레트, 충분한 여백, 선명한 타이포그래피
  - CSS prefers-color-scheme: `@media (prefers-color-scheme: dark) { ... }`

  **Acceptance Criteria**:
  - [ ] 모든 페이지에 공유 헤더/푸터 적용
  - [ ] 네비게이션 링크 작동 (마이페이지, 개발자 포털, 로그아웃)
  - [ ] 모바일 반응형 (320px~1280px)
  - [ ] 다크모드 지원

  **QA Scenarios**:
  ```
  Scenario: Root layout renders with header and footer on a test page
    Tool: Bash (vitest)
    Preconditions: root.tsx implemented, Remix dev server running
    Steps:
      1. Create a minimal test route (e.g., /test-layout) that renders within root layout
      2. Render the root layout component in test
      3. Assert output HTML contains <header> element
      4. Assert output HTML contains <nav> element with navigation links
      5. Assert output HTML contains <footer> with "Apple Developer Academy" text
    Expected Result: Root layout renders header, nav, and footer correctly
    Failure Indicators: Missing elements, rendering error
    Evidence: .sisyphus/evidence/task-14-layout-render.txt

  Scenario: CSS loads and mobile responsive
    Tool: Playwright
    Preconditions: Remix dev server running, /login page exists (from T11 if already done, otherwise /test-layout)
    Steps:
      1. Set viewport to 375x812 (iPhone 14)
      2. Navigate to http://localhost:5173/login (or /test-layout)
      3. Assert page content is not clipped or overflowing horizontally
      4. Assert CSS file is loaded (check <link> tag in HTML)
      5. Take screenshot
      6. Set viewport to 1280x800 (desktop)
      7. Take screenshot
    Expected Result: CSS loaded, page adapts to both viewports
    Failure Indicators: Horizontal scroll, missing CSS, unstyled page
    Evidence: .sisyphus/evidence/task-14-responsive-mobile.png, task-14-responsive-desktop.png
  ```

  > **Note**: Full cross-page layout consistency (mypage, developer) is verified in Wave FINAL (F3) after all pages are built.

  **Commit**: YES (groups with T11, T12, T13)
  - Message: `feat(ui): add login page, my page, developer portal with shared layout`
  - Files: `apps/auth/app/pages/layout.tsx, apps/auth/app/static/styles.css`

- [x] 15. @adapos/auth SDK 코어 (HTTP 클라이언트, 타입)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `packages/auth-sdk/src/client.ts` — AdaposAuthClient:
    ```typescript
    export function createAdaposAuth(config: { apiKey: string; authUrl?: string }) {
      // authUrl 기본값: 'https://adapos.tech'
      // 내부적으로 fetch 사용
    }
    ```
    - `client.verifySession(sessionId)` — POST /api/sdk/verify-session (API key in Authorization header)
    - `client.getUser(userId)` — GET /api/sdk/users/:id
    - `client.getCurrentUser(sessionId)` — 세션 → 유저 정보 한번에 조회
  - `packages/auth-sdk/src/cache.ts` — API 키 검증 캐시:
    - in-memory `Map<string, { valid: boolean; expiresAt: number }>`
    - TTL: 30초 기본값 (config으로 변경 가능)
    - `isApiKeyValid(cache, apiKey)` — 캐시 확인 → 없으면 서버에 검증 요청
  - `packages/auth-sdk/src/index.ts` — 메인 export:
    - `createAdaposAuth`, `AdaposAuthClient`
    - 모든 타입 re-export from `./types`
  - `packages/auth-sdk/tsup.config.ts` — 빌드 설정 (ESM + CJS dual)
  - `packages/auth-sdk/src/__tests__/client.test.ts`

  **Must NOT do**:
  - SDK가 KV/D1 직접 접근 금지 (HTTP 통신만)
  - axios 등 외부 HTTP 라이브러리 사용 금지 (native fetch만)
  - API 키를 로그에 출력 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: SDK 패키지 핵심 구조. 인터페이스 설계가 중요.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T9, T10과 병렬 — T3만 의존)
  - **Parallel Group**: Wave 2c (T3 완료 후)
  - **Blocks**: T16, T17
  - **Blocked By**: T3

  **References**:
  - tsup: `import { defineConfig } from 'tsup'` — ESM + CJS 빌드
  - fetch API: `fetch(url, { headers: { 'Authorization': 'Bearer ak_xxx' } })`
  - Clerk SDK 패턴: zero-config, typed, lazy auth

  **Acceptance Criteria**:
  - [ ] `pnpm --filter @adapos/auth test` → ALL PASS
  - [ ] `pnpm --filter @adapos/auth build` → ESM + CJS 출력
  - [ ] createAdaposAuth({ apiKey }) → 클라이언트 인스턴스 반환
  - [ ] 캐시: 동일 API 키 30초 내 재검증 → 서버 요청 없음

  **QA Scenarios**:
  ```
  Scenario: SDK client creates and verifies session
    Tool: Bash (vitest)
    Preconditions: SDK package built, mock server available
    Steps:
      1. Create client with createAdaposAuth({ apiKey: "ak_test", authUrl: "http://localhost:5173" })
      2. Call client.verifySession("test-session-id")
      3. Assert request includes Authorization header with API key
      4. Assert response is parsed into typed AdaposUser or null
    Expected Result: Client sends correct request and parses typed response
    Failure Indicators: Missing auth header, parse error
    Evidence: .sisyphus/evidence/task-15-sdk-client.txt

  Scenario: API key cache prevents duplicate requests
    Tool: Bash (vitest)
    Preconditions: SDK with mock fetch
    Steps:
      1. Create client
      2. Call verifySession twice within 30 seconds
      3. Assert fetch was called only once (second used cache)
    Expected Result: Cache prevents redundant server calls
    Failure Indicators: Two fetch calls, cache miss
    Evidence: .sisyphus/evidence/task-15-cache.txt
  ```

  **Commit**: YES (groups with T16, T17)
  - Message: `feat(sdk): add @adapos/auth SDK with Hono and Express middleware`
  - Files: `packages/auth-sdk/src/*`
  - Pre-commit: `pnpm --filter @adapos/auth test`

- [x] 16. Hono 미들웨어 (adaposAuth, getAuth)

  **What to do**:
  - TDD: 테스트 먼저 → 구현
  - `packages/auth-sdk/src/hono.ts`:
    ```typescript
    import { createMiddleware } from 'hono/factory';

    export function adaposAuth(config: { apiKey: string; authUrl?: string }) {
      const client = createAdaposAuth(config);

      return createMiddleware(async (c, next) => {
        const sessionId = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];
        // Lazy function 패턴 (Clerk 참고)
        c.set('auth', (opts?: AuthOpts) => {
          if (!sessionId) return { user: null, session: null, isAuthenticated: false };
          // 캐시된 세션 검증 결과 반환
          return cachedVerify(client, sessionId);
        });
        await next();
      });
    }

    // 헬퍼 함수
    export function getAuth(c: Context): AuthContext { return c.get('auth')(); }
    export function requireAuth(config) {
      // adaposAuth + 미인증 시 401 자동 반환
    }
    ```
  - `packages/auth-sdk/src/__tests__/hono.test.ts` — 테스트:
    - adaposAuth 미들웨어 적용 → auth context 설정
    - getAuth → 타입 안전한 유저 정보 반환
    - requireAuth → 미인증 시 401
    - lazy function: getAuth 호출 전까지 서버 요청 없음

  **Must NOT do**:
  - auth를 eager evaluation 금지 (lazy function 패턴 필수)
  - Hono 전용 API에 의존하는 로직을 client.ts에 넣기 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Hono 미들웨어 + lazy auth 패턴. 프레임워크 통합.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T11, T12, T13, T17과 병렬)
  - **Parallel Group**: Wave 3 (T15 완료 후)
  - **Blocks**: T18, T19
  - **Blocked By**: T3, T15

  **References**:
  - Hono createMiddleware: https://hono.dev/docs/helpers/factory#createmiddleware
  - Hono context variables: `c.set(key, value)`, `c.get(key)` — 제네릭 타입 지원
  - Clerk Hono middleware: lazy `c.set('clerkAuth', authObjectFn)` 패턴

  **Acceptance Criteria**:
  - [ ] `pnpm --filter @adapos/auth test -- hono` → ALL PASS
  - [ ] adaposAuth() → Hono 미들웨어 반환
  - [ ] getAuth(c) → AuthContext 반환 (타입 안전)
  - [ ] requireAuth() → 미인증 → 401 자동
  - [ ] lazy: getAuth 호출 전 서버 요청 0회

  **QA Scenarios**:
  ```
  Scenario: Hono middleware protects route
    Tool: Bash (vitest)
    Preconditions: Test Hono app with adaposAuth middleware
    Steps:
      1. Create test Hono app with requireAuth() on /protected
      2. Request /protected without session cookie
      3. Assert 401 response
      4. Request /protected with valid session cookie (mocked)
      5. Assert 200 response with user data
    Expected Result: Middleware blocks unauthenticated, allows authenticated
    Failure Indicators: 200 without auth, 401 with valid session
    Evidence: .sisyphus/evidence/task-16-hono-middleware.txt

  Scenario: Lazy evaluation — no server call until getAuth()
    Tool: Bash (vitest)
    Preconditions: Test Hono app with adaposAuth (optional, not required)
    Steps:
      1. Create test app with adaposAuth() (optional)
      2. Create route that does NOT call getAuth
      3. Make request
      4. Assert zero fetch calls to auth server
      5. Create route that DOES call getAuth
      6. Make request
      7. Assert one fetch call to auth server
    Expected Result: Fetch only happens when getAuth is called
    Failure Indicators: Fetch on every request regardless
    Evidence: .sisyphus/evidence/task-16-lazy-eval.txt
  ```

  **Commit**: YES (groups with T15, T17)
  - Message: `feat(sdk): add @adapos/auth SDK with Hono and Express middleware`
  - Files: `packages/auth-sdk/src/hono.ts, packages/auth-sdk/src/__tests__/hono.test.ts`

- [x] 17. Express/generic 미들웨어

  **What to do**:
  - `packages/auth-sdk/src/express.ts`:
    ```typescript
    export function adaposAuthExpress(config: { apiKey: string; authUrl?: string }) {
      return async (req: Request, res: Response, next: NextFunction) => {
        const sessionId = req.cookies?.session;
        req.auth = () => { /* lazy function 동일 패턴 */ };
        next();
      };
    }
    export function requireAuthExpress(config) { /* 미인증 → 401 */ }
    ```
  - `packages/auth-sdk/src/generic.ts` — 프레임워크 무관 헬퍼:
    ```typescript
    export async function verifyRequest(request: Request, config) {
      // Web standard Request 기반 → 어떤 프레임워크에서도 사용 가능
    }
    ```
  - `packages/auth-sdk/src/__tests__/express.test.ts`

  **Must NOT do**:
  - express를 dependency에 추가 금지 (peerDependency 또는 타입만)
  - Hono 미들웨어와 코드 중복 금지 (공통 로직은 client.ts에)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Hono 미들웨어 패턴 복사 + Express 어댑터. 간단한 작업.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T11, T12, T13, T16과 병렬)
  - **Parallel Group**: Wave 3 (T15 완료 후)
  - **Blocks**: T18
  - **Blocked By**: T3, T15

  **References**:
  - Express middleware 시그니처: `(req, res, next) => void`
  - Web standard Request: `new Request(url, { headers })` — CF Workers, Deno, Bun 호환

  **Acceptance Criteria**:
  - [ ] `pnpm --filter @adapos/auth test -- express` → ALL PASS
  - [ ] Express 미들웨어 동작 확인
  - [ ] generic verifyRequest 동작 확인
  - [ ] express가 dependency가 아닌 peerDependency 확인

  **QA Scenarios**:
  ```
  Scenario: Express middleware adds auth to request
    Tool: Bash (vitest)
    Preconditions: Mock Express req/res/next
    Steps:
      1. Create mock request with session cookie
      2. Call adaposAuthExpress middleware
      3. Assert req.auth is a function
      4. Call req.auth()
      5. Assert returns AuthContext object
    Expected Result: Middleware attaches lazy auth function to request
    Failure Indicators: req.auth undefined, not a function
    Evidence: .sisyphus/evidence/task-17-express.txt
  ```

  **Commit**: YES (groups with T15, T16)
  - Message: `feat(sdk): add @adapos/auth SDK with Hono and Express middleware`
  - Files: `packages/auth-sdk/src/express.ts, packages/auth-sdk/src/generic.ts, packages/auth-sdk/src/__tests__/express.test.ts`

- [x] 18. SDK README + 사용 예제

  **What to do**:
  - `packages/auth-sdk/README.md`:
    - Quick Start (5줄 이내로 연동 완료)
    - 설치: `pnpm add @adapos/auth`
    - Hono 예제:
      ```typescript
      import { adaposAuth, getAuth } from '@adapos/auth/hono';
      app.use('*', adaposAuth({ apiKey: env.ADAPOS_API_KEY }));
      app.get('/protected', (c) => {
        const auth = getAuth(c);
        if (!auth.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401);
        return c.json({ user: auth.user });
      });
      ```
    - Express 예제
    - Generic (Web Request) 예제
    - API 레퍼런스 (모든 export된 함수/타입)
    - 캐싱 동작 설명 (30s TTL, 전파 지연)
    - FAQ: "API 키는 어디서 발급?", "클라이언트에서 사용 가능?", "세션 만료 시?"

  **Must NOT do**:
  - 불필요한 장문 설명 금지 (개발자가 빠르게 복붙할 수 있도록)
  - API 키를 README 예제에 하드코딩 금지 (env 변수 사용)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Reason: 순수 문서 작성.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T20, T22와 병렬)
  - **Parallel Group**: Wave 4 (T16, T17 완료 후)
  - **Blocks**: None
  - **Blocked By**: T16, T17

  **References**:
  - Clerk README 스타일: 짧고 직관적, 코드 예제 중심
  - npm package README 모범 사례: Installation → Quick Start → API Reference

  **Acceptance Criteria**:
  - [ ] README.md 존재
  - [ ] Quick Start 섹션 포함 (5줄 이내)
  - [ ] Hono, Express, Generic 예제 모두 포함
  - [ ] API 레퍼런스 섹션 포함

  **QA Scenarios**:
  ```
  Scenario: README contains all required sections
    Tool: Bash (grep)
    Preconditions: README.md written
    Steps:
      1. grep "Quick Start" packages/auth-sdk/README.md
      2. grep "adaposAuth" packages/auth-sdk/README.md
      3. grep "Express" packages/auth-sdk/README.md
      4. grep "API" packages/auth-sdk/README.md
      5. grep "ADAPOS_API_KEY" packages/auth-sdk/README.md (env var, not hardcoded key)
    Expected Result: All sections present, env var used
    Failure Indicators: Missing section, hardcoded key
    Evidence: .sisyphus/evidence/task-18-readme.txt
  ```

  **Commit**: YES
  - Message: `docs(sdk): add SDK README with usage examples`
  - Files: `packages/auth-sdk/README.md`

- [x] 19. SSO 쿠키 설정 + 서브도메인 통합 테스트

  **What to do**:
  - 전체 인증 플로우를 실제 쿠키 설정과 함께 통합 검증
  - `apps/auth/app/__tests__/sso-integration.test.ts`:
    - 로그인 → 쿠키에 `Domain=.adapos.tech` 설정 확인
    - SDK 미들웨어가 해당 쿠키로 세션 검증 가능 확인
    - 세션 sliding window 동작 확인 (실제 KV TTL 갱신)
    - 로그아웃 → 쿠키 삭제 확인
  - `apps/auth/app/lib/cookie.server.ts` 최종 검증:
    - 로컬 개발 환경: `Domain` 속성 제거 (localhost는 domain cookie 불가)
    - 프로덕션: `Domain=.adapos.tech` 환경변수 기반 설정
    - 환경별 쿠키 설정 분기: `COOKIE_DOMAIN` 환경변수
  - SDK + 인증 서버 간 통합 테스트:
    - 테스트용 Hono 서버 생성 (SDK 미들웨어 적용)
    - 인증 서버에서 발급한 세션으로 SDK 서버 접근 확인

  **Must NOT do**:
  - 쿠키 Domain을 하드코딩 금지 (환경변수 사용)
  - SameSite=Strict 사용 금지 (서브도메인 SSO가 깨짐)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: SSO 통합 검증. 쿠키, 세션, SDK 전체 연결점 확인 필요.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T21과 병렬 가능하나 T21은 T19 의존)
  - **Parallel Group**: Wave 5 (T7, T11, T16, T20 완료 후)
  - **Blocks**: T21
  - **Blocked By**: T7, T11, T16, T20

  **References**:
  - Cookie Domain: `.adapos.tech` (프로덕션), 제거 (로컬)
  - `Set-Cookie` 속성: `HttpOnly; Secure; SameSite=Lax; Path=/`
  - SDK `verifySession` API: POST /api/sdk/verify-session

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- sso-integration` → ALL PASS
  - [ ] 프로덕션 쿠키: Domain=.adapos.tech 포함
  - [ ] 로컬 쿠키: Domain 속성 없음
  - [ ] SDK → 인증 서버 세션 검증 성공
  - [ ] 세션 sliding window 실제 동작 확인

  **QA Scenarios**:
  ```
  Scenario: Cookie domain adapts to environment
    Tool: Bash (vitest)
    Preconditions: cookie.server.ts with COOKIE_DOMAIN support
    Steps:
      1. Call setSessionCookie with COOKIE_DOMAIN=".adapos.tech"
      2. Assert Set-Cookie contains "Domain=.adapos.tech"
      3. Call setSessionCookie with COOKIE_DOMAIN="" (local)
      4. Assert Set-Cookie does NOT contain "Domain="
    Expected Result: Domain attribute adapts to env
    Failure Indicators: Hardcoded domain, missing env support
    Evidence: .sisyphus/evidence/task-19-cookie-env.txt

  Scenario: SDK verifies session from auth server (POST-T20 integration)
    Tool: Bash (vitest)
    Preconditions: Auth server running in miniflare, T20 SDK routes deployed, test user + session + API key created via helpers
    Steps:
      1. Create test state: `const { sessionId } = await createTestSession(kv, userId); const { apiKey } = await createTestApp(db, userId);`
      2. Call POST /api/sdk/verify-session with Authorization: `Bearer {apiKey}` and body `{"sessionId":"{sessionId}"}`
      3. Assert response 200 with user object
      4. Assert user.id matches test user
    Expected Result: SDK verification returns correct user
    Failure Indicators: 401/403, wrong user data
    Evidence: .sisyphus/evidence/task-19-sdk-sso.txt
  ```

  > **Note**: SDK verification scenario requires T20 completion. T19 focuses on cookie SSO first, SDK integration tested after T20.

  **Commit**: YES (groups with T20)
  - Message: `feat(sso): configure cross-subdomain SSO and API key validation`
  - Files: `apps/auth/app/__tests__/sso-integration.test.ts, apps/auth/app/lib/cookie.server.ts`
  - Pre-commit: `pnpm test`

- [x] 20. API 키 검증 엔드포인트 + Rate limiting

  **What to do**:
  - `apps/auth/app/routes/api.sdk.verify-session.ts` — SDK용 세션 검증 리소스 라우트:
    - `action (POST)`: Authorization 헤더에서 API 키 추출 → 해시 비교 → 유효한 앱인지 확인 → 세션 ID로 유저 정보 반환
    - 요청: `{ sessionId: string }`
    - 응답: `{ user: AdaposUser, session: AdaposSession }` 또는 `{ error: string }`
  - `apps/auth/app/routes/api.sdk.verify-key.ts` — API 키 유효성 검증:
    - `action (POST)`: API 키만 검증 (앱 정보 반환). SDK 캐시 갱신용.
  - `apps/auth/app/routes/api.sdk.users.$id.ts` — 유저 정보 조회 (SDK용):
    - `loader (GET)`: Authorization 헤더에서 API 키 검증 → userId로 유저 조회 → AdaposUser 반환
    - 없는 유저 → 404
  - `apps/auth/app/lib/rate-limit.server.ts` — 간단한 Rate limiter:
    - KV 기반: `ratelimit:{api_key}:{window}` → 카운터
    - 기본 제한: 분당 100 요청 per API 키
    - 429 Too Many Requests 반환
  - `apps/auth/app/__tests__/sdk-api.test.ts` — 테스트

  **Must NOT do**:
  - API 키 없는 요청 허용 금지
  - Rate limit을 in-memory만으로 구현 금지 (KV 기반 — Worker isolate 간 공유)
  - 유저 정보에 API 키 해시 포함 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: SDK API + Rate limiting. 보안 검증 로직.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T18, T22와 병렬)
  - **Parallel Group**: Wave 4 (T9, T13 완료 후)
  - **Blocks**: T19, T21
  - **Blocked By**: T9, T13

  **References**:
  - KV rate limit: `kv.put(key, count, { expirationTtl: 60 })` — 1분 윈도우
  - API 키 해시 비교: SHA-256 (T13 apikey.server.ts의 hashApiKey 재사용)
  - Authorization header: `Authorization: Bearer ak_xxxx`

  **Acceptance Criteria**:
  - [ ] `pnpm --filter auth test -- sdk-api` → ALL PASS
  - [ ] POST /api/sdk/verify-session without API key → 401
  - [ ] POST /api/sdk/verify-session with invalid key → 403
  - [ ] POST /api/sdk/verify-session with valid key + valid session → 유저 정보
  - [ ] GET /api/sdk/users/:id with valid key → 유저 정보
  - [ ] GET /api/sdk/users/:id with unknown id → 404
  - [ ] Rate limit 초과 시 → 429

  **QA Scenarios**:
  ```
  Scenario: Valid API key + valid session returns user
    Tool: Bash (curl)
    Preconditions: Auth server running, test app with API key, test session
    Steps:
      1. curl -s -X POST -H "Authorization: Bearer ak_test_key" -H "Content-Type: application/json" -d '{"sessionId":"valid-session"}' http://localhost:5173/api/sdk/verify-session
      2. Assert HTTP status 200
      3. Assert response contains "user" object with "id", "isVerified" fields
    Expected Result: User data returned for valid request
    Failure Indicators: 401, 403, missing user data
    Evidence: .sisyphus/evidence/task-20-sdk-verify.txt

  Scenario: Missing API key returns 401
    Tool: Bash (curl)
    Preconditions: Auth server running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST -d '{"sessionId":"any"}' http://localhost:5173/api/sdk/verify-session
      2. Assert HTTP status 401
    Expected Result: 401 Unauthorized
    Failure Indicators: 200, 500
    Evidence: .sisyphus/evidence/task-20-no-key.txt
  ```

  **Commit**: YES (groups with T19)
  - Message: `feat(sso): configure cross-subdomain SSO and API key validation`
  - Files: `apps/auth/app/routes/api.sdk.*.ts, apps/auth/app/lib/rate-limit.server.ts, apps/auth/app/__tests__/sdk-api.test.ts`
  - Pre-commit: `pnpm test`

- [x] 21. Cloudflare Pages 배포 설정

  **What to do**:
  - `apps/auth/wrangler.toml` 최종 검증 + 프로덕션 설정:
    - D1 database 바인딩 (프로덕션 + 프리뷰)
    - KV 네임스페이스 바인딩: SESSIONS, EMAIL_TOKENS, MAGIC_TOKENS, RATE_LIMITS
    - R2 버킷 바인딩: PROFILE_PHOTOS
    - 환경변수: COOKIE_DOMAIN, AUTH_URL
    - Secrets (wrangler secret): APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, RESEND_API_KEY, AUTH_SECRET
  - 배포 스크립트: `pnpm deploy` → `wrangler pages deploy`
  - D1 마이그레이션 적용: `wrangler d1 migrations apply`
  - DNS 설정 확인: adapos.tech → CF Pages 프로젝트
  - `apps/auth/scripts/setup-secrets.sh` — 시크릿 등록 스크립트 (실행 가이드)

  **Must NOT do**:
  - 시크릿을 wrangler.toml에 직접 포함 금지
  - .p8 파일을 repo에 커밋 금지
  - production DB를 직접 조작 금지 (마이그레이션만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 설정 파일 정리 + 배포 스크립트. 명확한 작업.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T19 완료 후)
  - **Parallel Group**: Wave 5 (T19, T20 완료 후)
  - **Blocks**: F1-F4
  - **Blocked By**: T19, T20

  **References**:
  - wrangler pages deploy: https://developers.cloudflare.com/pages/configuration/wrangler-configuration/
  - CF Pages 바인딩: `[[d1_databases]]`, `[[kv_namespaces]]`, `[[r2_buckets]]`
  - D1 migrations: `wrangler d1 migrations apply <DB_NAME>`

  **Acceptance Criteria**:
  - [ ] `wrangler pages deploy --dry-run` → 에러 없음
  - [ ] wrangler.toml에 모든 바인딩 선언 (D1, KV×4, R2)
  - [ ] scripts/setup-secrets.sh에 모든 시크릿 등록 명령
  - [ ] .gitignore에 .p8 파일 패턴 포함

  **QA Scenarios**:
  ```
  Scenario: Dry-run deployment succeeds
    Tool: Bash
    Preconditions: wrangler.toml configured, pnpm build succeeds
    Steps:
      1. pnpm --filter auth build
      2. Assert build completes with 0 errors
      3. wrangler pages deploy apps/auth/build --dry-run (or equivalent)
      4. Assert no configuration errors
    Expected Result: Build + dry-run deploy succeed
    Failure Indicators: Build errors, missing binding errors
    Evidence: .sisyphus/evidence/task-21-deploy-dryrun.txt

  Scenario: All bindings declared in wrangler.toml
    Tool: Bash (grep)
    Preconditions: wrangler.toml finalized
    Steps:
      1. grep "d1_databases" apps/auth/wrangler.toml
      2. grep "SESSIONS" apps/auth/wrangler.toml
      3. grep "EMAIL_TOKENS" apps/auth/wrangler.toml
      4. grep "MAGIC_TOKENS" apps/auth/wrangler.toml
      5. grep "PROFILE_PHOTOS" apps/auth/wrangler.toml
      6. grep "RATE_LIMITS" apps/auth/wrangler.toml
    Expected Result: All bindings present
    Failure Indicators: Missing binding declaration
    Evidence: .sisyphus/evidence/task-21-bindings.txt
  ```

  **Commit**: YES (groups with T22)
  - Message: `feat(deploy): add Cloudflare Pages deployment config and error handling`
  - Files: `apps/auth/wrangler.toml, apps/auth/scripts/setup-secrets.sh`
  - Pre-commit: `pnpm build`

- [x] 22. 에러 핸들링 + 로깅 통합

  **What to do**:
  - `apps/auth/app/lib/error.server.ts` — 통합 에러 핸들러:
    - `AppError` 클래스: status, message, code 포함
    - 에러 타입: `AuthError`, `ValidationError`, `RateLimitError`, `AppleAuthError`
    - 에러 → 사용자 친화적 메시지 변환 (내부 세부사항 노출 금지)
  - `apps/auth/app/root.tsx` — Remix ErrorBoundary 구현:
    - 전역 에러 바운더리: 예상치 못한 에러 → 사용자 친화적 에러 페이지
    - 404 처리: 존재하지 않는 라우트 → "페이지를 찾을 수 없습니다"
  - `apps/auth/app/lib/logger.server.ts` — 구조화된 로깅:
    - `console.log` 기반 (CF Workers는 console.log → Worker Logs로 전송)
    - JSON 형태 로그: `{ level, message, userId?, path, method, status, duration }`
    - 민감 정보 마스킹: API 키, 세션 ID는 prefix만 로그
  - 기존 모든 라우트에 에러 핸들링 추가 확인

  **Must NOT do**:
  - 외부 로깅 서비스 추가 금지 (console.log + CF Worker Logs로 충분)
  - 에러 응답에 스택 트레이스 포함 금지 (프로덕션)
  - API 키/세션 전체를 로그에 기록 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: 에러 클래스 + ErrorBoundary + 로거. 패턴 명확.

  **Parallelization**:
  - **Can Run In Parallel**: YES (T18, T20과 병렬)
  - **Parallel Group**: Wave 4 (T1 완료 후 — 독립적이나 Wave 4에서 실행)
  - **Blocks**: T21
  - **Blocked By**: T1

  **References**:
  - Remix ErrorBoundary: https://reactrouter.com/start/framework/error-handling
  - CF Worker Logs: `console.log()` → Workers Logs 자동 전송
  - Remix `isRouteErrorResponse`: 4xx/5xx 구분

  **Acceptance Criteria**:
  - [ ] root.tsx에 ErrorBoundary export 존재
  - [ ] 404 라우트 → 에러 페이지 렌더
  - [ ] AppError 클래스 동작 확인
  - [ ] 로그에 API 키 전체 포함되지 않음 확인

  **QA Scenarios**:
  ```
  Scenario: 404 page renders correctly
    Tool: Playwright
    Preconditions: Auth server running
    Steps:
      1. Navigate to http://localhost:5173/nonexistent-route
      2. Assert page contains "찾을 수 없" or "not found" text
      3. Assert HTTP status 404
      4. Assert no stack trace visible
    Expected Result: User-friendly 404 page
    Failure Indicators: Blank page, stack trace shown, 500 instead of 404
    Evidence: .sisyphus/evidence/task-22-404.png

  Scenario: Logger masks sensitive data
    Tool: Bash (vitest)
    Preconditions: logger.server.ts implemented
    Steps:
      1. Call logger with API key "ak_1234-5678-abcd-efgh"
      2. Capture log output
      3. Assert log contains "ak_1234..." (prefix only)
      4. Assert log does NOT contain "ak_1234-5678-abcd-efgh" (full key)
    Expected Result: Sensitive data masked in logs
    Failure Indicators: Full key in log output
    Evidence: .sisyphus/evidence/task-22-logger-mask.txt
  ```

  **Commit**: YES (groups with T21)
  - Message: `feat(deploy): add Cloudflare Pages deployment config and error handling`
  - Files: `apps/auth/app/lib/error.server.ts, apps/auth/app/root.tsx (ErrorBoundary), apps/auth/app/lib/logger.server.ts`
  - Pre-commit: `pnpm test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify `jose` used everywhere (NOT `jsonwebtoken`). Verify no .p8 keys in repo.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test full Apple Sign-In flow (mock or real). Test email verification flow. Test profile editing + photo upload. Test developer portal + API key creation. Test SDK middleware with test service. Test cross-subdomain SSO. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify no password auth, no Hono standalone (Remix is the framework), no jsonwebtoken.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task(s) | Commit Message | Pre-commit Check |
|--------------|----------------|-----------------|
| T1 | `chore: scaffold monorepo with remix, pnpm workspaces, vitest` | `pnpm build` |
| T2+T3 | `feat(db): add D1 schema, drizzle ORM, and type definitions` | `pnpm typecheck` |
| T4 | `chore(test): configure vitest with miniflare for CF Workers testing` | `pnpm test` |
| T5 | `docs: add Apple Sign in with Apple setup guide` | — |
| T6+T7 | `feat(auth): implement Apple Sign-In flow and session management` | `pnpm test` |
| T8 | `feat(auth): add CSRF validation and auth helper utilities for Remix` | `pnpm test` |
| T9+T10 | `feat(user): add user CRUD and email verification with Resend` | `pnpm test` |
| T10b | `feat(auth): add magic link login with @pos.idserve.net and account linking` | `pnpm test` |
| T11+T12+T13+T14 | `feat(ui): add login page, my page, developer portal with shared layout` | `pnpm test` |
| T15+T16+T17 | `feat(sdk): add @adapos/auth SDK with Hono and Express middleware` | `pnpm test --filter @adapos/auth` |
| T18 | `docs(sdk): add SDK README with usage examples` | — |
| T19+T20 | `feat(sso): configure cross-subdomain SSO and API key validation` | `pnpm test` |
| T21+T22 | `feat(deploy): add Cloudflare deployment config and error handling` | `pnpm deploy --dry-run` |

---

## Success Criteria

### Verification Commands
```bash
pnpm test                    # Expected: ALL PASS
pnpm typecheck               # Expected: 0 errors
pnpm build                   # Expected: build success
curl https://adapos.tech/api/health  # Expected: {"status":"ok"}
```

### Final Checklist
- [ ] Apple Sign-In → 세션 생성 동작
- [ ] @pos.idserve.net 매직링크 로그인 → 세션 생성 + 자동 인증 동작
- [ ] 계정 연결: Apple + 매직링크 동일 이메일 → 같은 계정
- [ ] pos.idserve.net 이메일 인증 동작 (Apple 로그인 유저용)
- [ ] 마이페이지 프로필 편집 동작
- [ ] 개발자 포털 API 키 발급 동작
- [ ] SDK 미들웨어로 다른 서비스에서 인증 확인 동작
- [ ] *.adapos.tech SSO 쿠키 공유 동작
- [ ] API 키 없이 SDK/API 접근 시 401 반환
- [ ] CSRF 보호 동작 (Origin 미일치 시 403)
- [ ] 모든 테스트 통과
- [ ] Cloudflare에 배포 성공
