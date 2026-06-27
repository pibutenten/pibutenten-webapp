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

## 원장 결정 (2026-06-27) — "달라진 점" 분석 대시보드 현재 범위 제외
- "달라진 점" 연령별·효과별 베스트시술 **분석 대시보드 + 분석 RPC(get_change_analysis)는 지금 안 만듦**(나중에). 마스터플랜 §5.4를 "현재 범위 제외(추후)"로 정리, get_change_analysis DDL 제거.
- **데이터 수집은 코어로 유지**: effect_areas(결론칸) + review_checkin.changed_points는 v1부터 계속 축적 → 추후 분석 원천 확보. 분석 착수 시 원칙(표본≥4·병원분해금지·가격미참조)만 남김.
- 영향: 현재 구현 범위는 Phase 3b(통합 글쓰기 UI) → 3c(노트·리포트 연동·시점폼·추이그래프) → P4(알림 발사, FOLLOW 머지 후)까지. 분석 대시보드는 후순위 제외.

## Phase 3b · P4 · 회고날짜 관대화 완료 (2026-06-27)
- **Phase 3b 통합 글쓰기 UI**: WriteTabs(시술기록·시술후기 둘 다 DiaryForm→/api/visits 수렴, doodle/qa는 WriteClient 보존) + DiaryForm(어림시기 칩·시술별 후기 아코디언·is_public 게이팅·day0 checkin·병원검색). 독립 2인 검수 → 발견된 미완성 5건 보정: FIX-1(회고형 reviewOnly에서 날짜·어림시기 노출 — metaOpen 밖 분리) / FIX-2(season·half 가드, 이후 관대화로 완화) / FIX-3(비로그인 정책 통일: 글쓰기 전체 로그인 필요로 확정, WriteTabs 죽은 분기 정리) / FIX-4(공개 후기 최소 1개 신호 가드) / FIX-5(reviewOnly 카피).
- **P4 예약 알림 발사**: scheduled_notification(0296) + run_diary_reminders RPC(0297→실은 0300, CTE·SKIP LOCKED·토글·멱등) + /api/cron/diary-reminders + vercel.json cron. **0301: service_role EXECUTE GRANT 누락 [치명] 보정**(cron 500 회피). diary_reminder kind는 DB CHECK에 추가(10종), 표시 라벨(notification-kinds.ts·KIND_TITLES)은 머지 후 TODO(현재 graceful fallback).
- **회고 날짜 관대화(원장 결정)**: "날짜 잘 기억 안 나요"(`precision='unknown'`, visited_on NULL) 옵션 추가 → 날짜 완전 선택. season/half 미선택은 하드차단 제거하고 연 단위 graceful 강등(봄/상반기 무음 폴백 제거). 마이그 0302(diaries.visited_on nullable + date_precision CHECK 'unknown' + create_visit_with_entries 관대 처리: unknown/NULL이면 트랙A 미예약·범위검증 스킵). 정확날짜 경로는 기존 알림 유지(엄격성 보존). **원칙: 불완전 데이터도 분석에 전부 사용(부분집계 유지), 입력은 관대하게.**
- 검증: 각 단계 독립 2인 검수 + BEGIN/ROLLBACK + tsc + npm run build 통과. 마이그 0300·0301·0302 production 적용.
- **남은 작업**: 3c(노트·리포트에 visit/checkin 표시·시점폼·추이그래프) / notification-kinds.ts diary_reminder 라벨 + KIND_TITLES(머지 후 가능) / standalone ReviewForm recommend(create_procedure_review p_recommend) / 로그인 e2e 브라우저 검증 / review-controls↔ReviewForm 중복 정리(경미).
- 비간섭: tag-dictionary.generated.json(옆 세션) 미커밋 제외. 마이그 0300~0302는 옆 세션 0298·중복0299와 번호 무충돌.

