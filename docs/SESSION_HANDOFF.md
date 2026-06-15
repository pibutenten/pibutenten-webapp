# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-15

---

## 0. 직전 세션 (2026-06-15 · P1 버그 수정 + 라우트 조사) — 한눈에

- **git**: `HEAD == origin/main == 1865ff2`. 마이그 **0285** 까지 적용(이번 세션 신규 마이그 0 — 코드만, DB 무변경).
- **빌드**: `tsc --noEmit` 0 + `npm run build` Compiled successfully.

### 이번 세션에 한 일 (커밋 `1865ff2`)
> P1 기능 버그 3건 + P2⑧ robots.ts 정리. 서브에이전트 병렬 투입 방식(버그수정 에이전트 + 라우트조사 에이전트). 운영 로직·DB·권한 무변경(버그 수정·경로 교정만).

1. **P1④ 인기태그 선택 시 카테고리 칩 리셋 해소**: `BetaSkinFeed.tsx` — 칩 UI active 표시·aria-pressed를 `effectiveChip`(검색 중 "all" 강제) 대신 `chip`(실제 선택값)으로 변경. `topReport` 노출 조건도 동일하게 정합.
2. **P1⑤ `/search` 404 오링크 교정**: `CategoryWithChips.tsx`·`ProfileTabs.tsx`·`PopularCards.tsx`·`TopicTagView.tsx` 4개 파일에서 `/search` → `/`, `/search?q=` → `/?q=` 교정.
3. **P1⑥ `/beta-skin?q=` 오링크 교정**: `BetaProfileView.tsx:499` — `href={`/beta-skin?q=...`}` → `/?q=...`.
4. **P2⑧ robots.ts 정리**: `DISALLOW_COMMON` 에서 `/beta-skin` 제거(승격 완료). `/old-skin` 은 이미 존재했음.

**라우트 조사 (read-only, 커밋 없음)**
- 콘텐츠 라우트 4개(`record/[id]`·`write/[shortcode]`·`report`·`shop`) 현황 + BetaSkinShell 패턴 전수 조사 완료. 상세 결과 → 아래 §다음 세션 참조.

### 다음 세션 — 남은 작업 (우선순위순)

**🔴 콘텐츠 라우트 베타 셸 승격 (조사 완료, 즉시 착수 가능)**

| 라우트 | 현재 크롬 | 난이도 | 조치 |
|---|---|---|---|
| `/report` | InfoPageLayout | 쉬움 | BetaSkinShell + `back={true}` |
| `/shop` | 없음(플레이스홀더) | 쉬움 | BetaSkinShell로 감싸기 |
| `/record/[id]` | 없음(서버 컴포넌트) | 보통 | BetaSkinShell + `back="/record"`, RLS 유지 |
| `/write/[shortcode]` | — | — | **건너뜀** (운영 경로 완전 통합, 베타 셸 적용 시 UX 악화) |

- 이미 적용된 패턴 예시: `src/app/(beta-skin)/topics/[tag]/page.tsx`, `src/app/(beta-skin)/reports/[procedure]/page.tsx`
- BetaSkinShell 위치: `src/app/beta-skin/BetaSkinShell.tsx` (또는 `(beta-skin)` 하위 — 착수 전 Glob 확인)

**🟡 P1⑦ 내 노트 날씨 카드 지연**
- `/record` force-dynamic + 무거운 SSR 로 날씨 카드까지 지연됨. Suspense 스트리밍 검토.

**🟡 P2⑨ BETA_CUTOVER_PLAN.md Phase 표 동기화**
- 홈·핵심화면·admin 승격 완료됐으나 Phase 1b~8 체크박스가 현행과 불일치.

**⚪ 이월(저우선·로드맵)**
- admin 나머지 화면 이식: 미이식분은 운영 `/admin/*` 링크(동작 O): `users`·`doctors`·`draft`·`reports`·`review-reports`·`tags`·`clinics`·`auth-errors`·`stats/[kind]`·`cards/[id]/edit`.
- 알림 `/notifications` 베타 화면(2탭 미구현).
- 성능 — 페이지 전환마다 BetaSkinShell 재마운트, 공용 layout 으로 셸 고정 검토.
- 계정명함 전환 카드(BetaProfileView 카드형 UI — 로드맵).

**⚠️ 시각 검수 미완료**
- `1865ff2` 커밋(P1④⑤⑥) 수정 사항을 dev 서버에서 시각 확인하지 못하고 세션 종료. 다음 세션 초반에 확인 권장.

