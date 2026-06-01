-- 영상 upload_date 백필 (2026-06-01, P1-a-③)
-- 배경: cards.video_id(FK) → videos 의 upload_date 가 NULL 인 영상 9개(Q&A 카드 37장 귀속) 보정.
--   원인: /api/admin/draft/publish 가 videos UPSERT 시 youtube_id/youtube_url/topic 만 넣고 upload_date 미기록.
--   수단: OAuth refresh_token 만료(invalid_grant)로 YouTube Data API 불가 → 각 영상 watch 페이지의 publishDate/uploadDate 메타를 추출.
--   형식: 기존 944개 upload_date 가 모두 "게시시각의 KST 변환 날짜" 기준임을 6건 대조로 확인 → 동일 규칙(AT TIME ZONE 'Asia/Seoul')::date 적용.
--   보호: upload_date IS NULL 조건으로 기존 값 보존(덮어쓰기 방지).
-- 검증: 실행 후 upload_date NULL 인 type='qa' 활성 카드 = 0.

UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2022-11-10T23:14:02-08:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='355XPfOK14s' AND upload_date IS NULL; -- 2022-11-11
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2022-11-10T23:15:13-08:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='dmKPwe3bFXI' AND upload_date IS NULL; -- 2022-11-11
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2023-02-23T03:00:37-08:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='pwEa8iIjNFM' AND upload_date IS NULL; -- 2023-02-23
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-05T23:08:33-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='Jsu_96-DLcQ' AND upload_date IS NULL; -- 2026-05-06
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-07T20:30:26-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='U42sb6TMu5c' AND upload_date IS NULL; -- 2026-05-08
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-14T18:32:34-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='gmTaKoFiZn0' AND upload_date IS NULL; -- 2026-05-15
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-11T22:00:10-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='6WMKxFOQQhc' AND upload_date IS NULL; -- 2026-05-12
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-17T18:00:42-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='vB7Bk87M6Ro' AND upload_date IS NULL; -- 2026-05-18
UPDATE public.videos SET upload_date=(TIMESTAMPTZ '2026-05-19T23:38:50-07:00' AT TIME ZONE 'Asia/Seoul')::date WHERE youtube_id='XUEGKSWbSnA' AND upload_date IS NULL; -- 2026-05-20
