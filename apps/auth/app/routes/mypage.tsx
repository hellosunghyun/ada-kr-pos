import { Form, useLoaderData, useActionData, useFetcher } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import { createDb } from "~/db/index";
import { updateUserProfile, updateProfilePhoto } from "~/lib/user.server";
import type { Env } from "~/types/env";

interface ActionData {
  user?: {
    id: string;
    email: string | null;
    verifiedEmail: string | null;
    nickname: string | null;
    name: string | null;
    profilePhotoUrl: string | null;
    bio: string | null;
    contact: string | null;
    snsLinks: Record<string, string>;
    isVerified: boolean;
    createdAt: number;
    updatedAt: number;
  };
  success?: boolean;
  error?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await requireAuthPage(request, context);
  return Response.json({ user: auth.user });
}

export async function action({ request, context }: ActionFunctionArgs): Promise<ActionData> {
  await validateCsrf(request);
  const auth = await requireAuthPage(request, context);
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file || file.size === 0) {
      return { error: "파일을 선택해주세요." };
    }

    const r2 = env.PROFILE_PHOTOS;
    const key = `photos/${auth.user.id}/${Date.now()}-${file.name}`;
    await r2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    const photoUrl = `/api/photos/${key}`;
    const updated = await updateProfilePhoto(db, auth.user.id, photoUrl);

    return { user: updated, success: true };
  }

  const formData = await request.formData();
  const profile = {
    nickname: (formData.get("nickname") as string) || undefined,
    name: (formData.get("name") as string) || undefined,
    bio: (formData.get("bio") as string) || undefined,
    contact: (formData.get("contact") as string) || undefined,
  };
  const updated = await updateUserProfile(db, auth.user.id, profile);

  return { user: updated, success: true };
}

function VerifyEmailGate() {
  const verifyFetcher = useFetcher<{ success?: boolean; error?: string }>();
  const isVerifying = verifyFetcher.state !== "idle";
  const verifyResult = verifyFetcher.data;

  return (
    <div className="verification-required">
      <h1>구성원 인증이 필요합니다</h1>
      <p>서비스를 이용하려면 아카데미 이메일(@pos.idserve.net)을 인증해주세요.</p>

      <verifyFetcher.Form method="post" action="/api/verify/send" className="verify-form" style={{ maxWidth: 360, margin: "0 auto" }}>
        <input
          type="email"
          name="email"
          placeholder="your@pos.idserve.net"
          required
          pattern="^[^@]+@pos\.idserve\.net$"
          title="@pos.idserve.net 이메일만 사용할 수 있습니다."
          className="form-input"
          style={{ fontSize: "var(--text-base)" }}
        />
        <button type="submit" className="btn btn-primary" disabled={isVerifying} style={{ width: "100%", marginTop: "var(--space-3)" }}>
          {isVerifying ? "전송 중..." : "인증 이메일 전송"}
        </button>
      </verifyFetcher.Form>

      {verifyResult?.success && (
        <p className="success-msg" style={{ marginTop: "var(--space-6)" }}>
          인증 이메일을 발송했습니다. 메일함을 확인해주세요.
        </p>
      )}
      {verifyResult?.error && (
        <p className="error-msg" style={{ marginTop: "var(--space-6)" }}>
          {verifyResult.error}
        </p>
      )}

      <Form method="post" action="/api/auth/logout" style={{ marginTop: "var(--space-10)" }}>
        <button type="submit" className="btn-secondary" style={{
          padding: "var(--space-2) var(--space-4)",
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}>
          로그아웃
        </button>
      </Form>
    </div>
  );
}

export default function MyPage() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const displayUser = actionData?.user ?? user;

  if (!displayUser.isVerified) {
    return <VerifyEmailGate />;
  }

  return (
    <div className="mypage-container">
      <div className="profile-header">
        <div className="profile-photo-wrapper">
          <img
            src={displayUser.profilePhotoUrl || "/default-avatar.svg"}
            alt="Profile"
            className="profile-photo"
          />
          <Form method="post" encType="multipart/form-data" className="photo-upload-form">
            <label className="photo-upload-label">
              <input
                type="file"
                name="photo"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    e.target.form?.submit();
                  }
                }}
                hidden
              />
              사진 변경
            </label>
          </Form>
        </div>
        <div className="profile-info">
          <h1>{displayUser.nickname || displayUser.name || "이름 없음"}</h1>
          <p className="profile-email">{displayUser.verifiedEmail || displayUser.email}</p>
          <span className="verified-badge">✓ 구성원 인증 완료</span>
          {!displayUser.email && (
            <a href="/api/auth/apple?link=true" className="apple-link-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 20" width="13" height="15" fill="currentColor" aria-hidden="true">
                <path d="M12.57 5.3c-.82.95-2.15 1.7-3.46 1.58-.17-1.33.49-2.72 1.24-3.59C11.17 2.33 12.6 1.62 13.76 1.5c.14 1.4-.41 2.77-1.19 3.8zM13.74 7.03c-1.9-.11-3.53 1.08-4.43 1.08-.92 0-2.3-1.02-3.82-1-1.97.03-3.78 1.14-4.79 2.9-2.05 3.54-.53 8.78 1.45 11.66.98 1.42 2.14 3 3.67 2.94 1.46-.06 2.03-.95 3.8-.95 1.76 0 2.28.95 3.82.92 1.59-.03 2.58-1.44 3.55-2.87 1.12-1.63 1.58-3.21 1.6-3.3-.03-.01-3.08-1.19-3.11-4.7-.03-2.94 2.4-4.35 2.51-4.42-1.37-2.03-3.52-2.26-4.25-2.26z" />
              </svg>
              Apple 계정 연결하기
            </a>
          )}
        </div>
      </div>

      <Form method="post" className="profile-form">
        <div className="form-group">
          <label htmlFor="nickname">닉네임</label>
          <input
            type="text"
            id="nickname"
            name="nickname"
            defaultValue={displayUser.nickname || ""}
            placeholder="닉네임을 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="name">이름</label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={displayUser.name || ""}
            placeholder="이름을 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="bio">소개</label>
          <textarea
            id="bio"
            name="bio"
            defaultValue={displayUser.bio || ""}
            rows={3}
            placeholder="자기소개를 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="contact">연락처</label>
          <input
            type="text"
            id="contact"
            name="contact"
            defaultValue={displayUser.contact || ""}
            placeholder="연락처를 입력하세요"
          />
        </div>
        <button type="submit" className="btn-primary">
          저장
        </button>
      </Form>

      {actionData?.success && (
        <p className="success-msg">프로필이 업데이트되었습니다.</p>
      )}
      {actionData?.error && (
        <p className="error-msg">{actionData.error}</p>
      )}

      <Form method="post" action="/api/auth/logout" className="logout-form">
        <button type="submit" className="btn-secondary">
          로그아웃
        </button>
      </Form>
    </div>
  );
}
