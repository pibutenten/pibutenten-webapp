-- 0245_keyword_digest_producer.sql
-- 2026-06-06 — 관심(Q&A) 알림 생산자: 일일 digest 함수 + 커서 (4-2 / 3b-2).
--
-- 배경:
--   3b-1(0244)로 토대(GIN·pref 3토글·'keyword' kind) 완료. 본 단계는 실제 생산자.
--   매일 1회 cron 이 run_keyword_digest() 호출 → 직전 실행 이후 새로 발행된 qa 카드를
--   회원의 관심사/피부고민/피부타입 태그와 매칭 → (회원, 태그)별 새 글 수 N 집계 →
--   notifications(kind='keyword') 1건씩 INSERT. 기존 notifications→webhook→push 경로를
--   그대로 타므로 푸시는 자동(추가 배선 없음).
--
-- ⚠ 최우선 안전장치 — 커서 초기값 = now():
--   keyword_digest_state.last_run_at DEFAULT now(). 과거 epoch 로 두면 첫 실행이
--   과거 qa 999개를 전부 '새 글'로 처리해 알림 폭탄. now() 초기화로 첫 실행 = 0건.
--
-- 게이팅:
--   pref 토글은 notification_preferences 에 있음(3b-1). is_notification_enabled 는
--   단일 bool 게이트라 keyword 에 부적합(미수정·ELSE true). 대신 본 digest 가
--   notification_preferences 를 LEFT JOIN + COALESCE(...,true) 로 dimension(관심사/
--   피부고민/피부타입)별 직접 판독.
--
-- 정확히 1회:
--   함수는 단일 트랜잭션. 커서 행 FOR UPDATE 잠금 → 매칭 INSERT → 커서 갱신.
--   실패 시 호출 트랜잭션 롤백 = 커서 불변 = 다음 cron 이 같은 윈도우 재시도.

BEGIN;

-- 1) 커서 state — 단일행. last_run_at 초기값 now() (폭탄 방지 핵심).
CREATE TABLE IF NOT EXISTS public.keyword_digest_state (
  id boolean PRIMARY KEY DEFAULT true,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT keyword_digest_state_singleton CHECK (id = true)
);
INSERT INTO public.keyword_digest_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- RLS/GRANT: service_role 만(=RLS 우회). anon/authenticated 전면 차단(정책 0개 + REVOKE).
ALTER TABLE public.keyword_digest_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.keyword_digest_state FROM anon, authenticated;

-- 2) URL 인코딩 헬퍼 — 한글 태그를 /search?q= 에 안전히 percent-encode.
--    각 문자를 UTF8 바이트로 분해, RFC 3986 unreserved 외 모든 바이트를 %XX 로.
CREATE OR REPLACE FUNCTION public.url_encode_component(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(string_agg(
    CASE
      WHEN ch ~ '^[A-Za-z0-9_.~-]$' THEN ch
      ELSE (
        SELECT string_agg('%' || lpad(upper(to_hex(get_byte(b, i))), 2, '0'), '')
        FROM generate_series(0, octet_length(b) - 1) AS i
      )
    END, '' ORDER BY ord), '')
  FROM (
    SELECT ord, ch, convert_to(ch, 'UTF8') AS b
    FROM regexp_split_to_table(COALESCE(input, ''), '') WITH ORDINALITY AS x(ch, ord)
  ) s;
$function$;

-- 3) digest 함수 — service_role/postgres 만 EXECUTE.
DROP FUNCTION IF EXISTS public.run_keyword_digest();

CREATE FUNCTION public.run_keyword_digest()
 RETURNS TABLE(processed integer, notifications_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_start timestamptz := now();
  v_cursor    timestamptz;
  v_processed integer := 0;
  v_created   integer := 0;
BEGIN
  -- 커서 잠금(동시 실행 직렬화).
  SELECT last_run_at INTO v_cursor
    FROM public.keyword_digest_state
   WHERE id = true
   FOR UPDATE;

  -- 윈도우 내 새 qa 카드 수 (processed).
  SELECT count(*) INTO v_processed
    FROM public.cards c
   WHERE c.category = 'qa'
     AND c.status = 'published'
     AND c.deleted_at IS NULL
     AND c.reviewed_at > v_cursor
     AND c.reviewed_at <= v_run_start;

  -- (회원, 태그)별 새 글 수 집계 → 알림 INSERT (set-based, 루프 없음).
  WITH new_qa AS (
    SELECT c.id, c.author_id, c.keywords
      FROM public.cards c
     WHERE c.category = 'qa'
       AND c.status = 'published'
       AND c.deleted_at IS NULL
       AND c.reviewed_at > v_cursor
       AND c.reviewed_at <= v_run_start
  ),
  tags AS (
    SELECT nq.id AS card_id, nq.author_id, btrim(t.tag) AS tag
      FROM new_qa nq, LATERAL unnest(nq.keywords) AS t(tag)
     WHERE t.tag IS NOT NULL AND btrim(t.tag) <> ''
  ),
  matches AS (
    SELECT m.id AS recipient_id, tg.tag, count(DISTINCT tg.card_id) AS n
      FROM tags tg
      JOIN public.profiles m
        ON m.deleted_at IS NULL
       AND m.id <> tg.author_id
      LEFT JOIN public.notification_preferences np
        ON np.profile_id = m.id
     WHERE (
            (tg.tag = ANY(m.interested_procedures) AND COALESCE(np.pref_keyword_interest, true))
         OR (tg.tag = ANY(m.skin_concerns)         AND COALESCE(np.pref_keyword_concern, true))
         OR (m.skin_type = tg.tag                  AND COALESCE(np.pref_keyword_skin_type, true))
           )
     GROUP BY m.id, tg.tag
  )
  INSERT INTO public.notifications (kind, recipient_id, actor_id, card_id, message, url, created_at)
  SELECT 'keyword',
         mt.recipient_id,
         NULL,
         NULL,
         '''' || mt.tag || '''에 새 Q&A ' || mt.n || '건',
         '/search?q=' || public.url_encode_component(mt.tag),
         v_run_start
    FROM matches mt
   WHERE mt.n > 0;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- 커서 전진(다음 실행 윈도우 = 이번 run_start 이후).
  UPDATE public.keyword_digest_state SET last_run_at = v_run_start WHERE id = true;

  RETURN QUERY SELECT v_processed, v_created;
END;
$function$;

-- 권한: anon/authenticated/PUBLIC EXECUTE 차단, service_role 만 허용.
REVOKE ALL ON FUNCTION public.run_keyword_digest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_keyword_digest() TO service_role;

COMMIT;

SELECT 'OK 0245' AS status;
