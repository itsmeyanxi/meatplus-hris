<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="background:#0f172a;padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                {{ config('app.name') }}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">Reset your password</p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;">Hello {{ $name }},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
                You (or someone else) requested a password reset for your Meatplus HRIS account. Click the button below to set a new password.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:8px;background:#0f172a;">
                    <a href="{{ $resetUrl }}" target="_blank"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:-0.1px;">
                      Set new password &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
                This link expires in <strong style="color:#475569;">60 minutes</strong>.
                If you didn&rsquo;t request a reset, you can safely ignore this email &mdash; your password won&rsquo;t change.
              </p>
              <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">
                Or copy this URL into your browser:<br />
                <span style="color:#64748b;">{{ $resetUrl }}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; {{ date('Y') }} {{ config('app.name') }}. This email was sent automatically &mdash; do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
