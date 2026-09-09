-- Run once on an existing project (SQL Editor) to enable cross-device continuation of live scoring.
create table if not exists record_drafts (
  game_id    text primary key,
  state      jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table record_drafts enable row level security;
drop policy if exists "editors only" on record_drafts;
drop policy if exists "public read" on record_drafts;
create policy "public read" on record_drafts for select using (true);
drop policy if exists "authenticated write" on record_drafts;
create policy "authenticated write" on record_drafts for all to authenticated using (true) with check (true);
