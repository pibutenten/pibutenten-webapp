-- 0193_cards_post_slug_unique.sql
-- slug 사고 재발 방지 — 동시 저장 충돌 최후 방어선 (2026-05-30).
--
-- 배경:
--   의사 글 URL = /doctors/{doctor_slug}/{post_year}/{post_slug}.
--   기존엔 (doctor_id, post_year, post_slug) 에 일반 인덱스(idx_qas_doctor_year_slug)만 있어,
--   UI/서버 중복검사를 통과한 두 저장이 거의 동시에 들어오면 같은 slug 가 중복 생성될 수 있었다.
--   (unique 제약은 폐기 컬럼 article_slug 에만 걸려 있었음 — 0행).
--
-- 조치:
--   (doctor_id, post_year, post_slug) 부분 UNIQUE 인덱스. 의사 글(doctor_id NOT NULL)이고
--   slug 가 있는 행만 대상 — 회원 글(/{handle}/{shortcode})과 빈 slug 는 제외해 영향 없음.
--   현재 중복 0건 확인 후 생성 (information_schema 직접 조회).
--
-- 효과:
--   UI(즉시 형식) → blur(중복질의) → 서버 재검증 → 검수발송 잠금 을 모두 뚫어도,
--   이 인덱스가 23505(unique_violation) 로 최종 거부한다. 서버가 "이미 사용 중" 메시지로 변환.

CREATE UNIQUE INDEX IF NOT EXISTS cards_doctor_year_slug_uidx
  ON public.cards (doctor_id, post_year, post_slug)
  WHERE doctor_id IS NOT NULL AND post_slug IS NOT NULL;
