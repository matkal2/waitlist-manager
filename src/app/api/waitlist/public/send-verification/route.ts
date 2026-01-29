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
    const body = await request.json();
    const { full_name, email, phone, property, unit_type_pref, floor_pref, max_budget, move_in_date, move_in_date_end, notes } = body;

    // Validate required fields (phone is optional)
    if (!full_name || !email || !property || !unit_type_pref || !move_in_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Generate verification code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Store pending entry with verification code
    const { data: pendingData, error: pendingError } = await supabase
      .from('waitlist_pending_verifications')
      .insert({
        full_name,
        email: email.toLowerCase(),
        phone: phone || null,
        property,
        unit_type_pref,
        floor_pref: floor_pref || 'No Preference',
        max_budget: max_budget ? Number(max_budget) : null,
        move_in_date,
        move_in_date_end: move_in_date_end || null,
        notes: notes || null,
        verification_code: code,
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (pendingError) {
      console.error('Error storing pending verification:', pendingError);
      return NextResponse.json({ error: 'Failed to create verification' }, { status: 500 });
    }

    // Send verification email
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured - skipping email');
      return NextResponse.json({ 
        pendingId: pendingData.id,
        message: 'Verification created (email disabled)',
        code: code // Only for testing when email is disabled
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = 'Waitlist Manager <noreply@hpvgproperties.com>';

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Verify Your Email - Waitlist Registration',
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
              <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center;">Verify Your Email</h1>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Hi ${full_name.split(' ')[0]},
              </p>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Thank you for joining our waitlist for <strong>${property}</strong>. Please use the verification code below to complete your registration:
              </p>
              <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">
                  ${code}
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 8px;">
                  This code expires in 15 minutes
                </p>
              </div>
              <p style="color: #999; font-size: 14px; line-height: 1.6;">
                If you didn't request this, you can safely ignore this email.
              </p>
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
      console.error('Error sending verification email:', emailError);
      // Delete the pending entry if email failed
      await supabase.from('waitlist_pending_verifications').delete().eq('id', pendingData.id);
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

    return NextResponse.json({ 
      pendingId: pendingData.id,
      message: 'Verification email sent'
    });

  } catch (error) {
    console.error('Error in send-verification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
