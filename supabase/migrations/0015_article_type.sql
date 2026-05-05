-- =============================================================
-- 0015. qa_type에 'article' 추가 + article 전용 컬럼
--
-- - article: 원장 칼럼(긴 글, 섹션 + 이미지)
-- - 기존 'qa', 'post'는 그대로
-- - article은 sections (jsonb)에 [{heading, body, image_path}] 형태로 저장
-- - article은 cover_image, slug (URL용) 보유
-- =============================================================

-- 1. enum에 'article' 추가
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'article'
      and enumtypid = (select oid from pg_type where typname = 'qa_type')
  ) then
    alter type public.qa_type add value 'article';
  end if;
end$$;

-- 2. qas 테이블에 article 전용 컬럼 추가
alter table public.qas
  add column if not exists article_sections jsonb not null default '[]'::jsonb,
  add column if not exists article_cover_image text,
  add column if not exists article_slug text;

-- 3. 인덱스
create unique index if not exists qas_article_slug_uidx
  on public.qas(article_slug) where article_slug is not null;

create index if not exists qas_type_doctor_idx
  on public.qas(type, doctor_id);
