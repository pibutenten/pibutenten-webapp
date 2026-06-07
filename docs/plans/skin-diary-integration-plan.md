# 피부일기 통합 — 상세 계획서 (v1)

> 상태: **계획 / 미착수.** 본 문서는 구현 전 합의된 설계를 담은 단일 출처입니다.
> 원장님 지시 "피부과 전문의와 함께하는 나의 피부일기"로의 방향 전환을 반영합니다.
> 구현은 본 계획 승인 후 단계별로 서브에이전트에 위임합니다.
> 동작 레퍼런스: `전달용/피부텐텐_시술일기_프로토타입_v0_5.html` (필드맵 v0.5).
> 디자인 목업: `public/mockups/skin-diary.html` → 웹 `/mockups/skin-diary.html` (noindex, 검토용. 시스템 미반영).

---

## 0. 방향 전환의 본질

기존 시스템은 **공개 시술후기 수집기**다. 후기 1건 = 공개 카드 1건(`cards` + `procedure_reviews` 1:1). 비공개 일기 층이 아예 없다.

전환 후 정체성은 **비공개 피부일기가 본체이고, 후기는 그 일부**다. 핵심 가치는 "내가 언제·어디서·무슨 시술을 받았는지" 기록 + 시간 기반 리마인드("써마지 받으신 지 1년 됐어요")로 인한 리텐션이다.

이건 화면 추가가 아니라 **데이터 무게중심을 공개→비공개로 옮기는 일**이다.

---

## 1. 확정된 설계 결정 (원장님 합의 사항)

| # | 결정 | 비고 |
|---|---|---|
| D1 | **2층 분리.** 비공개 일기(visit/entry) ↔ 공개 카드(cards). 공개 옵트인한 entry만 cards로 투영 | "캡처 한 번, 출력 두 개". 개인정보·의료법 방어를 구조로 강제 |
| D2 | **글쓰기 통합.** 진입 버튼 1개 → 안에서 "피부일기 / 시술후기만 / 끄적끄적" 선택. 앞 둘은 같은 일기 체계로 수렴 | 끄적끄적(doodle)·Q&A(의사)는 기존 경로 유지 |
| D3 | **동적 후기 카드.** "오늘 받은 시술" 입력 전엔 후기란이 안 뜸. 시술 입력 시 시술별 아코디언 카드 생성. 안 펼치면 기록만 | v0.5 §5 |
| D4 | **모든 항목 선택.** 어떤 칸도 필수 아님. 빈칸 허용 | 병원·날짜 몰라도 기록 가능 |
| D5 | **기록 단위 미완성 + 알림 회수.** 항목을 시간으로 가르지 않음. 기록 1건에 완성/미완성 상태 1개. 미완성이면 알림이 회수 | 원장님 "지켜보는 중이 너무 많다" 해결 |
| D6 | **알림 4일 / 1주 / 1달 3회 상한.** 단계별 다른 문구, 이미 채운 항목 재질문 안 함, "완료"/"그만 알림"으로 즉시 중단 | 강요로 느껴지지 않게 |
| D7 | **공개 집계는 채워진 값만 부분 집계.** 효과 칸이 비면 효과 통계만 빠지고 만족도 통계엔 들어감 | 현 리포트가 이미 answered-count 방식이라 호환 |
| D8 | **일기장 감성.** 캘린더 뷰 + 타임라인/리스트 뷰. 진료 갈 때 내 이력 한눈에 | 생리주기 앱 캘린더 레퍼런스 |
| D9 | **내보내기 / 수정.** 텍스트 내보내기, 언제든 이어쓰기·수정 | v0.5 §11 |

---

## 2. 데이터 구조 설계

### 2.1. 큰 그림

