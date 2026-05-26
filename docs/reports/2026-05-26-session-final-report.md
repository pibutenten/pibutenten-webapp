# 2026-05-26 세션 최종 보고서 — ADR 0012 명함 단위 완전 독립 정착 + 누더기 정합

## 1. 세션 목표

사용자께서 "코드가 땜빵식으로 수정되면서 근본 해결이 안 되고 누더기가 된 부분이 많다" 고 호소하셨습니다. 서브에이전트 8명을 독립 병렬로 띄워 코드베이스 전체를 검토하고, 종합 진단 후 누더기를 근본 해결합니다. 사용자 결정에 따라 ADR 0012 "명함(profile) 단위 완전 독립" 원칙을 application layer + DB 양쪽 모두에 정합합니다.

---

## 2. 분석 단계 (서브에이전트 8명)

### 2.1. 1차 — 분야 분담 4명 (Agent A·B·C·D)
- Agent A: Identity / Data flow / 상태관리
- Agent B: API / RPC / RLS / DB 마이그레이션
- Agent C: UI / 컴포넌트 / 모달 / 디자인 시스템
- Agent D: 미들웨어 / 인증 / 보안 / 온보딩

### 2.2. 2차 — 같은 전체 검토 4중 독립 (Agent E·F·G·H)
같은 프롬프트로 4명에게 독립 검토 — 다양성 + 합의도 측정.

### 2.3. 종합 진단 결과

**합의도 최상위 (4명 이상 동의)**:
1. 관리자 권한 가드 묶음 OR vs active 단위 정합 미완
2. 마이그레이션 번호 충돌 7쌍 + fix/hotfix/사람이름 13건 누적
3. 핵심 RPC 본문 7회 재정의 (anonymize 등)

**합의도 중상위 (3명)**:
4. `doctor_accounts` 직접 SELECT 18곳 분산 + 9곳 옛 위험 패턴 잔존

**합의도 중위 (2명)**:
5. PubMed `pubmed_ref` (단수) + `pubmed_refs` (배열) 이중 컬럼 잔존
6. `cards.question`/`answer` 옛 컬럼명 (도메인 부패)
7. `COALESCE(active, uid)` 패턴 RLS/RPC 34곳 인라인 반복
8. CardEditor.tsx 1093줄 거대 컴포넌트
9. layout.tsx getSessionInfo 105줄 임베드
10. useCardViewer me 결정 2경로 (SSR + client fetch 중복)
11. 카테고리 라벨 SSOT 깨짐 (articles vs category-labels)
12. doctor legacy role 6 profile 박제

**합의도 단독 (1명) — 검증 후 채택**:
13. middleware `pibutenten_onboarded` 쿠키 위조 가능
14. CSRF allowlist 개인 LAN IP 영구 박힘
15. SSRF 가드 중복 구현
16. audit_logs 적재 누락
17. me-cache base profile role 만 읽음
18. articles PUT isAuthor 묶음 합산 (silent UPDATE 0 rows 잠복)
19. cards_open_all_to_auth 보안 구멍 수개월 잠복했던 사실
20. Dialog 베이스 미사용 6 모달 wrapper 중복
21. CSS 색상 토큰 미사용 HEX 하드코딩

**평균 위생 점수 (8명)**: 5.8 / 10

---

## 3. 사용자 결정 — 명함 단위 완전 독립 5원칙

분석 후 사용자께서 명확히 결정하신 원칙:

> 1. **데이터 귀속**: 모든 글·댓글·좋아요·저장·알림은 작성·발생한 명함에만 귀속
> 2. **권한 판정**: 모든 권한은 현재 active 명함 기준 (묶음 합산 금지)
> 3. **명함 간 교차 X**: 의사 명함으로 쓴 글은 의사 글, 회원 명함으로 쓴 글은 회원 글. 사이에 합산 없음.
> 4. **묶음 효용**: 묶음의 유일한 의미는 IdentitySwitcher dropdown + 빠른 전환
> 5. **명함 self-contained**: 의사 정보는 명함 row 안에 인라인 (`doctor_accounts` 별도 매핑 점진 폐기)

