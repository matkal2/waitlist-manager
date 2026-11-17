import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { authorize } from '@/lib/api-auth';
import { permissions } from '@/lib/permissions';
import { buildInviteEmail } from '@/lib/invite-email';

export async function POST(request: NextRequest) {
  const caller = await authorize(request, permissions.canManageUsers);
  if (caller instanceof NextResponse) return caller;

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

    // Get the base URL from the request headers (works in production)
    const host = request.headers.get('host') || '';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
    const registerUrl = `${baseUrl}/register?invite=${invite_id}`;

    const { subject, html } = buildInviteEmail(full_name, registerUrl);
    const { data, error } = await resend.emails.send({
      from: 'Highpoint Living Hub <noreply@hpvgproperties.com>',
      to: email,
      subject,
      html,
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