```
[비공개 일기층 — 본인만]                  [공개 집계층 — 모두]
visit (방문, 신규 테이블)
 ├ author_id (소유 명함)
 ├ visit_date (시술 날짜, 과거 가능)
 ├ 병원 스냅샷(이름·주소·전화·홈·카톡)
 ├ doctor_name / counselor_name (자유텍스트)
 ├ total_price (총결제액, 일기 표시용)
 ├ diary_memo (나만 보는 메모)
 ├ completion (완성/미완성 상태)
 │
 ├ entry 1 (procedure_reviews 확장)
 │   · 평가(만족도·통증·다운타임·재시술·효과·효과시점)
 │   · solo_price (단독가, 비공개 정확값)
 │   · is_public  ── true ──▶ cards(공개 카드) + 집계 반영
 │                  false ─▶ (집계엔 평가만, 카드 없음)
 ├ entry 2  …
 └ entry 3 (기록만, 평가 비움 → 집계 미반영)
```

### 2.2. 테이블 — `visit` (신규)

콘텐츠성 레코드이므로 `bigserial` PK. 사람 ID 명명규칙(ADR 0014): 소유 명함은 콘텐츠 책임주체이므로 `author_id`.

| 컬럼 | 타입 | 가시성 | 비고 |
|---|---|---|---|
| `id` | bigserial PK | — | |
| `author_id` | uuid → profiles(id) | 비공개 | 소유 명함 |
| `record_type` | text default `'procedure'` | — | 롱제비티 포석(v0.5 §16). 시술 외 타입 확장 대비 |
| `visit_date` | date | 비공개 | 시술 날짜(기본 오늘, 과거 가능). 알림·타임라인 앵커 |
| `hospital_name` | text | 비공개 | 스냅샷 박제(라이브 FK 금지) |
| `hospital_address` | text | 비공개 | |
| `hospital_tel` | text | 비공개 | 직통 덮어쓰기 가능 |
| `hospital_home` | text | 비공개 | |
| `hospital_kakao` | text | 비공개 | 유저 직접 입력 |
| `doctor_name` | text | 비공개 | 자유텍스트(cards.doctor_id와 무관) |
| `counselor_name` | text | 비공개 | 상담실장 |
| `total_price` | int | 비공개 | 총결제액. 집계 제외(일기 표시용) |
| `diary_memo` | text | 비공개 | 나만 보는 일기 |
| `is_complete` | boolean default false | — | 미완성 회수 알림 대상 판정 |
| `reminder_stage` | smallint default 0 | — | 0=없음/1=4일/2=1주/3=1달 발송 추적 |
| `reminder_muted` | boolean default false | — | "그만 알림" |
| `created_at` / `updated_at` | timestamptz | — | |

### 2.3. 테이블 — `entry` = `procedure_reviews` 확장 (재활용)

새 테이블을 만들지 않고 기존 `procedure_reviews`를 entry 실체로 확장한다(누더기 최소화). 추가 컬럼:

| 추가 컬럼 | 타입 | 가시성 | 비고 |
|---|---|---|---|
| `visit_id` | bigint → visit(id) **nullable** | — | 기존 후기는 NULL(visit 없는 옛 기록) 정상 수용 |
| `solo_price` | int **nullable** | 비공개(정확)/집계(버킷) | 단독가. 알면 입력 → 단독가 집계 |
| `is_public` | boolean default false | — | 공개 옵트인. true일 때만 cards 투영 |

변경:
- `card_id`: 현재 NOT NULL UNIQUE → **nullable UNIQUE**. 비공개 entry는 card 없음. (기존 행은 전부 card_id 보유 → 호환)
- 기존 필수 정량값(`satisfaction`/`pain`/`revisit`): **NOT NULL → nullable**. D4(모든 항목 선택) 반영. (기존 행은 값 보유 → 호환)
- `effect_areas`/`downtime`/`effect_onset`: 이미 nullable, 유지.

### 2.4. 공개 카드 투영 (cards)

- entry `is_public=true` → 대응 `cards`(type=`review`, category=`review`) 1건 생성. 공개 설명 = `cards.body`.
- 기존 `/reports/[procedure]` 집계는 **entry(procedure_reviews)에서 직접 롤업**하되, "공개 옵트인 + 값 존재 + 미삭제"만 통과. 병원·연락처·메모·총액·단독가 정확값·시술의사·상담실장·visit_date는 집계 함수 입력에 **부재**(화이트리스트, v0.5 §13).

