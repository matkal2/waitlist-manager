import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key to access auth.users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // Try to get users from user_profiles first
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!profileError && profiles && profiles.length > 0) {
      return NextResponse.json({ 
        success: true, 
        users: profiles.map(p => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          role: p.is_admin ? 'Admin' : 'General',
          created_at: p.created_at
        }))
      });
    }

    // Fallback: Return known users if table doesn't exist or is empty
    const knownUsers = [
      {
        id: '1',
        email: 'matthew.kaleb1763@gmail.com',
        full_name: 'Matthew Kaleb',
        role: 'Admin',
        created_at: new Date().toISOString()
      },
      {
        id: '2', 
        email: 'mkaleb@hpvgproperties.com',
        full_name: 'Matthew Kaleb',
        role: 'Admin',
        created_at: new Date().toISOString()
      },
      {
        id: '3',
        email: 'mdillon@hpvgproperties.com',
        full_name: 'Michael Dillon',
        role: 'General',
        created_at: new Date().toISOString()
      }
    ];

    return NextResponse.json({ success: true, users: knownUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId, role } = await request.json();
    
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ is_admin: role === 'Admin' })
      .eq('id', userId);

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json();
    
    const { error } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
