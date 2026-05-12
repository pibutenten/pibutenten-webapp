-- =============================================================
-- 0040. profiles.doctor_id 컬럼 신설 — user ↔ doctor 1:1 매핑
--
-- 권한 모델:
--   role='admin' + doctor_id=NULL  → super admin (개발자, 모든 권한)
--   role='admin' + doctor_id=<id>  → 원장 admin (본인 doctor 카드만 + 검수 권한)
--   role='user'                    → 일반 사용자
--
-- 사용처:
--   /admin/qas: doctor_id 있으면 자동으로 본인 doctor 카드만 필터
--   /admin/draft: doctor_id 있으면 접근 차단 (super admin 전용)
--   /admin nav: doctor_id 있으면 "새 Q&A 추출하기" 메뉴 숨김
-- =============================================================

alter table public.profiles
  add column if not exists doctor_id uuid
    references public.doctors(id) on delete set null;

create index if not exists idx_profiles_doctor_id
  on public.profiles(doctor_id)
  where doctor_id is not null;

comment on column public.profiles.doctor_id is
  '원장과 1:1 매핑 — NULL이면 super admin 또는 일반 사용자, 값 있으면 그 doctor의 본인 카드만 접근';
