# Supabase auth email templates

GENERATED from `apps/web/lib/email/template.ts` (`authEmailTemplates()`) — do not edit
by hand; a test keeps this file byte-identical to the code. Paste each template into
Supabase Dashboard → Authentication → Email Templates.

## Magic Link

**Subject:**

```
Your ZetaLog sign-in code: {{ .Token }}
```

**Body (Message HTML):**

```html
<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fefbf2">
  <span style="display:none;max-height:0;overflow:hidden">{{ .Token }} &mdash; The code expires in one hour.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefbf2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px">
        <tr><td style="padding:0 4px 14px;font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-weight:800;font-size:19px;letter-spacing:.04em;text-transform:uppercase;color:#780000">ZetaLog</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #fef6e6;border-radius:14px;padding:28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;color:#003049;padding-bottom:8px">Your sign-in code</td></tr>
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#264f64;padding-bottom:22px">Enter this code at www.zetalog.co.uk to sign in.</td></tr>
            <tr><td align="center" style="background:#fffdfa;border:1px solid #fef6e6;border-radius:10px;padding:18px 12px">
              <span style="font-family:'Azeret Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:.28em;color:#003049;font-variant-numeric:tabular-nums">{{ .Token }}</span>
            </td></tr>
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#5384a2;padding-top:18px">The code expires in one hour. If you didn't request it, you can safely ignore this email.</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px 0;border-top:1px solid #e6eaed;font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#5384a2">
          Sent by ZetaLog &middot; www.zetalog.co.uk &middot; Not affiliated with Zetamac.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

## Confirm signup

**Subject:**

```
Your ZetaLog sign-up code: {{ .Token }}
```

**Body (Message HTML):**

```html
<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fefbf2">
  <span style="display:none;max-height:0;overflow:hidden">{{ .Token }} &mdash; The code expires in one hour.</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefbf2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px">
        <tr><td style="padding:0 4px 14px;font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-weight:800;font-size:19px;letter-spacing:.04em;text-transform:uppercase;color:#780000">ZetaLog</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #fef6e6;border-radius:14px;padding:28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;color:#003049;padding-bottom:8px">Welcome to ZetaLog</td></tr>
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#264f64;padding-bottom:22px">Enter this code at www.zetalog.co.uk to finish creating your account.</td></tr>
            <tr><td align="center" style="background:#fffdfa;border:1px solid #fef6e6;border-radius:10px;padding:18px 12px">
              <span style="font-family:'Azeret Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:.28em;color:#003049;font-variant-numeric:tabular-nums">{{ .Token }}</span>
            </td></tr>
            <tr><td style="font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#5384a2;padding-top:18px">The code expires in one hour. If you didn't request it, you can safely ignore this email.</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px 0;border-top:1px solid #e6eaed;font-family:'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#5384a2">
          Sent by ZetaLog &middot; www.zetalog.co.uk &middot; Not affiliated with Zetamac.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```
