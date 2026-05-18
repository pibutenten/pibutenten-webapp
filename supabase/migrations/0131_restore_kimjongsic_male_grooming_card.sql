-- 0131: 김종식 doctor "수염 제모" 카드 복구 (2026-05-18)
--
-- 배경:
--   김종식 원장님이 "제모를 추천하는 이유…" 카드 한 짝이 중복이라 한 개를 삭제하셨는데
--   둘 다 hard delete (cards 테이블 soft-delete 컬럼 없음). 영상 `o3nccMY2NsY` 의
--   sequence gap 으로 id 2007 의 카드가 빠진 것을 확인.
--
--   Q&A_백업 - 2차 폴더의 `251001_김종식_남자_외모관리.txt` 백업에서 해당 카드 발견:
--     Q. "수염 제모하면 피부도 깔끔해진다는 게 진짜예요?"
--     출처시점 06:42 (=402s)
--
--   Supabase backup API 응답: backups=[], pitr_enabled=false → API 자동 복원 불가.
--   백업 파일 본문으로 직접 INSERT.
--
-- 영향:
--   - cards 1 row INSERT (id 신규 — sequence 자동 할당, 같은 영상의 다른 카드 author/doctor/video 동일)
--   - shortcode: base58 8자 신규 생성
--   - post_slug: 'beard-hair-removal-skin-improvement-male' (영상 다른 카드들과 동일 prefix 'male-')
--   - created_at: 2025-09-30 15:00:00+09 (영상 다른 카드와 동일 — 영상 발행 시점)
--
-- 안전:
--   - 트랜잭션. shortcode UNIQUE 충돌 시 재시도.
--   - 이미 같은 question 의 doctor 카드가 있으면 abort (중복 발생 방지).

BEGIN;

DO $$
DECLARE
  v_author uuid := 'ba4726bf-e181-495c-b123-1002f377d81d';     -- 김종식 doctor profile
  v_doctor uuid := '8781b90c-fd51-4eca-8a3e-b9eaae863603';     -- 김종식 doctor row
  v_video  bigint := 234;                                       -- videos.id (o3nccMY2NsY)
  v_question text := '수염 제모하면 피부도 깔끔해진다는 게 진짜예요?';
  v_answer text := '네, 수염 제모를 하면 피부까지 깔끔해지는 부수적 효과가 있습니다. 면도를 반복하다 보면 피부가 긁혀서 모낭염이 생기고, 모낭염이 사라진 뒤에는 색소침착이 되면서 칙칙해지는 악순환이 반복돼요. 제모를 하면 이 과정 자체가 사라지니까 피부 톤도 깨끗해집니다.

아무리 열심히 면도를 해도 수염 자국이 남아 있는 것과 없는 것은 확실히 차이가 나요. 수염 자국만으로도 지저분해 보이는 인상을 주기 쉽습니다. 어떻게 수염을 관리해야 할지 모르겠거나 자꾸 지저분해 보인다면 과감하게 제모를 해보시는 걸 추천드립니다.

면도하는 시간도 줄어들어 아침이 편해지고, 여행 갈 때 면도기를 안 챙겨도 되는 실질적인 장점도 있어요. **약 20회 정도면 꽤 깔끔한 결과를 얻을 수 있습니다.**';
  v_keywords text[] := ARRAY['제모','수염','모낭염','색소침착','남자피부','깔끔함','면도'];
  v_meta jsonb := jsonb_build_object(
    'video_id', 'o3nccMY2NsY',
    'video_title', '피부과 의사가 알려주는 매력 가꾸는 법',
    'source_file', '251001_o3nccMY2NsY.ko.vtt',
    'timestamp', jsonb_build_object('start','06:42','start_seconds',402),
    'script_evidence', '',
    'card_category', 'qa',
    'reasoning', '백업 파일에서 복구 (260518) — Q&A_백업 - 2차/251001_김종식_남자_외모관리.txt'
  );
  v_alphabet text := '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  v_shortcode text;
  v_attempt int;
  v_i int;
BEGIN
  -- 1) 동일 question + doctor 가 이미 있으면 중복 방지
  IF EXISTS (
    SELECT 1 FROM public.cards
    WHERE doctor_id = v_doctor AND question = v_question
  ) THEN
    RAISE EXCEPTION '[0131] 이미 같은 question 카드 존재 — 복구 중단';
  END IF;

  -- 2) shortcode base58 8자 (충돌 시 재시도)
  FOR v_attempt IN 1..10 LOOP
    v_shortcode := '';
    FOR v_i IN 1..8 LOOP
      v_shortcode := v_shortcode
        || substr(v_alphabet, 1 + floor(random() * 58)::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.cards WHERE shortcode = v_shortcode) THEN
      EXIT;
    END IF;
    v_shortcode := NULL;
  END LOOP;
  IF v_shortcode IS NULL THEN
    RAISE EXCEPTION '[0131] shortcode 생성 실패';
  END IF;

  -- 3) INSERT
  INSERT INTO public.cards (
    doctor_id, video_id, type, category, status, is_pick,
    question, answer, keywords,
    post_year, post_slug, shortcode,
    external_url, external_title, external_image, external_site_name,
    meta,
    author_id,
    created_at, updated_at
  ) VALUES (
    v_doctor, v_video, 'qa', 'qa', 'published', false,
    v_question, v_answer, v_keywords,
    2025, 'beard-hair-removal-skin-improvement-male', v_shortcode,
    'https://youtu.be/o3nccMY2NsY?t=402s',
    '피부과 의사가 알려주는 매력 가꾸는 법',
    'https://i.ytimg.com/vi/o3nccMY2NsY/hqdefault.jpg',
    'YouTube',
    v_meta,
    v_author,
    '2025-09-30 15:00:00+09', now()
  );

  RAISE NOTICE '[0131] 복구 완료 — shortcode=%, doctor=kim-jongsic, video=o3nccMY2NsY, t=402', v_shortcode;
END $$;

-- 검증
SELECT id, shortcode, question, status, created_at
FROM public.cards
WHERE doctor_id = '8781b90c-fd51-4eca-8a3e-b9eaae863603'
  AND question = '수염 제모하면 피부도 깔끔해진다는 게 진짜예요?';

COMMIT;
