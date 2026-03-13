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
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: request.headers.get("Origin") || new URL(request.url).origin,
    },
    body: new URLSearchParams({ email }),
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
            viewBox="0 0 814 1000"
            width="20"
            height="20"
            fill="white"
            aria-hidden="true"
          >
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 716.7 0 588.4 0 466.2 0 396.5 25.2 340 75.3 292.1c43.8-41.8 97.4-63.8 155.5-63.8 42.2 0 77.4 22.2 109.8 22.2 32.0 0 65.0-22.2 113.6-22.2 48.2 0 89.0 19.8 121.2 58.8z" />
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
