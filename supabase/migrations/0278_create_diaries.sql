-- 0278_create_diaries.sql
-- 시술 기록(개인 비공개 "시술일기") 테이블 신설. 카드와 무관한 별개 비공개 데이터.
--   부모 diaries(방문 1건) + 자식 diary_procedures(받은 시술 N개).
--   작성자 = profile_id (ADR 0014 — 비공개 소유 데이터, author_id 는 공개 콘텐츠 전용).
--   전체 비공개: RLS ENABLE + anon REVOKE + authenticated 본인 명함 단위 정책. 운영자(admin) 열람 정책 없음(완전 비공개).
--   시술명은 tag_dictionary(ko) FK 연결(미지 시술명은 procedure_ko 텍스트만). 일기 본문 ≤400자.

BEGIN;

-- ─── 부모: 방문 1건 ──────────────────────────────────────────────────
CREATE TABLE public.diaries (
  id            bigserial        PRIMARY KEY,
  profile_id    uuid             NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_on    date             NOT NULL,                          -- 시술 받은 날짜

  -- 병원 스냅샷 (clinics FK nullable + 텍스트 병행 — 직접 수정 대비)
  clinic_id     bigint           REFERENCES public.clinics(id) ON DELETE SET NULL,
  clinic_name   text,
  clinic_addr   text,
  clinic_tel    text,
  clinic_x      double precision,                                   -- 경도(clinics.x_pos 복사)
  clinic_y      double precision,                                   -- 위도(clinics.y_pos 복사)

  doctor_name   text,                                               -- 원장님(자유 입력)
  manager_name  text,                                               -- 실장님(자유 입력)

  diary_body    text             CHECK (char_length(diary_body) <= 400),  -- 비공개 메모 ≤400

  created_at    timestamptz      NOT NULL DEFAULT now(),
  updated_at    timestamptz      NOT NULL DEFAULT now()
);

-- ─── 자식: 받은 시술 1개 ─────────────────────────────────────────────
CREATE TABLE public.diary_procedures (
  id            bigserial        PRIMARY KEY,
  diary_id      bigint           NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,

  procedure_ko  text             NOT NULL CHECK (char_length(procedure_ko) <= 100),  -- 표시 시술명
  tag_dict_ko   text             REFERENCES public.tag_dictionary(ko) ON UPDATE CASCADE ON DELETE SET NULL, -- taxonomy 연결(있을 때만)

  unit_text     text             CHECK (char_length(unit_text) <= 100),   -- 용량(예: 300단위)
  price         integer          CHECK (price >= 0),                       -- 가격(원, 비공개)
  note          text             CHECK (char_length(note) <= 500),         -- 메모(비공개)

  sort_order    smallint         NOT NULL DEFAULT 0,
  created_at    timestamptz      NOT NULL DEFAULT now()
);

-- ─── 인덱스 ──────────────────────────────────────────────────────────
CREATE INDEX diaries_profile_visited_idx ON public.diaries (profile_id, visited_on DESC);  -- 내 일기 최신순
CREATE INDEX diaries_clinic_idx          ON public.diaries (clinic_id) WHERE clinic_id IS NOT NULL;  -- 병원별 집계(미래)
CREATE INDEX diary_procedures_diary_idx  ON public.diary_procedures (diary_id);             -- 부모-자식 JOIN
CREATE INDEX diary_procedures_tag_idx    ON public.diary_procedures (tag_dict_ko) WHERE tag_dict_ko IS NOT NULL;  -- 시술별 집계(미래)

-- ─── updated_at 트리거(기존 함수 재사용) ────────────────────────────
CREATE TRIGGER diaries_set_updated_at
  BEFORE UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS — 전체 비공개(본인 active 명함만) ───────────────────────────
ALTER TABLE public.diaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_procedures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.diaries          FROM anon;
REVOKE ALL ON public.diary_procedures FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diaries          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_procedures TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.diaries_id_seq          TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.diary_procedures_id_seq TO authenticated;

-- diaries 정책 4종 — 본인 명함 only
CREATE POLICY diaries_select_own ON public.diaries FOR SELECT
  USING (profile_id = COALESCE(current_active_profile_id(), auth.uid()));
CREATE POLICY diaries_insert_own ON public.diaries FOR INSERT
  WITH CHECK (profile_id = COALESCE(current_active_profile_id(), auth.uid()));
CREATE POLICY diaries_update_own ON public.diaries FOR UPDATE
  USING (profile_id = COALESCE(current_active_profile_id(), auth.uid()))
  WITH CHECK (profile_id = COALESCE(current_active_profile_id(), auth.uid()));
CREATE POLICY diaries_delete_own ON public.diaries FOR DELETE
  USING (profile_id = COALESCE(current_active_profile_id(), auth.uid()));

-- diary_procedures 정책 4종 — 부모 diary 소유권 경유
CREATE POLICY diary_procedures_select_own ON public.diary_procedures FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.profile_id = COALESCE(current_active_profile_id(), auth.uid())));
CREATE POLICY diary_procedures_insert_own ON public.diary_procedures FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.profile_id = COALESCE(current_active_profile_id(), auth.uid())));
CREATE POLICY diary_procedures_update_own ON public.diary_procedures FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.profile_id = COALESCE(current_active_profile_id(), auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.profile_id = COALESCE(current_active_profile_id(), auth.uid())));
CREATE POLICY diary_procedures_delete_own ON public.diary_procedures FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.diaries d WHERE d.id = diary_id AND d.profile_id = COALESCE(current_active_profile_id(), auth.uid())));

COMMIT;
