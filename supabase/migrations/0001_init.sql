-- =============================================================
-- 피부텐텐 초기 스키마
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → New query →
--   본 파일 전체 붙여넣기 → Run
--
-- 설계 노트:
--   - 모든 테이블 RLS = on (프로젝트 자동 RLS 옵션 + 명시적 enable 둘 다)
--   - 공개 콘텐츠는 anon SELECT 허용. 쓰기는 service_role(서버) 전용.
--   - 좋아요/조회수는 anon이 atomic increment 가능하도록 RPC로 분리.
-- =============================================================

-- ---------- 1. doctors ----------
create table if not exists public.doctors (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  title       text not null default '피부과 전문의',
  branch      text,
  photo_url   text,
  intro       text,
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists doctors_sort_order_idx on public.doctors (sort_order);

alter table public.doctors enable row level security;

drop policy if exists "doctors: public read" on public.doctors;
create policy "doctors: public read"
  on public.doctors for select
  using (true);

-- ---------- 2. videos ----------
create table if not exists public.videos (
  id           bigint generated always as identity primary key,
  youtube_id   text not null unique,
  youtube_url  text not null,
  topic        text,
  upload_date  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists videos_upload_date_idx on public.videos (upload_date desc);

alter table public.videos enable row level security;

drop policy if exists "videos: public read" on public.videos;
create policy "videos: public read"
  on public.videos for select
  using (true);

-- ---------- 3. qas ----------
create table if not exists public.qas (
  id          bigint generated always as identity primary key,
  doctor_id   uuid not null references public.doctors(id) on delete restrict,
  video_id    bigint references public.videos(id) on delete set null,
  question    text not null,
  answer      text not null,
  meta        text,
  keywords    text[] not null default '{}',
  like_count  int    not null default 0,
  view_count  int    not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists qas_doctor_idx       on public.qas (doctor_id);
create index if not exists qas_video_idx        on public.qas (video_id);
create index if not exists qas_published_idx    on public.qas (published, created_at desc);
create index if not exists qas_keywords_gin_idx on public.qas using gin (keywords);

-- 한국어 검색용 trigram 인덱스 (질문/답변 부분일치)
create extension if not exists pg_trgm;
create index if not exists qas_question_trgm_idx on public.qas using gin (question gin_trgm_ops);
create index if not exists qas_answer_trgm_idx   on public.qas using gin (answer   gin_trgm_ops);

alter table public.qas enable row level security;

drop policy if exists "qas: public read published" on public.qas;
create policy "qas: public read published"
  on public.qas for select
  using (published = true);

-- ---------- 4. updated_at 자동 갱신 트리거 ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists doctors_set_updated_at on public.doctors;
create trigger doctors_set_updated_at
  before update on public.doctors
  for each row execute function public.set_updated_at();

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
  before update on public.videos
  for each row execute function public.set_updated_at();

drop trigger if exists qas_set_updated_at on public.qas;
create trigger qas_set_updated_at
  before update on public.qas
  for each row execute function public.set_updated_at();

-- ---------- 5. 좋아요 / 조회수 RPC ----------
-- anon 키로도 호출 가능한 atomic increment 함수.
-- 클라이언트에서: supabase.rpc('increment_qa_like', { p_qa_id: 12345 })

create or replace function public.increment_qa_like(p_qa_id bigint)
returns int
language sql
security definer
set search_path = public
as $$
  update public.qas
     set like_count = like_count + 1
   where id = p_qa_id and published = true
  returning like_count;
$$;

create or replace function public.increment_qa_view(p_qa_id bigint)
returns int
language sql
security definer
set search_path = public
as $$
  update public.qas
     set view_count = view_count + 1
   where id = p_qa_id and published = true
  returning view_count;
$$;

revoke all on function public.increment_qa_like(bigint) from public;
revoke all on function public.increment_qa_view(bigint) from public;
grant execute on function public.increment_qa_like(bigint) to anon, authenticated;
grant execute on function public.increment_qa_view(bigint) to anon, authenticated;

-- ---------- 6. Data API 노출 ----------
-- (Project 설정에서 "Automatically expose new tables"를 끈 상태이므로 명시적 GRANT)
grant select on public.doctors to anon, authenticated;
grant select on public.videos  to anon, authenticated;
grant select on public.qas     to anon, authenticated;

-- ---------- 7. 시드 (등록 원장 9명) ----------
insert into public.doctors (slug, name, branch, sort_order) values
  ('jeonghanmi',  '정한미', '강남점',          10),
  ('baejungmin',  '배정민', '강남점',          11),
  ('kwonsuhyun',  '권수현', '수원점',          20),
  ('kimsoohyung', '김수형', '수원점',          21),
  ('gohyerim',    '고혜림', '수원점',          22),
  ('kimjongsik',  '김종식', '판교점',          30),
  ('leedoyoung',  '이도영', '건대점 대표원장', 40),
  ('kanghyunjin', '강현진', '건대점',          41),
  ('parkhyojin',  '박효진', '대구점 대표원장', 50)
on conflict (slug) do nothing;
