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
