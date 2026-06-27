# 후기·시술일기 통합 — 계획 수립 최종 보고서

> 작성: 2026-06-27 (총괄 디렉터 세션 `3400e728`, 야간 자율 완수)
> 성격: **계획 수립 + 다중 에이전트 적대 검증 결과 보고.** 코드/DB는 변경하지 않았습니다(계획 단계).
> 정본 계획서: [review-diary-unification-master-plan.md](../plans/review-diary-unification-master-plan.md) (188KB, 1875줄)
> 세션 작업 로그: [review-overhaul-worklog-sess-3400e728.md](../plans/review-overhaul-worklog-sess-3400e728.md)

---

## 1. 의뢰와 목표

원장(오너)이 전달한 `전달용/pibutenten_후기시스템_개편_계획서.md`(제안 C — 후기를 시계열로 추적하는 개편안)를 검토하여, 다음을 모두 충족하는 **단일 정합 후기 DB**의 상세 구현 계획을 수립하는 것이 목표였습니다.

1. **시술기록(일기)에서 자연 파생되는 후기** — 언제·어디서·무슨 시술을 받았는지 기록할 때 얻어지는 후기(시점 정확).
2. **회고형 후기** — 정확한 날짜를 기억 못 해도 쓸 수 있는 후기(어림 시기).

최우선 제약: **정합성·SSOT(평행 모델 금지)**, 기존 데이터 무손실, 의료법 제56조·제27조 방어, **옆 세션과 비간섭**.

---

## 2. 수행 과정 (단계별)

| 단계 | 내용 | 결과 |
|---|---|---|
| 1. 현황 조사 | 제안 C·기존 계획 A(skin-diary-integration-plan)·필드맵 v0.5·ADR 0019/0023/0014/0015·PRD 정독 + production DB 직접 조회 | **3중 분리 실체 발견**: 비공개 일기(`diaries`/`diary_procedures`) / 공개 후기(`procedure_reviews`) / 공개 리포트(앵커) — 서로 연결 없음. 제안 C는 이 존재를 모른 채 평행 6테이블 제안 |
| 2. 1차 독립 설계 2인 | 동일 브리프로 서브에이전트 2명이 독립 설계 | 둘 다 독립적으로 **"계획 A(visit⊃entry)를 SSOT 척추로, 제안 C 가치는 흡수"** 결론에 수렴 |
| 3. 원장 피드백 반영 | (a) 시계열을 코어로 격상 (b) `diary_procedures`는 후기와 분리·연결만(흡수 안 함) (c) "결론 칸" = 분석 단일출처 (d) 회고 후기 통합 (e) 시점 day0/week1/month1/month4 확정 | 4층 구조로 정밀화 |
| 4. 상세 계획 생성 워크플로 | 8섹션 병렬작성 → 라이브DB 적대 기술검증 → 통합 → **2인 독립 SSOT 적대검토 3라운드** | 173KB 상세 계획서. critical 3→1→1 |
| 5. 최종 무결 검증 | 잔여 CRITICAL 규명 + 인코딩 ground truth로 무장한 **최종 독립 2인 검토** | **둘 다 PASS, [치명] 0건** |
| 6. 정정·통합 | 픽서가 주요 1 + 경미 6 반영 → 단일 정본 통합 | 188KB 단일 정본 |

---

## 3. 확정된 최종 설계 (4층 구조)

```
diaries (시술일기/방문, 기존 확장)              🔒 비공개 owner-only
 ├ diary_procedures (그날 받은 시술 목록, 기존 유지)  🔒 비공개 — 후기 없어도 기록만
 └ procedure_reviews (후기 앵커 + "결론 칸", 기존 확장)  📊 평가 / 👁 공개옵트인
      └ review_checkin (시계열 측정, 신규)          📊 day0/week1/month1/month4
```

핵심 설계 결정(원장 확정 O1~O7 + 디렉터 결정 D-A~D-J, 정본 §확정 결정 로그):

- **결론 칸이 분석 단일출처.** 회고 후기는 결론 칸을 직접 입력, 일기연결 시계열 후기는 checkin을 쌓고 매 제출 시 결론 칸으로 롤업. **집계·분석은 결론 칸만 읽고 checkin·diaries를 일절 JOIN하지 않음.**
- **`diary_procedures`는 후기 테이블로 흡수하지 않음.** "기록만" 시술은 여기에만 남아 후기 집계에 평가-NULL 오염이 원천 소멸.
- **회고 후기 통합.** 별도 테이블 안 만들고 `procedure_reviews`에 `source=standalone`·`visit_id=NULL`·`date_precision=어림`으로 수용. 기존 666건이 이미 이 형태라 무손실.
- **자유텍스트(한줄후기) 유지** + 단답풀은 보완재(제안 C의 제거안 거부).
- **시계열은 코어**(Phase 1~3). 시점 day0·week1·month1·month4 고정.
- **가격 공개 v1 보류**(변호사 후 v2), 병원별 공개집계 금지, 의료법 화이트리스트를 스키마 격리로 구조 강제.

---

## 4. 검증 결과

- **워크플로 SSOT 적대검토 3라운드**: critical 3→1→1. 마지막 잔여 CRITICAL은 **검토자 자신의 셸 UTF-8 인코딩 아티팩트로 인한 오탐**("울쎄라가 tag_dictionary에 없다")이었음을 디렉터가 직접 DB로 판정(울쎄라 30건 실사용, 666/666 전수 is_procedure=true). 한글 리터럴을 IN 절에 직접 넣으면 빈 결과가 나오는 함정.
- **최종 독립 2인 검토(인코딩 ground truth로 무장)**: **둘 다 VERDICT pass, [치명] 0건.** 라이브 대조로 확인된 무결 항목 — card_id nullable UNIQUE 정상, NOT NULL 완화 후 CHECK 통과, `source_link_chk`×`SET NULL` 상호무효화 해소(`delete_visit`), RLS 명함단위 정합, 마이그 0292, 집계 결론칸 단일출처, 명명규칙.
- 검토자가 짚은 **주요 1 + 경미 6**을 픽서가 전부 반영(§5).

