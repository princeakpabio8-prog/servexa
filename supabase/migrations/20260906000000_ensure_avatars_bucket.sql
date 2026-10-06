-- SERVEXA: Ensure avatars storage bucket exists (idempotent re-run)
--
-- This migration is a safety net that runs after the initial avatar migration.
-- It is safe to run even if the bucket and policies already exist.
-- Intended to fix production environments where 20260905000000 was not applied.

-- ── 1. Column (idempotent) ────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists avatar_url text;

-- ── 2. Bucket (idempotent) ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,   -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- ── 3. RLS policies (drop-and-recreate so they are always in the right state) ──
-- Drop first to avoid "already exists" errors on re-run
drop policy if exists "Users can upload their own avatar"  on storage.objects;
drop policy if exists "Users can update their own avatar"  on storage.objects;
drop policy if exists "Users can read their own avatar"    on storage.objects;
drop policy if exists "Users can delete their own avatar"  on storage.objects;

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read their own avatar"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
