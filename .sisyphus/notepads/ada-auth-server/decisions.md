# Decisions — ada-auth-server

## [2026-03-13] Architectural Decisions

### Framework
- Remix (React Router v7) on CF Pages
- SSR + progressive enhancement + action/loader pattern
- Form-centric UI (profile editing, developer portal)

### Auth Flows
1. Apple Sign-In: OAuth2 → token exchange → JWKS verify → session
2. Magic Link: email → KV token (15min TTL) → verify → session + is_verified=true
3. Account linking: same pos.idserve.net email → merge Apple + magic link accounts

### Session Strategy
- Opaque token stored in KV (NOT JWT sessions)
- TTL: 7 days
- Sliding window: if remaining TTL < 50%, auto-extend
- Cookie: HttpOnly, Secure, SameSite=Lax, Domain=.adapos.tech

### API Key Security
- Generate: `ak_` prefix + crypto.randomUUID()
- Store: SHA-256 hash in D1 (NEVER plaintext)
- Display: full key ONCE on creation, prefix only thereafter
- Cache in SDK: in-memory Map, 30s TTL

### Email Verification
- Only @pos.idserve.net domain allowed
- Token: UUID, KV stored, TTL 24h
- One-time use (deleted after verification)
