# Problems — ada-auth-server

## No active blockers yet

(Will be updated as tasks encounter issues)

## [2026-03-14] Open compliance gaps
- `apps/auth/app/routes/api.auth.apple.callback.ts` needs user create/link logic before session issuance.
- `apps/auth/wrangler.toml` and `apps/auth/app/types/env.ts` need `AUTH_URL`, and Wrangler dev config needs a valid local-env pattern.
