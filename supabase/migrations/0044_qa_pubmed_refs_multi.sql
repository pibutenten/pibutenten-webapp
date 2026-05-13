-- 0044: qas.pubmed_ref (단일) → pubmed_refs (jsonb[] 멀티) 전환
-- 기존 컬럼 pubmed_ref는 호환성 위해 일단 유지. UI/API는 점진적으로 pubmed_refs 전용으로.

-- 1) 새 컬럼: pubmed_refs jsonb[]  (기본 빈 배열)
ALTER TABLE qas
  ADD COLUMN IF NOT EXISTS pubmed_refs jsonb[] NOT NULL DEFAULT ARRAY[]::jsonb[];

-- 2) 기존 단일 pubmed_ref → pubmed_refs[0]로 백필 (NOT NULL이고 비어있는 경우만)
UPDATE qas
SET pubmed_refs = ARRAY[pubmed_ref]::jsonb[]
WHERE pubmed_ref IS NOT NULL
  AND array_length(pubmed_refs, 1) IS NULL;

-- 3) search_qas_scored RPC 응답에 pubmed_refs 포함
-- 기존 시그니처 유지 + 응답 컬럼만 확장 — UI에서 점진적으로 둘 다 읽다가 pubmed_refs로 통일
-- (실제 RPC 본문은 별도 마이그레이션에서 갱신 — 지금은 컬럼만 신설하고 UI가 직접 select 가능하도록)

-- 4) 통계용 인덱스 (선택) — 멀티 ref 카운트 검색 시
CREATE INDEX IF NOT EXISTS idx_qas_pubmed_refs_nonempty
  ON qas ((array_length(pubmed_refs, 1)))
  WHERE array_length(pubmed_refs, 1) > 0;
