-- 0302_lenient_visit_date.sql
-- 회고형 후기 날짜 관대화 — 백엔드 계층.
-- 공유 계약(프런트 zod·UI 와 동일):
--   date_precision enum 에 'unknown' 신규 추가 (exact/season/half/year 보존).
--   precision='unknown' = 사용자가 "날짜 잘 기억 안 나요" 선택 → visited_on = NULL.
--     이 경우 ① 트랙A 재방문 알림(week1/month1/month4) 미예약,
--             ② day0 상대일정(visited_on + interval) 미적용,
--             ③ 날짜 범위검증(future/old) 스킵. 순수 회고(recall)로 취급.
--   precision in (season,half) 인데 하위값 미지정으로 들어오면 연(year) 단위로 graceful 강등 —
--     이 정규화는 프런트 1차 담당. 백엔드는 들어온 visited_on/precision 을 신뢰하되 NULL·unknown 안전 처리.
--   관대 원칙: 불완전 데이터 허용. 집계는 현행 부분집계(NULL 제외) 유지 — 더 엄격하게 만들지 않음.
--
-- 변경 3가지:
--   (A) diaries.visited_on DROP NOT NULL (unknown 날짜 대비).
--   (B) date_precision CHECK 확장 — diaries.visited_on_precision_check +
--       procedure_reviews.date_precision_check 에 'unknown' 추가 (라이브 정의 기반 DROP+ADD 재생성).
--   (C) create_visit_with_entries CREATE OR REPLACE — 본문 토씨 보존, 날짜 처리만 수정:
--       (a) p_visited_on NULL 허용 (diaries INSERT 에 NULL OK),
--       (b) p_visited_on_precision='unknown' 또는 visited_on NULL 이면
--           트랙A 예약 + day0 상대 로직 + future/old 범위검증 스킵,
--       (c) 나머지(시술·후기·카드·앵커·검수)는 그대로.
--   review_checkin.timepoint CHECK 는 'recall' 을 허용하지 않으므로(day0/week1/month1/month4 한정),
--     unknown 후기의 day0 체크인도 timepoint='day0' 로 그대로 저장하고 트랙A 예약만 스킵한다.
--     (review_checkin CHECK 변경 없음.)

BEGIN;

-- ============================================================
-- (A) diaries.visited_on DROP NOT NULL — unknown(날짜 미기억) 일기는 visited_on=NULL 허용.
--     기존 70개 일기는 모두 visited_on NOT NULL 이므로 nullable 전환은 기존 행 무영향.
-- ============================================================
ALTER TABLE public.diaries ALTER COLUMN visited_on DROP NOT NULL;

-- ============================================================
-- (B) date_precision CHECK 확장: 'unknown' 추가 (exact/season/half/year 보존).
--     라이브 정의:
--       diaries.visited_on_precision_check =
--         CHECK (visited_on_precision = ANY (ARRAY['exact','season','half','year']))
--       procedure_reviews.date_precision_check =
--         CHECK (date_precision = ANY (ARRAY['exact','season','half','year']))
--     → DROP 후 'unknown' 포함하여 정확히 재생성.
-- ============================================================
ALTER TABLE public.diaries DROP CONSTRAINT diaries_visited_on_precision_check;
ALTER TABLE public.diaries ADD CONSTRAINT diaries_visited_on_precision_check
  CHECK (visited_on_precision = ANY (ARRAY['exact'::text, 'season'::text, 'half'::text, 'year'::text, 'unknown'::text]));

ALTER TABLE public.procedure_reviews DROP CONSTRAINT procedure_reviews_date_precision_check;
ALTER TABLE public.procedure_reviews ADD CONSTRAINT procedure_reviews_date_precision_check
  CHECK (date_precision = ANY (ARRAY['exact'::text, 'season'::text, 'half'::text, 'year'::text, 'unknown'::text]));

