-- Phase 2: qas.category 컬럼 추가 — 글 분류 체계
-- review (피부과 후기) / daily (데일리) / question (물어봐요) / news (소식 나눠요) / qa (Q&A · 원장 전용)
--
-- 기존 데이터 마이그레이션:
--   type='qa'      → category='qa'
--   type='article' → category='review'
--   type='post'    → category='daily'

alter table public.qas
  add column if not exists category text;

update public.qas
set category = case
  when type = 'qa' then 'qa'
  when type = 'article' then 'review'
  else 'daily'
end
where category is null;

alter table public.qas
  alter column category set default 'daily',
  alter column category set not null;

-- 카테고리 enum 검증 — invalid 값 방어
alter table public.qas
  drop constraint if exists qas_category_check;
alter table public.qas
  add constraint qas_category_check
  check (category in ('review', 'daily', 'question', 'news', 'qa'));

-- 피드/필터 쿼리용 인덱스
create index if not exists idx_qas_category on public.qas(category);
