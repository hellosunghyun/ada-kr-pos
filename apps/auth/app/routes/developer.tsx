import { desc, eq } from "drizzle-orm";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
} from "~/lib/apikey.server";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import type { Env } from "~/types/env";

interface DeveloperApp {
  id: string;
  name: string;
  description: string | null;
  apiKeyPrefix: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface LoaderData {
  user: {
    id: string;
    isVerified: boolean;
    email: string | null;
    verifiedEmail: string | null;
    nickname: string | null;
    name: string | null;
  };
  apps: DeveloperApp[];
}

interface ActionData {
  app?: DeveloperApp & { apiKey?: string };
  error?: string;
  success?: boolean;
}

export async function loader({
  request,
  context,
}: LoaderFunctionArgs): Promise<LoaderData> {
  const auth = await requireAuthPage(request, context);

  if (!auth.user.isVerified) {
    return { user: auth.user, apps: [] };
  }

  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  const apps = await db
    .select({
      id: developerApps.id,
      name: developerApps.name,
      description: developerApps.description,
      apiKeyPrefix: developerApps.apiKeyPrefix,
      isActive: developerApps.isActive,
      createdAt: developerApps.createdAt,
      updatedAt: developerApps.updatedAt,
    })
    .from(developerApps)
    .where(eq(developerApps.userId, auth.user.id))
    .orderBy(desc(developerApps.createdAt));

  return {
    user: auth.user,
    apps: apps.map((app) => ({
      ...app,
      createdAt: app.createdAt.getTime(),
      updatedAt: app.updatedAt.getTime(),
    })),
  };
}

export async function action({
  request,
  context,
}: ActionFunctionArgs): Promise<ActionData> {
  await validateCsrf(request);
  const auth = await requireAuthPage(request, context);

  if (!auth.user.isVerified) {
    return { error: "Email verification required" };
  }

  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  const formData = await request.formData();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name || name.trim().length === 0) {
    return { error: "App name is required" };
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = getApiKeyPrefix(apiKey);
  const appId = crypto.randomUUID();
  const now = new Date();

  await db.insert(developerApps).values({
    id: appId,
    userId: auth.user.id,
    name: name.trim(),
    description: description?.trim() || null,
    apiKeyHash,
    apiKeyPrefix,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    app: {
      id: appId,
      name: name.trim(),
      description: description?.trim() || null,
      apiKeyPrefix,
      apiKey,
      isActive: true,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    },
    success: true,
  };
}

export default function DeveloperPortal() {
  const { user, apps } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const regenerateFetchers = apps.map(() => useFetcher<ActionData>());

  if (!user.isVerified) {
    return (
      <div className="developer-container">
        <div className="verification-required">
          <h1>개발자 포털</h1>
          <p>이메일 인증 후 이용 가능합니다.</p>
          <a href="/mypage">마이페이지로 이동</a>
        </div>
      </div>
    );
  }

  const newlyCreatedApp =
    actionData?.success && actionData.app?.apiKey ? actionData.app : null;

  // Check if any regenerate fetcher returned a new API key
  const regeneratedApp = regenerateFetchers.find(
    (fetcher) => fetcher.data?.success && fetcher.data?.app?.apiKey,
  )?.data?.app;

  const revealedApp = newlyCreatedApp || regeneratedApp;

  return (
    <div className="developer-container">
      <h1>개발자 포털</h1>
      <p className="developer-subtitle">앱을 등록하고 API 키를 관리하세요.</p>

      {revealedApp && (
        <div className="api-key-reveal">
          <h3>API Key {regeneratedApp ? "재생성됨" : "생성됨"}</h3>
          <p>아래 API 키를 안전한 곳에 저장하세요.</p>
          <div className="api-key-value">{revealedApp.apiKey}</div>
          <button
            type="button"
            className="btn-copy"
            onClick={() => {
              navigator.clipboard.writeText(revealedApp.apiKey!);
            }}
          >
            복사
          </button>
          <p className="api-key-warning">
            ⚠️ 이 키는 다시 볼 수 없습니다. 안전하게 보관하세요.
          </p>
        </div>
      )}

      {actionData?.error && <p className="error-msg">{actionData.error}</p>}

      <h2>등록된 앱</h2>
      {apps.length === 0 ? (
        <p className="no-apps">등록된 앱이 없습니다.</p>
      ) : (
        <div className="app-list">
          {apps.map((app, index) => {
            const fetcher = regenerateFetchers[index];
            const isRegenerating = fetcher.state === "submitting";

            return (
              <div key={app.id} className="app-card">
                <div className="app-card-header">
                  <div className="app-card-name">
                    <span
                      className={`status-dot ${app.isActive ? "active" : "inactive"}`}
                    />
                    <span>{app.name}</span>
                  </div>
                </div>
                <div className="app-card-meta">
                  <code className="api-key-prefix">{app.apiKeyPrefix}...</code>
                  <span className="app-card-date">
                    {new Date(app.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <div className="app-card-actions">
                  <fetcher.Form
                    method="post"
                    action={`/api/developer/apps/${app.id}`}
                  >
                    <input type="hidden" name="_method" value="regenerate" />
                    <button
                      type="submit"
                      className="btn-regenerate"
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? "재생성 중..." : "재생성"}
                    </button>
                  </fetcher.Form>
                  <Form method="post" action={`/api/developer/apps/${app.id}`}>
                    <input type="hidden" name="_method" value="delete" />
                    <button type="submit" className="btn-danger-small">
                      삭제
                    </button>
                  </Form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="docs-section">
        <div className="docs-section-header">
          <h2>사용 가이드</h2>
          <button
            type="button"
            className="btn-copy-docs"
            onClick={() => {
              const text = `# ada-kr-pos.com 인증 연동 가이드

## 인증 방식
모든 API 요청에 Authorization 헤더를 포함하세요.
\`Authorization: Bearer <API_KEY>\`

## 세션 쿠키
- 이름: \`adakrpos_session\`
- Domain: \`.ada-kr-pos.com\` (모든 *.ada-kr-pos.com 서브도메인에 자동 전달)
- SameSite: Lax
- TTL: 7일 (50% 경과 시 자동 갱신)
- 값: Opaque UUID (JWT 아님)

## SDK 설치
\`\`\`
npm install @adakrpos/auth
\`\`\`

### 진입점
- \`@adakrpos/auth\` — 코어 클라이언트 (모든 환경)
- \`@adakrpos/auth/hono\` — Hono 미들웨어
- \`@adakrpos/auth/express\` — Express 미들웨어
- \`@adakrpos/auth/generic\` — Web API Request (CF Workers, Deno, Bun)

### 코어 클라이언트
\`\`\`typescript
import { createAdakrposAuth } from "@adakrpos/auth";

const auth = createAdakrposAuth({
  apiKey: "ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  authUrl: "https://ada-kr-pos.com", // 기본값, 생략 가능
});

// 세션 검증 — 사용자 + 세션 정보 반환
const result = await auth.verifySession(sessionId);
if (result) {
  result.user;    // AdakrposUser
  result.session; // AdakrposSession
}

// 세션에서 사용자만 꺼내기
const user = await auth.getCurrentUser(sessionId);

// 사용자 ID로 프로필 조회
const user = await auth.getUser("user-uuid");
\`\`\`

### Hono 미들웨어
\`\`\`typescript
import { adakrposAuth, getAuth } from "@adakrpos/auth/hono";

app.use("*", adakrposAuth({ apiKey: process.env.ADAKRPOS_API_KEY! }));

app.get("/api/me", async (c) => {
  const auth = await getAuth(c);
  if (!auth.isAuthenticated) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user: auth.user });
});

// 인증 필수 미들웨어
import { requireAuth } from "@adakrpos/auth/hono";
app.use("/api/protected/*", requireAuth({ apiKey: process.env.ADAKRPOS_API_KEY! }));
\`\`\`

### Express 미들웨어
\`\`\`typescript
import { adakrposAuthExpress } from "@adakrpos/auth/express";

app.use(adakrposAuthExpress({ apiKey: process.env.ADAKRPOS_API_KEY! }));

app.get("/dashboard", async (req, res) => {
  const auth = await req.auth!();
  if (!auth.isAuthenticated) return res.redirect("https://ada-kr-pos.com/login");
  res.json({ user: auth.user });
});

// 인증 필수 미들웨어
import { requireAuthExpress } from "@adakrpos/auth/express";
app.use("/api", requireAuthExpress({ apiKey: process.env.ADAKRPOS_API_KEY! }));
\`\`\`

### Generic (CF Workers, Deno, Bun)
\`\`\`typescript
import { verifyRequest } from "@adakrpos/auth/generic";

const auth = await verifyRequest(request, { apiKey: env.ADAKRPOS_API_KEY });
if (!auth.isAuthenticated) return new Response("Unauthorized", { status: 401 });
// auth.user, auth.session 사용
\`\`\`

## 타입 정의
\`\`\`typescript
interface AdakrposUser {
  id: string;
  email: string | null;         // Apple 계정 이메일
  verifiedEmail: string | null; // @pos.idserve.net 인증 이메일
  nickname: string | null;
  name: string | null;
  profilePhotoUrl: string | null;
  bio: string | null;
  contact: string | null;
  snsLinks: Record<string, string>;
  cohort: string | null;        // e.g. "cohort-2026"
  isVerified: boolean;          // pos.idserve.net 인증 여부
  createdAt: number;            // Unix 타임스탬프 (ms)
  updatedAt: number;            // Unix 타임스탬프 (ms)
}

interface AdakrposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix 타임스탬프 (ms)
  createdAt: number;  // Unix 타임스탬프 (ms)
}

type AuthContext =
  | { user: AdakrposUser; session: AdakrposSession; isAuthenticated: true }
  | { user: null; session: null; isAuthenticated: false };

interface AdakrposAuthConfig {
  apiKey: string;
  authUrl?: string; // 기본값: "https://ada-kr-pos.com"
}
\`\`\`

## HTTP API

### POST /api/sdk/verify-session
세션 ID를 검증하고 사용자 정보를 반환합니다.
\`\`\`
POST https://ada-kr-pos.com/api/sdk/verify-session
Content-Type: application/json
Authorization: Bearer <API_KEY>

{ "sessionId": "쿠키에서 읽은 adakrpos_session 값" }
\`\`\`
성공 (200): \`{ "user": AdakrposUser, "session": AdakrposSession }\`
실패: 404 (세션 없음), 401 (API 키 무효)

### GET /api/sdk/users/:id
사용자 ID로 프로필을 조회합니다.
\`\`\`
GET https://ada-kr-pos.com/api/sdk/users/{userId}
Authorization: Bearer <API_KEY>
\`\`\`
성공 (200): \`AdakrposUser\`
실패: 404 (사용자 없음), 401 (API 키 무효)

### POST /api/sdk/verify-key
API 키 유효성을 확인합니다.
\`\`\`
POST https://ada-kr-pos.com/api/sdk/verify-key
Authorization: Bearer <API_KEY>
\`\`\`
성공 (200): \`{ "valid": true }\`
실패: 401 (키 무효), 403 (키 비활성)

## 에러 코드
- 401: API 키 누락 또는 유효하지 않음
- 403: API 키 비활성 상태
- 404: 세션 또는 사용자를 찾을 수 없음
- 429: 요청 한도 초과

## 로그인 리다이렉트 (callbackUrl)
미인증 사용자를 로그인 페이지로 보낼 때 \`callbackUrl\` 파라미터를 사용하면 로그인 후 원래 페이지로 돌아옵니다.

\`\`\`
https://ada-kr-pos.com/login?callbackUrl=https://your-app.ada-kr-pos.com/current-page
\`\`\`

- callbackUrl은 \`https://\` + \`*.ada-kr-pos.com\` 도메인만 허용 (Open Redirect 방지)
- callbackUrl이 없거나 유효하지 않으면 기본 /mypage로 이동
- Apple 로그인, 매직링크 모두 지원

### 예시 (Hono)
\`\`\`typescript
if (!auth.isAuthenticated) {
  const loginUrl = new URL("https://ada-kr-pos.com/login");
  loginUrl.searchParams.set("callbackUrl", c.req.url);
  return c.redirect(loginUrl.toString());
}
\`\`\`

### 예시 (Express)
\`\`\`typescript
if (!auth.isAuthenticated) {
  const loginUrl = new URL("https://ada-kr-pos.com/login");
  loginUrl.searchParams.set("callbackUrl", \`\${req.protocol}://\${req.get("host")}\${req.originalUrl}\`);
  return res.redirect(loginUrl.toString());
}
\`\`\`

## 참고
- SDK는 401/403 응답 시 해당 API 키를 30초간 무효로 캐시합니다.
- 키 교체 후 즉시 반영하려면: \`import { clearApiKeyCache } from "@adakrpos/auth"; clearApiKeyCache();\`
- 미인증 사용자는 \`https://ada-kr-pos.com/login?callbackUrl=<현재URL>\` 로 리다이렉트하세요.`;
              navigator.clipboard.writeText(text);
              const btn = document.querySelector(
                ".btn-copy-docs",
              ) as HTMLButtonElement;
              if (btn) {
                const original = btn.textContent;
                btn.textContent = "복사됨!";
                setTimeout(() => {
                  btn.textContent = original;
                }, 2000);
              }
            }}
          >
            AI 에이전트용 복사
          </button>
        </div>
        <p className="docs-intro">
          API 키를 이용해 <code>*.ada-kr-pos.com</code> 서브도메인 서비스에서
          사용자 인증을 처리할 수 있습니다. SDK를 사용하거나 HTTP API를 직접
          호출하세요.
        </p>

        <details className="docs-group" open>
          <summary className="docs-group-title">인증 방식</summary>
          <div className="docs-content">
            <p>
              모든 API 요청에 <code>Authorization</code> 헤더를 포함하세요.
            </p>
            <pre className="docs-code">{`Authorization: Bearer ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`}</pre>
            <p>
              API 키가 유효하지 않거나 비활성 상태이면 <code>401</code> 또는{" "}
              <code>403</code>을 반환합니다. SDK는 무효한 키를 30초간 캐시하여
              불필요한 요청을 방지합니다.
            </p>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">SSO 동작 원리</summary>
          <div className="docs-content">
            <p>
              사용자가 <code>ada-kr-pos.com</code>에서 로그인하면 세션 쿠키가{" "}
              <code>Domain=.ada-kr-pos.com</code>으로 발급됩니다. 이 쿠키는 모든{" "}
              <code>*.ada-kr-pos.com</code> 서브도메인에 자동으로 전달되므로
              별도 로그인 없이 인증 상태를 공유할 수 있습니다.
            </p>
            <h4>세션 쿠키 사양</h4>
            <div className="docs-error-table">
              <div className="docs-error-row docs-error-header">
                <span>항목</span>
                <span>값</span>
              </div>
              <div className="docs-error-row">
                <code>이름</code>
                <span>
                  <code>adakrpos_session</code>
                </span>
              </div>
              <div className="docs-error-row">
                <code>Domain</code>
                <span>
                  <code>.ada-kr-pos.com</code>
                </span>
              </div>
              <div className="docs-error-row">
                <code>SameSite</code>
                <span>
                  <code>Lax</code>
                </span>
              </div>
              <div className="docs-error-row">
                <code>TTL</code>
                <span>7일 (50% 경과 시 자동 갱신)</span>
              </div>
              <div className="docs-error-row">
                <code>값</code>
                <span>Opaque UUID (JWT 아님)</span>
              </div>
            </div>
            <h4>인증 흐름</h4>
            <pre className="docs-code">{`1. 사용자가 ada-kr-pos.com에서 Apple 로그인 또는 매직링크로 인증
2. 서버가 adakrpos_session 쿠키를 Domain=.ada-kr-pos.com으로 설정
3. 서브도메인(예: app.ada-kr-pos.com)에서 쿠키가 자동 전달됨
4. 서브도메인 서버에서 SDK로 세션 검증 → 사용자 정보 반환`}</pre>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">SDK — @adakrpos/auth</summary>
          <div className="docs-content">
            <h4>설치</h4>
            <pre className="docs-code">{`npm install @adakrpos/auth`}</pre>

            <p>SDK는 4개의 진입점을 제공합니다:</p>
            <pre className="docs-code">{`@adakrpos/auth          — 코어 클라이언트 (모든 환경)
@adakrpos/auth/hono     — Hono 미들웨어
@adakrpos/auth/express  — Express 미들웨어
@adakrpos/auth/generic  — Web API Request (CF Workers, Deno, Bun)`}</pre>

            <h4>코어 클라이언트</h4>
            <p>
              가장 기본적인 사용 방법입니다. 세션 ID를 직접 전달하여 인증을
              처리합니다.
            </p>
            <pre className="docs-code">{`import { createAdakrposAuth } from "@adakrpos/auth";

const auth = createAdakrposAuth({
  apiKey: "ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  authUrl: "https://ada-kr-pos.com", // 기본값, 생략 가능
});

// 세션 검증 — 사용자 + 세션 정보 반환
const result = await auth.verifySession(sessionId);
if (result) {
  result.user;    // AdakrposUser
  result.session; // AdakrposSession
}

// 세션에서 사용자만 꺼내기 (verifySession 래핑)
const user = await auth.getCurrentUser(sessionId);

// 사용자 ID로 프로필 조회
const user = await auth.getUser("user-uuid");`}</pre>

            <h4>Hono 미들웨어</h4>
            <p>
              Hono 앱에서 미들웨어로 인증을 처리합니다. 쿠키에서 세션 ID를
              자동으로 추출합니다.
            </p>
            <pre className="docs-code">{`import { Hono } from "hono";
import { adakrposAuth, getAuth } from "@adakrpos/auth/hono";

const app = new Hono();

// 모든 라우트에 인증 컨텍스트 주입 (lazy — 호출 시에만 검증)
app.use("*", adakrposAuth({
  apiKey: process.env.ADAKRPOS_API_KEY!,
}));

app.get("/api/me", async (c) => {
  const auth = await getAuth(c);

  if (!auth.isAuthenticated) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ user: auth.user });
});`}</pre>

            <p>
              <code>requireAuth</code>를 사용하면 미인증 요청을 자동으로 401
              처리합니다:
            </p>
            <pre className="docs-code">{`import { requireAuth, getAuth } from "@adakrpos/auth/hono";

// 이 라우트 그룹은 인증 필수
app.use("/api/protected/*", requireAuth({
  apiKey: process.env.ADAKRPOS_API_KEY!,
}));

app.get("/api/protected/profile", async (c) => {
  const { user } = await getAuth(c); // 항상 인증됨
  return c.json(user);
});`}</pre>

            <h4>Express 미들웨어</h4>
            <p>
              Express 앱에서 <code>req.auth()</code>로 인증 상태에 접근합니다.
            </p>
            <pre className="docs-code">{`import express from "express";
import { adakrposAuthExpress } from "@adakrpos/auth/express";

const app = express();

// 모든 라우트에 req.auth() 주입 (lazy)
app.use(adakrposAuthExpress({
  apiKey: process.env.ADAKRPOS_API_KEY!,
}));

app.get("/dashboard", async (req, res) => {
  const auth = await req.auth!();

  if (!auth.isAuthenticated) {
    const loginUrl = new URL("https://ada-kr-pos.com/login");
    loginUrl.searchParams.set("callbackUrl", \`\${req.protocol}://\${req.get("host")}\${req.originalUrl}\`);
    return res.redirect(loginUrl.toString());
  }

  res.json({ user: auth.user });
});`}</pre>

            <p>
              <code>requireAuthExpress</code>로 미인증 요청을 자동 차단:
            </p>
            <pre className="docs-code">{`import { requireAuthExpress } from "@adakrpos/auth/express";

app.use("/api", requireAuthExpress({
  apiKey: process.env.ADAKRPOS_API_KEY!,
}));

// /api/* 아래 모든 라우트는 인증 필수
app.get("/api/me", async (req, res) => {
  const { user } = await req.auth!(); // 항상 인증됨
  res.json(user);
});`}</pre>

            <h4>Generic (Web API Request)</h4>
            <p>
              Cloudflare Workers, Deno, Bun 등 Web 표준 <code>Request</code>를
              사용하는 환경에서 사용합니다.
            </p>
            <pre className="docs-code">{`import { verifyRequest } from "@adakrpos/auth/generic";

// Cloudflare Workers 예시
export default {
  async fetch(request: Request, env: Env) {
    const auth = await verifyRequest(request, {
      apiKey: env.ADAKRPOS_API_KEY,
    });

    if (!auth.isAuthenticated) {
      return new Response("Unauthorized", { status: 401 });
    }

    return Response.json({ user: auth.user });
  },
};`}</pre>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">타입 정의</summary>
          <div className="docs-content">
            <h4>AdakrposUser</h4>
            <pre className="docs-code">{`interface AdakrposUser {
  id: string;
  email: string | null;         // Apple 계정 이메일
  verifiedEmail: string | null; // @pos.idserve.net 인증 이메일
  nickname: string | null;
  name: string | null;
  profilePhotoUrl: string | null;
  bio: string | null;
  contact: string | null;
  snsLinks: Record<string, string>;
  cohort: string | null;        // e.g. "cohort-2026"
  isVerified: boolean;          // pos.idserve.net 인증 여부
  createdAt: number;            // Unix 타임스탬프 (ms)
  updatedAt: number;            // Unix 타임스탬프 (ms)
}`}</pre>

            <h4>AdakrposSession</h4>
            <pre className="docs-code">{`interface AdakrposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix 타임스탬프 (ms)
  createdAt: number;  // Unix 타임스탬프 (ms)
}`}</pre>

            <h4>AuthContext</h4>
            <p>
              미들웨어(<code>/hono</code>, <code>/express</code>,{" "}
              <code>/generic</code>)가 반환하는 타입입니다.{" "}
              <code>isAuthenticated</code>로 타입 좁히기가 가능합니다.
            </p>
            <pre className="docs-code">{`// 인증됨
interface AdakrposAuthContext {
  user: AdakrposUser;
  session: AdakrposSession;
  isAuthenticated: true;
}

// 미인증
interface AdakrposUnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}

type AuthContext = AdakrposAuthContext | AdakrposUnauthContext;`}</pre>

            <h4>설정</h4>
            <pre className="docs-code">{`interface AdakrposAuthConfig {
  apiKey: string;
  authUrl?: string; // 기본값: "https://ada-kr-pos.com"
}`}</pre>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">HTTP API</summary>
          <div className="docs-content">
            <p>
              SDK 없이 직접 HTTP 요청을 보낼 수 있습니다. 모든 요청에{" "}
              <code>Authorization: Bearer &lt;API_KEY&gt;</code> 헤더가
              필요합니다.
            </p>

            <h4>POST /api/sdk/verify-session</h4>
            <p>
              세션 ID를 검증하고 해당 사용자 정보를 반환합니다. 서브도메인에서{" "}
              <code>adakrpos_session</code> 쿠키 값을 읽어 전달하세요.
            </p>
            <pre className="docs-code">{`POST https://ada-kr-pos.com/api/sdk/verify-session
Content-Type: application/json
Authorization: Bearer ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

{
  "sessionId": "쿠키에서 읽은 adakrpos_session 값"
}`}</pre>
            <p className="docs-response-label">성공 응답 (200):</p>
            <pre className="docs-code">{`{
  "user": {
    "id": "uuid",
    "email": "user@icloud.com",
    "verifiedEmail": "user@pos.idserve.net",
    "nickname": "데빈",
    "name": "홍길동",
    "profilePhotoUrl": "/api/photos/uuid",
    "bio": "안녕하세요",
    "contact": "010-1234-5678",
    "snsLinks": { "github": "https://github.com/user" },
    "cohort": "cohort-2026",
    "isVerified": true,
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  },
  "session": {
    "id": "session-uuid",
    "userId": "user-uuid",
    "expiresAt": 1710604800000,
    "createdAt": 1710000000000
  }
}`}</pre>
            <p className="docs-response-label">
              실패 응답: <code>404</code> (세션 만료/없음), <code>401</code>{" "}
              (API 키 무효)
            </p>

            <h4>GET /api/sdk/users/:id</h4>
            <p>사용자 ID로 프로필 정보를 조회합니다.</p>
            <pre className="docs-code">{`GET https://ada-kr-pos.com/api/sdk/users/user-uuid
Authorization: Bearer ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`}</pre>
            <p className="docs-response-label">성공 응답 (200):</p>
            <pre className="docs-code">{`{
  "id": "user-uuid",
  "email": "user@icloud.com",
  "verifiedEmail": "user@pos.idserve.net",
  "nickname": "데빈",
  "name": "홍길동",
  "profilePhotoUrl": "/api/photos/uuid",
  "bio": "안녕하세요",
  "contact": "010-1234-5678",
  "snsLinks": { "github": "https://github.com/user" },
  "cohort": "cohort-2026",
  "isVerified": true,
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}`}</pre>
            <p className="docs-response-label">
              실패 응답: <code>404</code> (사용자 없음), <code>401</code> (API
              키 무효)
            </p>

            <h4>POST /api/sdk/verify-key</h4>
            <p>
              API 키가 유효하고 활성 상태인지 확인합니다. 서비스 시작 시 키
              검증에 사용하세요.
            </p>
            <pre className="docs-code">{`POST https://ada-kr-pos.com/api/sdk/verify-key
Authorization: Bearer ak_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`}</pre>
            <p className="docs-response-label">성공 응답 (200):</p>
            <pre className="docs-code">{`{ "valid": true }`}</pre>
            <p className="docs-response-label">
              실패 응답: <code>401</code> (API 키 누락/무효), <code>403</code>{" "}
              (API 키 비활성)
            </p>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">에러 코드</summary>
          <div className="docs-content">
            <div className="docs-error-table">
              <div className="docs-error-row docs-error-header">
                <span>코드</span>
                <span>의미</span>
              </div>
              <div className="docs-error-row">
                <code>401</code>
                <span>API 키 누락 또는 유효하지 않음 — 키를 확인하세요</span>
              </div>
              <div className="docs-error-row">
                <code>403</code>
                <span>
                  API 키 비활성 상태 — 개발자 포털에서 키를 재발급하세요
                </span>
              </div>
              <div className="docs-error-row">
                <code>404</code>
                <span>세션/사용자 없음 — 로그인 페이지로 리다이렉트하세요</span>
              </div>
              <div className="docs-error-row">
                <code>429</code>
                <span>요청 한도 초과 — 잠시 후 재시도하세요</span>
              </div>
            </div>
            <p>
              SDK는 <code>401</code>/<code>403</code> 응답을 받으면 해당 API
              키를 30초간 무효로 캐시합니다. 키 교체 후 즉시 반영하려면{" "}
              <code>clearApiKeyCache()</code>를 호출하세요:
            </p>
            <pre className="docs-code">{`import { clearApiKeyCache } from "@adakrpos/auth";

clearApiKeyCache(); // 캐시된 키 유효성 초기화`}</pre>
          </div>
        </details>

        <details className="docs-group">
          <summary className="docs-group-title">
            로그인 리다이렉트 (callbackUrl)
          </summary>
          <div className="docs-content">
            <p>
              미인증 사용자를 로그인 페이지로 보낼 때 <code>callbackUrl</code>{" "}
              파라미터를 사용하면 로그인 완료 후 원래 페이지로 자동
              리다이렉트됩니다.
            </p>
            <pre className="docs-code">{`https://ada-kr-pos.com/login?callbackUrl=https://your-app.ada-kr-pos.com/current-page`}</pre>

            <h4>보안 제한</h4>
            <p>
              Open Redirect 방지를 위해 <code>callbackUrl</code>은 아래 조건을
              모두 만족해야 합니다:
            </p>
            <div className="docs-error-table">
              <div className="docs-error-row docs-error-header">
                <span>조건</span>
                <span>설명</span>
              </div>
              <div className="docs-error-row">
                <code>HTTPS</code>
                <span>
                  프로토콜이 <code>https://</code>여야 합니다
                </span>
              </div>
              <div className="docs-error-row">
                <code>도메인</code>
                <span>
                  <code>ada-kr-pos.com</code> 또는 <code>*.ada-kr-pos.com</code>
                  만 허용
                </span>
              </div>
            </div>
            <p>
              조건을 만족하지 않으면 <code>callbackUrl</code>은 무시되고{" "}
              <code>/mypage</code>로 이동합니다.
            </p>

            <h4>예시</h4>
            <pre className="docs-code">{`// 미인증 사용자를 로그인으로 보내기
const loginUrl = new URL("https://ada-kr-pos.com/login");
loginUrl.searchParams.set("callbackUrl", window.location.href);
window.location.href = loginUrl.toString();

// 결과: https://ada-kr-pos.com/login?callbackUrl=https%3A%2F%2Fyour-app.ada-kr-pos.com%2Fwrite`}</pre>

            <h4>지원 범위</h4>
            <p>
              Apple 로그인, 매직링크(이메일) 모두 <code>callbackUrl</code>을
              지원합니다. 이미 로그인된 상태에서 <code>callbackUrl</code>이
              포함된 로그인 페이지에 접근하면 바로 해당 URL로 리다이렉트됩니다.
            </p>
          </div>
        </details>
      </div>

      <div className="new-app-form">
        <h2>새 앱 등록</h2>
        <Form method="post">
          <div className="form-group">
            <label htmlFor="name">앱 이름</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="앱 이름을 입력하세요"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">설명 (선택)</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="앱에 대한 설명을 입력하세요"
            />
          </div>
          <button type="submit" className="btn-primary">
            앱 등록
          </button>
        </Form>
      </div>
    </div>
  );
}
