-- SERVEXA: Workspace Avatar
--
-- 1. Adds avatar_url column to user_profiles so the app can store a
--    Supabase Storage URL alongside the existing profile data.
--
-- 2. Creates a private "avatars" storage bucket.
--    Files are stored at the path:  {uid}/avatar
--    Storage RLS policies ensure each user can only read/write their own file.
--
-- Nothing here modifies existing data, RLS on user_profiles, or any other
-- table — this is a purely additive migration.

-- ──────────────────────────────────────────────────────────────
-- 1. Column on user_profiles
-- ──────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists avatar_url text;

-- ──────────────────────────────────────────────────────────────
-- 2. Storage bucket
--    "public = false" → files are not publicly accessible by URL;
--    the app uses supabase.storage.from('avatars').createSignedUrl()
--    or .download() to serve them with a short-lived signed URL,
--    keeping avatars private to each workspace.
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,   -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- ──────────────────────────────────────────────────────────────
-- 3. Storage RLS policies
--    Path convention: {auth.uid()}/avatar  (no extension stored in path;
--    the client upserts the same path each time so there is never more
--    than one avatar object per user).
-- ──────────────────────────────────────────────────────────────

-- Users can upload / replace their own avatar
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update (replace) their own avatar
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read (download / sign) their own avatar
create policy "Users can read their own avatar"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatar
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
