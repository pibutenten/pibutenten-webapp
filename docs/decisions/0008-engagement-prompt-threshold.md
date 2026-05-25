# 0008. 비로그인 흥미 점수 임계점 (v3 = 15)

- **Status**: Accepted (Supersedes v1=10, v2=6)
- **Date**: 2026-05-20 (v1), 2026-05-22 (v2 `798d9ad`), 2026-05-23 (v3 `c69d445`)
- **Related**: `src/lib/engagement-score.ts`, `src/components/EngagementPromptDialog.tsx`, `src/components/EngagementPromptListener.tsx`

## Context

비로그인 사용자가 사이트에서 충분히 가치를 경험한 후 회원 가입을 권유하는 모달.

### 문제
- 너무 일찍 권유 → 가입 거부 + 이탈
- 너무 늦게 권유 → 가입 기회 손실

### 측정 가능한 신호
| 이벤트 | 점수 후보 |
|---|---|
| 카드 view | 가장 약한 신호 |
| 카드 펼침 | 명백한 관심 |
| 영상 보러가기 | 깊은 관심 |
| 검색 | 명백한 의도 |
| 키워드 칩 / 태그 클릭 | 탐색 의지 |
| navigate (다른 글로 이동) | 깊이 |
| 머묾 시간 (5분 / 10분) | 시간 투자 |

## Decision

**버전별 진화**:

### v1 = 10 (2026-05-20 초안)
- 너무 빠르게 trigger 됨 (카드 펼침 5번이면 도달)
- 사용자 충분한 가치 경험 전에 권유

### v2 = 6 (2026-05-22 `798d9ad`)
- v1 보다 더 빠름 (테스트 목적)
- 사용자 보고: "너무 빠르다"

### v3 = 15 (2026-05-23 `c69d445`) — **현재**
- 충분한 체험 후 권유 → 가입 수락 가능성 ↑
- 대표 도달 경로:
  - 카드 5개 깊이 (view +1 × 5 = 5) + 검색 1회 (+3) + 펼침 1회 (+2) + nav 1회 (+1) + 추가 view 2 (+2) + 펼침 1 (+2) = 15
  - 5분 머묾 (+5) + 카드 3 (+3) + 영상 (+3) + 펼침 (+2) + chip (+1) + nav (+1) = 15
  - 10분 머묾 (+5+5=10) + 검색 (+3) + 카드 (+1) + 펼침 (+2) = 21 (충분)

### 점수표 (v3 확정)
```
카드 view: +1
카드 펼침: +2
영상 보러가기: +3
검색: +3
키워드 칩 클릭: +1
태그 클릭: +2
navigate: +1
5분 머묾: +5
10분 머묾: +5
```

### 모달 노출 가드
- `sessionStorage` 가드: 한 세션 1회
- `localStorage` dismiss timestamp + **일주일 후 재노출**
- `EngagementPromptListener.tsx` 가 layout.tsx mount 시 자동 5분/10분 타이머 + custom event 수신

### 트리거 위치
- `useCardViewer.recordView` → card-view
- `Card.tsx` 펼침 → card-expand
- `Card.tsx` 영상 → video-click
- `SearchBar.onSubmit` → search

## Consequences

### 긍정
- 사용자 충분한 가치 경험 후 권유 → 가입 동기 강함
- 일주일 dismiss timestamp → 거부 사용자도 짧은 시간 내 재노출 안 됨
- 자동 timer + 행동 점수 hybrid → 둘 중 빠른 쪽 trigger

### 부정
- 임계점이 너무 보수적이면 권유 기회 손실
- 점수 가중치 결정에 객관 근거 부족 (운영 데이터 누적 후 재조정 필요)
- 모달 카피 4종 (reason 별: time / search / card-expand / video) 유지 부담

### 운영 모니터링 (예정)
- 모달 노출 횟수 vs 가입 전환율
- 거부 후 일주일 재노출 시 전환율
- 조정 후 v4 검토 시점: 가입 전환율 5% 미달 or 거부율 80% 초과
