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
