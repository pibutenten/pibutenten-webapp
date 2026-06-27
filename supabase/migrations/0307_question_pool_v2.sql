-- 0307_question_pool_v2.sql
-- 질문 풀 교체 — 원장 확정 28개(시점별 7개)로 전면 교체.
--
-- 배경:
--   0304/0306 에서 시드한 구 질문 풀(day0/week1/month1/month4 + any "생생한 후기")은
--   임시 문구였다. 원장 확정 문구 28개(day0/week1/month1/month4 각 7개)로 교체한다.
--   기존 답(short_answer_response)은 question_id FK 로 구 question_pool row 를 참조하므로
--   행을 DELETE 하면 안 된다 → 구 질문은 행을 보존한 채 is_active=false 로 비활성화한다.
--   "생생한 후기를 남겨주세요"(timepoint='any', id=23)는 660개 이관답의 연결 질문이므로
--   비활성 대상에서 제외하고 다시 활성으로 유지한다(단독 후기폼 대표 질문).
--
-- 변경:
--   (1) 기존 question_pool 전부 is_active=false (행 보존 — FK 안전).
--   (2) 원장 확정 28개를 timepoint 태깅해 멱등 INSERT(is_active=true, weight=1, category='').
--       (timepoint, question_text) NOT EXISTS 가드 — 0304/0306 시드 패턴과 동일.
--       ※ category 는 NOT NULL 이라 '' 로 저장(의미: 미분류).
--   (3) "생생한 후기를 남겨주세요"(timepoint='any')를 다시 is_active=true 로 재활성.
--
-- 결과(예상):
--   활성 질문 = 28(시점별 7) + "생생한 후기"(any) = 29.
--   구 질문(28개 외 + any "생생한 후기" 외)은 is_active=false 로 비활성 보존.
--
-- 비고:
--   - 한국어 포함 → node fetch UTF-8 POST 경로로만 적용(콘솔 CP949 직접 투입 금지, CLAUDE.md §8).
--   - 멱등: 재실행해도 28개 중복 INSERT 없음. (1)/(3) 은 idempotent UPDATE.
--   - timepoint CHECK 는 0304 에서 이미 ('day0','week1','month1','month4','any') 허용.

BEGIN;

-- ============================================================
-- (1) 기존 질문 풀 전부 비활성 — 행 보존(short_answer_response FK 안전).
-- ============================================================
UPDATE public.question_pool SET is_active = false WHERE is_active = true;

-- ============================================================
-- (2) 원장 확정 28개 멱등 INSERT — timepoint 태깅(is_active=true, weight=1, category='').
-- ============================================================
INSERT INTO public.question_pool (timepoint, category, question_text, is_active, weight)
SELECT v.timepoint, '', v.question_text, true, 1
FROM (VALUES
  -- day0 (시술 당일)
  ('day0',  '시술받는 동안 느낌은 예상과 비교해 어땠나요? (생각보다 견딜 만했는지)'),
  ('day0',  '시술 시간은 얼마나 걸렸고, 체감상 길게 느껴졌나요?'),
  ('day0',  '시술이 끝나고 거울을 봤을 때 바로 느껴진 변화가 있었나요?'),
  ('day0',  '시술 전 가장 망설였던 점이, 막상 받아보니 어떻게 느껴졌나요?'),
  ('day0',  '시술 직후 바로 일상이 가능한 상태였나요?'),
  ('day0',  '시술받기 전의 나에게 한마디 해준다면, 무슨 말을 하고 싶나요?'),
  ('day0',  '오늘 시술받은 소감을 한마디로 표현한다면요?'),
  -- week1 (1주차)
  ('week1', '일주일 사이 가장 먼저 느낀 변화는 무엇인가요?'),
  ('week1', '일상으로 돌아오기까지 얼마나 걸렸나요? (회복 기간이 부담되진 않았는지)'),
  ('week1', '세안·화장 같은 평소 루틴에 불편함은 없었나요?'),
  ('week1', '이 시기에 기대했던 변화와 실제를 비교하면 어떤가요?'),
  ('week1', '주변에서 달라진 점을 알아본 사람이 있었나요?'),
  ('week1', '일주일 전, 시술을 막 끝낸 나에게 해주고 싶은 말이 있다면요?'),
  ('week1', '일주일 차에 가장 만족스러운 부분은 무엇인가요?'),
  -- month1 (1개월)
  ('month1', '한 달이 지난 지금, 가장 크게 와닿는 변화는 무엇인가요?'),
  ('month1', '처음 기대했던 모습과 비교하면 지금은 어떤가요?'),
  ('month1', '변화를 가장 또렷하게 느낀 순간이 있었나요?'),
  ('month1', '주변 반응이나 들은 이야기가 있었나요?'),
  ('month1', '화장·표정·사진 등 일상에서 달라진 점이 있나요?'),
  ('month1', '시술을 결심하던 한 달 전의 나에게 지금 무슨 말을 해주고 싶나요?'),
  ('month1', '한 달 차에 가장 만족스러운 점과, 더 지켜보고 싶은 점은요?'),
  -- month4 (4개월)
  ('month4', '넉 달이 지난 지금, 가장 만족스러운 점은 무엇인가요?'),
  ('month4', '변화가 어떻게 자리 잡았고, 지금까지 잘 유지되고 있나요?'),
  ('month4', '처음 기대했던 것과 비교해 지금은 어떤가요?'),
  ('month4', '''받길 잘했다''고 느낀 순간이 있었다면 언제였나요?'),
  ('month4', '다시 그때로 돌아가도 같은 선택을 할 것 같나요?'),
  ('month4', '넉 달 전, 시술을 고민하던 나에게 진심으로 해주고 싶은 말이 있다면요?'),
  ('month4', '이 시술이 일상이나 자신감에 남긴 변화가 있다면요?')
) AS v(timepoint, question_text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.question_pool q
   WHERE q.timepoint = v.timepoint
     AND q.question_text = v.question_text
);

-- ============================================================
-- (3) "생생한 후기를 남겨주세요"(any) 재활성 — 660개 이관답의 연결 질문 유지.
-- ============================================================
UPDATE public.question_pool
   SET is_active = true
 WHERE timepoint = 'any'
   AND question_text = '생생한 후기를 남겨주세요';

COMMIT;
