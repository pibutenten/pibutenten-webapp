# 0014. profiles.id 참조 컬럼 명명 통일 — `profile_id` (콘텐츠는 `author_id` 유지)

- **Status**: Accepted
- **Date**: 2026-05-29
- **Related**: ADR 0001 (multi-profile identity), ADR 0011 (active identity 권한), ADR 0012 (명함 단위 완전 독립), CRITICAL-1 (2026-05-29 comments user_id → author_id 정정)
- **마이그레이션**: Phase 1 (본 ADR, commit `8af897a`) — 문서·hook. Phase 2 (마이그 0186, commit `f8d1c93`, 2026-05-29) — 적용 완료. Phase 3 (마이그 0187, commit `91477c2`, 2026-05-29) — 적용 완료. Phase 4 — 보류 (§6 참조).

---

## Context

`profiles.id` (명함 ID) 를 가리키는 컬럼 이름이 코드베이스 안에 다양하게 흩어져 있다. 2026-05-29 production DB 직접 조회로 확인된 현황:

- `author_id` — cards, comments
- `user_id` — activity_points, card_likes, card_saves, card_views, card_impressions, card_shares, comment_likes, daily_logins, site_visits (9개 테이블)
- `profile_id` — notification_preferences, push_subscriptions, search_logs (그리고 폐기된 doctor_accounts_deprecated)
- `actor_profile_id` — audit_logs
- `actor_id`, `recipient_id` — notifications (한 row 안에 둘 다 존재)
- `reporter_profile_id`, `resolved_by` — content_reports (한 row 안에 둘 다 존재)

이 중 `author_id` / `user_id` / `profile_id` 3가지는 **같은 `profiles.id` 를 가리키는 단순한 동의어** 인 경우가 많고, 그 외 (`actor_id` / `recipient_id` 등) 는 한 row 안에 두 역할이 공존하므로 분리가 정당하다.

2026-05-29 CRITICAL-1 사고가 정확히 이 명명 분산에서 비롯됐다. `/api/comments/[id]` PATCH·DELETE 라우트가 `comments` 테이블 (작성자 컬럼 = `author_id`) 을 다루면서 `user_id` 로 잘못 select 했고, 결과적으로 `ownerId` 가 항상 `null` 이 되어 본인 액션이 운영자 액션으로 audit 에 잘못 기록되는 silent 회귀가 발생했다.

또한 코드의 `user.id` (= `auth.users.id`, Supabase Auth 객체) 와 DB 의 `user_id` 컬럼 (= `profiles.id`) 가 **이름이 닮아 grep·코드 리뷰에서 즉시 구분되지 않는다**. 이번 사고 점검 중에도 `user_id` 검색하면 `auth_user_id` 결과가 다수 섞여 나와 분류 비용이 컸다.

세 학파 논의를 거쳐 (분리주의 — 도메인 의미 / 통일주의 — DDL 일관성 / 절충 — 책임 주체와 행위자 구분) **콘텐츠 책임 주체만 `author_id` 로 유지하고, 그 외 모든 명함 ID 참조는 `profile_id` 로 통일** 한다. `user_id` 라는 컬럼명은 신규 사용 금지.

---

## Decision

### 1. 사람을 가리키는 ID 3계층 (확정)

| 계층 | 컬럼 | 의미 | 사는 곳 |
|---|---|---|---|
| 인증 ID | `auth.users.id` | OAuth 로그인 단위. 한 사람당 1개. | `auth` 스키마 (Supabase 내부). 코드의 `user.id`. |
| 명함 ID | `profiles.id` | 활동 단위. 한 사람이 여러 명함 보유 가능 (회원 명함 + 의사 명함 + admin 명함). | `public.profiles` PK |
| 묶음 표시 | `profiles.auth_user_id` | 같은 사람의 명함끼리 같은 값 (첫 명함의 `id` = `auth.users.id`). FK 없음, 명명 약속. | `public.profiles` 컬럼 |

### 2. 컬럼 이름 규칙 (확정)

**(A) `profiles.id` 를 가리키는 컬럼 명명**

