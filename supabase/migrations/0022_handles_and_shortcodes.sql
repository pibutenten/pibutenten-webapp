-- v4 spec: 회원 글 URL을 shortcode 패턴으로
--
-- URL 구조:
--   회원 글:        /{handle}/{year}/{shortcode}      (8자 base58)
--   의사 official 글: /doctors/{slug}/{year}/{post-slug}  (기존 keyword slug 그대로)
--   의사 personal 글: /{alt_handle}/{year}/{shortcode}    (회원 패턴 적용)
--
-- 컬럼 추가:
--   profiles.handle      — 회원 핸들 (소문자 영숫자·하이픈 3-30자)
--   profiles.alt_handle  — 의사·관리자의 personal persona 핸들
--   qas.shortcode        — 회원 글 8자 base58 식별자
--   public.reserved_handles — 시스템 라우트와 충돌 방지

-- 1) reserved handles 테이블 + 시드
create table if not exists public.reserved_handles (
  handle text primary key
);

insert into public.reserved_handles (handle) values
  ('admin'), ('login'), ('logout'), ('signup'), ('write'), ('search'),
  ('feed'), ('doctors'), ('about'), ('settings'), ('me'), ('u'),
  ('article'), ('qa'), ('api'), ('auth'), ('robots'), ('sitemap'),
  ('manifest'), ('favicon'), ('llms'), ('og'), ('icons'), ('public'),
  ('static'), ('assets'), ('help'), ('terms'), ('privacy'), ('contact'),
  ('support'), ('home'), ('explore'), ('trending'), ('new'), ('hot'),
  ('top'), ('best'), ('all'), ('null'), ('undefined'), ('root'),
  ('staff'), ('mod'), ('moderator'), ('system'), ('official'),
  ('pibutenten'), ('피부텐텐')
on conflict do nothing;

-- 2) profiles.handle, alt_handle 추가 (둘 다 unique, nullable)
alter table public.profiles
  add column if not exists handle text,
  add column if not exists alt_handle text;

-- 형식 제약: 3-30자, lowercase 영숫자·하이픈, 양 끝은 영숫자
alter table public.profiles
  drop constraint if exists profiles_handle_format,
  drop constraint if exists profiles_alt_handle_format;
alter table public.profiles
  add constraint profiles_handle_format
    check (handle is null or handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  add constraint profiles_alt_handle_format
    check (alt_handle is null or alt_handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- unique index — case-insensitive 하지만 lowercase만 허용하니 그대로 ok
create unique index if not exists idx_profiles_handle_unique
  on public.profiles(handle)
  where handle is not null;
create unique index if not exists idx_profiles_alt_handle_unique
  on public.profiles(alt_handle)
  where alt_handle is not null;

-- handle, alt_handle, reserved_handles 사이 충돌 방지 위한 trigger
create or replace function public.check_handle_not_reserved()
returns trigger
language plpgsql
as $$
begin
  if new.handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.handle
  ) then
    raise exception '예약된 핸들입니다: %', new.handle;
  end if;
  if new.alt_handle is not null and exists (
    select 1 from public.reserved_handles where handle = new.alt_handle
  ) then
    raise exception '예약된 핸들입니다: %', new.alt_handle;
  end if;
  -- handle과 alt_handle이 본인 안에서도 충돌 안 되게
  if new.handle is not null and new.alt_handle is not null
     and new.handle = new.alt_handle then
    raise exception 'handle과 alt_handle은 다른 값이어야 합니다';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_check_handle on public.profiles;
create trigger trg_profiles_check_handle
  before insert or update of handle, alt_handle on public.profiles
  for each row execute function public.check_handle_not_reserved();

-- 3) qas.shortcode 추가 (회원 글용 8자 base58 식별자, nullable)
alter table public.qas
  add column if not exists shortcode varchar(12);

-- shortcode unique (NULL은 무한히 허용)
create unique index if not exists idx_qas_shortcode_unique
  on public.qas(shortcode)
  where shortcode is not null;

-- shortcode 형식 제약: 8-12자, base58 (혼동 가능 0/O/1/l/I 제외)
alter table public.qas
  drop constraint if exists qas_shortcode_format;
alter table public.qas
  add constraint qas_shortcode_format
    check (
      shortcode is null
      or shortcode ~ '^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{6,12}$'
    );
