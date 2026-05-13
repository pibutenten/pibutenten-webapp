-- =============================================================
-- 0055. Phase 9 마무리 — profile_identities 테이블·관련 컬럼 폐기
--
-- 사전: 0044~0054 모두 적용됨. 코드도 profile_identities·identity_id 의존
-- 모두 제거됨 (Phase 9 코드 정리 완료).
--
-- 영향:
--   - qas.author_identity_id 컬럼 drop
--   - comments.identity_id 컬럼 drop
--   - qa_likes.identity_id 컬럼 drop
--   - qa_saves.identity_id 컬럼 drop (있으면)
--   - comment_likes.identity_id 컬럼 drop (있으면)
--   - notifications.actor_identity_id, recipient_identity_id 컬럼 drop
--   - profile_identities 테이블 drop
--
-- 안전:
--   - 데이터는 이미 0047에서 user_id/author_id로 이관됨
--   - 코드가 더이상 identity_id 컬럼을 참조하지 않음
-- =============================================================

-- 1. FK 제약 먼저 제거 (DROP COLUMN이 CASCADE로 처리하지만 명시적으로)
do $$
declare
  c record;
  drop_fks text[] := array[
    'qas_author_identity_id_fkey',
    'comments_identity_id_fkey',
    'qa_likes_identity_id_fkey',
    'qa_saves_identity_id_fkey',
    'comment_likes_identity_id_fkey',
    'notifications_actor_identity_id_fkey',
    'notifications_recipient_identity_id_fkey'
  ];
  t text;
begin
  foreach t in array drop_fks loop
    for c in
      select cl.relname as src_table, cn.conname
      from pg_constraint cn
      join pg_class cl on cl.oid = cn.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public' and cn.conname = t
    loop
      execute format('alter table public.%I drop constraint %I', c.src_table, c.conname);
      raise notice '[0055] DROP FK %.%', c.src_table, c.conname;
    end loop;
  end loop;
end $$;

-- 2. identity_id 컬럼 제거
alter table public.qas drop column if exists author_identity_id;
alter table public.comments drop column if exists identity_id;
alter table public.qa_likes drop column if exists identity_id;
alter table public.qa_saves drop column if exists identity_id;
alter table public.comment_likes drop column if exists identity_id;
alter table public.notifications drop column if exists actor_identity_id;
alter table public.notifications drop column if exists recipient_identity_id;

-- 3. profile_identities 테이블 폐기
drop table if exists public.profile_identities cascade;

-- 검증
select
  (select count(*) from public.profiles) as profiles_total,
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'profile_identities') as profile_identities_table,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'identity_id') as identity_id_columns,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'author_identity_id') as author_identity_id_columns;
