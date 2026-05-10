-- Phase A.2: 글 단위 의사 직함 숨김 토글.
-- 의사가 사적 글(피부일기·물어봐요·새소식·공유하기)에서도 권위 표시 끄고 싶을 때 사용.
-- 카테고리별 default는 클라이언트(post-category.ts)에서 결정.
alter table public.qas
  add column if not exists hide_doctor_credential boolean not null default false;
