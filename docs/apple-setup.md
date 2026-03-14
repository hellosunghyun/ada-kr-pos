# Apple Sign in with Apple 설정 가이드

이 문서는 ADA(Apple Developer Academy @ POSTECH) 인증 서버에 Apple Sign In을 연동하는 방법을 설명합니다. Apple Developer 계정이 있어야 하며, 계정이 Apple Developer Program에 등록(enrolled)되어 있어야 합니다.

---

## Prerequisites

- Apple Developer Program 계정 (유료, 연 $99)
- [developer.apple.com](https://developer.apple.com) 로그인 후 Membership 상태 확인
- Cloudflare Workers 배포 환경 (`wrangler` CLI 설치 및 로그인 완료)

---

## Step 1: App ID 생성

App ID는 Apple 생태계에서 앱을 식별하는 기본 단위입니다.

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) 이동
2. **Identifiers** 탭 → **+** 버튼 클릭
3. **App IDs** 선택 → Continue
4. Type: **App** 선택 → Continue
5. 다음 항목 입력:
   - **Description**: `ADA Auth` (임의)
   - **Bundle ID**: `tech.adapos.auth` (Explicit 선택)
6. Capabilities 목록에서 **Sign In with Apple** 체크 ✅
7. Continue → Register

> Bundle ID는 나중에 Services ID와 연결됩니다. 정확히 기록해 두세요.

---

## Step 2: Services ID 생성 (웹 클라이언트 ID)

Services ID가 웹 OAuth 흐름에서 `client_id`로 사용됩니다. 이것이 `APPLE_CLIENT_ID`입니다.

1. Identifiers → **+** 클릭
2. **Services IDs** 선택 → Continue
3. 다음 항목 입력:
   - **Description**: `ADA Auth Web`
   - **Identifier**: `tech.adapos.auth.service`
4. Register 클릭 후, 방금 만든 Services ID를 목록에서 다시 클릭
5. **Sign In with Apple** 체크 ✅ → **Configure** 클릭
6. 설정 창에서:
   - **Primary App ID**: Step 1에서 만든 App ID 선택
    - **Domains and Subdomains**: `ada-kr-pos.com`
     - **Return URLs**: `https://ada-kr-pos.com/api/auth/apple/callback`
7. Next → Done → Continue → Save

> **주의**: Identifier(`tech.adapos.auth.service`)가 `APPLE_CLIENT_ID`입니다. App ID(`tech.adapos.auth`)가 아닙니다. 혼동하면 `invalid_client` 오류가 발생합니다.

---

## Step 3: Key 생성 (Sign in with Apple)

Private Key는 서버에서 `client_secret` JWT를 서명할 때 사용합니다.

1. **Keys** 탭 → **+** 클릭
2. Key Name 입력 (예: `ADA Auth Key`)
3. **Sign In with Apple** 체크 ✅ → **Configure** 클릭
4. Primary App ID: Step 1에서 만든 App ID 선택 → Save
5. Continue → Register

등록 완료 후 Key 상세 페이지에서:

- **Key ID** 기록 (10자리 영숫자) → `APPLE_KEY_ID`
- **Download** 버튼 클릭 → `.p8` 파일 저장

### ⚠️ CRITICAL: .p8 파일은 단 1회만 다운로드 가능!

Download 버튼은 이 페이지를 벗어나면 다시 나타나지 않습니다. 반드시 지금 다운로드하고 안전한 곳에 보관하세요.

- `.p8` 파일을 git에 절대 커밋하지 마세요
- `.gitignore`에 `*.p8` 추가를 권장합니다
- 분실 시 해당 키를 revoke하고 새 키를 생성해야 합니다 (Step 6 참고)

---

## Step 4: Team ID 확인