### 2.5. 공개/비공개 화이트리스트 (load-bearing)

| 통과(공개·집계) | 차단(비공개 전용) |
|---|---|
| 만족도·통증·다운타임·재시술·달라진점·효과시점 | 병원(이름·주소·전화·홈·카톡) |
| 단독가 **버킷** | 단독가 **정확값** · 총결제액 |
| 공개 설명(옵트인+검수 후) | visit_date 원본 · diary_memo |
| 시술 태그(canonical) | doctor_name · counselor_name |

### 2.6. 기존 데이터 마이그레이션

- 기존 후기 N건: `procedure_reviews.visit_id = NULL`, `is_public = true`(이미 공개 카드 보유), `card_id` 유지.
- 즉 옛 후기는 "visit 없는 공개 후기"로 그대로 살아남고, 신규 기록만 visit을 갖는다. 데이터 손실 0.

---

## 3. 화면 설계

### 3.1. 통합 글쓰기 진입

- 현재 우하단 플로팅 버튼(`FloatingWriteButton.tsx`)이 이미 시술후기/글쓰기/보관함 3갈래. 이걸 **선택 시트 1개**로 재편:
  - **나의 피부일기 남기기** → 일기 폼(visit 본체)
  - **시술 후기만 남기기** → 일기 폼(병원·방문 접고 후기만, 데이터는 visit 체계)
  - **끄적끄적** → 기존 `/write`(doodle)
- (의사 Q&A 발행은 별개 경로 유지.)

### 3.2. 일기 입력 폼 (v0.5 §2 흐름 계승)

위 → 아래: ① 병원(검색·pick) → ② 방문정보(날짜·총액·의사·실장) → ③ 받은 시술(태그 자동완성·EN→KO) → ④ 시술별 후기 아코디언(동적) → ⑤ 오늘의 일기 메모.

- "시술 후기만" 진입 시 ①②를 접은 상태로 시작(비워도 됨).
- 저장 시 "다 썼어요 / 나중에 마저 쓸게요" 선택 → `is_complete` 결정.
- 가시성 배지: 비공개 칸엔 "나만 봐요", 공개 설명 칸엔 "평가만 익명 공개" 표기.

### 3.3. 캘린더 뷰 / 타임라인 뷰 (D8)

- 캘린더: 시술받은 날 표시 → 날짜 탭 → 그날 visit 상세.
- 타임라인: `YYYY.MM.DD · 시술명` 한 줄씩 → 탭하면 펼쳐 상세.
- 미완성 기록은 시각적 표식("작성 중"/"지켜보는 중").

### 3.4. 상세 · 수정 · 내보내기

- visit 상세: 병원·연락처·총액·단독가·메모 + entry별 평가. 「전화하기」·「채널 들어가기」(내 기록 병원 한정).
- 수정: 기존 후기 전용 에디터 확장(visit 편집 포함).
- 내보내기: 본인 전체 기록 텍스트 다운로드.

---

## 4. 알림 설계

### 4.1. 미완성 회수 알림 (D5·D6)

- 대상: `is_complete=false AND reminder_muted=false` 인 visit.
- 일정: visit_date 기준 **+4일 → +7일 → +30일**, `reminder_stage`로 추적, 3회 상한.
- 단계별 문구(요지): 4일=다운타임/초기반응, 1주=초기효과, 1달=최종만족도·효과.
- 채운 항목 재질문 안 함. "완료"/"그만 알림" → 남은 알림 취소.

### 4.2. 시술 주기 리마인드 (별개 트랙)

- "써마지 받으신 지 1년 됐어요" — 시술 태그별 권장 주기 + visit_date 앵커. 권유 아님(v0.5 §15).
- 주기 데이터는 `tag_dictionary`에 주기 컬럼 추가 검토(추후).

