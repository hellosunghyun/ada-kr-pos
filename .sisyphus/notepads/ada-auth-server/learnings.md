# Learnings — ada-auth-server

## [2026-03-13] Session Start
- Working directory: /Users/hellosunghyun/Documents/Github/adapos.tech
- Project is empty (no files yet, not a git repo)
- T1 will: init git, create pnpm monorepo, scaffold Remix app + SDK package

## Key Technical Decisions
- Framework: Remix (React Router v7) on CF Pages — NOT Hono standalone
- Auth: Apple Sign-In + @pos.idserve.net magic link (NO password)
- JWT lib: `jose` only — `jsonwebtoken` is FORBIDDEN (Node.js crypto dep)
- DB: D1 (users, developer_apps) + KV (sessions, magic tokens, email tokens, rate limits)
- Storage: R2 (profile photos)
- Email: Resend
- CSS: Vanilla CSS, system-ui font — NO Tailwind/styled-components
- Session: opaque token in KV (NOT JWT), sliding window at 50% TTL
- CSRF: Origin header validation (NOT CSRF token form fields)

## Critical Patterns
- Remix has NO `app.use()` middleware — use loader/action utility functions
- Page routes: `requireAuthPage` → redirect to /login on unauth
- API routes: `requireAuthApi` → 401 JSON on unauth
- Auth context: lazy function pattern (Clerk-style)
- CF Workers: Web Crypto API only (NOT Node.js crypto)
- Cookie: `Domain=.adapos.tech` (prod), no Domain (local)

## Task 3: TypeScript Type Definitions

### Completed
- Created `packages/auth-sdk/src/types.ts` with all 7 shared types
- Updated `packages/auth-sdk/src/index.ts` to re-export types
- Verified `apps/auth/app/types/env.ts` complete from T1
- `pnpm typecheck` passes with 0 errors
- Committed: `feat(types): add shared TypeScript type definitions for SDK and Env`

### Type Definitions
- **AdaposUser**: Full user profile with Apple email, verified email, profile data
- **AdaposSession**: Session with expiry tracking
- **AdaposAuthContext**: Authenticated state (user + session)
- **AdaposUnauthContext**: Unauthenticated state (null user/session)
- **AuthContext**: Union type for both auth states
- **DeveloperApp**: OAuth app registration with API key prefix
- **ApiKeyInfo**: API key metadata (prefix only, never full key)

### Key Design Decisions
- All timestamps are Unix milliseconds (JavaScript convention)
- `isVerified` means pos.idserve.net email verified (separate from Apple email)
- `apiKeyPrefix` stores only first 8 chars (security: never expose full key)
- `snsLinks` is `Record<string, string>` for flexible social links
- User ID can be Apple sub OR `"magic_{uuid}"` for magic-link users

### Env Bindings Verified
All required bindings present in `apps/auth/app/types/env.ts`:
- DB, SESSIONS, EMAIL_TOKENS, MAGIC_TOKENS, RATE_LIMITS
- PROFILE_PHOTOS, APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID
- APPLE_PRIVATE_KEY, RESEND_API_KEY, AUTH_SECRET, COOKIE_DOMAIN

## Task 5: Apple Setup Guide (docs/apple-setup.md)

- Services ID (not App ID) is the `client_id` for web OAuth. This is the most common source of `invalid_client` errors.
- `.p8` key file can only be downloaded once from Apple Developer Console. Document this prominently.
- Apple sends authorization code via POST body (`response_mode=form_post`), not GET query params. Must be called out explicitly.
- `email` scope is only returned on first login. Apps must persist it immediately.
- `client_secret` JWT max validity is 6 months (15552000 seconds). Using `jose` to generate per-request avoids rotation concerns entirely.
- Apple OAuth requires HTTPS + registered domain, so localhost testing needs ngrok or a real deployment.
- `AUTH_SECRET` and `RESEND_API_KEY` are also registered as wrangler secrets alongside the 4 Apple-specific ones.

## Task 14: Shared Root Layout + Styles

### Completed
- Created `apps/auth/app/styles/global.css` with Apple HIG-inspired design system
- Updated `apps/auth/app/root.tsx` with full layout (header, nav, main, footer)
- Auth-state aware navigation via cookie check in root loader
- Dark mode support via `prefers-color-scheme: dark` media query
- Mobile responsive (320px-1280px viewport)
- Committed: `feat(ui): add shared root layout with Apple HIG-inspired design`

