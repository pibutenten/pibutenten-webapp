-- 0129: handle_new_user 트리거에 auth_user_id 세팅 추가 (2026-05-18)
--
-- 배경:
--   `handle_new_user` 트리거는 0010 도입 → 0025 (email 기반 handle) 마지막 갱신.
--   0044 가 `profiles.auth_user_id` 컬럼 추가 + 기존 row 일괄 backfill 했으나
--   트리거 본문은 함께 갱신 X. 결과적으로 0044 이후 신규 signup 은 항상
--   auth_user_id NULL 로 insert → 0128 에서 다시 backfill 해야 했음.
--
-- fix:
--   handle_new_user 가 profile insert 시 auth_user_id = new.id (self-ref) 도 동봉.
--   bundleProfileFilter (id.eq.X OR auth_user_id.eq.X) 의 두 패턴 중 일관성
--   유지를 위해 self-ref 패턴으로 통일 (0128 backfill 과 동일 정책).

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, auth_user_id, handle)
  VALUES (new.id, new.id, public._suggest_handle(new.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 트리거 자체는 0010 에서 정의된 그대로 (after insert on auth.users) — 재정의 불필요.

SELECT 'OK' AS status;

COMMIT;
