# 로드맵 (ROADMAP)

향후 작업 계획. **Now / Next / Later** 3단계. 완료 항목은 여기서 제거하고 `CHANGELOG.md` 에 기록 (CLAUDE.md §5).

---

## Now (현재 진행 중)

### 시술 리포트 앵커 카드 — 인앱 공개 완료, 검색엔진 색인만 보류 (C1~C5)
- C1~C5 완료(데이터층·영문 URL·저장공유·피드 결정적 주입·라벨·**인앱 공개 0216**). 피드(유기 20장당 1장 컴팩트 카드)·`/reports/{en}`·저장/공유 라이브. CHANGELOG 2026-06-03 C1~C5 참조.
- [x] **검색엔진/AEO 색인 on** (2026-06-05): `INCLUDE_REPORT_ANCHORS=true` (후기 수 임계값 없음, 리포트 존재 시 전부). robots.txt `/report`→`/report$` 로 `/reports/*` 접두 차단 해제. 단, 전체 색인은 `SITE_PUBLIC=true` 공개 플립이 선행 조건. CHANGELOG 2026-06-05 참조.
- [ ] **배포 후 스폿체크**: 로그인 상태로 `/reports/{en}` 저장·공유 토글 1회 동작 확인.
- [x] 표본 임계값: 피드는 후기 **≥4** 시술만 주입(`FEED_MIN_REVIEWS=4`), <4 는 단독 URL·검색만 노출. (2026-06-03)
- [ ] (후속) 피드 주입 카덴스(20장당 1장)·임계값(현 4) 운영 보며 튜닝 검토.

### 베타 → 공개 전환 준비
- [ ] Vercel Spend Management 설정 (사용자 직접) — 팀 Pro 확인(2026-06-05)이나 지출 상한 설정값은 API 미노출 → 콘솔(Settings → Billing) 확인 필요.
  - (완료 이관: robots 공개 정책·Google/Naver/Bing 등록·Analytics 가동 = DEPLOYMENT §9, Supabase Daily Backups = API 활성 확인. CHANGELOG 2026-06-05 참조.)

### 콘텐츠 검수기 v1 운영 정착
- [ ] 1주 운영 후 거짓양성 비율 점검 → 임계점·키워드 사전 조정 (카드 + 댓글 양쪽 모두)

---

## Next (다음 우선순위)

### Multi-identity Phase 3 — application layer 정합 (ADR 0011 후속)

2026-05-26 정합 작업으로 SQL 레벨 (마이그레이션 0158~0163) 은 완료됐으나, 서브에이전트 외부 감사 (commit 7aeba53 시점) 에서 application layer (TypeScript 가드·API 라우트·layout) 의 동일 정합 누락 발견:

- [x] **HIGH — `requireAdmin()` / `requireAdminPage()` 묶음 합산 잔재**: 배치 ④ (2026-05-28) 점검 결과 이미 active 단위 정합 완료. 옛 commit (adc5759, ADR 0012 도입 시점) 에서 처리된 stale 항목. 추가 작업 없음.
- [x] **HIGH — admin EditClient handleSubmit cards 직접 update → PUT API 통일**: 배치 ⑤ (2026-05-28) 완료. PUT `/api/articles/[id]` 가 `author_id` + `meta` 두 필드 신규 수용 (admin/doctor 가드). active 단위 권한·zod·rate-limit·audit_logs 자동 적용. 후속 (2026-05-29 `a06d732`): doctor admin 본인 글 status 변경 가드 비대칭 정정.
- [x] **HIGH — DoctorProfileEditForm doctors 직접 update → PUT API 통일**: 2026-05-29 commit `d4ceff8` (방식 B) + `60b0695` (service_role GRANT 0190/0191) 로 완료. 신규 `PUT /api/admin/doctors/[slug]/profile` 가 권한 가드 (super admin OR 본인 의사) + Zod + audit_logs + service_role UPDATE 일괄 처리. doctors 표면적은 SELECT-only 유지.
- [x] **HIGH — settings/profile POLICY-1 잔여 정합**: 2026-05-29 commit `fd1b64b`. `getIdentityContext` SSOT 사용으로 PII 읽기·쓰기 active 명함 단위 통일. saveMarketing 의 base 저장 엇갈림 정정. ADR 0015 §5 갱신.
- [x] **HIGH — CRITICAL-3 role 라우트 제거**: 2026-05-29 commit `b8251bb`. ADR 0012 위반 백필 흐름 (`/api/admin/users/[id]/role` + `RoleChangeForm`) 일괄 제거. production 잘못 백필 데이터 0건 확인.
- [x] **MEDIUM — `articles/[id]/route.ts isAuthor` active 단위 정합**: 배치 ② (2026-05-28) commit `f626983` 에서 `isAuthor = card.author_id === activeProfileId` 로 정합 확인.
- [x] **MEDIUM — `layout.tsx getSessionInfo` (line 82-100) 가 primary profile 의 role/doctorSlug 만 lookup**: 2026-05-27 commit `24fe68e` 로 active 신분 단위 정합 완료. role/displayName/avatarUrl/handle/doctorSlug 모두 active row 기준. `baseUserId` 필드 폐기.
- [x] **MEDIUM — `doctor_accounts` 직접 SELECT 18+ 곳 → SSOT 헬퍼 통일**: 2026-05-27 commit `e0852c6` (Critical-1) 로 `getDoctorIdForProfile`/`getDoctorSlugForProfile`/`getDoctorMetaBatch` 헬퍼 3개 도입 + 앱 코드 12개 위치 일괄 치환. DB 측 잔재 (0168 `get_notifications` RPC, 0163 `propagate_onboarding_to_doctor_bundle` RPC 의 LEFT JOIN doctor_accounts) 는 별도 정정 마이그레이션 필요 — 아래 NEW 추가.
- [ ] **LOW — "부계정" 용어 잔재 5건 정리**: `src/lib/active-identity.ts:15`, `src/app/admin/users/page.tsx:17`, `src/app/[handle]/page.tsx:165`, `src/app/settings/profile/page.tsx:68`, `src/app/write/page.tsx:34` — 모두 주석. "sub-identity" 또는 "묶음 내 다른 profile" 로 치환.
- [ ] **LOW — admin EditClient PubmedRef 로컬 타입 분산** (`src/app/admin/cards/[id]/edit/EditClient.tsx:38-47`) → `articles.ts` 의 SSOT PubmedRefObj import.

