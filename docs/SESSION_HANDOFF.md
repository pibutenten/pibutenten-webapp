# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-16

---

## 0. 직전 세션 (2026-06-16 · 베타 커토버 전수검수 → 6커밋 개선 → 4에이전트 재검수) — 한눈에

- **git**: HEAD = `921ea22`. 이번 세션 6커밋: `19d60c2`(보안·SEO) → `5a50cda`(/beta-skin 은퇴) → `42c4d10`(SSOT·데드코드) → `aacf89c`(성능) → `42cfb11`(견고성·SEO) → `921ea22`(재검수 반영). 모두 push 완료. 신규 마이그 0(코드·구조·표시만, DB·권한·RLS 무변경).
- **빌드**: 전 커밋 `tsc --noEmit` 0 + `npm run build` 0 + 코드검수관 [치명] 0.
- **핵심 성과**: `/beta-skin` 라우트 **완전 소멸**(컴포넌트 → `src/components/skin/`, 표준 구조 정렬) — 1차 검수 최상위 구조 치명 해소.
- **방법론**: 독립 시니어 검수관 4종(SEO/AEO/GEO·코드정합성/SSOT·UI/링크·보안/성능) 병렬 전수검수 → 종합 → 단계 실행(각 단계 빌드·검수·커밋·푸시) → 동일 4에이전트 독립 재검수. 상세 CHANGELOG `[2026-06-16]`.

### 다음 세션 — 남은 백로그 (최종 재검수가 확인, 대부분 기존 이슈)

**🟡 soft-404 (HTTP 200)**: `[handle]` 비존재 핸들·의사 글상세(`doctors/[slug]/[year]/[postSlug]:360`) 가 `notFound()` 호출에도(또는 호출 없이) HTTP 200 + "찾을 수 없음" 화면. `[handle]` 은 notFound 호출하나 스트리밍으로 상태 200. 의사 글상세는 notFound 미호출(200 본문). 색인 영향 점검 후 정식 404 전환 필요(라우트 렌더 방식 검토 — 별도 안건).

**🟡 PostgREST `.or()` 사용자입력 미이스케이프**: `reports/[procedure]/page.tsx:53`·`api/reports/[procedure]/reviews/route.ts:45`(ko 파라미터)·`admin/users/page.tsx:111`(`,` 미이스케이프). tag_dictionary 공개+AND `is_procedure` 가드라 실익 낮으나, `bundleProfileFilter` 식 화이트리스트 게이트(`/^[가-힣a-z0-9 ·-]+$/` 불충족 시 404)로 정비 권장.

**🟡 미정의 CSS 토큰**: `admin/reports/ReportsClient.tsx`(`--surface`·`--surface-2`·`--border-soft` 미정의 → 투명/기본 폴백). placeholder 와 동일하게 `bg-white`/`gray-50` 등으로 교정(운영자 전용 화면이라 영향 제한).

**⚪ 데드/전환중간층 정리 (별도 안건)**: `old-skin/`(박제 백업)·`components/beta/`(BetaFeed=old-skin 전용 데드, BetaDiscovery=skin 이 역참조)·`MyPageClient`/`ProfileTabs`/`Feed`(고아 가능성) 실사용 재판정 후 정리/이동. `CardData` import 이중경로(`@/components/Card` 26곳 vs `@/lib/types/card` 12곳) 단계적 통일.

**⚪ BetaSkinShell 라우트그룹 layout 승격 (성능·구조, 대형 안건)**: 현재 셸이 페이지별 View 안에서 렌더 → 전환마다 재마운트 + `/api/notifications` fetch·`prefetchDiscover` 반복. `app/(app)/layout.tsx` 로 승격하려면 페이지별 props(active/back/sidebar/search) 전달 메커니즘 설계 필요(Phase B 급 리팩토링 — ADR 권장).

**⚪ 주석 잔재**: `GlobalChrome:72` RESERVED `"beta-skin"`(방어용·무해), admin 뷰 6종 JSDoc 의 구 `@/app/beta-skin/*` 경로 언급, PostDetail/BetaDiscovery 의 `/beta-skin` 주석 — 동작 무관, 위생 차원.

---

## 0-prev. 이전 세션 (2026-06-15 · 콘텐츠 라우트 4종 베타 셸 승격) — 한눈에

- **git**: 직전 커밋 `2a132aa`(핸드오프 갱신) 다음, 이번 4종 승격이 새 HEAD. 마이그 **0285** 까지 적용(이번 세션 신규 마이그 0 — 코드·표시·라우팅만, DB·권한 무변경).
- **빌드**: `tsc --noEmit` 0. 코드검수관 [치명] 0.

