# 직원 피드백 검수 + 수정 종합 보고서 (2026-06-26)

> 총괄디렉터(Claude) 주관. 직원 UI 피드백 14개 세부 항목을 **독립 서브에이전트 4개**로 교차 검수 → 미완료 3건 식별 → 수정 위임 → **독립 최종 검수** → 빌드·커밋·배포까지 완수.
> 관련 커밋: `5c15b95` (Items 3, 13b) / 직전 배치 `a000156` (Items 1·7a·7b·8·9·10·11).

---

## 1. 검수 방식

- 14개 세부 항목을 4개 도메인 그룹으로 분할, 서브에이전트 4개가 **서로의 결과를 공유하지 않고 독립적으로** 코드를 정독(file:line 근거).
- 디렉터는 직접 수정 없이 결과를 교차 검증·종합.
- 판정 후 미완료 항목만 단일 구현 에이전트에 위임, 구현 단계에서 자체 검증으로 **nav-guard 재진입 [치명] 1건 발견·수정**, 디렉터가 인라인 최종 검수(7개 점검항목)로 재확인.

---

## 2. 항목별 판정 (검수 결과)

| # | 항목 | 검수 판정 | 처리 |
|---|---|---|---|
| 1 | 검색 새 페이지 구조 + 뒤로가기 | 완료 | 기존 반영(`a000156`) |
| 1 | 검색 헤더 `[<][입력창][X]` + X 토글 + 결과 헤더 유지 | 완료 | 기존 반영 |
| 2 | 원장 끄적끄적 로딩 오류 | 완료 | 자동 추가로드+타임아웃+빈상태 분기로 해소 확인 |
| 3 | 빈 상태 이탈 시 무경고 이동 | 완료 | isDirty=false 시 가드 비활성 |
| 3 | **작성 후 이탈 동작 (type1/type2)** | 미결정 → **type1 확정** | **이번 수정(C2)** |
| 3 | **임시저장함 접근 경로** | 부분(접근 불가) | **이번 수정(C3)** |
| 3 | 시술후기 탭 새로고침 → 탭 유지 | 완료 | 로컬 chip state + sessionStorage 보존 |
| 4 | 시술명 X 누르면 텍스트만 삭제 | 완료 | X는 입력 텍스트만, 칩은 별도 상태 |
| 5 | 키보드 툴바 제거 | **웹 제어 불가** | iOS 네이티브 바 — 코드 대상 없음(네이티브 래퍼 영역) |
| 6 | 달력 날짜 선택 반영 | 완료 | 인라인 달력 selectCalDate→setDate |
| 7 | "다시 선택" 시 시술만 초기화 | 완료 | 기존 반영 |
| 7 | "달라진 점" 칩 간격 | 완료 | gap-2→gap-3 |
| 8 | 입력창 활성 테두리 한 줄 | 완료 | focus:ring-0 |
| 9 | 검색창 확대 방지 | 완료 | font-size 16px |
| 10 | 스크롤 시 칩 활성화 오류 | 완료 | 색상 칩 active:/hover: 제거 |
| 11 | 후기 작성 후 피드 연결 + 프로필 카드 삭제 | 완료 | 홈 피드 + justPublished |
| 13a | 끄적끄적 태그 칩 디자인 | 완료 | rounded-full pill |
| 13b | **수정 후 재게시 시 피드 연결** | 미완료 | **이번 수정(13b)** |

**완료 18 / 이번 수정 3(13b·C2·C3) / 웹 제어 불가 1(키보드 툴바).**

---

## 3. 이번에 수정한 3건

### [Item 13b] 수정 후 재게시 시 피드 미연결 — 수정 완료
- **문제**: 신규 게시(WriteClient)는 `pbtt:justPublished` 시그널 + 홈 피드(/) 이동으로 "내 글 + 피드 연결"이 되나, 수정(EditClient)은 글 상세(`/{handle}/{shortcode}`)로 이동하고 시그널을 안 심어 Q&A 추천+프로필 카드만 보이고 피드가 안 이어짐.
- **수정**: `EditClient.tsx` PUT 성공부에서 `payload.category !== "qa" && status === "published" && !data?.screening` 이면 신규 게시와 동일하게 `pbtt:justPublished`(cardId) 심고 `/`로 이동. qa·draft·pending·검수 전환·soft-delete 는 기존 returnUrl 유지.
- **중복 검증**: 수정된 카드는 이미 피드 풀에 존재할 수 있음 → FeedView 핸들러가 `poolRef.current.some(c=>c.id===id)` 분기에서 **맨 앞으로 이동만** 하고 fetch 경로도 id 중복을 막아, 두 번 노출되지 않음을 확인.