### Design System Colors
- **Light mode**: Primary #007aff, Background #f5f5f7, Surface #ffffff, Text #1d1d1f
- **Dark mode**: Background #000000, Surface #1c1c1e, Text #f5f5f7
- Semantic colors: Success #34c759 (Apple green), Error #ff3b30 (Apple red)

### Key Patterns
- CSS import in React Router v7: `import css from "~/styles/file.css?url"` then `{ rel: "stylesheet", href: css }`
- Root loader data access: `useRouteLoaderData<typeof loader>("root")` - works from any nested route
- NavLink active state: `className={({ isActive }) => \`nav-link${isActive ? " active" : ""}\`}`
- Auth check for UI: simple cookie string `includes("session=")` - actual auth enforcement happens in route loaders/actions

### Pre-existing Issues
- Typecheck fails due to test config issues (`cloudflare:test` module, vitest wrangler config)
- These are unrelated to layout changes - my files have zero LSP errors

## Task 4: Vitest + Miniflare Test Infrastructure

### Key Learnings

1. **Vitest Version Compatibility**: @cloudflare/vitest-pool-workers@0.13.0 requires vitest@^4.1.0, not 3.x. The pool won't work with older versions.

2. **Pool Configuration in Vitest 4**: The config format changed from `poolOptions` to direct top-level options. Use:
   ```typescript
   import { cloudflarePool } from "@cloudflare/vitest-pool-workers";
   export default defineConfig({
     test: {
       pool: cloudflarePool({ ... })
     }
   });
   ```

3. **Virtual Module Resolution**: The `cloudflare:test` module is a virtual module provided by the pool at runtime. It's not a real npm package. Type definitions are in `@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts`.

4. **TypeScript Configuration**: Add `@cloudflare/vitest-pool-workers/types` to tsconfig.json `types` array to get proper type hints for `cloudflare:test` imports.

5. **Miniflare Bindings**: The pool automatically creates miniflare instances with D1, KV, and R2 bindings configured in vitest.config.ts. These are available via `env` from `cloudflare:test`.

6. **Test File Organization**: 
   - Worker tests go in `apps/auth/app/__tests__/`
   - SDK tests go in `packages/auth-sdk/__tests__/`
   - Both use standard vitest patterns

7. **Setup Helpers**: Created `setup.ts` with KV and email mocking utilities. Full DB helpers will work after T2 creates the schema.

8. **Workspace Configuration**: Root `vitest.workspace.ts` aggregates tests from both packages, allowing `pnpm test` to run all tests in sequence.

### Gotchas

- The pool requires a specific vitest version (4.1.0+)
- `cloudflare:test` module must be imported, not `cloudflare:workers` for test utilities
- Miniflare doesn't support KV wildcard queries in test environment
- The pool adds Node.js compatibility flags automatically (TTY, FS, HTTP modules)

### Files Created

- `apps/auth/vitest.config.ts` - Miniflare pool config with D1, KV, R2 bindings
- `apps/auth/app/__tests__/setup.ts` - Test helpers (KV, email mocking)
- `apps/auth/app/__tests__/health.test.ts` - Basic health check test
- `packages/auth-sdk/vitest.config.ts` - Node environment config
- `packages/auth-sdk/__tests__/basic.test.ts` - Placeholder SDK test
- `vitest.workspace.ts` - Workspace aggregator
- Updated `apps/auth/tsconfig.json` - Added vitest-pool-workers types
- Updated `apps/auth/package.json` - Upgraded vitest to 4.1.0

### Test Results

All tests pass with exit code 0:
- apps/auth: 1 test passed
- packages/auth-sdk: 1 test passed

## Task 7: Session CRUD + Sliding Window + Cookie Helpers

- Implemented server-side KV session helpers with opaque UUID tokens and 7-day TTL.
- Sliding window is enforced on reads: when elapsed time exceeds 50% of TTL, session `expiresAt` and KV TTL are both refreshed.
- Added user-session index helpers (`registerSessionInUserIndex`, `deleteAllUserSessions`) for mass invalidation scenarios.
- Added cookie helpers with secure defaults: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, plus optional `Domain` via `COOKIE_DOMAIN`.
- Vitest path alias resolution needed `vite-tsconfig-paths` in `apps/auth/vitest.config.ts` for `~/*` imports during test runs.

## Task 6: Apple Sign-In flow (jose)

