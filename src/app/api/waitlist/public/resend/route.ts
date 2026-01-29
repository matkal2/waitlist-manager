import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const { pendingId } = await request.json();

    if (!pendingId) {
      return NextResponse.json({ error: 'Missing pending ID' }, { status: 400 });
    }

    // Get pending verification
    const { data: pending, error: fetchError } = await supabase
      .from('waitlist_pending_verifications')
      .select('*')
      .eq('id', pendingId)
      .single();

    if (fetchError || !pending) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    // Generate new code and update expiry
    const newCode = generateCode();
    const newExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const { error: updateError } = await supabase
      .from('waitlist_pending_verifications')
      .update({
        verification_code: newCode,
        expires_at: newExpiry.toISOString(),
      })
      .eq('id', pendingId);

    if (updateError) {
      console.error('Error updating verification:', updateError);
      return NextResponse.json({ error: 'Failed to resend code' }, { status: 500 });
    }

    // Send new verification email
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ 
        success: true,
        message: 'Code regenerated (email disabled)',
        code: newCode // Only for testing
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = 'Waitlist Manager <noreply@hpvgproperties.com>';

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: pending.email,
      subject: 'New Verification Code - Waitlist Registration',
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
              <div style="text-align: center; margin-bottom: 24px;">
                <img src="https://waitlist-hpvg.vercel.app/highpoint-logo.png" alt="Highpoint Living" style="max-width: 200px; height: auto;">
              </div>
              <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center;">New Verification Code</h1>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Hi ${pending.full_name.split(' ')[0]},
              </p>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Here's your new verification code for the ${pending.property} waitlist:
              </p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">
                  ${newCode}
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 8px;">
                  This code expires in 15 minutes
                </p>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                Highpoint Living • Waitlist Manager
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (emailError) {
      console.error('Error resending verification email:', emailError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Verification code resent'
    });

  } catch (error) {
    console.error('Error in resend:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
