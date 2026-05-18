-- 0136: articles 버킷 IaC 명문화 (PR-B E7, 2026-05-19)
--
-- 배경:
--   articles 버킷은 Supabase 대시보드에서 수동 생성됨 (2026-05-05).
--   RLS 정책 4개도 대시보드에서 수동 정의 → git 에 없음.
--   재해복구 / staging 환경에서 같은 설정을 재현 불가.
--
-- 이 마이그레이션은 **현재 운영 정책을 그대로 코드화** — 운영 영향 0.
-- 정책 정의는 `DROP POLICY IF EXISTS` + `CREATE POLICY` 패턴으로 idempotent.
--
-- ⚠ 운영 적용 주의사항:
--   storage.objects 의 정책 CREATE/DROP 은 `supabase_storage_admin` 권한 필요.
--   Management API (POST /v1/projects/{ref}/database/query) 로는 postgres role 에서
--   실행돼서 "must be owner of relation objects" 권한 에러 발생.
--
--   현재 운영 DB 에는 이미 동일 정책이 dashboard 로 적용되어 있어 **이 마이그레이션을
--   production 에 다시 적용할 필요 없음**.
--
--   새 환경(staging / 재해복구) 에서 셋업 시:
--     1) Supabase Dashboard > Storage > articles 버킷에서 동일 정책 4개 수동 생성, **또는**
--     2) Dashboard > SQL Editor 에서 본 파일 내용 통째로 실행 (superuser 권한).
--
-- 현재 상태 (2026-05-19 dump):
--   - bucket: public=true, file_size_limit=10MB, mime: image/{jpeg,png,webp,gif}
--   - policy articles_public_read: SELECT TO public, bucket='articles'
--   - policy articles_auth_insert: INSERT TO public,
--       WITH CHECK (bucket='articles' AND auth.uid() IS NOT NULL)
--   - policy articles_auth_update_own: UPDATE TO public,
--       USING (bucket='articles' AND auth.uid() IS NOT NULL
--              AND auth.uid()::text = (storage.foldername(name))[1])
--   - policy articles_auth_delete_own: DELETE TO public, 같은 조건
--
-- 현재 상태 (2026-05-19 dump):
--   - bucket: public=true, file_size_limit=10MB, mime: image/{jpeg,png,webp,gif}
--   - policy articles_public_read: SELECT TO public, bucket='articles'
--   - policy articles_auth_insert: INSERT TO public,
--       WITH CHECK (bucket='articles' AND auth.uid() IS NOT NULL)
--   - policy articles_auth_update_own: UPDATE TO public,
--       USING (bucket='articles' AND auth.uid() IS NOT NULL
--              AND auth.uid()::text = (storage.foldername(name))[1])
--   - policy articles_auth_delete_own: DELETE TO public, 같은 조건

-- ── 1. 버킷 자체 ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'articles',
  'articles',
  true,
  10485760,  -- 10MB (upload route MAX_SIZE 8MB 보다 여유)
  ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. RLS 정책 ────────────────────────────────────────
-- 기존 정책 명이 동일하면 그대로 두고, 누락된 게 있으면 채움.
-- (운영 DB 에는 이미 존재 — DROP IF EXISTS + CREATE 로 idempotent)

DROP POLICY IF EXISTS articles_public_read ON storage.objects;
CREATE POLICY articles_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'articles');

DROP POLICY IF EXISTS articles_auth_insert ON storage.objects;
CREATE POLICY articles_auth_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'articles' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS articles_auth_update_own ON storage.objects;
CREATE POLICY articles_auth_update_own ON storage.objects
  FOR UPDATE TO public
  USING (
    bucket_id = 'articles'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS articles_auth_delete_own ON storage.objects;
CREATE POLICY articles_auth_delete_own ON storage.objects
  FOR DELETE TO public
  USING (
    bucket_id = 'articles'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

COMMENT ON POLICY articles_public_read ON storage.objects IS
  '[0136] articles 버킷 public read — 게시물 첨부 이미지 누구나 GET.';
COMMENT ON POLICY articles_auth_insert ON storage.objects IS
  '[0136] articles INSERT — 로그인 사용자만. 폴더 검증은 코드(`/api/upload`) 측에서 강제.';
COMMENT ON POLICY articles_auth_update_own ON storage.objects IS
  '[0136] articles UPDATE — 본인 폴더(`{uid}/*`)만.';
COMMENT ON POLICY articles_auth_delete_own ON storage.objects IS
  '[0136] articles DELETE — 본인 폴더(`{uid}/*`)만.';
