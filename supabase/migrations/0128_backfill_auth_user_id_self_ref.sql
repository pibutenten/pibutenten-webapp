-- 0128: profiles.auth_user_id self-ref 백필 재실행 (2026-05-18)
--
-- 배경:
--   0044 가 한 번 `auth_user_id = id` 백필했으나 이후 signup flow 가 새 profile
--   row 에 auth_user_id 를 NULL 로 둔 채 insert 하면서 회귀 누적. 현재 8개 row
--   (5개 단독 신규 + 3개 어제 0127 묶은 primary) 가 NULL 상태.
--
-- 두 패턴(NULL · self-ref) 모두 bundleProfileFilter (id.eq.X OR auth_user_id.eq.X)
-- 가 OR 로 다뤄 기능상 동일하지만, DB 일관성·관리 화면 디버깅 편의 위해 self-ref 로
-- 통일.
--
-- 안전:
--   - 조건 1: auth_user_id IS NULL (이미 채워진 sub 는 건드리지 않음)
--   - 조건 2: id 가 auth.users 에 존재 (FK 제약 통과 보장; orphan profile 은 제외)

BEGIN;

WITH targets AS (
  SELECT p.id
  FROM public.profiles p
  WHERE p.auth_user_id IS NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
)
UPDATE public.profiles AS p
SET auth_user_id = p.id
FROM targets t
WHERE p.id = t.id;

-- 검증 — orphan 만 NULL 로 남았는지 확인. 결과 > 0 이면 후속 정리 필요(공개 fallback).
SELECT
  count(*) FILTER (WHERE p.auth_user_id IS NULL) AS still_null,
  count(*) FILTER (WHERE p.auth_user_id = p.id) AS self_ref,
  count(*) FILTER (WHERE p.auth_user_id IS NOT NULL AND p.auth_user_id <> p.id) AS sub_link
FROM public.profiles p;

COMMIT;
