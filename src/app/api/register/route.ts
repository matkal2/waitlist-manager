import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  console.log('=== REGISTRATION API CALLED ===');
  
  try {
    // Check environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
      return NextResponse.json({ error: 'Server configuration error: Missing Supabase URL' }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json({ error: 'Server configuration error: Missing service role key. Please add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.' }, { status: 500 });
    }

    // Initialize admin client inside function to avoid build-time errors
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await request.json();
    const { email, password, full_name, invite_id } = body;
    console.log('Registration request for:', email, 'invite_id:', invite_id);

    if (!email || !password || !full_name || !invite_id) {
      console.error('Missing fields:', { email: !!email, password: !!password, full_name: !!full_name, invite_id: !!invite_id });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate invite
    console.log('Validating invite...');
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('user_invites')
      .select('*')
      .eq('id', invite_id)
      .single();

    if (inviteError) {
      console.error('Invite validation error:', inviteError);
      return NextResponse.json({ error: 'Invalid invite: ' + inviteError.message }, { status: 400 });
    }

    if (!invite) {
      console.error('Invite not found');
      return NextResponse.json({ error: 'Invite not found' }, { status: 400 });
    }

    console.log('Invite found:', { used: invite.used, expires_at: invite.expires_at });

    if (invite.used) {
      return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
    }

    // Check if user already exists
    console.log('Checking if user already exists...');
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      console.log('User already exists, deleting old account...');
      // Delete the existing unconfirmed user so we can create fresh
      await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
      // Also delete from user_profiles if exists
      await supabaseAdmin.from('user_profiles').delete().eq('email', email);
    }

    // Create user with admin API (auto-confirms email)
    console.log('Creating new user...');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name },
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      return NextResponse.json({ error: 'Failed to create account: ' + authError.message }, { status: 400 });
    }

    console.log('User created successfully:', authData.user?.id);

    if (authData.user) {
      // Create user profile
      console.log('Creating user profile...');
      const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
        id: authData.user.id,
        email,
        full_name,
        is_admin: false,
      });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Don't fail the whole registration for this
      }

      // Mark invite as used
      console.log('Marking invite as used...');
      await supabaseAdmin
        .from('user_invites')
        .update({ used: true })
        .eq('id', invite_id);
    }

    console.log('=== REGISTRATION COMPLETE ===');
    return NextResponse.json({ success: true, message: 'Account created successfully' });
  } catch (error: any) {
    console.error('Registration exception:', error);
    return NextResponse.json({ error: error.message || 'Registration failed unexpectedly' }, { status: 500 });
  }
}