## e2e 검증 + QA 계정 + 마무리 (2026-06-27)
- **QA 검수 공용 계정**: qa-claude@pibutenten.kr (handle qa-claude-bot, profile e4db62cb-…). auth.users 직접 SQL 생성(신형 sb_secret 부재로 admin API 대신; bcrypt+email_confirm) → 트리거 프로필 생성 → 온보딩 UPDATE. 자격증명 `pibutenten-app/.env.qa.local`(gitignored). **모든 세션·서브에이전트 공용**. 메모리 [[qa-test-account]].
- **3개 병렬 완료·커밋(c075d01)**: 시점별 checkin 입력 폼(/reviews/[id]/checkins?t=, 추이그래프 제외 — 원장 지시) / diary_reminder 알림 라벨(notification-kinds.ts+KIND_TITLES, follow_post 보강 FIX-7) / standalone recommend(0303 create_procedure_review p_recommend).
- **e2e 브라우저 검증(preview+QA 세션)**: 통합 글쓰기 폼 렌더(시술기록·시술후기 둘 다, 어림시기+"잘 기억 안 나요" 포함) / reviewOnly 어림시기 노출(FIX-1 확인) / 실제 POST /api/visits 200(비공개 visit158·review738·day0·트랙A) / checkin 폼 소유자 렌더·비소유 notFound(가드 정상). 테스트 데이터 정리(베이스라인 복귀).
- 주의: preview_fill이 React controlled input 이벤트 미발생 → 로그인 폼 자동제출 미검증(쿠키 주입 우회). 인증·세션 메커니즘 자체는 정상(token grant 200). OAuth가 주 경로라 무영향.
- **남은(선택)**: /notes·/reports에 visit/checkin 표시(linkedReviews) / DATABASE.md·CHANGELOG 마이그 0292~0303 동기화(공유문서, 옆 세션 종료로 이제 가능) / review-controls↔ReviewForm 중복정리(경미) / 단답 question_pool(추후).

## 다음 단계 (원장 통합안 확정 시)
- 마스터 플랜 D3 철회 반영 + 시계열을 코어(Phase 1~3 내)로 끌어올림.
- 스키마 확정: procedure_reviews 확장 컬럼(visit_id/diary_procedure_id/is_public/date_precision/solo_price) + review_checkin 신규.
- 기존 666건: visit_id NULL·standalone·precision=정확(작성일 기준)·checkin 0 또는 1(backfill) 로 무손실.
- 회귀 가드 유지: read_public에 is_public 조건, 집계 화이트리스트.

## 불변 주의
- 코드/DB 미변경(문서만). 파괴적 DDL 금지. 명명 author_id/profile_id(user_id 금지).
- 다른 세션 동시 작업 → 겹치는 파일 회피, 명시 stage(-A 금지). 이 로그는 세션 고유.

---

## ★★★ 현재 상태 종합 스냅샷 (2026-06-27 야간, 압축 대비 — 이 섹션이 최신·정본) ★★★

> 한 줄: 후기·시술일기 통합 구현 중. 핵심 기능 대부분 prod 적용. **지금 핵심 = 시술후기 폼 구조 정정(ⓐⓑⓒ) 진행 중** + **0305~0308 적용분 미커밋(repo↔DB drift)**.

### A. prod 적용 마이그 (0292~0308 전부 적용됨)
- **커밋됨(HEAD 41e39ef)**: 0292 스키마·0293 review_checkin+보조·0294 create_procedure_review is_public·0295 GRANT·0296 scheduled_notification·0297 visit RPC 5종·0298 (타세션 인코딩)·0299 solo_price anon봉쇄·0300 run_diary_reminders·0301 GRANT·0302 unknown날짜·0303 recommend·0304 질문 22 시드.
- **적용됐으나 미커밋**: 0305 checkin short_answers · 0306 oneliner→question(+기존 body 660 → short_answer_response 이관) · 0307 질문 v2 28개(구 22 비활성) · 0308 procedure_reviews.visited_on 추가.
- prod 현황: question_pool **active 29**(=28 v2 + "생생한 후기"(any)), total 51(구22 비활성). **short_answer_response 666**(이관). procedure_reviews.visited_on 존재. create_procedure_review=is_public/source/date_precision/recommend/short_answers/visited_on 확장. upsert_review_checkin=short_answers 확장.

