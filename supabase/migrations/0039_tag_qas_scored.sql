-- =============================================================
-- 0039. tag_qas_scored RPC — /tags/{태그} 페이지용 시간가중 셔플
--
-- feed_qas_scored 와 동일한 점수 공식 + 태그 필터 + 인덱싱 조건.
--
-- 필터:
--   q.status = 'published'
--   q.posted_as = 'official'
--   q.category in ('qa','tip')
--   q.doctor_id is not null
--   p_tag = ANY(q.keywords)
--
-- 점수 공식 (feed_qas_scored 와 동일):
--   base   = ln(max(like + view/10 + save*2, 1)) / ln(10) + 1
--   time   = exp(-age_days / HALF_LIFE)
--   doctor = 2.0 (이 RPC는 의사 글만 보므로 사실상 상수)
--   jitter = 1 + (random()-0.5) * JITTER_AMP   -- 호출마다 변동
--   score  = base * time * doctor * jitter
--
-- 기본 HALF_LIFE=14일, JITTER_AMP=0.2 (±10%).
--
-- 적용:
--   Dashboard SQL Editor 또는 Management API로 실행.
-- =============================================================

drop function if exists public.tag_qas_scored(text, integer, integer, numeric, numeric);

create or replace function public.tag_qas_scored(
  p_tag text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_half_life_days numeric default 14,
  p_jitter_amp numeric default 0.2
)
returns table (
  id bigint,
  question text,
  answer text,
  meta text,
  keywords text[],
  like_count integer,
  view_count integer,
  save_count integer,
  share_count integer,
  rating_avg numeric,
  rating_count integer,
  doctor jsonb,
  video jsonb,
  author jsonb,
  type text,
  posted_as text,
  post_year integer,
  post_slug text,
  external_url text,
  external_title text,
  external_description text,
  external_image text,
  external_site_name text,
  category text,
  hide_doctor_credential boolean,
  shortcode text,
  score numeric,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
volatile  -- random() 사용
as $function$
begin
  return query
  with scored as (
    select
      q.id, q.question, q.answer, q.meta, q.keywords,
      q.like_count, q.view_count, q.save_count,
      q.share_count,
      q.rating_avg, q.rating_count,
      q.doctor_id, q.video_id, q.author_id,
      q.created_at, q.updated_at,
      q.type::text as type_text,
      q.posted_as::text as posted_as_text,
      q.post_year, q.post_slug, q.shortcode::text as shortcode,
      q.external_url, q.external_title, q.external_description,
      q.external_image, q.external_site_name,
      q.category, q.hide_doctor_credential,
      (
        (ln(greatest(
          coalesce(q.like_count, 0)
          + coalesce(q.view_count, 0) / 10.0
          + coalesce(q.save_count, 0) * 2.0,
          1
        )) / ln(10.0) + 1.0)
        * exp(
          - extract(epoch from (now() - q.created_at))
          / (60.0 * 60.0 * 24.0 * greatest(p_half_life_days, 1.0))
        )
        * case when q.doctor_id is not null then 2.0 else 1.0 end
        * (1.0 + (random() - 0.5) * coalesce(p_jitter_amp, 0.0))
      )::numeric as score
    from public.qas q
    where q.status = 'published'
      and q.posted_as = 'official'
      and q.category in ('qa', 'tip')
      and q.doctor_id is not null
      and p_tag = any(q.keywords)
  )
  select
    s.id, s.question, s.answer, s.meta, s.keywords,
    s.like_count, s.view_count, s.save_count,
    s.share_count,
    s.rating_avg, s.rating_count,
    case when d.id is null then null::jsonb
      else jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch)
    end as doctor,
    case when v.id is null then null::jsonb
      else jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date)
    end as video,
    case when p.id is null then null::jsonb
      else jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'alt_display_name', p.alt_display_name,
        'alt_avatar_url', p.alt_avatar_url,
        'handle', p.handle,
        'alt_handle', p.alt_handle
      )
    end as author,
    s.type_text as type, s.posted_as_text as posted_as,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description,
    s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.score, s.created_at, s.updated_at
  from scored s
  left join public.doctors d on d.id = s.doctor_id
  left join public.videos v on v.id = s.video_id
  left join public.profiles p on p.id = s.author_id
  order by s.score desc
  offset p_offset
  limit p_limit;
end;
$function$;

grant execute on function public.tag_qas_scored(text, integer, integer, numeric, numeric) to anon, authenticated;