| 역할 | 컬럼 이름 | 사용 테이블 (확정 후) |
|---|---|---|
| 콘텐츠 책임 주체 | **`author_id`** | `cards`, `comments` |
| 그 외 명함 소유·행위자 | **`profile_id`** | 좋아요·저장·조회·노출·공유·댓글좋아요·일일로그인·방문통계·활동포인트·알림설정·푸시구독·검색로그 |
| 로그인 계정 (auth.users 가리킴) | **`auth_user_id`** | `profiles`, `audit_logs.actor_auth_user_id` |
| 한 row 에 둘 이상 등장 | **역할 접두사**: `actor_*`, `recipient_*`, `reporter_*`, `resolved_by` | `notifications`, `content_reports`, `audit_logs` |

**(B) 신규 사용 금지 컬럼명**: `user_id`

신규 테이블·신규 마이그레이션에서 `user_id` 컬럼 도입 금지. 이미 존재하던 `user_id` 컬럼 9개는 Phase 2 (0186) + Phase 3 (0187) 마이그로 2026-05-29 `profile_id` 로 RENAME 완료. `cards.author_id` / `comments.author_id` 는 Phase 4 보류 (§6).

### 3. `user_id` 가 아닌 `profile_id` 를 택한 이유

1. **`auth_user_id` 와 substring 안 겹침**: 한 글자도 같은 부분이 없어 `grep "profile_id"` 시 `auth_user_id` 가 섞이지 않는다. CRITICAL-1 같은 회귀의 원천 차단.
2. **코드의 `user.id` 와 명확히 구분**: 코드 어디서나 `user.id` 는 `auth.users.id` 의미. 컬럼명이 `user_id` 면 둘이 닮아 잘못된 비교 (`user_id === user.id`) 가 가끔 통과 (base profile 한정).
3. **multi-identity 도메인 정확 표현**: 이 시스템은 한 사람이 여러 명함을 갖는 multi-identity 구조라 "user" 보다 "profile" 이 의미 정확.
4. **이미 존재하는 `profile_id` 컬럼 (notification_preferences, push_subscriptions, search_logs) 과 정합**: 이미 4개 테이블이 이 패턴.

### 4. `author_id` 를 합치지 않은 이유

1. **콘텐츠 책임 주체 vs 행위자의 역할 차이**: `cards.author_id` 는 그 글의 의학·편집 책임 주체. `card_likes.profile_id` 는 그 글에 반응한 제3자. 같은 사람이 자기 글에 좋아요 누르면 한 row 안에 `author_id` 와 `profile_id` 가 둘 다 같은 UUID 로 등장 — **이 시점에 동의어가 아님이 증명됨**.
2. **카디널리티 차이**: 한 글에 author 는 영원히 1명, 좋아요는 한 글에 수천 개 누적 가능. 같은 이름으로 부르면 머릿속에서 두 종류가 뭉개진다.
3. **ON DELETE 정책 차이**: `author_id` 는 SET NULL (탈퇴 시 익명화, 글 보존). `profile_id` (인터랙션) 는 CASCADE (탈퇴 시 흔적 제거). 이름이 다르면 정책의 의미를 코드 읽을 때 자연스럽게 떠올린다.
4. **의료 도메인 신뢰성**: 의사 글의 author 는 곧 그 의학 정보의 법적·편집적 책임 주체. 명시 이름이 안전·법적으로 의미.

### 5. 신규 도입한 페어 (CLAUDE.md §5 동기화 표에 등재)

> **사람 ID 컬럼 명명 규칙 ↔ ADR 0014**: `author_id`(콘텐츠) / `profile_id`(그 외) / `auth_user_id`(로그인). `user_id` 신규 사용 금지. 한 row 에 둘 이상 등장 시 역할 접두사 (`actor_/recipient_/reporter_`).

### 6. 단계적 적용 — Phase 2~4

본 ADR 의 결정은 즉시 발효. production DB 의 9개 테이블 컬럼 RENAME 진행 상태:

- **Phase 2 (완료, 2026-05-29, commit `f8d1c93`, 마이그 0186)** — 인터랙션·통계 6 테이블: daily_logins, site_visits, activity_points, card_shares, card_views, card_impressions. RPC/RLS/index/FK 일괄 정합.
- **Phase 3 (완료, 2026-05-29, commit `91477c2`, 마이그 0187)** — 좋아요·저장 3 테이블: card_likes, card_saves, comment_likes. RPC 10건 + 트리거 본문 무관 확인 + RETURNS TABLE 함수 2건 DROP+CREATE.
- **Phase 4 (보류)** — 콘텐츠 2 테이블 (cards / comments): **`author_id` 유지**. §4 결정 (책임 주체 vs 행위자 분리). 6개월 운영 후 재검토 (§차후 결정).

