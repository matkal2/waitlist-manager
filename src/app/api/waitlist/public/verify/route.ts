import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getPropertyNickname } from '@/lib/properties';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { pendingId, code } = await request.json();

    if (!pendingId || !code) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get pending verification
    const { data: pending, error: fetchError } = await supabase
      .from('waitlist_pending_verifications')
      .select('*')
      .eq('id', pendingId)
      .single();

    if (fetchError || !pending) {
      return NextResponse.json({ error: 'Verification not found or expired' }, { status: 404 });
    }

    // Check if expired
    if (new Date(pending.expires_at) < new Date()) {
      await supabase.from('waitlist_pending_verifications').delete().eq('id', pendingId);
      return NextResponse.json({ error: 'Verification code has expired. Please start over.' }, { status: 400 });
    }

    // Check code
    if (pending.verification_code !== code) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Code is valid - add to waitlist
    const { data: entryData, error: insertError } = await supabase
      .from('waitlist_entries')
      .insert({
        entry_type: 'Prospect',
        status: 'Active',
        full_name: pending.full_name,
        email: pending.email,
        phone: pending.phone || '',
        assigned_agent: 'Unassigned',
        property: getPropertyNickname(pending.property),
        unit_type_pref: pending.unit_type_pref,
        preferred_units: null,
        floor_pref: pending.floor_pref,
        max_budget: pending.max_budget || 0,
        move_in_date: pending.move_in_date,
        move_in_date_end: pending.move_in_date_end,
        current_unit_number: null,
        internal_notes: pending.notes ? `[Self-registered] ${pending.notes}` : '[Self-registered via public form]',
        is_section_8: false,
        extended_retention: false,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting waitlist entry:', insertError);
      return NextResponse.json({ error: 'Failed to add to waitlist' }, { status: 500 });
    }

    // Delete pending verification
    await supabase.from('waitlist_pending_verifications').delete().eq('id', pendingId);

    // Send confirmation email
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = 'Waitlist Manager <noreply@hpvgproperties.com>';

      try {
        await resend.emails.send({
          from: fromEmail,
          to: pending.email,
          subject: `You're on the Waitlist - ${pending.property}`,
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
                  <div style="text-align: center; margin-bottom: 24px;">
                    <div style="display: inline-block; background: #dcfce7; border-radius: 50%; padding: 16px;">
                      <div style="width: 32px; height: 32px; color: #16a34a;">✓</div>
                    </div>
                  </div>
                  <h1 style="color: #1a1a1a; margin: 0 0 20px; text-align: center;">You're on the Waitlist!</h1>
                  <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    Hi ${pending.full_name.split(' ')[0]},
                  </p>
                  <p style="color: #666; font-size: 16px; line-height: 1.6;">
                    Thank you for joining our waitlist! We've received your information and a member of our leasing team will reach out when a matching unit becomes available.
                  </p>
                  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
                    <h3 style="margin: 0 0 12px; color: #1a1a1a; font-size: 14px;">Your Preferences:</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Property:</td>
                        <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; text-align: right; font-weight: 500;">${pending.property}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Unit Type:</td>
                        <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; text-align: right; font-weight: 500;">${pending.unit_type_pref}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Move-in Date:</td>
                        <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; text-align: right; font-weight: 500;">${new Date(pending.move_in_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${pending.move_in_date_end ? ' - ' + new Date(pending.move_in_date_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</td>
                      </tr>
                      ${pending.max_budget ? `
                      <tr>
                        <td style="padding: 6px 0; color: #666; font-size: 14px;">Max Budget:</td>
                        <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; text-align: right; font-weight: 500;">$${pending.max_budget}/month</td>
                      </tr>
                      ` : ''}
                    </table>
                  </div>
                  <p style="color: #666; font-size: 14px; line-height: 1.6;">
                    <strong>What happens next?</strong><br>
                    Our team will automatically match you with available units that fit your criteria. A member of our leasing team will reach out as soon as a matching unit becomes available.
                  </p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                    Questions? Contact us at <a href="mailto:leasing@hpvgproperties.com" style="color: #2563eb;">leasing@hpvgproperties.com</a>
                  </p>
                  <p style="color: #999; font-size: 12px; margin: 8px 0 0; text-align: center;">
                    Highpoint Living • Waitlist Manager
                  </p>
                </div>
              </div>
            </body>
            </html>
          `,
        });
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Don't fail the request if confirmation email fails
      }
    }

    return NextResponse.json({ 
      success: true,
      entryId: entryData.id,
      message: 'Successfully added to waitlist'
    });

  } catch (error) {
    console.error('Error in verify:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
