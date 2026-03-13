import { Form, useLoaderData, useActionData } from "react-router";
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

export default function MyPage() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const displayUser = actionData?.user ?? user;

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
          <p className="profile-email">{displayUser.email || displayUser.verifiedEmail}</p>
          {displayUser.isVerified ? (
            <span className="verified-badge">✓ 구성원 인증 완료</span>
          ) : (
            <a href="/api/verify/send" className="verify-btn">
              이메일 인증하기
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
