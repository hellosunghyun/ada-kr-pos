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
        <p className="unofficial-notice">구성원이 만든 비공식 서비스입니다</p>

        <a href="/api/auth/apple" className="apple-signin-btn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="14" height="18" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
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
