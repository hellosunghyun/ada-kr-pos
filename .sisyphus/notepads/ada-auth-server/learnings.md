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
