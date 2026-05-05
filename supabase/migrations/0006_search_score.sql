-- =============================================================
-- 0006. 검색 점수 RPC (search_qas_scored)
--
-- 점수 공식:
--   keyword 정확 일치   : +1000 (단어 수 만큼)
--   question 부분 일치  : +500
--   answer 부분 일치    : +100
--   시간 가산           : 200 × exp(-age_days/365)
--                         (1년 신규 ≈ +180~+200, 1년 후 ≈ +75)
--
-- 다중 단어: 공백 구분 → 모두 매칭되는 글만 (AND).
--           각 단어는 question/answer/keywords 중 어디든 매칭이면 통과.
-- 정렬: 점수 desc, 같은 점수 그룹 random(), id desc.
-- =============================================================

create or replace function public.search_qas_scored(
  p_q           text default '',
  p_doctor_slug text default null,
  p_offset      int  default 0,
  p_limit       int  default 20
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
  v_words     text[];
  v_doctor_id uuid;
begin
  v_words := array_remove(string_to_array(lower(coalesce(trim(p_q), '')), ' '), '');

  if p_doctor_slug is not null and p_doctor_slug <> '' then
    select d.id into v_doctor_id from public.doctors d where d.slug = p_doctor_slug;
    if v_doctor_id is null then
      return;
    end if;
  end if;

  return query
  with scored as (
    select
      q.id, q.question, q.answer, q.meta, q.keywords,
      q.like_count, q.view_count, q.doctor_id, q.video_id, q.created_at,
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
        200 * exp(-extract(epoch from (now() - q.created_at)) / (60.0 * 60.0 * 24.0 * 365.0))
      )::numeric as score
    from public.qas q
    where q.published = true
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
    jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch)        as doctor,
    case
      when v.id is null then null::jsonb
      else jsonb_build_object(
        'youtube_id',  v.youtube_id,
        'youtube_url', v.youtube_url,
        'topic',       v.topic,
        'upload_date', v.upload_date
      )
    end as video,
    s.score
  from scored s
  left join public.doctors d on d.id = s.doctor_id
  left join public.videos  v on v.id = s.video_id
  order by s.score desc, random(), s.id desc
  offset p_offset limit p_limit;
end
$func$;

revoke all on function public.search_qas_scored(text, text, int, int) from public;
grant execute on function public.search_qas_scored(text, text, int, int) to anon, authenticated;