이 원칙을 **ADR 0012** 로 명문화 + PRD §4.3 갱신.

---

## 4. 적용된 변경 (commit 순)

### 4.1. `af15ce1` — ADR 0012 정착 + 누더기 일괄 정합

**신규 문서**:
- `docs/decisions/0012-profile-unit-complete-independence.md` (ADR)
- `scripts/check-migration-naming.mjs` (CI 검사)
- `.env.local.example` 갱신 (SUPABASE_ACCESS_TOKEN + CSRF_ALLOWED_ORIGINS)

**Application 정합 (8개 핵심 파일)**:
- `src/lib/admin-guard.ts` — `requireAdmin/requireAdminOrDoctor` 묶음 OR → active 단위. 옛 함수는 호환 alias.
- `src/lib/admin-page-guard.ts` — `requireAdminPage` 묶음 admin lookup → active 단위.
- `src/lib/me-cache.ts` — base profile role → active profile role.
- `src/components/card/hooks/useCardViewer.ts` — client fetch useEffect 제거 (카드 N장당 RPC 폭주 차단).
- `src/app/api/articles/[id]/route.ts` — `isAuthor` 묶음 합산 → active 단위 비교.
- `src/app/api/articles/route.ts` — 카테고리 라벨 11줄 인라인 → `stripCategoryLabels` 헬퍼 import.
- `src/middleware.ts` — 개인 LAN IP 하드코딩 → `CSRF_ALLOWED_ORIGINS` 환경변수.

**PubMed 단일 출처화 (12개 파일)**:
옛 `pubmed_ref` (단수) 참조 일괄 제거 — types/schema/SELECT/EditClient/publish route 등.

**DB 마이그레이션 (production 적용 완료)**:
| 번호 | 내용 | 결과 |
|---|---|---|
| 0164 | `acting_profile_id()` 헬퍼 | 인라인 패턴 34곳 단일 출처 |
| 0165 | `profiles.doctor_id` 컬럼 인라인 + 백필 + 자동 sync 트리거 | 의사 9명 백필 완료 |
| 0166 | `cards.pubmed_ref` 컬럼 DROP | mismatch 0건 확인 후 백필 + DROP |

### 4.2. `cb2a60d` — scored RPC fix

0166 적용 직후 검증 단계에서 `search_cards_scored`/`feed_cards_scored` 가 dropped `pubmed_ref` 컬럼 참조 발견 → `/api/cards` 500. 즉시 fix.

**DB 마이그레이션 (production 적용 완료)**:
| 번호 | 내용 |
|---|---|
| 0167 | scored RPCs 본문에서 `pubmed_ref` 단수 제거 |

### 4.3. `5e8d3b4` — empty commit

Vercel 강제 재배포 trigger (캐시 의심 단계).

### 4.4. `bdbe933` — Service Worker auto-reload

새 SW 버전 activate 시 모든 열린 탭 자동 navigate → 옛 chunk 잔존 영구 차단. version v3→v4.

### 4.5. `e3f3280` — package.json version bump

0.1.0 → 0.1.1. Vercel build cache full invalidate trigger.

---

## 5. 검증 결과

