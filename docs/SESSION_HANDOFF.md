# 세션 핸드오프 (SESSION_HANDOFF)

> 세션 간 인수인계용. 현재 상태·주의사항·다음 작업·불변 원칙을 한 장으로. 변경 이력 상세는 `CHANGELOG.md`.

**최종 갱신**: 2026-06-14

---

## 0. 직전 세션 (2026-06-14) — 한눈에

- **git**: `HEAD == origin/main == fc7c17e`. 마이그 **0283** 까지 적용. (미커밋: 타 세션 산출물 `.claude/worktrees/`·`docs/reports/...보안감사.md`·`scripts/export-tag-dictionary-xlsx.py`·`tag-dictionary.generated.json` — 이 세션 작업 아님, 손대지 않음.)
- **빌드**: `tsc --noEmit` 0 + `npm run build` Compiled successfully.

### 이번 세션에 한 일 (전부 `/beta-skin` 내부, 운영 무수정)
> **목표(사용자)**: 베타스킨이 운영 기능/컴포넌트/데이터를 **그대로 재사용**(누더기 신규코드 금지). 운영 사이트는 100% 무변경. Phase별 커밋·푸시·검수.

1. **Phase A 디테일**: 리포트 카드 R값 베타 통일, 헤더 로그인상태 깜빡임 제거(useSession), 인기 Q&A 회전.
2. **Phase 0 — 원장 9명 DB 정정**(마이그 0282·0283): education " 수료/수련" 제거, career 현소속 중복 제거 + "전 " 접두 제거. 운영+베타 동시.
3. **Phase 1 — 공개 프로필**: `/beta-skin/u/[handle]` 신설(운영 `/[handle]` 데이터 미러: 작성글/후기/댓글/좋아요/저장/피부 6탭 + 20개+더보기). 명함 클릭 동선(`authorHref` 회원→베타 프로필), 헤더 '마이' 역할 분기(`/beta-skin/my`: admin→admin, doctor→/doctor, 회원→공개프로필), 운영 LogoutButton 재사용.
4. **Phase 2 — 설정 아코디언**: 별도 페이지 대신 본인 공개 프로필의 '프로필·설정' 아코디언 인라인 펼침(운영 `ProfileEditClient embedded` 재사용). `/beta-skin/settings` 는 본인 프로필로 redirect.
5. **Phase 3 — admin 이식 (메인·글관리·댓글)**: `/beta-skin/admin`(운영 RPC get_admin_kpi/get_research_panel + ActivityKpis/PopularCards/AccountSwitcherCard 임베드)·`/admin/cards`(운영 데이터·PickToggle·DoctorFilter)·`/admin/comments`(CommentsClient). 운영 `requireAdminPage` 가드 재사용.
6. **글상세 = 피드 카드 재사용**: PostDetail 본문을 `<PostCard forceExpanded>` 로 통일(누더기 .articleBody/.articleTitle 폐기 — 피드 펼침과 100% 동일).
7. **⋮ 메뉴·신고 통합**: SNS 표준대로 ⋮ 모두 노출(본인=수정/삭제/숨김, 타인=신고하기→`/api/reports`), HOT/NEW 배지 인라인 재배치.
8. **admin 운영형 재설계(최종, fc7c17e)**: `.card` 큰 박스 제거 + admin 흰 배경(`.rootWide`) + 운영 `BackButton`(`< 뒤로`) 전 서브페이지 + 운영 프로그램 2열. (상단바만 베타 유지.)

### 현재 베타 라우트 (11 page.tsx)
✅ `/beta-skin`(피드)·`post/[...slug]`(글상세)·`u/[handle]`(공개프로필)·`my`(역할분기)·`settings`(redirect)·`record`(내노트)·`write`(글쓰기)·`admin`(대시보드)·`admin/cards`(글관리)·`admin/comments`(댓글)

### 다음 세션 — 남은 작업
1. **admin 나머지 화면 이식 (운영 15화면 중 3개만 이식)** — 미이식 12개는 현재 베타 대시보드 Tool 이 **운영 `/admin/*` 로 링크**(동작은 됨, 스킨만 운영으로 튕김): `users`(+`users/[id]`)·`doctors`(+`doctors/[slug]/edit`)·`draft`·`reports`·`review-reports`·`tags`·`clinics`·`auth-errors`·`stats/[kind]`·`cards/[id]/edit`(글편집) + **원장 대시보드 `/doctor`**.
2. **설정 아코디언 실측** — 로그인 필요라 Playwright 미검증(8fcab8e). 로그인 세션에서 펼침·저장·탈퇴 동작 확인.
3. **성능 — 셸 재마운트** — `/beta-skin/layout.tsx` 없어 페이지 전환마다 BetaSkinShell 재마운트(무거움). 공용 layout 으로 셸 고정 검토.

### ⚠ cutover 결정 대기 (사용자 확정 필요) — "베타스킨 전체 운영으로 갈아엎기"
현재 베타는 `/beta-skin/*` 별도 경로 + **영구 noindex** 프리뷰. 운영 본체 승격에 필요한 결정:
- **① admin 범위(가장 먼저)**: admin까지 전부 베타로 이식할지 vs **사용자 화면(피드·프로필·글상세·마이·설정)만 베타로 교체하고 admin은 운영 그대로** 둘지. → 후자면 남은 작업 거의 끝, 전자면 화면 12개 추가 이식. **남은 작업량이 여기서 갈림.**
- **② 라우트 승격 방식**: `/beta-skin/*` → 운영 루트(`/`,`/{handle}`,`/my`…)로 올릴지 / 운영을 베타로 교체할지(middleware·리다이렉트 전략).
- **③ noindex 해제 + canonical**: 승격 시점에 robots noindex 해제 + canonical 운영 URL.
- **④ 글 편집/작성**: 베타엔 편집 페이지 없음(운영 `/admin/cards/[id]/edit` 사용 중) — 이식 여부.
- **⑤ 회귀·동등성 전수 검수**: 운영 전 기능이 베타에 누락 없는지(알림 `/notifications` 2탭은 베타에 화면 없음).

---

## 1. 현재 상태 (스냅샷)

- **git**: `HEAD == origin/main`. 태그 관리 UI(O·P·Q)·칩 통일 → 발주 A·B·C·D → 태그 검수 발주 E→F→G·H·I·J(중간 경로)→K(검수 모델 재정비)→L(이름변경·병합 저장 경유)→M(저장↔취소 재편집 버그)→N(병합 en 승계). (동시 진행: `clinics`(0270·`/admin/clinics`)는 **별도 세션 소관** — 이 세션 작업 아님.)
- **DB 마이그**: **0283** 까지 production 적용 완료. (0269 `reviewed_at` · 0270 clinics[타 세션] · 0271 merge_tag en 승계 · 0280 top_cards 통계 RPC 게이트 완화 · 0282·0283 원장 9명 profile_data 정정)
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
