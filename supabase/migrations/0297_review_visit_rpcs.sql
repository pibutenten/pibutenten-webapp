-- 0297_review_visit_rpcs.sql
-- 후기·시술일기 통합 Phase 2 — 백엔드 RPC 계층 (dormant)
-- 정본 계획서 §3 (review-diary-unification-master-plan.md) 명세 그대로.
--
-- SECURITY DEFINER RPC 5종. 호출하는 UI/API 라우트 없음(전부 dormant) → 라이브 무영향.
--   1) create_visit_with_entries — visit + diary_procedures + procedure_reviews 원자 생성
--      (diary_linked day0 review_checkin + 트랙A scheduled_notification 예약 포함).
--      ★F3(2026-06-27 야간 원장 최종결정)으로 D-H 반전: diary_linked 후기도 is_public=true 허용.
--        공개면 cards(type=review,category=review) + review_summary 앵커 lazy 생성 후 card_id 세팅
--        (create_procedure_review 본문 재사용). day0 checkin·트랙A 는 diary_linked 전제로 공개/비공개 공통.
--      ★의존성(Phase 3 API): 공개 시계열 후기는 upsert_review_checkin 롤업이 결론칸을 사후 변동시키므로,
--        그 호출부(/api/reviews/checkins)가 revalidatePath('/reports/{en}' + family) 온디맨드 재검증을
--        반드시 수행해야 ISR·JSON-LD aggregateRating stale 이 해소된다. 본 RPC 책임 아님(API 레이어).
--   2) upsert_review_checkin    — review_checkin UPSERT + 결론칸 롤업.
--   3) update_visit             — diaries 본문 전체 덮어쓰기(자식 미동기화, D-J).
--   4) delete_visit            — 연결 후기 standalone 전환 + 트랙A 예약 cancel + 일기 삭제(D-I/FIX-1).
--   5) unpublish_review        — cards soft-delete + procedure_reviews.is_public=false 원자(§3.5/Q10).
--
-- 권한 패턴은 현행 create_diary / create_procedure_review / update_procedure_review 본문을
--   pg_get_functiondef 로 확인해 재사용(명함 소유검증 42501, search_path 고정).
-- 이 파일은 firing(cron)·notification kind 추가를 포함하지 않는다(P4/P5).

BEGIN;

-- ============================================================
-- (1) create_visit_with_entries — 통합 작성 (visit + 시술목록 + 후기 + day0)
--     create_diary 확장. §3.2 명세. D-C(procedures_empty 면제)·D-E(visit_id 동일 트랜잭션)·
--     F3(D-H 반전: diary_linked 공개 허용 — is_public=true 면 카드/앵커 lazy 생성)·D-J·트랙A 적재(§6.4 FIX-3).
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
BEGIN
  -- 1. 명함 소유검증 (create_diary 계승).
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_profile_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized_profile' USING ERRCODE = '42501';
  END IF;

  -- 2. visited_on 범위 + precision CHECK(이중 방어).
  IF p_visited_on > CURRENT_DATE THEN RAISE EXCEPTION 'visited_on_future' USING ERRCODE = '22023'; END IF;
  IF p_visited_on < DATE '2000-01-01' THEN RAISE EXCEPTION 'visited_on_too_old' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_visited_on_precision, 'exact') NOT IN ('exact','season','half','year') THEN
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

  -- 5. diaries INSERT(기존 + 신규 컬럼). NULLIF 계승.
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
      ON CONFLICT (review_id, timepoint) WHERE kind = 'review_checkin' DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_visit_id, v_review_ids;
END;
$function$;

