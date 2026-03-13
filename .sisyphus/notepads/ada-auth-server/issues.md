# Issues — ada-auth-server

## [2026-03-13] Known Gotchas

### CF Workers Specific
- `jsonwebtoken` FORBIDDEN — uses Node.js crypto. Use `jose` instead
- `@cloudflare/workers-types` needed for D1Database, KVNamespace, R2Bucket types
- Web Crypto API: `crypto.subtle.digest()` NOT `require('crypto')`
- KV minimum TTL: 60 seconds
- No `app.use()` in Remix — use utility functions in loader/action

### Apple Sign-In
- Email only provided on FIRST login (sub remains constant)
- form_post response mode → callback needs POST handler (not GET)
- client_secret JWT: ES256, max 6 months TTL, must rotate
- .p8 key: ONLY downloadable once → store in wrangler secret

### Session/Cookie
- localhost doesn't support domain cookies → omit Domain attr in local dev
- SameSite=Strict breaks SSO across subdomains → use Lax

### Testing
- miniflare (@cloudflare/vitest-pool-workers) for CF Workers test environment
- mockResend() is the ONLY way to get magic link tokens in tests (KV wildcard queries not possible)
- Resend API must be mocked in tests (don't call real API)

## [2026-03-14] F1 compliance audit findings
- Apple callback creates a session directly from Apple `sub` without calling `findOrCreateUser`, so Apple login does not persist/link a user before redirect.
- `wrangler.toml` is missing `AUTH_URL`, and `[dev].vars` triggers Wrangler warnings during `pnpm test`.
- QA evidence is incomplete: only 9 task evidence files were found and `.sisyphus/evidence/final-qa/` is absent.

## [2026-03-14] F1 re-run findings
- `apps/auth/app/routes/api.auth.apple.callback.ts` now calls `findOrCreateUser`, but it still creates the session with Apple `sub` instead of the returned user ID. If a magic-link account already exists for the same `@pos.idserve.net` email, Apple login will not attach to that account correctly.
- `pnpm test` passes: 10 auth test files / 95 tests and 4 SDK test files / 30 tests.

## [2026-03-14] F1 re-run after fixes
- `apps/auth/app/routes/api.auth.apple.callback.ts` now creates the session from `user.id`, and `apps/auth/app/lib/cookie.server.ts` now anchors the cookie-name regex correctly.
- Compliance is still blocked because `apps/auth/app/lib/user.server.ts` only links Apple users by `apple_email`; it does not check `verified_email`, so an existing magic-link account is still not linked when Apple returns the same `@pos.idserve.net` email.
- `pnpm test` still passes: 10 auth test files / 95 tests and 4 SDK test files / 30 tests.

## [2026-03-14] F3 Manual QA Findings

### Critical Issue: Dev Server Missing Cloudflare Bindings

**Symptom:** All UI pages return HTTP 500 errors with Korean error page ("오류가 발생했습니다")

**Root Cause:** `vite.config.ts` is missing the `cloudflareDevProxy` plugin from `@react-router/dev/vite/cloudflare`. This plugin is required to provide Cloudflare bindings (D1, KV, R2) in dev mode.

**Evidence:**
- `/api/health` → ✅ Returns `{"status":"ok"}` (API routes that don't need bindings work)
- `/` → ❌ HTTP 500 (index route calls `optionalAuth` which needs KV/D1)
- `/login` → ❌ HTTP 500 (login route calls `optionalAuth` which needs KV/D1)
- `/mypage` → ❌ HTTP 500 (should redirect to /login, but crashes first)
- `/developer` → ❌ HTTP 500 (should redirect to /login, but crashes first)

**Console Errors:**
- `Failed to load resource: the server responded with a status of 500` on all page routes
- `Failed to load resource: the server responded with a status of 404` on `/favicon.ico`

**Fix Required:**
Update `apps/auth/vite.config.ts`:
```typescript
import { reactRouter } from "@react-router/dev/vite";
import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [cloudflareDevProxy(), reactRouter(), tsconfigPaths()],
});
```

**Positive Findings:**
- Error boundary works correctly (shows Korean error page)
- Layout/header/footer renders properly even on error
- Health endpoint works correctly
- Dev server starts successfully (on port 5174 due to 5173 being in use)


## [2026-03-14] F3 Manual QA Re-run (after vite.config.ts fix)

### Result: ALL TESTS PASS ✅

**Dev Server:** Started on port 5175 (5173/5174 were in use)

| URL | Expected | Actual | Status |
|-----|----------|--------|--------|
| `/api/health` | `{"status":"ok"}` | `{"status":"ok"}` | ✅ PASS |
| `/` | Redirect to `/login` | Redirected to `/login` | ✅ PASS |
| `/login` | Login page with Apple button + magic link form | Renders correctly with all elements | ✅ PASS |
| `/mypage` | Redirect to `/login` (unauthenticated) | Redirected to `/login` | ✅ PASS |
| `/developer` | Redirect to `/login` (unauthenticated) | Redirected to `/login` | ✅ PASS |

### Login Page Elements Verified
- ✅ "ADA Auth" heading
- ✅ "Apple Developer Academy @ POSTECH" subtitle
- ✅ "Sign in with Apple" link (`/api/auth/apple`)
- ✅ Magic link form with email input
- ✅ Email input placeholder: "your@pos.idserve.net"
- ✅ Submit button: "로그인 링크 보내기"
- ✅ Footer: "© Apple Developer Academy @ POSTECH"

### Console Messages (Non-blocking)
- ⚠️ SVG path attribute error in Apple logo (cosmetic, does not affect functionality)
- ⚠️ favicon.ico 404 (expected - no favicon configured)

### Auth Guard Verification
- ✅ `/mypage` redirects unauthenticated users to `/login`
- ✅ `/developer` redirects unauthenticated users to `/login`

### Fix Applied
`apps/auth/vite.config.ts` now includes `cloudflareDevProxy()`:
```typescript
import { cloudflareDevProxy } from "@react-router/dev/vite/cloudflare";
export default defineConfig({
  plugins: [cloudflareDevProxy(), reactRouter(), tsconfigPaths()],
});
```

