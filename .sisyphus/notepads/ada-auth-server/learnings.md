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