### 이번 세션에 한 일 (콘텐츠 라우트 4종 베타 셸 승격)
> 직전 세션 조사의 후속 실행. 옛 TopNav/SiteFooter 가 첫 페인트에 잠깐 보였다가 베타 오버레이가 덮던 라우트 4종을 베타 셸로 승격 → 첫 로딩부터 베타만 렌더(깜빡임 제거). 서브에이전트 2종(`/record/[id]`·`/write/[shortcode]`) 병렬 + 직접 2종(`/report`·`/shop`), 중앙 `GlobalChrome.tsx` 분기는 단일 소유로 일괄 편집. 운영 로직·DB·권한 무변경.

1. **`/record/[id]` 시술 기록 상세**: 서버 `page.tsx` 가 데이터·권한(RLS) 처리 후 신규 `DiaryDetailView`(`beta-skin/record/`)에 위임. `BetaSkinShell active="내 노트"` + detailHead(뒤로 `/record`). noindex 유지.
2. **`/write/[shortcode]` 글 수정**: admin·user 양 분기를 신규 `WriteEditShell`(`beta-skin/write/`, 얇은 `BetaSkinShell active="글쓰기" back={false}`)로 감쌈. 본문은 기존 `BackButton` 자체 렌더 유지(중복 방지). layout noindex 유지.
3. **`/report` 콘텐츠 신고**: 기존 `<InfoPageLayout>` 본문을 `<InfoBetaShell back={false}>` 로 감쌈(선례 `contact/page.tsx`). 메타·robots noindex·ReportForm 무변경.
4. **`/shop` 쇼핑(준비중)**: 신규 `ShopView`(`beta-skin/shop/`) — `BetaSkinShell active="쇼핑"` 안 "쇼핑 준비중" 카드. 검색 제출은 운영 홈(`/?q=`)으로 라우팅.
5. **`GlobalChrome.tsx` 승격 목록 확장**: `BETA_PROMOTED_EXACT` 에 `/shop`·`/report`, `BETA_PROMOTED_PREFIX` 에 `/record/`·`/write/` 추가. `RESERVED_FIRST_SEGMENT` 가 이미 record/write/shop/report 포함 → 핸들/숏코드 오매칭 없음. 21행 주석을 실제 동작에 맞게 갱신.

**시각 검수**: dev(localhost:3000)에서 `/shop`·`/report` 직접 확인(옛 크롬 없음, 탭 active, ReportForm 온전). 인증 게이트 라우트(`/record/[id]`·`/write/[shortcode]`)는 비로그인 시 `/login?next=...` 로 깔끔히 리다이렉트(로그인 페이지도 베타, 깜빡임 없음) → 코드 리뷰 + tsc + 리다이렉트 동작으로 대리 검증.

### 다음 세션 — 남은 작업 (우선순위순)

**🟡 P1⑦ 내 노트 날씨 카드 지연**
- `/record` force-dynamic + 무거운 SSR 로 날씨 카드까지 지연됨. Suspense 스트리밍 검토.

**🟡 P2⑨ BETA_CUTOVER_PLAN.md Phase 표 동기화**
- 홈·핵심화면·admin·콘텐츠 4종 승격 완료됐으나 Phase 1b~8 체크박스가 현행과 불일치.

**⚪ 이월(저우선·로드맵)**
- admin 나머지 화면 이식: 미이식분은 운영 `/admin/*` 링크(동작 O): `users`·`doctors`·`draft`·`reports`·`review-reports`·`tags`·`clinics`·`auth-errors`·`stats/[kind]`·`cards/[id]/edit`.
- 알림 `/notifications` 베타 화면(2탭 미구현).
- 성능 — 페이지 전환마다 BetaSkinShell 재마운트, 공용 layout 으로 셸 고정 검토.
- 계정명함 전환 카드(BetaProfileView 카드형 UI — 로드맵).
- **비차단 권고**: `ShopView` 의 `useBetaSearchRouting` 일관성 논점(런타임 무영향) · `WriteEditShell` 본문 BackButton ↔ 셸 `back={false}` 관계 회귀 방지 문서화.

**⚠️ 직전 P1 커밋(`1865ff2`) 시각 검수**
- P1④⑤⑥ 수정은 이번 세션에 dev 시각 확인 미완(이번은 4종 승격에 집중). 차후 확인 권장.

---

## 1. 현재 상태 (스냅샷)

- **git**: 직전 `2a132aa` 다음, 콘텐츠 라우트 4종 베타 셸 승격이 최신 HEAD.
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
