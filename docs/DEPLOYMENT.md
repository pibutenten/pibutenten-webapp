# 배포 (DEPLOYMENT)

Vercel Pro 자동 배포 정책, 빌드 검증 절차, 새 세션 진입 가이드. 운영 사고 대응은 `RUNBOOK.md`.

---

## 1. 자동 배포 (현재 활성)

`vercel.json` 의 `git.deploymentEnabled: true` 설정. `git push origin main` 시 Vercel 자동 배포 트리거 (30~60초 빌드).

```bash
cd "D:/Dropbox/Claude Code/260503 피부텐텐 웹앱개발/pibutenten-app"
git add -A
git commit -m "feat: ..."
git push origin main
# → GitHub push 와 동시에 Vercel 자동 배포
```

---

## 2. 수동 / 명시 배포

자동 외 트리거 필요 시:

```bash
cd "D:/Dropbox/Claude Code/260503 피부텐텐 웹앱개발/pibutenten-app"
npx vercel --prod --yes
# 강제 재배포 또는 빌드 cache 문제 시
```

또는 Vercel Dashboard → Deployments → 우상단 "..." → Redeploy

---

## 3. 빌드 검증 (배포 전 필수)

```bash
npx tsc --noEmit       # 타입 에러
npm run build          # 전체 빌드 (Compiled successfully 확인)
```

- Vercel Dashboard → Deployments → 빌드 로그 확인
- 의존성 변경 (`package.json`) 시 build cache 우회 권장: `npx vercel --prod --yes` 로 fresh install 검증

---

## 4. Vercel Pro 한도 (2026-05-17 결제)

| 항목 | 한도 |
|---|---|
| 대역폭 | 1TB/월 (초과 시 $40/100GB) |
| 빌드 시간 | 24,000분/월 |
| 일일 배포 제한 | 사실상 없음 |
| Image Optimization | 5,000회/월 무료, $5/1,000회 |
| Function Invocations | 1,000,000/월 무료, $0.60/1M |
| Web Analytics | 25,000 이벤트/월 무료 |
| Speed Insights | 10,000 데이터 포인트/월 무료 |

**Spend Management 설정 권장** (Dashboard → Settings → Billing): 알림 $50 / 자동 정지 $200 (베타 기준)

---

## 5. 도메인 / SSL / 리다이렉트

- `pibutenten.kr` (Aliased, 메인 canonical) — HTTPS 정상, Let's Encrypt 자동 발급/갱신
- `www.pibutenten.kr` → `pibutenten.kr` 308 redirect (Vercel 도메인 레벨)
- `pibutenten-webapp.vercel.app` → canonical(`SITE_URL`) permanent redirect (`next.config.ts`)
- 레거시 `pbtt.kr` / `www.pbtt.kr` → `pibutenten.kr` 영구 308 (next.config IS_NEW_DOMAIN 게이트 / www 는 Vercel 도메인 redirect). **폐기 안 함** — 영구 유지
- `auth.pibutenten.kr` — **Supabase Custom Domain** (auth/rest/storage/realtime 전부 프록시). `NEXT_PUBLIC_SUPABASE_URL` 이 이 주소를 가리킴 (2026-05-31 컷오버, ADR 0018). SSL 은 Supabase ACME 자동. OAuth redirect URI(`/auth/v1/callback`)·CSP `connect-src`/`img-src` 도 이 도메인 기준.
- `pibutenten.com` — 미사용 (글로벌, 이번 범위 아님)
- HSTS preload 헤더 적용 (`max-age=63072000; includeSubDomains; preload`)

---

## 6. Function Region

`vercel.json` 의 `"regions": ["icn1"]` — 서울 리전. 한국 사용자 응답 속도 최적.

---

## 7. 검증된 Vercel Project

- projectId: `prj_MijzUpNAKutLpohy9r8NmK9mvrXN`
- orgId: `team_BAy639A15dBjrTq7NOtWObCU`
- `.vercel/project.json` 에 저장 (CLI 자동 인식)

---

## 8. 새 세션 시작 권장 절차

1. **이 docs/ 의 PRD.md + ARCHITECTURE.md + CHANGELOG.md 최근 3개 블록** 읽기
2. `pibutenten-app/` 디렉토리에서 `git log --oneline -10` 으로 최근 커밋 확인
3. 사용자 요청에 따라 작업 진행
4. SQL 변경 시 Supabase Management API 로 직접 실행 (CLAUDE.md §8)
5. 코드 변경 후 빌드 검증: `npx tsc --noEmit` + `npm run build`
6. Vercel 배포는 `git push origin main` 으로 자동 트리거

---

## 9. 공개 완료 (2026-05-28)