### 보안 방어 심층화 (Phase 3-B)

- [ ] **MEDIUM — `api_rate_limits` RLS 정책 명시화**: 현재 RLS ON + 정책 0개 (default deny). server-side rate-limit (`src/lib/rate-limit.ts`) 가 service_role 만 쓰는지 검증 후 명시 정책 추가 또는 ADR 명문화.
- [ ] **MEDIUM — `anonymize_user_content_before_delete` / `propagate_onboarding_to_doctor_bundle` anon EXECUTE 권한 정리**: 본문 가드 있으나 ADR 0006 "정기 점검" 정책상 anon EXECUTE 자체 노출 surface. REVOKE EXECUTE FROM anon 마이그레이션.
- [ ] **LOW — `search_logs` 옛 중복 정책 정리 후 확인**: 0163 에서 정리했으나 production 재검증 + admin 정책 단일화.

### 에디터 통합 마무리
**상태**: Phase 4a 완료, Phase 4b/4c 미진행. ADR 검토 후 결정.
- [ ] **Phase 4b**: WriteClient → CardEditor wrapper 화
  - 작성 전용 분기 많음 (doctor picker / 첫댓글 / 자동태그 / 환영카피 / 4액션)
  - 회귀 위험 → 새벽/오프피크 배포 권장
- [ ] **Phase 4c**: admin EditClient → CardEditor + AdminCardExtras
  - admin 전용 video/oembed/meta JSON/multi-pubmed 객체 분리 필요
- **공통 단점**: 사용자 체감 효과 0 (UI 동일, 순수 코드 정리)

### audit_logs 확장 (Phase 2)
- [x] **의사 확장 프로필 수정**: 2026-05-29 `d4ceff8` — `PUT /api/admin/doctors/[slug]/profile` 가 `doctor.profile_update` action 적재.
- [ ] 회원 프로필 수정 (settings/profile saveAll/saveMarketing), 카드 hard delete, admin draft publish 추가

### A10 잔여 라우트 error.message 일반화
- 인증 사용자 전용 (notifications / push / admin/*) — 보안 영향 낮음, 점진 패치

### push_subscriptions endpoint hostname 화이트리스트
- 현재 임의 hostname endpoint 수락 중 (이론적 위험)
- 실행: production 통계 조회 → fcm/mozilla/windows/apple 화이트리스트 적용
- 상세: `RUNBOOK.md` §1

---

## Later (장기 / 트래픽 증가 후 재검토)

### 보안 강화 (베타 기간 보류 항목)
- **R7** 본인인증 — 현재 클라 + DB CHECK constraint 로 충분 판단
- **L7** 자동결정 이의제기 UI — 적용 대상 기능 없음
- **L8** 처리방침 법무 자문 — DAU 1만 도달 후
- **L10** Sentry — 베타 규모 과함 (PII 마스킹 헬퍼만 적용)
- **L12** CSP enforce 전환 — SEO 우선 정책으로 Report-Only 유지 (`RUNBOOK.md` §6)
- **L13** HSTS preload — 도메인 정책 발목, 효과 작음
- **L14** Pino 구조화 로깅 — 베타 규모 과함

### HMAC 쿠키 서명 (`pibutenten_onboarded`)
- 현재 fast-path 캐시 마커. 위변조 시 미들웨어 통과해도 RSC 단 supabase getUser() 가 재검증 → 진짜 보호 레이어 있음
- 트래픽 작은 사이트에서 ROI 낮음
- 적용 시점: 트래픽 증가 또는 security audit 권고 시

### Card.tsx 분해
- 현재 한 파일에 너무 많은 책임 (view 카운트, 좋아요/저장/공유, 댓글 토글, 펼침 등)
- 우선순위: CardActions 추출부터 시작 추천

### 19금 차단 기능
- 콘텐츠 없음 → 약관 1줄 명시만 유지

---

## 분기 정기 점검

- [ ] `pg_proc` SECURITY DEFINER + authenticated EXECUTE sweep (보안 1차 사례)
- [ ] secret 노출 점검 (분기 스캔만, 평시 정기 로테이션 안 함 — 노출 의심 시 즉시 로테이션). 대상: VAPID/NAVER/ANTHROPIC/SERVICE_ROLE/PUSH_WEBHOOK/GOOGLE_CLIENT_SECRET
- [ ] Dependabot / npm audit 알림 처리
- [ ] audit_logs 1년 이전 row 정리

---

## 결정 기준 메모

- "사용자 체감 효과 0" 인 작업은 우선순위 낮음 (예: 에디터 통합 Phase 4b/4c)
- 보안 항목은 **운영 부담 vs 실제 위험** 으로 판단 (베타 규모에 과한 도구 금지)
- 새 결정은 `decisions/NNNN-title.md` ADR 로 기록

---

**이 문서 변경 시**: 로드맵 완료 항목은 `CHANGELOG.md` 의 `### Added` 또는 `### Changed` 로 이동 (CLAUDE.md §5).
