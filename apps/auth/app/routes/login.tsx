import { Form, useActionData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { optionalAuth } from "~/middleware/auth.server";

interface ActionData {
  success?: boolean;
  error?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await optionalAuth(request, context);
  if (auth.isAuthenticated) {
    throw redirect("/mypage");
  }
  return {};
}

export async function action({ request }: ActionFunctionArgs): Promise<ActionData> {
  const formData = await request.formData();
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "이메일을 입력해주세요." };
  }

  if (!email.toLowerCase().endsWith("@pos.idserve.net")) {
    return { error: "Invalid email domain. Only @pos.idserve.net allowed." };
  }

  const response = await fetch(new URL("/api/auth/magic/send", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: request.headers.get("Origin") || new URL(request.url).origin,
    },
    body: JSON.stringify({ email }),
  });

  if (response.ok) {
    return { success: true };
  }

  const data = await response.json().catch(() => ({ error: "알 수 없는 오류가 발생했습니다." }));
  return { error: (data as { error?: string }).error || "이메일 전송에 실패했습니다." };
}

export default function Login() {
  const actionData = useActionData<ActionData>();

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>ADA Auth</h1>
        <p>Apple Developer Academy @ POSTECH</p>

        <a href="/api/auth/apple" className="apple-signin-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 17 20"
            width="15"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12.57 5.3c-.82.95-2.15 1.7-3.46 1.58-.17-1.33.49-2.72 1.24-3.59C11.17 2.33 12.6 1.62 13.76 1.5c.14 1.4-.41 2.77-1.19 3.8zM13.74 7.03c-1.9-.11-3.53 1.08-4.43 1.08-.92 0-2.3-1.02-3.82-1-1.97.03-3.78 1.14-4.79 2.9-2.05 3.54-.53 8.78 1.45 11.66.98 1.42 2.14 3 3.67 2.94 1.46-.06 2.03-.95 3.8-.95 1.76 0 2.28.95 3.82.92 1.59-.03 2.58-1.44 3.55-2.87 1.12-1.63 1.58-3.21 1.6-3.3-.03-.01-3.08-1.19-3.11-4.7-.03-2.94 2.4-4.35 2.51-4.42-1.37-2.03-3.52-2.26-4.25-2.26z" />
          </svg>
          Sign in with Apple
        </a>

        <div className="divider">
          <span>또는</span>
        </div>

        <Form method="post" className="magic-link-form">
          <label htmlFor="email">@pos.idserve.net 이메일로 로그인</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="your@pos.idserve.net"
            required
            pattern="^[^@]+@pos\.idserve\.net$"
            title="@pos.idserve.net 이메일만 사용할 수 있습니다."
          />
          <button type="submit">로그인 링크 보내기</button>
        </Form>

        {actionData?.success && (
          <p className="success-msg">이메일을 확인해주세요!</p>
        )}
        {actionData?.error && (
          <p className="error-msg">{actionData.error}</p>
        )}
      </div>
    </div>
  );
}