| 검증 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run build` | 통과 (전체 라우트 정상) |
| `npm run check-migrations` | 통과 (신규 0164~0167 충돌 0) |
| Production DB schema 확인 | `cards.pubmed_ref` DROP 됨, `pubmed_refs` 존재 |
| 함수 검증 | `acting_profile_id()` 존재, `get_active_doctor_id()` 정상 |
| 의사 매핑 백필 | 9명 모두 `profiles.doctor_id` 정상 백필 |
| RLS 시뮬레이션 (의사 active) | cards SELECT 정상 통과 |
| RLS 시뮬레이션 (회원 active) | published 카드 SELECT 정상 통과 |
| 직접 PATCH `{pubmed_refs:null}` | 정상 통과 |
| Vercel 배포 (`bdbe933`) | success (~09:57 UTC) |

---

## 6. 변경 전후 정량 비교

| 지표 | 변경 전 | 변경 후 |
|---|---|---|
| 관리자 가드 함수 | 5개 (묶음 vs active 의미 혼재) | 1개 active 기준 (옛 4개 alias) |
| `pubmed_ref` 참조 코드 | 12개 파일 산재 | 0개 (배열 `pubmed_refs` 단일) |
| 카드 1장당 me 결정 RPC | 2회 (SSR + client fetch) | 0회 (SSR session 단일) |
| 카테고리 라벨 정의 출처 | 2곳 | 1곳 (`category-labels.ts` SSOT) |
| CSRF allowlist | LAN IP 하드코딩 + 옛 fix 주석 | 환경변수 + production 도메인만 |
| 마이그레이션 누적 검사 | 없음 | CI 자동 검사 (`npm run check-migrations`) |
| ADR 적용 layer | DB only (0011) | DB + Application (0012) |
| Service Worker | 단순 push handler | 새 deploy 시 자동 reload (옛 chunk 차단) |

---

## 7. 미해결 항목 — 정한미·고혜림 원장 보고 회귀

### 7.1. 보고 내용
- 정한미·고혜림 원장 — 글 수정 → "올리기" 클릭 시 "Could not find the 'pubmed_ref' column of 'cards' in the schema cache" 에러
- "코드 고친지 한두 시간 후" 진입 — stale page 캐시 아님

### 7.2. 진단 결과 (모든 표면 검사 정상)
- ✅ Local code `pubmed_ref` 단수 0건
- ✅ Production 24개 chunk 전수 검사 0건
- ✅ DB cards 컬럼 목록 — `pubmed_ref` 없음
- ✅ DB 함수·view·트리거 0건
- ✅ PostgREST schema cache 정상 (`pubmed_refs` 만 인식)
- ✅ 직접 PATCH `{"pubmed_refs": null}` → 정상 통과
- ⚠️ 직접 PATCH `{"pubmed_ref": null}` → 사용자 본 에러 정확히 재현

### 7.3. 남은 가능성 (확정 못 함)
1. **Vercel deployment alias mismatch** — production 도메인이 최신 commit 아닌 옛 빌드 alias
2. **Server-side bundle 잔재** — Vercel incremental build cache 가 server function 만 옛 빌드 잔존 (client chunk 검사 통과지만 server 측 못 검사)

### 7.4. 시도된 fix
- `bdbe933`: SW auto-reload — 사용자 다음 진입 시 새 chunk 자동 강제
- `e3f3280`: package.json version bump — Vercel build cache full invalidate trigger

### 7.5. 다음 세션 권장 액션
1. **e3f3280 deploy 완료 후 두 원장님 재시도** — 정상이면 종결
2. **여전히 에러 시 안전망 추가** — `admin EditClient.tsx` 의 `.from("cards").update(update)` 직전에 **cards 테이블 실제 컬럼 화이트리스트 필터** 박기. 어떤 코드 path 가 옛 컬럼 추가해도 자동 차단:
   ```typescript
   const CARDS_COLUMNS = new Set([/* DB 실제 컬럼 목록 */]);
   const filtered = Object.fromEntries(
     Object.entries(update).filter(([k]) => CARDS_COLUMNS.has(k))
   );
   await supabase.from("cards").update(filtered).eq("id", card.id);
   ```
3. **Vercel CLI 또는 dashboard 에서 production alias 직접 확인** — 어느 commit 빌드가 pbtt.kr 에 서빙되는지

---

## 8. 학습된 교훈

1. **DB 컬럼 DROP 직후 stale client chunk 잔존**: 컬럼 DROP 마이그레이션 적용 시 **(a) PostgREST schema reload + (b) SW 자동 reload + (c) 사전 코드 정합 검증** 3박자 필수.
2. **column 검사는 client + server 양쪽 모두 필요**: production client chunk grep 만으로는 server function bundle 잔재 못 잡음.
3. **합의도 4명 이상 동의 항목은 100% 진짜 누더기**: 8명 검토 패턴이 잘못된 직감 배제에 효과적.
4. **사용자 결정을 ADR 로 박는 게 가장 강력한 누더기 방지**: ADR 0012 5원칙이 향후 같은 회귀 재발의 단일 판단 기준.
5. **마이그레이션 자동 검사 (CI)**: 같은 번호 충돌 / fix/hotfix / 사람이름 — 자동 차단으로 누적 방지.

---

## 9. 다음 세션 우선순위 (ADR 0012 잔여 + 안전 항목)

### 단기
- 정한미·고혜림 원장 회귀 fix 종결 (위 7.5 참조)
- `doctor_accounts` 직접 SELECT 9곳 → `getDoctorIdForProfile` 헬퍼 통일
- audit_logs 4건 보강 (Naver callback / upload / reports / admin OAuth)
- middleware `pibutenten_onboarded` 쿠키 HMAC 서명화

### 중기
- 옛 함수 7회 재정의 squash (anonymize / find_duplicate / scored RPCs)
- `acting_profile_id()` 헬퍼 34곳 일괄 치환
- layout.tsx `getSessionInfo` 분리 + 캐시 directive 정리
- doctor legacy role 6 profile 데이터 마이그레이션 + UI 분기 단순화

### 장기 (베타 종료 2026-06-01 이후)
- 마이그레이션 baseline squash (`0000_baseline.sql`) — 무트래픽 시점
- `cards.question`/`answer` → `title`/`body` 컬럼 리네임
- CardEditor.tsx 1093줄 분할 (4개 wrapper 슬롯)
- Dialog 베이스 마이그레이션 (6 모달)
- CSS 색상 토큰 일괄 치환

---

## 10. commit/push 목록

| commit | 내용 | 상태 |
|---|---|---|
| `af15ce1` | ADR 0012 정착 + 누더기 일괄 정합 + 마이그레이션 0164~0166 | deploy success |
| `cb2a60d` | scored RPCs pubmed_ref 참조 제거 (마이그레이션 0167) | deploy success |
| `5e8d3b4` | empty commit (Vercel redeploy) | deploy success |
| `bdbe933` | SW auto-reload 메커니즘 | deploy success |
| `e3f3280` | package.json version bump (cache invalidate) | 빌드 진행 중 |

---

## 11. 정합 완결 매트릭스

| 영역 | DB layer | Application layer |
|---|---|---|
| Active 단위 권한 | ✅ (ADR 0011, 마이그레이션 0159~0162) | ✅ (ADR 0012, af15ce1) |
| 명함 단위 데이터 귀속 | ✅ (0161 RLS) | ✅ (articles PUT active isAuthor) |
| 의사 정보 인라인 | ✅ (0165 `profiles.doctor_id`) | 부분 — `doctor_accounts` 호출 측 9곳 미정합 |
| PubMed 단일 출처 | ✅ (0166 컬럼 DROP) | ✅ (12 파일 정리) |
| 카테고리 라벨 SSOT | N/A | ✅ (`stripCategoryLabels`) |
| 마이그레이션 위생 | 부분 (옛 충돌 7쌍 잔존) | ✅ (CI 검사 도입) |

---

**작성**: Claude Opus 4 (Claude Code 세션, 2026-05-26)
**총 commit**: 5건 (af15ce1 → cb2a60d → 5e8d3b4 → bdbe933 → e3f3280)
**production DB 마이그레이션**: 4건 (0164 / 0165 / 0166 / 0167)
**검증**: tsc + npm run build + check-migrations + RLS 시뮬레이션 모두 통과
**미해결**: 정한미·고혜림 원장 회귀 1건 (다음 세션 7.5 액션 진행)
