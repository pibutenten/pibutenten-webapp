# 후기·시술일기 통합 상세 계획서 (v2)

> **버전**: v2
> **상태**: 계획 / 원장 승인 대기
> **한 줄 요약**: 피부텐텐의 시술일기(비공개 방문 기록)와 시술후기(공개 비식별 지표)를 단일 정합 DB(4층 구조)로 통합하여, 시술기록에서 자연 파생되는 후기와 날짜 불명확한 회고 후기를 모두 SSOT로 수용하고, 시계열 측정(day0/week1/month1/month4)을 코어로 포함하며, 의료법 제56조·제27조를 스키마·RLS·집계 입력 화이트리스트로 구조 강제한다.

---

## 목차

- [확정 결정 로그](#확정-결정-로그)
- [v1 대비 변경](#v1-대비-변경)
- [동시 세션(FOLLOW) 충돌 회피](#동시-세션follow-충돌-회피)
- [1. 최종 데이터 모델 (DDL·제약·인덱스·RLS)](#1-최종-데이터-모델-ddl제약인덱스rls)
- [2. 마이그레이션 계획 (무손실·롤백)](#2-마이그레이션-계획-무손실롤백)
- [3. 쓰기 경로 (RPC·API)](#3-쓰기-경로-rpcapi)
- [4. UI·UX 플로우](#4-uiux-플로우)
- [5. 공개 집계·분석·리포트·SEO](#5-공개-집계분석리포트seo)
- [6. 알림·리텐션 엔진](#6-알림리텐션-엔진)
- [7. 의료법·개인정보·보안(RLS)](#7-의료법개인정보보안rls)
- [8. 로드맵·단계·리스크·미결](#8-로드맵단계리스크미결)
- [원장 미결 결정](#원장-미결-결정)
- [법률 면책](#법률-면책)

---

## 확정 결정 로그

### 원장 확정 (변경 불가)

| # | 확정 사항 |
|---|---|
| O1 | **4층 구조 고정**: `diaries`(시술일기/방문, 비공개) / `diary_procedures`(그날 받은 시술 목록, 비공개·순수 기록) / `procedure_reviews`(후기 앵커 + 결론 칸) / `review_checkin`(시계열 측정, 신규). 테이블·컬럼명 토씨까지 고정. |
| O2 | **`diary_procedures`는 후기 테이블로 흡수하지 않는다** — "후기 없어도 기록만 되는 순수 기록"으로 유지. 후기와는 `procedure_reviews.diary_procedure_id` 역참조로만 연결. |
| O3 | **`diaries`는 개명·복사 없이 기존 테이블 확장**. 비공개 owner-only RLS 유지. |
| O4 | **자유텍스트(`cards.body` 한줄후기) 유지** — 제안 C의 자유텍스트 제거안 거부. body 666건 100% 채움·피드/SEO 핵심. 단답풀은 보완재. |
| O5 | **시계열은 코어** — Phase 1~3 안에 포함(보류 아님). 시점 4종(day0=당일/week1=1주/month1=1달/month4=4달) 시술 종류 무관 동일. |
| O6 | **가격 공개 v1 보류** — 변호사 검토 후 v2(solo_price 버킷만). 병원별 공개 집계 금지. |
| O7 | **기존 데이터 무손실** — diaries 70 / diary_procedures 86 / procedure_reviews 666 / review_summary 앵커 46. 확장만, 값 마이그 불필요. |

### 디렉터 결정 (기술 검증 반영)

| # | 결정 |
|---|---|
| D-A | **마이그레이션 시작 번호 = 0292** (기술 검증 [치명] 정정). 디스크 ceiling 은 `0291_follows_lock_select.sql`(FOLLOW 세션이 0290·0291 두 파일 점유). 따라서 스키마=0292 / review_checkin=0293 / (집계가드는 0292 동봉). 착수 직전 `ls supabase/migrations/`로 최신+1 재확인. |
| D-B | **회귀 가드는 "치명 유출 봉쇄"가 아니라 "심층 방어(defense-in-depth)"**. 현행 `read_public` 정책·집계 RPC 4경로는 이미 published 카드 EXISTS 게이트로 NULL-card 비공개 행을 자연 배제 중. `is_public=true AND card_id IS NOT NULL` 명시 조건을 **추가**해 카드 게이트가 유일 방벽이 되지 않도록 이중화한다. |
| D-C | **`create_visit_with_entries`(통합 작성 RPC)는 `procedures_empty` 가드를 `is_complete=false`일 때 면제**한다. 현행 `create_diary`는 시술 0개 일기를 차단하므로, 미완성 임시저장(트랙 B 발사 자격 `is_complete=false`)이 성립하려면 신규 RPC가 이 가드를 완화해야 한다(기술 검증 major 반영). |
| D-D | **standalone 회고 후기 경로(`/api/reviews`)는 `create_procedure_review` INSERT 절에 `is_public=true`, `source='standalone'`, `date_precision` 명시 추가가 필수**다. recommend 인자 추가만으로는 read_public 가드 도입 후 신규 공개 후기가 `is_public=false`로 저장되어 가려진다(기술 검증 major 반영). |
| D-E | **`source_link_chk` CHECK는 회귀 가드(666 통과)로만 한정**하고, diary_linked 후기의 `visit_id` 채움은 day0 RPC 동일 트랜잭션에서 보장한다. "visit 보유 + 회고(standalone)" 케이스는 v1에서 막는다(부분입력 INSERT 실패 회피를 위해 visit_id 채움 시점을 트랜잭션 내로 못박음). |
| D-F | **소급 visit 연결 안 함** — 기존 666 후기와 70 일기 자동 연결 금지(동일 방문 보장 없음, 오결합 시 date_precision·집계 오염). 신규부터 연결. |
| D-G | **owner-only 보조 RLS 가시성 단위 확정** — `scheduled_notification`/`notifications`(수신함)는 **active 명함 단위**(`recipient_id = COALESCE(current_active_profile_id(), auth.uid())`, 기존 `notifications_select_own`과 동일). 반면 `review_checkin`/`review_symptom`/`short_answer_response`(측정 원본 데이터)는 **로그인 단위**(`pr.author_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())`) — 측정 소유자가 active 명함 전환과 무관하게 자기 후기의 시계열을 조회·수정. 라이브 검증: profiles 129행 중 10행 `id <> auth_user_id`(묶음 명함). 초안의 `recipient_id = auth.uid()` 직접 비교는 [치명] 버그로 정정(§6.2). |
| D-H | **v1: diary_linked 후기는 비공개(`is_public=false`) 추이그래프 전용**, 공개 후기는 standalone만 허용. 롤업이 공개 결론칸을 month4까지 사후 변동시켜 `/reports` ISR·JSON-LD `aggregateRating`이 stale로 남는 캐시·SEO 정합 경로가 미완이므로, 공개 시계열 후기는 P3 이후로 미루고 그때 `upsert_review_checkin`의 `revalidatePath` 계약(§3.3)을 선결한다(기술 검증 [치명]+major 반영). |
| D-I | **일기 단건 삭제 경로는 v1 필수 — `delete_visit` RPC가 연결 후기의 `source`를 `standalone`으로 전환한 뒤 `visit_id`를 끊고 일기를 삭제한다(기술 검증 [치명] 반영)**. `procedure_reviews.visit_id`는 `ON DELETE SET NULL`(후기 보존 의도)인데 동시에 `source_link_chk`(`source='diary_linked' AND visit_id IS NOT NULL`)가 걸려, diary_linked 후기가 1건이라도 붙은 일기를 사용자가 그냥 `DELETE` 하면 PostgreSQL이 `visit_id=NULL`로 set 하는 순간 그 행이 여전히 `source='diary_linked'`라 `source_link_chk`(check_violation, 23514)에 걸려 **일기 삭제가 영구 차단**된다. FK SET NULL의 "후기 보존" 의도와 CHECK 불변식이 서로를 무효화하는 설계 결함이므로, 일기 삭제는 raw `DELETE FROM diaries`가 아니라 **전용 `delete_visit(p_visit_id)` RPC(SECURITY DEFINER, 한 트랜잭션)** 로만 수행한다 — (1) 명함 소유 검증, (2) `UPDATE procedure_reviews SET source='standalone', date_precision='exact', visit_id=NULL, diary_procedure_id=NULL WHERE visit_id=p_visit_id`(diary_linked → standalone 전환·연결 끊기를 CHECK 위반 없는 순서로 먼저 수행), (3) `DELETE FROM diaries WHERE id=p_visit_id`(이 시점엔 연결 후기 0건이라 FK SET NULL이 발동할 대상 없음, `diary_procedures`는 부모 CASCADE로 삭제). 연결돼 있던 후기는 회고(standalone) 후기로 살아남고 `review_checkin`은 `review_id` CASCADE로 보존된다(고아 시계열은 standalone 전환 후기의 추이로 잔존). 또한 `delete_visit`은 standalone 전환 후기들의 잔여 pending 트랙 A(`review_checkin`) 예약을 같은 트랜잭션에서 `cancelled`로 끊는다(§3.4 (2b) — review_id CASCADE 미발동분 회수, §6.3 불변식 정합). §1.3.2·§1.3.3·§2.5·§3.4·§7.9에 동일 명세. |
| D-J | **미완성→완성 동선에서 시계열 시작 누락 차단 — v1 범위 못박기(기술 검증 major 반영)**. 트랙 A 예약(week1/month1/month4)은 day0 checkin 제출 RPC 내부에서만 적재되는데(§6.4 트랙 A 적재 위치), 미완성 임시저장(`is_complete=false`, D-C로 `procedures_empty` 면제)은 시술·후기·day0 가 없을 수 있고, 그 일기를 나중에 `update_visit`으로 완성해도 `update_visit`은 "본문만 수정, 자식 동기화 v1 보류"라 후기·day0·트랙 A 예약을 만들지 않는다. 그러면 **미완성→완성 동선으로 만든 일기는 시계열 예약이 영영 적재되지 않는 사각지대**가 생긴다(트랙 B 회수는 되나 트랙 A 시계열은 시작 안 됨). **v1 결정(채택안 a): "미완성 일기에서 완성 시 시계열 후기 추가" 동선을 명시적으로 차단**한다 — `update_visit`은 본문(diaries)만 수정하며 후기·day0·트랙 A 예약을 만들지 않고, **시계열(diary_linked) 후기·day0·트랙 A 예약은 처음부터 `is_complete=true`로 작성하는 `create_visit_with_entries` 경로에서만** 성립한다. 미완성으로 시작한 일기는 완성 시 본문만 채워지고, 시계열을 원하면 완성 후 별도로 후기 작성 동선(visit 연결 standalone 또는 P3 이후 공개 시계열)을 탄다. (대안 b: `update_visit` 또는 별도 RPC가 day0·트랙 A 적재까지 담당 — v1 미채택, 범위 증가·부분상태 복잡도. P3 재검토.) §3.2·§3.4·§6.4·로드맵 P2에 동일 명세. |

---

### 원장 최종 결정 (2026-06-27 야간 — 구현 착수)

| # | 결정 | 구현 영향 |
|---|---|---|
| F1 | **전부 한번에 구현** | Phase 1~6을 분리 출시 없이 한 흐름으로. 의존순서(스키마→RPC/API→UI→집계→알림) 유지. **미완성 라이브 UI는 main push 보류**(운영 앱 무손상). 토대·dormant 백엔드(스키마·RPC)는 안전 커밋 가능 |
| F2 | **가격 공개 영구 안 함** | O6의 "v2 버킷 공개" **폐기**. `solo_price`·`total_price`는 비공개 일기 표시 전용. 공개 집계·가격 버킷·변호사 가격게이트 전부 **제거**(범위 축소) |
| F3 | **공개 시계열 후기 도입 (D-H 반전)** | diary_linked 후기도 `is_public=true` 허용. 롤업 사후변동 → `upsert_review_checkin` 경로에서 `revalidatePath('/reports/{ko}' + family)` 온디맨드 재검증으로 ISR·JSON-LD `aggregateRating` stale 해소(D-H가 P3로 미루던 계약을 v1에 구현). |

> F2·F3은 §5(집계)·§6(알림)·§3(쓰기경로)에 우선한다. F2로 §5/§7의 가격·지역가격 공개 항목은 무효(비공개 일기 표시만 유지). F3로 §5/D-H의 "공개 후기=standalone 한정" 제약을 풀고 diary_linked 공개도 허용하되 revalidate 계약을 §3.3에 구현.

## v1 대비 변경

| 영역 | v1 (review-diary-unification-master-plan) | v2 (본 문서) |
|---|---|---|
| `diary_procedures` 처분 | D3: `procedure_reviews`로 흡수 INSERT(마이그 0291) | **철회**. 순수 기록으로 유지, 흡수 안 함 → 평가-NULL 집계 오염 원천 소멸 |
| 마이그 시작 번호 | 0291 (ceiling 0290 가정) | **0292** (ceiling 0291_follows_lock_select 확인) |
| 회귀 가드 성격 | "현재 열린 유출을 막는다" | **심층 방어** — 현행 카드 게이트가 이미 차단 중, 명시 조건은 이중화 |
| 시계열(`review_checkin`) | 후속/보류 후보 | **코어(P1~P3 포함)** |
| 결론 칸 | satisfaction/pain/revisit/effect_areas/effect_onset/downtime | + **recommend(신규, 추천의향)** |
| `read_public` 정책 이해 | "무조건 공개" | **이미 published 카드 EXISTS 게이트 존재** — is_public 결합·강화가 정확한 기술 |
| 미완성 일기 트랙 | 미정의 | **트랙 B 정의** + `create_visit_with_entries`의 procedures_empty 가드 면제(D-C) |
| diary_linked 공개 후기 | 암묵 허용(공개 시계열) | **v1 차단 — 비공개 추이그래프 전용(D-H)**. 공개는 standalone만. 공개 시계열의 롤업 사후변동 캐시·SEO 정합은 P3 이후 |
| 공개 철회(unpublish) | 누락 | **v1 필수 — 카드 soft-delete + `is_public=false` 원자 동기화(D-H 관련, Q10)** |
| 예약알림 멱등 제약 | `UNIQUE(visit_id,kind)` 통합 | **트랙별 부분 UNIQUE 인덱스 2종**(다중 시술 visit 시계열 누락 회피) |
| owner-only RLS 가시성 단위 | 미명시 | **수신함=active 명함 / 측정원본=로그인 단위 확정(D-G)**. `recipient_id=auth.uid()` 직접비교 [치명] 정정 |

---

## 동시 세션(FOLLOW) 충돌 회피

FOLLOW 세션 라이브 footprint(본 세션 직접 확인):

- `supabase/migrations/0290_follows.sql` + `0291_follows_lock_select.sql` **두 파일 모두 디스크 존재·적용 완료**. `to_regclass('public.follows')` = `follows` 반환.
- `src/lib/notification-kinds.ts`에 `follow_post` kind **이미 추가됨**(NotificationKind·NOTIFICATION_KINDS·라벨·DISPLAY_MODE 전부 반영).
- `src/components/FollowButton.tsx` 신규, `doctors`/`profile` 뷰 수정 중.

| 공유 영역 | FOLLOW 세션 | 본 작업 충돌 지점 | 회피 순서 |
|---|---|---|---|
| `supabase/migrations/` | 0290·0291 점유 | **0292+ 사용** | P1 착수 직전 `ls supabase/migrations/ \| tail -3`으로 최신+1 재확정. 번호 경합 시 상위 번호 양보. follows vs diaries/procedure_reviews 분리 → 내용 충돌 없음 |
| `src/lib/notification-kinds.ts` | `follow_post` 추가 | P4에서 `diary_reminder` kind 추가 | **FOLLOW 머지 후 P4 착수**(P4는 P2·P3 뒤라 시점상 자연 분리). 배열·Record에 append-only(중간 삽입 금지) |
| `doctors`/`profile` 뷰 | 팔로우 버튼·집계 수정 | 본 작업 무관(visit/review 도메인) | 파일 회피 — 본 작업은 `record/`·`reviews`·`visits`·`procedure-report.ts`만 건드림 |
| `notifications` 파이프라인 | follow_post 트리거 | P4 scheduled_notification → notifications INSERT | 기존 push 파이프라인 재사용만(트리거 신설 안 함). kind 값이 달라 행 단위 독립 |

**핵심 분리 원칙**: 본 작업 도메인(diaries/diary_procedures/procedure_reviews/review_checkin/scheduled_notification)과 FOLLOW 도메인(follows/follow_post)은 테이블·RPC·트리거가 전부 분리되어 DB 레벨 충돌 없음. 코드 레벨 단일 충돌점은 `notification-kinds.ts` 1파일이며 P4(후순위)로 미뤄 FOLLOW 머지 후 처리. 본 작업 커밋 시 `git add -A` 금지, 변경 파일만 명시 stage.

---

## 1. 최종 데이터 모델 (DDL·제약·인덱스·RLS)

이 섹션은 라이브 production DB(SELECT 전용)에서 직접 확인한 현행 스키마·제약·RLS·인덱스를 근거로 작성했습니다. 마이그 번호는 **0292 이상**(FOLLOW 세션이 0290·0291 점유)으로, 실제 번호는 착수 시점 최신+1로 확정합니다.

### 1.0 현행 검증 결과 (DB 직접 조회 근거)

| 항목 | 현행 (production) | 출처 |
|---|---|---|
| `diaries` 컬럼 | id, profile_id(NOT NULL), visited_on(NOT NULL), clinic_id, clinic_name, clinic_addr, clinic_tel, clinic_x, clinic_y, doctor_name, manager_name, diary_body, created_at, updated_at | information_schema |
| `diaries` RLS | owner-only CRUD 4종, `profile_id = COALESCE(current_active_profile_id(), auth.uid())` | pg_policies |
| `diary_procedures` RLS | owner-only CRUD 4종, 부모 `diaries` EXISTS 경유 소유 | pg_policies |
| `procedure_reviews` NOT NULL | card_id, procedure_ko, author_id, satisfaction, pain, revisit | information_schema |
| `procedure_reviews` UNIQUE | `card_id` (UNIQUE, `procedure_reviews_card_id_key`) | pg_constraint |
| `procedure_reviews` RLS | read_own(authenticated) + read_public(anon,authenticated) — **현재 `card.published`만 검사, `is_public` 없음**. INSERT/UPDATE 정책 **없음**(RPC SECURITY DEFINER 경유 쓰기) | pg_policies |
| 집계 RPC | `get_review_report_overview`(admin 전용), `get_review_summary_pool`, `get_procedure_review_demographics`, `procedure_report.ts` — 전부 `card_id` JOIN + `status='published' AND deleted_at IS NULL` 필터 | pg_get_functiondef |
| `current_active_profile_id()` | request 헤더 `x-active-profile-id`(UUID 검증) → uuid, STABLE SECURITY DEFINER | pg_get_functiondef |
| RLS 활성 | 세 테이블 모두 `relrowsecurity=true`, `forcerowsecurity=false` | pg_class |
| 마이그 ceiling | `0291_follows_lock_select.sql`(FOLLOW 세션) → 본 작업 **0292부터** | ls migrations/ |

**가시성 범례**: 🔒 비공개(owner-only) / 📊 집계입력(결론칸·is_public=true만) / 👁 공개옵트인(is_public 토글로 카드 노출).

### 1.1 diaries — 시술일기(방문). 기존 테이블 **확장**(개명·복사 금지)

추가 7컬럼만 ALTER. 기존 14컬럼·RLS·인덱스·FK 전부 무변경.

```sql
ALTER TABLE public.diaries
  ADD COLUMN IF NOT EXISTS clinic_home          text,                              -- 🔒
  ADD COLUMN IF NOT EXISTS clinic_kakao         text,                              -- 🔒
  ADD COLUMN IF NOT EXISTS total_price          int,                               -- 🔒
  ADD COLUMN IF NOT EXISTS is_complete          boolean NOT NULL DEFAULT true,     -- 🔒 일기 완성 여부
  ADD COLUMN IF NOT EXISTS reminder_stage       smallint NOT NULL DEFAULT 0,       -- 🔒 발사된 알림 단계(0=미발사/1=week1/2=month1/3=month4)
  ADD COLUMN IF NOT EXISTS reminder_muted       boolean NOT NULL DEFAULT false,    -- 🔒 알림 끄기
  ADD COLUMN IF NOT EXISTS visited_on_precision text NOT NULL DEFAULT 'exact';     -- 🔒 방문일 정밀도

ALTER TABLE public.diaries
  ADD CONSTRAINT diaries_visited_on_precision_chk
    CHECK (visited_on_precision IN ('exact','season','half','year')),
  ADD CONSTRAINT diaries_total_price_chk CHECK (total_price IS NULL OR total_price >= 0),
  ADD CONSTRAINT diaries_clinic_home_chk  CHECK (clinic_home  IS NULL OR char_length(clinic_home)  <= 300),
  ADD CONSTRAINT diaries_clinic_kakao_chk CHECK (clinic_kakao IS NULL OR char_length(clinic_kakao) <= 300),
  ADD CONSTRAINT diaries_reminder_stage_chk CHECK (reminder_stage BETWEEN 0 AND 3);
```

- 기존 FK 유지: `profile_id → profiles(id) ON DELETE CASCADE`, `clinic_id → clinics(id) ON DELETE SET NULL`. 기존 CHECK `diary_body <= 400` 유지.
- RLS: owner-only SELECT/INSERT/UPDATE 3종 무변경. **단 FOR DELETE 정책 `diaries_delete_own`은 0292에서 제거**(FIX-1) — 일기 삭제를 SECURITY DEFINER `delete_visit` RPC(§3.4·D-I) 전용으로 강등해 raw `DELETE` 우회(source_link_chk×SET NULL 함정 재현·트랙 A 예약 미회수)를 DB레벨에서 차단. 알림 예약 배치(`/api/cron/diary-reminders`)는 service-role(RLS 우회)로 `reminder_stage` UPDATE.
- 인덱스: 예약알림 배치 스캔용 부분 인덱스 추가.

```sql
CREATE INDEX IF NOT EXISTS diaries_reminder_pending_idx
  ON public.diaries (visited_on)
  WHERE reminder_muted = false AND reminder_stage < 3 AND is_complete = true;
```

> **is_complete 신규 작성 경로 (D-C 반영)**: `is_complete NOT NULL DEFAULT true`로 기존 70행은 자동 true(완성 일기, 회수 알림 제외). 미완성 임시저장(트랙 B 발사 자격 `is_complete=false`)을 성립시키려면 통합 작성 RPC `create_visit_with_entries`가 현행 `create_diary`의 `procedures_empty` 가드(시술 0개 차단)를 `is_complete=false`일 때 면제해야 합니다(§3.2 참조). 이 RPC 가드 충돌 해소가 트랙 B의 전제입니다.

### 1.2 diary_procedures — 그날 받은 시술 목록. **유지**(흡수 금지, 확장 없음)

원장 확정(O2)대로 후기 테이블로 흡수하지 않습니다. 후기와는 `procedure_reviews.diary_procedure_id` 역참조로만 연결합니다. 본 개편에서 **DDL 변경 없음**.

- 현행 컬럼: id, diary_id, procedure_ko, tag_dict_ko, unit_text, price, note, sort_order, created_at (전부 유지).
- 현행 FK: `diary_id → diaries(id) ON DELETE CASCADE`, `tag_dict_ko → tag_dictionary(ko) ON UPDATE CASCADE ON DELETE SET NULL`.
- 현행 RLS: owner-only 4종(부모 diaries EXISTS 경유). 가시성 🔒 비공개.
- 집계 무관: "기록만" 행 — 어떤 집계 함수 입력에도 들어가지 않음(평가-NULL 오염 원천 소멸).

### 1.3 procedure_reviews — 후기 앵커 + **결론 칸**. 기존 테이블 **확장**

#### 1.3.1 컬럼 명세 (가시성 표기)

| 컬럼 | 타입 | 제약 | 가시성 | 역할 |
|---|---|---|---|---|
| **결론칸(기존)** | | | | |
| satisfaction | smallint | (완화) nullable, 1–5 | 📊 | 만족도 — 집계 입력 |
| pain | smallint | (완화) nullable, 1–5 | 📊 | 통증 |
| revisit | text | (완화) nullable, yes/maybe/no | 📊 | 재시술 여부 |
| effect_areas | text[] | nullable | 📊 | 효과 부위(다중) |
| effect_onset | text | nullable, 5종 CHECK | 📊 | 효과 발현 시점 |
| downtime | text | nullable, 5종 CHECK | 📊 | 다운타임 |
| **결론칸(신규)** | | | | |
| recommend | smallint | nullable, 1–5 | 📊 | 추천의향(revisit과 별개) |
| **연결/유형(신규)** | | | | |
| visit_id | bigint | nullable, FK→diaries(id) ON DELETE SET NULL | 🔒(연결키) | 일기 연결 |
| diary_procedure_id | bigint | nullable, FK→diary_procedures(id) ON DELETE SET NULL | 🔒(연결키) | 시술줄 연결 |
| is_public | boolean | NOT NULL DEFAULT false | 👁 | 공개 옵트인 게이트 |
| date_precision | text | NOT NULL DEFAULT 'exact', 4종 CHECK | 📊 | 날짜 정밀도 |
| source | text | NOT NULL DEFAULT 'standalone', 2종 CHECK | 📊 | standalone/diary_linked |
| solo_price | int | nullable, >=0 | 🔒 | 단일시술가(v1 비공개 격리) |
| **연결키(기존)** | | | | |
| card_id | bigint | (완화) nullable, UNIQUE 유지, FK→cards CASCADE | — | 카드 1:1(비공개 후기는 NULL) |
| author_id | uuid | NOT NULL, FK→profiles CASCADE | 🔒 | 작성자 |
| **죽은 컬럼** | area, cost_satisfaction, oneliner_type | 채움 0% | — | 본 개편 무관, 차기 위생작업 제거 후보 — **건드리지 않음** |

#### 1.3.2 ALTER DDL

```sql
-- (a) 신규 컬럼
ALTER TABLE public.procedure_reviews
  ADD COLUMN IF NOT EXISTS recommend          smallint,
  ADD COLUMN IF NOT EXISTS visit_id           bigint,
  ADD COLUMN IF NOT EXISTS diary_procedure_id bigint,
  ADD COLUMN IF NOT EXISTS is_public          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_precision     text    NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS source             text    NOT NULL DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS solo_price         int;

-- (b) FK (둘 다 ON DELETE SET NULL — 일기/시술줄 삭제돼도 후기 보존)
--     ★주의(D-I): visit_id 의 SET NULL 은 source_link_chk(§1.3.3)와 정면 모순한다.
--       diary_linked 후기가 붙은 일기를 raw DELETE 하면 PostgreSQL 이 visit_id=NULL 을
--       set 하는 순간 그 행이 여전히 source='diary_linked' 라 source_link_chk 에 걸려
--       (check_violation 23514) 일기 삭제가 영구 차단된다. 따라서 일기 단건 삭제는
--       반드시 delete_visit(p_visit_id) RPC(§3.4·D-I)로만 — RPC 가 같은 트랜잭션에서
--       연결 후기를 source='standalone'·visit_id=NULL 로 먼저 전환한 뒤 일기를 지운다.
--       이 SET NULL 은 "delete_visit 가 못 잡은 잔여 고아 연결"의 최후 안전망으로만 의미.
ALTER TABLE public.procedure_reviews
  ADD CONSTRAINT procedure_reviews_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES public.diaries(id) ON DELETE SET NULL,
  ADD CONSTRAINT procedure_reviews_diary_procedure_id_fkey
    FOREIGN KEY (diary_procedure_id) REFERENCES public.diary_procedures(id) ON DELETE SET NULL;

-- (c) CHECK
ALTER TABLE public.procedure_reviews
  ADD CONSTRAINT procedure_reviews_recommend_chk
    CHECK (recommend IS NULL OR (recommend >= 1 AND recommend <= 5)),
  ADD CONSTRAINT procedure_reviews_date_precision_chk
    CHECK (date_precision IN ('exact','season','half','year')),
  ADD CONSTRAINT procedure_reviews_source_chk
    CHECK (source IN ('standalone','diary_linked')),
  ADD CONSTRAINT procedure_reviews_solo_price_chk
    CHECK (solo_price IS NULL OR solo_price >= 0);

-- (d) NOT NULL 완화 (카드 미보유 비공개 후기·시계열 부분입력 대비)
--     procedure_ko / author_id 는 완화 대상 아님(유지).
ALTER TABLE public.procedure_reviews
  ALTER COLUMN card_id      DROP NOT NULL,
  ALTER COLUMN satisfaction DROP NOT NULL,
  ALTER COLUMN pain         DROP NOT NULL,
  ALTER COLUMN revisit      DROP NOT NULL;
```

기존 CHECK는 라이브 확인 결과 **두 형태가 섞여** 있습니다 — `satisfaction`/`pain`은 **범위검사** `(satisfaction >= 1 AND satisfaction <= 5)`·`(pain >= 1 AND pain <= 5)`이고, `revisit`/`effect_onset`/`downtime`은 `= ANY(ARRAY[...])`(`revisit = ANY(ARRAY['yes','maybe','no'])` 등)입니다. **두 형태 모두 NULL 입력 시 결과가 NULL(=non-FALSE)이라 CHECK를 통과**합니다(`NULL>=1 AND NULL<=5` → NULL, `NULL = ANY(...)` → NULL). 따라서 NOT NULL을 완화해 NULL이 들어와도 컬럼 CHECK는 **그대로 유지** — DROP 불필요(초안의 "전부 bare `= ANY` 형태"는 satisfaction/pain에 대해 부정확하므로 정정). 배포 전 `INSERT 1행 satisfaction=NULL` 스모크 테스트로 실측 권장. `card_id UNIQUE`(0288에서 author/procedure UNIQUE만 제거, card_id UNIQUE는 의도적 유지)는 PostgreSQL이 NULL 다중 허용이므로 비공개 후기(card_id NULL) 다수와 양립.

#### 1.3.3 데이터 정합 가드 (CHECK) — 회귀 가드 한정 (D-E 반영)

```sql
ALTER TABLE public.procedure_reviews
  -- 공개 후기는 반드시 카드 보유(read_public·집계 화이트리스트와 정합)
  ADD CONSTRAINT procedure_reviews_public_needs_card
    CHECK (is_public = false OR card_id IS NOT NULL),
  -- 일기연결이면 visit_id 필수, 회고면 visit_id 부재
  ADD CONSTRAINT procedure_reviews_source_link_chk
    CHECK ( (source = 'diary_linked' AND visit_id IS NOT NULL)
         OR (source = 'standalone'   AND visit_id IS NULL) );
```

- `source_link_chk`는 기존 666행(visit_id NULL, source='standalone' 기본값)을 모두 통과합니다.
- **D-E 결정**: 이 가드는 "회귀 가드(666 통과)"로만 한정합니다. diary_linked 후기의 `visit_id`는 day0 생성 RPC(`create_visit_with_entries`) 동일 트랜잭션에서 채워지므로(§3.2), CHECK 위반 없이 INSERT 됩니다. **"visit 보유 + 회고(standalone)" 케이스는 v1에서 차단**합니다(부분입력 시 INSERT 실패 회피). 해당 케이스가 향후 필요하면 별도 안건으로 CHECK 완화를 재검토합니다.
- **★D-I — `source_link_chk` × `visit_id ON DELETE SET NULL` 모순 해소(기술 검증 [치명] 반영)**: 이 CHECK는 `visit_id` FK의 `ON DELETE SET NULL`과 정면 충돌합니다. diary_linked 후기가 붙은 일기를 사용자가 raw `DELETE FROM diaries`로 지우면, PostgreSQL이 연결 후기의 `visit_id=NULL`을 set 하려는 순간 그 행이 여전히 `source='diary_linked'`라 `source_link_chk`(check_violation 23514) 위반으로 **삭제 자체가 롤백**됩니다. 즉 연결 후기가 1건이라도 있으면 사용자가 자기 일기를 영구히 삭제하지 못합니다. **해소책(채택안 B)**: 일기 단건 삭제를 raw DELETE가 아니라 전용 `delete_visit(p_visit_id)` RPC(§3.4)로만 수행하고, RPC가 같은 트랜잭션에서 **(순서 고정)** ① `UPDATE procedure_reviews SET source='standalone', date_precision='exact', visit_id=NULL, diary_procedure_id=NULL WHERE visit_id=p_visit_id`(diary_linked→standalone 전환을 CHECK 위반 없는 단일 UPDATE로 — `source`와 `visit_id`를 동시에 바꾸므로 행 갱신 후 `source='standalone' AND visit_id IS NULL`이 성립해 통과) → ② `DELETE FROM diaries WHERE id=p_visit_id`(이 시점엔 연결 후기 0건이라 FK SET NULL이 발동할 대상 없음)를 수행합니다. 연결돼 있던 후기는 회고(standalone)로 보존되고, FK SET NULL은 "RPC를 우회한 잔여 고아 연결"의 최후 안전망으로만 남습니다. 배포 후 검증: `SELECT 1 FROM pg_proc WHERE proname='delete_visit'` 존재 + 일기 삭제 스모크(연결 후기 1건 보유 일기 → delete_visit → 일기 0·후기 standalone 1).
- `diary_procedure_id`는 diary_linked에서도 선택(시술줄 미지정 가능)이므로 가드에 포함하지 않습니다.

#### 1.3.4 인덱스

```sql
CREATE INDEX IF NOT EXISTS procedure_reviews_visit_idx
  ON public.procedure_reviews (visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS procedure_reviews_diary_proc_idx
  ON public.procedure_reviews (diary_procedure_id) WHERE diary_procedure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS procedure_reviews_public_idx
  ON public.procedure_reviews (procedure_ko)
  WHERE is_public = true AND card_id IS NOT NULL;
```

#### 1.3.5 RLS — read_public 강화 (회귀 가드 (a), 치명·동일 배포)

현행 `procedure_reviews_read_public`는 `card.published`만 검사합니다(라이브 확인: "무조건 공개" 아님, 이미 카드 게이트 존재). 비공개 후기(card_id NULL)는 카드가 없어 자연 차단되지만, **명시적으로 `is_public=true AND card_id IS NOT NULL` 조건을 추가**해 NOT NULL 완화로 생긴 anon 유출 경로를 봉쇄합니다(D-B 심층 방어).

```sql
DROP POLICY IF EXISTS procedure_reviews_read_public ON public.procedure_reviews;
CREATE POLICY procedure_reviews_read_public ON public.procedure_reviews
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND card_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.cards c
      WHERE c.id = procedure_reviews.card_id
        AND c.status = 'published'::qa_status
        AND c.deleted_at IS NULL
    )
  );
```

- `procedure_reviews_read_own`(authenticated, author_id 경유) 무변경 — 작성자는 자기 비공개 후기 조회 유지.
- INSERT/UPDATE 정책은 현행대로 **없음** — 쓰기는 RPC(SECURITY DEFINER)로만. is_public 토글·visit_id 연결도 신규/확장 RPC 내부에서 처리(§3).

### 1.4 review_checkin — 시계열 측정. **신규**(코어)

diary_linked 후기에만 생성. 추이그래프 표시 + RPC 롤업의 원천. 비공개(owner-only, review 경유 소유).

```sql
CREATE TABLE public.review_checkin (
  id             bigserial PRIMARY KEY,
  review_id      bigint   NOT NULL
                   REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  timepoint      text     NOT NULL
                   CHECK (timepoint IN ('day0','week1','month1','month4')),
  satisfaction   smallint CHECK (satisfaction IS NULL OR (satisfaction BETWEEN 1 AND 5)),
  recommend      smallint CHECK (recommend    IS NULL OR (recommend    BETWEEN 1 AND 5)),
  effect_felt    smallint CHECK (effect_felt  IS NULL OR (effect_felt  BETWEEN 1 AND 5)),
  pain           smallint CHECK (pain          IS NULL OR (pain          BETWEEN 1 AND 5)),  -- day0만 의미
  changed_points text[],
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, timepoint)                                  -- 시점당 1행(재제출=UPSERT)
);

CREATE INDEX review_checkin_review_idx ON public.review_checkin (review_id);

ALTER TABLE public.review_checkin ENABLE ROW LEVEL SECURITY;
```

가시성: 전 컬럼 🔒 비공개(개별 후기 추이그래프 표시용, 집계 미입력). `UNIQUE(review_id, timepoint)`로 시점 재제출은 UPSERT(`ON CONFLICT (review_id,timepoint) DO UPDATE`).

#### RLS — review 경유 소유 (owner-only, active 명함 패턴)

```sql
CREATE POLICY review_checkin_select_own ON public.review_checkin
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.procedure_reviews pr
    WHERE pr.id = review_checkin.review_id
      AND pr.author_id IN (
        SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid()
      )
  ));
```

INSERT/UPDATE/DELETE는 정책을 두지 않고 RPC(SECURITY DEFINER, 체크인 제출→결론칸 롤업을 한 트랜잭션에서 수행)로만 — `procedure_reviews` 쓰기 패턴과 동일합니다. 추이그래프는 기본 비노출(authenticated 한정). 공개 후기 페이지에서 anon에게도 추이를 보이려면 별도 anon SELECT 정책(부모 review의 `is_public=true AND card 보유` 경유)을 후속 단계로 둡니다.

### 1.5 보조 테이블 — 후속 단계(자리만 확보). **신규 스키마만**

```sql
-- (1) review_symptom — 증상 지연발현·결절
CREATE TABLE public.review_symptom (
  id             bigserial PRIMARY KEY,
  review_id      bigint NOT NULL REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  symptom_type   text   NOT NULL,
  severity       smallint CHECK (severity IS NULL OR (severity BETWEEN 1 AND 5)),
  onset_timepoint text  CHECK (onset_timepoint IS NULL
                          OR onset_timepoint IN ('day0','week1','month1','month4')),
  resolved       boolean NOT NULL DEFAULT false,
  resolved_days  int     CHECK (resolved_days IS NULL OR resolved_days >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_symptom_review_idx ON public.review_symptom (review_id);
ALTER TABLE public.review_symptom ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_symptom_select_own ON public.review_symptom
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procedure_reviews pr
    WHERE pr.id = review_symptom.review_id
      AND pr.author_id IN (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())));

-- (2) question_pool — 단답풀(운영 마스터 데이터)
CREATE TABLE public.question_pool (
  id            bigserial PRIMARY KEY,
  timepoint     text NOT NULL CHECK (timepoint IN ('day0','week1','month1','month4')),
  category      text NOT NULL,
  question_text text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  weight        smallint NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_pool_read_active ON public.question_pool
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- (3) short_answer_response — 단답응답
CREATE TABLE public.short_answer_response (
  id          bigserial PRIMARY KEY,
  review_id   bigint NOT NULL REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  checkin_id  bigint REFERENCES public.review_checkin(id) ON DELETE SET NULL,
  question_id bigint NOT NULL REFERENCES public.question_pool(id) ON DELETE CASCADE,
  answer_text text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, question_id, checkin_id)
);
CREATE INDEX short_answer_response_review_idx  ON public.short_answer_response (review_id);
CREATE INDEX short_answer_response_checkin_idx ON public.short_answer_response (checkin_id) WHERE checkin_id IS NOT NULL;
ALTER TABLE public.short_answer_response ENABLE ROW LEVEL SECURITY;
CREATE POLICY short_answer_response_select_own ON public.short_answer_response
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.procedure_reviews pr
    WHERE pr.id = short_answer_response.review_id
      AND pr.author_id IN (SELECT p.id FROM public.profiles p WHERE p.auth_user_id = auth.uid())));
```

확정(O4): 자유텍스트(`cards.body` 한줄후기)는 유지하며 단답풀은 보완재입니다. `short_answer_response`는 `cards.body`를 대체하지 않습니다.

### 1.6 기존 데이터 마이그레이션 (무손실 backfill)

행수: diaries 70 / diary_procedures 86 / procedure_reviews 666 / review_summary 앵커 46. 값 마이그 불필요, 신규 컬럼 **명시 세팅만**.

```sql
UPDATE public.procedure_reviews
SET is_public     = true,         -- 👁 카드 보유 + 살아있음 → 공개 유지
    source        = 'standalone', -- 기본값과 동일(명시)
    date_precision= 'exact'       -- 작성일 기준 정확(명시)
WHERE card_id IS NOT NULL
  AND EXISTS (                    -- ★FIX-2: soft-deleted 카드 6건(review_id 27·28·59·61·67·510) 제외
    SELECT 1 FROM public.cards c
     WHERE c.id = procedure_reviews.card_id
       AND c.deleted_at IS NULL
  );                              -- 660건 해당(666건 중 카드 살아있는 행만)
-- visit_id/diary_procedure_id/recommend/solo_price 는 NULL 유지(회고 후기).
-- review_checkin 0건(회고는 결론칸 직접입력).
-- ★FIX-2: 666건 중 6건은 카드 status='published'이나 deleted_at IS NOT NULL(soft-deleted)이라
--   is_public=false 로 남긴다 — card_id IS NOT NULL 만으로 좁히면 "is_public=true 인데 카드
--   soft-deleted" 상태 모순(unpublish 모델의 역)이 생긴다. 누출·집계오염은 없으나
--   (read_public·집계 모두 deleted_at IS NULL JOIN 으로 배제) 상태 정합을 위해 EXISTS 가드 추가.
```

배포 순서(원자성): **1.3.2(d) NOT NULL 완화 → 1.6 UPDATE(is_public=true) → 1.3.5 RLS read_public 강화**를 한 마이그(또는 한 트랜잭션)로 묶습니다. RLS를 먼저 강화하면 UPDATE 전 666건이 일시적으로 anon에게 사라지는 창이 생기므로 **UPDATE를 RLS 교체보다 먼저** 실행합니다.

### 1.7 회귀 가드 — 집계 화이트리스트 (가드 (b), 치명)

집계 경로(`src/lib/procedure-report.ts` + RPC `get_review_summary_pool` / `get_review_report_overview` / `get_procedure_review_demographics`)는 현재 `card_id` JOIN + `status='published'`로 카드 보유 후기만 봅니다. NOT NULL 완화 후 이 카드-JOIN이 비공개(card_id NULL) 후기를 자동 배제하지만(D-B), **방어선을 명시**하기 위해 각 집계 경로에 `is_public = true AND card_id IS NOT NULL` 조건을 추가합니다.

| 경로 | 현행 필터 | 추가할 조건 |
|---|---|---|
| `procedure-report.ts::getProcedureReport` | `card.status='published'`, `card.deleted_at IS NULL`(inner) | `.eq("is_public", true)` 추가 |
| `procedure-report.ts::getFamilyReviewCardIds` | 동일 | `.eq("is_public", true)` 추가 |
| RPC `get_review_report_overview` | `rc.type='review' AND rc.status='published' AND rc.deleted_at IS NULL` | `AND pr.is_public = true` |
| RPC `get_review_summary_pool` | (동일 카드 JOIN 패턴) | `AND pr.is_public = true` |
| RPC `get_procedure_review_demographics` | `c.status='published'`만 검사(`rc.type='review'` 필터 없음 — 미세 차이 확인됨) | `AND pr.is_public = true` |

구현 단계에서 `pg_get_functiondef`로 세 함수 본문을 정독해 `pr.is_public=true`를 LATERAL/CTE WHERE에 동일 삽입합니다.

### 1.8 명명·불변 준수 확인

- 사람 ID 컬럼: `author_id`(콘텐츠), `profile_id`(diaries), `auth_user_id`(RLS 매핑)만 사용. `visit_id`/`diary_procedure_id`/`review_id`/`checkin_id`/`question_id`/`recipient_id`는 사람 ID가 아닌 행 참조 FK이므로 ADR 0014의 `user_id 금지` 룰과 무관. pre-commit hook `column-naming-check.js`는 cards/comments의 `user_id`(패턴A)와 마이그 `user_id` 신규정의(패턴B)만 검사하며 `*_id`를 광범위 차단하지 않음(라이브 확인) → **hook 통과**.
- 파괴적 DDL 부재: diaries/diary_procedures DROP 없음. `DROP POLICY ... read_public` 후 즉시 `CREATE POLICY`(교체)는 회귀 가드 자체이므로 허용 범위.
- 마이그 번호: **0292 이상**(FOLLOW 세션이 0290·0291 점유). 착수 시점 최신+1.
- 카테고리 4종(qa/doodle/review/review_summary) 무변경 — 공개 후기 카드는 기존대로 `type='review', category='review'`.

근거 파일(읽기전용, 절대경로):
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\src\lib\procedure-report.ts`
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\docs\plans\review-overhaul-worklog-sess-3400e728.md`
- production DB(SELECT): `information_schema.columns` / `pg_constraint` / `pg_policies` / `pg_indexes` / `pg_get_functiondef`

---

## 2. 마이그레이션 계획 (무손실·롤백)

> 본 절은 LOCKED 4층 모델로 가는 단계별 마이그레이션 SQL입니다. 모든 단계는 production DB 직접 검증(§2.0)에 근거합니다. 마스터 플랜 v1의 결정 D3(`diary_procedures`를 `procedure_reviews`로 흡수)는 **LOCKED 모델에서 철회**되었습니다 — 따라서 v1의 흡수 INSERT 마이그는 **본 계획에서 제거**됩니다.

### 2.0 현행 production Ground Truth (직접 검증, 본 계획의 토대)

| 항목 | 검증값 | 출처 |
|---|---|---|
| 행수 | `diaries` 70 / `diary_procedures` 86 / `procedure_reviews` 666 / review 카드 666 / review_summary 앵커 46 | `count(*)` |
| `procedure_reviews` NOT NULL | `card_id`·`satisfaction`·`pain`·`revisit`·`procedure_ko`·`author_id` | `information_schema.columns` |
| `card_id` 분포 | 666건 **전부 non-NULL**, 전부 `cards.type='review'` | JOIN 검증 |
| 결론칸 채움률 | `satisfaction`/`pain`/`revisit`/`effect_areas` **100%**, `effect_onset`/`downtime` 94.6%(36건 NULL) | `count FILTER` |
| 죽은 컬럼 | `area`/`cost_satisfaction`/`oneliner_type` **0% 채움** | `count FILTER` |
| 기존 CHECK | `satisfaction`/`pain`: **범위검사** `(>=1 AND <=5)`, `revisit`/`effect_onset`/`downtime`: `= ANY(ARRAY[...])` — **두 형태 모두 NULL 입력 시 결과 NULL(=non-FALSE)이라 통과** | `pg_get_constraintdef` |
| `read_public` 정책 | **무조건 공개 아님** — `EXISTS(cards WHERE id=card_id AND status='published' AND deleted_at IS NULL)` 게이트 | `pg_policy` |
| 집계 RPC | 3종 모두 `JOIN cards ... status='published' AND deleted_at IS NULL` 내장 | `pg_get_functiondef` |
| `diary_procedures` tag | 84/86 가 `tag_dictionary.ko` 보유, 2건 미존재 | JOIN 검증 |
| 마이그 번호 | 파일 최대 = **`0291_follows_lock_select.sql`** → 본 계획 **0292부터** | `ls migrations/` |

**검증으로 확정된 설계 영향:**

1. **회귀 가드는 "교정"이 아니라 "심층 방어"**(D-B). 현행 `read_public`·집계 RPC는 *이미* published 카드 존재를 요구하므로, NULL-card 비공개 후기는 지금도 anon 비노출·집계 미혼입. LOCKED는 `is_public=true AND card_id IS NOT NULL`을 추가해 카드 게이트가 유일 방벽이 되지 않도록 이중화.
2. **기존 666건 결론칸 값 마이그 불필요.** 백필은 신규 플래그 컬럼 UPDATE 1회뿐.

### 2.1 마이그 `0292` — 스키마 확장 + 백필 + 회귀 가드 (한 트랜잭션·동시 배포 묶음)

> 마이그 번호는 **착수 시점 최신+1**로 결정합니다. FOLLOW 세션이 `0290`·`0291`을 점유하므로 본 계획은 **0292 이상**으로 부여합니다(0291 하드코딩 금지). 아래는 상대표기 `0292`로 기술합니다.
>
> **배포 묶음 원칙**: DDL·백필 UPDATE·RLS 정책 교체·집계 회귀 가드를 동일 트랜잭션·동일 배포로 묶습니다.

```sql
BEGIN;

-- (1) diaries 확장. 기존 70행 무변경(개명·복사 안 함).
ALTER TABLE diaries
  ADD COLUMN clinic_home  text,
  ADD COLUMN clinic_kakao text,
  ADD COLUMN total_price  int     CHECK (total_price IS NULL OR total_price >= 0),
  ADD COLUMN is_complete  boolean NOT NULL DEFAULT true,
  ADD COLUMN reminder_stage smallint NOT NULL DEFAULT 0,
  ADD COLUMN reminder_muted boolean  NOT NULL DEFAULT false,
  ADD COLUMN visited_on_precision text NOT NULL DEFAULT 'exact'
    CHECK (visited_on_precision IN ('exact','season','half','year'));

-- (2) procedure_reviews 연결/유형 + recommend(신규 결론칸).
ALTER TABLE procedure_reviews
  ADD COLUMN recommend smallint CHECK (recommend IS NULL OR (recommend >= 1 AND recommend <= 5)),
  ADD COLUMN visit_id  bigint REFERENCES diaries(id)           ON DELETE SET NULL,
  ADD COLUMN diary_procedure_id bigint REFERENCES diary_procedures(id) ON DELETE SET NULL,
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN date_precision text NOT NULL DEFAULT 'exact'
    CHECK (date_precision IN ('exact','season','half','year')),
  ADD COLUMN source text NOT NULL DEFAULT 'standalone'
    CHECK (source IN ('standalone','diary_linked')),
  ADD COLUMN solo_price int CHECK (solo_price IS NULL OR solo_price >= 0);

-- (3) NOT NULL 완화. 기존 666행은 값 보유라 무영향.
ALTER TABLE procedure_reviews
  ALTER COLUMN card_id      DROP NOT NULL,
  ALTER COLUMN satisfaction DROP NOT NULL,
  ALTER COLUMN pain         DROP NOT NULL,
  ALTER COLUMN revisit      DROP NOT NULL;

-- (3b) 정합 가드 CHECK (§1.3.3, D-E).
ALTER TABLE procedure_reviews
  ADD CONSTRAINT procedure_reviews_public_needs_card
    CHECK (is_public = false OR card_id IS NOT NULL),
  ADD CONSTRAINT procedure_reviews_source_link_chk
    CHECK ( (source = 'diary_linked' AND visit_id IS NOT NULL)
         OR (source = 'standalone'   AND visit_id IS NULL) );

-- (4) 백필 — 기존 666건 중 카드 살아있는 660건만 is_public=true (FIX-2).
--     ★백필을 RLS 교체보다 먼저(원자 순서).
--     ★주의(FIX-2): 666건 중 6건(review_id 27·28·59·61·67·510)은 카드 status='published'이나
--       deleted_at IS NOT NULL(soft-deleted). card_id IS NOT NULL 만으로 좁히면 이 6건도
--       is_public=true 가 되어 "is_public=true 인데 카드 soft-deleted" 불일치(unpublish 모델의 역)가
--       생긴다. 누출·집계오염은 없으나(read_public·집계 모두 deleted_at IS NULL JOIN 으로 배제)
--       상태 모순을 피하려 EXISTS(살아있는 카드) 까지 요구해 660건만 공개로 둔다(6건은 is_public=false 유지).
UPDATE procedure_reviews
   SET is_public      = true,
       source         = 'standalone',
       date_precision = 'exact'
 WHERE card_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM cards c
      WHERE c.id = procedure_reviews.card_id
        AND c.deleted_at IS NULL
   );   -- = 660건(soft-deleted 카드 6건 제외, FIX-2)

-- (5) 인덱스.
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_visit
  ON procedure_reviews(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_diary_proc
  ON procedure_reviews(diary_procedure_id) WHERE diary_procedure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_public
  ON procedure_reviews(procedure_ko) WHERE is_public = true AND card_id IS NOT NULL;

-- (6) ★회귀 가드 #1 — read_public 에 is_public 명시(심층 방어).
DROP POLICY procedure_reviews_read_public ON procedure_reviews;
CREATE POLICY procedure_reviews_read_public ON procedure_reviews
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND card_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cards c
       WHERE c.id = procedure_reviews.card_id
         AND c.status = 'published'
         AND c.deleted_at IS NULL
    )
  );

-- (7) ★일기 삭제를 delete_visit RPC 전용으로 강등 — diaries_delete_own RLS 정책 제거(FIX-1).
--     라이브 확인: diaries 에 owner-only FOR DELETE 정책 diaries_delete_own
--       (qual: profile_id = COALESCE(current_active_profile_id(), auth.uid()))이 현재 활성.
--     이 정책이 살아 있으면 클라이언트가 supabase.from("diaries").delete() 로 SECURITY DEFINER
--     delete_visit RPC(§3.4·D-I)를 우회 가능 → diary_linked 후기가 붙은 일기에서
--     source_link_chk × ON DELETE SET NULL 함정(D-I)이 재현되거나, 후기 standalone 전환·
--     트랙 A(review_checkin) 예약 회수 없이 연결만 끊긴다. 따라서 raw DELETE 차단·delete_visit
--     강제의 DB레벨 전제로 이 정책을 제거하고, 일기 삭제는 delete_visit RPC 전용으로 강등한다.
--     (INSERT/UPDATE/SELECT owner-only 3종은 무변경 — DELETE 경로만 RPC 로 일원화.)
DROP POLICY IF EXISTS diaries_delete_own ON diaries;

COMMIT;
```

**무손실 원리**: 기존 666건은 그 자리에 잔존하며 컬럼만 추가됩니다. 값 변경은 신규 플래그 3종 UPDATE뿐이고 결론칸·`card_id`·`procedure_ko`·`author_id`는 일절 손대지 않습니다. `diaries` 70행은 전부 `ADD COLUMN`이고 NOT NULL 신규 컬럼은 모두 DEFAULT 보유라 즉시 채워집니다.

### 2.2 마이그 `0293` — `review_checkin` 신규 (시계열 측정)

```sql
BEGIN;

CREATE TABLE review_checkin (
  id            bigserial PRIMARY KEY,
  review_id     bigint NOT NULL REFERENCES procedure_reviews(id) ON DELETE CASCADE,
  timepoint     text   NOT NULL CHECK (timepoint IN ('day0','week1','month1','month4')),
  satisfaction  smallint CHECK (satisfaction IS NULL OR (satisfaction BETWEEN 1 AND 5)),
  recommend     smallint CHECK (recommend    IS NULL OR (recommend    BETWEEN 1 AND 5)),
  effect_felt   smallint CHECK (effect_felt  IS NULL OR (effect_felt  BETWEEN 1 AND 5)),
  pain          smallint CHECK (pain          IS NULL OR (pain          BETWEEN 1 AND 5)),  -- day0만 의미
  changed_points text[],
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, timepoint)
);

CREATE INDEX idx_review_checkin_review ON review_checkin(review_id);

ALTER TABLE review_checkin ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_checkin_read_own ON review_checkin
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM procedure_reviews pr
      JOIN profiles p ON p.id = pr.author_id
       WHERE pr.id = review_checkin.review_id
         AND p.auth_user_id = auth.uid()
    )
  );

COMMIT;
```

**무손실**: 순수 신규 테이블이므로 기존 데이터 영향 0. 기존 666건은 `source='standalone'`이라 checkin 0건이 자연 충족.

### 2.3 집계 회귀 가드 #2 — 코드/RPC 측 (0292와 동일 배포 묶음)

| 경로 | 현행 게이트 | 추가 가드 | 수치 영향 |
|---|---|---|---|
| `src/lib/procedure-report.ts::getProcedureReport` | `cards!inner` `status=published`·`deleted_at null` | `.eq("is_public", true)` | 0 |
| `getFamilyReviewCardIds` | 동일 | `.eq("is_public", true)` | 0 |
| `get_review_summary_pool` (SQL) | `JOIN cards rc ... published` | LATERAL 내부 `AND pr.is_public AND pr.card_id IS NOT NULL` | 0 |
| `get_review_report_overview` (plpgsql) | `JOIN cards rc ... published` | 동일 | 0 |
| `get_procedure_review_demographics` (sql) | `JOIN cards c ... published` (`rc.type='review'` 필터 없음) | 동일 | 0 |

이 변경은 백필 UPDATE(660건 → is_public=true, FIX-2) 이후에만 의미가 보장되므로 **0292와 동일 배포 묶음**에 포함합니다. 순서: DB 0292(백필 포함) → 코드/RPC 가드 → 배포. 카드 살아있는 660건이 is_public=true이고 soft-deleted 카드 보유 6건은 is_public=false이나, 그 6건은 집계가 어차피 `deleted_at IS NULL` JOIN으로 배제하므로 **수치 변화 0**. **롤백 시에도 이 코드/RPC 가드는 RLS 가드(0292)와 동일 단위로만 가감합니다**(§2.7 ★R-가드 — 코드 가드만 단독 롤백 금지, 부득이 시 `is_public=false AND card_id IS NULL` 0건 전제).

### 2.4 소급 연결 — 안 함 (무손실·오결합 회피) — D-F

기존 666 후기와 70 일기 간 자동 `visit_id` backfill은 **하지 않습니다**. 노트 작성자 23명 중 22명이 후기도 작성해 겹침은 크나 동일 방문 보장이 없어, 잘못 연결하면 `date_precision`·집계가 오염됩니다. 기존 666건은 `visit_id=NULL`·`source='standalone'`을 유지하고, 신규 일기연결 후기부터 `source='diary_linked'`·`visit_id` 채움으로 진행합니다. 소급은 후보 제시·사용자 선택 별도 안건(CLAUDE.md §3)으로 남깁니다.

### 2.5 탈퇴 정책 — 현행 CASCADE 유지 (충돌 없음)

`procedure_reviews.author_id`·`diaries.profile_id`는 모두 `→ profiles ON DELETE CASCADE`, 신규 `review_checkin.review_id`는 `→ procedure_reviews ON DELETE CASCADE`입니다. 탈퇴는 ADR 0002에 따라 profile을 삭제하지 않고 익명화(in-place)하므로 CASCADE는 평상시 미발동, 후기·일기·checkin 보존. 신규 `visit_id`·`diary_procedure_id`는 `ON DELETE SET NULL`이라 일기/시술 1건 삭제 시 후기 행은 살아남고 연결만 끊김. **profile 단위 탈퇴 경로는 v1 변경 불필요.**

> **★일기 단건 삭제 경로 — v1 필수(D-I, 기술 검증 [치명] 반영)**: 위 "후기 행은 살아남고 연결만 끊김"은 **raw `DELETE FROM diaries`로는 성립하지 않습니다**. `visit_id ON DELETE SET NULL`이 연결 후기의 `visit_id=NULL`을 set 하는 순간, 그 행이 여전히 `source='diary_linked'`라 `source_link_chk`(§1.3.3)를 위반(check_violation 23514)해 **삭제 트랜잭션 전체가 롤백**됩니다 → diary_linked 후기가 1건이라도 붙은 일기는 영구 삭제 불가. 따라서 일기 단건 삭제는 반드시 `delete_visit(p_visit_id)` RPC(§3.4)로만 하며, RPC가 같은 트랜잭션에서 연결 후기를 `source='standalone'`·`visit_id=NULL`로 먼저 전환(standalone 보존)한 뒤 일기를 지웁니다. `diary_procedures`는 부모 CASCADE로 삭제, 전환된 후기의 `review_checkin`은 `review_id` CASCADE로 보존(고아 시계열은 standalone 후기의 추이로 잔존). **이 경로 부재 시 R4 FK 정합이 [치명]으로 남으므로 v1에 포함합니다.**

### 2.6 기존 행 무손상 검증 쿼리 (배포 직후 필수)

```sql
-- (a) 행수 불변
SELECT (SELECT count(*) FROM diaries)            AS diaries,        -- 기대 70
       (SELECT count(*) FROM diary_procedures)   AS diary_procs,    -- 기대 86
       (SELECT count(*) FROM procedure_reviews)  AS reviews,        -- 기대 666
       (SELECT count(*) FROM review_checkin)     AS checkins;       -- 기대 0

-- (b) 백필 정합 (FIX-2 — soft-deleted 카드 6건 제외 반영)
SELECT is_public, source, date_precision, count(*)
  FROM procedure_reviews GROUP BY 1,2,3;
-- 기대: 두 줄 —
--   (true,  standalone, exact, 660)  ← 카드 살아있는 후기(공개)
--   (false, standalone, exact,   6)  ← 카드 soft-deleted 후기(review_id 27·28·59·61·67·510, 비공개 유지)
-- ★FIX-2: card_id IS NOT NULL 만으로 백필하면 (true,standalone,exact,666) 한 줄이 되어
--   6건이 "is_public=true 인데 카드 soft-deleted" 상태 모순이 된다. EXISTS(deleted_at IS NULL)
--   가드로 6건을 is_public=false 로 남겨 위 두 줄이 정상.
-- 보조 검증: soft-deleted 카드 보유 후기는 정확히 6건·전부 is_public=false 여야 함 —
--   SELECT count(*) FROM procedure_reviews pr JOIN cards c ON c.id=pr.card_id
--     WHERE c.deleted_at IS NOT NULL;                       -- 기대 6
--   SELECT count(*) FROM procedure_reviews pr JOIN cards c ON c.id=pr.card_id
--     WHERE c.deleted_at IS NOT NULL AND pr.is_public=true; -- 기대 0

-- (c) 결론칸 무변경
SELECT count(*) FILTER (WHERE satisfaction IS NULL) AS sat_null,    -- 기대 0
       count(*) FILTER (WHERE effect_onset IS NULL) AS onset_null,  -- 기대 36
       count(*) FILTER (WHERE effect_areas IS NULL) AS areas_null   -- 기대 0
  FROM procedure_reviews;

-- (d) 집계 수치 무회귀
SELECT count(*) AS pool_rows, sum(review_count) AS total_reviews
  FROM get_review_summary_pool();
-- 마이그 전 동일 쿼리 결과를 미리 캡처해 1:1 대조.

-- (e) 정합 불변식 — diary_linked 후기는 visit_id 필수 (§3.2 D-E·D-H 불변식)
SELECT count(*) AS dangling_linked          -- 기대 0
  FROM procedure_reviews
 WHERE source = 'diary_linked' AND visit_id IS NULL;

-- (f) v1 공개 시계열 차단 (D-H) — diary_linked 공개 후기 0건이어야 함
SELECT count(*) AS public_linked            -- 기대 0 (v1)
  FROM procedure_reviews
 WHERE source = 'diary_linked' AND is_public = true;

-- (g) satisfaction=NULL 스모크 (NOT NULL 완화 후 CHECK 통과 실측, 롤백 트랜잭션)
--   ★검증절차 주의: procedure_ko 는 tag_dictionary(ko) 를 FK 참조하며
--     (procedure_reviews_procedure_ko_fkey = FOREIGN KEY(procedure_ko) REFERENCES
--      tag_dictionary(ko) ON UPDATE CASCADE — 라이브 확인), 게다가 공개 후기 경로의
--     라이브 create_procedure_review 는 추가로 is_procedure=true 까지 요구한다
--     (라이브 본문: WHERE ko=p_procedure_ko AND is_procedure → 미충족 시 unknown_procedure 22023).
--     따라서 스모크 INSERT 의 procedure_ko 는 반드시 tag_dictionary 에 is_procedure=true 로
--     실존하는 태그여야 한다.
--   ★라이브 재확인(본 정정 세션 직접 SELECT, UTF-8 안전 경로): '울쎄라'·'더엘주사'·
--     '티타늄'·'리쥬란' 4개 모두 tag_dictionary 에 is_procedure=true 로 실존한다
--     (procedure_reviews 666건 전수 procedure_ko 가 is_procedure=true 사전어 — ko_in_dict_is_proc=666).
--     반면 '테스트' 는 tag_dictionary 부재(라이브 SELECT 결과 미반환). 앞선 기술 검증이
--     "'울쎄라' exists=false"라 단언한 것은 셸 UTF-8 인코딩 아티팩트(한글 리터럴이 깨져
--     매칭 0건)였고, DB 사실이 아니다 — '울쎄라'는 실존이며 아래 스모크는 FK·is_procedure
--     양쪽을 통과한다(23503/22023 미발생). 본 항목은 검증절차 인지 보강일 뿐, 마이그 본문
--     결함이 아니다(NOT NULL 완화 안전성은 아래 (대안) temp 검증으로 독립 실증됨).
--   BEGIN;
--     INSERT INTO procedure_reviews(procedure_ko, author_id, source, is_public)
--       VALUES ('울쎄라', '<own_profile_id>', 'standalone', false);  -- 실존·is_procedure=true 태그·satisfaction NULL
--       --   대체 가능 실존 태그: '더엘주사' / '티타늄' / '리쥬란' (모두 is_procedure=true 확인).
--     -- → 성공해야 함: FK(실존 태그)·NOT NULL 완화(satisfaction nullable)·
--     --    범위검사 CHECK(NULL>=1 AND NULL<=5 → NULL = non-FALSE) 모두 통과.
--   ROLLBACK;
--   (대안·NULL CHECK 통과의 FK-독립 실증) tag_dictionary FK 영향을 배제하고 범위검사·=ANY
--     CHECK 가 NULL 입력에서 non-FALSE 로 통과함만 떼어 검증하려면, 임시 temp 테이블에 동일
--     CHECK 를 복제해 NULL 행을 넣어본다(실 procedure_reviews·tag_dictionary 무변경):
--     BEGIN;
--       CREATE TEMP TABLE _chk_probe(
--         s smallint CHECK (s IS NULL OR (s >= 1 AND s <= 5)),         -- satisfaction/pain 형태(범위검사)
--         r text     CHECK (r IS NULL OR r = ANY(ARRAY['yes','maybe','no']))  -- revisit 형태(=ANY)
--       );
--       INSERT INTO _chk_probe(s, r) VALUES (NULL, NULL);  -- → 성공(두 CHECK 모두 NULL=non-FALSE 통과)
--     ROLLBACK;
--   라이브 사실: '테스트' tag_dictionary 부재, '울쎄라'·'더엘주사'·'티타늄'·'리쥬란'은 실존
--     (is_procedure=true). NULL CHECK 통과 자체는 위 temp 프로브로 FK 와 독립 실증 — 설계 결론
--     (NOT NULL 완화 안전성) 정상.

-- (h) diary_linked day0 적재 회귀 — tag_dictionary·is_procedure 동시 통과 검증 (P2 게이트, 기술 검증 major 반영)
--   ★배경(라이브 확인): diary_procedures 86행 중 procedure_ko 가 tag_dictionary 부재 2건,
--     is_procedure=true 충족 78건 — 즉 8건은 ko 가 사전에 있어도 is_procedure=false 다.
--     따라서 후기 아코디언이 '비사전·비시술' procedure_ko 행에 펼쳐져 그 ko 로
--     procedure_reviews 를 INSERT 하면, FK(미존재 시 23503) 또는 is_procedure 게이트
--     (create_procedure_review 경로의 22023)에서 실패해 create_visit_with_entries
--     트랜잭션 전체가 롤백된다. 계획서는 '미존재 시 procedure_reviews 미생성·diary_procedure_id
--     만 연결' 또는 '라우트/RPC 선두 검증 후 명확한 에러'로 분기한다(§3.2 (a)).
--   회귀 테스트(P2 착수 시 실행):
--     -- (h-1) 미존재 ko 로 diary_linked 후기 INSERT → 23503(FK) 확인 (procedure_ko=tag 부재값)
--     -- (h-2) is_procedure=false 인 사전 ko 로 → (공개 경로) 22023 unknown_procedure 확인
--     -- (h-3) is_procedure=true 실존 ko(예: '울쎄라') 로 → source_link_chk·FK·is_procedure 동시 통과 +
--     --       day0 review_checkin 1행, diary_procedure_index→v_proc_ids[] 매핑이 올바른 시술줄에
--     --       연결됨(인덱스 base 일치) 확인.
--   주의: §2.6(g)는 standalone·is_public=false 만 검증하므로, diary_linked 경로(visit_id 채움 +
--     source='diary_linked' + day0)는 (h) 로 별도 검증한다.
```

### 2.7 롤백 전략

| 마이그 | 롤백 방법 | 가역성 |
|---|---|---|
| `0292` | 신규 컬럼 `DROP COLUMN` + NOT NULL 재부여(`SET NOT NULL`) + `read_public` 정책 원복 + **`diaries_delete_own` 정책 재생성**(아래 ★R-삭제정책) | **완전 가역** — NOT NULL 재부여는 신규 NULL 행이 없을 때(=Phase 2 배포 전)만 성공 |
| `0293` | `DROP TABLE review_checkin` | **완전 가역** — 순신규 |
| 집계 가드(코드/RPC) | RPC 3종 `CREATE OR REPLACE`로 가드 제거, `procedure-report.ts` 필터 제거 | 가역하나 **단독 롤백은 0건 전제부 조건**(아래 ★R-가드) |

> **★R-가드 — 코드 집계 가드의 단독 롤백 비대칭 제거(기술 검증 major 반영)**: 초안은 "집계 가드(코드/RPC)는 DDL과 분리해 코드만 단독 롤백 가능"이라 했으나, RLS `read_public` 교체는 0292(DDL) 묶음에 강결합되어 있어 **코드 가드만 롤백되고 RLS 가 남거나 그 반대일 때 비대칭이 생깁니다**. 본 계획은 코드 집계 가드를 `service-role/admin client(RLS 우회) 미래 경로의 defense-in-depth`로 규정하므로(§5.2), 코드 가드만 단독 롤백하면 그 방어선이 비대칭으로 사라져, Phase 2 이후 생성된 `is_public=false` 비공개 후기(card_id NULL)가 service-role 경로로 집계에 유입될 수 있습니다. **정정: 코드 집계 가드는 RLS 가드(0292)와 동일 배포·동일 롤백 단위로 묶습니다.** 부득이 단독 롤백을 허용할 경우의 안전 전제는 NOT NULL 재부여 롤백과 동일 논리로 명시합니다 — **"코드 가드 단독 롤백은 신규 비공개 후기(`is_public=false AND card_id IS NULL`)가 0건일 때만 안전"**(=Phase 2 신규 후기 생성 경로 배포 전). 0건 아닌 시점의 단독 롤백은 금지합니다.

> **★R-삭제정책 — `diaries_delete_own` 제거의 롤백(FIX-1)**: 0292가 제거한 `diaries_delete_own`(FOR DELETE owner-only) 정책을 원복하려면 원본 정의를 그대로 재생성합니다 — `CREATE POLICY diaries_delete_own ON public.diaries FOR DELETE TO authenticated USING (profile_id = COALESCE(current_active_profile_id(), auth.uid()));`(라이브 원본 qual·역할). 단 **이 정책을 되살리면 raw `DELETE FROM diaries` 우회 경로가 재개통**되어 D-I 함정(diary_linked 후기 붙은 일기의 `source_link_chk`×`SET NULL` 충돌·트랙 A 예약 미회수)이 다시 노출되므로, 롤백은 **`delete_visit` RPC와 `/api/visits/{id}` DELETE 경로까지 함께 되돌릴 때만** 정합합니다(정책만 단독 원복 금지 — delete_visit 경유 강제가 무력화됨).

**롤백 안전 순서 원칙**: DDL(0292/0293) + **RLS·코드 집계 가드(동일 단위)** 와 신규 후기 생성 코드(Phase 2의 `create_visit_with_entries`)를 **별도 배포**로 분리합니다. 단, 집계 가드의 코드 절반만 떼어 롤백하지 않습니다(위 ★R-가드 — RLS 가드와 같은 단위로만 가감). `diaries_delete_own` 제거의 원복은 위 ★R-삭제정책대로 `delete_visit` 경로와 동일 단위로만 되돌립니다.

### 2.8 follow 세션과의 공유 영역 주의

1. **마이그 번호 충돌 회피**: 착수 시점 `ls supabase/migrations/`의 실제 최대+1(최소 0292).
2. **`notification-kinds.ts` 공유 회피**: 본 마이그 단계(0292/0293)는 알림 코드 무수정. 예약 알림은 후속 Phase(P4)에서 follow 머지 완료 후 순서 조정.
3. **명시 stage**: `git add -A` 금지, 변경 파일만 명시 stage.

**마이그 요약표**

| 번호(상대) | 내용 | 무손실 보증 | 회귀 가드 동시? |
|---|---|---|---|
| `0292` | diaries 7컬럼 + procedure_reviews 7컬럼, NOT NULL 4종 완화, 정합 CHECK 2종, 666건 백필, `read_public` 교체, **`diaries_delete_own` 정책 제거(FIX-1)**, 인덱스 3종 | ADD COLUMN(DEFAULT) + UPDATE 3플래그만 | ✅ 가드 #1(RLS) 동봉 |
| `0292`+코드 | 집계 4경로에 `is_public AND card_id IS NOT NULL` | 수치 영향 0 | ✅ 가드 #2, 동일 배포 묶음 |
| `0293` | `review_checkin` 신규 + owner-only RLS | 순신규, 기존 영향 0 | 해당 없음 |

---

## 3. 쓰기 경로 (RPC·API)

### 3.0 현행 쓰기 경로 실측 (코드·DB 직접 확인)

| 경로 | 현행 RPC | API 라우트 | 저장 대상 | 검수·마스킹 | 앵커 |
|---|---|---|---|---|---|
| 시술노트(비공개) | `create_diary(p_profile_id, p_visited_on, …, p_procedures jsonb)` → `bigint` | `POST /api/diaries` | `diaries` 1행 + `diary_procedures` N행 | 없음 | 없음 |
| 시술후기(공개) | `create_procedure_review(p_author_id, p_procedure_ko, p_title, p_body, …, p_satisfaction, p_pain, p_revisit, …)` → `TABLE(card_id, shortcode)` | `POST /api/reviews` | `cards`(type=review) 1행 + `procedure_reviews` 1행 + 앵커 lazy | `maskProhibitedMentions` + `screenContent` | `ON CONFLICT (post_slug) DO NOTHING` |
| 후기 수정 | `update_procedure_review(p_shortcode, …)` → `TABLE(card_id, shortcode)` | `PATCH /api/reviews/{shortcode}` | `cards` + `procedure_reviews` UPDATE + 앵커 lazy | 동일 | 동일 |

공통 패턴(전부 계승 대상):
- **권한 검증은 RPC 내부**에서 `auth.uid()`로 수행 — `EXISTS (SELECT 1 FROM profiles WHERE id = p_*_id AND auth_user_id = auth.uid())` (`42501`). 이것이 active 명함 단위 권한(ADR 0011/0012/0015)의 DB 측 방어선.
- 모두 `SECURITY DEFINER` + `SET search_path TO 'public','pg_temp'`. 쓰기 RLS 정책이 없고 쓰기는 전부 이 RPC들을 경유.
- 검수·마스킹·shortcode 생성·rate limit·온보딩 게이트는 **라우트** 담당. RPC는 마스킹된 최종 텍스트만 받음.
- 앵커는 `cards (type=review_summary, post_slug=en)`에 `ON CONFLICT DO NOTHING`로 lazy 생성. published 후기일 때만 발동.

확인 결과(쓰기 직전 보강 필요):
- `procedure_reviews_read_public`의 현재 qual은 `EXISTS(cards … published)`뿐이며 **`is_public` 조건 없음.**
- `procedure_reviews.card_id/satisfaction/pain/revisit`은 현재 **NOT NULL** → 완화 후 NULL 허용.
- `review_checkin`, `scheduled_notification` 테이블 **아직 없음**.
- 최신 마이그 = **`0291_follows_lock_select.sql`** → 본 작업 **0292 이상**.

### 3.1 통합 쓰기 RPC 4종 — 설계 원칙

| 신규/변경 RPC | 계승 출처 | 원자 단위 | 권한 |
|---|---|---|---|
| `create_visit_with_entries` | `create_diary` 확장 | `diaries`(확장) + `diary_procedures` N + (옵션) `procedure_reviews` M + (옵션) day0 `review_checkin` | `p_profile_id` 명함 소유 |
| `upsert_review_checkin` | 신규 | `review_checkin` upsert + `procedure_reviews` 결론 칸 롤업 | `p_review_id`의 `author_id` 명함 소유 |
| `update_visit` | `create_diary` 권한부 + 신규 | `diaries` UPDATE (자식 동기화는 v1 보류) | `diaries.profile_id` 명함 소유 |
| `update_procedure_review` | 기존 확장 | `cards` + `procedure_reviews` UPDATE + 앵커 lazy | 기존(작성자/admin) |

핵심 결정 4가지:

1. **공개/비공개 분리를 RPC가 강제.** `is_public=false` 후기는 카드·앵커·shortcode 미생성(개인 시계열). `is_public=true`일 때만 `cards(type=review,category=review)` 1:1 + 앵커 lazy + 검수·마스킹 발동.
2. **결론 칸은 단일 출처.** standalone은 RPC로 결론 칸을 직접 받아 INSERT. diary_linked는 day0 checkin 즉시 + 이후 `upsert_review_checkin`이 매 제출마다 결론 칸을 롤업. **트리거가 아니라 RPC 내부.**
3. **집계 입력 불변식.** 어떤 쓰기 경로도 비공개·카드 미보유 행을 집계 대상으로 만들지 않음. 집계는 `is_public=true AND card_id IS NOT NULL`만 읽음.
4. **하위호환.** `POST /api/diaries`, `POST /api/reviews`, `PATCH /api/reviews/{shortcode}` 기존 계약 유지.

### 3.2 `create_visit_with_entries` — 통합 작성 (visit + 시술목록 + 후기 + day0)

`create_diary`를 확장합니다. 기존 jsonb 배열 검증 루프(1~20개, procedure_ko 1~100자, price 정규식, note≤500, unit_text≤100)·visited_on 범위 검증·`NULLIF` 패턴을 **그대로 계승**하고, (1) diaries 확장 컬럼, (2) 시술별 후기·day0 checkin의 선택적 원자 생성을 추가합니다.

> **★procedures_empty 가드 면제 (D-C, 기술 검증 major 반영)**: 현행 `create_diary`는 `jsonb_array_length(p_procedures) < 1`일 때 `procedures_empty`(ERRCODE 22023) 예외로 시술 0개 일기를 차단합니다. 이 가드가 그대로면 트랙 B의 `is_complete=false` 미완성 일기가 영구히 생성 불가하여 발사 자격 SQL(`WHERE is_complete=false`)이 0건 매칭됩니다. 따라서 `create_visit_with_entries`는 **`p_is_complete=false`일 때 procedures_empty 가드를 면제**합니다(미완성 임시저장 허용). `p_is_complete=true`일 때는 기존대로 시술 1개 이상을 요구합니다.

```sql
-- 마이그 0292+ (실제 번호 = 착수 시점 최신+1; 0290·0291 은 follows 점유)
CREATE OR REPLACE FUNCTION public.create_visit_with_entries(
  p_profile_id            uuid,
  p_visited_on            date,
  p_visited_on_precision  text    DEFAULT 'exact',   -- exact/season/half/year
  p_clinic_id             bigint  DEFAULT NULL,
  p_clinic_name           text    DEFAULT NULL,
  p_clinic_addr           text    DEFAULT NULL,
  p_clinic_tel            text    DEFAULT NULL,
  p_clinic_x              double precision DEFAULT NULL,
  p_clinic_y              double precision DEFAULT NULL,
  p_clinic_home           text    DEFAULT NULL,       -- 신규
  p_clinic_kakao          text    DEFAULT NULL,       -- 신규
  p_doctor_name           text    DEFAULT NULL,
  p_manager_name          text    DEFAULT NULL,
  p_diary_body            text    DEFAULT NULL,
  p_total_price           int     DEFAULT NULL,       -- 신규
  p_is_complete           boolean DEFAULT true,       -- 신규 (false 시 procedures_empty 면제)
  p_procedures            jsonb   DEFAULT '[]'::jsonb,
  p_reviews               jsonb   DEFAULT '[]'::jsonb
) RETURNS TABLE(visit_id bigint, review_ids bigint[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ … $$;
```

`p_reviews` 각 원소 계약(라우트가 검수·마스킹·is_public 분기 후 채워 보냄):
```jsonc
{
  "diary_procedure_index": 0,        // p_procedures 내 0-based 인덱스 → diary_procedure_id 매핑
  "procedure_ko": "써마지",
  "is_public": true,                  // false=개인 시계열(카드 X)
  "source": "diary_linked",           // visit 연결이므로 diary_linked 고정
  "date_precision": "exact",          // visit 의 visited_on_precision 승계
  "solo_price": 800000,               // nullable, 비공개 격리
  "satisfaction": 5, "pain": 2, "revisit": "yes",
  "effect_areas": ["리프팅","탄력"], "effect_onset": "weeks_1_2",
  "downtime": "days_1_2", "recommend": 5,
  "card": { "title": "써마지 시술후기", "body": "…", "keywords": ["써마지"],
            "status": "published", "shortcode": "Ab3xY9", "post_year": 2026 },
  "checkin_day0": { "satisfaction": 5, "recommend": 5, "effect_felt": 3,
                    "pain": 2, "changed_points": ["탄력"] }
}
```

본문 절차(원자적):

1. **명함 소유 검증** — `42501 not_authorized_profile`.
2. **visited_on 범위** — 미래/2000-01-01 미만 차단. `p_visited_on_precision` CHECK.
3. **procedures_empty 분기 (D-C)** — `p_is_complete=true AND jsonb_array_length(p_procedures) < 1` → `procedures_empty` 예외. `p_is_complete=false`면 면제.
4. **diaries INSERT** — 기존 + 신규 컬럼. `NULLIF(…, '')` 계승. `RETURNING id INTO v_visit_id`.
5. **diary_procedures INSERT** — 기존 jsonb 루프·검증 그대로. `v_proc_ids[]` 보관. **인덱스 base 고정**: `p_procedures` 원소를 0-based 순회하되 `v_proc_ids`는 `array_append`로 누적하므로 `v_proc_ids`는 **1-based**(PostgreSQL 배열 기본). `p_reviews[*].diary_procedure_index`는 계약상 **0-based**(§3.2 계약 주석)이므로, 매핑은 반드시 `v_proc_ids[diary_procedure_index + 1]`로 +1 보정합니다(0/1-base 혼동 시 다른 시술줄에 후기·day0가 오연결되는 회귀 — §2.6(h-3) 검증 대상).
   - **★procedure_ko 사전·is_procedure 사전검증 (기술 검증 major 반영)**: 후기 아코디언이 펼쳐진 시술의 `procedure_ko`가 `tag_dictionary`에 **`is_procedure=true`로 실존**하는지 RPC 선두(또는 라우트)에서 검증합니다. 라이브 확인: `procedure_reviews.procedure_ko → tag_dictionary(ko)` FK(미존재 시 23503)이고, 공개 후기 경로의 `create_procedure_review`는 추가로 `is_procedure=true`까지 요구(미충족 시 `unknown_procedure` 22023). **`diary_procedures`는 86건 중 procedure_ko 가 tag_dictionary 부재 2건·`is_procedure=false`까지 합치면 8건이 사전 비시술어**이므로, 그런 행에 후기 아코디언이 펼쳐지면 후기 INSERT가 FK/is_procedure에서 실패해 visit 전체 INSERT가 롤백됩니다. 처리 규칙(택1, P2 확정): (가) 비검증 procedure_ko면 **명확한 에러**(`unknown_procedure` 22023)로 거부하고 라우트가 사용자에게 "후기는 사전 등록 시술만 가능"을 안내, 또는 (나) 후기를 만들지 않고 **`diary_procedure_id`만 연결한 기록만 행**으로 강등(순수 기록 유지). v1 기본은 (가)를 권장(시계열 후기는 사전 시술어에만).
6. **시술별 후기 루프** (`p_reviews`):
   - `diary_procedure_id := v_proc_ids[diary_procedure_index + 1]` (없으면 NULL; +1은 위 5의 base 보정).
   - **불변식(양 분기 공통)**: diary_linked 후기는 분기와 무관하게 INSERT 절에 **반드시 `visit_id = v_visit_id`(동일 트랜잭션 확보값), `source = 'diary_linked'`, `date_precision`** 를 포함합니다 — 이로써 `source_link_chk`(`source='diary_linked' AND visit_id IS NOT NULL`)를 양 분기 모두 통과합니다. `visit_id`가 NULL인 채 `source='diary_linked'`로 들어가는 경로는 **존재하지 않습니다**.
   - **v1 분기 (D-H)**: diary_linked는 **`is_public=false`만 허용**(공개 시계열 후기는 v1 차단). 따라서 v1의 통합 작성 후기는 `card_id=NULL`로 `procedure_reviews` INSERT(`visit_id=v_visit_id`, `source='diary_linked'`, `date_precision`, `is_public=false`, `diary_procedure_id`, `solo_price`, 결론 칸 부분입력 가능). **카드·앵커 미생성**. (공개 standalone 후기는 §3.6의 `/api/reviews`→`create_procedure_review` 경로로 별도 작성.)
   - **P3 이후 분기 (참고, v1 미발동)**: `is_public=true`를 풀 경우 `cards(type=review,category=review, shortcode, post_year)` INSERT로 `card_id` 확보 후 동일 INSERT 절(+ `is_public=true`, `card_id`)에 앵커 lazy 생성을 추가합니다. 이때 D-H의 revalidate 계약(§3.3)이 전제입니다.
   - `checkin_day0` 존재 시 `review_checkin(review_id, timepoint='day0', …)` INSERT.
   - `review_id`를 `v_review_ids[]`에 append.
7. `RETURN QUERY SELECT v_visit_id, v_review_ids`.

> **★전체 plpgsql 본문은 P2 산출물 (기술 검증 major 반영)**: 위 시그니처(`$$ … $$`)는 계약·절차 명세이며, 실제 plpgsql 본문은 P2 착수 시 작성합니다. 본문이 한 트랜잭션에서 동시에 만족해야 하는 제약은 4가지입니다 — (1) `source_link_chk`(diary_linked→`visit_id` NOT NULL, 위 불변식으로 보장), (2) `procedure_ko` FK(`tag_dictionary(ko)`, 23503) + 공개 경로 `is_procedure=true`(22023) — 위 5의 사전검증으로 선차단, (3) `public_needs_card`(is_public=true→card_id NOT NULL — v1은 diary_linked가 `is_public=false`라 자명 통과), (4) `diary_procedure_index→v_proc_ids[]` 1-base 매핑(위 5의 +1 보정). 이 4제약 동시 통과는 §2.6(h) 스모크로 회귀 검증합니다.
>
> **불변식 회귀 테스트(§2.6에 추가)**: 배포 후 `SELECT count(*) FROM procedure_reviews WHERE source='diary_linked' AND visit_id IS NULL;` → **0건**이어야 합니다. 또한 `upsert_review_checkin`은 `visit_id`/`source`를 **절대 변경하지 않음**을 불변식으로 명시합니다(후속 단독 호출이 source_link_chk를 깨뜨릴 경로 봉쇄).

> **검수·shortcode 위치 (기술 검증 major 반영, D-H로 단순화)**: **v1에서는 통합 작성 RPC가 카드를 만들지 않습니다**(diary_linked는 `is_public=false`만 → card_id NULL). 따라서 다건 후기를 한 트랜잭션으로 묶어도 **shortcode·검수·마스킹·앵커가 전혀 발생하지 않아** 부분실패·재시도 문제가 v1에서 통째로 소멸합니다(공개 후기는 §3.6의 단건 `create_procedure_review` 경로 유지 — 현행 단건 5회 재시도 그대로).
>
> **P3 이후 공개 다건 작성 시의 계약 (사전 확정)**: 만약 P3에서 한 visit당 공개 후기 다건 동시 작성을 허용한다면, **shortcode 충돌 재시도를 트랜잭션 밖으로** 빼는 모델을 채택합니다 — 라우트가 INSERT 전에 후기 수만큼 shortcode를 **전량 사전 생성·충돌검사**한 뒤 RPC에 확정 주입하여, RPC 트랜잭션 안에서는 `unique_violation`이 발생하지 않도록 합니다(트랜잭션 내 부분실패 시 어느 후기의 shortcode를 재생성할지 식별·부분재시도하는 모호성 제거). 또한 검수 결과(published vs pending_review)가 후기별로 달라 앵커 lazy 조건이 행마다 갈리는 문제도 사전생성+행별 status 주입으로 결정합니다. 대안으로 "한 visit당 공개 후기는 day0 후 개별 작성"으로 범위를 축소할 수 있습니다. v1은 공개 후기를 통합 RPC에서 만들지 않으므로 이 계약은 P3 게이트입니다.

### 3.3 `upsert_review_checkin` — 시계열 저장 + 결론 칸 롤업

신규. diary_linked 후기에만 적용. `UNIQUE(review_id, timepoint)` 위에서 upsert하고, **같은 트랜잭션에서 결론 칸을 롤업**합니다(트리거 아님).

```sql
CREATE OR REPLACE FUNCTION public.upsert_review_checkin(
  p_review_id       bigint,
  p_timepoint       text,                 -- day0/week1/month1/month4
  p_satisfaction    smallint DEFAULT NULL,
  p_recommend       smallint DEFAULT NULL,
  p_effect_felt     smallint DEFAULT NULL,
  p_pain            smallint DEFAULT NULL, -- day0 만 의미
  p_changed_points  text[]   DEFAULT NULL
) RETURNS bigint  -- checkin id
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_author uuid; v_checkin_id bigint;
BEGIN
  SELECT author_id INTO v_author FROM public.procedure_reviews WHERE id = p_review_id;
  IF v_author IS NULL THEN RAISE EXCEPTION 'review_not_found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_author AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF p_timepoint NOT IN ('day0','week1','month1','month4') THEN
    RAISE EXCEPTION 'invalid_timepoint' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.review_checkin
    (review_id, timepoint, satisfaction, recommend, effect_felt, pain, changed_points, submitted_at)
  VALUES (p_review_id, p_timepoint, p_satisfaction, p_recommend, p_effect_felt, p_pain, p_changed_points, now())
  ON CONFLICT (review_id, timepoint) DO UPDATE
    SET satisfaction=EXCLUDED.satisfaction, recommend=EXCLUDED.recommend,
        effect_felt=EXCLUDED.effect_felt, pain=EXCLUDED.pain,
        changed_points=EXCLUDED.changed_points, submitted_at=now()
  RETURNING id INTO v_checkin_id;

  -- 결론 칸 롤업: 만족도·추천=최신 시점, 통증=day0.
  UPDATE public.procedure_reviews pr SET
    satisfaction = COALESCE(
      (SELECT satisfaction FROM public.review_checkin
       WHERE review_id=p_review_id AND satisfaction IS NOT NULL
       ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.satisfaction),
    recommend = COALESCE(
      (SELECT recommend FROM public.review_checkin
       WHERE review_id=p_review_id AND recommend IS NOT NULL
       ORDER BY array_position(ARRAY['month4','month1','week1','day0'], timepoint) LIMIT 1),
      pr.recommend),
    pain = COALESCE(
      (SELECT pain FROM public.review_checkin WHERE review_id=p_review_id AND timepoint='day0'),
      pr.pain),
    updated_at = now()
  WHERE pr.id = p_review_id;

  RETURN v_checkin_id;
END $$;
```

> **★공개 시계열 후기의 사후 변동 — v1 범위 결정 (D-H, 기술 검증 [치명]+major 반영)**: 롤업은 매 체크인마다 `procedure_reviews`의 결론칸(satisfaction/recommend/pain)을 무조건 UPDATE합니다. 만약 `is_public=true`인 diary_linked 후기를 허용하면, 이 결론칸을 읽는 집계(`get_review_summary_pool` 등)·`/reports/{en}` JSON-LD `aggregateRating`(`ratingValue`/`ratingCount`)이 month4 롤업까지 **사용자 모르게 사후 변동**합니다. cards에는 평점 비정규화 컬럼이 없으나(라이브 확인: meta jsonb뿐) ISR 캐시가 사실상 제2 저장소이므로 무효화 누락 시 stale이 남습니다. **v1 결정: diary_linked 후기는 비공개 추이그래프 전용(`is_public=false`)으로 한정하고, 공개 후기는 standalone만 허용합니다.** 이로써 "공개 집계가 시계열로 사후 변동"하는 경로가 v1에서 통째로 소멸하며, `create_visit_with_entries`의 `p_reviews[*].is_public`은 v1에서 `false`만 허용(라우트·zod가 강제), `upsert_review_checkin`이 갱신하는 결론칸은 전부 비공개 행이라 캐시·SEO 무관입니다.
>
> **P3 이후 공개 시계열 허용 시의 계약 (사전 확정)**: 향후 `is_public=true` diary_linked를 풀려면, `upsert_review_checkin` RPC가 롤업 후 **대상 카드의 `post_slug`(en)·`shortcode`·`handle`을 RETURN**하고, 호출 라우트 `/api/reviews/checkins` 성공 핸들러가 `revalidatePath('/reports/{en}')`·`revalidatePath('/{handle}/{shortcode}')`를 **확정 호출**하도록 §3.6·§6.4에 못박습니다. 현재(v1)는 비공개 한정이므로 이 배선이 불필요합니다.
>
> **롤업 세부 (P3 설계 시 확정)**:
> - **효과발현(`effect_onset`)**: "month4 직접질문 우선 or 도출". month4 폼에 "돌이켜보니 언제부터?" 단일선택을 `p_effect_onset` 인자로 신설할지, `effect_felt` 추이에서 도출할지 폼 설계(§4)와 맞물림.
> - **달라진점(`effect_areas`)**: "최신/누적" — 최신 checkin의 `changed_points`로 덮을지, 전 시점 union 누적할지. LOCKED는 둘 다 허용 표기 → 제품 결정 후 확정. 본 RPC는 일단 만족도·추천·통증만 롤업하고 effect 계열은 후속 확정.
> - 비공개(`is_public=false`) 후기의 결론칸이 롤업으로 채워지는 것은 카드·집계가 없어 무해합니다(캐시·SEO 무관). **v1은 이 경우만 발생**합니다(공개 시계열은 위 D-H로 차단).

### 3.4 `update_visit` — visit 본문 수정

```sql
CREATE OR REPLACE FUNCTION public.update_visit(
  p_visit_id             bigint,
  p_visited_on           date,
  p_visited_on_precision text,
  p_clinic_id            bigint,              -- ★전체 clinic 파라미터 명시 (기술 검증 major 반영)
  p_clinic_name          text,
  p_clinic_addr          text,
  p_clinic_tel           text,
  p_clinic_x             double precision,    -- /notes 지도 표시 좌표 — 누락·NULL 덮어쓰기 시 소실
  p_clinic_y             double precision,
  p_clinic_home          text,
  p_clinic_kakao         text,
  p_doctor_name          text,
  p_manager_name         text,
  p_diary_body           text,
  p_total_price          int,
  p_is_complete          boolean
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ -- profiles 소유 검증(diaries.profile_id = 호출자 명함) 후 UPDATE … RETURNING id $$;
```

> **★UPDATE 절 정책 — 전체 덮어쓰기 (기술 검증 major 반영)**: 시그니처를 `create_visit_with_entries`와 동일하게 **전체 clinic 컬럼(`clinic_id/name/addr/tel/x/y/home/kakao`) + `visited_on_precision`까지 명시**합니다. 정책은 **"폼이 항상 전체 값을 전송 → UPDATE 절도 전체 컬럼 덮어쓰기"**(전자)입니다 — 현행 시술노트 폼(`SkinDiaryForms.tsx`의 `DiaryForm`)이 수정 시 전 필드를 다시 제출하는 패턴이므로, `update_visit`은 받은 값으로 모든 clinic·precision 컬럼을 SET 합니다(병원 연결 해제 시 클라이언트가 명시적으로 NULL 전송). **부분 파라미터만 받아 일부 컬럼을 건드리지 않거나, 누락 컬럼을 무조건 NULL로 덮어 `clinic_x/y` 좌표·병원 연결이 소실되는 형태를 금지**합니다(/notes 지도·`diaries_reminder_pending_idx`와 직결). 만약 향후 폼이 부분 수정(전 필드 미전송)으로 바뀌면 그때 `COALESCE(p_*, 기존값)` 부분수정(후자)으로 정책을 전환하고 본 절을 갱신합니다.

> **자식 동기화 범위**: v1은 시술 목록 수정을 보류하고 본문만 수정, v2에서 diff 동기화 권장(회귀 위험 최소화). 시술 행 삭제 시 연결 후기는 `ON DELETE SET NULL`로 끊기되 보존. 후기 본문·결론 수정은 `update_procedure_review` 담당.

> **★미완성→완성 시 시계열 시작 누락 차단 (D-J, 기술 검증 major 반영)**: `update_visit`은 본문(diaries)만 수정하며 **후기·day0 checkin·트랙 A 예약(week1/month1/month4)을 만들지 않습니다**. 트랙 A 예약은 day0 checkin 제출 RPC 내부에서만 적재되므로(§6.4), 미완성(`is_complete=false`)으로 시작해 `update_visit`으로 완성된 일기는 시계열 예약이 적재되지 않는 사각지대가 됩니다. **v1은 이 동선을 명시적으로 차단**합니다 — 시계열(diary_linked) 후기·day0·트랙 A 예약은 처음부터 `is_complete=true`로 작성하는 `create_visit_with_entries` 경로에서만 성립하고, 미완성으로 시작한 일기는 완성 시 본문만 채워집니다(시계열을 원하면 완성 후 별도 후기 작성 동선). `update_visit`/별도 RPC가 day0·트랙 A 적재까지 담당하는 대안은 P3에서 재검토합니다(§3.2·§6.4 정합).

> **★is_complete=false→true 완성 시 잔여 예약 정리 (기술 검증 major 반영)**: `update_visit`이 미완성 일기(트랙 B 회수 대상)를 `is_complete=true`로 완성하면, 이미 `scheduled_notification`에 적재된 `diary_incomplete` pending 행이 남습니다. 이 잔여 예약이 발사되면 '완료한 일기에 미완성 회수 알림'이 나가는 회귀입니다. **해소는 발사 측에서 보장**합니다 — `run_diary_reminders`의 발사 CTE가 `diary_incomplete` kind에 한해 `EXISTS(diaries d WHERE d.id=s.visit_id AND d.is_complete=false AND d.reminder_muted=false)`를 재확인하고, 탈락분을 `status='skipped'`로 정리합니다(§6.4 (a)(b)·§6.5 중단1). 따라서 `update_visit`은 별도로 pending 행을 즉시 cancel하지 않아도 안전하나, **선택적 강화로** `update_visit`이 `is_complete=true` 전환 시 같은 트랜잭션에서 `UPDATE scheduled_notification SET status='cancelled' WHERE visit_id=p_visit_id AND kind='diary_incomplete' AND status='pending'`를 수행하면 발사 대기열을 즉시 비워 cron 한 사이클의 지연도 없앱니다(구현 권장, P4와 정합).

#### `delete_visit` — 일기 단건 삭제 (★v1 필수, D-I, 기술 검증 [치명])

`visit_id ON DELETE SET NULL` × `source_link_chk` 모순(§1.3.3·§2.5) 때문에 일기 삭제는 raw `DELETE FROM diaries`로 하면 diary_linked 후기가 붙은 일기에서 `check_violation`(23514)으로 영구 실패합니다. 따라서 전용 RPC로 **연결 후기를 standalone 전환 후 일기를 지우는 순서를 한 트랜잭션에 못박습니다**.

```sql
CREATE OR REPLACE FUNCTION public.delete_visit(p_visit_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_owner uuid; v_review_ids bigint[];
BEGIN
  -- (1) 명함 소유 검증 (diaries.profile_id = 호출자 명함)
  SELECT profile_id INTO v_owner FROM public.diaries WHERE id = p_visit_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'visit_not_found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = v_owner AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  -- (2) 연결 후기 standalone 전환 + 연결 끊기 (CHECK 위반 없는 단일 UPDATE).
  --     source='standalone' AND visit_id IS NULL 이 동시에 성립 → source_link_chk 통과.
  --     review_checkin 은 review_id CASCADE 로 보존(고아 시계열은 standalone 추이로 잔존).
  --     ★전환 대상 review_id 를 RETURNING 으로 포착해 (2b) 예약 회수에 사용.
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

  -- (2b) ★트랙 A 잔여 예약 알림 정리 (기술 검증 major 반영, §6.3 불변식 정합).
  --     트랙 A(review_checkin) 예약은 review_id → procedure_reviews ON DELETE CASCADE 로만
  --     회수되는데, (2) 에서 후기 행을 standalone 으로 '전환'만 하고 삭제하지 않으므로
  --     CASCADE 가 발동하지 않는다. 따라서 일기를 지워 visited_on 이 사라진 뒤에도
  --     week1/month1/month4 체크인 리마인더가 계속 발사되어 §6.3 불변식
  --     ("회고(standalone) 후기는 review_checkin 0건·예약 0건")과 모순되고, 시계열 폼
  --     딥링크가 의미를 잃는다. → 방금 standalone 으로 전환된 후기들(v_review_ids)의 잔여
  --     pending review_checkin 예약을 같은 트랜잭션에서 cancelled 로 끊는다(review_checkin 행
  --     자체는 '추이 잔존' 의도로 보존, 예약만 차단). review_id 기준이라 트랙 A 행의
  --     visit_id 적재 여부와 무관하게 정확히 회수된다.
  IF v_review_ids IS NOT NULL THEN
    UPDATE public.scheduled_notification s
       SET status = 'cancelled'
     WHERE s.kind = 'review_checkin'
       AND s.status = 'pending'
       AND s.review_id = ANY(v_review_ids);
  END IF;

  -- (3) 일기 삭제. 이 시점엔 연결 후기 0건이라 FK SET NULL 발동 대상 없음.
  --     diary_procedures 는 diary_id CASCADE 로 삭제, 잔여 scheduled_notification(diary_incomplete
  --     등 visit_id 보유분)도 visit_id CASCADE 로 삭제.
  DELETE FROM public.diaries WHERE id = p_visit_id;
END $$;
```

`/api/visits/{id}` DELETE 메서드가 이 RPC를 위임합니다(§3.6). 배포 후 스모크: 연결 후기 1건(트랙 A 예약 3행 적재된 상태) 보유 일기 → `delete_visit` → (a) 일기 0행, (b) 후기 `source='standalone'`·`visit_id IS NULL` 1행, (c) 해당 `review_checkin` 보존, (d) **그 후기의 pending `review_checkin` 예약(scheduled_notification) → `status='cancelled'`**(§6.3 불변식 "standalone 후기는 예약 0건" 정합 — (2b) 미수행 시 고아 리마인더 발사) 확인. **raw `DELETE FROM diaries`를 노출하는 경로(API·관리자)는 전부 `delete_visit` 경유로 교체**해 우회 차단합니다.

> **★`diaries_delete_own` RLS 정책 제거가 DB레벨 전제(FIX-1)**: 위 "raw DELETE 차단·delete_visit 강제"는 코드 경로 교체만으로는 불완전합니다. 라이브에 owner-only FOR DELETE 정책 `diaries_delete_own`(qual `profile_id = COALESCE(current_active_profile_id(), auth.uid())`)이 활성인 한, 클라이언트가 `supabase.from("diaries").delete()`로 RPC를 우회해 위 함정(source_link_chk×SET NULL·트랙 A 예약 미회수)을 그대로 유발할 수 있습니다. 따라서 **0292에서 `diaries_delete_own` 정책을 제거(§2.1 (7))**해 일기 삭제를 SECURITY DEFINER `delete_visit` 전용으로 강등하는 것이 이 경로의 DB레벨 전제입니다(SELECT/INSERT/UPDATE owner-only 3종은 무변경).

### 3.5 `update_procedure_review` — 기존 확장 (신규 컬럼 반영)

기존 시그니처·권한(작성자/admin)·앵커 lazy 블록 유지. 신규 컬럼(`recommend` 등) 인자 추가. 시술명·작성자·`visit_id`/`source`는 잠금.

```sql
-- 추가 인자: p_recommend smallint DEFAULT NULL
-- UPDATE procedure_reviews SET …, recommend = p_recommend, updated_at = now() WHERE card_id = v_card_id;
```

> **★공개 철회(unpublish)는 v1 필수 — 구현안 (A) 확정 + CHECK 관계 정정 (기술 검증 major 반영)**: 한 번 공개한 시술후기를 내리는 것은 후기 시스템의 기본 사용자 동작이므로 v1 범위에 포함합니다.
>
> **CHECK 관계 정정(과결합 제거)**: `public_needs_card` CHECK는 `is_public=true → card_id IS NOT NULL`, 즉 **`card_id`(행 참조)의 존재만** 요구하며 `cards.deleted_at`은 검사하지 않습니다. 카드를 soft-delete(`deleted_at` set)해도 `card_id` 값은 그대로 남으므로 CHECK는 영향받지 않습니다. 따라서 **비공개 전환에 실제로 필요한 최소 동작은 `procedure_reviews.is_public=false` UPDATE 단독**이며, 이것만으로 RLS(`read_public`의 `is_public=true` 요구)·집계(`is_public=true` 가드)에서 동시에 이탈하고 어떤 CHECK도 위반하지 않습니다(`source_link_chk`도 `is_public`과 무관). 초안의 "is_public=false와 카드 처리가 반드시 원자적"이라는 서술은 과결합이므로 **분리**합니다 — 원자성이 실제로 필요한 경우는 "후기 비공개화 + 피드/SEO에서 카드도 함께 내리기"를 둘 다 수행할 때(둘이 어긋나면 카드만 남거나 후기만 남는 중간상태)뿐입니다.
>
> **v1 확정안 = (A) — 단, 구현 형태는 '신규 통합 RPC'로 정정 (기술 검증 major 반영)**: 후기를 "내린다"는 사용자 의도가 피드·카드 노출 제거까지 포함하므로 v1은 **카드 soft-delete(`cards.deleted_at`) + `procedure_reviews.is_public=false`를 함께** 수행하며, 이 둘의 동시성만 원자 보장하면 됩니다(카드만 내려가고 후기는 공개로 남는 중간상태 회피). 대안 (B) 전용 `toggle_review_public(p_shortcode, p_public)` RPC는 별도 표면으로 신설하지 않습니다.
>
> **★구현 형태 — 라이브 정독 결과 (본 정정 세션 직접 확인)**: 기존 카드 soft-delete 경로(`/api/articles/[id]` PUT, line 291–297·417–420)는 **클라이언트 `supabase.from("cards").update({deleted_at}).eq("id",…)` 즉 RLS 경유 `.update()`** 이며 SECURITY DEFINER RPC가 아닙니다. 그런데 `procedure_reviews`는 **쓰기 RLS 정책이 없어 클라이언트 `.update()`로 `is_public=false`를 변경할 수 없습니다**(쓰기는 RPC 전용 — §3.0). 따라서 "기존 카드삭제 경로를 그대로 재사용해 같은 `.update()` 트랜잭션에 `is_public=false`를 끼운다"는 형태는 **불가능**합니다. 현실적 유일안은 **단일 SECURITY DEFINER RPC(예: `unpublish_review(p_shortcode)`)가 카드 soft-delete(`cards.deleted_at`)와 `procedure_reviews.is_public=false`를 한 트랜잭션·동일 권한 경계에서 함께 수행**하는 것입니다(B안의 toggle 형태와 사실상 동형이나, v1은 "내리기" 단방향만 — 재공개 토글은 미지원). **따라서 (A)의 표현을 '기존 경로 재사용'이 아니라 '신규 통합 SECURITY DEFINER RPC'로 정정**합니다(명세-구현 괴리 제거). 공개 전환(재공개)은 v1 미지원(D-H상 standalone 후기 재공개만 해당, 카드·shortcode·앵커·검수 재생성 필요) — 사후 공개↔비공개 자유 토글은 별도 안건(원장 미결 Q10).

### 3.6 API 라우트 — 하위호환 + 신규

| 라우트 | 메서드 | 위임 RPC | 비고 |
|---|---|---|---|
| `/api/visits` | POST | `create_visit_with_entries` | **신규 통합 작성.** zod `VisitCreateSchema`. **v1: `p_reviews[*].is_public`는 `false`만 허용**(diary_linked 공개 후기 v1 차단, D-H) → 카드·마스킹·검수·shortcode 미발동. P3 이후 공개 허용 시 라우트가 마스킹·검수·shortcode 후 `p_reviews[*].card` 주입 |
| `/api/visits/{id}` | PATCH | `update_visit` | 신규 |
| `/api/visits/{id}` | DELETE | `delete_visit` | **신규 — v1 필수(D-I).** 연결 후기 standalone 전환 후 일기 삭제(raw DELETE 금지) |
| `/api/reviews/checkins` | POST | `upsert_review_checkin` | 신규. 알림 딥링크가 호출 |
| `/api/diaries` | POST | `create_visit_with_entries`(후기 없는 부분집합) | **하위호환.** 기존 계약 그대로 받아 `p_reviews=[]`로 위임 |
| `/api/reviews` | POST | `create_procedure_review`(확장) | **하위호환 — D-D 필수 반영(아래)** |
| `/api/reviews/{shortcode}` | PATCH | `update_procedure_review`(확장) | `recommend` 인자 추가 |

> **★`/api/reviews` 하위호환 — `create_procedure_review` INSERT 절 확장 필수 (D-D, 기술 검증 major)**: 라이브 `create_procedure_review` 본문의 `procedure_reviews` INSERT 절은 `(card_id, procedure_ko, author_id, satisfaction, pain, revisit, effect_areas, downtime, effect_onset)`만 명시합니다. 신규 `is_public`은 DEFAULT false이므로 **RPC 본문을 수정하지 않으면 신규 standalone 후기가 `is_public=false`로 저장**되어, 카드는 만들어지되 read_public 가드(`is_public=true` 요구) 도입 후 anon 노출이 끊깁니다. 따라서 "recommend 인자만 추가"가 아니라 **INSERT 절에 `is_public=true`, `source='standalone'`, `date_precision='exact'`(또는 인자) 명시 추가가 필수**입니다.

각 라우트는 현행 공통 가드를 계승: `getIdentityContext`→`idCtx.active` 401, role=user 온보딩 게이트(공개 후기 경로만; `/api/diaries`/비공개는 게이트 없음), `rateLimit`, zod `safeParse`→`errorResponse`, 성공 후 `revalidatePath("/")` + `/{handle}` (+ 후기면 `/{handle}/{shortcode}`).

신규 zod 스키마(요지):
```ts
// VisitCreateSchema = DiaryCreateSchema 확장
//  + visited_on_precision: z.enum(["exact","season","half","year"]).default("exact")
//  + clinic_home/clinic_kakao: z.string().max(...).nullable().optional()
//  + total_price: z.number().int().min(0).max(2_000_000_000).nullable().optional()
//  + is_complete: z.boolean().default(true)
//  + reviews: z.array(VisitReviewSchema).max(20).default([])
// VisitReviewSchema = ReviewCreateSchema(결론 칸) 재사용
//  + diary_procedure_index, is_public(v1: z.literal(false) — diary_linked 공개 차단 D-H),
//    solo_price, recommend, checkin_day0
// CheckinUpsertSchema = { review_id, timepoint: z.enum(["day0","week1","month1","month4"]),
//                         satisfaction?, recommend?, effect_felt?, pain?, changed_points? }
```

`.strict()`(Mass Assignment 방어)·결론 칸 enum·`effect_areas` min1 등 현행 `ReviewCreateSchema` 검증 재사용. **diary_linked 시계열은 부분 입력**이므로 결론 칸 필수성을 `is_public`·`source`에 따라 분기 — standalone은 결론 칸 필수, diary_linked는 day0 checkin만 있고 결론 칸은 롤업으로 채워질 수 있어 작성 시점엔 nullable.

### 3.7 회귀 가드 (스키마 변경과 동일 배포 — 치명)

**(a) RLS — `procedure_reviews_read_public` 교체** (§1.3.5와 동일). **(b) 집계 경로 화이트리스트** (§1.7·§2.3). **(c) review_checkin RLS** (§1.4). 본 절은 §1·§2와 중복이므로 정의는 그쪽을 참조합니다.

### 3.8 의료법·마스킹 계승 (쓰기 시점)

현행 `/api/reviews`의 `maskProhibitedMentions`(병원·의사명 "○○" 치환) + `screenContent`(role=user 소프트 검수→`pending_review`)를 **공개 후기 경로 전부**(`/api/visits`의 is_public=true 후기, `/api/reviews` standalone)에 동일 적용. 비공개 격리 필드(`clinic_*`/`total_price`/`solo_price`/`visited_on` 원본/`doctor_name`/`manager_name`/`diary_body`)는 카드·앵커·집계 입력에 **부재** — RPC가 이 값들을 공개 경로로 복사하지 않음으로써 구조적으로 보장. 가격 공개(solo_price 정확값) v1 보류 — `solo_price`는 `procedure_reviews`(비공개 own RLS)에만 저장.

### 3.9 다른 세션(FOLLOW)과의 순서 조정

- 마이그레이션 번호: **0292 이상**(0290·0291 점유). 착수 시점 최신+1.
- `supabase/migrations/`·`notification-kinds.ts`는 follow 세션과 공유 영역 → 시계열 checkin 리마인더 알림 종류 추가는 follow 머지 후(명시 stage, `-A` 금지). 예약알림은 §6 소관이며, 본 쓰기 RPC는 visit 생성 시 `diaries.visited_on +7/+30/+120`의 예약 행을 day0 checkin 제출 RPC 내부에서 `scheduled_notification`에 적재(§6.4).

---

## 4. UI·UX 플로우

### 4-1. 진입 — 통합 글쓰기 탭 계승

현행 `/write` 진입 구조를 그대로 계승합니다.

- 서버 `src/app/write/page.tsx` → `WriteView`(탭 카드 크롬) → `WriteTabs`(폼 디스패치) → 각 폼. 3단 구조 무수정.
- `WriteView.tsx`의 `BASE_TYPES` 4탭(시술노트=`record`/시술후기=`review`/끄적끄적=`doodle`/Q&A=`qa`) 라벨·키 무변경. **개편은 "시술노트"·"시술후기" 탭 내부 폼의 확장이지 새 탭 추가가 아닙니다.**
- 딥링크 계약 유지: `?tab=review&proc=<시술ko>` → `ReviewForm initialProcedure` 시술 잠금 프리필.

**개편으로 추가되는 진입 동선**: 시술노트 폼 저장 완료 모달의 "시술후기 남기기" 링크에 **`visit`(=`diaries.id`) 파라미터 동반** → 후기를 일기연결(`source=diary_linked`)로 시작(4-3).

### 4-2. 시술노트 폼 확장 — `diaries` + `diary_procedures` 입력

> **컴포넌트 명명 정정 (기술 검증 major 반영)**: 본 §4가 "시술노트 폼"으로 지칭하는 대상은 **별도 `DiaryForm.tsx` 파일이 아니라** `src/components/skin/record/SkinDiaryForms.tsx` 한 파일 안에 export된 `DiaryForm` 함수입니다(라이브 확인: 이 파일에 `export function DiaryForm(...)` + `type DiaryProc = ReviewState & { … open; later }` + `procs` 상태 + 시술 태그 입력이 모두 들어 있음. `RecordView`도 같은 파일에 동거). 따라서 본 절의 확장은 **`SkinDiaryForms.tsx` 내 `DiaryForm` 함수와 `procs: DiaryProc[]` 배열의 확장**이며, 후기 아코디언(4-2-(라))은 이 단일 컴포넌트 내부의 `procs` 행 확장으로 구현합니다(신규 파일 분리 아님 — 행별 day0 입력이 비대해지면 행 렌더만 `<DiaryProcRow>` 하위 컴포넌트로 추출하되 같은 파일·같은 상태를 유지). `/review/new`의 `ReviewForm`은 record 탭과 분리된 별도 컴포넌트로, standalone 회고 후기(4-4) 담당입니다.

현행 폼 5블록(① 날짜 ② 병원검색 ③ 의사/실장 ④ 받은 시술 태그 ⑤ 비공개 노트) 유지, LOCKED 신규 컬럼 입력 추가.

#### (가) 어림시기 칩 — `diaries.visited_on_precision`

날짜 버튼 아래 정밀도 칩 그룹 추가. `visited_on_precision CHECK(exact/season/half/year)` 매핑.

| 칩 라벨 | 저장값 | 날짜 처리 |
|---|---|---|
| 정확한 날짜 | `exact` | 현행 인라인 달력(일 단위) |
| 계절쯤 | `season` | 연·계절 → 대표일 정규화(봄=03-01) |
| 상·하반기 | `half` | 연·반기 → 대표일(상반기=01-01, 하반기=07-01) |
| 연도만 | `year` | 연 → 대표일(01-01) |

`exact` 외 칩 선택 시 달력 UI를 연/계절·반기 셀렉터로 치환(`calOpen` 영역 재활용). `DiaryDetailView` 표시는 "2026년 봄쯤" 등으로 라벨링. RPC `create_visit_with_entries`에 `p_visited_on_precision` 인자, `/api/visits`·`VisitCreateSchema`도 확장 대상.

#### (나) 병원 부가정보 — `clinic_home` / `clinic_kakao`

picked 확정 후 보더리스 라인 2칸 추가(현행 addr/tel 입력 패턴). 둘 다 비공개 격리.

#### (다) 총액 — `diaries.total_price`

현행 시술별 price/unit_text **입력 UI만 숨기고**(입력 폐지), LOCKED 가격은 **방문 총액(`diaries.total_price`)**으로 일원화합니다. ⑤ 비공개 노트 위에 "총 결제금액(선택)" 숫자 입력 1칸 추가. 비공개 격리.

> **폐지 범위 정정 (기술 검증 major 반영) — UI-only, 컬럼·RPC 유지(비파괴)**: `diary_procedures.price`/`unit_text` **컬럼·`create_diary`(→`create_visit_with_entries`) 파라미터는 제거하지 않습니다**(파괴적 변경 회피). 라이브 확인 결과 86행 중 `price` 2건·`unit_text` 1건만 채워져 있어 입력 동선 제거 영향은 미미하나, 기존 채워진 행의 **표시(`DiaryDetailView`)는 컬럼이 남아 있으므로 하위호환 유지**됩니다(값이 있으면 표시, 없으면 `procedure_ko`·`note` 중심 — §4-6과 정합). 즉 신규 작성은 시술별 가격을 받지 않고 총액으로 일원화하되, 컬럼 drop·RPC 시그니처 축소 같은 파괴적 DDL은 **차기 위생작업(죽은 컬럼 정리)과 함께** 별도 안건으로 분리합니다.

#### (라) 받은 시술 태그 — `diary_procedures` 무변경 + 후기 아코디언 토글

현행 ④ "받은 시술" 태그 입력이 곧 `diary_procedures` 행 목록이며 LOCKED "순수 기록" 정의와 일치하므로 자료구조·UX 무변경. 각 행은 `note`(샷수·바이알·부위) 메모 3상태 보유.

후기 아코디언 추가:
- 각 시술 행에 **`후기 쓰기(시계열)` 토글** 추가.
- **미펼침**(기본) → `diary_procedures`만 생성, `procedure_reviews` 미생성. 순수 기록. 집계 무관.
- **펼침** → 그 시술에 `procedure_reviews` 1행(`source=diary_linked`, `visit_id`=저장될 `diaries.id`, `diary_procedure_id`=그 행, `date_precision=exact`, **v1: `is_public=false` — 비공개 시계열 전용, D-H**) + **day0 체크인 폼**(4-5) 인라인. **v1에서 이 아코디언은 공개 토글을 노출하지 않습니다**(diary_linked 공개 후기는 v1 차단). 공개 후기를 원하면 standalone 회고 후기(4-4)로 별도 작성.
- `DiaryForm`(=`SkinDiaryForms.tsx` 내 함수) 저장 시점엔 아직 id가 없으므로 **저장(`create_visit_with_entries`, p_reviews에 펼친 행 포함) → 반환 id 수신**의 원자 처리. `create_visit_with_entries`가 visit+procedures+reviews+day0를 한 트랜잭션에서 생성하므로 2단 호출 불필요(§3.2). v1은 `is_public=false`만 보내므로 이 트랜잭션에 카드·shortcode·앵커가 끼지 않아 부분실패 재시도 문제가 없습니다(§3.2 검수·shortcode 위치 참조).

`DiaryProc` 타입은 이미 `ReviewState & { open: boolean; later: boolean }` 구조라 day0 측정값 슬롯이 준비됨. 단 현행 `emptyReview()` 필드는 결론칸 직접입력용이라 시계열 day0(timepoint/effect_felt/changed_points)과 필드가 다름 — day0 전용 입력 상태 별도 추가(4-5).

### 4-3. 저장 완료 모달 — 일기연결 후기로 유도

현행 `savedModal`은 저장 후 시술마다 `/write?tab=review&proc=<label>` 링크를 띄움(standalone 시작).

개편 후:
- 후기 링크에 **`&visit=<diaries.id>&dp=<diary_procedure_id>`** 동반 → `ReviewForm`이 `source=diary_linked`로 시작.
- 4-2-(라)에서 이미 펼쳐 day0를 입력한 시술은 모달 링크에서 제외(중복 방지).
- "나중에 쓸게요" → `reminder_stage=0` 유지. 예약 알림(week1/month1/month4)은 `visited_on` 기준 별도 발사(§6)되므로 즉시 안 써도 시계열 안 끊김.

### 4-4. 회고 후기(standalone) — ReviewForm 결론칸 직접입력

`ReviewForm.tsx`의 현행 8필드(① 시술 잠금 ② 만족도 별점 ③ 통증 표정 ④ 다운타임 ⑤ 재시술의향 ⑥ 체감효과 멀티칩 ⑦ 효과시기 ⑧ 한줄후기)가 **그대로 LOCKED 결론칸 직접입력**. 666건 기존 후기가 이 형태이며 무손실 유지.

추가/변경:
- **(가) 어림시기 칩 — `date_precision`**: visit_id 없는 standalone은 날짜 불명확. ① 아래 어림시기 칩(정확/계절/반기/연도) 추가. 기존 666건은 `exact` 백필.
- **(나) 추천의향 — `recommend`**: 현행 ⑤ 재시술의향(`revisit`)과 별개. "다른 분께 추천?" 단일선택 칩(`ChoiceField` 재사용). revisit(내가 또)과 recommend(남에게 권할지)는 의미 다름.
- **(다) 공개/비공개 토글 — `is_public`**: LOCKED `is_public default false`이며 공개해야만 카드·집계·앵커 생성. 제출 버튼 위 토글 추가. `is_public=true` → 현행 필수검증(`canSubmit`) 그대로 강제(공개 카드 품질). `is_public=false` → 카드·집계 없음(card_id NULL 허용, NOT NULL 완화 전제).
- **(라) 한줄후기 유지**: ⑧ 한줄후기(`cards.body`, ≤400자) LOCKED 유지 확정. 무변경.

### 4-5. 일기연결 시계열 후기 — review_checkin 폼

`review_checkin`(timepoint: day0/week1/month1/month4)을 입력하는 경량 시점 폼.

#### (가) day0 — 시술 당일 즉시

| 항목 | review_checkin 컬럼 | UI 컨트롤(재사용) |
|---|---|---|
| 만족도 | `satisfaction` | `StarField`(별점) |
| 추천의향 | `recommend` | `ChoiceField` 칩 |
| 통증 | `pain`(day0만) | `FaceField`(표정) |
| 효과 체감도 | `effect_felt` | `StarField` 또는 칩 |
| 달라진 점 | `changed_points text[]` | `EffectChip` 멀티칩 |

`pain`은 "day0만 의미"라 week1/month1/month4 폼에선 통증 숨김. 매 체크인 제출 시 결론칸 롤업이 RPC 내부 갱신(트리거 아님). 프런트는 추이그래프(4-7)만 반영.

#### (나) week1 / month1 / month4 — 알림 딥링크

예약 알림(`visited_on` +7/+30/+120) 푸시 → 탭 시 해당 timepoint 체크인 폼 딥링크(예: `/review/checkin?review=<procedure_reviews.id>&t=week1` — 실제 경로는 §6과 합의). day0 폼에서 통증 뺀 동일 컨트롤. `UNIQUE(review_id, timepoint)`라 재진입은 upsert 수정. "건너뛸게요" → 미제출. `reminder_muted`로 이후 알림 차단.

#### (다) month4 회고 보강

month4 폼에만 "돌이켜보니 효과는 언제부터?" 단일선택(`EFFECT_ONSET_OPTIONS` 재사용)을 추가해 `procedure_reviews.effect_onset`(결론칸)을 직접 보강.

### 4-6. /notes 캘린더·타임라인 — visit 연동

`/notes`(`RecordNotesView`)는 현재 후기 DB 연결이 없어 맨 밑 "내 후기" 섹션에 전부 독립 후기로 표시(코드 주석이 이 한계·확장지점 명시).

개편으로 실현:
- `procedure_reviews.visit_id` FK로, `notes/page.tsx` 서버 조회를 `diaries LEFT JOIN procedure_reviews ON visit_id`로 확장.
- `RecordNotesPanel`의 `RecEntry` 타입에 주석 예고된 **`linkedReviews?: MyReview[]`** 필드 추가, 타임라인/달력/목록 각 뷰 노트 카드 아래 `ReviewBox`(이미 export)로 연결 후기 렌더.
- standalone 후기(`visit_id` NULL)는 현행대로 "내 후기" 섹션.
- 노트 카드에 **"시계열 진행중" 상태 배지**: 연결 후기가 `source=diary_linked`이고 미완료 timepoint 남으면 노출.

`DiaryDetailView`(`/notes/[id]`)에도 `diary_procedures` 목록 아래 시술별 후기 진행 상태 + 추이그래프 진입 추가. price/unit_text는 비어 있으므로 `procedure_ko`·`note` 중심 표시.

### 4-7. 개별 후기 추이그래프 — review_checkin 표시

LOCKED: "review_checkin은 개별 후기 추이그래프 표시용 — 집계서 끌어오지 않음." 한 후기의 시점별 점을 잇는 개인용 시각화(집계 아님).

- 표시 위치: 일기연결 후기 상세(또는 `/notes/[id]` 그 시술 행 펼침)에 만족도·추천·효과체감 day0→week1→month1→month4 꺾은선.
- x축 = timepoint 4점, y축 = 1~5. 미제출 시점은 점 누락.
- `changed_points`는 시점별 칩 변화 타임라인 보조 표시.
- 신규 컴포넌트. 공개 집계 리포트와 **데이터 출처·권한 완전 분리** — 추이그래프는 owner-only, 집계 리포트는 anon 공개. 회귀 가드(b) "집계는 결론칸만"과 정합.

### 4-8. 컨트롤 재사용 매핑

| 신규 입력 | 재사용 컴포넌트(ReviewForm.tsx) | 비고 |
|---|---|---|
| 만족도/효과체감(체크인) | `StarField` | 1~5 별점 |
| 통증(day0) | `FaceField` | 표정 1~5, day0 전용 |
| 추천의향/어림시기/효과시기 보강 | `ChoiceField` + `Chip` | 단일선택 칩 |
| 달라진 점(changed_points) | `EffectChip` + `EFFECT_AREA_OPTIONS` | 멀티칩 |
| 시술 선택(일기연결 day0) | `initialProcedure` 프리필 잠금 | `diary_procedures.procedure_ko` 주입 |
| 어림시기 날짜 셀렉터 | `DiaryForm` 인라인 달력 확장 | exact 외 연/계절·반기 셀렉터 |

본 섹션은 UI·UX 동선·컴포넌트 확장 지점만 규정합니다. 신규 RPC 인자·체크인 딥링크 라우트 명세는 §1·§3·§6에서 확정.

---

## 5. 공개 집계·분석·리포트·SEO

### 5.0 현재 집계 경로의 Ground Truth (코드·DB 직접 검증)

근거: `src/lib/procedure-report.ts`(getProcedureReport·getFamilyReviewCardIds·getReportSummaryForTag·getReviewSummaryFeedPool), `reports/[procedure]/page.tsx`, `post-category.ts`, `api/reviews/route.ts`. DB: `get_review_summary_pool`·`get_review_report_overview`(admin)·`get_procedure_review_demographics`·`procedure_family`. 데이터: `procedure_reviews` 666건 전수 `card_id IS NOT NULL`, `satisfaction IS NULL` 0건.

검증 결과 **현행 4개 집계 경로 모두 `procedure_reviews JOIN cards ... rc.type='review' AND rc.status='published' AND rc.deleted_at IS NULL` 통과**. "카드 없는 행"은 JOIN 단계에서 자연 배제. 본 개편이 `card_id`·평가칸 nullable 완화 + `is_public`/`source` 도입하므로 **표면 방어(`is_public=true AND card_id IS NOT NULL`)를 명시 추가**(1순위 회귀 가드).

### 5.1 집계 입력 정합 규칙 — "결론 칸만, 공개만" (단일 출처)

| 규칙 | 내용 |
|---|---|
| 결론 칸만 읽음 | `procedure_reviews` 결론 칸만 읽음. `review_checkin` 미참조 |
| 공개·평가완비만 | `is_public = true AND card_id IS NOT NULL` 행만 분모 |
| 기록만 행 배제 | `diary_procedures`는 후기 아님 → 집계 무관 |
| 비공개 시계열 배제 | `is_public=false` 행은 카드·집계 없음 |

"기록만 시술"이 `diary_procedures`에 분리 잔존하므로 **평가-NULL 행이 집계 모수에 섞일 원천 소멸**. 신규 위험 2종:
1. **진행중 시계열 부분입력 행** — `source=diary_linked`는 day0 직후 생성, month4 전까지 결론칸 일부 NULL 가능. → `avg()`는 NULL 자동 제외(부분집계)로 흡수, `count(*)`는 `card_id IS NOT NULL` 기준.
2. **비공개 개인 시계열 행** — `is_public` 필터로 차단.

### 5.2 회귀 가드 — DDL/RLS (스키마 변경과 동일 배포 묶음, 치명)

**마이그(0292 이상, 착수 시점 최신+1)와 동일 트랜잭션/배포 묶음**에 포함.

**(a) RLS** — `procedure_reviews_read_public` 교체(§1.3.5). **(b) 집계 RPC** — 세 RPC 모두 `agg` LATERAL/CTE WHERE에 `AND pr.is_public = true`(가능하면 `AND pr.card_id IS NOT NULL`) 추가:

| RPC | 마이그(현행) | 수정 |
|---|---|---|
| `get_review_summary_pool` | 0218/0228 | `agg` LATERAL WHERE `AND pr.is_public = true` |
| `get_review_report_overview` | 0238(admin) | 동일 |
| `get_procedure_review_demographics` | 0212/0227 | CTE `r` WHERE `AND pr.is_public = true`(현재 `c.status='published'`만, `rc.type='review'` 필터 없음) |

> **★`get_review_summary_pool` 가드 실효 범위 (FIX-6)**: 이 함수는 `LANGUAGE sql STABLE`(**SECURITY DEFINER 아님**, 라이브 확인)이므로 **anon 호출 시 호출자 권한으로 실행되어 `procedure_reviews`의 `read_public` RLS로 이미 필터**됩니다(is_public=false·card_id NULL·카드 미published/soft-deleted 행은 anon에게 애초에 안 보임). 따라서 이 RPC 본문에 `is_public=true` 가드를 추가하는 실효는 **anon 경로가 아니라 service-role/elevated 클라이언트(RLS 우회) 호출 시의 defense-in-depth**입니다(D-B). `get_review_report_overview`는 admin 전용 경로라 동일하게 elevated 방어, `get_procedure_review_demographics`도 같은 성격입니다. 요컨대 (b) RPC 가드는 RLS가 닿지 않는 elevated 경로의 이중화이며, anon 노출 차단의 1차 방벽은 (a) RLS(`read_public`)입니다.

**(c) 코드** — `getProcedureReport`·`getFamilyReviewCardIds` 체인에 `.eq("is_public", true)`:

```ts
const { data } = await supabase
  .from("procedure_reviews")
  .select("satisfaction, pain, revisit, effect_areas, downtime, effect_onset, recommend, card:cards!inner(status, deleted_at)")
  .in("procedure_ko", family)
  .eq("is_public", true)            // ← 신규 표면 방어
  .eq("card.status", "published")
  .is("card.deleted_at", null)
  .returns<Row[]>();
```

RLS(a)가 anon 차단하나, 코드 표면 방어는 service-role/admin client 미래 경로 defense-in-depth.

### 5.3 부분집계·이중집계(family) — 유지

**부분집계** — `procedure-report.ts` 분포 누적 루프가 이미 NULL/범위외 분모 제외(`if (s >= 1 && s <= 5)`, `onsetAnswered`/`downtimeAnswered`). DB `avg`도 NULL 제외. 시계열 부분입력 행이 들어와도 만족도 평균엔 포함, 효과시기 분모엔 제외(현행 동작 그대로 옳음).

**이중집계(family)** — `procedure_family(ko)`(0225, `ARRAY[p_ko] || 직속 자식 ko`)가 SSOT. 세 집계 경로 모두 통과. 부모는 자기+직속하위, 자식은 자기만. **건드리지 않음.**

### 5.4 "달라진 점" × 인구통계 — 분석 RPC

`effect_areas text[]`(666건 100% 채움)가 "달라진 점" 1차 출처, `review_checkin.changed_points`는 시계열 보강. **집계는 결론 칸(`procedure_reviews.effect_areas`)만 읽고 `review_checkin` 미참조** — 시계열 "달라진 점"은 롤업으로 결론칸에 반영된 값만 분석 진입.

신규 RPC `get_change_analysis`(가칭, 마이그 0292 이상):

```sql
CREATE FUNCTION public.get_change_analysis(p_min_count int DEFAULT 4)
RETURNS TABLE(
  procedure_ko text, effect_label text,
  age_band text, gender text, cnt bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  WITH base AS (
    SELECT
      pr.procedure_ko,
      unnest(pr.effect_areas) AS effect_label,
      CASE
        WHEN p.birthdate IS NULL THEN NULL
        WHEN extract(year from age(p.birthdate)) < 20 THEN '10대'
        WHEN extract(year from age(p.birthdate)) < 30 THEN '20대'
        WHEN extract(year from age(p.birthdate)) < 40 THEN '30대'
        WHEN extract(year from age(p.birthdate)) < 50 THEN '40대'
        ELSE '50p' END AS age_band,
      p.gender
    FROM public.procedure_reviews pr
    JOIN public.cards c ON c.id = pr.card_id
    JOIN public.profiles p ON p.id = pr.author_id
    WHERE pr.is_public = true              -- ★결론칸·공개만
      AND pr.card_id IS NOT NULL
      AND c.status = 'published' AND c.deleted_at IS NULL
      AND pr.effect_areas IS NOT NULL
  )
  SELECT procedure_ko, effect_label, age_band, gender, count(*)
  FROM base
  WHERE effect_label <> '효과 없음'        -- EFFECT_NONE_LABEL 제외
    AND age_band IS NOT NULL
  GROUP BY 1,2,3,4
  HAVING count(*) >= p_min_count;          -- ★최소표본 게이트
$$;
```

주의: EFFECT_NONE_LABEL 분리(`procedure-report.ts` `noEffectCount` 규칙과 동일), 공개는 §5.5 게이트(≥4, 현행 `MIN_DOCTOR_POSTS=4`·`get_indexable_tags p_min_count=4` 정합) 통과 후, **병원별 분해 금지**(`diaries` JOIN 안 함). `effect_areas` 100%로 v1부터 산출 가능하나 공개 노출(대시보드/SEO)은 변호사 후 단계.

### 5.5 noindex/index·JSON-LD — 무변경 + 표본 게이트

**카테고리 인덱싱(불변, `post-category.ts`)**: `review`=noindex, `review_summary`=index. 카테고리 4종 무변경. `is_public=false` 후기는 카드 없어 index 후보 아님.

**`/reports/[procedure]`**: `report=null`이면 `robots:{index:false}`, 후기 있으면 `index:true`. §5.2 가드로 집계 모수가 공개·평가완비 후기만으로 좁혀져 `report.count`·`AggregateRating.ratingCount`·`<title>` "후기 N건"이 거짓 팽창하지 않음. JSON-LD `aggregateRating`·`additionalProperty`는 라이브 집계값, 산식 무변경.

**회귀 주의**: `.eq("is_public", true)` 추가해도 카드 살아있는 660건이 is_public=true(백필, FIX-2)이고 집계는 어차피 `deleted_at IS NULL` JOIN이라 **count·avg 무변동**(집계 모수 660/660, soft-deleted 카드 6건은 백필 전에도 집계 부재, satisfaction NULL 0건). 리포트 수치·별점·canonical 회귀 0. §5.4 분석의 SEO 확장 시에만 신규 index 표면 → 표본 게이트(≥4) + 비식별 선결. v1은 `get_change_analysis`를 관리자 대시보드(noindex) 한정 권장.

### 5.6 의료법·비식별 — 집계 입력 화이트리스트

집계 함수는 **`procedure_reviews`(결론 칸) + `profiles`(성별·생년월일 비식별 버킷)만** 읽고 **`diaries`/`diary_procedures` JOIN 안 함**(검증: 네 함수 모두 `diaries` 부재). 병원명·주소·전화·홈·카톡·`total_price`·`solo_price` 정확값·`visited_on` 원본·`doctor_name`·`manager_name`·`diary_body`는 스키마 분리로 집계 입력에 물리적 부재.

| 비식별 메커니즘 | 위치 | 본 개편 |
|---|---|---|
| 인구통계 버킷 집계 | `get_procedure_review_demographics` | 유지 + `is_public` 가드 |
| 병원·의사 마스킹 | `maskProhibitedMentions`(API) | 공개 전환·단답 재사용 |
| 소프트 검수 | `screenContent`(role=user) | is_public 후기에만 |
| 병원별 공개 집계 금지 | `diaries` JOIN 부재 | `get_change_analysis`도 병원 분해 금지 |
| 가격 공개 보류 | `solo_price`/`total_price` 제외 | v1 보류(변호사 후 v2 버킷만) |

### 5.7 회귀 가드 체크리스트 (집계 한정)

1. **(치명) RLS** `read_public`에 `is_public=true AND card_id IS NOT NULL`.
2. **(치명) 집계 RPC 3종** WHERE에 `is_public=true`.
3. **(치명) 코드** `procedure-report.ts` 2함수에 `.eq("is_public", true)`.
4. **(검증) 수치 무회귀** 660건 백필(FIX-2 — soft-deleted 카드 6건 제외) → count/avg/ratingCount 무변동(6건은 백필 전에도 집계 부재).
5. **(유지) 부분집계** NULL 분모 제외.
6. **(유지) 이중집계** `procedure_family` 롤업.
7. **(비집계) `review_checkin`** 어떤 집계도 미참조 — 추이그래프(noindex) 전용.
8. **(비식별) 집계 입력** `diaries`/`diary_procedures` JOIN 0. `get_change_analysis` 게이트 ≥4.

참고 파일(절대경로):
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\src\lib\procedure-report.ts`
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\src\app\reports\[procedure]\page.tsx`
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\src\lib\post-category.ts`
- `C:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\src\app\api\reviews\route.ts`

확인 필요: `recommend`는 신규이며 현행 집계 RPC·Row에 미포함. 추천의향 분포를 리포트/JSON-LD에 노출할지는 별도 결정. 본 섹션은 집계 경로의 `is_public` 가드에 `recommend`도 동일 포함됨을 전제(노출 UI 미정).

---

## 6. 알림·리텐션 엔진

핵심 제약(production 직접 조회): **pg_cron 미설치(pg_net만)**, `notifications` 테이블에 **미래 발사 시점 컬럼 부재**(전부 즉시 발사형), `notifications.kind`는 enum이 아니라 **CHECK 제약**(`notifications_kind_check`, 현재 9종: comment/reply/like/save/review_request/published/report/keyword/follow_post). 따라서 예약 알림은 신규 `scheduled_notification` 테이블 + Vercel Cron 일배치로 구현하고, 발사 순간은 **기존 `notifications` INSERT → `trg_notifications_push_webhook` → `/api/push/send` → Web Push(VAPID)/FCM** 파이프라인을 그대로 재사용(신규 발송 배선 0개).

### 6.1 현행 패턴 정독 (재사용 근거)

| 자산 | 위치 | 재사용 방식 |
|---|---|---|
| Vercel Cron + `CRON_SECRET` | `vercel.json::crons`, `api/cron/{indexnow,keyword-digest}` | `Authorization: Bearer ${CRON_SECRET}` idiom. 신규 `/api/cron/diary-reminders` |
| 커서 기반 정확히-1회 집계 | `run_keyword_digest()`(`keyword_digest_state` 1행 `FOR UPDATE` + set-based INSERT) | 리마인더 RPC 동일 idiom |
| 알림→푸시 자동 전파 | `trg_notifications_push_webhook` AFTER INSERT → `/api/push/send` | `scheduled_notification` 발사가 `notifications` INSERT만 하면 푸시 자동(message/url-only 발송 이미 동작). **단, 신규 kind의 푸시 제목 렌더(`KIND_TITLES`)는 검증·추가 필요(아래 ★)** |
| 종류별 토글 | `notification_preferences`(`profile_id` PK) + `get_my_notification_prefs` + `/api/notifications/preferences` | 신규 토글 컬럼 추가만 |

`keyword-digest` cron = KST 06:00(`0 21 * * *` UTC), `indexnow` = 04:00(`0 19 * * *`). 리마인더 cron은 분리된 시각.

> **★신규 kind 푸시 제목 렌더 검증 — P4 착수 전 필수 게이트 [확인 필요] (기술 검증 major 반영, 재초점)**: 라이브 정독 결과 두 사실이 확정됐습니다 — **(1) message/url-only 발송은 이미 동작**: `/api/push/send/route.ts`(정상 읽힘, `.tmp`는 stale)는 `const {recipient_id, kind, message, url} = body.record; if(!recipient_id||!message) skip`(line 88–91)만 요구하므로, 본 트랙이 INSERT하는 `actor_id`·`card_id`·`comment_id` NULL + `message`/`url`만 채운 행도 정상 발송됩니다. 트리거(`notifications_push_webhook`)도 `jsonb_build_object`로 NULL을 담아 POST하며 NULL에 죽지 않습니다. **따라서 ★게이트의 핵심 미검증 사항은 'message/url-only 발송 가능 여부'가 아닙니다(이미 OK).** **(2) 미해결 핵심 = 제목 렌더(`KIND_TITLES`)**: `/api/push/send/route.ts`의 `KIND_TITLES` Record(line 113–122)에 신규 `diary_reminder`가 없으면 푸시 제목이 fallback `"피부텐텐"`(line 123)으로, `review_request` 매핑 시 `"🩺 검수 요청"`(의미 왜곡)으로 나갑니다. **P4 검증 게이트 = (a) `KIND_TITLES`에 `diary_reminder` 제목(예: `⏰ 후기 리마인드`)을 추가했는지, (b) 추가한 kind가 `notification-kinds.ts`의 `DISPLAY_MODE`·라벨과 정합해 클라이언트 알림 목록 렌더가 깨지지 않는지**의 실측입니다. (`/api/push/send/route.ts` append-only 수정은 follow 세션과 공유 영역 — §6.7 순서로 follow 머지 후.)

### 6.2 신규 예약 알림 인프라 — `scheduled_notification`

```sql
-- migration 0292+ (실제 번호: 착수 시점 최신+1. 현재 ceiling 0291_follows_lock_select.sql → 0292 이상)
-- ⚠ supabase/migrations/ 는 follow 세션과 공유 → 번호 하드코딩 금지(§6.7)
CREATE TABLE public.scheduled_notification (
  id            bigserial PRIMARY KEY,
  recipient_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('review_checkin','diary_incomplete')),
  visit_id      bigint REFERENCES public.diaries(id) ON DELETE CASCADE,
  review_id     bigint REFERENCES public.procedure_reviews(id) ON DELETE CASCADE,
  timepoint     text CHECK (timepoint IN ('week1','month1','month4')),  -- day0는 즉시이므로 예약 대상 아님
  fire_after    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','cancelled','skipped')),
  sent_at       timestamptz,
  message       text NOT NULL,                   -- 비식별(§6.6)
  url           text NOT NULL,                   -- checkin 폼 딥링크
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ★멱등 UNIQUE는 트랙별 부분 인덱스로 분리 (기술 검증 major 반영).
--   트랙 A(review_checkin): 한 visit 다중 시술 → review 여러 개 × 3시점이므로
--     (review_id,timepoint)로만 멱등. visit_id는 같은 visit 내 여러 행에 중복 정상.
--   트랙 B(diary_incomplete): visit당 1건 회수이므로 visit_id로 멱등.
CREATE UNIQUE INDEX uq_sched_notif_checkin
  ON public.scheduled_notification (review_id, timepoint)
  WHERE kind = 'review_checkin';
CREATE UNIQUE INDEX uq_sched_notif_incomplete
  ON public.scheduled_notification (visit_id)
  WHERE kind = 'diary_incomplete';

CREATE INDEX idx_sched_notif_due
  ON public.scheduled_notification (fire_after)
  WHERE status = 'pending';

ALTER TABLE public.scheduled_notification ENABLE ROW LEVEL SECURITY;
-- ★notifications_select_own 과 토씨까지 동일하게: TO authenticated + auth.uid() IS NOT NULL 가드
--   (라이브 확인: notifications_select_own = TO authenticated, USING
--    ((auth.uid() IS NOT NULL) AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid())))).
CREATE POLICY sched_notif_read_own ON public.scheduled_notification
  FOR SELECT TO authenticated
  USING (
    (auth.uid() IS NOT NULL)
    AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid()))
  );
```

> **★RLS qual 정정 (기술 검증 [치명] 2건 반영)**: `recipient_id`는 `profiles(id)`를 FK 참조하는데(라이브 확인: `scheduled_notification.recipient_id → profiles ON DELETE CASCADE`, 발사 시 `notifications.recipient_id`에도 `profiles(id)`인 `d.profile_id`를 적재), `auth.uid()`는 **로그인 auth 유저 id**입니다. ADR 0014에서 `profile_id`(명함 UUID)와 `auth_user_id`(로그인 UUID)는 명시적으로 분리된 서로 다른 값이며, 라이브 검증 결과 **profiles 129행 중 10행이 `id <> auth_user_id`**(한 로그인이 doctor/bundle 묶음으로 여러 명함 소유, NULL auth 0행)입니다. 따라서 초안의 `USING (recipient_id = auth.uid())`로는 이 10개 명함으로 적재된 예약 알림을 소유자가 SELECT 하지 못합니다. 정정안은 **기존 `notifications_select_own` 정책과 실제로 일치**하도록 — 역할(`TO authenticated`)·NULL 가드(`auth.uid() IS NOT NULL`)·qual(`recipient_id = COALESCE(current_active_profile_id(), auth.uid())`)을 **세 요소 모두** 갖춰 `CREATE POLICY sched_notif_read_own ON public.scheduled_notification FOR SELECT TO authenticated USING ((auth.uid() IS NOT NULL) AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid())))`로 둡니다(라이브 확인: `notifications_select_own` = `roles={authenticated}`, `qual=(auth.uid() IS NOT NULL) AND (recipient_id = COALESCE(current_active_profile_id(), auth.uid()))`). 초안이 `FOR SELECT USING(recipient_id = COALESCE(...))`만 두어 `TO authenticated`·`auth.uid() IS NOT NULL` 두 절을 누락한 것은 "토씨까지 동일" 주장과 어긋났던 부분이며(기능상 anon 은 `current_active_profile_id()`·`auth.uid()`가 NULL → `recipient_id=NULL`로 0건이라 유출은 없으나 심층방어 일관성 D-B 정신에 어긋남), 위와 같이 보강했습니다. 이로써 §1.4 `review_checkin` RLS(`FOR SELECT TO authenticated`)·§1.5 `review_symptom`/`short_answer_response`(둘 다 `FOR SELECT TO authenticated`)·§3.3 권한검증·`diaries` owner-only RLS의 `COALESCE(current_active_profile_id(), auth.uid())` 패턴과 역할·가드 차원까지 통일합니다. 디스패처가 `notifications`로 승급할 때 `recipient_id`에 `d.profile_id`(=`profiles(id)`)를 넣는 부분(§6.4 라인 `SELECT d.profile_id, …`)은 FK·RLS 정합상 올바르므로 그대로 둡니다.

> **review_checkin/review_symptom/short_answer_response owner-only 정책의 묶음 명함 정합 명시 (D-G)**: 위 세 보조 owner-only 정책은 `pr.author_id IN (SELECT p.id FROM profiles p WHERE p.auth_user_id = auth.uid())` 패턴, 즉 **"한 auth.uid()가 소유한 모든 명함"** 범위로 가시성을 엽니다. ADR 0011/0012(명함 단위 격리)와 ADR 0015(active identity 게이트)의 의도와의 정합을 다음으로 확정합니다 — **본 시계열·증상·단답 데이터는 "측정 소유자(=후기 작성자)의 사적 데이터"이며 active 명함 전환과 무관하게 같은 로그인 사용자가 자기 후기의 체크인을 조회·수정할 수 있어야** 하므로, `notifications`/`scheduled_notification`(active 명함 수신함, `COALESCE(current_active_profile_id(), …)`)와 달리 **`auth_user_id` 단위(=로그인 소유 전 명함) 가시성을 의도된 동작으로 채택**합니다. 즉 수신함 알림은 active 명함 단위, 측정 원본 데이터는 로그인 단위로 일관 분리합니다. (쓰기는 RPC 권한검증이 `author_id`의 명함 소유를 `auth_user_id = auth.uid()`로 검증하므로 동일 기준.)

`kind`를 `scheduled_notification` 안에서 별도 CHECK로 두는 이유는 `notifications.kind` CHECK와 분리하기 위함입니다(예약 사유 vs 실제 발사 kind를 매핑하되 동일 enum 강제 안 함, §6.5).

### 6.3 두 리텐션 트랙

#### 트랙 A — 시계열 측정 리마인드 (코어)
diary_linked 후기에서 day0 즉시 제출 후 week1/month1/month4를 회수. 발사 시점은 **`diaries.visited_on` 기준**(시술 실제 경과일 기준이어야 의학적 의미):
- `visited_on + 7일` → `week1` / `+30일` → `month1` / `+120일` → `month4`

각 알림은 `review_id` + `timepoint` checkin 폼 딥링크로 이동. **예약 적재 시점**: day0 checkin 제출 RPC 내부에서 week1/month1/month4 3행을 `scheduled_notification`에 INSERT. `visited_on_precision <> 'exact'`(어림) 또는 `source='standalone'`(회고) 후기는 적재하지 않음 — **회고 후기는 review_checkin 0건, 예약 0건**.

#### 트랙 B — 미완성 회수 (`is_complete=false`) — D-C 정합
LOCKED의 `is_complete`/`reminder_stage`/`reminder_muted`가 상태기. 시술일기를 시작했지만 마무리 안 한 미완성 일기를 1~2회 회수.
- 자격: `is_complete = false AND reminder_muted = false AND reminder_stage < {상한}`.
- 발사 1회마다 `reminder_stage += 1`. 상한 도달 시 중단.
- 완성(`is_complete=true`)·"그만 알림"(`reminder_muted=true`) 시 즉시 중단.

> **D-C 전제**: 트랙 B의 `is_complete=false` 미완성 일기 행이 실제로 존재하려면 통합 작성 RPC `create_visit_with_entries`가 `procedures_empty` 가드를 면제해야 합니다(§3.2). 현행 `create_diary`로는 시술 0개 일기 생성이 불가하므로, 가드 면제 전까지 트랙 B 발사 자격 SQL은 0건 매칭됩니다.

### 6.4 디스패처 — `/api/cron/diary-reminders` + Vercel Cron

```ts
// src/app/api/cron/diary-reminders/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("run_diary_reminders");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : data;
  return Response.json({ ok: true, ...row });
}
```

```jsonc
// vercel.json::crons 에 1행 추가 (09:00 KST = 0 0 * * *)
{ "path": "/api/cron/diary-reminders", "schedule": "0 0 * * *" }
```

디스패처 RPC `run_diary_reminders()`(트리거 아님·멱등):

```sql
CREATE OR REPLACE FUNCTION public.run_diary_reminders()
RETURNS TABLE(track_b_enqueued int, fired int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_enq int := 0; v_fired int := 0;
BEGIN
  PERFORM 1 FROM public.diary_reminder_state WHERE id = true FOR UPDATE;

  -- 트랙 B 적재 (멱등: 부분 UNIQUE uq_sched_notif_incomplete = UNIQUE(visit_id) WHERE kind='diary_incomplete')
  INSERT INTO public.scheduled_notification
    (recipient_id, kind, visit_id, fire_after, message, url)
  SELECT d.profile_id, 'diary_incomplete', d.id,
         d.created_at + interval '2 days',
         '작성 중인 시술일기가 있어요. 마저 기록해 보세요.',
         '/write?diary=' || d.id
    FROM public.diaries d
   WHERE d.is_complete = false
     AND d.reminder_muted = false
     AND d.reminder_stage < 2
  ON CONFLICT (visit_id) WHERE kind = 'diary_incomplete' DO NOTHING;  -- 부분 UNIQUE 인덱스 추론
  GET DIAGNOSTICS v_enq = ROW_COUNT;

  -- 발사: 자격 pending → notifications 승급 (푸시는 트리거 자동)
  --   ★발사분 정확 식별 (기술 검증 major 반영): sent/skipped 는 locked CTE 가 SKIP LOCKED 로
  --     '잠근 바로 그 행'에만 적용해야 한다. 별도 UPDATE 가 status='pending' AND fire_after<=now()
  --     를 다시 평가하면, 동시 cron 인스턴스가 SKIP LOCKED 로 건너뛴(=INSERT 하지 않은) 행을
  --     sent 로 마킹하는 '발사 안 됐는데 sent'·이중 승급 창이 생긴다. 따라서:
  --       (1) locked CTE 가 due 행 전부(자격 탈락분 포함)를 SKIP LOCKED 로 잠그고 eligible 플래그 산출,
  --       (2) 그 중 eligible 만 fired CTE 로 notifications INSERT,
  --       (3) mark_sent = locked ∩ eligible, mark_skip = locked ∩ ¬eligible(diary_incomplete) — 둘 다
  --           locked id 집합 안에서만 분기하므로 SKIP LOCKED 로 건너뛴 행은 어느 쪽도 마킹 안 됨.
  --   ★diary_incomplete 재확인: update_visit 으로 is_complete=true 가 된(또는 reminder_muted=true)
  --     diary_incomplete pending 행은 발사 자격에서 탈락 → skipped. (review_checkin kind 는
  --     이 조건 비적용 — visit_id 가 NULL 일 수 있고 자격이 다름.)
  -- 정본: locked 를 한 번에 sent/skipped 로 분기하고 발사분만 fired 로 카운트.
  --   sent  = locked ∩ eligible(=실제 notifications INSERT 대상),
  --   skipped = locked ∩ ¬eligible(=diary_incomplete 자격 탈락 — 완성/뮤트).
  WITH locked AS (
    SELECT s.id,
           ( s.kind <> 'diary_incomplete'
             OR EXISTS (SELECT 1 FROM public.diaries d
                         WHERE d.id = s.visit_id
                           AND d.is_complete = false
                           AND d.reminder_muted = false) ) AS eligible
      FROM public.scheduled_notification s
     WHERE s.status = 'pending' AND s.fire_after <= now()
     FOR UPDATE SKIP LOCKED
  ),
  fired AS (
    -- ★FIX-4 — 임시 매핑의 제목 왜곡 경고: 아래 CASE 는 예약 사유(review_checkin/diary_incomplete)를
    --   라이브 notifications_kind_check 9종(comment/reply/like/save/review_request/published/report/
    --   keyword/follow_post)에 존재하는 'review_request' 로 임시 매핑한다. 그런데 diary_reminder 는
    --   이 9종에 미포함이고 KIND_TITLES(/api/push/send)에도 diary_reminder·follow_post 가 미등재라
    --   fallback "피부텐텐"이며, 'review_request' 로 매핑하면 푸시 제목이 "🩺 검수 요청"으로 왜곡된다.
    --   → 정본 처리: FOLLOW 머지 후 P4 에서 신규 kind 'diary_reminder' 로 교체하고(notifications_kind_check
    --     append + notification-kinds.ts append) KIND_TITLES 에 제목(예: "⏰ 후기 리마인드")을 추가한다(§6.5).
    --     그 전에 임시로 노출할 경우 제목 왜곡("검수 요청")은 [확인 필요] — 정본 SQL(여기)과 §6.5 권고가
    --     외견상 모순돼 보이는 것은 'P4 교체 전 임시 상태'와 'P4 최종 상태'의 시점 차이일 뿐이다.
    INSERT INTO public.notifications (kind, recipient_id, message, url, created_at)
    SELECT CASE s.kind WHEN 'review_checkin'   THEN 'review_request'  -- P4에서 'diary_reminder'로 교체(FIX-4)
                       WHEN 'diary_incomplete' THEN 'review_request'  -- P4에서 'diary_reminder'로 교체(FIX-4)
                       END,
           s.recipient_id, s.message, s.url, now()
      FROM public.scheduled_notification s
      JOIN locked l ON l.id = s.id AND l.eligible
     RETURNING 1
  ),
  mark_sent AS (
    UPDATE public.scheduled_notification s
       SET status = 'sent', sent_at = now()
      FROM locked l
     WHERE s.id = l.id AND l.eligible
    RETURNING s.id
  ),
  mark_skip AS (
    UPDATE public.scheduled_notification s
       SET status = 'skipped'
      FROM locked l
     WHERE s.id = l.id AND NOT l.eligible AND s.kind = 'diary_incomplete'
    RETURNING s.id
  )
  SELECT count(*) INTO v_fired FROM mark_sent;

  -- ★단일 CTE 체인(locked→fired→mark_sent/mark_skip)이 정본 — fired(notifications INSERT)·
  --   mark_sent(예약 sent 마킹)·mark_skip(자격 탈락 skipped) 모두 동일 locked id 집합에서만
  --   동작하므로 SKIP LOCKED 로 건너뛴 행은 sent/skipped 어느 쪽으로도 마킹되지 않는다.
  --   reminder_stage 전진은 방금 sent 로 마킹된 행(mark_sent)만 대상으로 — sent_at 근사 대신
  --   동일 사이클 id 집합 기준으로 정밀화 권장(구현 시 mark_sent 를 별도 보관해 조인).
  UPDATE public.diaries d SET reminder_stage = reminder_stage + 1
    FROM public.scheduled_notification s
   WHERE s.visit_id = d.id AND s.kind = 'diary_incomplete'
     AND s.status = 'sent' AND s.sent_at >= now() - interval '1 minute';

  RETURN QUERY SELECT v_enq, v_fired;
END; $$;
```

> ★발사분 정확 식별은 **P4 구현 게이트**입니다(골격 아님): sent/skipped 는 반드시 due/locked 가 `FOR UPDATE SKIP LOCKED` 로 잠근 동일 id 집합 안에서만 분기하고(`mark_sent`=locked∩eligible, `mark_skip`=locked∩¬eligible), 발사 카운트(`v_fired`)는 실제 `notifications` INSERT(`fired`)·`mark_sent` 행수와 일치시켜 동시 cron 인스턴스의 이중 승급·'발사 안 됐는데 sent' 창을 봉쇄합니다. `reminder_stage` 전진도 `mark_sent` id 집합 기준으로 정밀화합니다(`sent_at` 근사는 보조). 핵심 불변: "트리거 아님·RPC 멱등·발사는 `notifications` INSERT 경유". **diary_incomplete 발사 직전 자격 재확인(locked.eligible EXISTS)·sent/skipped 분기는 §6.5 중단1의 SQL 실현이며, `update_visit`이 is_complete=true 전환 시 잔여 pending 회수 알림이 발사되지 않도록 보장합니다(아래 §6.5·update_visit 정합).**

**트랙 A 적재 위치**: cron이 아니라 day0 checkin 제출 RPC 안에서 3행을 미리 `scheduled_notification(kind='review_checkin', review_id=<후기>, visit_id=<일기>, fire_after = visited_on + 7/30/120일)`로 적재. cron은 발사만. `visited_on` 기준 정확 발사 보장 + 후기 삭제 시 `ON DELETE CASCADE`로 예약 자동 회수(후기를 standalone 으로 '전환'만 하는 `delete_visit`은 CASCADE 미발동 → §3.4 (2b)가 명시 `cancelled` 처리). 멱등은 부분 UNIQUE `uq_sched_notif_checkin(review_id,timepoint)`.

> **★트랙 A `recipient_id` 적재 주체 확정 (FIX-3)**: 트랙 A 예약 INSERT의 `recipient_id`는 **`diaries.profile_id`**(= 후기 author 명함, `profiles(id)`)로 못박습니다 — `scheduled_notification.recipient_id → profiles(id)` FK와 §6.2 RLS(`recipient_id = COALESCE(current_active_profile_id(), auth.uid())`)에 정합하고, day0 후기의 `procedure_reviews.author_id`(= 같은 명함)·트랙 B의 `recipient_id := d.profile_id`와도 동형입니다. INSERT SELECT 절은 트랙 B(§6.4 위 `SELECT d.profile_id, 'diary_incomplete', …`)와 동형으로, day0 checkin 제출 RPC 안에서 대상 후기·일기를 묶어:
> ```sql
> -- day0 checkin 제출 RPC 내부(트랙 A 3행 적재). v_review_id=방금 day0 제출된 후기, v_visit_id=연결 일기.
> INSERT INTO public.scheduled_notification
>   (recipient_id, kind, review_id, visit_id, timepoint, fire_after, message, url)
> SELECT d.profile_id,                          -- ★FIX-3: 후기 author 명함(=diaries.profile_id), FK·RLS 정합
>        'review_checkin', pr.id, d.id, tp.timepoint,
>        d.visited_on + tp.days,                -- week1=+7 / month1=+30 / month4=+120
>        tp.message, '/reviews/' || pr.id || '/checkins?t=' || tp.timepoint
>   FROM public.procedure_reviews pr
>   JOIN public.diaries d ON d.id = pr.visit_id  -- pr.visit_id = v_visit_id(동일 트랜잭션 확보값)
>   CROSS JOIN (VALUES ('week1', interval '7 days',  '시술 1주 후기를 남겨주세요'),
>                      ('month1',interval '30 days', '시술 1달 후기를 남겨주세요'),
>                      ('month4',interval '120 days','시술 4달 후기를 남겨주세요'))
>            AS tp(timepoint, days, message)
>  WHERE pr.id = v_review_id
>    AND d.visited_on_precision = 'exact'        -- 어림시기 후기는 적재 안 함(§6.3)
> ON CONFLICT (review_id, timepoint) WHERE kind = 'review_checkin' DO NOTHING;
> ```
> 본문은 P2(day0 적재 RPC)·P4(발사) 산출물이며 위는 **`recipient_id` 소스(=diaries.profile_id)·INSERT SELECT 형태 확정**을 위한 명세입니다(시점·문구·딥링크 경로는 §4·§6.6과 합의). `message`/`url`은 §6.6 비식별 가드 준수.

> **★트랙 A 적재 시점 고정의 함의 (D-J, 기술 검증 major 반영)**: 트랙 A 예약이 day0 checkin RPC 내부에서만 적재되므로, **day0 가 없는 일기(미완성 임시저장 → `update_visit` 완성 동선)는 트랙 A 시계열이 시작되지 않습니다**. v1은 이 사각지대를 `update_visit`이 시계열을 만들지 않는 것으로 명시 차단하고(D-J), 시계열은 `is_complete=true`로 처음부터 작성하는 `create_visit_with_entries`(p_reviews + checkin_day0)에서만 적재합니다. 따라서 트랙 A 누락은 "버그"가 아니라 v1 범위 경계입니다(P3에서 `update_visit`/별도 RPC의 day0·트랙 A 적재 허용 재검토).

### 6.5 상한·완료·그만알림 중단 + 토글

**중단 3중**:
1. **완료(트랙 B)**: `is_complete=true` → 발사 자격 SQL 자동 탈락. 잔여 pending은 **발사 직전 재확인 후 `status='skipped'`** — `run_diary_reminders`의 `locked` CTE가 `diary_incomplete` kind에 `EXISTS(diaries WHERE is_complete=false AND reminder_muted=false)`를 `eligible` 플래그로 재확인(§6.4 locked CTE)하고, `eligible=false`인 잠긴 행을 `mark_skip` 으로 `skipped` 처리(발사된 `mark_sent` 와 동일 locked id 집합에서만 분기). 이로써 `update_visit`이 미완성→완성 전환한 일기의 회수 알림이 발사되지 않습니다(기술 검증 major 반영). `update_visit`이 전환 시점에 pending을 즉시 `cancelled`로 비우는 선택적 강화도 가능(§3.4).
2. **그만알림**: `reminder_muted=true`(트랙 B) / checkin 제출·구독 해지(트랙 A). 트랙 A는 해당 timepoint 제출 시 `(review_id,timepoint)` 예약 `status='cancelled'`.
3. **상한**: 트랙 B `reminder_stage < 2`. 트랙 A는 timepoint 3개 자연 상한.

**토글** — `notification_preferences` 2컬럼 추가:
```sql
ALTER TABLE public.notification_preferences
  ADD COLUMN pref_review_checkin   boolean NOT NULL DEFAULT true,  -- 트랙 A
  ADD COLUMN pref_diary_incomplete boolean NOT NULL DEFAULT true;  -- 트랙 B
```

발사 SQL `due` CTE에 `LEFT JOIN notification_preferences` 후 `COALESCE(np.pref_*, true)` 가드(`run_keyword_digest` 패턴). 동기화 페어 3곳 한 commit:
- `notification_preferences` 컬럼 (DB)
- `src/app/api/notifications/preferences/route.ts::Prefs` 타입 + GET/POST 매핑
- `get_my_notification_prefs` / 저장 RPC SELECT·UPDATE 절

> **★토글이 발사 게이트에 실제 결선됐는지 검증 — P4 게이트(FIX-5)**: 위 약속(`LEFT JOIN notification_preferences` + `COALESCE(np.pref_review_checkin/pref_diary_incomplete, true)`)은 **§6.4 `run_diary_reminders`의 `locked`/`fired` CTE에는 아직 반영돼 있지 않습니다**(§6.4는 "P4 골격"으로 명시된 미완 상태 — 작성 그대로면 토글 OFF여도 발사). 따라서 P4 구현 시 토글 컬럼을 발사 자격 조건에 **실제로 결선**해야 하며, 검증 항목으로 못박습니다 — (a) `locked`/due 후보 SELECT가 `recipient_id`로 `LEFT JOIN public.notification_preferences np ON np.profile_id = s.recipient_id`를 걸고, (b) 자격식에 `kind='review_checkin'`이면 `COALESCE(np.pref_review_checkin, true)`, `kind='diary_incomplete'`이면 `COALESCE(np.pref_diary_incomplete, true)`를 AND 결합했는지, (c) 토글 OFF 사용자의 due 행이 발사되지 않고(=`notifications` INSERT 0) `eligible=false`로 분기되는지(diary_incomplete는 `skipped`, review_checkin은 발사 보류) 스모크로 실측. (NULL pref 행은 COALESCE로 true=발사 — 기본 ON.)

**`kind` 매핑 결정 (follow 충돌 회피)**: 예약 사유(`review_checkin`/`diary_incomplete`)를 `notifications.kind`로 발사할 때, 신규 kind 추가(`diary_reminder` 등) vs 기존 `review_request` 매핑 두 안. **신규 kind 추가 권장**(라벨 의미 일치)하되, `notifications_kind_check` 변경·`notification-kinds.ts` 수정은 follow 공유 영역이라 §6.7 순서 준수. 매핑 안은 마이그 없이 즉시 가능하나 "검수 요청" 라벨 표시로 의미 불일치.

> **★KIND_TITLES 푸시 제목 렌더 — 동기화 누락 정정(기술 검증 major 반영)**: 신규 kind(`diary_reminder`)를 추가할 때 동기화 대상은 `notifications.kind` CHECK·클라이언트 `notification-kinds.ts`뿐이 아닙니다. 라이브 확인 결과 `src/app/api/push/send/route.ts`의 **`KIND_TITLES` Record(line 113–122)에 `diary_reminder` 항목이 없으면** 신규 kind 푸시의 **제목이 fallback `"피부텐텐"`(line 123)** 으로 나갑니다(현행 8키: comment/reply/like/save/review_request/published/report/keyword — `follow_post`조차 미등재라 fallback). `review_request`로 매핑하면 제목이 `"🩺 검수 요청"`이 되어 의미가 왜곡됩니다. 따라서 **`KIND_TITLES`에 `diary_reminder: "⏰ 후기 리마인드"`(예시) 추가를 §6.5 동기화 페어·P4 산출물에 명시 포함**합니다. (라이브 사실: `/api/push/send/route.ts`는 정상 읽힘 — `.tmp`는 stale. 트리거 본문은 `recipient_id`·`message`만 있으면 정상 POST(line 88–91 `if(!recipient_id||!message) skip`)하므로 **message/url-only 발송 자체는 이미 동작**하며, ★게이트의 미검증 핵심은 'message/url-only 발송 가능 여부'가 아니라 '신규 kind의 제목 렌더(KIND_TITLES)'입니다.)

신규 kind 추가 시 동기화 페어 3곳(한 commit, follow 머지 후):
- `notifications.kind` CHECK 제약 (DB) — `diary_reminder` 추가
- `src/lib/notification-kinds.ts` — `NotificationKind`·`NOTIFICATION_KINDS`·라벨·`DISPLAY_MODE` append-only
- **`src/app/api/push/send/route.ts::KIND_TITLES`** — `diary_reminder` 제목 추가(미추가 시 fallback "피부텐텐")

> **★`follow_post` 제목 보강 동반 권장(선택, FIX-7)**: 라이브 확인 결과 `KIND_TITLES`에는 `follow_post`도 미등재라 FOLLOW 알림의 푸시 제목이 fallback "피부텐텐"으로 나가는 기존 결함이 있습니다(본 작업 도메인 외). P4에서 `diary_reminder` 제목을 추가하며 같은 `KIND_TITLES`·같은 PR을 건드리므로, **동일 PR에서 `follow_post` 제목 보강을 함께 처리하기를 권장**합니다(선택 — FOLLOW 세션 머지 후 append-only이므로 충돌 없음). 본 작업 필수 범위는 아니나 한 번에 정리하면 추가 PR이 줄어듭니다.

### 6.6 의료법·비식별 가드 (발사 본문)

`scheduled_notification.message`와 발사된 `notifications.message`는 **비식별 본문만**. 푸시 문구에 병원명·의사명·실장명·총액·`solo_price`·`visited_on` 원본·`diary_body` **절대 금지**. 트랙 A 문구 예: "시술 1주 후기를 남겨주세요"(시술명·병원명 없이). 딥링크 URL도 `review_id`(shortcode) + `timepoint`만, 식별 쿼리스트링 금지.

### 6.7 follow 세션 충돌 회피 — 구현 순서 (필수)

1. **마이그 번호**: `0290`·`0291` 하드코딩 금지. 착수 시점 최신+1(현 ceiling 0291 → **0292 이상**).
2. **`notification-kinds.ts` + `/api/push/send::KIND_TITLES`**: follow가 `follow_post` 추가 완료 → 본 작업 신규 kind(`diary_reminder` 등)는 follow 머지 **이후** append-only(중간 삽입 금지). `notifications_kind_check` 마이그도 follow 머지 후. **`/api/push/send/route.ts`의 `KIND_TITLES`에 `diary_reminder` 제목 추가도 동기화 페어**(미추가 시 fallback "피부텐텐"). 두 파일 모두 follow 공유 영역이라 머지 후 append.
3. **`vercel.json`·`notification_preferences`·`scheduled_notification`**: 비공유 영역, 독립 진행.
4. **★토글 발사 게이트 결선 검증(FIX-5)**: `notification_preferences`에 `pref_review_checkin`/`pref_diary_incomplete` 2컬럼을 추가하는 것에 그치지 말고, `run_diary_reminders`의 발사 자격(locked/due)에 `LEFT JOIN notification_preferences`+`COALESCE(np.pref_*, true)`로 **실제 결선**됐는지를 P4 검증 게이트로 둡니다(§6.5 ★). §6.4는 "P4 골격"이라 현재 이 JOIN이 빠져 있어, 결선 누락 시 토글 OFF여도 발사되는 회귀가 됩니다.

### 6.8 배포 체크리스트

| 순서 | 작업 | 비고 |
|---|---|---|
| 1 | `scheduled_notification` 테이블 + 인덱스 + RLS 마이그 (0292+) | follow 머지 후 번호 확정 |
| 2 | `diary_reminder_state` 단일행 상태테이블 | `keyword_digest_state` 패턴 복제 |
| 3 | `notification_preferences` 토글 2컬럼 + prefs RPC·route 동기화 | §6.5 페어 3곳 |
| 4 | `notifications.kind` CHECK 신규 kind 추가 + `notification-kinds.ts` append + **`/api/push/send::KIND_TITLES` 제목 추가** | follow 후 (동기화 3곳, §6.5) |
| 5 | `run_diary_reminders()` RPC + 트랙 A 적재(day0 checkin RPC 확장) | 트리거 아님·멱등 |
| 6 | `/api/cron/diary-reminders` route + `vercel.json` cron 1행 | `CRON_SECRET` 재사용 |

발사 경로는 신규 발송 코드 없이 기존 `trg_notifications_push_webhook → /api/push/send → web-push/FCM` 재사용. 본 트랙은 `notifications`에 `(kind, recipient_id, message, url, created_at)`만 채우고 `actor_id`/`card_id`/`comment_id`/`payload`는 NULL인 **message/url-only 행**이나, `/api/push/send`는 `recipient_id`·`message`만 있으면 정상 발송하므로(라이브 line 88–91 확인) **발송 자체는 0회귀**입니다. **단, 신규 kind `diary_reminder`의 푸시 제목은 `/api/push/send::KIND_TITLES`(line 113–122)에 항목을 추가하지 않으면 fallback "피부텐텐"으로 나갑니다** → KIND_TITLES 제목 추가 + 렌더 실측을 **P4 착수 전 필수 게이트**로 둡니다(§6.1 ★, 아래 "확인 필요"). 디스패처 멱등성은 부분 UNIQUE 인덱스 `uq_sched_notif_checkin`(=`UNIQUE(review_id,timepoint) WHERE kind='review_checkin'`)·`uq_sched_notif_incomplete`(=`UNIQUE(visit_id) WHERE kind='diary_incomplete'`) + 단일 상태행 `FOR UPDATE` + `status` 전이로 차단합니다. **통합 `UNIQUE(visit_id,kind)`를 쓰지 않는 이유**: 한 visit에 시술이 여러 개면 트랙 A 행이 `visit_id` 동일·`kind='review_checkin'` 동일로 복수가 되어 통합 제약 시 두 번째 시술의 시계열 예약이 `ON CONFLICT DO NOTHING`으로 조용히 누락됩니다(기술 검증 major 반영).

근거 파일: `api/cron/keyword-digest`·`api/cron/indexnow`·`api/push/send`·`notification-kinds.ts`·`api/notifications/preferences`·`vercel.json`. production DB: `notifications`/`notification_preferences` 스키마, `notifications_kind_check`, `run_keyword_digest()`, `trg_notifications_push_webhook`, `pg_extension`(pg_net만), `scheduled_notification` 부재.

확인 필요: (1) checkin 폼 실제 라우트 경로(§4와 합의), (2) `reminder_stage` 전진 정밀 조인키, (3) 트랙 B 발사 간격(예시 +2일)·상한(예시 2회) 최종 수치는 원장 확정.

---

## 7. 의료법·개인정보·보안(RLS)

필드맵 §13 화이트리스트 파이프라인을 **스키마·RLS·집계 입력으로 구조 강제**합니다. 정책 문구가 아니라 데이터가 흐를 수 있는 길 자체를 막아, 비식별 결론칸 외에는 공개면 진입이 물리적으로 불가능합니다.

### 7.1 위협 모델

- **의료법 제56조**: 치료경험담(§56②2), 비교광고(§56②4), 과장효능·부작용누락. 운영자=병원소유자 구조라 "공개 후기·집계"가 의료광고로 포섭될 위험 큼.
- **의료법 제27조**: 「전화하기」·카톡 채널, 가격 비교, 병원별 공개집계가 송객·유인 해석 위험.
- **개인정보보호법(민감정보)**: 병원·시술·날짜·가격·의사·실장이 한 사람 단위로 묶이면 건강 민감정보. `diaries`(비공개) 격리.
- **제3자 정보**: `doctor_name`·`manager_name` 실명.

### 7.2 핵심 원칙 — "캡처는 한 번, 출력은 두 개"의 스키마적 강제

| 층 | 가시성 | 공개면 진입 | 격리 대상 |
|---|---|---|---|
| `diaries` | 🔒 비공개 owner-only | **불가**(집계함수 JOIN 안 함) | clinic_*·`clinic_home`·`clinic_kakao`·`total_price`·doctor_name·manager_name·diary_body·visited_on 원본 |
| `diary_procedures` | 🔒 비공개 | **불가**(후기 아님) | 그날 받은 시술 목록·price·note |
| `procedure_reviews` | 📊 결론칸 / 👁 옵트인 | `is_public=true AND card_id IS NOT NULL` 행의 **결론칸 비식별 지표만** | `solo_price` 정확값·visit_id·diary_procedure_id |
| `review_checkin` | 🔒 비공개 owner-only(review 경유) | **불가**(추이그래프 전용) | 시점별 측정값 전체 |

**비식별 화이트리스트**: `satisfaction`, `pain`, `revisit`, `recommend`, `downtime`, `effect_onset`, `effect_areas`, 옵트인 자유텍스트(`cards.body`, 마스킹·검수 후). 그 외 연결·식별 컬럼과 `diaries`·`review_checkin` 전체는 공개면 부재.

### 7.3 RLS·anon 화이트리스트

**현행 검증**: LOCKED·worklog는 `read_public`을 "무조건 공개"로 기술했으나 **현재 정책은 이미 카드 게이트가 걸려 있습니다**(D-B):
```
USING ( EXISTS (SELECT 1 FROM cards c WHERE c.id = procedure_reviews.card_id
        AND c.status = 'published' AND c.deleted_at IS NULL) )
```
즉 "카드 보유 = 공개" 불변식이 이미 성립. 회귀 가드 (a)는 신규가 아니라 **기존 카드 게이트에 `is_public`을 결합·강화**하는 작업입니다.

권장 정책(§1.3.5와 동일): `is_public = true AND card_id IS NOT NULL AND EXISTS(cards published)`. **이중 안전망** — is_public 플래그(의도)와 카드 published(상태)를 둘 다 요구. `is_public`은 `card_id IS NOT NULL`과 항상 동행(7.6 무결성 제약)하므로 한 조건이 깨져도 다른 둘이 막음. 소유자 읽기(`read_public`이 아닌 `read_own`)·쓰기 RLS 부재 유지.

**`diaries`·`diary_procedures`·`review_checkin` — owner-only 완전 격리**:
- `diaries`: CRUD 4종 `profile_id = COALESCE(current_active_profile_id(), auth.uid())`. **anon SELECT 정책 자체 없음** → 신규 컬럼도 자동 격리.
- `diary_procedures`: 부모 `diaries.profile_id` EXISTS. anon 부재.
- `review_checkin`(신규): review 경유 소유(§1.4). anon 정책 없음.

### 7.4 집계 경로 화이트리스트 (회귀 가드 (b)) — 구조 검증

**검증: 현행 4개 집계 경로 전부가 이미 published 카드(`type=review`)에 INNER JOIN** → 카드 없는(비공개) 행 집계 진입 불가. LOCKED 우려 "평가-NULL 오염"은 카드 게이트로 이미 차단. **`is_public` 명시 표면 방어 추가**(§5.2). demographics는 SECURITY DEFINER로 profiles 읽되 count만 반환(개별 PII 비노출). **집계함수는 `diaries` JOIN 안 함** → 병원·총액·날짜원본·실명 집계 입력 부재. **동일 배포 묶음 강제**(컬럼만 먼저 나가고 가드 늦으면 [치명]).

### 7.5 공개 옵트인 시 마스킹·검수 (현행 코드 재사용)

`is_public=true` entry만 `cards(type=review)` 생성 → `cards.body`·제목 공개. 이 경로에만 적용:
1. **마스킹 `maskProhibitedMentions`**: 병원명(`CLINIC_NAME_PATTERN`)·의사명(`DOCTOR_NAME_PATTERN`)을 `○○`로 치환. 일반어 prefix 오탐 회피. 제출 차단 아님 — 가린 뒤 저장, `blinded` 토스트.
2. **소프트 검수 `screenContent`**(role=user만): 마스킹된 텍스트 기준 점수합산(치료경험담+3, 대가성+4, 비교+3 등), **임계 7점** 이상 `pending_review`(admin 큐).

확장: 단답(`short_answer_response.answer_text`)·`changed_points[]`가 공개면 노출되면 동일 마스킹·검수 필수. 단 LOCKED상 `review_checkin`은 비공개 추이그래프 전용·집계 미진입이므로 공개 노출 없으면 검수 불요(공개 여부 §4 결정 — "확인 필요"). 결론칸 객관식 지표는 코드값·enum이라 마스킹 무관.

### 7.6 가격 — v1 공개 보류 + 변호사 후 v2

운영자=병원소유자 비급여 가격 공개의 §27 유인 리스크 → `solo_price`·`total_price` **공개 집계 v1 전면 보류**. 정확값 비공개 격리, 버킷 공개도 v2 연기. `total_price`(visit 총액)는 집계 영구 제외(일기 표시 전용). `solo_price`는 v2에서 버킷(–50/50–100/100–200/200–300/300– 만원)만 검토, 정확값 끝까지 비공개. v2 착수 전 변호사 자문 필수. 그 전까지 집계 RPC·`procedure-report.ts`에 가격 필드 **추가 안 함**으로 코드 봉인.

### 7.7 쓰기 RPC가 화이트리스트를 강제

`procedure_reviews` 쓰기 RLS 부재 → SECURITY DEFINER RPC만. `create_visit_with_entries`는 `is_public=true` entry에만 카드 + 앵커 생성. `is_public=false`/기록만 entry는 카드 미생성 → 7.3·7.4 자동 배제. 마스킹·검수 통과값(`title`/`body`)만 RPC로 전달. `visit_id`·`solo_price`·`diary_procedure_id`는 RPC가 받아도 카드 본문/keywords에 절대 안 실음. **공개→비공개 전환(unpublish) — v1 필수, 구현안 (A) 확정(§3.5·Q10)**: `public_needs_card` CHECK는 `card_id`(행) 존재만 요구하고 `cards.deleted_at`은 검사하지 않으므로, **`is_public=false` UPDATE 단독으로 CHECK 위반 없이** RLS·집계에서 이탈합니다(과결합 정정). v1은 사용자가 후기를 "내릴 때" 피드·카드 노출까지 제거하는 의도를 반영해 **카드 soft-delete(`cards.deleted_at`) + `procedure_reviews.is_public=false`를 한 트랜잭션에서 함께** 수행하며(둘 다 내릴 때만 원자성이 의미), `procedure_reviews`가 쓰기 RLS 부재(RPC 전용)인 이상 이를 **단일 SECURITY DEFINER RPC(예: `unpublish_review`)** 로 구현합니다(§3.5 (A) 확정 — 기존 카드삭제 `.update()` 경로에는 끼울 수 없어 신규 통합 RPC가 유일안, 기술 검증 major 정정).

### 7.8 병원별 공개집계 금지·유인 경계

§13-4 **병원별 공개 평점·랭킹 금지**(강남언니 유죄형): 집계 RPC는 `procedure_ko` 단위만 GROUP. `clinic_*`은 `diaries` 격리라 **병원축 집계 구조적 불가**. 신규 RPC clinic JOIN 금지를 코드리뷰 가드로. 「전화하기」·「카톡 채널」은 **내 기록의 병원 한정** UI에서만. picker 중립정렬·무특혜. 재시술/시계열 알림은 "본인 날짜 + 시술 주기" 앵커이지 병원 권유 아님. 알림 문구에 병원명·할인·예약유도 금지.

### 7.9 탈퇴 시 익명화 (현행 CASCADE 검증)

**검증된 FK**: `procedure_reviews.author_id`→profiles CASCADE, `diaries.profile_id`→profiles CASCADE, `diary_procedures.diary_id`→diaries CASCADE, `procedure_reviews.card_id`→cards CASCADE. `review_checkin.review_id`→procedure_reviews CASCADE 신설. `clinic_id`→clinics SET NULL.

탈퇴는 ADR 0002대로 profile in-place 익명화(handle→`deleted-{hex}`, PII NULL, `auth_user_id` NULL). profile row 보존 → **author_id CASCADE 평상시 미발동** → 공개 후기·집계 기여분 보존.

**비공개 격리분 파기**: 탈퇴 시 `diaries`(병원·연락처·총액·메모)·`diary_procedures`·`review_checkin`·`solo_price`는 파기/익명화 대상 — 현행 ADR 0002 익명화 절차에 **신규 테이블·컬럼 NULL 처리·삭제 추가 필요**(현재 ADR 0002는 카드·댓글만 기술). **[작업 필요] 익명화 RPC 확장.** 하드삭제(GDPR erasure) 경로 추가 시 author_id CASCADE가 후기까지 지움 → SET NULL+익명귀속 재검토.

**일기 단건 삭제 경로(D-I) — `delete_visit` RPC 경유 강제**: 사용자가 자기 일기 하나를 지우는 경로는 `visit_id ON DELETE SET NULL` × `source_link_chk` 모순(§1.3.3·§2.5) 때문에 raw `DELETE FROM diaries`로는 diary_linked 후기가 붙은 일기에서 `check_violation`(23514)으로 차단됩니다. 따라서 **반드시 `delete_visit(p_visit_id)` RPC(§3.4)** 로만 — 연결 후기를 `source='standalone'`·`visit_id=NULL`로 전환(후기·`review_checkin` 보존)한 뒤 일기 삭제. 일기에 격리됐던 병원·연락처·총액·메모는 `diaries` 행과 함께 파기되고, 보존되는 standalone 후기에는 비식별 결론칸만 남으므로(병원·날짜원본은 애초에 후기에 부재) 의료법·PII 정합이 유지됩니다. **이 강제의 DB레벨 전제는 0292의 `diaries_delete_own` RLS 정책 제거(FIX-1, §2.1 (7))** 입니다 — 정책이 살아 있으면 클라이언트 `supabase.from("diaries").delete()`가 RPC를 우회해 위 함정·트랙 A 예약 미회수를 그대로 유발하므로, DELETE 정책을 제거해 일기 삭제를 SECURITY DEFINER `delete_visit` 전용으로 강등합니다(SELECT/INSERT/UPDATE 3종 무변경). 탈퇴 익명화 RPC와 별개로 **이 단건 삭제 RPC를 v1 작업 항목에 포함**합니다([작업 필요]).

### 7.10 변호사 검토 체크리스트

| # | 항목 | 본 개편 연관 |
|---|---|---|
| 1 | 운영자=병원소유자 비공개/공개 2층 아키텍처 | 4층 격리 |
| 2 | 비급여 가격(solo_price 버킷) 공개 집계 §27 해당 여부 | **v2 봉인, 자문 후 해제** |
| 3 | 공개 지역 집계(구 단위) 적법성 | (v1 미도입) |
| 4 | 공개 설명·공유카드 비식별 기준 충분성 | maskProhibitedMentions 범위 |
| 5 | 건강 민감정보 묶음 동의·암호화·보관기간 | `diaries` 격리·동의 |
| 6 | 비공개 일기 내 제3자(doctor/manager) 실명 저장·호스팅 면책 | 약관 §15 |
| 7 | 「전화하기/채널」 송객·유인 | 내 기록 한정 |
| 8 | 재시술·시계열 알림 문구 권유성 | "주기+본인날짜" 앵커 |
| 9 | 탈퇴 후 비식별 기여분 잔존 정책 고지 | ADR 0002 + 약관 |
| 10 | (신규) review_checkin 시계열 건강측정값 민감정보 등급·보관 | 신규 테이블 |
| 11 | (신규) day0~month4 측정·증상(review_symptom)이 SaMD/의료기기 해당 여부 | 보조 테이블(후속) |

### 7.11 회귀 점검 요약 (치명 우선)

| 영역 | 리스크 | 대응 |
|---|---|---|
| 비공개 평가 anon 유출 ★치명 | card_id nullable 완화 후 비공개 행 노출 | `read_public`에 `is_public AND card_id IS NOT NULL` + 카드 published EXISTS 결합, 스키마와 동일 배포 |
| 집계 오염 ★치명 | 기록만/비공개 entry가 count·avg 진입 | 집계 4경로 카드 INNER JOIN(현행) + `is_public` 명시 가드, 동일 배포 묶음 |
| 공개/카드 불일치 | is_public=true인데 카드 없음 | **무결성 제약**: `CHECK (is_public=false OR card_id IS NOT NULL)` (§1.3.3) — `card_id` 행 존재만 요구(`deleted_at` 무관). unpublish 시 `is_public=false` 단독으로 CHECK 위반 없음(§3.5 (A)) |
| 단답·증상 공개화 | 검수 미적용 자유텍스트 유출 | review_checkin 비공개 유지. 공개화 시 screenContent 입력 확장 [확인 필요] |
| 탈퇴 비공개 파기 누락 | ADR 0002가 신규 테이블 미포함 | 익명화 절차에 diaries 신규컬럼·review_checkin·solo_price NULL/삭제 추가 [작업 필요] |
| 병원축 집계 유입 | 신규 RPC가 clinic JOIN | 코드리뷰 가드 — 집계는 procedure_ko 단위만, diaries JOIN 금지 |

근거 파일: `content-screening.ts`, `content-screening-dict.ts`, `api/reviews/route.ts`, `api/reviews/[shortcode]/route.ts`, `procedure-report.ts`, `decisions/0002-soft-delete-anonymize.md`. 라이브 검증: RLS 정책 3종, 집계 3 RPC 본문, FK delete rule.

---

## 8. 로드맵·단계·리스크·미결

### 8.1 단계별 로드맵 (시계열 = 코어, Phase 1~3 내 포함)

각 Phase 공통: 서브에이전트 위임 → 빌드 검증(`npm run build` + `npx tsc --noEmit`) → code-reviewer 검수([치명] 시 수정·재검수) → commit/push → 문서 동기화. 모든 Phase는 LOCKED 테이블·컬럼명을 토씨까지 동일하게 사용.

| Phase | 범위 | 산출물 | 의존 | 검증 게이트 |
|---|---|---|---|---|
| **P0** 승인·격리 | 본 계획서 원장 승인. ADR 신규 2건 초안(0024 diaries=visit 확장·SSOT 척추 / 0025 review_checkin 시계열 코어). 변호사 체크리스트 착수. FOLLOW 세션 머지 대기(0290·0291 적용 확인). | docs only. 마이그 0건. | 없음 | 원장 승인 + FOLLOW 0290·0291 머지 완료 |
| **P1** 스키마·회귀가드 | 마이그 **0292**(diaries 7컬럼 + procedure_reviews 7컬럼·NOT NULL 완화·정합 CHECK + read_public is_public 가드 + **`diaries_delete_own` 정책 제거(FIX-1, delete_visit 강제 DB레벨 전제)** + 666건 is_public=true UPDATE), **0293**(review_checkin 신규 + RLS), 집계 회귀가드(4개 경로 is_public 필터, 0292 동봉). | 마이그 2~3개, DATABASE.md·CHANGELOG.md 갱신. | P0 | 행수 무변동(70/86/666/46), 집계 수치 무회귀, **`diaries_delete_own` 제거 후 raw `from("diaries").delete()` 차단·delete_visit 정상 동작 확인**, `tsc`·`build` 0 |
| **P2** 쓰기 경로·통합폼 | `create_visit_with_entries` RPC(**전체 plpgsql 본문 작성**; procedures_empty 가드 면제 D-C; diary_linked는 v1 `is_public=false`만 D-H; **procedure_ko tag_dictionary·is_procedure 사전검증** + diary_procedure_index **+1 base 보정**) + `update_visit`(**전체 clinic 컬럼 명시·전체 덮어쓰기 정책**; D-J — 미완성→완성은 본문만, 시계열 미생성) + **`delete_visit` RPC(D-I — 연결 후기 standalone 전환 + 트랙 A 예약 cancel 후 삭제)** + `/api/visits`(POST·PATCH·**DELETE**) + `/api/reviews` create_procedure_review INSERT 확장(D-D) + **공개 후기 unpublish — 신규 통합 SECURITY DEFINER RPC(Q10; 카드 soft-delete 경로가 `.update()`라 재사용 불가 — P2 착수 시 카드삭제 경로 정독 후 확정)** + 통합 글쓰기 폼(병원검색·시술목록·후기 아코디언·어림시기·is_complete). day0 checkin 즉시. | RPC 4~5개, API 2개, `SkinDiaryForms.tsx`(내 `DiaryForm`)·`WriteTabs` 확장. | P1 | 원자성·active 명함 권한·검수·마스킹·shortcode 1:1·신규 standalone is_public=true·**diary_linked 공개 0건·diary_linked day0 FK·is_procedure·base 매핑(§2.6 h)·unpublish 원자(통합 RPC)·일기 삭제(delete_visit) 연결후기 standalone 전환·트랙A 예약 cancel·raw DELETE 차단·update_visit 좌표 무손실·미완성→완성 시계열 미생성(D-J)** |
| **P3** 집계·표시·시계열폼 | 집계 화이트리스트 검증 + `/notes`·`/reports` visit 연동(`RecordNotesPanel.linkedReviews`) + `upsert_review_checkin` 롤업(v1 대상 전부 비공개) + checkin 시점폼 + 추이그래프(카드 내부, noindex). **공개 시계열 후기(D-H 해제)는 P3 게이트 — 허용 시 롤업 후 `revalidatePath` 계약·다건 shortcode 사전생성 선결**. | `procedure-report.ts`·`RecordNotesPanel`·시점폼·그래프. | P1·P2 | 표본=is_public entry 수 불변, 비식별, 롤업 정합(비공개) |
| **P4** 예약알림 | `scheduled_notification`(부분 UNIQUE 2종, **RLS `sched_notif_read_own` = TO authenticated + auth.uid() IS NOT NULL + COALESCE(active,uid) — notifications 정책과 토씨 일치**) + Vercel Cron `/api/cron/diary-reminders`(CRON_SECRET) → visited_on +7/+30/+120 → checkin 딥링크. 기존 push 재사용. **신규 kind `diary_reminder` 동기화 3곳: `notifications.kind` CHECK + `notification-kinds.ts` + `/api/push/send::KIND_TITLES` 제목 추가**(§6.5). | 테이블 1개, cron 1개. | P2·P3 | CRON_SECRET·중복발사 차단·상한·알림폭탄 방지 + **신규 kind 푸시 제목 렌더 실측: `KIND_TITLES`에 `diary_reminder` 추가·fallback "피부텐텐" 회피(§6.1 ★)** + **다중 시술 visit 시계열 예약 누락 0(부분 UNIQUE)** + **★발사분 정확 식별 게이트: sent/skipped 가 locked(SKIP LOCKED) id 집합에서만 분기·fired 카운트 일치(이중 승급·'발사 안 됐는데 sent' 0, §6.4)** + **★토글 결선 게이트(FIX-5): `pref_review_checkin`/`pref_diary_incomplete`가 `run_diary_reminders`의 locked/due 발사 자격에 `LEFT JOIN notification_preferences`+`COALESCE(np.pref_*, true)`로 실제 결선됐는지 — 토글 OFF 사용자 due 행 발사 0건 스모크(§6.5 ★)** |
| **P5** 후속 자리채움 | `review_symptom`·`question_pool`·`short_answer_response`(자리). 가격 버킷 모듈(변호사 후 v2). | 테이블 3개(자리), 단답 운영 UI. | P3·P4 | 최소표본·구단위 게이트 |

**의존 순서**: P0 → P1 → P2 → P3 직렬. P4는 P3 이후, P5는 P4 이후. 시계열(review_checkin)은 P1(테이블)·P2(day0)·P3(롤업·그래프)에 분산 포함되어 코어 안에서 완성. P4 없이도 P1~P3로 시계열 테이블·day0·수동 후속 checkin·추이그래프·롤업 동작.

**마이그 번호**: 라이브 확인 결과 `0290_follows.sql`·`0291_follows_lock_select.sql` 두 파일 모두 FOLLOW 세션 점유·적용. 본 작업은 **0292부터**. 착수 직전 `ls supabase/migrations/ | tail -3`으로 최신+1 재확정.

### 8.2 동시 세션(FOLLOW) 충돌 회피

(상단 [동시 세션(FOLLOW) 충돌 회피] 섹션 참조 — 도메인 분리, `notification-kinds.ts` 단일 충돌점 P4 후순위 처리.)

### 8.3 리스크 & 회귀 점검표 (치명 우선)

| # | 영역 | 리스크 | 라이브 확인 | 대응 |
|---|---|---|---|---|
| **R1 ★치명** | 집계 오염 | "기록만" + 신규 비공개 후기가 count/avg 진입 | 집계 RPC가 `cards` JOIN 후 집계함 확인. 카드 JOIN으로 간접 방어 중 | **평가-NULL 행을 procedure_reviews에 안 만듦**(흡수 안 함 → 원천 소멸) + 집계 4경로에 `is_public=true AND card_id IS NOT NULL`. **0292~0293 동일 배포** |
| **R2 ★치명** | 비공개 유출 | is_public=false 후기 anon 노출 | **현행 read_public "무조건 공개" 아님** — `EXISTS(published cards)` 게이트. 비공개(card_id NULL) 현재도 차단 | LOCKED 가드대로 `is_public` 명시 추가(이중·의도 표면화). **회귀 테스트: anon으로 is_public=false SELECT → 0건** |
| **R3 ★치명** | card_id 1:1 | NOT NULL 완화 후 UNIQUE 깨짐? | NOT NULL에 card_id 포함, UNIQUE 별도 확인 | Postgres UNIQUE는 NULL 다중 허용 → 비공개 NULL 무제한, 공개 1:1 유지. **DROP NOT NULL만, DROP UNIQUE 안 함** |
| **R4 ★치명** | FK 정합 + 삭제 차단 | visit_id/diary_procedure_id/review_id 오결합·고아 **+ `visit_id SET NULL`×`source_link_chk` 모순으로 일기 삭제 영구 차단 + standalone 전환 후 트랙A 예약 고아** | diaries.id·diary_procedures.id·procedure_reviews.id 대상. **diary_linked 후기 붙은 일기 raw DELETE → check_violation 23514 롤백 확인**. 라이브: `diaries_delete_own`(FOR DELETE owner-only) 정책 활성 → 클라이언트 raw DELETE 우회 가능 | visit_id→diaries SET NULL, diary_procedure_id→diary_procedures SET NULL, review_checkin.review_id→procedure_reviews CASCADE. idx 부여. **★일기 단건 삭제는 `delete_visit` RPC(§3.4·D-I)로만 — 연결 후기 standalone 전환 + 잔여 트랙A(review_checkin) 예약 `cancelled`(§3.4 (2b)) 후 삭제(한 트랜잭션). raw DELETE 경로 전면 차단.** **DB레벨 전제: 0292에서 `diaries_delete_own` RLS 정책 제거(FIX-1, §2.1 (7)) — DELETE 정책이 살아 있으면 `supabase.from("diaries").delete()`가 RPC 우회. SELECT/INSERT/UPDATE 3종 무변경** |
| **R5 ★치명** | RLS 우회·명함 | review_checkin/scheduled_notification 소유 판정 오류 | **profiles 129행 중 10행 `id<>auth_user_id`**(묶음 명함) 확인. 라이브 `notifications_select_own` = `TO authenticated` + `(auth.uid() IS NOT NULL) AND recipient_id=COALESCE(active,uid)` | `scheduled_notification`=수신함이라 `FOR SELECT TO authenticated USING((auth.uid() IS NOT NULL) AND recipient_id = COALESCE(current_active_profile_id(), auth.uid()))`(notifications와 토씨 일치, D-G — 초안이 `TO authenticated`·NULL 가드 누락한 것 정정). `review_checkin`=측정원본이라 `author_id IN (profiles WHERE auth_user_id=auth.uid())`(로그인 단위). **초안 `recipient_id=auth.uid()` 직접비교 [치명] 정정(§6.2)** |
| **R5b ★치명** | 공개 평점 사후변동 | 롤업이 공개 결론칸을 month4까지 바꿔 `/reports` ISR·JSON-LD stale | cards에 평점 비정규화 없음(meta jsonb뿐) 확인 — ISR이 제2 저장소 | **v1: diary_linked 후기 `is_public=false` 전용(D-H)** → 공개 집계 사후변동 경로 소멸. P3 공개 허용 시 `upsert_review_checkin` RETURN slug + 라우트 `revalidatePath` 계약(§3.3) |
| R6 | 빌드/타입 | NOT NULL 완화로 TS `number→number\|null` 전파 | `procedure-report.ts` Row 이미 nullable | caller 전수 + zod 스키마 확장. `tsc --noEmit` 0 게이트 |
| R7 | 명명 규칙 | 신규 컬럼 user_id 사용 차단 | hook `column-naming-check.js`는 cards/comments user_id만 검사, `*_id` 광범위 차단 안 함 | 신규: visit_id/diary_procedure_id/review_id/recipient_id — author_id/profile_id 체계 준수. hook 통과 |
| R8 | 카테고리 SSOT | 4종 변동? | `post-category.ts` 4종 확인 | **무변경.** is_public 후기 → 기존 category=review. review_checkin은 카드 아님 |
| R9 | 알림 폭탄 | 과거 visit 70건에 알림 발사 | is_complete DEFAULT true | 기존 70건 is_complete=true → 회수 제외. scheduled_notification은 신규 visit부터만. reminder_muted·상한·중복 가드 |
| R10 | 피드/검색 노출 | is_public 옵트인 전환으로 노출 변동 | 666건 전부 card_id 보유(단 6건은 카드 soft-deleted) | 0292에서 카드 살아있는 660건 is_public=true(FIX-2), soft-deleted 카드 6건은 is_public=false → 어느 쪽도 피드/SEO 노출 무변동(660은 기존 공개 유지, 6건은 이미 카드 삭제로 비노출). 신규만 옵트인 |
| R11 | 롤업 정합 | checkin 제출 시 롤업 누락·이중 | 트리거 아님(RPC 내부) | `upsert_review_checkin`이 checkin UPSERT와 동일 트랜잭션. **집계는 결론칸만 읽고 checkin 미참조**. v1은 롤업 대상이 전부 비공개 행(D-H)이라 캐시·SEO 무관 |
| R12 | 마이그 번호 경합 | FOLLOW와 0292 동시 점유 | 0290·0291 점유 확인 | 착수 직전 재확인 → 최신+1. 양보 원칙 |

### 8.4 서브에이전트 위임표

| Phase | 위임 에이전트 | 작업 | 검수관(독립 2인 교차) |
|---|---|---|---|
| P0 | 디렉터(직접) | 승인·ADR 0024/0025 초안·변호사 체크리스트 | — |
| **P1** | `supabase-specialist` + `schema-auditor` | 마이그 0292~0293, RLS is_public 가드, 집계 4경로 필터, 무손실 검증 | `code-reviewer`(SQL·RLS) + `schema-auditor`(행수·집계 수치 무회귀) |
| **P2** | `general` | `create_visit_with_entries`(전체 본문·procedures_empty 면제·procedure_ko·is_procedure 사전검증·index +1 보정), `update_visit`(전체 clinic·전체 덮어쓰기·D-J), **`delete_visit`(D-I + 트랙A 예약 cancel)**, **unpublish 통합 RPC(Q10 — 카드 soft-delete 경로 정독 후 확정)**, `/api/visits`(POST·PATCH·DELETE), `/api/reviews` INSERT 확장, 통합 폼, day0 | `code-reviewer`(원자성·권한·마스킹·is_public·**일기 삭제 source_link_chk 정합·트랙A 예약 회수·update_visit 좌표 무손실·unpublish RPC 형태**) + 독립 reviewer |
| **P3** | `supabase-specialist` + `general` | `upsert_review_checkin` 롤업, 집계 검증, `/notes`·`/reports` visit 연동, 시점폼·추이그래프 | `schema-auditor`(통계·비식별) + `code-reviewer`(롤업) |
| **P4** | `supabase-specialist` | `scheduled_notification`(RLS TO authenticated 토씨 일치), cron, 2트랙 알림, `notification-kinds.ts` diary_reminder | `code-reviewer`(CRON_SECRET·**발사분 정확식별(locked id 집합·이중승급 0)**·상한) |
| **P5** | `general` | review_symptom·question_pool·short_answer_response 자리, 단답 UI | `code-reviewer`(최소표본·구단위) |

**위임 공통 제약**: 코드 수정은 서브에이전트 위임, 독립 검수관 2인 교차 후 보고. [치명]은 수정·재검수 통과 후에만 commit/push. 다른 세션 동시편집 시 `-A` 금지·명시 stage. 파괴적 DDL(diaries/diary_procedures DROP) 자동 금지.

**라이브 검증 메모(본 세션 직접 확인)**:
- 행수: diaries 70 / diary_procedures 86 / procedure_reviews 666 / review_summary 앵커 46 / card_id 보유 후기 666.
- 마이그 ceiling = **`0291_follows_lock_select.sql`**(FOLLOW 세션, 0290·0291 두 파일 적용) → 본 작업 **0292+**.
- `procedure_reviews` NOT NULL = card_id·procedure_ko·author_id·satisfaction·pain·revisit.
- `read_public`은 "무조건 공개" 아님 — 이미 `EXISTS(published 카드)` 게이트.
- `notification-kinds.ts`는 FOLLOW가 `follow_post` 추가 완료 → P4의 `diary_reminder`는 머지 후.

관련 파일(절대경로): `pibutenten-app\src\lib\procedure-report.ts`, `...\src\lib\post-category.ts`, `...\src\lib\notification-kinds.ts`, `...\src\components\skin\record\`, `...\src\app\api\reviews\route.ts`, `...\src\app\api\reviews\[shortcode]\route.ts`, `...\src\app\api\diaries\route.ts`, `...\src\app\review\new\`, `...\supabase\migrations\0290_follows.sql`·`0291_follows_lock_select.sql`(FOLLOW 세션, 회피 대상).

---

## 원장 미결 결정

| # | 미결 사항 | 추천안 | 근거 |
|---|---|---|---|
| **Q1** | 출시 범위·순서 | **P1~P3(시계열 포함 코어) 먼저 → P4(예약알림)·P5 후속.** | 시계열은 P1~P3 포함(원장 "시계열=핵심" 충족). P4 없이도 day0·수동 후속 checkin·추이그래프·롤업 동작 |
| **Q2** | diary_procedures 처분 | **현행 유지(후기 흡수 안 함) — LOCKED 확정대로.** | 원장 확정(O2). 흡수 안 함 → 집계 오염 원천(R1) 자동 소멸. 86건 마이그 불필요 |
| **Q3** | 기존 666건 소급 visit 연결 | **안 함(신규부터 연결).** | 동일방문 보장 없어 오결합·visit_date 오염. 원함 시 후보 제시 별도 안건 |
| **Q4** | 가격 공개 타이밍 | **v1 보류 → 변호사 후 v2(solo_price 버킷만).** | §27 유인 리스크. 현행 가격 채움 0%라 손실 없음 |
| **Q5** | month4 "효과발현" 결론칸 도출 | **month4 직접 질문 우선, 미응답 시 checkin 추이 도출.** | LOCKED 롤업 규칙. 직접질문 미응답 시 도출 알고리즘 상세는 P3 설계 시 확정 |
| **Q6** | 변호사 자문 착수 시점 | **P3 착수 전(가격·병원별 집계·제3자 실명 동시 검토).** | 공개 집계·비식별 게이트가 P3에서 확정 |
| **Q7** | 미완성 일기(`is_complete=false`) 작성 동선 | **통합 작성 RPC에서 procedures_empty 가드 면제(D-C)로 임시저장 허용.** | 트랙 B(미완성 회수) 성립의 전제. 시술 0개 일기 저장 경로 필요 |
| **Q8** | 트랙 B 발사 간격·상한 | **간격 +2일(예시)·상한 2회(예시).** | §6.3 — 최종 수치는 원장 확정 필요(알림 피로도 고려) |
| **Q9** | 추천의향(`recommend`) 공개 노출 | **결론칸·집계 가드엔 포함하되 리포트/JSON-LD 노출은 v1 미정.** | §5 — 추천의향 분포 SEO 노출 여부 별도 결정 |
| **Q10** | 공개 후기 철회(unpublish)·재공개 토글 | **unpublish는 v1 필수, 구현안 (A) 확정 — 카드 soft-delete + `is_public=false`를 한 트랜잭션. 단 구현 형태는 '기존 카드삭제 경로 재사용'이 아니라 **신규 통합 SECURITY DEFINER RPC**(라이브 확인: 카드 soft-delete는 RLS `.update()`, `procedure_reviews`는 쓰기 RLS 부재라 같은 `.update()`에 끼울 수 없음 — 기술 검증 major 정정). (B) 별도 toggle RPC는 재공개까지 여는 형태로는 미채택(v1 단방향만). `public_needs_card` CHECK는 `card_id` 행 존재만 요구(deleted_at 무관)라 `is_public=false` 단독으로도 CHECK 위반 없음 — 카드 동반 삭제는 피드/SEO 노출 제거 목적. 자유 재공개 토글은 별도 안건.** | §3.5·§7.7 — 공개 후기를 내리는 기본 동작이 v1에 없으면 구조적 결함(기술 검증 major) |
| **Q11** | diary_linked 공개 후기(시계열 공개) 허용 시점 | **v1 차단(비공개 추이그래프 전용), P3 이후 재검토 — 허용 시 롤업 후 `revalidatePath` 계약(§3.3) 선결.** | D-H — 공개 집계가 month4 롤업으로 사후 변동하는 캐시·SEO 정합 경로 미완(기술 검증 [치명]) |
| **Q12** | 일기 단건 삭제 방식 | **v1 필수 — `delete_visit` RPC로만(연결 후기 `source='standalone'` 전환 + 트랙 A 예약 cancel 후 일기 삭제, 한 트랜잭션). raw `DELETE FROM diaries` 전면 차단. 강제의 DB레벨 전제로 0292에서 `diaries_delete_own` RLS 정책 제거(FIX-1, §2.1 (7)).** | D-I — `visit_id ON DELETE SET NULL`이 `source_link_chk`와 모순돼 연결 후기 보유 일기가 영구 삭제 불가(check_violation 23514). 일기 삭제 경로 부재 시 R4 [치명](기술 검증 [치명]). 트랙 A 예약은 후기 전환 시 CASCADE 미발동 → §3.4 (2b) 명시 회수. 라이브 `diaries_delete_own`(FOR DELETE owner-only) 정책이 살아 있으면 `supabase.from("diaries").delete()`로 RPC 우회 가능하므로 정책 제거가 raw DELETE 차단의 DB레벨 전제(SELECT/INSERT/UPDATE 3종 무변경) |
| **Q13** | 미완성→완성 시 시계열 시작 | **v1 차단 — `update_visit`은 본문만 수정, 시계열(diary_linked) 후기·day0·트랙 A 예약은 처음부터 `is_complete=true` 작성(`create_visit_with_entries`)에서만 적재(D-J). 미완성으로 시작한 일기는 완성 후 별도 후기 동선.** | D-J — 트랙 A 예약이 day0 RPC 내부 적재로 고정돼, 미완성→완성 동선은 시계열이 영영 시작 안 되는 사각지대. v1은 명시 차단, P3에서 `update_visit`/별도 RPC 적재 재검토(기술 검증 major) |

---

## 법률 면책

- 본 계획서의 의료법(제56조·제27조)·개인정보보호법 관련 설계(§7)는 **기술적 구조 강제 방안**이며, **법률 자문을 대체하지 않습니다.** 공개 집계·가격 노출(solo_price 버킷)·지역 집계·제3자 실명 호스팅의 적법성 최종 판단은 변호사 검토(§7.10 체크리스트) 후 확정합니다.
- **가격 공개(§7.6)는 v1 전면 보류**입니다. 변호사 자문으로 §27 유인·의료광고 해당 여부가 명확해지기 전까지 집계 RPC·코드에 가격 필드를 추가하지 않습니다.
- **병원별 공개 집계·랭킹은 전면 금지**(§7.8, 강남언니 유죄 선례)이며, 본 설계는 `clinic_*`을 `diaries`에 격리하여 병원축 집계를 구조적으로 불가능하게 만듭니다. 신규 RPC에 `diaries`/clinic JOIN 추가는 코드리뷰 차단 대상입니다.
- **비공개 일기 내 제3자(doctor_name/manager_name) 실명 저장·호스팅**의 면책은 약관(§15) 및 처리방침 고지 대상이며, 변호사 검토 항목 #6입니다.
- **시계열 건강측정값(review_checkin)·증상 기록(review_symptom)이 의료기기 소프트웨어(SaMD)에 해당하는지** 여부는 변호사 검토 항목 #10·#11이며, 보조 테이블(P5) 본격 운영 전 확정합니다.
- **탈퇴 후 비식별 기여분 잔존**(§7.9, ADR 0002 익명화)은 처리방침·약관 고지 대상이며, 신규 테이블·컬럼의 익명화 절차 확장이 선행 작업입니다([작업 필요]).
