-- Highpoint Living Hub: lock the database to invited staff only.
-- Run once in Supabase → SQL Editor, AFTER the security update is live on the site.
-- The site's server uses the service role key, which is not affected by these rules.

-- 1. Helper checks (run with owner rights so they can read user_profiles safely)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.is_hub_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where (id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'))
      and (lower(coalesce(role, '')) = 'admin' or is_admin = true)
  );
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_hub_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_hub_admin() to authenticated;

-- 2. Turn on row level security for every table and remove all old (open) rules
do $$
declare t record; p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.tablename loop
      execute format('drop policy %I on public.%I', p.policyname, t.tablename);
    end loop;
  end loop;
end $$;

-- 3. Signed-in staff can use the tables the app reads from the browser
do $$
declare t text;
begin
  foreach t in array array['waitlist_entries', 'activity_log', 'parking_waitlist', 'available_units'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    end if;
  end loop;
end $$;

-- Staff can see the staff list; only Admins can change roles or remove people
create policy staff_read   on public.user_profiles for select to authenticated using (public.is_staff());
create policy admin_update on public.user_profiles for update to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());
create policy admin_delete on public.user_profiles for delete to authenticated using (public.is_hub_admin());

-- Only Admins manage invites
create policy admin_all on public.user_invites for all to authenticated using (public.is_hub_admin()) with check (public.is_hub_admin());

-- Every other table (parking changes, reservations, snapshots, verifications, report history,
-- match history) now has no browser access at all; only the site's server can use it.

-- 4. Check: every row below should show rls_enabled = true
select tablename, rowsecurity as rls_enabled from pg_tables where schemaname = 'public' order by tablename;
