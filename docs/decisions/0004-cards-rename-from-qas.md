# 0004. cards 테이블 리네임 (구 qas)

- **Status**: Accepted
- **Date**: 2026-05 (마이그레이션 0065)
- **Related**: 0065 (테이블 리네임), 0066~0078 (RPC/트리거/뷰 cascading 리네임), 0070/0072 (search_qas_scored → search_cards_scored)

## Context

초기 스키마는 `qas` 테이블이 Q&A 만 담당. 이후 일반 포스팅·외부 링크 공유·피부 일기·끄적끄적 등 다양한 카테고리가 추가되면서 "Q&A" 라는 이름이 더 이상 정확하지 않게 됨.

후보 이름:
- `posts` — 일반적이지만 Q&A 의미 약함
- `articles` — type 으로 이미 사용 (이후 0076 에서 폐기)
- `cards` — UI 의 "카드" 표시 단위와 일치

## Decision

**`qas` → `cards` 전면 리네임 (0065)**.

- 테이블·인덱스·트리거·RPC·RLS 정책·storage 버킷 모두 cascading 리네임
- 코드 변수명·파일명도 점진적 청소 (2026-05-16 3rd `10bcb48` 8 파일 일괄)
- `posted_as` enum 도 cards 와 어울리지 않아 0090 에서 폐기 (Persona 시스템 폐기)

### type 컬럼 정리 (0076)
- `qa` / `post` 만 유지
- `article` 폐기

### category 컬럼 (Phase 5.1)
- 6분류: `qa` / `tip` / `diary` / `ask` / `link` / `doodle` (doodle 0108 추가)

## Consequences

### 긍정
- 의미 명확성 회복 (Q&A 만이 아닌 "카드" 단위 통합 콘텐츠)
- UI 와 DB 용어 일치
- 향후 다른 카테고리 추가도 자연

### 부정 (마이그레이션 부담)
- 매우 큰 리네임 작업 (0065~0078 약 14개 마이그레이션)
- 코드 변수명·주석·파일명 청소가 길게 이어짐 (~6개월)
- 매뉴얼 sync 누락 위험 (RLS 정책명 cosmetic 리네임 0099 까지 이어짐)

### 학습
- DB 리네임은 단순 SQL 1줄이 아니라 cascading 영향이 넓음 (RPC·뷰·트리거·정책)
- 코드 측 변수명 청소를 동반 commit 으로 묶지 않으면 오랫동안 누더기로 남음
- 이후 새 테이블 명명 시 **확장성 고려 우선** (예: rating 시스템도 처음에 별점 폐기 0094 까지 이어짐)