---

## 1. 현재 상태 (스냅샷)

- **git**: `HEAD == origin/main == 1865ff2`. P1 버그 3건 + robots.ts 정리.
- **DB 마이그**: **0285** 까지 production 적용 완료. (0269 `reviewed_at` · 0270 clinics[타 세션] · 0271 merge_tag en 승계 · 0280 top_cards 통계 RPC 게이트 완화 · 0282·0283 원장 9명 profile_data 정정 · 0284 award_points REVOKE · 0285 award_daily_login REVOKE[보안 감사])
- **빌드**: `tsc --noEmit` 0 + `npm run build` Compiled successfully.

### 태그 사전 DB SSOT 통합 (L-Phase2) — ✅ 완료
`procedure-mappings.json`·`procedure_taxonomy` 청산 → **DB `tag_dictionary` 단일 SSOT + 빌드 스냅샷**. 일반인·원장·관리자 글 저장이 단일 흡수 트리거로 정규화. (상세 ARCHITECTURE §10, TECH_SPEC §6.9, RUNBOOK §7.)

| 마이그 | 내용 |
|---|---|
| 0252 | service_role 테이블 GRANT (태그 저장 버그 해결) |
| 0253~0255 | rename_tag RPC · 온보딩 얼굴형 5종 · 등록 트리거 enum 수정 |
| 0256 | 온보딩 skin_type 7종 |
| 0257~0259 | procedure_taxonomy 청산(FK 재지정 + RPC 재작성 + DROP) |
| 0260~0261 | merge_tag RPC · 병합후보 무시목록 |
| 0262 | profiles 영문코드 → 한글 통일(관심 digest 매칭 부활) |
| 0263 | 자동등록 영문 태그 흡수 트리거 + slugify_en + tag_absorb_log |
| 0264 | JSON 사전 → DB 이관(aliases·pubmed_keywords 컬럼 + tag_blacklist·tag_normalization) |
| 0265 | 동의어 14건 병합 + 흡수 트리거 통일(헤르페스·단순포진 분리 유지) |
| 0266 | JSON orphan 2건(K-뷰티·1회적정량) DB 보강 |
| 0267 | auto-tag 추천 큐레이션 `is_recommendable`(804 시드) |
| 0268 | get_tag_admin_overview + is_recommendable 컬럼 |

- **JSON 완전 제거**: `procedure-mappings.json` 삭제. auto-tag·slug-mapping·schema/procedure·gen 전부 스냅샷 기반. (slug-mapping.ts 모듈은 유지, 데이터만 DB.)
- **태그 관리 UI**: '태그 매니저'→'태그 관리', 1000행 상한 해소(range 청크), 병합후보 섹션 제거. 'O' 작업으로 '자동추천' 열·부제 제거(데이터·큐레이션은 유지). 'P' 작업으로 요약 KPI 를 '전체 카드 목록' 탭형(하늘색·5항목: 전체·분류완료·영문 공란·시술 후기·부모 태그)으로 통일 + 대시보드 활동 통계 박스 높이 균일.

### 태그 검수 모델 — ✅ 최종형 (발주 K~N, 마이그 0269·0271)
`/admin/tags` 태그 관리 화면의 **확정된 검수 모델**. (중간에 폐기된 경로는 맨 아래 명시.)

- **저장 = 검수완료**: 어느 탭/상태든 행 '저장' → 편집 확정 + `reviewed_at=now()`. 편집 없이 눌러도 검수완료(옛 '잔류' 대체).
- **저장↔취소 토글**: 저장 직후 버튼이 '취소'로. 취소는 그 화면 머무는 동안만(클라 스냅샷, 새로고침·이탈 시 확정). 취소 시 편집 항목 전부 + `reviewed_at`을 저장 직전 값으로 통째 복원(rename 도 역방향). **'취소' 상태에서 재편집(dirty) 발생 시 버튼이 다시 '저장'으로 전환**(발주 M). 행마다 독립.
- **추천(`is_recommendable`)**: 전 상태 상시 표시 전역 컬럼(체크박스, draft 편집·저장 확정).
- **검색량·생성일**: 전 상태 상시 표시 전역 컬럼(헤더 정렬 가능).
- **이름 변경/병합 = 저장 경유**: 모달 [확인]은 행 draft 로 보류만(즉시 적용 없음), 행 '저장' 에서 확정. 입력 이름이 기존 태그면 병합(흡수).
- **병합(흡수) 데이터 처리**: 사용량 합산(카드 keyword 이관·중복제거) · 생성일·영문은 **기존 target 기준** · source 삭제(되돌릴 수 없음). 단 target 영문 공란 + source 영문 있으면 source 영문 승계(마이그 0271, 기존 영문은 절대 덮어쓰지 않음).
- **컬럼 11개 전 상태 동일**: 태그·분류·영문·부모·시술후기·온보딩·사용량·검색량·생성일·추천·관리. **검토 탭**(status=triage) = 미검토(분류=미지정 & `reviewed_at IS NULL`) 필터 + '검토완료 포함 보기'(`rv=all`) 토글 + 미검토 개수 KPI. 미지정(unspec) 화면은 일반 조회.