- Apple OAuth authorize endpoint must include `response_mode=form_post`; callback route therefore needs an `action` handler (POST) and can return 405 from `loader` for GET.
- `jose` `SignJWT` + `importPKCS8` works in the Worker runtime for Apple `client_secret` generation with ES256 (`iss=team_id`, `sub=client_id`, `aud=https://appleid.apple.com`).
- Apple ID token verification is safe with `createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"))` + `jwtVerify` using `issuer` and `audience` checks.
- Worker-safe JWT payload decoding for non-verifying extract helpers should normalize base64url + padding before `atob` to avoid malformed decode edge cases.
- `pnpm --filter auth test -- apple` currently runs the auth test set and passed (`3 files`, `20 tests`) after Apple tests were added.
- `pnpm --filter auth build` passes with new Apple API route chunks generated.

## Task 8: CSRF Utilities + Auth Helpers (Remix loader/action helpers)

### Completed
- Created `apps/auth/app/middleware/csrf.server.ts` with `validateCsrf(request)` function
- Created `apps/auth/app/middleware/auth.server.ts` with auth context helpers
- Created `apps/auth/app/__tests__/middleware.test.ts` with 18 comprehensive tests
- All 38 tests pass (20 existing + 18 new middleware tests)
- `pnpm typecheck` → 0 errors
- Committed: `feat(auth): add CSRF validation and auth helper utilities for Remix`

### CSRF Validation Pattern
- **GET/HEAD/OPTIONS**: Always pass (no CSRF check needed)
- **POST/PUT/PATCH/DELETE**: Validate Origin header matches request URL origin
- Mismatch or missing Origin → throw `new Response('Forbidden', { status: 403 })`
- No CSRF token form fields — Origin header validation only

### Auth Middleware Functions
1. **getAuthContext(request, context)**: Internal helper, returns `AuthContext` (union of auth/unauth)
   - Extracts session ID from Cookie header via `getSessionIdFromCookie`
   - Looks up session in KV via `getSession`
   - Queries user from D1 via `getUserById` (with error handling for missing table)
   - Returns `AdaposAuthContext` if valid, `AdaposUnauthContext` if not

2. **requireAuthPage(request, context)**: For HTML page routes
   - Calls `getAuthContext` internally
   - Throws `redirect('/login')` if unauthenticated
   - Returns `AdaposAuthContext` if authenticated

3. **requireAuthApi(request, context)**: For JSON API routes
   - Calls `getAuthContext` internally
   - Throws `new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })` if unauthenticated
   - Returns `AdaposAuthContext` if authenticated

4. **optionalAuth(request, context)**: For routes that work with or without auth
   - Calls `getAuthContext` internally
   - Never throws — returns `AdaposUnauthContext` if no session
   - Returns `AdaposAuthContext` if authenticated

### Context Access Pattern
```typescript
const env = (context as any).cloudflare.env as Env;
const kv = env.SESSIONS;
const db = createDb(env.DB);
```

### getUserById Implementation
- Wraps D1 query in try-catch to handle missing table gracefully
- Maps D1 user row to `AdaposUser` shape
- Parses `snsLinks` JSON with fallback to empty object
- Converts timestamps from Date to milliseconds

### Test Coverage (18 tests)
**CSRF Validation (10 tests)**:
- GET/HEAD/OPTIONS pass without Origin check
- POST/PUT/PATCH/DELETE throw 403 without Origin
- POST/PUT/PATCH/DELETE throw 403 with mismatched Origin
- POST/PUT/PATCH/DELETE pass with matching Origin

**requireAuthPage (3 tests)**:
- Throws redirect('/login') for missing session
- Throws redirect('/login') for invalid session ID
- Throws redirect('/login') when session exists but user not found

**requireAuthApi (3 tests)**:
- Throws 401 JSON for missing session
- Throws 401 JSON for invalid session ID
- Throws 401 JSON when session exists but user not found

**optionalAuth (3 tests)**:
- Returns UnauthContext for missing session (no throw)
- Returns UnauthContext for invalid session ID (no throw)
- Returns UnauthContext when session exists but user not found (no throw)

### Key Learnings
- Remix has NO middleware pipeline — use utility functions called inside loader/action
- Page routes use `throw redirect()` for unauthenticated redirects
- API routes use `throw new Response()` for JSON error responses
- CF bindings accessed via `context.cloudflare.env` (from load-context.ts)
- D1 queries can fail if table doesn't exist — wrap in try-catch for graceful degradation
- TypeScript: `e.json()` returns `unknown` — cast to typed interface when accessing properties
- Vitest pool works with real miniflare D1 bindings — no need for mock D1 in tests

## Task 9: User CRUD + /api/me routes