1. [developer.apple.com/account](https://developer.apple.com/account) 이동
2. 우측 상단 또는 **Membership** 탭에서 **Team ID** 확인
3. 10자리 영숫자 형식 (예: `ABCD1234EF`) → `APPLE_TEAM_ID`

---

## Step 5: Cloudflare Worker 시크릿 등록

`apps/auth` 디렉토리에서 아래 명령어를 실행합니다. 각 명령어 실행 후 값을 붙여넣으라는 프롬프트가 나타납니다.

```bash
# apps/auth 디렉토리에서 실행
wrangler secret put APPLE_CLIENT_ID    # Services ID (Step 2의 Identifier)
wrangler secret put APPLE_TEAM_ID      # Team ID (Step 4)
wrangler secret put APPLE_KEY_ID       # Key ID (Step 3)
wrangler secret put APPLE_PRIVATE_KEY  # .p8 파일 전체 내용 (Step 3)
wrangler secret put RESEND_API_KEY     # Resend 대시보드에서 발급
wrangler secret put AUTH_SECRET        # 아래 명령어로 생성
```

`AUTH_SECRET` 생성:

```bash
openssl rand -base64 32
```

### APPLE_PRIVATE_KEY 등록 방법

`.p8` 파일 내용 전체(`-----BEGIN PRIVATE KEY-----`부터 `-----END PRIVATE KEY-----`까지)를 그대로 붙여넣어야 합니다.

```bash
# 파이프로 직접 전달하는 방법
cat AuthKey_XXXXXXXXXX.p8 | wrangler secret put APPLE_PRIVATE_KEY
```

또는 `wrangler secret put APPLE_PRIVATE_KEY` 실행 후 파일 내용을 직접 붙여넣기 해도 됩니다.

---

## Step 6: client_secret JWT 로테이션 전략

Apple Sign In은 일반적인 `client_secret` 문자열 대신 JWT를 요구합니다.

### 동작 방식

서버 코드는 토큰 요청 시마다 `jose` 라이브러리로 `client_secret` JWT를 동적으로 생성합니다. 별도의 갱신 작업이 필요 없습니다.

- 알고리즘: **ES256**
- 최대 유효 기간: **6개월** (`exp = iat + 15552000`)
- 매 요청마다 새로 생성하므로 만료 걱정 없음

### APPLE_PRIVATE_KEY 자체의 만료

`.p8` 키 파일 자체는 만료되지 않습니다. Apple Developer Console에서 명시적으로 revoke하지 않는 한 계속 유효합니다.

### .p8 키를 분실했을 때

1. [Keys 페이지](https://developer.apple.com/account/resources/authkeys/list)에서 해당 키 선택 → **Revoke**
2. 새 키 생성 (Step 3 반복)
3. 새 Key ID와 .p8 파일로 시크릿 업데이트:
   ```bash
   wrangler secret put APPLE_KEY_ID
   wrangler secret put APPLE_PRIVATE_KEY
   ```

---

## 로컬 개발 환경 참고사항

Apple OAuth는 HTTPS와 등록된 도메인이 필요하기 때문에 `localhost`에서 완전한 테스트가 불가능합니다.

### 옵션 1: ngrok 사용

```bash
ngrok http 8787
```

ngrok이 제공하는 HTTPS URL(예: `https://xxxx.ngrok.io`)을 Apple Developer Console의 Return URLs에 임시로 추가합니다. 테스트 후 제거하세요.

### 옵션 2: 실제 배포 환경에서 테스트

`ada-kr-pos.com`에 배포 후 테스트하는 것이 가장 안정적입니다. Cloudflare Pages는 PR마다 preview URL을 제공하므로 이를 활용할 수 있습니다. 단, preview URL도 Apple Developer Console에 등록해야 합니다.

---

## Apple OAuth 기술 스펙

구현 시 참고할 엔드포인트와 파라미터입니다.

| 항목 | 값 |
|------|-----|
| Authorization endpoint | `https://appleid.apple.com/auth/authorize` |
| Token endpoint | `https://appleid.apple.com/auth/token` |
| JWKS URL | `https://appleid.apple.com/auth/keys` |
| response_mode | `form_post` (필수, GET redirect 불가) |
| scope | `name email` |

> **중요**: `email`은 최초 로그인 시에만 제공됩니다. 이후 로그인에서는 email이 포함되지 않으므로, 첫 로그인 때 반드시 저장해야 합니다.

> **중요**: Apple은 authorization code를 POST body로 전송합니다(`response_mode=form_post`). GET 쿼리 파라미터로 받으려 하면 동작하지 않습니다.

---

## 트러블슈팅

### `invalid_client`

Services ID가 아닌 App ID를 `APPLE_CLIENT_ID`로 사용했을 때 발생합니다.

- 확인: `APPLE_CLIENT_ID` 값이 `tech.adapos.auth.service` 형태인지 확인 (`.service`로 끝나는 Services ID)
- App ID(`tech.adapos.auth`)를 사용하면 안 됩니다

### `invalid_grant`

Authorization code가 만료되었을 때 발생합니다.

- Apple authorization code의 유효 시간은 **10분**입니다
- 콜백 처리 후 즉시 토큰 교환을 해야 합니다
- 개발 중 디버거로 오래 멈춰 있으면 발생할 수 있습니다

### `invalid_request`

`redirect_uri`가 Apple Developer Console에 등록된 값과 다를 때 발생합니다.

- 확인: Services ID Configure에서 등록한 Return URL과 코드에서 사용하는 `redirect_uri`가 정확히 일치하는지 확인
- 슬래시 하나, 프로토콜 차이(http vs https)도 불일치로 처리됩니다
