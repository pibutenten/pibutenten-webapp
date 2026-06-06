-- 0262. 프로필 영문코드 → 한글 통일 (I-Phase2)
--
-- 목적: profiles.skin_type(영문7·CHECK)·skin_concerns(영문11)·interested_procedures(영한혼재)를
--   한글로 통일 → 글 태그(cards.keywords 한글)와 같은 도메인 → run_keyword_digest 매칭 부활.
--   매핑은 src/lib/profile-options.ts(한글 key 전환)와 1:1. face_shape 는 범위 제외(영문 유지).
--   PDLLA/PLLA 등 매핑 없는 값은 그대로(ELSE v) 유지(매칭 안 돼도 무해).
-- 백업: profiles 3컬럼(profiles_concern_bak_0262). dedup 은 array_agg(DISTINCT) — 영문/한글 중복 흡수.

BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles_concern_bak_0262 AS
  SELECT id, skin_type, skin_concerns, interested_procedures, now() AS backed_up_at FROM public.profiles;

-- skin_type: CHECK(영문7) 해제 → 한글 변환 → CHECK(한글7) 재설정
ALTER TABLE public.profiles DROP CONSTRAINT profiles_skin_type_check;

UPDATE public.profiles SET skin_type = CASE skin_type
  WHEN 'extreme_dry'     THEN '극건성'
  WHEN 'dry'             THEN '건성'
  WHEN 'normal'          THEN '중성'
  WHEN 'combination'     THEN '복합성'
  WHEN 'dehydrated_oily' THEN '수부지'
  WHEN 'oily'            THEN '지성'
  WHEN 'extreme_oily'    THEN '극지성'
  ELSE skin_type END
WHERE skin_type IS NOT NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_skin_type_check
  CHECK (skin_type = ANY (ARRAY['극건성','건성','중성','복합성','수부지','지성','극지성']));

-- skin_concerns(배열): 영문11 → 한글11
UPDATE public.profiles SET skin_concerns = (
  SELECT array_agg(DISTINCT CASE v
    WHEN 'sagging'    THEN '처짐'
    WHEN 'elasticity' THEN '탄력'
    WHEN 'volume'     THEN '볼륨'
    WHEN 'texture'    THEN '피부결'
    WHEN 'wrinkle'    THEN '주름'
    WHEN 'tone'       THEN '피부톤'
    WHEN 'pores'      THEN '모공'
    WHEN 'contour'    THEN '윤곽'
    WHEN 'inner_dry'  THEN '속건조'
    WHEN 'trouble'    THEN '트러블'
    WHEN 'redness'    THEN '홍조'
    ELSE v END)
  FROM unnest(skin_concerns) v
)
WHERE array_length(skin_concerns, 1) > 0;

-- interested_procedures(배열): 영문6 → 한글6 (PDLLA/PLLA 등은 ELSE v 유지)
UPDATE public.profiles SET interested_procedures = (
  SELECT array_agg(DISTINCT CASE v
    WHEN 'lifting'  THEN '리프팅'
    WHEN 'booster'  THEN '스킨부스터'
    WHEN 'laser'    THEN '레이저'
    WHEN 'filler'   THEN '필러'
    WHEN 'cosmetic' THEN '화장품'
    WHEN 'botox'    THEN '보톡스'
    ELSE v END)
  FROM unnest(interested_procedures) v
)
WHERE array_length(interested_procedures, 1) > 0;

COMMIT;
