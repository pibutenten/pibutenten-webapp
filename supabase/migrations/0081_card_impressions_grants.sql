-- 0081: card_impressions table-level GRANT 추가
--
-- 외부 점검 보고서(2026-05-14)에서 발견: 비로그인 사용자에서 401 다발.
-- 분석 결과 — RLS 정책(`qa_impressions_insert_all`)은 이미 anon+authenticated INSERT 허용 상태이나,
-- table-level INSERT/SELECT GRANT가 anon/authenticated에 부여되어 있지 않아 PostgREST가 401 반환.
--
-- card_views와 일관성 맞춤 (card_views는 이미 anon INSERT, authenticated INSERT/SELECT 보유).

GRANT INSERT ON public.card_impressions TO anon;
GRANT INSERT, SELECT ON public.card_impressions TO authenticated;

-- sequence(bigserial id)에도 USAGE 권한 — INSERT 시 nextval() 호출됨
DO $$
DECLARE
  v_seq_name text;
BEGIN
  SELECT pg_get_serial_sequence('public.card_impressions', 'id') INTO v_seq_name;
  IF v_seq_name IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SEQUENCE %s TO anon, authenticated', v_seq_name);
  END IF;
END$$;

SELECT 'OK 0081' AS status;
