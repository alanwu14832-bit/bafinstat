-- Editors allowlist: only emails in this table may write. Run once in the SQL Editor.
-- 1) put the recorders' emails here (lower-case). Add / remove rows as people join or graduate.
create table if not exists editors (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
insert into editors (email, note) values ('baseball.ntuba@gmail.com', '管理員') on conflict (email) do nothing;

alter table editors enable row level security;
drop policy if exists "self read" on editors;
create policy "self read" on editors for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));
-- nobody writes editors through the API; manage it from the Supabase dashboard

-- 2) helper used by every write policy
create or replace function is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

-- 3) replace "any signed-in user may write" with "editors may write"
do $$
declare t text;
begin
  foreach t in array array['players','games','batting_pa','pitching_pa','fielding_lines','record_drafts'] loop
    execute format('drop policy if exists "authenticated write" on %I', t);
    execute format('drop policy if exists "editors write" on %I', t);
    execute format('create policy "editors write" on %I for all to authenticated using (is_editor()) with check (is_editor())', t);
  end loop;
end $$;

-- 4) who changed a game last (shown nowhere yet, kept for audit)
alter table games add column if not exists updated_by text;