- `apps/auth/app/lib/user.server.ts` centralizes D1 user CRUD and reuses one row-to-`AdaposUser` mapper so route and auth code stay consistent on timestamp and `snsLinks` serialization.
- D1 `sns_links` remains TEXT in schema, so user writes must `JSON.stringify()` and reads must parse defensively back to `{}` on invalid or null values.
- In the current Vitest workers setup, runtime bindings work from `import { env } from "cloudflare:workers"`; `cloudflare:test` types exist, but direct runtime import failed in this repo.
- Route tests can exercise Remix loader/action modules directly by passing a minimal `AppLoadContext` with `context.cloudflare.env` bindings plus real worker `Request` objects.
- Recreating the `users` table in `beforeEach()` keeps D1-backed tests isolated without adding extra test-only helpers or touching shared setup files.

## Task 10: Email verification flow (Resend)

- `apps/auth/app/lib/email.server.ts` keeps verification tokens single-use by storing `verify:{email}` in KV and deleting the entry immediately after a successful match.
- The repo's existing `mockResend()` helper is enough to test native `fetch` calls to `https://api.resend.com/emails`, so no Resend SDK or extra test helpers are needed.
- In this test setup, route integration tests are stable when they recreate the `users` table, use real worker bindings from `cloudflare:workers`, and invoke the route `action`/`loader` functions directly.
- `pnpm test`, `pnpm typecheck`, and `pnpm --filter auth build` all passed after adding the verification routes and email tests.

## Task 10b: Magic link login + account linking

- Magic login tokens are stored as `magic:{token}` JSON payloads in `MAGIC_TOKENS` with `expirationTtl: 900` (15 minutes), and tokens are deleted immediately on first successful verification to enforce single-use.
- `sendMagicLink` should normalize to lowercase and hard-reject non-`@pos.idserve.net` domains with the exact error message `Invalid email domain. Only @pos.idserve.net allowed.` so routes can map it cleanly to HTTP 400.
- Account linking works by checking `getUserByVerifiedEmail(db, email)` first; if absent, create a new user ID with `magic_${crypto.randomUUID()}` and set `verifiedEmail` + `isVerified: true` at insert time.
- Route `/api/auth/magic/verify` should verify token from `MAGIC_TOKENS`, create the login session in `SESSIONS`, then set the cookie via `setSessionCookie` and redirect to `/mypage`.
- Existing test conventions still use `env` from `cloudflare:workers` plus `mockResend()` to capture email links and extract the token for integration-style assertions.


## Task 11: Login Page UI (Apple Sign-In + Magic Link)

### Completed
- Created `apps/auth/app/routes/login.tsx` with Apple Sign-In button and magic link form
- Updated `apps/auth/app/routes/_index.tsx` with auth-aware redirect (→ /mypage if auth, → /login if not)
- Created `apps/auth/app/routes/api.auth.logout.ts` with session deletion and cookie clearing
- Added login page CSS to `apps/auth/app/styles/global.css` using existing design system
- Registered `/api/auth/logout` route in `routes.ts`
- `pnpm typecheck` → 0 errors
- `pnpm test` → 79 tests pass (66 auth + 13 SDK)
- Committed: `feat(ui): add login page with Apple Sign-In and magic link form`

### Key Patterns
- Login page uses `optionalAuth` in loader → redirects authenticated users to /mypage
- Magic link form action forwards to `/api/auth/magic/send` API route
- Apple Sign-In button: black background, white text, Apple logo SVG (Apple HIG compliant)
- Dark mode: Apple button inverts to white background with black text
- Form validation: HTML5 pattern + server-side domain check for @pos.idserve.net
- Logout route: `deleteSession` from KV + `clearSessionCookie` with COOKIE_DOMAIN from Env

### Design System Usage
- CSS variables: `--color-primary`, `--color-surface`, `--color-text`, `--color-border`, etc.
- Dark mode support via `@media (prefers-color-scheme: dark)`
- Consistent with existing button, form, and card patterns from global.css

## Task 12: My Page (Profile Management UI)

### Completed
- Created `apps/auth/app/routes/mypage.tsx` with profile editing and R2 photo upload
- Added mypage-specific CSS styles to `apps/auth/app/styles/global.css`
- Registered `/mypage` route in `routes.ts`
- `pnpm typecheck` → 0 errors
- `pnpm test` → 79 tests pass (66 auth + 13 SDK)
- Committed: `feat(ui): add my page with profile editing and photo upload`

