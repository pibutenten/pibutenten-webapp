-- =============================================================
-- 0011. qas 테이블 status enum + type 컬럼 + RLS
--
-- - qa_status: draft / pending_review / published / archived
-- - qa_type:   qa (원장 Q&A) / post (일반 사용자 자유 글)
-- - 기존 published(boolean) 값은 status에 마이그레이션
-- - RLS: published만 anon 노출, 작성자 본인 또는 관리자만 수정
-- - search_qas_scored RPC는 status='published' 조건으로 업데이트
-- =============================================================

-- 1. enum 생성
do $$
begin
  if not exists (select 1 from pg_type where typname = 'qa_status') then
    create type public.qa_status as enum ('draft', 'pending_review', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'qa_type') then
    create type public.qa_type as enum ('qa', 'post');
  end if;
end$$;

-- 2. 컬럼 추가
alter table public.qas
  add column if not exists status public.qa_status not null default 'draft',
  add column if not exists type   public.qa_type   not null default 'qa',
  add column if not exists author_id uuid references auth.users(id) on delete set null;

-- 3. 기존 published(boolean) → status 마이그레이션 (이미 published=true는 status='published')
update public.qas
   set status = 'published'
 where published = true and status = 'draft';

-- 4. 인덱스
create index if not exists qas_status_idx on public.qas(status);
create index if not exists qas_type_idx on public.qas(type);
create index if not exists qas_author_idx on public.qas(author_id);

-- 5. search_qas_scored RPC 업데이트 (published=true → status='published', + type 가중치)
drop function if exists public.search_qas_scored(text, text, int, int, text);

create or replace function public.search_qas_scored(
  p_q                  text default '',
  p_doctor_slug        text default null,
  p_offset             int  default 0,
  p_limit              int  default 20,
  p_boost_doctor_slug  text default null
)
returns table (
  id          bigint,
  question    text,
  answer      text,
  meta        text,
  keywords    text[],
  like_count  int,
  view_count  int,
  doctor      jsonb,
  video       jsonb,
  score       numeric
)
language plpgsql
stable
as $func$
declare
  v_words           text[];
  v_doctor_id       uuid;
  v_boost_doctor_id uuid;
begin
  v_words := array_remove(string_to_array(lower(coalesce(trim(p_q), '')), ' '), '');

  if p_doctor_slug is not null and p_doctor_slug <> '' then
    select d.id into v_doctor_id from public.doctors d where d.slug = p_doctor_slug;
    if v_doctor_id is null then
      return;
    end if;
  end if;

  if p_boost_doctor_slug is not null and p_boost_doctor_slug <> '' then
    select d.id into v_boost_doctor_id
    from public.doctors d where d.slug = p_boost_doctor_slug;
  end if;

  return query
  with scored as (
    select
      q.id, q.question, q.answer, q.meta, q.keywords,
      q.like_count, q.view_count, q.doctor_id, q.video_id, q.created_at, q.type,
      (
        coalesce((
          select count(*)::int * 1000
          from unnest(v_words) w
          where exists (
            select 1 from unnest(q.keywords) k where lower(k) = w
          )
        ), 0)
        +
        coalesce((
          select count(*)::int * 500
          from unnest(v_words) w
          where q.question ilike '%' || w || '%'
        ), 0)
        +
        coalesce((
          select count(*)::int * 100
          from unnest(v_words) w
          where q.answer ilike '%' || w || '%'
        ), 0)
        +
        case
          when v_boost_doctor_id is not null and q.doctor_id = v_boost_doctor_id
          then 150
          else 0
        end
        +
        200 * exp(-extract(epoch from (now() - q.created_at)) / (60.0 * 60.0 * 24.0 * 365.0))
      )::numeric as score
    from public.qas q
    where q.status = 'published'
      and (v_doctor_id is null or q.doctor_id = v_doctor_id)
      and (
        coalesce(array_length(v_words, 1), 0) = 0
        or not exists (
          select 1 from unnest(v_words) w
          where not (
            q.question ilike '%' || w || '%'
            or q.answer  ilike '%' || w || '%'
            or exists (select 1 from unnest(q.keywords) k where lower(k) = w)
          )
        )
      )
  )
  select
    s.id, s.question, s.answer, s.meta, s.keywords,
    s.like_count, s.view_count,
    jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) as doctor,
    case
      when v.id is null then null::jsonb
      else jsonb_build_object(
        'youtube_id',  v.youtube_id,
        'youtube_url', v.youtube_url,
        'topic',       v.topic,
        'upload_date', v.upload_date
      )
    end as video,
    -- type='post' (일반 사용자 글)는 score × 0.3 (낮은 가중치, 검색 결과에서 적게 노출)
    (case when s.type = 'post' then s.score * 0.3 else s.score end) as score
  from scored s
  left join public.doctors d on d.id = s.doctor_id
  left join public.videos  v on v.id = s.video_id
  order by
    case when array_length(v_words, 1) is not null
         then (case when s.type = 'post' then s.score * 0.3 else s.score end) + (random() - 0.5) * 800 end desc nulls last,
    case when array_length(v_words, 1) is null and v.upload_date is not null
         then extract(epoch from v.upload_date) + (random() - 0.5) * 60.0 * 60.0 * 24.0 * 120.0
         end desc nulls last,
    s.id desc
  offset p_offset limit p_limit;