-- ============================================================
-- (2) upsert_review_checkin — 시계열 저장 + 결론칸 롤업. §3.3 명세 그대로.
--     revalidate 는 API 레이어 소관(본 RPC 아님). visit_id/source 는 절대 변경하지 않음.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_review_checkin(
  p_review_id       bigint,
  p_timepoint       text,
  p_satisfaction    smallint DEFAULT NULL,
  p_recommend       smallint DEFAULT NULL,
  p_effect_felt     smallint DEFAULT NULL,
  p_pain            smallint DEFAULT NULL,
  p_changed_points  text[]   DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_author uuid; v_checkin_id bigint;
BEGIN
  SELECT author_id INTO v_author FROM public.procedure_reviews WHERE id = p_review_id;
  IF v_author IS NULL THEN RAISE EXCEPTION 'review_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_author AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_timepoint NOT IN ('day0','week1','month1','month4') THEN
    RAISE EXCEPTION 'invalid_timepoint' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.review_checkin
    (review_id, timepoint, satisfaction, recommend, effect_felt, pain, changed_points, submitted_at)
  VALUES (p_review_id, p_timepoint, p_satisfaction, p_recommend, p_effect_felt, p_pain, p_changed_points, now())
  ON CONFLICT (review_id, timepoint) DO UPDATE
    SET satisfaction = EXCLUDED.satisfaction, recommend = EXCLUDED.recommend,
        effect_felt = EXCLUDED.effect_felt, pain = EXCLUDED.pain,
        changed_points = EXCLUDED.changed_points, submitted_at = now()
  RETURNING id INTO v_checkin_id;

  -- 결론칸 롤업: 만족도·추천=최신 시점, 통증=day0.
  UPDATE public.procedure_reviews pr SET
    satisfaction = COALESCE(
      (SELECT satisfaction FROM public.review_checkin
        WHERE review_id = p_review_id AND satisfaction IS NOT NULL
        ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.satisfaction),
    recommend = COALESCE(
      (SELECT recommend FROM public.review_checkin
        WHERE review_id = p_review_id AND recommend IS NOT NULL
        ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.recommend),
    pain = COALESCE(
      (SELECT pain FROM public.review_checkin WHERE review_id = p_review_id AND timepoint = 'day0'),
      pr.pain),
    updated_at = now()
  WHERE pr.id = p_review_id;

  RETURN v_checkin_id;
END;
$function$;

-- ============================================================
-- (3) update_visit — diaries 본문 전체 덮어쓰기. §3.4(FIX-8). 자식 후기·day0 미생성(D-J).
--     전체 clinic 컬럼 + visited_on_precision 까지 명시 덮어쓰기(부분 NULL 덮어쓰기 금지).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_visit(
  p_visit_id             bigint,
  p_visited_on           date,
  p_visited_on_precision text,
  p_clinic_id            bigint,
  p_clinic_name          text,
  p_clinic_addr          text,
  p_clinic_tel           text,
  p_clinic_x             double precision,
  p_clinic_y             double precision,
  p_clinic_home          text,
  p_clinic_kakao         text,
  p_doctor_name          text,
  p_manager_name         text,
  p_diary_body           text,
  p_total_price          int,
  p_is_complete          boolean
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_owner uuid;
BEGIN
  -- 명함 소유검증.
  SELECT profile_id INTO v_owner FROM public.diaries WHERE id = p_visit_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'visit_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_owner AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- visited_on 범위 + precision + diary_body 길이(create_visit_with_entries 와 동일 가드).
  IF p_visited_on > CURRENT_DATE THEN RAISE EXCEPTION 'visited_on_future' USING ERRCODE = '22023'; END IF;
  IF p_visited_on < DATE '2000-01-01' THEN RAISE EXCEPTION 'visited_on_too_old' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_visited_on_precision, 'exact') NOT IN ('exact','season','half','year') THEN
    RAISE EXCEPTION 'invalid_visited_on_precision' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_diary_body) > 400 THEN RAISE EXCEPTION 'diary_body_too_long' USING ERRCODE = '22001'; END IF;

  -- 본문 전체 덮어쓰기(자식 동기화·day0·트랙A 적재 없음 — D-J).
  UPDATE public.diaries SET
    visited_on           = p_visited_on,
    visited_on_precision = COALESCE(p_visited_on_precision, 'exact'),
    clinic_id            = p_clinic_id,
    clinic_name          = NULLIF(p_clinic_name, ''),
    clinic_addr          = NULLIF(p_clinic_addr, ''),
    clinic_tel           = NULLIF(p_clinic_tel, ''),
    clinic_x             = p_clinic_x,
    clinic_y             = p_clinic_y,
    clinic_home          = NULLIF(p_clinic_home, ''),
    clinic_kakao         = NULLIF(p_clinic_kakao, ''),
    doctor_name          = NULLIF(p_doctor_name, ''),
    manager_name         = NULLIF(p_manager_name, ''),
    diary_body           = NULLIF(p_diary_body, ''),
    total_price          = p_total_price,
    is_complete          = COALESCE(p_is_complete, true),
    updated_at           = now()
  WHERE id = p_visit_id;

  RETURN p_visit_id;
END;
$function$;

-- ============================================================
-- (4) delete_visit — 일기 단건 삭제(★v1 필수, D-I/FIX-1). §3.4.
--     (1)소유검증 (2)연결 후기 standalone 전환 (2b)트랙A pending 예약 cancel (3)일기 삭제.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_visit(p_visit_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_owner uuid; v_review_ids bigint[];
BEGIN
  -- (1) 명함 소유검증.
  SELECT profile_id INTO v_owner FROM public.diaries WHERE id = p_visit_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'visit_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_owner AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- (2) 연결 후기 standalone 전환 + 연결 끊기(CHECK 위반 없는 단일 UPDATE).
  --     source='standalone' AND visit_id IS NULL 동시 성립 → source_link_chk 통과.
  --     review_checkin 은 review_id CASCADE 로 보존(고아 시계열은 standalone 추이로 잔존).
  WITH upd AS (
    UPDATE public.procedure_reviews
       SET source             = 'standalone',
           date_precision     = 'exact',
           visit_id           = NULL,
           diary_procedure_id = NULL,
           updated_at         = now()
     WHERE visit_id = p_visit_id
    RETURNING id
  )
  SELECT array_agg(id) INTO v_review_ids FROM upd;

  -- (2b) ★트랙A 잔여 예약 정리(§3.4 (2b)·§6.3 불변식, line 1046(d)). 후기를 '전환'만 하므로
  --      review_id CASCADE 는 미발동이나, 트랙A 행은 §6.4 FIX-3 적재 시 visit_id(=일기)도 함께
  --      채워지므로 그대로 두면 아래 (3) DELETE FROM diaries 의 visit_id ON DELETE CASCADE 가
  --      이 행들을 물리 삭제해 line 1046(d) 의 "예약 → status='cancelled' 로 보존" 검증과 어긋난다.
  --      → review_id 기준으로 pending review_checkin 예약을 cancelled 로 끊으면서 visit_id 도 NULL 로
  --        떼어, (3) 의 visit_id CASCADE 대상에서 제외하고 cancelled 상태로 보존한다(review_id 로 회수).
  --        checkin 행 자체는 review_id CASCADE 미발동으로 '추이 잔존'. (예약만 차단·보존, line 1029.)
  IF v_review_ids IS NOT NULL THEN
    UPDATE public.scheduled_notification s
       SET status   = 'cancelled',
           visit_id = NULL
     WHERE s.kind = 'review_checkin'
       AND s.status = 'pending'
       AND s.review_id = ANY(v_review_ids);
  END IF;

  -- (3) 일기 삭제. 이 시점엔 연결 후기 0건이라 FK SET NULL 발동 대상 없음.
  --     diary_procedures 는 diary_id CASCADE, 잔여 scheduled_notification(diary_incomplete 등
  --     visit_id 보유분)은 visit_id CASCADE 로 삭제. (트랙A 예약은 (2b)에서 visit_id 를 떼어
  --     CASCADE 대상에서 빠지고 cancelled 로 보존됨.)
  DELETE FROM public.diaries WHERE id = p_visit_id;
END;
$function$;

-- ============================================================
-- (5) unpublish_review — 공개 철회. cards soft-delete + procedure_reviews.is_public=false 원자.
--     §3.5/Q10/MAJOR7. p_shortcode 또는 p_card_id 로 식별. 권한: 작성자 묶음 또는 admin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.unpublish_review(
  p_shortcode text   DEFAULT NULL,
  p_card_id   bigint DEFAULT NULL
) RETURNS bigint  -- 내린 card_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_card_id bigint; v_author uuid; v_is_admin boolean;
BEGIN
  IF p_shortcode IS NULL AND p_card_id IS NULL THEN
    RAISE EXCEPTION 'missing_identifier' USING ERRCODE = '22023';
  END IF;

  -- 대상 카드 조회(review 타입, 살아있는 카드만).
  SELECT c.id, c.author_id INTO v_card_id, v_author
  FROM public.cards c
  WHERE c.type = 'review'::qa_type
    AND c.deleted_at IS NULL
    AND ( (p_card_id   IS NOT NULL AND c.id = p_card_id)
       OR (p_shortcode IS NOT NULL AND c.shortcode = p_shortcode) )
  LIMIT 1;
  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 권한: 작성자 묶음(auth.uid() 소유 명함) 또는 admin (update_procedure_review 패턴 계승).
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_author AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 원자: 카드 soft-delete + 후기 비공개. public_needs_card 는 card_id 참조만 보므로 위반 없음.
  UPDATE public.cards
     SET deleted_at = now(), updated_at = now()
   WHERE id = v_card_id;

  UPDATE public.procedure_reviews
     SET is_public = false, updated_at = now()
   WHERE card_id = v_card_id;

  RETURN v_card_id;
END;
$function$;

-- ============================================================
-- GRANT EXECUTE — 전부 authenticated(쓰기 RPC는 RLS 우회용 SECURITY DEFINER).
-- ============================================================
GRANT EXECUTE ON FUNCTION public.create_visit_with_entries(
  uuid, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_review_checkin(
  bigint, text, smallint, smallint, smallint, smallint, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_visit(
  bigint, date, text, bigint, text, text, text, double precision, double precision,
  text, text, text, text, text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_visit(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_review(text, bigint) TO authenticated;

COMMIT;