### Key Patterns
- **Dual action handling**: Single action handles both `multipart/form-data` (photo upload) and regular form submissions (profile update) by checking `Content-Type` header
- **R2 photo upload**: Use `env.PROFILE_PHOTOS` from `Env` type (not `R2Bucket` from workers-types) to avoid type mismatches with `file.stream()`
- **Photo URL storage**: Store as `/api/photos/{key}` (R2 path), not full URL
- **Display user pattern**: `actionData?.user ?? user` shows updated data immediately after successful action
- **Auto-submit photo form**: `onChange={(e) => { if (e.target.files?.length) e.target.form?.submit(); }}`

### Design System
- My page uses existing CSS variables (`--color-primary`, `--color-surface`, etc.)
- Profile photo: 80px circular with fallback background
- Verification badge: green for verified, blue link for unverified
- Mobile responsive: stack vertically on small screens

### Type Safety
- Import `Env` from `~/types/env` for CF bindings
- `file.stream()` type compatibility: `Env.PROFILE_PHOTOS` works, but `R2Bucket` cast fails

## Task 13: Developer Portal (API Key Management)

### Completed
- Created `apps/auth/app/lib/apikey.server.ts` - API key generation + SHA-256 hashing (Web Crypto API)
- Created `apps/auth/app/routes/api.developer.apps.ts` - GET/POST /api/developer/apps
- Created `apps/auth/app/routes/api.developer.apps.$id.ts` - DELETE/PATCH /api/developer/apps/:id
- Created `apps/auth/app/routes/developer.tsx` - Developer portal page with app management
- Added developer portal CSS styles to `apps/auth/app/styles/global.css`
- Registered 3 new routes in `routes.ts`
- Created `apps/auth/app/__tests__/developer.test.ts` - 15 comprehensive tests
- `pnpm test` → 81 tests pass (68 auth + 13 SDK, up from 79)
- `pnpm typecheck` → 0 errors
- Committed: `feat(developer): add developer portal with API key management`

### Key Patterns

**API Key Security**:
- Generate with `ak_${crypto.randomUUID()}` prefix
- Hash with Web Crypto API `crypto.subtle.digest('SHA-256', data)` — NOT Node.js `crypto`
- Store only hash in D1, never plaintext
- Prefix (`ak_` + 8 chars = 11 total) stored for display identification
- Full key returned ONCE on creation, never again

**Verification Gate**:
- Both GET and POST require `auth.user.isVerified === true`
- Unverified users get 403 JSON error
- Page shows "이메일 인증 후 이용 가능" message with link to /mypage

**Ownership Verification**:
- DELETE/PATCH always query with `and(eq(developerApps.id, appId), eq(developerApps.userId, auth.user.id))`
- Returns 404 if app not found OR not owned by user
- Prevents cross-user manipulation

**Test Patterns**:
- Use `env from "cloudflare:workers"` for real D1 bindings
- Create `developer_apps` table in `beforeEach()` alongside `users`
- Set `is_verified = 1` via raw SQL after `createUser` for verified user tests
- Test full key exposure on POST, prefix-only on GET

### Files Created
- `apps/auth/app/lib/apikey.server.ts`
- `apps/auth/app/routes/api.developer.apps.ts`
- `apps/auth/app/routes/api.developer.apps.$id.ts`
- `apps/auth/app/routes/developer.tsx`
- `apps/auth/app/__tests__/developer.test.ts`

## Task 16: Hono middleware for @adapos/auth

- Hono integration fits cleanly as a separate `src/hono.ts` entrypoint with package exports on `@adapos/auth/hono`, keeping framework-specific code out of the core SDK client.
- `c.set("auth", authFn)` preserves the lazy auth pattern in Hono; wrapping the lookup in a memoized async function avoids duplicate `verifySession()` calls when both middleware and route handlers read auth.
- `requireAuth` should initialize the lazy auth function and then gate on `await getAuth(c)` before `next()` so unauthorized requests never reach the downstream handler.
- Hono middleware tests run fine in the existing Node Vitest setup via `app.request(...)`; mocking `global.fetch` is enough because only the SDK client performs network I/O.

## Task 17: Express/generic middleware for @adapos/auth

### Completed
- Created `packages/auth-sdk/src/express.ts` with `adaposAuthExpress` and `requireAuthExpress` middleware
- Created `packages/auth-sdk/src/generic.ts` with `verifyRequest` framework-agnostic helper
- Created `packages/auth-sdk/__tests__/express.test.ts` with 10 comprehensive tests
- Updated `packages/auth-sdk/tsup.config.ts` to include express and generic entries
- Updated `packages/auth-sdk/package.json` exports for express and generic
- `pnpm test` → 111 tests pass (81 auth + 30 SDK, up from 101)
- `pnpm typecheck` → 0 errors
- Committed: `feat(sdk): add Express and generic middleware for @adapos/auth`

