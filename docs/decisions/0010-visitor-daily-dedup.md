# 0010. Visitor 1일 1방문 KST dedup

- **Status**: Accepted
- **Date**: 2026-05-20 (저녁), 마이그레이션 0144
- **Related**: 0142 (metrics 통합), 0143 (admin KPI RPC 5개 통일), 0144 (visitor dedup), 0157 (site_visits 테이블)

## Context

관리자 대시보드의 "방문자" 지표 정의 결정 필요.

### 옵션 1 — Raw count (모든 visit 누적)
- 한 사람이 하루 10번 들르면 visitor=10
- 문제: 활동 많은 사용자가 통계 왜곡 (방문자 ≠ 실제 사람 수)

### 옵션 2 — Unique session count
- 같은 session 안에서 1
- 문제: 모바일 / 데스크탑 다른 세션이면 +1 → 1명을 2명으로 카운트

### 옵션 3 — 1일 1방문 (KST 기준) — 네이버 카페 식
- 같은 사람 하루 여러 번 들러도 1
- 다음날 +1
- 비로그인은 (session × KST 날짜) 단위

## Decision

**옵션 3 채택** — "1일 1방문 (KST)".

### 구현 (마이그레이션 0144)

4개 RPC 모두 `COUNT(DISTINCT (visitor, KST_date))` 패턴 통일:
- `get_admin_kpi_inner`
- `get_users_kpi_inner`
- `get_top_visitors_inner`
- `get_top_cards_by_views_inner`

### 추가 정비 (0143)
대시보드 RPC 5개 전수 통일:
- KPI 방문자 = `card_impressions ∪ card_views` distinct visitor
- KPI 조회수 = `card_views` distinct visitor (한 사람이 펼침+좋아요+공유 모두 해도 1)
- 좋아요/저장 TOP = distinct user (toggle 이라 사실상 같지만 정책 명문화)
- 공유 TOP = distinct visitor
- 댓글 TOP = row count (활기 지표)
- 카드 활동 사용자 펼침 (닉네임 칩) = 같은 시간 윈도우 적용 → cnt 일치

### 회귀 대응 (0157, 2026-05-23)
**문제**: 알림 클릭으로 본인 카드 편집 (`/write/...`) 직접 진입 시 카드 view 이벤트 안 생성 → 미카운트.
- 사용자 보고 (이도영 원장): "카드 [지우기] 까지 했는데 방문자 TOP 에 안 잡혀"
- 진단: 24h 내 `card_impressions=0` / `card_views=0` / `card_likes=0` / `card_saves=0`

**해결**: 신규 `site_visits` 테이블
- 컬럼: `id bigserial / user_id uuid / session_id text / path text / created_at timestamptz`
- 3개 부분 인덱스
- RLS: admin SELECT + anon/authenticated INSERT
- `get_top_visitors_inner` + `get_admin_kpi_inner` RPC 의 events CTE 에 `site_visits` UNION 추가
- 미들웨어가 ONBOARDED_COOKIE set 직후 `pibutenten_visited` 쿠키 (24h, sameSite=lax) 가 없으면 `site_visits` INSERT 후 쿠키 set
- 1일 1회 INSERT (try/catch fail-safe — INSERT 실패해도 본 흐름 보존)

## Consequences

### 긍정
- 사용자 직관과 맞는 visitor 정의 ("오늘 본 사람 = 1")
- 네이버 카페·디스코드 등 친숙한 정책
- 0157 site_visits 확장으로 카드 view 없는 진입 (편집 페이지 등) 도 카운트
- KPI 5개 RPC 패턴 일치 → mismatch 사라짐

### 부정
- KST 기준이라 자정 직후 활동이 새 날로 카운트 (해외 사용자 거의 없어 무관)
- site_visits INSERT 가 미들웨어 slow path 부담 (24h 1회라 미미)
- 비로그인 (session) ↔ 로그인 (user) 전환 시 같은 사람이 2명으로 카운트 가능 (해결 안 함, 비용 대비 효과 낮음)

### 검증 결과 (적용 직후 24h 실측)
- KPI 방문자: 2 → **8** (배정민/피부텐텐 → 반짝이/개발자/배스킨/김종식/해파리냉채/비로그인 포함)
- KPI 조회수: 72 (raw) → **8** (distinct visitor)
- "쥬브젠" 카드 TOP cnt: 6 → **5** (정확화)
- 같은 카드 닉네임 칩: 14명 (전체 기간) → **5명** (24h 윈도우 일치)
