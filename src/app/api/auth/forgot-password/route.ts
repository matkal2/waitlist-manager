import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildPasswordResetEmail } from '@/lib/password-reset-email';

export async function POST(request: NextRequest) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, RESEND_API_KEY: resendKey } = process.env;
  if (!url || !serviceKey || !resendKey) {
    return NextResponse.json({ error: 'Password reset is not configured.' }, { status: 500 });
  }

  const { email } = await request.json().catch(() => ({ email: '' }));
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Please enter your email address' }, { status: 400 });
  }

  const supabaseAdmin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const host = request.headers.get('host') || '';
  const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: normalizedEmail,
    options: { redirectTo: `${origin}/reset-password` },
  });

  // Unknown emails get the same response so the form can't be used to check who has an account
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ success: true });
  }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('full_name')
    .eq('email', data.user.email ?? normalizedEmail)
    .maybeSingle();

  const { subject, html } = buildPasswordResetEmail(profile?.full_name ?? null, data.properties.action_link);
  const { error: sendError } = await new Resend(resendKey).emails.send({
    from: 'Highpoint Living Hub <noreply@hpvgproperties.com>',
    to: normalizedEmail,
    subject,
    html,
  });

  if (sendError) {
    console.error('Password reset email failed:', sendError);
    return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