### Express Middleware Pattern
- **adaposAuthExpress**: Attaches lazy `req.auth()` function to Express request object
  - Extracts session ID from Cookie header via `getSessionId()` helper
  - Creates memoized auth function that only calls `verifySession()` when invoked
  - Calls `next()` immediately — no blocking on auth lookup
  - Type augmentation: `declare global { namespace Express { interface Request { auth?: () => Promise<AuthContext> } } }`

- **requireAuthExpress**: Enforces authentication before route handler
  - Attaches lazy auth function like `adaposAuthExpress`
  - Immediately awaits `req.auth()` to check `isAuthenticated`
  - Returns 401 JSON if unauthenticated, calls `next()` if authenticated
  - Prevents downstream handler from executing for unauth requests

### Generic Helper Pattern
- **verifyRequest**: Framework-agnostic helper using Web standard `Request` object
  - Works with CF Workers, Deno, Bun, and any Web standard environment
  - Takes `Request` and `AdaposAuthConfig` as parameters
  - Extracts session ID from Cookie header
  - Returns `AuthContext` (union of auth/unauth) — NOT a lazy function
  - Useful for middleware that can't attach properties to request objects

### Session ID Extraction
- Shared `getSessionId()` helper handles both raw and URL-encoded session IDs
- Regex: `/(?:^|;\s*)session=([^;]+)/` matches session cookie value
- Tries `decodeURIComponent()` first, falls back to raw value if decode fails
- Reused across Hono, Express, and generic implementations

### Lazy Auth Memoization
- `createAuthFn()` returns a function that caches the auth promise
- First call: executes `verifySession()` and stores promise
- Subsequent calls: return cached promise (no duplicate network calls)
- Pattern: `let authPromise: Promise<AuthContext> | undefined; return async () => { if (!authPromise) { authPromise = (async () => { ... })(); } return authPromise; }`

### Test Coverage (10 tests)
**Express Middleware (7 tests)**:
- Attaches auth function to req
- Returns UnauthContext when no session cookie
- Returns AuthContext when valid session (mocked verifySession)
- Returns 401 when auth is required and no session
- Allows authenticated requests through requireAuthExpress
- Does not call auth server until auth is invoked (lazy pattern)
- Caches auth result on subsequent calls (memoization)

**Generic Helper (3 tests)**:
- Returns UnauthContext when no session cookie
- Returns AuthContext when valid session
- Handles URL-encoded session IDs correctly

### Key Learnings
- Express middleware uses `any` types for req/res/next to avoid requiring `@types/express` as a dependency
- Lazy auth pattern is consistent across Hono and Express — same memoization strategy
- Generic helper is synchronous in signature but async in execution (returns Promise<AuthContext>)
- Session ID extraction is identical across all frameworks — extracted to shared helper
- No new npm dependencies needed — reuses existing `createAdaposAuth` client
- Build config: tsup entries must include all framework-specific files for proper exports
- Package.json exports: each framework gets its own entry point with separate .mjs/.js/.d.ts files

## T18: SDK README (2026-03-13)

- `@adapos/auth/hono` exports: `adaposAuth`, `getAuth`, `requireAuth`
- `@adapos/auth/express` exports: `adaposAuthExpress`, `requireAuthExpress`
- `@adapos/auth/generic` exports: `verifyRequest`
- `@adapos/auth` (root) exports: `createAdaposAuth`, `clearApiKeyCache`, `getCachedApiKeyValidity`, `setCachedApiKeyValidity`, plus all types
- Auth is cookie-based: reads `session=` cookie from `Cookie` header
- `adaposAuth` vs `requireAuth`: former is optional (pass-through), latter blocks with 401
- Express: `req.auth` is a lazy async function, not the resolved value
- Hono: `getAuth(c)` resolves the lazy auth function stored in context variables
- `createAdaposAuth` is the low-level client for advanced use; middleware wrappers call it internally
- API key cache TTL is 30s; `clearApiKeyCache()` resets it

## Task 22: Error Handling + Logging Integration

