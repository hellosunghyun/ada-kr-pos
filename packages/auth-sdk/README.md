# @adakrpos/auth

Authentication SDK for Apple Developer Academy @ POSTECH services.

## Installation

```bash
pnpm add @adakrpos/auth
```

## Quick Start

Get an API key from the [ADA Developer Portal](https://ada-kr-pos.com/developer), then:

```typescript
import { adakrposAuth, getAuth } from '@adakrpos/auth/hono';

app.use('*', adakrposAuth({ apiKey: env.ADAKRPOS_API_KEY }));

app.get('/protected', async (c) => {
  const auth = await getAuth(c);
  if (!auth.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: auth.user });
});
```

## Usage

### Hono

```typescript
import { Hono } from 'hono';
import { adakrposAuth, getAuth, requireAuth } from '@adakrpos/auth/hono';

const app = new Hono();

// Optional auth — check manually
app.use('*', adakrposAuth({ apiKey: env.ADAKRPOS_API_KEY }));

app.get('/profile', async (c) => {
  const auth = await getAuth(c);
  if (!auth.isAuthenticated) return c.json({ error: 'Login required' }, 401);
  return c.json({ user: auth.user });
});

// Required auth — auto 401 if not authenticated
app.get('/dashboard', requireAuth({ apiKey: env.ADAKRPOS_API_KEY }), (c) => {
  return c.json({ message: 'Welcome!' });
});
```

### Express

```typescript
import express from 'express';
import { adakrposAuthExpress, requireAuthExpress } from '@adakrpos/auth/express';

const app = express();

// Optional auth
app.use(adakrposAuthExpress({ apiKey: process.env.ADAKRPOS_API_KEY! }));

app.get('/profile', async (req, res) => {
  const auth = await req.auth?.();
  if (!auth?.isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: auth.user });
});

// Required auth
app.get('/dashboard', requireAuthExpress({ apiKey: process.env.ADAKRPOS_API_KEY! }), (req, res) => {
  res.json({ message: 'Welcome!' });
});
```

### Generic (Web Standard Request)

Works with Cloudflare Workers, Deno, Bun, and any Web standard environment:

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

With signed edge token cache (3-layer auth cache):

```typescript
import {
  buildEdgeTokenCookie,
  consumePendingEdgeToken,
  verifyRequest,
} from '@adakrpos/auth/generic';

export default {
  async fetch(request: Request, env: Env) {
    const auth = await verifyRequest(
      request,
      { apiKey: env.ADAKRPOS_API_KEY },
      {
        edge: {
          publicKey: env.ADAKRPOS_EDGE_PUBLIC_KEY,
        },
      },
    );

    const response = auth.isAuthenticated
      ? Response.json({ user: auth.user })
      : Response.json({ error: 'Unauthorized' }, { status: 401 });

    const pendingToken = consumePendingEdgeToken(request);
    if (pendingToken) {
      response.headers.append(
        'Set-Cookie',
        buildEdgeTokenCookie(pendingToken, {
          domain: '.ada-kr-pos.com',
          maxAgeSeconds: 120,
        }),
      );
    }

    return response;
  },
};
```

## API Reference

### `adakrposAuth(config)` — Hono middleware

Attaches a lazy `auth` function to the Hono context. Call `getAuth(c)` in your handler to resolve it.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiKey` | `string` | required | Your API key from the developer portal |
| `authUrl` | `string` | `https://ada-kr-pos.com` | Auth server URL (for self-hosting) |
| `sessionCacheTtlMs` | `number` | `5000` | Session verification cache TTL in ms (`0` disables) |

### `getAuth(c)` — Hono helper

```typescript
const auth = await getAuth(c); // AuthContext
```

Returns the `AuthContext` for the current request. Must be called after `adakrposAuth` middleware.

### `requireAuth(config)` — Hono middleware

Drop-in middleware that returns `401` automatically if the request isn't authenticated. No need to call `getAuth` manually.

### `adakrposAuthExpress(config)` — Express middleware

Attaches `req.auth()` as a lazy async function. Call it in your handler to get the `AuthContext`.

### `requireAuthExpress(config)` — Express middleware

Same as `adakrposAuthExpress`, but automatically returns `401` if not authenticated.

### `verifyRequest(request, config)` — Generic helper

```typescript
const auth = await verifyRequest(request, { apiKey: env.ADAKRPOS_API_KEY });
```

Takes a Web standard `Request` and returns `AuthContext`. No middleware needed.

Supports an optional third argument for edge-token verification and force fallback:

```typescript
await verifyRequest(request, config, {
  forceVerify: false,
  edge: {
    publicKey: env.ADAKRPOS_EDGE_PUBLIC_KEY,
    cookieName: 'adakrpos_edge',
    issuer: 'https://ada-kr-pos.com',
    audience: 'adakrpos-edge',
  },
});
```

For privileged/admin paths, force origin verification and bypass edge token cache:

```typescript
const auth = await verifyRequest(request, config, {
  forceVerify: pathname.startsWith('/admin'),
  edge: { publicKey: env.ADAKRPOS_EDGE_PUBLIC_KEY },
});
```

Helper utilities (generic entrypoint):
- `getPendingEdgeToken(request)`
- `consumePendingEdgeToken(request)`
- `buildEdgeTokenCookie(token, options)`

### `createAdakrposAuth(config)`

Creates a raw auth client for advanced use cases.

```typescript
import { createAdakrposAuth } from '@adakrpos/auth';

const client = createAdakrposAuth({ apiKey: env.ADAKRPOS_API_KEY });
```

Returns an `AdakrposAuthClient` with these methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `verifySession(sessionId)` | `Promise<{user, session} \| null>` | Verify a session ID directly |
| `getUser(userId)` | `Promise<AdakrposUser \| null>` | Fetch a user by ID |
| `getCurrentUser(sessionId)` | `Promise<AdakrposUser \| null>` | Get the user from a session |

### Types

```typescript
interface AdakrposUser {
  id: string;
  email: string | null;           // Apple email
  verifiedEmail: string | null;   // @pos.idserve.net email
  nickname: string | null;
  name: string | null;
  profilePhotoUrl: string | null;
  bio: string | null;
  contact: string | null;
  snsLinks: Record<string, string>;
  isVerified: boolean;            // true if @pos.idserve.net verified
  createdAt: number;              // Unix ms
  updatedAt: number;              // Unix ms
}

interface AdakrposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix ms
  createdAt: number;  // Unix ms
}

type AuthContext = AdakrposAuthContext | AdakrposUnauthContext;

interface AdakrposAuthContext {
  user: AdakrposUser;
  session: AdakrposSession;
  isAuthenticated: true;
}

interface AdakrposUnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}
```

## Caching

API key validation results are cached in-memory for 30 seconds to reduce latency. This means:

- First request: validates with auth server (~50ms)
- Subsequent requests within 30s: instant (cached)
- After 30s: re-validates with auth server

Successful session verification responses are also cached in-memory for 5 seconds by default:

- Repeated `verifySession` calls for the same session within 5s return from cache
- Concurrent `verifySession` calls for the same session share a single in-flight request

`verifyRequest` also includes a request-level layer1 cache by default (30s, max 200 entries), and can resolve auth from signed `adakrpos_edge` cookie locally when `edge.publicKey` is configured.

Disable session-result caching if you need strict immediate revocation behavior:

```typescript
import { createAdakrposAuth } from '@adakrpos/auth';

const auth = createAdakrposAuth({
  apiKey: env.ADAKRPOS_API_KEY,
  sessionCacheTtlMs: 0,
});
```

You can clear the cache manually if needed:

```typescript
import { clearApiKeyCache } from '@adakrpos/auth';

clearApiKeyCache();
```

## FAQ

**Q: Where do I get an API key?**
Log in at [ada-kr-pos.com](https://ada-kr-pos.com) with your @pos.idserve.net email, then visit the [Developer Portal](https://ada-kr-pos.com/developer).

**Q: Can I use this on the client side?**
No. API keys must stay server-side only. Never expose your API key in browser code.

**Q: What happens when a session expires?**
`auth.isAuthenticated` will be `false`. Redirect the user to login with `callbackUrl` so they return to the current page after authentication:

```typescript
// Hono example
if (!auth.isAuthenticated) {
  const currentUrl = new URL(c.req.url);
  const loginUrl = new URL("https://ada-kr-pos.com/login");
  loginUrl.searchParams.set("callbackUrl", currentUrl.toString());
  return c.redirect(loginUrl.toString());
}
```

`callbackUrl` must be `https://` and under `*.ada-kr-pos.com` — other domains are ignored for security. See [docs/callback-url.md](../../docs/callback-url.md) for details.

**Q: Does this work with Cloudflare Workers?**
Yes. Use `@adakrpos/auth/generic` with `verifyRequest`, or `@adakrpos/auth/hono` if you're using Hono.

**Q: What's the difference between `adakrposAuth` and `requireAuth`?**
`adakrposAuth` is optional auth: it attaches the auth context but lets unauthenticated requests through. `requireAuth` blocks unauthenticated requests with a `401` automatically.
