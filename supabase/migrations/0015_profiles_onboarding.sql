-- =============================================================
-- 0015. profiles 온보딩 컬럼 추가
--
-- 소셜 로그인(OAuth) 신규 가입자가 /signup 에서 약관 동의·닉네임 확인을
-- 마쳤는지 판별하기 위해 timestamp 컬럼을 추가한다.
--
-- - terms_agreed_at  : 이용약관·개인정보 처리방침 동의 시각
-- - age_confirmed_at : 만 14세 이상 확인 시각
-- 둘 다 not null 인 경우 "온보딩 완료"로 간주.
--
-- marketing_email_consent 는 0010 에서 이미 존재.
-- =============================================================

alter table public.profiles
  add column if not exists terms_agreed_at  timestamptz,
  add column if not exists age_confirmed_at timestamptz;

-- 인덱스 (관리자 통계용 — 선택)
create index if not exists profiles_terms_agreed_at_idx
  on public.profiles(terms_agreed_at);
