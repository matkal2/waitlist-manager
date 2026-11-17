import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseRole, type UserRole } from '@/lib/permissions';

export type ApiCaller =
  | { kind: 'system' }
  | { kind: 'user'; email: string; fullName: string | null; role: UserRole };

const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const deny = (status: 401 | 403, error: string) => NextResponse.json({ success: false, error }, { status });

// Headers for server-to-server calls (cron jobs, scheduled move-outs) to internal API routes
export function systemAuthHeaders(): Record<string, string> {
  return process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
}

// Returns the caller, or a 401/403 response to send back. Pass `allowed` to restrict by role.
export async function authorize(
  request: Request,
  allowed?: (role: UserRole | null) => boolean
): Promise<ApiCaller | NextResponse> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return deny(401, 'Please sign in.');

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return { kind: 'system' };

  const supabase = adminClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) return deny(401, 'Your session has expired. Please sign in again.');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, is_admin, full_name')
    .eq('email', user.email)
    .maybeSingle();
  if (!profile) return deny(403, 'Your account does not have access.');

  const role: UserRole | null = parseRole(profile.role) ?? (profile.is_admin ? 'admin' : null);
  if (!role) return deny(403, 'Your account does not have access.');
  if (allowed && !allowed(role)) return deny(403, 'You do not have permission to do this.');

  return { kind: 'user', email: user.email, fullName: profile.full_name ?? null, role };
}
