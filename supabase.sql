-- شغّله في Supabase: SQL Editor
create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  device text, t timestamptz, kind text, label text,
  dev real, off real, params jsonb, paths text[]
);
alter table public.events enable row level security;
create policy "anon insert events" on public.events for insert to anon with check (true);

insert into storage.buckets (id, name, public) values ('snapshots','snapshots', false) on conflict do nothing;
create policy "anon upload snapshots" on storage.objects for insert to anon with check (bucket_id = 'snapshots');
-- ملاحظة: هذا يسمح لأي حامل للمفتاح بالإضافة فقط (لا قراءة). للإنتاج استخدم تسجيل دخول.
