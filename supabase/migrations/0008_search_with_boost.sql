-- =============================================================
-- 0008. 검색 RPC에 doctor_slug boost 추가
--
-- 사용 예: 원장님 단일 페이지에서 칩 클릭 → /?q=쥬브젠&boost=leedoyoung
-- 그 원장의 글에는 +150점 가산 (본문 100보다 약간 크고, 질문 500보다 훨씬 작아 자연스럽게 섞임)
-- =============================================================

drop function if exists public.search_qas_scored(text, text, int, int);

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
        case
          when v_boost_doctor_id is not null and q.doctor_id = v_boost_doctor_id
          then 150
          else 0
        end
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
    s.score
  from scored s
  left join public.doctors d on d.id = s.doctor_id
  left join public.videos  v on v.id = s.video_id
  order by
    -- 검색어 있으면: 점수에 ±400 노이즈 (랜덤 비중 ↑)
    case when array_length(v_words, 1) is not null
         then s.score + (random() - 0.5) * 800 end desc nulls last,
    -- 검색어 없으면(브라우즈): 영상 업로드일 + ±60일 랜덤 노이즈 (2달 단위 셔플)
    case when array_length(v_words, 1) is null and v.upload_date is not null
         then extract(epoch from v.upload_date) + (random() - 0.5) * 60.0 * 60.0 * 24.0 * 120.0
         end desc nulls last,
    s.id desc
  offset p_offset limit p_limit;
end
$func$;

revoke all on function public.search_qas_scored(text, text, int, int, text) from public;
grant execute on function public.search_qas_scored(text, text, int, int, text) to anon, authenticated;
