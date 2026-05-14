-- 0082: profiles.avatar_url / alt_avatar_url HTTP → HTTPS 정규화
--
-- 외부 점검 보고서(2026-05-14): 비로그인 홈에서 Mixed Content 경고.
-- 원인은 카드 썸네일이 아니라 카드 안 작성자 아바타(카카오 OAuth 가입자 avatar_url).
-- 카카오 CDN(k.kakaocdn.net 등)은 HTTPS 지원하므로 안전하게 https로 교체.
--
-- 추가로 OAuth 콜백/프로필 갱신 트리거가 새 http URL을 다시 넣지 않도록
-- 향후 신규 가입 흐름도 점검 권장 (코드 측 정규화는 별도 commit).

UPDATE public.profiles
   SET avatar_url = 'https://' || substring(avatar_url FROM 8)
 WHERE avatar_url LIKE 'http://%';

UPDATE public.profiles
   SET alt_avatar_url = 'https://' || substring(alt_avatar_url FROM 8)
 WHERE alt_avatar_url LIKE 'http://%';

SELECT 'OK 0082' AS status;
