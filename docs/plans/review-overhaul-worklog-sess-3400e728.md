# 후기·시술일기 통합 — 세션 작업 로그 (세션 3400e728)

> **이 파일은 세션 `3400e728` 전용 임시 작업 로그입니다.** 두 세션이 동시에 도므로 세션 고유 파일로 분리(다른 세션과 충돌 방지). 토큰 압축으로 대화 기억이 날아가도 이 파일로 복구한다. **모든 변경·결정마다 이 파일을 갱신한다.**
> 공식 계획: `docs/plans/review-diary-unification-master-plan.md` (마스터 플랜 v1). 본 로그가 그보다 최신 결정을 담을 수 있으며, 확정 시 마스터 플랜에 반영.

---

## 세션 목적
원장(오너) 지시: 후기 시스템 개편(`전달용/pibutenten_후기시스템_개편_계획서.md`) 검토 → 2개 서브에이전트 독립 설계 → 디렉터 종합 → 마스터 플랜 → 구조 정밀화. **현재 코드/DB 미변경, 문서만.**

## 진행 타임라인
- [완료] 1차 자료 정독: 제안 C(전달용 개편계획서) / 계획 A(`skin-diary-integration-plan.md`) / 필드맵 v0.5 / ADR 0019·0023·0014·0015 / PRD·ARCHITECTURE·DATABASE·SESSION_HANDOFF.
- [완료] production 검증(직접 DB 조회):
  - 행수: diaries 70 / diary_procedures 86 / procedure_reviews 666 / review카드 666 / review_summary 앵커 46.
  - 채움률: effect_onset 94.6% / downtime 94.6% / effect_areas 100% / area·cost_satisfaction·oneliner_type **0%(dead)**.
  - diary_procedures 86건 중 procedure_ko가 tag_dictionary에 없는 건 2건(78건 tag_dict_ko 보유).
  - FK: procedure_reviews.author_id→profiles **CASCADE**, card_id→cards CASCADE, procedure_ko→tag_dictionary(ON UPDATE CASCADE). diaries.profile_id→profiles CASCADE. **단 탈퇴는 ADR 0002로 익명화(in-place)라 CASCADE 평상시 미발동.**
  - 확장: **pg_cron 미설치, pg_net만.** notifications에 send_at 없음 → 예약알림 신규 인프라(Vercel Cron) 필요.
  - 마이그 번호 0289까지 → 신규 0290부터.
  - RLS: diaries owner-only CRUD. procedure_reviews read_own + read_public(**무조건 공개 → is_public 조건 추가 필요**), 쓰기정책 없음(RPC 경유).
  - `/write`에 이미 3탭(record/review/doodle) 존재하나 record→diaries(비공개), review→procedure_reviews(공개) **분리 저장·연결 없음**.
- [완료] 2 서브에이전트 독립 계획서 → 종합 → 마스터 플랜 v1 작성.
- [진행] 원장 피드백 반영 구조 정밀화(아래).

## 원장 확정 지시 (2026-06-27)
1. **시간추적(시계열)이 핵심.** → 마스터플랜의 "시계열 Phase 4 보류" **철회. 코어로 격상.**
2. **시술기록(일기)과 후기는 같은 테이블 아님 — 연결만.**
   - 시술일기(visit)에 그날 받은 시술 목록까지 기록(예: 써마지·울쎄라·더엘주사 3개).
   - 각 시술의 후기 = 각각 독립 테이블에, 시계열로 저장, 일기와는 연결만.
   - → 마스터플랜 **결정 D3(diary_procedures를 procedure_reviews로 흡수) 철회.** `diary_procedures`는 "받은 시술 목록"으로 **유지**, 후기 테이블과 분리·연결.
3. **미결(원장이 디렉터 의견 요청):** 일기 없이(어림시기) 후기만 쓰는 경우 → 위 시계열 후기 테이블에 **통합** vs **별도 테이블**? 통합 가능하면 통합도 OK.
4. **프로세스:** 세션별 작업 로그 파일 유지(이 파일). 두 세션 동시이므로 세션 고유 파일.

