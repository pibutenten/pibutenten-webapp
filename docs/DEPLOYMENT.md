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

- `pbtt.kr` (Aliased, 메인) — HTTPS 정상, Let's Encrypt 자동 발급/갱신
- `www.pbtt.kr` → `pbtt.kr` 308 redirect
- `pibutenten-webapp.vercel.app` → `pbtt.kr` permanent redirect (`next.config.ts:28-42`)
- `pibutenten.com` — 미사용 (등록기관 자동갱신 해지 예정)
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

## 9. 베타 → 공개 전환 (2026-06-01 예정)

### 9.1. robots.txt 환원
`src/app/robots.ts` 의 베타 차단 (`disallow: /`) 제거 → 표준 sitemap 라인 복원.

### 9.2. SEO 등록
사용자 직접 수행:
- Google Search Console
- Naver Search Advisor
- Bing Webmaster Tools

### 9.3. 운영 KPI 모니터링
- 콘텐츠 자동 검수기 거짓양성 비율 점검 (1주 후)
- audit_logs 분기별 정리 (`DELETE FROM audit_logs WHERE created_at < now() - interval '13 months'`)
- secret 로테이션 정기 점검 (VAPID/NAVER/ANTHROPIC/SERVICE_ROLE/PUSH_WEBHOOK)

---

**이 문서 변경 시**: 환경변수 변경은 `.env.local.example` 와 양쪽 갱신 (CLAUDE.md §5).