### 9.1. robots.txt fail-safe 패턴 (완료)
`src/app/robots.ts` 가 `SITE_PUBLIC === "true"` 일 때만 3-tier 정책 활성. 그 외 (미설정/오타/빈값) 모두 전체 차단.
- Production env: `SITE_PUBLIC=true` 등록 완료.
- Preview/Development: 미설정 유지 → 차단 (의도된 동작).
- `robots.ts` / `sitemap.ts` 양쪽 `export const dynamic = "force-dynamic"` 로 env 토글 즉시 반영.

### 9.2. 검색엔진 등록 (완료)
- Google Search Console — sitemap.xml + rss.xml 제출 완료.
- 네이버 서치어드바이저 — sitemap.xml + rss.xml 제출 완료.
- Bing Webmaster Tools — sitemap.xml (Success · 1.4K URLs) + rss.xml 제출 완료.

### 9.3. Analytics 가동 (완료)
- Vercel Analytics + Speed Insights — 패키지 설치 자동 가동.
- GA4 (`G-K85SS38584`) — `anonymize_ip` + `/search` query string sanitize PII 보호.
- 네이버 Analytics (`5d1db0791001f8`) — wcs.pstatic.net script.

### 9.4. IndexNow Cron (완료)
- 매일 KST 04:00 자동 ping (Bing/Yandex/Seznam/Yep).
- `public/{INDEXNOW_KEY}.txt` 소유권 증명.
- `Authorization: Bearer ${CRON_SECRET}` 외부 무단 호출 차단.

### 9.5. 운영 KPI 모니터링
- 콘텐츠 자동 검수기 거짓양성 비율 점검 (1주 후)
- audit_logs 분기별 정리 (`DELETE FROM audit_logs WHERE created_at < now() - interval '13 months'`)
- **secret 로테이션 정기 점검 (분기 1회: 1월·4월·7월·10월 첫 영업일)** — VAPID / NAVER / ANTHROPIC / SERVICE_ROLE / PUSH_WEBHOOK.
  - 절차: `docs/RUNBOOK.md §2` 의 단계별 로테이션 가이드 참조.
  - 책임자: 운영 담당. 분기 첫 영업일에 캘린더 등록.
  - 사고 직후 (의심되는 노출 발생 시): 분기 일정과 무관하게 **즉시 로테이션**.
  - 로테이션 직후: Vercel preview/production 환경변수 동시 갱신 → 배포 검증.
  - 옛 secret 은 일주일 grace period 후 Supabase Vault·외부 서비스 콘솔에서 영구 삭제.

---

---

## 10. 환경변수 매트릭스 (2026-05-28)

`.env.local.example` 의 모든 환경변수를 카테고리·target·민감도 별로 정리.

### 10.1. Supabase
| Name | Production | Preview | Dev | 민감도 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | 공개. **Production = `https://auth.pibutenten.kr`** (Supabase Custom Domain, ADR 0018). 로컬·템플릿은 `*.supabase.co` 직결 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | 공개 (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | **민감** |
| `SUPABASE_ACCESS_TOKEN` (Mgmt API) | 로컬만 | — | — | **민감** |
| `SUPABASE_PROJECT_REF` | 로컬만 | — | — | 공개 |

### 10.2. 사이트 공개 스위치
| Name | Production | Preview | Dev | 비고 |
|---|---|---|---|---|
| `SITE_PUBLIC` | `true` | 미설정 | 미설정 | 정확히 `"true"` 일 때만 공개 |

### 10.3. 검색엔진 사이트 인증 (HTML 메타태그)
| Name | Production | Preview | Dev |
|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | ✓ | ✓ | ✓ |

### 10.4. Analytics
| Name | Production | Preview | Dev | 비고 |
|---|---|---|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | ✓ | ✓ | ✓ | `G-XXXXXXXXXX` |
| `NEXT_PUBLIC_NAVER_ANALYTICS_ID` | ✓ | ✓ | ✓ | `s_xxxxxxxxxxx` |

### 10.5. IndexNow + Cron
| Name | Production | Preview | Dev | 비고 |
|---|---|---|---|---|
| `INDEXNOW_KEY` | ✓ | ✓ | ✓ | 32+자 hex |
| `CRON_SECRET` | ✓ | — | — | **Production only**. Vercel Cron 자동 첨부 |

### 10.6. 자동화 (로컬 전용)
| Name | 위치 | 비고 |
|---|---|---|
| `VERCEL_TOKEN` | `.env.local` 만 | AI 협업용 (env 추가/재배포 자동화). 회수: vercel.com/account/tokens |

### 10.7. 기타 (기존)
| Name | 비고 |
|---|---|
| `CSRF_ALLOWED_ORIGINS` | 미설정 시 production 도메인만 허용 |
| `NEXT_PUBLIC_SITE_URL` | Vercel env 에 설정 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 OAuth |
| `ANTHROPIC_API_KEY` | AI 글 초안 생성 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `PUSH_WEBHOOK_SECRET` | Supabase webhook 인증 |

---

**이 문서 변경 시**: 환경변수 변경은 `.env.local.example` 와 양쪽 갱신 (CLAUDE.md §5).
