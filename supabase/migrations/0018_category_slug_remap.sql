-- Phase A.1: 카테고리 slug 명명 일관성 정비.
--   review   → tip     (꿀팁)
--   daily    → diary   (피부일기)
--   question → ask     (물어봐요)
--   news     → news    (새소식, 그대로)
--   qa       → qa      (Q&A, 그대로)
--   (신규) share        (공유하기 — 외부 링크 큐레이션)
--
-- check 제약 새로 적용 + 기존 데이터 일괄 update.

-- 1) check 제약 임시 해제 (기존 값과 새 값이 동시에 존재하는 transition 허용)
alter table public.qas drop constraint if exists qas_category_check;

-- 2) 기존 데이터 remap
update public.qas set category = 'tip'   where category = 'review';
update public.qas set category = 'diary' where category = 'daily';
update public.qas set category = 'ask'   where category = 'question';

-- 3) 새 default
alter table public.qas alter column category set default 'diary';

-- 4) 새 check 제약 (6개 카테고리)
alter table public.qas
  add constraint qas_category_check
  check (category in ('qa', 'tip', 'diary', 'ask', 'news', 'share'));
