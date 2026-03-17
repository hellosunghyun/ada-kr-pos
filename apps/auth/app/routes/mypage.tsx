import { eq } from "drizzle-orm";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { users } from "~/db/schema";
import { isAllowedCallbackUrl } from "~/lib/callback.server";
import { updateProfilePhoto, updateUserProfile } from "~/lib/user.server";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";

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
    cohort: string | null;
    isVerified: boolean;
    createdAt: number;
    updatedAt: number;
  };
  success?: boolean;
  error?: string;
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await requireAuthPage(request, context);
  const env = context.cloudflare.env;
  const db = createDb(env.DB);
  const row = await db
    .select({ appleSub: users.appleSub })
    .from(users)
    .where(eq(users.id, auth.user.id))
    .get();

  const url = new URL(request.url);
  const returnToRaw = url.searchParams.get("returnTo");
  const returnTo =
    returnToRaw && isAllowedCallbackUrl(returnToRaw) ? returnToRaw : null;

  return Response.json({
    user: auth.user,
    hasAppleLinked: !!row?.appleSub,
    returnTo,
  });
}

export async function action({
  request,
  context,
}: ActionFunctionArgs): Promise<ActionData> {
  await validateCsrf(request);
  const auth = await requireAuthPage(request, context);
  const env = context.cloudflare.env;
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
    await r2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    const photoUrl = `/api/photos/${key}`;
    const updated = await updateProfilePhoto(db, auth.user.id, photoUrl);

    return { user: updated, success: true };
  }

  const formData = await request.formData();
  const cohortRaw = formData.get("cohort") as string | null;
  const profile = {
    nickname: (formData.get("nickname") as string) || undefined,
    name: (formData.get("name") as string) || undefined,
    bio: (formData.get("bio") as string) || undefined,
    contact: (formData.get("contact") as string) || undefined,
    cohort: cohortRaw === "" ? null : (cohortRaw ?? undefined),
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
      <p>
        서비스를 이용하려면 아카데미 이메일(@pos.idserve.net)을 인증해주세요.
      </p>

      <verifyFetcher.Form
        method="post"
        action="/api/verify/send"
        className="verify-form"
        style={{ maxWidth: 360, margin: "0 auto" }}
      >
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
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isVerifying}
          style={{ width: "100%", marginTop: "var(--space-3)" }}
        >
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

      <Form
        method="post"
        action="/api/auth/logout"
        style={{ marginTop: "var(--space-10)" }}
      >
        <button
          type="submit"
          className="btn-secondary"
          style={{
            padding: "var(--space-2) var(--space-4)",
            background: "transparent",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          로그아웃
        </button>
      </Form>
    </div>
  );
}

function optimizeImage(file: File): Promise<File> {
  const MAX_SIZE = 1024;
  const QUALITY = 0.85;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const optimized = new File([blob], "photo.webp", {
            type: "image/webp",
          });
          resolve(optimized);
        },
        "image/webp",
        QUALITY,
      );
    };
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다."));
    img.src = URL.createObjectURL(file);
  });
}

export default function MyPage() {
  const { user, hasAppleLinked, returnTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const unlinkFetcher = useFetcher<{ success?: boolean }>();
  const displayUser = actionData?.user ?? user;
  const isAppleLinked =
    unlinkFetcher.data?.success === true ? false : hasAppleLinked;

  if (!displayUser.isVerified) {
    return <VerifyEmailGate />;
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !e.target.form) return;

    try {
      const optimized = await optimizeImage(file);
      const dt = new DataTransfer();
      dt.items.add(optimized);
      e.target.files = dt.files;
      e.target.form.submit();
    } catch {
      e.target.form.submit();
    }
  }

  return (
    <div className="mypage-container">
      {returnTo && (
        <a href={returnTo} className="back-link">
          ← 돌아가기
        </a>
      )}
      <div className="profile-header">
        <div className="profile-photo-wrapper">
          <img
            src={
              displayUser.profilePhotoUrl ||
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%232a2a2a'/%3E%3Ccircle cx='60' cy='46' r='20' fill='%23555'/%3E%3Cpath d='M20 110c0-22 18-40 40-40s40 18 40 40' fill='%23555'/%3E%3C/svg%3E"
            }
            alt="Profile"
            className="profile-photo"
          />
          <Form
            method="post"
            encType="multipart/form-data"
            className="photo-upload-form"
          >
            <label className="photo-upload-label">
              <input
                type="file"
                name="photo"
                accept="image/*"
                onChange={handlePhotoChange}
                hidden
              />
              사진 변경
            </label>
          </Form>
        </div>
        <div className="profile-info">
          <h1>{displayUser.nickname || displayUser.name || "이름 없음"}</h1>
          <p className="profile-email">
            {displayUser.verifiedEmail || displayUser.email}
          </p>
          <div className="profile-badges">
            <span className="verified-badge">✓ 구성원 인증 완료</span>
            {displayUser.cohort && (
              <span className="cohort-badge">
                {displayUser.cohort.startsWith("cohort-")
                  ? `Cohort ${displayUser.cohort.slice(7)}`
                  : displayUser.cohort}
              </span>
            )}
            {isAppleLinked ? (
              <div className="apple-linked-badge">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 384 512"
                  width="10"
                  height="13"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                Apple 연결됨
                <unlinkFetcher.Form
                  method="post"
                  action="/api/auth/unlink-apple"
                >
                  <button
                    type="submit"
                    className="apple-unlink-btn"
                    aria-label="Apple 연결 해제"
                  >
                    ✕
                  </button>
                </unlinkFetcher.Form>
              </div>
            ) : (
              <a href="/api/auth/apple?link=true" className="apple-link-btn">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 384 512"
                  width="11"
                  height="14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                Apple 계정 연결하기
              </a>
            )}
          </div>
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
        <div className="form-group">
          <label htmlFor="cohort">구분</label>
          <select
            id="cohort"
            name="cohort"
            defaultValue={displayUser.cohort || ""}
            className="form-select"
          >
            <option value="">선택 안 함</option>
            {Array.from(
              { length: new Date().getFullYear() - 2025 },
              (_, i) => 2026 + i,
            ).map((year) => (
              <option key={year} value={`cohort-${year}`}>
                Cohort {year}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          저장
        </button>
      </Form>

      {actionData?.success && (
        <p className="success-msg">프로필이 업데이트되었습니다.</p>
      )}
      {actionData?.error && <p className="error-msg">{actionData.error}</p>}

      <Form method="post" action="/api/auth/logout" className="logout-form">
        <button type="submit" className="btn-secondary">
          로그아웃
        </button>
      </Form>
    </div>
  );
}
