-- /me/profile 통합 편집을 위한 추가 컬럼:
--   1) liked_procedures TEXT[] — 받아보고 좋았던 시술 (자유 입력 태그)
--   2) field_visibility JSONB — 각 정보 항목 공개/비공개 설정
--      default 모두 true. 사용자가 체크 해제하면 외부 비노출.

alter table public.profiles
  add column if not exists liked_procedures text[] not null default '{}'::text[],
  add column if not exists field_visibility jsonb not null default jsonb_build_object(
    'birthdate', true,
    'gender', true,
    'face_shape', true,
    'skin_type', true,
    'skin_concerns', true,
    'interested_procedures', true,
    'liked_procedures', true,
    'bio', true
  );
