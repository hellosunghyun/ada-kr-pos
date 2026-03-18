const COLORS = {
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  border: "#E3E8EF",
  deepOcean: "#0B2447",
  oceanBlue: "#146C94",
  reefCyan: "#6CC4D6",
  mistBlue: "#EAF4FA",
  textPrimary: "#1D1D1F",
  textSecondary: "#6E6E73",
  textTertiary: "#8C8C91",
} as const;

interface EmailTemplateOptions {
  /** 이메일 상단의 작은 라벨 (예: "이메일 인증", "매직 링크") */
  eyebrow: string;
  /** 메인 제목 */
  title: string;
  /** 본문 설명 (HTML 허용) */
  body: string;
  /** CTA 버튼 텍스트 */
  ctaText: string;
  /** CTA 버튼 링크 */
  ctaUrl: string;
  /** 버튼 아래 보조 안내 텍스트 */
  footnote: string;
  /** 만료 시간 안내 (예: "24시간", "15분") */
  expiresIn?: string;
}

export function buildEmailHtml(options: EmailTemplateOptions): string {
  const { eyebrow, title, body, ctaUrl, ctaText, footnote, expiresIn } =
    options;

  return `<!DOCTYPE html>
<html lang="ko" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0; padding: 0; width: 100% !important; -webkit-font-smoothing: antialiased; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; padding: 16px !important; }
      .email-card { padding: 32px 24px !important; }
      .cta-btn { padding: 16px 32px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(title)} — ${escapeHtml(eyebrow)}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${COLORS.bg};">
    <tr>
      <td align="center" style="padding: 48px 24px;">

        <!-- Container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" class="email-container" style="max-width: 520px; width: 100%;">

          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: ${COLORS.oceanBlue}; padding: 0 0 4px 0;">
                    ADA · KR · POS
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 10px; letter-spacing: 0.15em; color: ${COLORS.textTertiary}; text-transform: uppercase;">
                    Apple Developer Academy @ POSTECH
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${COLORS.surface}; border-radius: 24px; border: 1px solid ${COLORS.border}; overflow: hidden;">

                <!-- Top accent line -->
                <tr>
                  <td style="height: 3px; background: linear-gradient(90deg, ${COLORS.oceanBlue}, ${COLORS.reefCyan}); font-size: 0; line-height: 0;">
                    &nbsp;
                  </td>
                </tr>

                <!-- Card content -->
                <tr>
                  <td class="email-card" style="padding: 48px 40px 44px 40px;">

                    <!-- Eyebrow -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size: 11px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: ${COLORS.oceanBlue}; padding-bottom: 16px;">
                          ${escapeHtml(eyebrow)}
                        </td>
                      </tr>
                    </table>

                    <!-- Title -->
                    <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 600; line-height: 1.2; color: ${COLORS.deepOcean}; letter-spacing: -0.01em;">
                      ${escapeHtml(title)}
                    </h1>

                    <!-- Body -->
                    <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.7; color: ${COLORS.textSecondary};">
                      ${body}
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 28px;">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(ctaUrl)}" style="height:52px;v-text-anchor:middle;width:240px;" arcsize="50%" strokecolor="${COLORS.oceanBlue}" fillcolor="${COLORS.deepOcean}">
                            <w:anchorlock/>
                            <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Pretendard,sans-serif;font-size:15px;font-weight:600;">${escapeHtml(ctaText)}</center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-->
                          <a href="${escapeHtml(ctaUrl)}" class="cta-btn" style="display: inline-block; background-color: ${COLORS.deepOcean}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 16px 40px; border-radius: 100px; letter-spacing: 0.02em; mso-hide: all;">
                            ${escapeHtml(ctaText)}
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>

                    ${
                      expiresIn
                        ? `<!-- Expires notice -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color: ${COLORS.mistBlue}; border-radius: 12px;">
                            <tr>
                              <td style="padding: 10px 20px; font-size: 13px; color: ${COLORS.oceanBlue}; font-weight: 500;">
                                이 링크는 <strong>${escapeHtml(expiresIn)}</strong> 동안 유효합니다
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>`
                        : ""
                    }

                    <!-- Divider -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="border-top: 1px solid ${COLORS.border}; padding-top: 24px;">
                          <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${COLORS.textTertiary};">
                            ${escapeHtml(footnote)}
                          </p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- URL fallback -->
          <tr>
            <td align="center" style="padding: 24px 0 0 0;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: ${COLORS.textTertiary};">
                버튼이 작동하지 않으면 아래 링크를 복사해 브라우저에 붙여넣으세요.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; line-height: 1.5; color: ${COLORS.oceanBlue}; word-break: break-all;">
                <a href="${escapeHtml(ctaUrl)}" style="color: ${COLORS.oceanBlue}; text-decoration: underline;">${escapeHtml(ctaUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 0 0 0;">
              <p style="margin: 0 0 4px 0; font-size: 11px; color: ${COLORS.textTertiary};">
                이 이메일은 <a href="https://ada-kr-pos.com" style="color: ${COLORS.oceanBlue}; text-decoration: none;">ada-kr-pos.com</a>에서 발송되었습니다.
              </p>
              <p style="margin: 0; font-size: 11px; color: ${COLORS.textTertiary};">
                본인이 요청하지 않았다면 이 이메일을 무시해주세요.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** 이메일 인증 HTML */
export function buildVerificationEmailHtml(verifyUrl: string): string {
  return buildEmailHtml({
    eyebrow: "이메일 인증",
    title: "이메일 주소를 인증해주세요",
    body: "아래 버튼을 눌러 이메일 인증을 완료하면,<br />기록을 남기고 여정에 참여할 수 있습니다.",
    ctaText: "이메일 인증하기",
    ctaUrl: verifyUrl,
    footnote:
      "본인이 인증을 요청하지 않았다면 이 이메일을 무시해주세요. 계정에 영향은 없습니다.",
    expiresIn: "24시간",
  });
}

/** 매직 링크 로그인 HTML */
export function buildMagicLinkEmailHtml(loginUrl: string): string {
  return buildEmailHtml({
    eyebrow: "매직 링크 로그인",
    title: "로그인 링크가 도착했습니다",
    body: "아래 버튼을 눌러 로그인하세요.<br />비밀번호 없이, 이 링크 하나로 바로 접속됩니다.",
    ctaText: "로그인하기",
    ctaUrl: loginUrl,
    footnote:
      "본인이 로그인을 요청하지 않았다면 이 이메일을 무시해주세요. 누군가 실수로 이메일을 입력했을 수 있습니다.",
    expiresIn: "15분",
  });
}
