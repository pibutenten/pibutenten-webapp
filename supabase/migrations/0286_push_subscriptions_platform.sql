-- 0286: push_subscriptions — 네이티브(FCM) 토큰 지원을 위한 비파괴적 확장
--
-- 변경 사항:
--   1. platform 컬럼 추가 (web/ios/android). DEFAULT 'web' → 기존 row 전부 'web' 으로 채워짐.
--   2. p256dh, auth NOT NULL → nullable 변경. FCM 네이티브 토큰에는 Web Push 암호화 키가 없음.
--      기존 web row 는 값이 이미 있으므로 영향 없음.
--   3. UNIQUE(profile_id, endpoint) 는 그대로 유지.
--
-- 비파괴적 DDL (ADD COLUMN, DROP NOT NULL 만 사용. 데이터 손실 없음).

-- 1. platform 컬럼 추가
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'ios', 'android'));

-- 2. p256dh, auth nullable 로 변경
ALTER TABLE public.push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN auth DROP NOT NULL;

SELECT 'OK 0286' AS status;
