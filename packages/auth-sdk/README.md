# @adapos/auth

Authentication SDK for Apple Developer Academy @ POSTECH services.

## Installation

```bash
pnpm add @adapos/auth
```

## Quick Start

Get an API key from the [ADA Developer Portal](https://adapos.tech/developer), then:

```typescript
import { adaposAuth, getAuth } from '@adapos/auth/hono';

app.use('*', adaposAuth({ apiKey: env.ADAPOS_API_KEY }));

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
import { adaposAuth, getAuth, requireAuth } from '@adapos/auth/hono';

const app = new Hono();

// Optional auth — check manually
app.use('*', adaposAuth({ apiKey: env.ADAPOS_API_KEY }));

app.get('/profile', async (c) => {
  const auth = await getAuth(c);
  if (!auth.isAuthenticated) return c.json({ error: 'Login required' }, 401);
  return c.json({ user: auth.user });
});

// Required auth — auto 401 if not authenticated
app.get('/dashboard', requireAuth({ apiKey: env.ADAPOS_API_KEY }), (c) => {
  return c.json({ message: 'Welcome!' });
});
```

### Express

```typescript
import express from 'express';
import { adaposAuthExpress, requireAuthExpress } from '@adapos/auth/express';

const app = express();

// Optional auth
app.use(adaposAuthExpress({ apiKey: process.env.ADAPOS_API_KEY! }));

app.get('/profile', async (req, res) => {
  const auth = await req.auth?.();
  if (!auth?.isAuthenticated) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: auth.user });
});

// Required auth
app.get('/dashboard', requireAuthExpress({ apiKey: process.env.ADAPOS_API_KEY! }), (req, res) => {
  res.json({ message: 'Welcome!' });
});
```

### Generic (Web Standard Request)

Works with Cloudflare Workers, Deno, Bun, and any Web standard environment:

```typescript
import { verifyRequest } from '@adapos/auth/generic';

export default {
  async fetch(request: Request, env: Env) {
    const auth = await verifyRequest(request, { apiKey: env.ADAPOS_API_KEY });
    if (!auth.isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return new Response(JSON.stringify({ user: auth.user }));
  }
};
```

## API Reference

### `adaposAuth(config)` — Hono middleware

Attaches a lazy `auth` function to the Hono context. Call `getAuth(c)` in your handler to resolve it.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiKey` | `string` | required | Your API key from the developer portal |
| `authUrl` | `string` | `https://adapos.tech` | Auth server URL (for self-hosting) |

### `getAuth(c)` — Hono helper

```typescript
const auth = await getAuth(c); // AuthContext
```

Returns the `AuthContext` for the current request. Must be called after `adaposAuth` middleware.

### `requireAuth(config)` — Hono middleware

Drop-in middleware that returns `401` automatically if the request isn't authenticated. No need to call `getAuth` manually.

### `adaposAuthExpress(config)` — Express middleware

Attaches `req.auth()` as a lazy async function. Call it in your handler to get the `AuthContext`.

### `requireAuthExpress(config)` — Express middleware

Same as `adaposAuthExpress`, but automatically returns `401` if not authenticated.

### `verifyRequest(request, config)` — Generic helper

```typescript
const auth = await verifyRequest(request, { apiKey: env.ADAPOS_API_KEY });
```

Takes a Web standard `Request` and returns `AuthContext`. No middleware needed.

### `createAdaposAuth(config)`

Creates a raw auth client for advanced use cases.

```typescript
import { createAdaposAuth } from '@adapos/auth';

const client = createAdaposAuth({ apiKey: env.ADAPOS_API_KEY });
```

Returns an `AdaposAuthClient` with these methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `verifySession(sessionId)` | `Promise<{user, session} \| null>` | Verify a session ID directly |
| `getUser(userId)` | `Promise<AdaposUser \| null>` | Fetch a user by ID |
| `getCurrentUser(sessionId)` | `Promise<AdaposUser \| null>` | Get the user from a session |

### Types

```typescript
interface AdaposUser {
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

interface AdaposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix ms
  createdAt: number;  // Unix ms
}

type AuthContext = AdaposAuthContext | AdaposUnauthContext;

interface AdaposAuthContext {
  user: AdaposUser;
  session: AdaposSession;
  isAuthenticated: true;
}

interface AdaposUnauthContext {
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

You can clear the cache manually if needed:

```typescript
import { clearApiKeyCache } from '@adapos/auth';

clearApiKeyCache();
```

## FAQ

**Q: Where do I get an API key?**
Log in at [adapos.tech](https://adapos.tech) with your @pos.idserve.net email, then visit the [Developer Portal](https://adapos.tech/developer).

**Q: Can I use this on the client side?**
No. API keys must stay server-side only. Never expose your API key in browser code.

**Q: What happens when a session expires?**
`auth.isAuthenticated` will be `false`. Redirect the user to `https://adapos.tech/login`.

**Q: Does this work with Cloudflare Workers?**
Yes. Use `@adapos/auth/generic` with `verifyRequest`, or `@adapos/auth/hono` if you're using Hono.

**Q: What's the difference between `adaposAuth` and `requireAuth`?**
`adaposAuth` is optional auth: it attaches the auth context but lets unauthenticated requests through. `requireAuth` blocks unauthenticated requests with a `401` automatically.
