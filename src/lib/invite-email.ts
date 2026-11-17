const LOGO_URL = 'https://waitlist-hpvg.vercel.app/highpoint-logo.png';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildInviteEmail(name: string, registerUrl: string): { subject: string; html: string } {
  const greeting = `Hi ${escapeHtml(name.split(' ')[0])},`;
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
      <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center; font-size: 26px;">Welcome to the Highpoint Living Hub</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.6;">${greeting}</p>
      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        You've been invited to the Highpoint Living Hub, our home for parking and the apartment waitlist. Click the button below to create your password and set up your account:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${registerUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Create Your Account
        </a>
      </div>
      <p style="color: #999; font-size: 14px; line-height: 1.6;">
        This invite link expires in 7 days and can only be used once. If you weren't expecting this invite, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
        Highpoint Living Hub &bull; Parking and Waitlist Management
      </p>
    </div>
  </div>
</body>
</html>`;
  return { subject: "You're invited to the Highpoint Living Hub", html };
}
