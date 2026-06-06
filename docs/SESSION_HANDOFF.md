# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-06

---

## 1. 현재 상태 (스냅샷)

- **git**: `HEAD == origin/main`, 미커밋/미푸시 0. 마지막 커밋 **`7d6919f`** (`feat(notify): 관심 Q&A digest + 일일 cron (4-2 3b-2) + 마이그 0245`).
- **DB 마이그**: **0245** 까지 production 적용 완료.
- **빌드**: `tsc` 0 + `npm run build` Compiled successfully (마지막 4-2 작업 기준).

### 4-2 알림 전면 정비 — ✅ 완료
마이그 0239~0245 production 적용. 알림 kind **8종** = `comment/reply/like/save/review_request/published/report/keyword`.

| 마이그 | 내용 |
|---|---|
| 0239 | 신고 알림 트리거 + `report` kind (STEP D) |
| 0240 | `push_send_failures` 발송 실패 로깅 (STEP F) |
| 0241 | `new_ask` 死 잔재 완전 제거 (kind 6종화 후 재확장) |
| 0242 | 저장 알림 트리거 + `save` kind (이름 비노출·24h 묶음) |
| 0243 | 앱 알림함 목록 `get_notifications` 에 `message` 표시 (3a) |
| 0244 | 관심 알림 토대 — GIN 2 + pref 3컬럼 + `keyword` kind (3b-1) |
| 0245 | 관심 digest 생산자 `run_keyword_digest()` + cron `/api/cron/keyword-digest` (3b-2) |

- 관심 digest cron: **21:00 UTC = 06:00 KST**. 커서 `keyword_digest_state.last_run_at` 초기값 `now()` → 첫 발화는 과거 카드 무시(폭탄 방지). 인증 `Authorization: Bearer ${CRON_SECRET}`.
- ⚠ **`CRON_SECRET` Vercel 환경변수 존재 확인 필요** — 미설정 시 cron 항상 401 → 무효.

### 4-3 OG 정비 — ⏸ HOLD
- 디렉터 OG 예시(레이아웃·문구) 대기. 예시 확정 전 착수 금지.

### 4-4 태그·시술 통합 사전 매니저 — 🟡 설계 단계 (코드 미착수)
- 진단1~3 + 엑셀 export 는 **전부 읽기전용**(SELECT/grep/`pg_get_functiondef` + xlsx). **DB 쓰기·커밋 0건**.
- 산출물: `전달용/태그_사전_검토용_20260606.xlsx` (2147행, 분류 821 / 미분류 1326).
- 디렉터 **0단계 정리본** 확정 진행 중. 확정본 도착 후 "안전 적용부"부터 착수.

---

## 2. 4-4 진단 핵심 (설계 입력)

- **분류 매핑 기존재**: `src/data/procedure-mappings/procedure-mappings.json` (819 항목, lookup 키 823) = 태그→5분류 SSOT. 로직 `src/lib/procedure-dict.ts::categoryFor`, 미등록=`knowledge`.
- **5분류**: `categories.ts` — concerns(피부고민)/lifting(리프팅)/injectables(스킨부스터)/homecare(홈케어)/knowledge(피부상식).
- **3대 리스크**:
  1. `cards.keywords ↔ procedure_taxonomy` FK·트리거·CHECK **전무** → 고아 태그 1962/2003(98%). taxonomy 변경이 카드 자유텍스트로 자동 전파 안 됨.
  2. **어휘 단절**: `profiles.skin_concerns`(영문 11)·`skin_type`(영문 7)은 cards.keywords(한글)와 교집합 0. 관심 digest 의 concern/skin_type 차원 구조적 死.
  3. `review_summary` 앵커카드는 `keywords contains [taxonomy.ko]` 매칭(자유텍스트) → ko rename 시 리포트 조용히 소실. `procedure_reviews.procedure_ko`는 FK CASCADE 라 정합.
- **검색량/사용량 재사용 가능**: `search_logs`(원문 query·profile_id·created_at, ~24일, 인덱스 보유). 인기검색어=`get_top_search_queries`(search_logs.created_at), 인기태그=`get_top_tags`(cards.created_at, qa/tip+doctor 한정). 둘 다 `p_days` 시간창 + `PERIOD_DAYS[1,7,30,90,365,0]` UI 기구현(`PopularCards.tsx`).
- **백업 권장**: 작업 직전 전용 백업 테이블 3종 — procedure_taxonomy 전체 / cards(id,keywords) / profiles(id,interested_procedures,skin_concerns,skin_type). 동일 트랜잭션 변경 + 실패 시 백업 기준 UPDATE 복원.

---

## 3. 다음 작업 (4-4 착수 시 — 안전 적용부 우선)

디렉터 확정 정리본을 받으면, **가장 안전한 적용부(글상자 태그 정정)부터** 다음 6원칙으로:

1. **글상자(카드) 태그 문자열만 정정** — `cards.keywords` 배열 내 특정 태그 교체/제거만.
2. **본문 불변** — `cards.body`·title·meta 등 본문은 절대 건드리지 않음.
3. **백업 선행** — 변경 전 백업 테이블 스냅샷 필수(§2).
4. **미리보기** — 적용 전 영향 행수·before/after dry-run SELECT 로 디렉터 확인.
5. **단일 트랜잭션** — 전체 변경을 한 트랜잭션으로(부분 적용 금지).
6. **되돌리기 가능** — 백업 기준 즉시 롤백 절차 확보.

---

## 4. 불변 원칙 (재명시)

- **콘텐츠 본문 보존**: 태그·메타 정정이 본문(`body`)을 바꾸지 않는다. soft-delete(`deleted_at`)만, hard-delete·스크럽 금지.
- **사람 ID 컬럼 명명(ADR 0014)**: `author_id`(콘텐츠)/`profile_id`(그 외)/`auth_user_id`(묶음). `user_id` 신규 사용 금지(pre-commit hook 차단).
- **권한은 active 명함 단위(ADR 0011/0012)** — 묶음 합산 금지.
- **파괴적 DB 변경 자동 실행 금지**: DROP TABLE/TRUNCATE/대량 DELETE·secret 로테이션은 사용자 확인 후.
- **읽기전용 진단은 진단으로만** — SELECT/grep/함수정의 조회만, 트랜잭션·쓰기 0.
- **문서 동기화(CLAUDE.md §5)**: 마이그 추가 시 DATABASE↔CHANGELOG, 라우트 변경 시 PRD↔ARCHITECTURE 동시 갱신.

---

**이 문서 변경 시**: 세션 종료마다 "최종 갱신" 일자 + §1 스냅샷(커밋 해시·마이그 번호) 갱신.