### 4.3. 예약 알림 인프라 (선행 부품)

- 현재는 즉시 이벤트 트리거 + 일일 키워드 다이제스트 cron만 있음. **미래 시점 발사 스케줄러 부재.**
- 신규: `scheduled_notifications`(또는 visit 컬럼 기반) + pg_cron 일배치가 "오늘 발사할 알림"을 스캔 → 기존 푸시 파이프라인(webhook→Web Push) 재사용.
- `notification_preferences`에 일기 리마인드 채널 토글 추가.

---

## 5. 영향 범위 / 회귀 점검

| 영역 | 영향 | 점검 |
|---|---|---|
| `/review/new` 폼 | 시술 택1 잠금 → 다중 동적 아코디언으로 전면 재설계 | 폼·검수·마스킹 전 경로 |
| `/api/reviews` · RPC | visit 동반 저장으로 확장(`create_procedure_review` 등) | 원자적 커밋, 권한 |
| `procedure_reviews` 제약 | NOT NULL 완화 + card_id nullable + 신규 컬럼 | 기존 행 호환, RLS |
| `/reports/[procedure]` 집계 | 입력 소스 재정의(opt-in+값 존재) | 통계 수치 변동 확인 |
| 검색·피드·SEO | 후기 카드 생성 조건이 "공개 옵트인"으로 변경 | 카드 노출 범위 |
| RLS | visit 전체 + entry 비공개 필드 owner-only | anon 화이트리스트 |
| 명명규칙 | `author_id`/`profile_id`만, `user_id` 금지 | pre-commit hook |
| 의료법·개인정보 | 비공개 일기에 제3자 실명·건강 민감정보 | 변호사 검토 체크리스트(v0.5) |

---

## 6. 단계별 빌드 + 서브에이전트 위임 계획

각 단계는 디렉터(본인)가 맥락을 쥐고 **딱 필요한 일만** 위임 → 검수(code-reviewer) → 보고 → 수정 루프.

| 단계 | 작업 | 주 위임 대상 | 산출물 |
|---|---|---|---|
| **0** | 본 계획서 + 목업 검토·승인 | (디렉터) | 승인 |
| **1** | visit/entry 스키마 + 마이그레이션 + RLS + 기존 후기 마이그 | supabase-specialist | DB 척추 |
| **2** | 통합 글쓰기 진입 + 일기 폼(병원검색·동적 아코디언·완성/미완성) + API/RPC | general-purpose + code-reviewer | 입력 흐름 |
| **3** | 집계 소스 재정의 + 공개/비공개 화이트리스트 검증 | supabase-specialist + schema-auditor | 공개층 정합 |
| **4** | 캘린더 + 타임라인 뷰 + 상세/수정/내보내기 | frontend(general) + code-reviewer | 일기장 뷰 |
| **5** | 예약 알림 인프라 + 미완성 회수(4/7/30) + 채널 토글 | supabase-specialist | 리텐션 엔진 |
| **6** | 병원 데이터(심평원 API) + 관리자 동기화 + 시술주기 리마인드 | general-purpose | 마지막 |

각 단계 완료 시 갱신할 문서(CLAUDE.md §5 동기화): `DATABASE.md`·`CHANGELOG.md`(마이그레이션), `ARCHITECTURE.md`·`PRD.md`(라우트·기능), 필요 시 `decisions/`(ADR), `post-category.ts`(카테고리 영향 시).

---

## 7. 미결 사항 (추후 결정)

1. "다 썼어요/나중에" 선택을 명시 버튼으로 둘지 vs 빈칸 자동 판정으로 둘지 — 목업에서 명시 버튼안 제시.
2. 시술별 권장 주기(1년 리마인드) 데이터 출처/정확도.
3. 공개 집계 신뢰: D4 후 최소 표본 임계 재확인(현 후기≥4건 기준 유지 여부).
4. 변호사 검토(v0.5 체크리스트) 타이밍 — 공개 집계 변경 전.
5. 캘린더 라이브러리 vs 자체 구현.
```