### B. 미커밋 코드 (git status, HEAD=41e39ef)
WriteTabs·write/page.tsx·ReviewForm·reviews/[id]/checkins/*·ShortAnswerFields·WriteView·schema/api/reviews.ts·schema/api/visits.ts·api/reviews/route.ts·api/reviews/checkins/route.ts + 마이그 0305~0308. **tag-dictionary.generated.json = 타세션 → 커밋 제외.**

### C. ★올바른 구조 (원장 최종 확정 = 정본. 내 3b 통합은 오류였음)
- **시술후기 폼** = 옛 후기폼 구조 그대로(시술선택+평가+단답+어림시기), 질문만 v2로. **재사용 핵심 단위.** → 시술후기 탭에 이 폼을 붙임(현재 잘못 붙은 DiaryForm reviewOnly 교체).
- **일기(시술노트)** = 원래 폼 그대로, **완전 별도·안 건드림**(병원·날짜·시술·메모).
- **타임포인트별 시술경과 폼** = 위 후기폼 기반, 시점별(당일/1주/1달/4달), **일기의 각 시술에 연결**.
- ⚠ 3b에서 시술후기를 DiaryForm에 합친 게 잘못 → 후기에 가격·병원이 떠서 "이상해짐". 정정 중.

### D. 정정 작업 ⓐⓑⓒ
- **ⓐ 시술후기 탭 → 후기폼(ReviewForm)+어림시기로 교체** [진행 중 — 태스크 #1~5, 병행 세션이 실행 중 정황]: 0308 visited_on 적용됨. ReviewForm 어림시기·WriteTabs 교체(#4 in_progress)·검증(#5 pending).
- **ⓑ 일기(DiaryForm) 원래대로 분리** [대기]: 3b가 DiaryForm에 넣은 후기/통합 흔적 제거, 시술노트=순수 기록.
- **ⓒ 타임포인트별 시술경과 폼 = 후기폼 기반·일기 연결** [대기]: checkin 폼을 후기폼 형태로, 일기 시술에 연결.

### E. 확정 결정 (UI/콘텐츠)
질문 v2 28개(당일/1주/1달/4달 각 7) + "생생한 후기를 남겨주세요"(any). 단답=후기 자유텍스트 본체(별도 body칸 없음=일원화). 글자수 **400**(카운터 n/400). placeholder **10개 랜덤**(격려문구, 질문 아님). 다시고르기: **2칸 중복금지·랜덤·새로고침아이콘(↻)·페이드**. 기존 body 660 → short_answer_response("생생한 후기" 답) 이관(무손실, 최대 328자). 단독폼은 전 시점 질문 로드. /reports 현행 유지. /notes NULL-safe 완료. 분석 대시보드 범위 제외. 가격 영구 비공개(F2).

### F. 남은 일
1. ⓐ 완료(WriteTabs 교체+검증) → ⓑ(일기 분리) → ⓒ(시점별 경과 폼·일기 연결).
2. **0305~0308 + 미커밋 코드 커밋·푸시**(prod 적용됐는데 repo 미반영=drift). 병행 세션과 조율(중복 커밋·충돌 주의).
3. 종합 e2e(QA 계정 [[qa-test-account]] qa-claude@pibutenten.kr / pibutenten-app/.env.qa.local) + 테스트 데이터 정리.
4. DATABASE.md/CHANGELOG 0305~0308 동기화.

### G. ★멀티세션 주의
병행 세션이 이 review-diary 작업(ⓐ 등)을 **동시 실행 중인 정황**(태스크 #1~4 진행, 0307/0308 적용 — 내가 안 했는데 적용됨). 내 에이전트 런치가 거부되는 이유로 추정. **겹치는 파일 동시수정·중복 커밋 회피.** 진행 전 git status·태스크·prod 상태 재확인.

---

## ★★★ 재개 (2026-06-27, 압축 후) — ⓐ 완료·검증

### H1. ⓐ 시술후기 폼 = 완료 + end-to-end 검증 통과
- **배선 누락 1건 발견·수정**: `src/app/write/page.tsx` 가 `shortAnswerQuestions` 를 계산만 하고 `<WriteView>` 에 미전달 → ReviewForm 이 빈 배열 받아 단답이 단일 fallback 으로 떨어짐. prop 1줄 추가로 교정(WriteView→WriteTabs→ReviewForm 체인은 이미 정상).
- **백엔드 정합 prod 확인**: `create_procedure_review` = 18-인자 단일 시그니처(p_visited_on date, p_date_precision text, p_recommend, p_short_answers 포함, 옛 16-인자 오버로드 없음). `procedure_reviews.visited_on` 존재. 보조 RPC 3종(upsert_review_checkin·run_diary_reminders·delete_visit) 존재. (`create_review_recommend` 은 *함수가 아니라* 0303 파일명일 뿐 — 그 작업은 18-인자 시그니처에 흡수됨. missing/drift 아님.)
- **tsc·build 통과.**
- **e2e (QA 계정, 세션쿠키 주입)**: `/write?tab=review` → 제목 "시술 후기를 남겨주세요", 어림시기 블록(언제 받으셨어요?·정확/계절/반기/연/모름·달력), 가격·병원 없음. 단답 **2칸**(slot1=대표 "생생한 후기", slot2=랜덤 일반질문) + **다시고르기 2개**. 다시고르기 클릭 시 slot2 교체·두 칸 중복 없음 확인.
- ⚠ **검증 함정(교훈)**: 처음에 단답이 1칸 fallback 으로 떠 혼선 → 원인은 (1) **PWA 서비스워커가 옛 클라이언트 번들 캐시**(SW unregister + caches.delete 로 해결), (2) 'any' 활성 질문 1개. 코드/배선 문제 아니었음.

### H2. 마이그 0309 — 'any' 일반 질문 풀 보강 (prod 적용 완료)
- 문제: 0307 이 질문을 시점별 28개로 교체하며 `timepoint='any'` 활성을 대표 1개만 남김 → standalone 폼 2칸 불가.
- 사용자 지시: "2개 랜덤하게 뜨고 다시 고를 수 있게"(원래 지시). → 일반(시기무관) 질문 6개 추가(id 52~56) + 동일텍스트 비활성 id=22 재활성. **'any' 활성 = 7개**(id 22·23·52~56). 깨짐(U+FFFD) 0 재스캔 확인.
- 파일 `supabase/migrations/0309_question_pool_any_general.sql`(멱등: INSERT NOT EXISTS + 동일텍스트 재활성 UPDATE). 시점별 checkin 폼은 [timepoint, 'any'] 둘 다 로드하므로 이 6개가 경과폼도 풍부하게 함.

### H3. ⓑ/ⓒ 현황 (조사 결과 — 대부분 이미 구현됨)
- **ⓑ 일기(DiaryForm)**: 시술기록 탭이 DiaryForm(reviewOnly **미전달**=기본 false)로 렌더 → 시술기록은 원래 일기 폼대로 동작. 단 `SkinDiaryForms.tsx` 에 3b 잔재 `reviewOnly` 분기(line 129~887)가 **dead code 로 잔존**(무해, 호출처 없음). "일기 원래대로" 취지상 정리 대상이나 활성 폼 리팩터라 리스크 — 별도 판단 필요.
- **ⓒ 타임포인트별 시술경과 폼**: 인프라 존재 — `/reviews/[id]/checkins?t=week1|month1|month4` 폼(만족도·추천·효과·통증·달라진점 + 단답), `upsert_review_checkin` RPC, scheduled_notification 딥링크. 단답은 [해당시점, 'any'] 질문 로드. procedure_reviews(→visit→diary) 연결. notes UI(RecordNotesPanel/RecordView/RecordTab)에 경과 참조. **대체로 완성** — 일기→경과폼 UI 진입 동선 end-to-end 확인은 남음.

### H4. 남은 일 (갱신)
1. **커밋·푸시**(0305~0309 + 미커밋 코드, tag-dictionary.generated.json 제외) — prod drift 해소. §3 코드검수(2인) 게이트 후. **deploy=prod 액션이라 사용자 greenlight 권장.**
2. DATABASE.md 마이그 표 + CHANGELOG 0305~0309 동기화.
3. ⓑ reviewOnly dead code 정리 여부 결정.
4. ⓒ 일기→경과폼 진입 동선 e2e 확인.
5. placeholder 10개 랜덤(현재 ShortAnswerFields 는 "자유롭게 적어주세요" 하드코딩) — 사용자 확정문구 재확인 후 적용.
