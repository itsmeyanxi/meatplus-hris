<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Set up your Meatplus HRIS account</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:40px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:18px;font-weight:700;">Meatplus HRIS</p>
              <p style="margin:0 0 24px;font-size:13px;color:#64748b;">Human Resource Information System</p>

              <p style="margin:0 0 12px;font-size:15px;font-weight:600;">Hi {{ $employeeName }},</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
                You've been invited to set up your account on the Meatplus HRIS portal. Click the button below to choose your username and password.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="border-radius:8px;background:#0f172a;">
                    <a href="{{ $inviteUrl }}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;border-radius:8px;">
                      Set up my account →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
                This link expires in <strong>72 hours</strong>. If you did not expect this email, you can safely ignore it.
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;word-break:break-all;">
                Or copy this link: {{ $inviteUrl }}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
