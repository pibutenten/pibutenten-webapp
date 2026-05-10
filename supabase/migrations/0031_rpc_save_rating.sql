-- search_qas_scored RPC 갱신: save_count, rating_avg, rating_count 추가.
-- 카드에 [저장]/[평점] 표시용. UI는 미니멀.

drop function if exists public.search_qas_scored(text, text, int, int, text);

create or replace function public.search_qas_scored(
  p_q text default '',
  p_doctor_slug text default null,
  p_offset int default 0,
  p_limit int default 20,
  p_boost_doctor_slug text default null
)
returns table (
  id bigint,
  question text,
  answer text,
  meta text,
  keywords text[],
  like_count int,
  view_count int,
  save_count int,
  rating_avg numeric,
  rating_count int,
  doctor jsonb,
  video jsonb,
  author jsonb,
  type text,
  posted_as text,
  post_year int,
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
  created_at timestamptz
)
language plpgsql
stable
as $$
declare
  v_words text[]; v_doctor_id uuid; v_boost_doctor_id uuid;
begin
  v_words := array_remove(string_to_array(lower(coalesce(trim(p_q), '')), ' '), '');
  if p_doctor_slug is not null and p_doctor_slug <> '' then
    select d.id into v_doctor_id from public.doctors d where d.slug = p_doctor_slug;
    if v_doctor_id is null then return; end if;
  end if;
  if p_boost_doctor_slug is not null and p_boost_doctor_slug <> '' then
    select d.id into v_boost_doctor_id from public.doctors d where d.slug = p_boost_doctor_slug;
  end if;

  return query
  with scored as (
    select q.id, q.question, q.answer, q.meta, q.keywords, q.like_count, q.view_count,
      q.save_count, q.rating_avg, q.rating_count,
      q.doctor_id, q.video_id, q.author_id, q.created_at, q.type::text as type_text,
      q.posted_as::text as posted_as_text,
      q.post_year, q.post_slug, q.shortcode::text as shortcode,
      q.external_url, q.external_title, q.external_description, q.external_image, q.external_site_name,
      q.category, q.hide_doctor_credential,
      (coalesce((select count(*)::int * 1000 from unnest(v_words) w where exists (select 1 from unnest(q.keywords) k where lower(k) = w)), 0)
       + coalesce((select count(*)::int * 500 from unnest(v_words) w where q.question ilike '%' || w || '%'), 0)
       + coalesce((select count(*)::int * 100 from unnest(v_words) w where q.answer ilike '%' || w || '%'), 0)
       + case when v_boost_doctor_id is not null and q.doctor_id = v_boost_doctor_id then 150 else 0 end
       + 200 * exp(-extract(epoch from (now() - q.created_at)) / (60.0 * 60.0 * 24.0 * 365.0))
      )::numeric as score
    from public.qas q
    where q.status = 'published'
      and (v_doctor_id is null or q.doctor_id = v_doctor_id)
      and (coalesce(array_length(v_words, 1), 0) = 0
        or not exists (select 1 from unnest(v_words) w
          where not (q.question ilike '%' || w || '%' or q.answer ilike '%' || w || '%' or exists (select 1 from unnest(q.keywords) k where lower(k) = w))))
  )
  select s.id, s.question, s.answer, s.meta, s.keywords, s.like_count, s.view_count,
    s.save_count, s.rating_avg, s.rating_count,
    case when d.id is null then null::jsonb else jsonb_build_object('slug', d.slug, 'name', d.name, 'branch', d.branch) end as doctor,
    case when v.id is null then null::jsonb else jsonb_build_object('youtube_id', v.youtube_id, 'youtube_url', v.youtube_url, 'topic', v.topic, 'upload_date', v.upload_date) end as video,
    case when p.id is null then null::jsonb else jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'alt_display_name', p.alt_display_name,
      'alt_avatar_url', p.alt_avatar_url,
      'handle', p.handle,
      'alt_handle', p.alt_handle,
      'updated_at', p.updated_at
    ) end as author,
    s.type_text as type,
    s.posted_as_text as posted_as,
    s.post_year, s.post_slug,
    s.external_url, s.external_title, s.external_description, s.external_image, s.external_site_name,
    s.category, s.hide_doctor_credential, s.shortcode,
    s.score, s.created_at
  from scored s
  left join public.doctors d on d.id = s.doctor_id
  left join public.videos v on v.id = s.video_id
  left join public.profiles p on p.id = s.author_id
  order by s.score desc, s.created_at desc
  offset p_offset
  limit p_limit;
end;
$$;
