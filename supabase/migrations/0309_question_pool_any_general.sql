-- 0309_question_pool_any_general.sql
-- 단독(standalone) 시술후기 폼의 단답 "일반 질문 풀"(timepoint='any') 보강.
--
-- 배경:
--   0307 이 질문 풀을 시기별(day0/week1/month1/month4) 28개로 전면 교체하면서,
--   timepoint='any' 활성 질문은 대표 질문 "생생한 후기를 남겨주세요"(id=23, 660개 이관답 연결) 1개만 남았다.
--   단독 시술후기 폼(/review/new · /write?tab=review)의 단답은 'any' 풀을 쓰므로, 활성 1개로는
--   ShortAnswerFields 가 1칸만 노출하고 "2칸 + 다시 고르기"(원장/사용자 지시)가 불가능했다.
--
-- 변경:
--   timepoint='any' · is_active=true 일반 질문 6개를 멱등 INSERT(weight=1, category='').
--   시기 무관·따뜻한 회고 톤(0307 28개와 동일 voice). 가격/병원/의료광고 표현 없음.
--   결과: 'any' 활성 = 대표 1 + 6 = 7개 → 첫 칸=대표("생생한 후기"), 둘째 칸=랜덤 + 다시 고르기 정상.
--
-- 멱등: (timepoint, question_text) NOT EXISTS 가드 — 0304/0306/0307 시드 패턴과 동일. 재실행 무중복.
-- 적용: 한국어 포함 → node fetch UTF-8 POST 경로로만 적용(콘솔 CP949 직접 투입 금지, CLAUDE.md §8).
--   적용 후 chr(65533) 재스캔 0 확인.

BEGIN;

INSERT INTO public.question_pool (timepoint, category, question_text, is_active, weight)
SELECT 'any', '', v.question_text, true, 1
FROM (VALUES
  ('받기 전과 비교해 가장 크게 달라진 점은 무엇인가요?'),
  ('받길 잘했다고 느낀 순간이 있었나요?'),
  ('같은 고민을 하는 분께 솔직하게 한마디 한다면요?'),
  ('시술 전 가장 망설였던 점이, 막상 받아보니 어떻게 느껴졌나요?'),
  ('처음 기대했던 모습과 비교하면 지금은 어떤가요?'),
  ('다시 그때로 돌아가도 같은 선택을 하실 것 같나요?')
) AS v(question_text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.question_pool q
   WHERE q.timepoint = 'any'
     AND q.question_text = v.question_text
);

-- 동일 텍스트가 비활성으로 이미 존재하면(예: 0307 이 비활성화한 id=22 "받길 잘했다고 느낀 순간…")
--   재활성화 — INSERT 가드가 건너뛴 행도 활성으로 보장(멱등). 결과: 'any' 활성 = 대표 1 + 6 = 7개.
UPDATE public.question_pool
   SET is_active = true
 WHERE timepoint = 'any'
   AND is_active = false
   AND question_text IN (
     '받기 전과 비교해 가장 크게 달라진 점은 무엇인가요?',
     '받길 잘했다고 느낀 순간이 있었나요?',
     '같은 고민을 하는 분께 솔직하게 한마디 한다면요?',
     '시술 전 가장 망설였던 점이, 막상 받아보니 어떻게 느껴졌나요?',
     '처음 기대했던 모습과 비교하면 지금은 어떤가요?',
     '다시 그때로 돌아가도 같은 선택을 하실 것 같나요?'
   );

COMMIT;
