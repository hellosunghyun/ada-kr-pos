# callbackUrl - 로그인 후 리다이렉트 가이드

> ada-kr-pos.com에서 로그인 후 원래 앱으로 돌아가기 위한 파라미터.

---

## 개요

외부 서브도메인 앱(예: `divelog.ada-kr-pos.com`)에서 로그인이 필요할 때,
사용자를 `ada-kr-pos.com/login`으로 보내고 로그인 완료 후 **원래 페이지로 되돌려보내는** 기능입니다.

```
[사용자] → divelog에서 글쓰기 클릭
       → ada-kr-pos.com/login?callbackUrl=https://divelog.ada-kr-pos.com/write
       → 로그인 (Apple / Magic Link)
       → 자동으로 divelog.ada-kr-pos.com/write 로 이동
```

---

## 사용법

### 로그인 페이지로 보낼 때

```
https://ada-kr-pos.com/login?callbackUrl={인코딩된_URL}
```

예시:

```javascript
// divelog.ada-kr-pos.com 에서
const loginUrl = new URL("https://ada-kr-pos.com/login");
loginUrl.searchParams.set("callbackUrl", window.location.href);
window.location.href = loginUrl.toString();
```

결과 URL:

```
https://ada-kr-pos.com/login?callbackUrl=https%3A%2F%2Fdivelog.ada-kr-pos.com%2Fwrite
```

### 파라미터 이름

| 이름 | 설명 |
|------|------|
| `callbackUrl` | 로그인 성공 후 리다이렉트할 전체 URL |

> `callbackUrl`을 쓰는 이유: NextAuth/Auth.js 등 JS 생태계에서 가장 널리 쓰이는 관례입니다.

---

## 동작 방식

### callbackUrl이 있을 때

| 인증 방식 | 로그인 성공 후 |
|-----------|---------------|
| Apple Sign In | `callbackUrl`로 리다이렉트 |
| Magic Link (이메일) | `callbackUrl`로 리다이렉트 |

### callbackUrl이 없을 때

기존과 동일하게 `/mypage`로 리다이렉트됩니다.

### 이미 로그인된 상태에서 접근 시

`/login` 페이지에 이미 인증된 상태로 접근하면:
- `callbackUrl`이 있으면 → 해당 URL로 바로 리다이렉트
- `callbackUrl`이 없으면 → `/mypage`로 리다이렉트 (기존 동작)

---

## 보안: 도메인 화이트리스트

**Open Redirect 방지를 위해 `callbackUrl`은 허용된 도메인만 동작합니다.**

### 허용 도메인

- `ada-kr-pos.com` (루트 도메인)
- `*.ada-kr-pos.com` (모든 서브도메인)

### 거부되는 경우

아래 URL은 전부 무시되고 `/mypage`로 리다이렉트됩니다:

```
# 외부 도메인
?callbackUrl=https://evil.com/steal

# 도메인 사칭
?callbackUrl=https://fake-ada-kr-pos.com

# 프로토콜 없음
?callbackUrl=//evil.com

# javascript: 스킴
?callbackUrl=javascript:alert(1)
```

### 검증 로직

```typescript
function isAllowedCallbackUrl(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "ada-kr-pos.com" ||
        url.hostname.endsWith(".ada-kr-pos.com"))
    );
  } catch {
    return false;
  }
}
```

---

## 연동 예시

### divelog.ada-kr-pos.com

```typescript
// 미인증 사용자를 로그인으로 보낼 때
function redirectToLogin() {
  const loginUrl = new URL("https://ada-kr-pos.com/login");
  loginUrl.searchParams.set("callbackUrl", window.location.href);
  window.location.href = loginUrl.toString();
}

// 예시: 글쓰기 페이지 접근 시
if (!isAuthenticated) {
  redirectToLogin();
  // → https://ada-kr-pos.com/login?callbackUrl=https://divelog.ada-kr-pos.com/write
}
```

### 서버 사이드 (미들웨어)

```typescript
// 인증 필요한 페이지에서
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);

  if (!session) {
    const loginUrl = new URL("https://ada-kr-pos.com/login");
    loginUrl.searchParams.set("callbackUrl", request.url);
    throw redirect(loginUrl.toString());
  }

  return { user: session.user };
}
```

---

## 주의사항

1. **callbackUrl은 반드시 전체 URL**이어야 합니다 (경로만 X)
   - O: `https://divelog.ada-kr-pos.com/write`
   - X: `/write`

2. **URL 인코딩** 필수 - `encodeURIComponent()` 또는 `URLSearchParams`를 사용하세요

3. **HTTPS만 허용** - HTTP URL은 거부됩니다

4. **쿠키 공유**: `ada-kr-pos.com`의 세션 쿠키는 `.ada-kr-pos.com` 도메인으로 설정되어
   모든 서브도메인에서 공유됩니다. 로그인 후 별도 인증 과정 없이 바로 세션을 사용할 수 있습니다.