### Completed
- Created `apps/auth/app/lib/error.server.ts` with AppError base class + 4 typed subclasses
- Created `apps/auth/app/lib/logger.server.ts` with structured JSON logging + sensitive data masking
- Updated `apps/auth/app/root.tsx` with ErrorBoundary export
- Added error page CSS styles to `apps/auth/app/styles/global.css`
- `pnpm test` → 111 tests pass (81 auth + 30 SDK, no regressions)
- `pnpm typecheck` → 0 errors
- Committed: `feat(error): add error handling and structured logging for auth server`

### Error Class Hierarchy
- **AppError**: Base class with `constructor(message, status, code)` and `toResponse()` method
  - Returns `Response` with JSON `{ error, code }` and correct HTTP status
  - `isAppError(e)` type guard for instanceof checks
- **AuthError** (401): Session invalid/expired/missing
- **ValidationError** (400): Invalid request data
- **RateLimitError** (429): Rate limit exceeded
- **AppleAuthError** (401): Apple OAuth flow failure

### Logger Implementation
- **log(level, message, meta?)**: Outputs JSON to console with timestamp
  - Levels: `info`, `warn`, `error`, `debug`
  - Format: `{ level, message, timestamp, ...meta }`
- **logRequest(method, path, status, duration, userId?)**: HTTP request logging
- **maskApiKey(key)**: Returns `${key.slice(0, 11)}...` (never expose full key)
- **maskSessionId(id)**: Returns `${id.slice(0, 8)}...`
- No external logging libraries — console.log only (CF Workers sends to Worker Logs)

### ErrorBoundary Pattern
- Exported from `root.tsx` as `export function ErrorBoundary()`
- Uses `useRouteError()` and `isRouteErrorResponse()` from react-router
- 404 errors: "페이지를 찾을 수 없습니다" (Page not found)
- Other errors: "오류가 발생했습니다" (An error occurred)
- Unhandled errors: "예상치 못한 오류가 발생했습니다" (Unexpected error)
- NO stack traces in production output
- Styled with existing CSS classes (`.error-page`, `.btn`, `.btn-primary`)
- Includes header, footer, and home button for navigation

### CSS Styling
- Added `.error-page` section to global.css
- Centered layout with max-width 500px
- Uses existing CSS variables for colors and typography
- Responsive padding (48px desktop, 24px mobile)
- Home button styled with `.btn .btn-primary` classes

### Key Learnings
- Remix ErrorBoundary must be exported from root.tsx (not a component prop)
- `isRouteErrorResponse()` checks if error is a Response (4xx/5xx)
- Error responses include status code but NOT stack traces
- CF Workers console.log automatically sends to Worker Logs (no SDK needed)
- Masking functions use simple string slicing (no regex needed)
- Error classes use `Object.setPrototypeOf()` for proper instanceof checks in TypeScript

## Task 20: SDK API validation + KV rate limiting

- Centralized SDK API key auth in `apps/auth/app/lib/rate-limit.server.ts` so each resource route can share Bearer parsing, D1 lookup, `verifyApiKey` confirmation, and KV-backed rate limiting.
- The SDK API rate-limit key format is `ratelimit:{api_key_prefix}:{windowMinute}` with `expirationTtl: 60`; tests can hit the same endpoint 101 times to verify the 100 req/min cap without extra test-only hooks.
- `POST /api/sdk/verify-session` should return the KV session payload plus `id: sessionId` to match the shared `AdaposSession` type used by `packages/auth-sdk`.
- Resource-route tests remain simplest when they call route `loader`/`action` exports directly with real `cloudflare:workers` bindings, recreate D1 tables in `beforeEach()`, and create developer apps inline when shared helpers are out of scope.
- `pnpm test`, `pnpm typecheck`, and `pnpm build` all passed after adding the SDK routes.

## Task 19: SSO cookie config + subdomain integration tests

- `setSessionCookie`/`clearSessionCookie` should accept an optional `cookieDomain`; domain attribute is emitted only when the value is a non-empty string, which covers both empty-string local dev and undefined env cases.
- SSO cookie expectations for cross-subdomain auth remain: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and explicitly not `SameSite=Strict`.
- End-to-end SDK session verification tests are stable when they create users, sessions, and developer app API keys in real D1/KV bindings and invoke route `action` exports directly.
- Sliding-window renewal is easiest to assert by seeding a session slightly past 50% elapsed and checking that `getSession()` returns an `expiresAt` greater than the seeded value.
- Logout integration can be verified by sending a session cookie to `/api/auth/logout` action and asserting the corresponding `session:{id}` key is deleted from KV.

## Task 21: Cloudflare Pages Deployment Configuration

