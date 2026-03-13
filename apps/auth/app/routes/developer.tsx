import { Form, useLoaderData, useActionData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import { generateApiKey, hashApiKey, getApiKeyPrefix } from "~/lib/apikey.server";
import type { Env } from "~/types/env";
import { eq, desc } from "drizzle-orm";

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

export async function loader({ request, context }: LoaderFunctionArgs): Promise<LoaderData> {
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

export async function action({ request, context }: ActionFunctionArgs): Promise<ActionData> {
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

  if (!user.isVerified) {
    return (
      <div className="developer-container">
        <div className="verification-required">
          <h1>Developer Portal</h1>
          <p>이메일 인증 후 이용 가능합니다.</p>
          <a href="/mypage">마이페이지로 이동</a>
        </div>
      </div>
    );
  }

  const newlyCreatedApp = actionData?.success && actionData.app?.apiKey ? actionData.app : null;

  return (
    <div className="developer-container">
      <h1>Developer Portal</h1>
      <p className="developer-subtitle">API 키를 관리하고 앱을 등록하세요.</p>

      {newlyCreatedApp && (
        <div className="api-key-reveal">
          <h3>API Key 생성됨</h3>
          <p>아래 API 키를 안전한 곳에 저장하세요.</p>
          <div className="api-key-value">{newlyCreatedApp.apiKey}</div>
          <button
            type="button"
            className="btn-copy"
            onClick={() => {
              navigator.clipboard.writeText(newlyCreatedApp.apiKey!);
            }}
          >
            복사
          </button>
          <p className="api-key-warning">⚠️ 이 키는 다시 볼 수 없습니다. 안전하게 보관하세요.</p>
        </div>
      )}

      {actionData?.error && <p className="error-msg">{actionData.error}</p>}

      <h2>등록된 앱</h2>
      {apps.length === 0 ? (
        <p className="no-apps">등록된 앱이 없습니다.</p>
      ) : (
        <table className="apps-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>API Key Prefix</th>
              <th>상태</th>
              <th>생성일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id}>
                <td>{app.name}</td>
                <td>
                  <code className="api-key-prefix">{app.apiKeyPrefix}</code>
                </td>
                <td>{app.isActive ? "활성" : "비활성"}</td>
                <td>{new Date(app.createdAt).toLocaleDateString("ko-KR")}</td>
                <td>
                  <Form method="post" action={`/api/developer/apps/${app.id}`}>
                    <input type="hidden" name="_method" value="delete" />
                    <button type="submit" className="btn-danger-small">
                      삭제
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