production 사실 확정 (2026-05-29 `information_schema.columns` 직접 조회): Phase 2/3 대상 9 테이블 모두 `user_id` 부재 / `profile_id` 존재.

### 7. 마이그레이션 번호

| 번호 | 용도 | 상태 |
|---|---|---|
| 0185 | CRITICAL-2 — `content_reports.status` CHECK constraint 갱신 (resolved_hidden / resolved_deleted / dismissed) | 예약 |
| 0186 | Phase 2 — 인터랙션·통계 6 테이블 컬럼 `user_id` → `profile_id` RENAME + FK/index/RLS 갱신 | **적용 완료 (2026-05-29, `f8d1c93`)** |
| 0187 | Phase 3 — 좋아요·저장 3 테이블 RENAME + 트리거·RPC 재정의 | **적용 완료 (2026-05-29, `91477c2`)** |
| 0188 | (예약 보류) Phase 4 진행 시 cards/comments 처리용 | 보류 |
| 0189 | dead 컬럼 `profiles.age_confirmed_at` DROP (트랙 B) | 적용 완료 (2026-05-29, `d2bfddd`) |

각 번호는 **본 ADR 채택과 함께 선점**. 다른 마이그가 이 번호를 빼앗으면 안 됨.

---

## Consequences

### 긍정

- CRITICAL-1 같은 한 글자 회귀의 원천 차단 (자동 grep hook + 명명 규칙 명시).
- multi-identity 시스템의 도메인 의미를 컬럼명이 정확히 표현.
- 신규 작업자·AI 가 컬럼명만 보고 "이건 명함 ID 인지 auth ID 인지" 즉시 판별.
- ADR 0011/0012 (active 명함 단위 권한) 의 application 정합이 컬럼명 측에서도 일관.

### 부정

- Phase 2~3 마이그레이션 동안 옛 컬럼명 (`user_id`) 과 새 컬럼명 (`profile_id`) 이 production DB 안에 공존 (적용 완료 — 2026-05-29 단일 트랜잭션으로 두 phase 모두 종료).
- `user_id` 라는 익숙한 단어 (다수 SNS 관행) 를 버리는 학습 비용. 단 ADR 본문 1회 읽으면 해소.
- 옛 마이그레이션 사료 (0001~0184) 본문에 `user_id` 가 그대로 남아 있어 grep 결과에 잡힘. 신규 작업자가 사료와 현재 상태를 혼동할 가능성. CLAUDE.md §6 "도메인 문서는 현재 상태만 서술" 룰로 완화.
- `user_id` 컬럼명이 한국·해외 다수 SNS 관행과 다른 선택. 다만 피부텐텐은 multi-identity 시스템이라 일반 SNS 와 구조가 달라 정당.

### 미래 부담

- Phase 2 진행 직전 RPC 64개 중 (A)류 40개 재정의 부담 — Phase 2/3 commit 안에서 완료 (RETURNS TABLE 시그니처 변경 함수는 DROP+CREATE 패턴 적용).
- PostgREST schema cache reload 시점에 production 1~3초 다운 가능성. Phase 진행 시 트래픽 낮은 시간대 선택.
- Phase 4 (cards/comments) 가 보류 상태인 한, `author_id` 와 `profile_id` 가 동일 도메인에서 공존. 이는 의도된 정책이지만 신규 작업자는 ADR 본 ADR 1회 읽어야 헷갈리지 않음.

---

## 차후 결정 사항

- Phase 4 (cards/comments `author_id` 유지 결정) 의 재검토 시점: production 6개월 운영 후 회귀 통계 + PostgREST embed 패턴 안정성 확인. 만약 author/actor 분리가 실제 사고 차단에 기여 없다고 데이터로 확인되면 Phase 4 통일도 재고.
- 한 row 에 둘 이상 명함 ID 가 등장하는 신규 테이블 설계 시 역할 접두사 (`actor_*` / `recipient_*` 등) 적용. 본 ADR 의 4번 규칙 따름.