### [Item 3 / C2] 글쓰기 이탈 동작 type1 모달 — 수정 완료
- **사용자 확정**: type1 = "작성 중인 글쓰기를 종료하시겠습니까?" 모달 + [임시저장 후 종료] / [글쓰기 종료]. 하단 내비 이동 포함 일관 적용.
- **수정**:
  - 신규 모듈 `src/lib/nav-guard.ts` — 모듈 레벨 이탈 가드 스토어. popstate/beforeunload 만으로 못 잡던 next/link 전방향 이동을 BottomNav `<Link>` onClick 의 `maybeBlockNavigation` 으로 가로챔.
  - `useUnsavedChangesGuard` 확장 — nav-guard 등록 + `confirmSaveAndLeave`/`confirmDiscardAndLeave`/`cancelLeave`. 이탈 실행은 `pendingProceedRef` 로 통일(popstate=history.go(-2), Link=router.push).
  - `UnsavedChangesModal` variant 분기 — create=[임시저장 후 종료]/[글쓰기 종료], edit=[계속 작성]/[나가기](수정 모드는 임시저장 슬롯 없음).
  - `CardEditor`·`ReviewForm` 공통 적용. [임시저장 후 종료]=떠나기 직전 1회 강제 저장, [글쓰기 종료]=임시저장 슬롯 삭제.
  - 빈 상태(isDirty=false)는 가드 미등록 → 무경고 자유 이동(회귀 없음).
- **발견·수정된 [치명]**: goHome 이 자신을 maybeBlockNavigation 으로 감싸는 구조에서 모달 확정 후 proceed(goHome) 동기 실행 시 모달이 재오픈되는 재진입 버그 → `finishLeave` 가 `shouldGuardRef.current=false` 를 동기로 내려 차단(독립 검수 재확인 완료).

### [Item 3 / C3] 임시저장함 진입 경로 추가 — 수정 완료
- **문제**: `/write/drafts` 페이지는 완성돼 있으나 진입 링크가 없어 직접 URL 외 도달 불가.
- **수정**: 글쓰기(`/write`) 헤더 우측에 "임시저장함" 버튼 신설. 작성 중이면 이탈 모달로 가로채고, 비었으면 바로 이동.

---

## 4. 최종 검수 결과 (디렉터 인라인, 7개 점검항목)

| 점검 | 결과 |
|---|---|
| (A) nav-guard 재진입 | PASS — finishLeave 의 shouldGuardRef=false 로 차단 |
| (B) 빈 상태 회귀 | PASS — shouldGuard=false 시 effect early-return, 가드 미등록 |
| (C) popstate/beforeunload | PASS — pendingProceedRef=history.go(-2) 정상 |
| (D) cancelLeave(계속 작성) | PASS — submittedRef·shouldGuardRef 미변경, 가드 armed 유지 |
| (E) 13b 조건 + 중복 prepend | PASS — 조건 정확, FeedView 중복 방지 확인 |
| (F) markSubmitted + CSS 변수 | PASS — CardEditor:621·ReviewForm:399 호출, --bg-soft/--text-muted/--border 실재 |
| (G) confirmLeave 잔존 참조 | PASS — 전역 0건 |

- **타입체크**: `npx tsc --noEmit` 통과(exit 0).
- **빌드**: `npm run build` 통과(exit 0).

---

## 5. 배포 정보

- 커밋: `5c15b95` — fix(write): 글쓰기 이탈 type1 모달 + 수정 후 재게시 피드 연결 + 임시저장함 진입 (Items 3, 13b)
- 변경: 9 files, +315 / -65. 신규 `src/lib/nav-guard.ts`.
- Push: `7c5d858..5c15b95 main` → Vercel 자동 재배포 트리거.
- CHANGELOG: `docs/CHANGELOG.md` 2026-06-26 블록에 Item 13b·Item 3·임시저장함·nav-guard 기록.

---

## 6. 잔여 / 후속 사항

1. **[Item 5] 키보드 툴바 — 웹 제어 불가**: 앱이 만든 커스텀 툴바는 코드에 없음. 문제의 바는 iOS Safari 네이티브 form assistant bar(이전/다음/완료)로 HTML/CSS/JS 제거 불가. PWA 네이티브 래퍼(WKWebView) 수준에서만 처리 가능. (기존 메모와 일치)
2. **검색바 마크업 중복(경미)**: `/search` 페이지와 AppShell 결과 헤더에 동일 검색바가 중복 존재 → 한쪽만 수정 시 어긋날 SSOT 리스크. 현재 동작 동일, 치명 아님.
3. **수정 모드 이탈 모달**: edit 모드는 localStorage 임시저장 슬롯 개념이 없어 의도적으로 [계속 작성]/[나가기] 유지(임시저장 버튼 미노출). 슬롯 오염 방지.
4. **작업트리 잔여(커밋 제외)**: `src/data/tag-dictionary.generated.json`(빌드 중 timestamp 재생성, 무관) + Dropbox 충돌 사본 `tag-dictionary.generated (...충돌된 사본...).json`(동기화 artifact) — 이번 커밋에서 제외. 충돌 사본은 사용자 확인 후 삭제 권장.
5. **옆 세션 조율**: 동일 저장소를 공유하는 별도 세션과 겹치지 않도록 본 3개 항목 관련 9개 파일만 선별 스테이징·커밋. push 시 충돌 없었음(fast-forward).
