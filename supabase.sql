-- MAUN — شغّله في Supabase: SQL Editor (يستبدل السكربت القديم ذي السياسة العامة)
-- كل مستخدم يرى ويعدّل ملفاته فقط (RLS)، والصور في مخزن خاص داخل مجلد باسم معرفه.

create table if not exists public.cars (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 40),
  make text, model text, color text, image_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.cars enable row level security;
drop policy if exists cars_own on public.cars;
create policy cars_own on public.cars for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  user_id uuid default auth.uid(),
  car_id uuid, t timestamptz, kind text, label text,
  dev real, off real, params jsonb, paths text[]
);
alter table public.events add column if not exists user_id uuid default auth.uid();
alter table public.events add column if not exists car_id uuid;
alter table public.events enable row level security;
drop policy if exists "anon insert events" on public.events;
drop policy if exists events_own on public.events;
create policy events_own on public.events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('cars','cars',false), ('snapshots','snapshots',false)
  on conflict (id) do update set public = false;
drop policy if exists "anon upload snapshots" on storage.objects;
drop policy if exists maun_own_files on storage.objects;
create policy maun_own_files on storage.objects for all to authenticated
  using (bucket_id in ('cars','snapshots') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('cars','snapshots') and (storage.foldername(name))[1] = auth.uid()::text);