### 발견·해결한 주요 설계 결함 (검증의 성과)

1. **[치명·해결] `delete_visit` 미존재 시 일기 삭제 영구 차단 (D-I).** `procedure_reviews.visit_id ON DELETE SET NULL`(후기 보존 의도)과 `source_link_chk`(diary_linked면 visit_id 필수) CHECK가 서로를 무효화 → diary_linked 후기 붙은 일기를 raw DELETE하면 23514로 영구 차단. → 전용 `delete_visit` RPC(연결 후기를 standalone 전환 후 삭제)로 해소.
2. **[주요·해결] `diaries_delete_own` RLS 정책이 raw DELETE 우회 허용.** 위 RPC 강제가 코드 관례만으로는 불완전(클라이언트 `.delete()` 우회 가능). → 마이그 0292에 `DROP POLICY diaries_delete_own` 추가로 DB레벨 강제(FIX-1).
3. **[치명·해결] 공개 시계열 후기의 롤업 사후변동이 `/reports` ISR·JSON-LD를 stale로 남김 (D-H).** → v1에서는 diary_linked 후기를 비공개 추이그래프 전용으로 한정, 공개는 standalone만. 공개 시계열은 P3 이후(revalidate 계약 선결).
4. **[주요·해결] 미완성→완성 동선의 시계열 시작 누락 사각지대 (D-J).** → v1에서 해당 동선 명시 차단.
5. **[경미·해결] 백필이 soft-deleted 카드 6건을 공개화** → EXISTS(deleted_at IS NULL) 가드로 660/6 분리(FIX-2).

---

## 5. 옆 세션(FOLLOW) 비간섭 조치

옆 세션이 팔로우 기능을 동시 구현 중임을 git으로 확인하고 전면 회피했습니다.

- **마이그 번호**: 옆 세션이 `0290_follows.sql`·`0291_follows_lock_select.sql` 점유 → 본 계획은 **0292부터**(상대표기, 착수 직전 `ls`로 재확인).
- **공유 코드** `src/lib/notification-kinds.ts`(follow_post 추가됨): 본 계획의 `diary_reminder` kind는 **P4(후순위)** 로 미뤄 FOLLOW 머지 후 append-only 처리.
- **미수정 파일**: `CHANGELOG.md`·`DATABASE.md`·`SESSION_HANDOFF.md`·`notification-kinds.ts`·`supabase/migrations/`·모든 `src/` — **일절 건드리지 않음.**
- 워크플로 전 에이전트 **읽기 전용**(SELECT만, build/dev/쓰기 금지) → `.next/dev` 점유와 무충돌.

---

## 6. 생성·변경 파일 (전부 본 세션 소유, 옆 세션과 비중첩)

| 파일 | 상태 |
|---|---|
| `docs/plans/review-diary-unification-master-plan.md` | **신규 정본**(188KB) — v2 상세 계획서 |
| `docs/plans/review-overhaul-worklog-sess-3400e728.md` | 신규 — 세션 작업 로그 |
| `docs/reports/2026-06-27-review-diary-unification-plan.md` | 신규 — 본 보고서 |

폐기: `review-diary-unification-v2-detailed-plan.md`(정본으로 통합), v1 요약본(폐기). `skin-diary-integration-plan.md`(계획 A)는 본 정본이 흡수·대체(역사 자료로 잔존).

### 비간섭 위해 보류한 문서동기화(머지 시점 적용 권장 스니펫)

옆 세션이 활발히 편집 중이라 보류했습니다. Phase 1 착수·머지 시점에 적용하십시오.

- **CHANGELOG.md** `### Added`: "후기·시술일기 통합 마스터 플랜(v2) 수립 — 4층 구조(diaries/diary_procedures/procedure_reviews 결론칸/review_checkin), 2인 독립 SSOT 적대검토 통과. 미구현(계획)."
- **ROADMAP.md**: "후기·시술일기 통합(visit⊃diary_procedures+procedure_reviews→review_checkin, 시계열 코어) — 계획 확정, Phase 1 착수 대기."
- **decisions/**: 본 결정을 ADR로 정식화(번호는 FOLLOW 세션의 ADR과 충돌 회피해 머지 시점 부여). 핵심: 4층 구조·결론칸 단일출처·diary_procedures 분리·시계열 코어.

---

## 7. 다음 단계

**원장 결정 필요(정본 §원장 미결 결정):**
1. 출시 범위·순서(추천: 코어 통합 먼저, 시계열·알림 후속 — 단 시계열은 코어로 이미 포함).
2. 가격 공개 + 변호사 자문 타이밍(추천: Phase 3 전 자문, 공개는 v2).
3. diary_linked 공개 시계열 후기의 P3 이후 도입 시점(D-H).

**구현 착수(승인 후):** 정본 §8 로드맵의 Phase 1(마이그 0292~0293 + RLS·집계 회귀가드)부터. 착수 직전 마이그 최신번호 재확인 + FOLLOW 머지 상태 점검.

---

*본 보고서·계획서는 제품·기술 설계 종합이며 법률 자문이 아닙니다. 의료법 최종 적합성은 변호사 검토가 필요합니다.*