end
$func$;

revoke all on function public.search_qas_scored(text, text, int, int, text) from public;
grant execute on function public.search_qas_scored(text, text, int, int, text) to anon, authenticated;

-- 6. get_hot_qa_ids도 status='published' 기준으로 업데이트
create or replace function public.get_hot_qa_ids(p_limit int default 20)
returns setof bigint
language sql
stable
as $func$
  select id
  from public.qas
  where status = 'published'
  order by
    (coalesce(like_count, 0) * 2 + coalesce(view_count, 0))
      * exp(-extract(epoch from (now() - created_at)) / (60.0 * 60.0 * 24.0 * 90.0))
    desc nulls last,
    id desc
  limit greatest(1, least(100, p_limit));
$func$;

revoke all on function public.get_hot_qa_ids(int) from public;
grant execute on function public.get_hot_qa_ids(int) to anon, authenticated;

-- 7. RLS — qas 테이블
alter table public.qas enable row level security;

-- 모두가 읽을 수 있는 건 status='published' 만
drop policy if exists "qas_public_read" on public.qas;
create policy "qas_public_read" on public.qas
  for select using (
    status = 'published'
    or public.is_admin()
    or (
      -- 원장은 본인 doctor의 모든 글 (draft/pending 포함)
      auth.uid() is not null
      and doctor_id = public.current_doctor_id()
    )
    or (
      -- 일반 사용자는 본인이 작성한 post의 모든 상태
      author_id = auth.uid()
    )
  );

drop policy if exists "qas_admin_all" on public.qas;
create policy "qas_admin_all" on public.qas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "qas_doctor_update" on public.qas;
create policy "qas_doctor_update" on public.qas
  for update using (
    auth.uid() is not null
    and doctor_id = public.current_doctor_id()
  ) with check (
    auth.uid() is not null
    and doctor_id = public.current_doctor_id()
  );

drop policy if exists "qas_doctor_delete" on public.qas;
create policy "qas_doctor_delete" on public.qas
  for delete using (
    auth.uid() is not null
    and doctor_id = public.current_doctor_id()
  );

drop policy if exists "qas_user_post_insert" on public.qas;
create policy "qas_user_post_insert" on public.qas
  for insert with check (
    auth.uid() is not null
    and (
      -- 일반 사용자: type='post', author_id=본인, doctor_id null
      (type = 'post' and author_id = auth.uid() and doctor_id is null)
      -- 또는 admin/doctor가 자기 doctor의 qa 추가
      or public.is_admin()
      or (doctor_id = public.current_doctor_id())
    )
  );

drop policy if exists "qas_user_own_post" on public.qas;
create policy "qas_user_own_post" on public.qas
  for update using (
    auth.uid() is not null
    and type = 'post'
    and author_id = auth.uid()
  ) with check (
    auth.uid() is not null
    and type = 'post'
    and author_id = auth.uid()
  );