> **폐기된 중간 경로(최종 아님)**: 발주 G(검토 탭 검색량·생성일 → 추천·잔류 컬럼 치환) · 발주 I(즉시저장 전환·관리 칸 제거) · '검토완료(잔류)'/'되돌리기' 잔류 버튼 — 모두 **발주 K**(저장=검수완료 + 저장↔취소 토글)로 대체됨.

### 4-2 알림 — ✅ 완료 (마이그 0239~0245, kind 8종). 관심 digest cron 21:00 UTC=06:00 KST.
- **알림 설정 UI 일원화(발주 B·C)**: 별도 `/settings/notifications` 페이지·`NotificationPreferences` 컴포넌트 제거 → 정보수정(`/settings/profile`)으로 통합. 관심 알림 3개=섹션 '공개' 옆 '알림' 체크박스, 활동 알림=관심시술 밑 '🔔 활동 알림' 접이식 카드. 저장 키·API 불변. 프로필 페이지 전체 즉시저장(저장하기 버튼 제거).

---

## 2. 잔여 / 보류 항목

- **✅ Vercel `CRON_SECRET` 확인 완료(2026-06-07)**: production env 에 존재(encrypted). 관심 digest cron(`/api/cron/keyword-digest`, `0 21 * * *`=06:00 KST) Bearer 인증 정상.
- **미지정 거버넌스 — 도구 ✅ 완성 / 운영 작업 ⏳**: 트리아지 도구(검토 탭·`reviewed_at`·검수 모델 최종형)는 완성. 실제 **미지정 약 1,274개 솎기**는 운영 작업으로 점진 진행(대량 일괄 분류 기준은 별도 안건).
- **신규 추천 편입 방식**: `is_recommendable` 신규 태그 기본 false. 추천 편입은 현재 SQL UPDATE(관리 토글 제거). 운영 거버넌스(편입 기준·주기·UI) 미정.
- **4-3 OG 정비 — ⏸ HOLD**: 디렉터 OG 예시(레이아웃·문구) 대기. 확정 전 착수 금지.
- **FINAL 점검**: 배포 후 회원 글쓰기 자동태깅·토픽 URL·관심 digest 실데이터 동작 육안 확인(특히 로그인 필요한 admin 화면). 태그 검수 저장↔취소 토글 실동작도 로그인 세션에서 확인.

---

## 3. 불변 원칙 (재명시)

- **콘텐츠 본문 보존**: 태그·메타 정정이 본문(`body`)을 바꾸지 않는다. soft-delete(`deleted_at`)만, hard-delete·스크럽 금지.
- **사람 ID 컬럼 명명(ADR 0014)**: `author_id`(콘텐츠)/`profile_id`(그 외)/`auth_user_id`(묶음). `user_id` 신규 사용 금지(pre-commit hook 차단).
- **권한은 active 명함 단위(ADR 0011/0012)** — 묶음 합산 금지.
- **파괴적 DB 변경 자동 실행 금지**: DROP TABLE/TRUNCATE/대량 DELETE·secret 로테이션은 사용자 확인 후.
- **읽기전용 진단은 진단으로만** — SELECT/grep/함수정의 조회만, 트랜잭션·쓰기 0.
- **문서 동기화(CLAUDE.md §5)**: 마이그 추가 시 DATABASE↔CHANGELOG, 라우트 변경 시 PRD↔ARCHITECTURE 동시 갱신.

---

**이 문서 변경 시**: 세션 종료마다 "최종 갱신" 일자 + §1 스냅샷(커밋 해시·마이그 번호) 갱신.
