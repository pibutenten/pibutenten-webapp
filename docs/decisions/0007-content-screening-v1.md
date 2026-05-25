# 0007. 콘텐츠 자동 검수기 v1

- **Status**: Accepted
- **Date**: 2026-05-19 (보안 2.5차 점검 묶음 E, `604b18f`)
- **Related**: 마이그레이션 0139 (cards.screening_flags), `src/lib/content-screening.ts`, `src/lib/content-screening-dict.ts`, `src/components/card-editor/CardEditor.tsx`

## Context

회원 글쓰기 (특히 일반 사용자) 가 의료법·약사법 위반 가능 콘텐츠를 생성할 위험.

### 법적 근거
- **의료법 §56②** 14금지: 환자 유인, 거짓·과장 광고, 비방, 비교, 환자 후기 등
- **약사법 §68**: 의약품 거짓·과장 광고
- **광고심의위 가이드**: 환자 후기·전후사진·치료효과 보장 등

### 옵션 1 — 사후 신고 의존
- `content_reports` 테이블에 사용자 신고 접수 (0137)
- 운영자가 검토 후 처리
- 문제: 신고 전까지 위반 콘텐츠가 노출됨

### 옵션 2 — 강한 AI 검수 (Claude 기반)
- 매 글마다 Claude API 호출
- 비용 폭주 (월 수천~수만건 글 × 토큰)
- 베타 규모에 과함

### 옵션 3 — 키워드 사전 기반 자동 검수 v1
- 의료법 §56② 14금지 + 약사법 §68 + 환자후기 키워드 사전
- 매칭 점수 합산 → 임계점 초과 시 `pending_review` 상태로 보관
- 의사·관리자 자동 통과 (직업 검증 신뢰)
- 자살/자해 키워드 별도 처리 (109/1577-0199/1388 안내)

## Decision

**옵션 1 + 옵션 3 병행 채택**.

### 구현
- **`src/lib/content-screening.ts`** — `screenContent(text, role)` 함수
  - 의사 (`role='doctor'`) / 관리자 (`role='admin'`) 자동 통과
  - 일반 회원: 키워드 사전 매칭 → 점수 합산 → 임계점 5점 (보수적)
  - 초과 시 `cards.status = 'pending_review'` 설정 + `screening_flags` 배열에 매칭된 카테고리 기록

- **`src/lib/content-screening-dict.ts`** — 키워드 사전
  - 의료법 §56② 14금지 카테고리별
  - 약사법 §68 카테고리
  - 환자후기 키워드
  - 자살/자해 키워드 (별도 처리)

- **마이그레이션 0139** — `cards.screening_flags TEXT[]` + `pending_review` 부분 인덱스

- **`/api/articles` POST/PUT** — `screenContent()` 호출 → flags 저장

- **자살/자해 별도 처리** — CardEditor 에서 감지 시 안전 메시지 모달 1회 표시:
  - 109 (자살예방상담전화)
  - 1577-0199 (한국생명의전화)
  - 1388 (청소년상담전화)

### 신고 시스템 병행 (0137)
- `content_reports` 테이블 (INSERT anon, SELECT/UPDATE admin)
- `/report` 페이지 + `ReportForm` + `POST /api/reports`

## Consequences

### 긍정
- 보수적 임계점 (5점) → false positive 부담 낮음
- 의사·관리자 자동 통과 → 검수 부담 거의 없음
- 자살/자해는 별도 분기로 사용자 안전 신호 즉시 노출
- 비용 0 (Claude API 미사용)

### 부정
- 키워드 사전이 완벽하지 않음 — 검수 통과 후 위반 가능
- 위반 사례 패턴이 변화하면 사전 업데이트 필요 (운영 부담)
- v1 단순 매칭 → 문맥 이해 부족 (예: "환자후기" 단어가 부정적 맥락에서 쓰여도 매칭)

### 운영 점검 (1주 후)
- 거짓양성 비율 점검
- 임계점·키워드 사전 조정
- WriteClient 의 자살 모달 통합 (현재 CardEditor 만 적용) — `ROADMAP.md` Now 추적

### 향후 (v2 검토)
- 트래픽 증가 시 Claude API 부분 도입 (의심 점수 3~4점 구간만)
- 의료광고 사전심의 도입 시 자동 호출 연계
