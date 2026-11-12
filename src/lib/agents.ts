import { createClient } from '@supabase/supabase-js';

export const UNASSIGNED_AGENT = 'Unassigned';
export const LEASING_TEAM_EMAIL = 'leasing@hpvgproperties.com';

const COMPANY_DOMAIN = '@hpvgproperties.com';
const AGENT_ROLES = ['leasing_agent', 'admin'];

// Agent name -> email, from user_profiles (leasing agents and admins); company addresses win over personal ones
export async function getAgentDirectory(): Promise<Record<string, string>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.from('user_profiles').select('full_name, email, role').in('role', AGENT_ROLES);
  if (error) console.error('Failed to load agent directory:', error);

  const directory: Record<string, string> = {};
  for (const profile of data || []) {
    const name = profile.full_name?.trim();
    const email = profile.email?.trim();
    if (!name || !email) continue;
    const existing = directory[name];
    const isCompany = email.toLowerCase().endsWith(COMPANY_DOMAIN);
    if (!existing || (isCompany && !existing.toLowerCase().endsWith(COMPANY_DOMAIN))) directory[name] = email;
  }
  return directory;
}

// Unassigned entries and agents without a profile go to the leasing team inbox
export function getAgentEmail(directory: Record<string, string>, agent: string | null | undefined): string {
  if (!agent || agent === UNASSIGNED_AGENT) return LEASING_TEAM_EMAIL;
  return directory[agent] || LEASING_TEAM_EMAIL;
}