### Completed
- Finalized `apps/auth/wrangler.toml` with all bindings and environment variables
- Created `apps/auth/scripts/setup-secrets.sh` with all wrangler secret put commands
- Verified `.gitignore` already includes `*.p8` pattern
- `pnpm --filter auth build` → exit 0 (no build errors)
- `pnpm typecheck` → 0 errors

### wrangler.toml Configuration
- **name**: `ada-auth`
- **compatibility_date**: `2025-01-01` (recent date)
- **compatibility_flags**: `["nodejs_compat"]` for Node.js API support
- **pages_build_output_dir**: `./build/client` (React Router v7 default)
- **D1 Database**: `binding = "DB"`, `database_name = "ada-auth-db"`, `database_id = "placeholder-replace-with-real-id"`
- **KV Namespaces** (4 total):
  - SESSIONS: `id = "placeholder-sessions-id"`
  - EMAIL_TOKENS: `id = "placeholder-email-tokens-id"`
  - MAGIC_TOKENS: `id = "placeholder-magic-tokens-id"`
  - RATE_LIMITS: `id = "placeholder-rate-limits-id"`
- **R2 Bucket**: `binding = "PROFILE_PHOTOS"`, `bucket_name = "ada-auth-profile-photos"`
- **[vars] section**: `COOKIE_DOMAIN = ".adapos.tech"` (production SSO domain)
- **[dev] section**: `vars = { COOKIE_DOMAIN = "" }` (local dev: no domain attribute on cookies)

### setup-secrets.sh Script
- Location: `apps/auth/scripts/setup-secrets.sh`
- Executable: `chmod +x` applied
- Commands: `wrangler secret put` for 6 secrets:
  - APPLE_CLIENT_ID
  - APPLE_TEAM_ID
  - APPLE_KEY_ID
  - APPLE_PRIVATE_KEY
  - RESEND_API_KEY
  - AUTH_SECRET
- Script includes helpful comments and success message

### Key Learnings
- Placeholder IDs in wrangler.toml are safe for version control — actual IDs are set via Cloudflare dashboard
- Local dev override via `[dev]` section allows empty `COOKIE_DOMAIN` without code changes
- `pages_build_output_dir` is CF Pages-specific (not `main` like Workers)
- Secrets are NEVER in wrangler.toml — always via `wrangler secret put` CLI
- `.p8` files are already gitignored (Apple private key files)
- Build output verified: 78 modules transformed, all chunks generated, gzip sizes computed
- Typecheck verified: 0 errors across auth app and SDK package

### Files Modified
- `apps/auth/wrangler.toml`: Added `[dev]` section with local overrides
- `apps/auth/scripts/setup-secrets.sh`: Created with all secret commands
- `.gitignore`: Already includes `*.p8` (no changes needed)

### Verification Results
- `pnpm --filter auth build`: ✓ exit 0
- `pnpm typecheck`: ✓ 0 errors
- Script executable: ✓ chmod +x applied
- All bindings match `apps/auth/app/types/env.ts`: ✓ verified

## Task: Final Verification bugfix sweep (2026-03-14)

- `login.tsx` must send JSON to `/api/auth/magic/send`; form-encoded payloads fail because the API route reads `request.json()`.
- `mypage.tsx` verification CTA should be a real POST form (not anchor GET), and `api.verify.send.ts` now safely accepts both JSON and form-data email payloads.
- `api.developer.apps.$id.ts` now supports method override via POST `_method=delete`, which matches the existing `developer.tsx` delete form.
- Apple callback must run `findOrCreateUser(db, { id: sub, appleEmail })` before session creation to prevent missing D1 user rows on middleware lookups.
- Session cookie creation in Apple callback should reuse shared helpers (`createSession`, `setSessionCookie`) instead of custom inline KV/cookie logic.
- `wrangler.toml` now sets `AUTH_URL = "https://adapos.tech"` in `[vars]` and uses `[dev] port = 5173` (no `[dev].vars` inline overrides).
- Verification run in `apps/auth`: `pnpm test` passed (10 files / 95 tests), `pnpm typecheck` passed (0 errors).

## [2026-03-14] F1 final rerun
- Apple account linking now satisfies the plan path: `findOrCreateUser()` checks `verifiedEmail`, and the Apple callback creates the session from the returned `user.id`, preserving magic-link account linkage.
- Cookie parsing is now anchored with `(?:^|;\s*)session=`, which avoids matching prefixed cookie names while preserving normal session extraction.
- Full workspace tests continue to pass after the fixes: auth 95/95, SDK 30/30.