-- ============================================================
-- (C) create_visit_with_entries — 본문 토씨 보존 + 날짜 처리만 수정.
--     v_lenient := (precision='unknown' OR visited_on NULL) 플래그로 분기:
--       · 범위검증(future/old) 스킵
--       · precision CHECK 에 'unknown' 추가
--       · 트랙A 예약(7f) WHERE 절에 'exact' 단정 유지 + visited_on NULL 가드(자명 스킵)
--     day0 checkin 자체는 unknown 이어도 사용자가 "지금 시점 평가" 로 넣으면 timepoint='day0' 로 저장,
--     트랙A 예약만 스킵된다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_visit_with_entries(
  p_profile_id            uuid,
  p_visited_on            date,
  p_visited_on_precision  text    DEFAULT 'exact',
  p_clinic_id             bigint  DEFAULT NULL,
  p_clinic_name           text    DEFAULT NULL,
  p_clinic_addr           text    DEFAULT NULL,
  p_clinic_tel            text    DEFAULT NULL,
  p_clinic_x              double precision DEFAULT NULL,
  p_clinic_y              double precision DEFAULT NULL,
  p_clinic_home           text    DEFAULT NULL,
  p_clinic_kakao          text    DEFAULT NULL,
  p_doctor_name           text    DEFAULT NULL,
  p_manager_name          text    DEFAULT NULL,
  p_diary_body            text    DEFAULT NULL,
  p_total_price           int     DEFAULT NULL,
  p_is_complete           boolean DEFAULT true,
  p_procedures            jsonb   DEFAULT '[]'::jsonb,
  p_reviews               jsonb   DEFAULT '[]'::jsonb
) RETURNS TABLE(visit_id bigint, review_ids bigint[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_visit_id   bigint;
  v_proc       jsonb;
  v_idx        int := 0;
  v_ko         text;
  v_len        int;
  v_proc_ids   bigint[] := ARRAY[]::bigint[];   -- 1-based(PostgreSQL 배열 기본)
  v_review_ids bigint[] := ARRAY[]::bigint[];
  v_rev        jsonb;
  v_rlen       int;
  v_rko        text;
  v_dpi        bigint;
  v_review_id  bigint;
  v_chk        jsonb;
  v_is_public  boolean;
  v_source     text;
  v_card       jsonb;
  v_card_id    bigint;
  v_card_status text;
  v_lenient    boolean;   -- ★0302: 회고 관대 모드(visited_on NULL 또는 precision='unknown') 플래그
BEGIN
  -- 1. 명함 소유검증 (create_diary 계승).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  -- ★0302: 관대 모드 판정 — visited_on NULL 또는 precision='unknown' 이면 순수 회고(recall).
  v_lenient := (p_visited_on IS NULL) OR (COALESCE(p_visited_on_precision, 'exact') = 'unknown');

  -- 2. visited_on 범위 + precision CHECK(이중 방어). ★0302: 관대 모드면 future/old 범위검증 스킵.
  IF NOT v_lenient THEN
    IF p_visited_on > CURRENT_DATE THEN RAISE EXCEPTION 'visited_on_future' USING ERRCODE = '22023'; END IF;
    IF p_visited_on < DATE '2000-01-01' THEN RAISE EXCEPTION 'visited_on_too_old' USING ERRCODE = '22023'; END IF;
  END IF;
  IF COALESCE(p_visited_on_precision, 'exact') NOT IN ('exact','season','half','year','unknown') THEN
    RAISE EXCEPTION 'invalid_visited_on_precision' USING ERRCODE = '22023';
  END IF;

  -- 3. diary_body 길이(create_diary 계승).
  IF char_length(p_diary_body) > 400 THEN RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001'; END IF;

  -- 4. 시술 배열 검증. ★procedures_empty 가드는 is_complete=false 일 때 면제(D-C).
  IF jsonb_typeof(p_procedures) <> 'array' THEN RAISE EXCEPTION 'procedures_not_array' USING ERRCODE = '22023'; END IF;
  v_len := jsonb_array_length(p_procedures);
  IF p_is_complete AND v_len < 1 THEN RAISE EXCEPTION 'procedures_empty' USING ERRCODE = '22023'; END IF;
  IF v_len > 20 THEN RAISE EXCEPTION 'procedures_too_many' USING ERRCODE = '22023'; END IF;

  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    v_ko := v_proc->>'procedure_ko';
    IF v_ko IS NULL OR char_length(v_ko) = 0 OR char_length(v_ko) > 100 THEN
      RAISE EXCEPTION 'invalid_procedure_ko' USING ERRCODE = '22023';
    END IF;
    IF (v_proc->'price') IS NOT NULL AND jsonb_typeof(v_proc->'price') <> 'null'
       AND ((v_proc->>'price') !~ '^\d+$' OR (v_proc->>'price')::bigint < 0 OR (v_proc->>'price')::bigint > 2000000000) THEN
      RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_proc->>'note') > 500 THEN RAISE EXCEPTION 'note_too_long' USING ERRCODE = '22001'; END IF;
    IF char_length(v_proc->>'unit_text') > 100 THEN RAISE EXCEPTION 'unit_text_too_long' USING ERRCODE = '22001'; END IF;
  END LOOP;

  -- 5. diaries INSERT(기존 + 신규 컬럼). NULLIF 계승. ★0302: visited_on NULL 그대로 허용(DROP NOT NULL).
  INSERT INTO public.diaries (
    profile_id, visited_on, visited_on_precision, clinic_id, clinic_name, clinic_addr, clinic_tel,
    clinic_x, clinic_y, clinic_home, clinic_kakao, doctor_name, manager_name, diary_body,
    total_price, is_complete
  ) VALUES (
    p_profile_id, p_visited_on, COALESCE(p_visited_on_precision, 'exact'),
    p_clinic_id, NULLIF(p_clinic_name, ''), NULLIF(p_clinic_addr, ''), NULLIF(p_clinic_tel, ''),
    p_clinic_x, p_clinic_y, NULLIF(p_clinic_home, ''), NULLIF(p_clinic_kakao, ''),
    NULLIF(p_doctor_name, ''), NULLIF(p_manager_name, ''), NULLIF(p_diary_body, ''),
    p_total_price, COALESCE(p_is_complete, true)
  ) RETURNING id INTO v_visit_id;

  -- 6. diary_procedures INSERT(배열 순서). v_proc_ids 는 1-based 누적.
  v_idx := 0;
  FOR v_proc IN SELECT * FROM jsonb_array_elements(p_procedures) LOOP
    INSERT INTO public.diary_procedures (
      diary_id, procedure_ko, tag_dict_ko, unit_text, price, note, sort_order
    ) VALUES (
      v_visit_id,
      v_proc->>'procedure_ko',
      NULLIF(v_proc->>'tag_dict_ko', ''),
      NULLIF(v_proc->>'unit_text', ''),
      CASE WHEN (v_proc->>'price') ~ '^\d+$' THEN (v_proc->>'price')::integer ELSE NULL END,
      NULLIF(v_proc->>'note', ''),
      COALESCE((v_proc->>'sort_order')::smallint, v_idx::smallint)
    ) RETURNING id INTO v_dpi;
    v_proc_ids := array_append(v_proc_ids, v_dpi);
    v_idx := v_idx + 1;
  END LOOP;

  -- 7. 시술별 후기 루프(p_reviews). F3: diary_linked + is_public=false(추이그래프 전용)
  --    또는 is_public=true(공개 시계열 후기 — 카드/앵커 lazy 생성). 둘 다 source='diary_linked'(visit 연결).
  IF jsonb_typeof(p_reviews) <> 'array' THEN RAISE EXCEPTION 'reviews_not_array' USING ERRCODE = '22023'; END IF;
  v_rlen := jsonb_array_length(p_reviews);
  IF v_rlen > 20 THEN RAISE EXCEPTION 'reviews_too_many' USING ERRCODE = '22023'; END IF;

  FOR v_rev IN SELECT * FROM jsonb_array_elements(p_reviews) LOOP
    -- 7a. procedure_ko 사전·is_procedure 사전검증(§3.2 step5). 미충족 → unknown_procedure 22023.
    v_rko := v_rev->>'procedure_ko';
    IF v_rko IS NULL OR char_length(v_rko) = 0 THEN
      RAISE EXCEPTION 'invalid_review_procedure_ko' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tag_dictionary WHERE ko = v_rko AND is_procedure) THEN
      RAISE EXCEPTION 'unknown_procedure' USING ERRCODE = '22023';
    END IF;

    -- 7b. 공개 여부 판정 (F3, D-H 반전). source 는 통합 RPC 의 후기가 항상 visit 연결이므로
    --      diary_linked 로 고정한다(§3.2 계약 847행). 입력값이 standalone 으로 와도 강제 diary_linked —
    --      그래야 visit_id=v_visit_id(NOT NULL) 와 함께 source_link_chk(diary_linked AND visit_id NOT NULL)
    --      를 항상 통과한다. 공개 standalone 회고 후기는 별도 경로(/api/reviews→create_procedure_review).
    --      카드 생성 분기(7c-2)는 source 와 무관하게 is_public=true 면 동일하게 동작(공개 분기 공통화).
    v_is_public := COALESCE((v_rev->>'is_public')::boolean, false);
    v_source    := 'diary_linked';

    -- 7c. diary_procedure_index → v_proc_ids[idx+1] 매핑(+1 = 0-base 계약 → 1-base 배열 보정).
    v_dpi := NULL;
    IF (v_rev->'diary_procedure_index') IS NOT NULL
       AND jsonb_typeof(v_rev->'diary_procedure_index') <> 'null' THEN
      v_idx := (v_rev->>'diary_procedure_index')::int;
      IF v_idx >= 0 AND v_idx < array_length(v_proc_ids, 1) THEN
        v_dpi := v_proc_ids[v_idx + 1];
      END IF;
    END IF;

    -- 7c-2. ★공개 분기(F3): is_public=true 면 카드/앵커 lazy 생성 후 card_id 확보.
    --        로직은 create_procedure_review 본문을 재사용해 정합 유지(카드 INSERT 절·앵커 ON CONFLICT 동일).
    --        라우트가 마스킹·검수·shortcode 생성 후 v_rev->'card' 로 주입(§3.2 계약·§3.6 1071행).
    --        public_needs_card(is_public=true→card_id NOT NULL)·cards NOT NULL(title/body/keywords/status/type/category)
    --        를 동시 통과하도록 컬럼 정합. 비공개면 카드 미생성(card_id=NULL).
    v_card_id := NULL;
    IF v_is_public THEN
      v_card := v_rev->'card';
      IF v_card IS NULL OR jsonb_typeof(v_card) <> 'object' THEN
        RAISE EXCEPTION 'public_review_needs_card' USING ERRCODE = '22023';
      END IF;
      v_card_status := COALESCE(NULLIF(v_card->>'status', ''), 'published');
      IF v_card_status NOT IN ('published','pending_review') THEN
        RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
      END IF;

      -- 카드 INSERT (create_procedure_review 계승: type='review'::qa_type, category='review').
      INSERT INTO public.cards (type, category, author_id, title, body, keywords, status, shortcode, post_year)
      VALUES (
        'review'::qa_type, 'review', p_profile_id,
        v_card->>'title', COALESCE(v_card->>'body', ''),
        CASE WHEN jsonb_typeof(v_card->'keywords') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_card->'keywords')) ELSE ARRAY[v_rko] END,
        v_card_status::qa_status,
        NULLIF(v_card->>'shortcode', ''),
        (v_card->>'post_year')::integer
      ) RETURNING id INTO v_card_id;

      -- published 면 자기 + 부모 리포트 앵커(review_summary) lazy 생성(create_procedure_review 동일 패턴).
      IF v_card_status = 'published' THEN
        INSERT INTO public.cards
          (type, category, author_id, title, body, keywords, status, post_slug, is_pick)
        SELECT
          'review_summary'::qa_type, 'review_summary',
          (SELECT id FROM public.profiles WHERE handle = 'pibutenten' LIMIT 1),
          '피부텐텐 리포트 | ' || t.ko, '', ARRAY[t.ko, t.en], 'published'::qa_status, t.en, false
        FROM public.tag_dictionary t
        WHERE t.ko IN (
                v_rko,
                (SELECT parent_ko FROM public.tag_dictionary WHERE ko = v_rko)
              )
          AND t.is_procedure
          AND t.en IS NOT NULL
        ON CONFLICT (post_slug) WHERE type = 'review_summary'::qa_type DO NOTHING;
      END IF;
    END IF;

    -- 7d. procedure_reviews INSERT — 불변식: diary_linked → visit_id=v_visit_id,
    --      source 명시, date_precision 명시(source_link_chk 통과).
    --      공개(is_public=true) → card_id=v_card_id(7c-2 확보), public_needs_card 통과.
    --      비공개(is_public=false) → card_id=NULL, public_needs_card 자명 통과.
    INSERT INTO public.procedure_reviews (
      card_id, procedure_ko, author_id,
      satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend,
      visit_id, diary_procedure_id, is_public, source, date_precision, solo_price
    ) VALUES (
      v_card_id, v_rko, p_profile_id,
      (v_rev->>'satisfaction')::smallint,
      (v_rev->>'pain')::smallint,
      NULLIF(v_rev->>'revisit', ''),
      CASE WHEN jsonb_typeof(v_rev->'effect_areas') = 'array'
           THEN ARRAY(SELECT jsonb_array_elements_text(v_rev->'effect_areas')) ELSE NULL END,
      NULLIF(v_rev->>'downtime', ''),
      NULLIF(v_rev->>'effect_onset', ''),
      (v_rev->>'recommend')::smallint,
      v_visit_id, v_dpi, v_is_public, v_source,
      COALESCE(NULLIF(v_rev->>'date_precision', ''), COALESCE(p_visited_on_precision, 'exact')),
      CASE WHEN (v_rev->>'solo_price') ~ '^\d+$' THEN (v_rev->>'solo_price')::integer ELSE NULL END
    ) RETURNING id INTO v_review_id;

    v_review_ids := array_append(v_review_ids, v_review_id);

    -- 7e. checkin_day0 존재 시 review_checkin(timepoint='day0') INSERT.
    --      day0 checkin·트랙A 예약(7f)은 diary_linked 전제이므로 공개(F3)/비공개 후기 공통으로 동작한다.
    --      ★0302: review_checkin.timepoint CHECK 가 'recall' 을 허용하지 않으므로 unknown 후기여도 'day0' 로 저장,
    --             트랙A 예약(7f)만 관대 모드에서 스킵한다.
    v_chk := v_rev->'checkin_day0';
    IF v_chk IS NOT NULL AND jsonb_typeof(v_chk) = 'object' THEN
      INSERT INTO public.review_checkin
        (review_id, timepoint, satisfaction, recommend, effect_felt, pain, changed_points, submitted_at)
      VALUES (
        v_review_id, 'day0',
        (v_chk->>'satisfaction')::smallint,
        (v_chk->>'recommend')::smallint,
        (v_chk->>'effect_felt')::smallint,
        (v_chk->>'pain')::smallint,
        CASE WHEN jsonb_typeof(v_chk->'changed_points') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_chk->'changed_points')) ELSE NULL END,
        now()
      )
      ON CONFLICT (review_id, timepoint) DO UPDATE
        SET satisfaction = EXCLUDED.satisfaction, recommend = EXCLUDED.recommend,
            effect_felt = EXCLUDED.effect_felt, pain = EXCLUDED.pain,
            changed_points = EXCLUDED.changed_points, submitted_at = now();

      -- 7f. ★트랙A 예약 적재(§6.4 FIX-3): day0 가 있고 visited_on_precision='exact' 인 경우만
      --      week1/month1/month4 3행. recipient_id = diaries.profile_id(=후기 author 명함, FK·RLS 정합).
      --      ★0302: 관대 모드(v_lenient)면 트랙A 예약 + day0 상대 일정(d.visited_on + tp.days) 전체 스킵.
      --             (precision='unknown' 또는 visited_on NULL → day0 절대일정 산출 불가 → 미예약.)
      --             기존 'exact' 단정(d.visited_on_precision='exact')과 v_lenient 가드로 이중 차단.
      IF NOT v_lenient THEN
        INSERT INTO public.scheduled_notification
          (recipient_id, kind, review_id, visit_id, timepoint, fire_after, message, url)
        SELECT d.profile_id, 'review_checkin', pr.id, d.id, tp.timepoint,
               d.visited_on + tp.days, tp.message,
               '/reviews/' || pr.id || '/checkins?t=' || tp.timepoint
          FROM public.procedure_reviews pr
          JOIN public.diaries d ON d.id = pr.visit_id
          CROSS JOIN (VALUES ('week1',  interval '7 days',   '시술 1주 후기를 남겨주세요'),
                             ('month1', interval '30 days',  '시술 1달 후기를 남겨주세요'),
                             ('month4', interval '120 days', '시술 4달 후기를 남겨주세요'))
                   AS tp(timepoint, days, message)
         WHERE pr.id = v_review_id
           AND d.visited_on_precision = 'exact'
           AND d.visited_on IS NOT NULL
        ON CONFLICT (review_id, timepoint) WHERE kind = 'review_checkin' DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_visit_id, v_review_ids;
END;
$function$;

-- GRANT 재확인(시그니처 동일 → 기존 GRANT 유지되나 명시 재부여).
GRANT EXECUTE ON FUNCTION public.create_visit_with_entries(
  uuid, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean, jsonb, jsonb) TO authenticated;

COMMIT;
