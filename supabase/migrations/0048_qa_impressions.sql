-- 0048: qa_impressions 테이블 + qas.impression_count 신설
-- 목적: 노출(impression) ≠ 조회(view) 분리
--   impression: 카드가 피드에 등장 (단순 mount, session 1회 dedup)
--   view:       실제 의도 신호 (5초 dwell + 동작, 펼침, 단독 진입, 영상 클릭)
--   engagement rate = view_count / impression_count

-- ─────────────────────────────────────────────────────────────
-- 1. qa_impressions 테이블 — qa_views와 유사 구조
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qa_impressions (
  id bigserial PRIMARY KEY,
  qa_id bigint NOT NULL REFERENCES public.qas(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 같은 세션의 같은 qa는 1회만 (UNIQUE)
  UNIQUE (qa_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_impressions_qa_id_created
  ON public.qa_impressions (qa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_impressions_created
  ON public.qa_impressions (created_at DESC);

-- RLS — 누구나 INSERT (anon 가능, 분석 목적), SELECT는 admin만
ALTER TABLE public.qa_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qa_impressions_insert_all ON public.qa_impressions;
CREATE POLICY qa_impressions_insert_all
  ON public.qa_impressions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS qa_impressions_select_admin ON public.qa_impressions;
CREATE POLICY qa_impressions_select_admin
  ON public.qa_impressions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        AND p.role IN ('admin', 'developer')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 2. qas.impression_count 컬럼 (denormalized cache, view_count와 동일 패턴)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.qas
  ADD COLUMN IF NOT EXISTS impression_count integer NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger — qa_impressions INSERT 시 qas.impression_count 자동 +1
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_qa_impression_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE qas
  SET impression_count = COALESCE(impression_count, 0) + 1
  WHERE id = NEW.qa_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_impressions_inc_count ON public.qa_impressions;

CREATE TRIGGER trg_qa_impressions_inc_count
AFTER INSERT ON public.qa_impressions
FOR EACH ROW
EXECUTE FUNCTION public.on_qa_impression_insert();
