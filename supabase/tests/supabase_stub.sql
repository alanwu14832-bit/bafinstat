-- A minimal stand-in for what Supabase provides before schema.sql runs (for the permission tests in a plain Postgres):
-- the auth schema with users, auth.uid() / auth.jwt() read from the request settings PostgREST sets, and the roles.
create schema if not exists extensions;
create schema if not exists auth;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
grant usage on schema public, auth, extensions to anon, authenticated;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, is_anonymous boolean not null default false, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(auth.jwt() ->> 'role', 'anon') $$;
grant execute on all functions in schema auth to anon, authenticated;
-- like Supabase: new tables and functions in public are granted to the API roles (row level security does the rest)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
