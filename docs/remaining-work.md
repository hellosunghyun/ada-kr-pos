# ADA Auth Server — 남은 작업 목록

> 코드 구현은 완료. 아래는 **프로덕션 배포** 전 필요한 인프라/서비스 설정 작업.

---

## 1. Cloudflare 리소스 생성

wrangler.toml의 placeholder ID들을 실제 값으로 교체해야 함.

```bash
# D1 데이터베이스
wrangler d1 create ada-kr-pos-db
# → database_id를 wrangler.toml에 기입

# KV 네임스페이스 (4개)
wrangler kv namespace create SESSIONS
wrangler kv namespace create EMAIL_TOKENS
wrangler kv namespace create MAGIC_TOKENS
wrangler kv namespace create RATE_LIMITS
# → 각 id를 wrangler.toml에 기입

# R2 버킷
wrangler r2 bucket create ada-kr-pos-profile-photos
```

### D1 마이그레이션 실행

```bash
cd apps/auth
wrangler d1 migrations apply ada-kr-pos-db
```

---

## 2. 도메인 설정 (ada-kr-pos.com)

### DNS 레코드 (Cloudflare Dashboard)

| 타입 | 이름 | 값 | 프록시 |
|------|------|-----|--------|
| CNAME | `@` | `ada-kr-pos.pages.dev` | Proxied ✅ |
| CNAME | `www` | `ada-kr-pos.com` | Proxied ✅ |

### Cloudflare Pages 커스텀 도메인

1. Pages > ada-kr-pos > Custom domains
2. `ada-kr-pos.com` 추가
3. SSL 인증서 자동 발급 확인

### 서브도메인 SSO 사용 시

다른 서브도메인 앱(예: `app.ada-kr-pos.com`)에서도 쿠키가 필요하면:
- 쿠키 도메인이 `.ada-kr-pos.com`으로 설정됨 (wrangler.toml `COOKIE_DOMAIN`)
- 해당 서브도메인도 Cloudflare에서 프록시 되어야 함

---

## 3. Apple Sign-In 설정

> 상세 가이드: [`docs/apple-setup.md`](./apple-setup.md)

### 필요 항목

| 항목 | 설명 | 어디서 |
|------|------|--------|
| Apple Developer Program | 연 $99 유료 계정 | developer.apple.com |
| App ID | `tech.adakrpos.auth` (또는 변경) | Certificates, Identifiers & Profiles |
| Services ID | `tech.adakrpos.auth.service` → `APPLE_CLIENT_ID` | Certificates, Identifiers & Profiles |
| Key (.p8) | ES256 private key → `APPLE_PRIVATE_KEY` | Keys 탭 |
| Key ID | 10자리 영숫자 → `APPLE_KEY_ID` | Keys 탭 |
| Team ID | 10자리 영숫자 → `APPLE_TEAM_ID` | Membership 탭 |

### Apple Developer Console 등록

- **Domains and Subdomains**: `ada-kr-pos.com`
- **Return URLs**: `https://ada-kr-pos.com/api/auth/apple/callback`

---

## 4. Resend (이메일 발송) 설정

매직링크 + 이메일 인증에 필요.

### 계정 생성 & API 키

1. [resend.com](https://resend.com) 가입
2. API Keys → Create API Key → `RESEND_API_KEY`

### 도메인 인증

1. Resend Dashboard > Domains > Add Domain > `ada-kr-pos.com`
2. 표시되는 DNS 레코드를 Cloudflare에 추가:
   - SPF (TXT)
   - DKIM (CNAME × 3)
   - DMARC (TXT, 권장)
3. Verify 클릭 → 인증 완료 후 `noreply@ada-kr-pos.com`에서 발송 가능

---

## 5. Secrets 등록

```bash
cd apps/auth

# Apple Sign-In
wrangler secret put APPLE_CLIENT_ID     # Services ID
wrangler secret put APPLE_TEAM_ID       # Team ID
wrangler secret put APPLE_KEY_ID        # Key ID
wrangler secret put APPLE_PRIVATE_KEY   # .p8 파일 전체 내용

# Resend
wrangler secret put RESEND_API_KEY      # Resend API 키

# 세션 서명 (랜덤 생성)
openssl rand -base64 32 | wrangler secret put AUTH_SECRET
```

또는 `bash scripts/setup-secrets.sh` 실행.

---

## 6. 빌드 & 배포

```bash
# 빌드
cd apps/auth
pnpm build

# 배포
wrangler pages deploy
```

### GitHub Actions 자동 배포 (선택)

`.github/workflows/deploy.yml` 필요 시 구성:
- `main` 브랜치 push → 자동 빌드 + 배포
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 필요

---

## 7. 배포 후 확인 체크리스트

- [ ] `https://ada-kr-pos.com/api/health` → `{"status":"ok"}`
- [ ] `https://ada-kr-pos.com/login` → 로그인 페이지 정상 렌더링
- [ ] Apple Sign-In 버튼 → Apple 로그인 화면으로 리다이렉트
- [ ] Apple 로그인 완료 → `/mypage`로 리다이렉트, 세션 쿠키 생성
- [ ] 매직링크 이메일 입력 → `noreply@ada-kr-pos.com`에서 이메일 수신
- [ ] 매직링크 클릭 → 로그인 완료
- [ ] 마이페이지 → 프로필 수정, 사진 업로드 동작
- [ ] 이메일 인증 → 인증 완료 배지 표시
- [ ] 개발자 포털 → 앱 생성, API 키 발급 동작
- [ ] 로그아웃 → 세션 쿠키 삭제, `/login`으로 리다이렉트
- [ ] 서브도메인 SSO → `app.ada-kr-pos.com`에서 세션 쿠키 공유 확인

---

## 8. SDK 배포 (@adakrpos/auth)

```bash
cd packages/auth-sdk

# 빌드
pnpm build

# npm 배포
npm publish --access public
```

### npm 계정 필요
- npmjs.com 계정
- `@adakrpos` org 생성 (또는 기존 org 사용)
- `npm login` 후 publish

---

## 요약: 작업 순서

```
1. Cloudflare 리소스 생성 (D1, KV ×4, R2)
2. wrangler.toml placeholder → 실제 ID 교체
3. D1 마이그레이션 실행
4. Apple Developer Console 설정
5. Resend 계정 + 도메인 인증
6. wrangler secrets 등록 (6개)
7. 도메인 DNS 설정
8. pnpm build && wrangler pages deploy
9. 배포 후 체크리스트 확인
10. (선택) SDK npm publish
```
