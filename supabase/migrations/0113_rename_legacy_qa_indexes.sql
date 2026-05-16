-- 0113_rename_legacy_qa_indexes.sql
--
-- 옛 `qas`/`qa_*` 명명 인덱스를 `cards`/`card_*` 명명으로 cosmetic rename.
-- 0065 의 `ALTER TABLE qas RENAME TO cards` 가 인덱스도 자동 cards 에 attach 했으나
-- 인덱스 이름은 옛 그대로 남음. 0078 에서 트리거/함수만 rename 했고 인덱스는 누락.
--
-- 동작:
--   - ALTER INDEX ... RENAME TO ... — exclusive lock 잠깐 (보통 < 1초)
--   - IF EXISTS — 인덱스가 자동 DROP 됐다면 noop
--
-- 안전성:
--   - 인덱스 이름 변경은 옵티마이저 선택에 영향 X (인덱스 정의는 그대로)
--   - 다만 application 코드가 인덱스 이름을 hint 로 사용 중이면 영향 — 그런 사례 없음 확인 필요

DO $$
DECLARE
  rename_pairs text[][] := ARRAY[
    -- cards 테이블 옛 인덱스
    ARRAY['qas_published_idx', 'cards_published_idx'],
    ARRAY['qas_keywords_gin_idx', 'cards_keywords_gin_idx'],
    ARRAY['qas_question_trgm_idx', 'cards_question_trgm_idx'],
    ARRAY['qas_answer_trgm_idx', 'cards_answer_trgm_idx'],
    ARRAY['qas_doctor_idx', 'cards_doctor_idx'],
    ARRAY['qas_video_idx', 'cards_video_idx'],
    ARRAY['qas_status_idx', 'cards_status_idx'],
    ARRAY['qas_type_idx', 'cards_type_idx'],
    ARRAY['qas_author_idx', 'cards_author_idx'],
    ARRAY['qas_pick_idx', 'cards_pick_idx'],
    ARRAY['idx_qas_category', 'cards_category_idx'],
    ARRAY['qas_article_slug_uidx', 'cards_post_slug_uidx'],
    ARRAY['qas_type_doctor_idx', 'cards_type_doctor_idx'],
    ARRAY['idx_qas_shortcode_unique', 'cards_shortcode_uidx'],
    ARRAY['idx_qas_author_identity_id', 'cards_author_identity_id_idx'],
    ARRAY['idx_qas_pubmed_refs_nonempty', 'cards_pubmed_refs_nonempty_idx'],
    -- card_saves
    ARRAY['idx_qa_saves_qa', 'card_saves_card_idx'],
    -- card_views
    ARRAY['qa_views_created_at_idx', 'card_views_created_at_idx'],
    ARRAY['qa_views_qa_id_idx', 'card_views_card_id_idx'],
    -- card_impressions
    ARRAY['idx_qa_impressions_qa_id_created', 'card_impressions_card_id_created_idx'],
    ARRAY['idx_qa_impressions_created', 'card_impressions_created_idx'],
    -- card_shares
    ARRAY['qa_shares_created_at_idx', 'card_shares_created_at_idx']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY rename_pairs
  LOOP
    BEGIN
      EXECUTE format('ALTER INDEX IF EXISTS public.%I RENAME TO %I', pair[1], pair[2]);
    EXCEPTION WHEN OTHERS THEN
      -- 이미 새 이름으로 존재하거나 둘 다 없는 경우 — 무시
      RAISE NOTICE 'rename % → % skipped: %', pair[1], pair[2], SQLERRM;
    END;
  END LOOP;
END $$;
