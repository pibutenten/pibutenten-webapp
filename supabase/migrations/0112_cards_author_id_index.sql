-- 0112_cards_author_id_index.sql
--
-- cards.author_id 인덱스 추가.
--
-- 배경:
--   RLS 정책 `cards_public_read` (0099) 가 USING 절에서
--   `author_id IN (same_group_profile_ids(auth.uid()))` 패턴을 빈번하게 사용.
--   author_id 단독 인덱스가 없어 row 수 증가 시 seq scan 비용 누적.
--
-- 안전성:
--   - CONCURRENTLY 로 lock 최소화 (production 운영 중에도 안전)
--   - IF NOT EXISTS — 재실행 시 noop
--
-- 적용:
--   psql 등에서 단일 statement 로 실행. transaction 안에 묶지 말 것
--   (CREATE INDEX CONCURRENTLY 는 자체 transaction 필요).

CREATE INDEX CONCURRENTLY IF NOT EXISTS cards_author_id_idx
  ON public.cards (author_id);
