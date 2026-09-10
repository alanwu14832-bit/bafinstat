-- Team photo albums: photographers (and editors) upload web-sized JPEGs to the public `photos` bucket,
-- everyone can browse and download. Run once in the SQL Editor (safe to re-run).

-- 1) who may upload besides editors
create table if not exists photographers (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table photographers enable row level security;
drop policy if exists "self read" on photographers;
create policy "self read" on photographers for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

create or replace function is_photographer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photographers where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

-- 2) one row per photo (the file itself lives in Storage)
create table if not exists photos (
  id          uuid primary key default gen_random_uuid(),
  album       text not null,                                  -- display name, e.g. "2026-03-01 vs 群風"
  album_key   text not null,                                  -- folder in the bucket (game id or slug)
  game_id     text references games(id) on delete set null,
  path        text not null,                                  -- storage path of the 2048px JPEG
  thumb_path  text not null,                                  -- storage path of the 480px JPEG
  width       int,
  height      int,
  size_bytes  int,
  caption     text,
  uploaded_by text,
  created_at  timestamptz not null default now()
);
create index if not exists photos_album_idx on photos (album_key, created_at desc);
alter table photos enable row level security;
drop policy if exists "public read" on photos;
create policy "public read" on photos for select using (true);
drop policy if exists "uploaders write" on photos;
create policy "uploaders write" on photos for all to authenticated using (is_editor() or is_photographer()) with check (is_editor() or is_photographer());

-- 3) the bucket: public read, uploaders write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "photos uploaders insert" on storage.objects;
create policy "photos uploaders insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (is_editor() or is_photographer()));
drop policy if exists "photos uploaders update" on storage.objects;
create policy "photos uploaders update" on storage.objects for update to authenticated using (bucket_id = 'photos' and (is_editor() or is_photographer()));
drop policy if exists "photos uploaders delete" on storage.objects;
create policy "photos uploaders delete" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (is_editor() or is_photographer()));
