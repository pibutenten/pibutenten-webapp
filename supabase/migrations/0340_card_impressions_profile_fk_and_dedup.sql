-- 0340: card_impressions FK 정합화 (profile 단위 집계)
--
-- 문제: card_impressions.profile_id 의 FK (card_impressions_user_id_fkey) 가
--       auth.users(id) 를 참조 — 옛 user_id 시절 잔재(마이그 0048 qa_impressions 원형).
--       클라이언트는 활성 명함 profiles.id 를 넣으므로,
--       비-base 명함(profiles.id != auth_user_id) 은 23503 FK 위반으로 INSERT 실패.
--
-- 수정: site_visits 와 동일한 구조로 맞춤
--   (1) 잘못된 FK(auth.users 참조) 제거
--   (2) profiles(id) 참조 FK 재지정 (ON DELETE SET NULL — 탈퇴 시 profile_id 익명화)
--   (3) 세션 유니크 제거 — 명함 단위 dedup 은 클라이언트 impKey 가 담당 (site_visits 철학)
--
-- 사전조건 검증 결과 (2026-07-05):
--   non-null profile_id 8299 건 전부 profiles.id 에 존재 — orphan 0건.
--   BEGIN...ROLLBACK 검증 통과 (에러 없음).
--   비-base 명함 INSERT 시뮬레이션 성공 (HTTP 201).

-- 1) 잘못된 FK 제거 (profile_id -> auth.users, 옛 user_id 잔재)
ALTER TABLE public.card_impressions DROP CONSTRAINT IF EXISTS card_impressions_user_id_fkey;

-- 2) site_visits 와 동일하게 profiles(id) 참조로 재지정
ALTER TABLE public.card_impressions
  ADD CONSTRAINT card_impressions_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3) 세션 유니크 제거 → 명함 단위 dedup 은 클라이언트(impKey)가 담당(site_visits 철학)
ALTER TABLE public.card_impressions DROP CONSTRAINT IF EXISTS card_impressions_card_id_session_id_key;

SELECT '0340 OK' AS status;