## 디렉터 갱신 구조안 (원장 지시 2 반영)
```
visit (= diaries 확장)                         🔒 비공개
 ├ 병원·날짜·의사·실장·총액·메모·완성여부
 │
 ├ diary_procedures (유지·확장)                 🔒 비공개 — "그날 받은 시술 목록"
 │    · 써마지 / 울쎄라 / 더엘주사 …  (후기 없어도 기록만 가능)
 │
 └ procedure_reviews (= 후기 시리즈 앵커, 확장)   📊 평가 / 👁 공개옵트인
      · visit_id(nullable FK) + (선택)diary_procedure_id + procedure_ko + author_id
      · is_public · card_id(nullable, 카드 1:1 유지) · date_precision(정확/어림)
      │
      └ review_checkin (신규·코어)               📊 시계열 측정 — "그 시계열 표"
           · timepoint(day0/week1/month1/month3/recall)
           · satisfaction·effect·통증·changed_points 등
```
- "기록만" 시술 = diary_procedures 행만(procedure_reviews 없음). → **집계는 procedure_reviews만 보므로 평가-NULL 오염 위험 소멸**(마스터플랜 리스크 #1 자동 완화). 86건 흡수 마이그도 불필요.
- 후기만(어림시기) 케이스 = procedure_reviews(visit_id NULL, precision=어림) + review_checkin 1건(recall). **기존 666건이 이미 이 형태**(visit_id NULL) → 통합이 자연스러움.

## 디렉터 의견 — 미결(지시 3) 답: **통합 권장**
후기만 쓰는 경우도 같은 후기/시계열 테이블에 넣는다. 차이는 (1)일기 연결 유무(visit_id NULL) (2)정확/어림 날짜(date_precision) (3)시계열 N개 vs recall 1개뿐 — 전부 컬럼/행 차이이지 테이블 차이가 아님. 별도 테이블로 가면 후기가 또 두 갈래로 쪼개져 SSOT 재위반. 제안 C 자체의 "A ⊇ B"(자유후기=시계열의 recall 1점)와도 일치. 단 분석 구분 위해 `source`(diary_linked/standalone)·`date_precision` 플래그 보존.

## 원장 추가 정정 (2026-06-27) — "결론 칸"이 분석 단일 출처
- 재확인 OK: 하루 3개 시술(써마지·울쎄라·더엘주사) → 시술일기엔 "3개 받음" 목록만, 각 시술 후기는 후기 테이블에 **각각 독립 행**.
- **결론 칸(conclusion columns) 도입:** procedure_reviews(후기 앵커)에 시점별 상세값과 **별도로** "결론" 컬럼군(만족도·추천의향·효과발현시점·달라진점 등 최종값)을 둔다. **이 결론 칸이 분석/집계의 단일 출처** — 집계할 때 checkin(시계열)에서 끌어오지 않는다.
  - **회고 후기(standalone):** 결론 칸을 사용자가 **직접 입력**. checkin 0건.
  - **일기연결 시계열 후기:** review_checkin에 시점별 상세값을 차곡차곡 쌓고, **매 checkin 제출 시 그 값을 결론 칸으로 롤업**(앵커가 항상 최신 결론 보유). month3엔 "돌이켜보니 언제부터?" 직접 질문으로 결론칸 보강.
  - → 분석/집계는 **앵커 결론 칸만** 읽음. checkin은 개별 후기 "추이 그래프"(표시)용.
- **직전 안 수정:** 회고 후기를 "recall checkin 1건"으로 두려던 것 → **철회.** 회고는 앵커 결론칸 직접 입력(checkin 0). 'recall' 타임포인트 불필요.
- **기존 666건 호환:** 현행 procedure_reviews 컬럼(satisfaction·pain·revisit·effect_areas·effect_onset)이 곧 "결론 칸". 666건은 이미 결론칸이 채워진 standalone 후기 → 값 마이그 불필요. 신규로 추가: recommend(추천의향, revisit과 별개)·visit_id·diary_procedure_id·is_public·date_precision·source·solo_price + review_checkin(신규).
- 롤업 규칙(제안 C §5-1): 만족도·추천=최신 시점, 효과발현=month4 직접 or 도출, 달라진점=최신/누적.

## 원장 확정 (2026-06-27) — 시계열 시점
- **당일(day0) · 1주(week1) · 1달(month1) · 4달(month4)** 로 확정. 시술 종류와 무관하게 동일(애매하게 시술별 차등 안 함).
- 알림 발사 = visited_on +7/+30/+120 → week1/month1/month4 checkin 폼 딥링크.
- 원장 지시: "전체 상세 계획서 작성" → 워크플로(섹션 병렬작성 → 라이브DB 적대적 검증 → 통합)로 v2 상세 계획서 생성 진행.

## 최종 완료 (2026-06-27, 야간 자율 완수)
- **워크플로(wr9xm4c3k)**: 8섹션 병렬작성 → 라이브DB 기술검증 → 통합 → 2인 SSOT 적대검토 3라운드(critical 3→1→1). 산출 173KB 상세 계획서(별도 파일에 저장됨).
- **clean=false 원인 규명**: 마지막 잔여 CRITICAL("울쎄라 tag_dictionary 미존재")은 **검토자 자신의 셸 UTF-8 인코딩 아티팩트로 인한 오탐**. 디렉터 직접 DB 판정 — 울쎄라는 procedure_reviews 30건 사용·실존(666/666 전수 is_procedure=true). 한글 리터럴을 IN 절에 직접 넣으면 빈 결과가 나오는 함정(JOIN으로 검증해야 함).
- **최종 독립 2인 검토(인코딩 ground truth로 무장)**: 둘 다 **VERDICT pass, [치명] 0건**. 주요 1(diaries_delete_own RLS 미제거) + 경미 6 발견.
- **픽서 7개 정정 반영**: FIX-1(0292에 `DROP POLICY diaries_delete_own` — raw DELETE 차단 DB레벨 강제) / FIX-2(백필 soft-deleted 6건 제외) / FIX-3(트랙A recipient_id=diaries.profile_id) / FIX-4(diary_reminder 제목 왜곡 주석) / FIX-5(토글 발사게이트 P4 검증항목) / FIX-6(get_review_summary_pool STABLE 가드 실효범위) / FIX-7(follow_post 제목 선택보강).
- **통합**: 요약본+상세본 2파일 → 단일 정본 `review-diary-unification-master-plan.md`(188KB, 1875줄). v2-detailed 파일 제거. (v1 요약본 폐기.)
- **옆 세션(FOLLOW) 비간섭 확인**: 마이그 0292+(0290·0291 follows 점유 회피), notification-kinds.ts·CHANGELOG·DATABASE·SESSION_HANDOFF·src/ 일절 미수정. 워크플로 전 에이전트 읽기전용(SELECT만, build 금지).
- **상태**: 계획서 무결 검증 통과. 코드/DB **미변경**(계획 단계). 원장 승인 + Phase 1 착수 대기.
- **미적용(의도적, 비간섭)**: CHANGELOG/ROADMAP/PRD 등 공유문서는 옆 세션 활발 편집 중이라 보류 — 최종 보고서에 적용 스니펫 명기.
- 최종 보고서: `docs/reports/2026-06-27-review-diary-unification-plan.md`.

## 구현 착수 (2026-06-27 야간) — 원장 결정 F1/F2/F3
- F1 전부 한번에(의존순서 유지, 미완 라이브 UI는 main push 보류) / F2 가격 공개 영구 안 함(가격 버킷·변호사게이트 제거) / F3 공개 시계열 도입(diary_linked 공개 허용 + checkin 제출 시 revalidatePath로 리포트 재검증).
- 구현 순서(서브에이전트 위임 → 독립 2인 검수 → 보고, 직접 코드편집 안 함):
  - **Phase 1 (진행중)**: DB 토대 — 0292(diaries·procedure_reviews 확장 + NOT NULL 완화 + CHECK + 백필 660/6 + read_public is_public 가드 + diaries_delete_own DROP + 인덱스) / 0293(review_checkin + 보조 테이블 review_symptom/question_pool/short_answer_response + RLS). production 적용 + 검증.
  - Phase 2: create_visit_with_entries / upsert_review_checkin / update_visit / delete_visit / unpublish_review RPC + /api/visits·checkins (dormant, 안전 커밋).
  - Phase 3: 통합 글쓰기 UI(동적 아코디언·어림시기·시계열 폼) — 라이브 변경, push 신중.
  - Phase 4: 집계(결론칸·revalidate)·리포트·노트 연동. F2로 가격공개 제거.
  - Phase 5: scheduled_notification + /api/cron/diary-reminders(0294) + 2트랙 알림.
- 안전수칙: 옆 세션 FOLLOW 커밋완료(HEAD 3794412). 마이그 0292부터(ls로 재확인). DATABASE.md/CHANGELOG 등 공유문서 즉시편집 보류(머지 시 배치). npm build는 .next 점유 확인 후. 커밋은 검수 통과분만, 미완 UI는 push 안 함.

## Phase 1·2 완료 (2026-06-27 야간)
- **Phase 1 (0292~0295)**: production 적용 + 독립 2인 감사 PASS(치명0, 무회귀·무누출) + 커밋·푸시(871748d). 0294=create_procedure_review is_public 패치(read_public 게이트 도입 후 신규 공개후기 비노출 라이브 회귀 교정 + 앵커 mojibake 복원). 0295=신규4테이블 GRANT SELECT.
- **Phase 2 백엔드 (0296 scheduled_notification · 0297 RPC5종 · 0299 solo_price anon 봉쇄)**: production 적용 + BEGIN/ROLLBACK 검증(미persist) + **F3 정합(공개 diary_linked 후기 허용: 카드+앵커+day0 checkin+트랙A)** + 독립 2인 감사 PASS(치명0). F2(가격 비공개) solo_price anon REVOKE+화이트리스트(0123패턴). 전부 dormant.
- **마이그 번호 충돌 처리**: 옆 세션이 `0298_encoding_repair_and_url_unify` 선점 → 내 solo_price 봉쇄를 0298→**0299** 재번호. `SESSION_HANDOFF.md`는 옆 세션 수정중 → 미터치.
- **★코디네이션 경보**: 옆 세션 0298이 "11함수 정본 복원(인코딩)". 그 11함수에 `create_procedure_review` 포함 시 내 0294 is_public 패치를 옛버전으로 덮어쓸 위험. **현재 라이브엔 내 패치 생존 확인(is_public/source/date_precision present).** 머지 시 `create_procedure_review`가 이 3컬럼 보유하는지 재확인 필수 — 빠지면 신규 공개후기 비노출 회귀 재발.
- **남은 작업(Phase 3 프런트, 라이브·빌드검증 필요)**: 통합 글쓰기 UI(동적 아코디언·어림시기·시계열 폼) + API 라우트(/api/visits·/api/visits/[id]/checkins[revalidatePath 필수]·DELETE·PATCH·unpublish) + /notes·리포트 visit/checkin 연동 + ReviewForm recommend 필드 + create/update_procedure_review에 recommend 인자(D-D 잔여). cron 발사(run_diary_reminders + /api/cron/diary-reminders + notification kind=`diary_reminder`)는 notification-kinds.ts 공유라 FOLLOW 머지 후(P4/P5).

## Phase 3a 완료 (2026-06-27, API 라우트)
- 신규 6파일(dormant, 라이브 무참조): `src/app/api/visits/route.ts`(POST→create_visit_with_entries), `src/app/api/visits/[id]/route.ts`(PATCH→update_visit, DELETE→delete_visit), `src/app/api/reviews/checkins/route.ts`(POST→upsert_review_checkin + **revalidatePath**(공개 diary_linked만, ko+en+family)), `src/app/api/reviews/[shortcode]/unpublish/route.ts`(POST→unpublish_review), `src/lib/schema/api/visits.ts`(zod .strict 3종), `src/lib/review-report-revalidate.ts`(재검증 경로 SSOT).
- 현행 /api/reviews 패턴 답습(인증 active 명함·CSRF middleware·mask/screen은 공개 entry만·rpc 사용자JWT·에러매핑 SQLSTATE+message). F2: solo_price 응답/카드/revalidate 미노출. F3: 공개 checkin 후 리포트 재검증.
- 보정: shortcode 요청내 중복방지 Set + 23505→409, checkins 22001 매핑(FIX-A/B).
- 검증: 독립 2인 감사 PASS(치명·주요 0), `tsc --noEmit` 0, **`npm run build` 성공**(dev 미가동 확인 후). 미커밋 페이즈로 dormant.
- 잔여(3b로): update_visit is_complete preserve-on-omit(부분PATCH 대비), ReviewForm recommend.

## 다음 단계 (원장 통합안 확정 시)
- 마스터 플랜 D3 철회 반영 + 시계열을 코어(Phase 1~3 내)로 끌어올림.
- 스키마 확정: procedure_reviews 확장 컬럼(visit_id/diary_procedure_id/is_public/date_precision/solo_price) + review_checkin 신규.
- 기존 666건: visit_id NULL·standalone·precision=정확(작성일 기준)·checkin 0 또는 1(backfill) 로 무손실.
- 회귀 가드 유지: read_public에 is_public 조건, 집계 화이트리스트.

## 불변 주의
- 코드/DB 미변경(문서만). 파괴적 DDL 금지. 명명 author_id/profile_id(user_id 금지).
- 다른 세션 동시 작업 → 겹치는 파일 회피, 명시 stage(-A 금지). 이 로그는 세션 고유.
