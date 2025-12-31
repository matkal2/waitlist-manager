import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Initialize admin client inside function to avoid build-time errors
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, password, full_name, invite_id } = await request.json();

    if (!email || !password || !full_name || !invite_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('user_invites')
      .select('*')
      .eq('id', invite_id)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
    }

    if (invite.used) {
      return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
    }

    // Create user with admin API (auto-confirms email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      // Create user profile
      await supabaseAdmin.from('user_profiles').insert({
        id: authData.user.id,
        email,
        full_name,
        is_admin: false,
      });

      // Mark invite as used
      await supabaseAdmin
        .from('user_invites')
        .update({ used: true })
        .eq('id', invite_id);
    }

    return NextResponse.json({ success: true, message: 'Account created successfully' });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message || 'Registration failed' }, { status: 500 });
  }
}
