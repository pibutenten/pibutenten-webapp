-- 0306_oneliner_to_question.sql
-- 단독 후기폼(/review/new) 단답 일원화 — "생생한 후기" 단일 textarea 를 질문 풀 기반 단답 2칸으로 통합.
--
-- 배경:
--   기존 단독 후기폼은 "생생한 후기를 남겨주세요" 라는 고정 라벨 textarea(cards.body 저장) 1개와,
--   별도로 0304 가 추가한 단답 2칸(short_answer_response 저장)을 동시에 노출하던 구조였다.
--   이제 둘을 하나로 합쳐 "질문 라벨 + 다시 고르기 + textarea(n/400)" 2칸으로 일원화한다.
--   "생생한 후기를 남겨주세요" 도 다른 질문들과 같은 풀(question_pool, timepoint='any')의 한 항목이
--   되어 라벨이 풀에서 바뀔 수 있고, 2칸 중 한 칸에 배정될 수 있어야 한다.
--
-- 변경:
--   (a) question_pool 에 ('any','생생한 후기를 남겨주세요', is_active=true, weight=1) 멱등 INSERT.
--       (timepoint, question_text) NOT EXISTS 가드 — 0304 의 시드 패턴과 동일.
--   (b) 기존 후기의 cards.body(= 옛 "생생한 후기" 답) 를 short_answer_response 로 무손실·멱등 이관.
--       review_id ↔ "생생한 후기" question_id 로 연결(checkin_id=NULL — 단독 후기 단답은 checkin 무관).
--       cards.body 는 그대로 둔다(삭제·NULL 화 없음 — 카드 본문/검색·기존 화면 무회귀).
--
-- 비고:
--   - create_procedure_review 는 이미 p_body·p_short_answers 인자를 모두 가짐(0303/0304) → RPC 변경 없음.
--   - 한국어 포함 → node fetch UTF-8 POST 경로로만 적용(콘솔 CP949 직접 투입 금지, CLAUDE.md §8).
--   - 멱등: 재실행해도 질문 중복 INSERT 없음, 이관 답도 (review_id, question_id, checkin_id IS NULL)
--     중복이면 건너뜀.

BEGIN;

-- ============================================================
-- (a) "생생한 후기를 남겨주세요" 질문 멱등 INSERT (timepoint='any').
-- ============================================================
INSERT INTO public.question_pool (timepoint, category, question_text, is_active, weight)
SELECT 'any', '', '생생한 후기를 남겨주세요', true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.question_pool q
   WHERE q.timepoint = 'any'
     AND q.question_text = '생생한 후기를 남겨주세요'
);

-- ============================================================
-- (b) 기존 후기 본문(cards.body) → short_answer_response 무손실·멱등 이관.
--     "생생한 후기를 남겨주세요" question_id 로 연결, checkin_id=NULL.
--     이미 같은 (review_id, question_id, checkin_id IS NULL) 이 있으면 건너뜀(멱등).
-- ============================================================
WITH q AS (
  SELECT id AS qid
  FROM public.question_pool
  WHERE timepoint = 'any'
    AND question_text = '생생한 후기를 남겨주세요'
  ORDER BY id
  LIMIT 1
)
INSERT INTO public.short_answer_response (review_id, question_id, answer_text, checkin_id)
SELECT pr.id, q.qid, c.body, NULL
FROM public.procedure_reviews pr
JOIN public.cards c ON c.id = pr.card_id
CROSS JOIN q
WHERE coalesce(c.body, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.short_answer_response s
     WHERE s.review_id = pr.id
       AND s.question_id = q.qid
       AND s.checkin_id IS NULL
  );

COMMIT;
