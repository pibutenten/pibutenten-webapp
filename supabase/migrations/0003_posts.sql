-- =============================================================
-- 0003. posts (인스타 스타일 피드)
--
-- 적용 방법:
--   Supabase SQL Editor → New query → 본 파일 전체 붙여넣기 → Run
--
-- 설계:
--   - 원장 1명 ↔ 다수의 posts (1:N)
--   - image_urls 비어 있으면 텍스트 전용 카드
--   - tags 로 카테고리/주제 분류 (GIN 인덱스로 빠른 필터)
--   - pinned = true 면 피드 상단 고정
-- =============================================================

create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  body        text not null,
  image_urls  text[] not null default '{}',
  tags        text[] not null default '{}',
  like_count  int  not null default 0,
  view_count  int  not null default 0,
  published   boolean not null default true,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists posts_doctor_idx on public.posts (doctor_id);
create index if not exists posts_published_pinned_created_idx
  on public.posts (published, pinned desc, created_at desc);
create index if not exists posts_tags_gin_idx on public.posts using gin (tags);

alter table public.posts enable row level security;

drop policy if exists "posts: public read published" on public.posts;
create policy "posts: public read published"
  on public.posts for select
  using (published = true);

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------- 좋아요 / 조회수 RPC ----------
create or replace function public.increment_post_like(p_post_id bigint)
returns int
language sql
security definer
set search_path = public
as $func$
  update public.posts
     set like_count = like_count + 1
   where id = p_post_id and published = true
  returning like_count;
$func$;

create or replace function public.increment_post_view(p_post_id bigint)
returns int
language sql
security definer
set search_path = public
as $func$
  update public.posts
     set view_count = view_count + 1
   where id = p_post_id and published = true
  returning view_count;
$func$;

revoke all on function public.increment_post_like(bigint) from public;
revoke all on function public.increment_post_view(bigint) from public;
grant execute on function public.increment_post_like(bigint) to anon, authenticated;
grant execute on function public.increment_post_view(bigint) to anon, authenticated;

-- ---------- Data API 노출 ----------
grant select on public.posts to anon, authenticated;

-- ---------- 시드 (샘플 5개, 중복 방지) ----------
with new_posts(slug, body, tags, pinned) as (
  values
    (
      'jeonghanmi',
      '오늘부터 피부텐텐 인스타 스타일 피드를 시작합니다. 시술 후기, 피부 상식, 솔직한 Q&A까지 — 피부에 관한 모든 이야기를 여기서 함께 나눠요.',
      array['공지','시작'],
      true
    ),
    (
      'kimjongsik',
      '땅콩형 얼굴, 보톡스 한 번에 정말 달라질까요? 시술 전후 사진과 함께 풀어드릴게요. 처짐 정도, 근육 두께에 따라 결과가 다르니 진료 시 정확히 봐드립니다.',
      array['보톡스','얼굴형','땅콩형'],
      false
    ),
    (
      'kwonsuhyun',
      '요즘 가장 많이 받는 질문 TOP 3 — 1) 울쎄라 vs 써마지 차이 2) 스킨부스터 주기 3) 겨울철 트러블. 하나씩 짧게 정리해드릴게요.',
      array['Q&A','울쎄라','써마지','스킨부스터'],
      false
    ),
    (
      'parkhyojin',
      '경락 마사지가 정말 효과 있을까요? 직접 받아보고 솔직 후기 남깁니다. 일시적 부기 감소는 분명히 있지만, 근본적 리프팅을 원하신다면 다른 옵션을 함께 고려해보세요.',
      array['경락','리프팅','후기'],
      false
    ),
    (
      'leedoyoung',
      '겨울철 건조함, 이 4가지만 챙기시면 됩니다. ① 미온수 세안 ② 토너 패드보단 보습 토너 ③ 세라마이드 크림 ④ 수면 시 가습기. 단순하지만 가장 효과적인 루틴이에요.',
      array['홈케어','건조','겨울','보습'],
      false
    )
)
insert into public.posts (doctor_id, body, tags, pinned)
select d.id, np.body, np.tags, np.pinned
from new_posts np
join public.doctors d on d.slug = np.slug
where not exists (
  select 1 from public.posts p
  where p.doctor_id = d.id and p.body = np.body
);
