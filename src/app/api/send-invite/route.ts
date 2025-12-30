import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not configured');
      return NextResponse.json({ 
        error: 'Email service not configured. Please add RESEND_API_KEY to environment variables.' 
      }, { status: 500 });
    }
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const { email, full_name, invite_id } = await request.json();

    if (!email || !full_name || !invite_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the base URL from the request
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://waitlist-manager-181gzrqgc-matthew-kalebs-projects.vercel.app';
    const registerUrl = `${baseUrl}/register?invite=${invite_id}`;

    // Use Resend's default domain - works without custom domain verification
    const fromEmail = 'Waitlist Manager <onboarding@resend.dev>';
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'You\'ve Been Invited to Waitlist Manager',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #1a1a1a; margin: 0 0 20px;">Welcome to Waitlist Manager</h1>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Hi ${full_name},
              </p>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                You've been invited to join the Waitlist Manager system. Click the button below to create your account:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${registerUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                  Create Your Account
                </a>
              </div>
              <p style="color: #999; font-size: 14px; line-height: 1.6;">
                This invite link will expire in 7 days. If you didn't expect this invite, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                Waitlist Manager • Property Management System
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend API error:', JSON.stringify(error, null, 2));
      return NextResponse.json({ 
        error: `Failed to send email: ${error.message || JSON.stringify(error)}` 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (error: any) {
    console.error('Error in send-invite:', error);
    return NextResponse.json({ 
      error: `Internal server error: ${error?.message || 'Unknown error'}` 
    }, { status: 500 });
  }
}
