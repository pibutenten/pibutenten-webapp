-- 회원 프로필 사진 업로드용 'avatars' 스토리지 버킷.
-- 온보딩(/onboarding)·페르소나(/me/profile/persona) 화면에서 사용.
--
-- 경로 패턴: {user_id}/{filename}.jpg  (auth.uid()와 첫 폴더 일치 검증)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB (실제 업로드는 256x256 jpeg ≈ 30KB. 여유 마진)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS 정책 — articles 버킷과 동일 패턴
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_auth_update_own" on storage.objects;
create policy "avatars_auth_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_auth_delete_own" on storage.objects;
create policy "avatars_auth_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
