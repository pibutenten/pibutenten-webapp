-- =============================================================
-- 0042. qas.author_identity_id 컬럼 추가 — identity별 독립 author
--
-- 한 profile이 여러 identity (원장 / 개인 / 관리자)를 가질 때
-- 각 ID에서 쓴 글은 서로 완전 분리 — 같은 profile이라도 각자 글.
--
-- 채움 규칙 (기존 990 카드 이행):
--   qa.doctor_id 있음 → 해당 doctor의 profile_identities row (kind='doctor')
--   qa.doctor_id NULL + author_id 있음 → 그 profile의 personal identity
--   매칭 안 되면 NULL (수동 처리)
--
-- 발행 API는 author_identity_id를 항상 채워야 함.
-- =============================================================

alter table public.qas
  add column if not exists author_identity_id uuid
    references public.profile_identities(id) on delete set null;

create index if not exists idx_qas_author_identity_id
  on public.qas(author_identity_id)
  where author_identity_id is not null;

comment on column public.qas.author_identity_id is
  '글을 작성한 identity (profile_identities.id). 같은 profile이라도 ID별 분리.';

-- 이행 1) doctor 매핑된 카드 → 해당 doctor identity로 채움
update public.qas q
   set author_identity_id = pi.id
  from public.profile_identities pi
 where q.doctor_id is not null
   and pi.doctor_id = q.doctor_id
   and pi.kind = 'doctor'
   and q.author_identity_id is null;

-- 이행 2) primary identity의 doctor 매핑 (profile.handle = doctor slug 케이스)
-- profile_identities에 doctor identity row가 없는데 profiles.handle이 doctor slug인 경우 → profile_id 자체
-- 정한미·이도영·배정민의 경우 profile.handle = doctor slug 라서 이 경우 해당 안 됨 (이미 0041에서 추가됨)
-- (no-op)

-- 이행 3) doctor_id NULL + author_id 있음 카드 → 그 profile의 personal identity 시도
update public.qas q
   set author_identity_id = pi.id
  from public.profile_identities pi
 where q.doctor_id is null
   and q.author_id is not null
   and pi.profile_id = q.author_id
   and pi.kind = 'personal'
   and q.author_identity_id is null;

-- 이행 결과 통계
select
  count(*) filter (where author_identity_id is not null) as filled,
  count(*) filter (where author_identity_id is null) as unfilled,
  count(*) as total
from public.qas;
