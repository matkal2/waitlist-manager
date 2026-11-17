const LOGO_URL = 'https://waitlist-hpvg.vercel.app/highpoint-logo.png';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildPasswordResetEmail(name: string | null, resetUrl: string): { subject: string; html: string } {
  const greeting = name ? `Hi ${escapeHtml(name.split(' ')[0])},` : 'Hi,';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${LOGO_URL}" alt="Highpoint Living" width="96" style="width: 96px; height: auto;">
      </div>
      <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center; font-size: 26px;">Change Your Password</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.6;">${greeting}</p>
      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        We received a request to change the password for your Highpoint Living Hub account. Click the button below to choose a new password:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Change Password
        </a>
      </div>
      <p style="color: #999; font-size: 14px; line-height: 1.6;">
        For your security, this link can only be used once and expires soon. If you didn't ask to change your password, you can safely ignore this email. Your current password will keep working.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
        Highpoint Living Hub &bull; Parking and Waitlist Management
      </p>
    </div>
  </div>
</body>
</html>`;
  return { subject: 'Change your Highpoint Living Hub password', html };
}
