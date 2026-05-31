# ADR 0018 — 도메인 이전 `pbtt.kr` → `pibutenten.kr` (전략·단계·인프라)

- 상태: 채택 (2026-05-31)
- 맥락: 한국 서비스 도메인을 `pbtt.kr` → `pibutenten.kr` 로 영구 이전. 단발성 큰 작업이라 결정·절차·인프라를 한 곳에 영구 기록한다.
- 관련: ADR 0017(콘텐츠에 자기 절대 URL 저장 금지). CHANGELOG `[2026-05-31] 도메인 이전` 블록(시간순 상세).

## 맥락 (Context)

`pbtt.kr` 은 의미 없는 약어라 브랜드(`pibutenten`) 와 불일치. 색인이 거의 없는 시점(`SITE_PUBLIC` 초기)에 옮겨 SEO 손실을 최소화. 도메인은 코드·인프라 여러 곳(canonical·OAuth·CSP·푸시 웹훅·정적파일)에 흩어지므로, 매번 재발하지 않도록 **단일 출처 + 영구 리다이렉트** 원칙으로 옮긴다.

## 결정 (Decision)

### 1. 단일 출처 (Single Source of Truth)
- 동작용 도메인은 `SITE_URL`(`src/lib/site.ts`, env `NEXT_PUBLIC_SITE_URL`) **한 곳**으로 수렴. 하드코딩 제거.
- 저장 데이터에는 자기 절대 URL 금지(ADR 0017). 렌더 시점에 `SITE_URL` prefix.

### 2. "추가 → 깃발 넘김" 단계 전환 (무중단)
새 도메인을 먼저 **추가**(Phase 0·1)해 양쪽이 동시에 살아있게 한 뒤, 코드 기본값을 새 도메인으로 **전환**(A·B)한다.

- **Phase 0 — 인프라 추가**: Vercel 에 `pibutenten.kr`(apex) + `www`(308) 추가, DNS(A `76.76.21.21` / CNAME `cname.vercel-dns.com.`). Supabase Pro + Daily Backups + **Custom Domains** 애드온 → `auth.pibutenten.kr` 등록(CNAME → 프로젝트 호스트, `_cf-custom-hostname`·`_acme-challenge` TXT). Vercel Spend Management($50).
- **Phase 1 — 외부 콘솔에 새 도메인 추가**: Supabase Auth redirect 허용목록, 네이버 콜백(PC·모바일웹), 구글 OAuth 승인 도메인, Google·Bing 검색엔진 DNS 검증. (옛 도메인 항목은 유지.)
- **A-1 — 코드 수정(전환 전, 비배포)**: `next.config.ts` 레거시→canonical 308 게이트(`IS_NEW_DOMAIN`), `middleware.ts` CSRF allow-list 에 새 도메인 추가, `auth/callback` `sanitizeNext` 를 `SITE_URL` 기반으로, 정적파일(`.well-known/*`·`llms.txt`·`manifest`)·약관 본문·주석 치환. DB 전수 스캔 0건(ADR 0017).
- **A-2 — 전환**: `NEXT_PUBLIC_SITE_URL` → `https://pibutenten.kr`(Prod+Preview), 마이그 0195(푸시 웹훅 URL), Supabase `site_url` 전환, `www.pbtt.kr` 단일 hop 정리.
- **B — auth 컷오버·검색엔진·브랜딩**: 구글·카카오 OAuth redirect URI 에 `auth.pibutenten.kr/auth/v1/callback` 추가 후 `NEXT_PUBLIC_SUPABASE_URL` → `https://auth.pibutenten.kr`. GSC 주소 변경 + sitemap·RSS 재제출, Bing·네이버 등록, 구글 OAuth 동의화면 브랜딩.

### 3. auth 커스텀 도메인 (`auth.pibutenten.kr`)
Supabase Custom Domain 은 auth 뿐 아니라 **rest/storage/realtime 까지 프록시**. `NEXT_PUBLIC_SUPABASE_URL` 이 이를 가리키며, OAuth redirect·CSP `connect-src`/`img-src` 도 이 도메인 기준. SSL 은 Supabase ACME 자동.

### 4. 레거시 영구 유지
`pbtt.kr`/`www.pbtt.kr` → `pibutenten.kr` **308 영구** 리다이렉트, **폐기하지 않음**. 외부 백링크·옛 북마크·검색 캐시 보호.

## 결과 (Consequences)

- 다음 도메인 변경도 `SITE_URL`(env) 한 곳 + 리다이렉트만으로 처리. 콘텐츠 DB 손대지 않음.
- 308(영구) 사용으로 SEO 신호 승계. GSC 주소 변경 도구로 색인 이전 가속.
- 옛 도메인에 캐싱된 PWA/아이콘/세션은 리다이렉트·재검증으로 흡수(아이콘은 `?v` 쿼리 캐시버스팅 — CHANGELOG 참조).
- 외부 콘솔(구글·카카오·네이버·GSC·Bing) 은 한쪽 시스템이라 콘솔 UI 변경 시 위치가 달라질 수 있음 → 절차는 CHANGELOG·DEPLOYMENT 에 시점 기록.
- 롤백: `NEXT_PUBLIC_SITE_URL`·`NEXT_PUBLIC_SUPABASE_URL` 을 옛 값으로 되돌리고 재배포하면 즉시 원복(레거시 도메인·옛 redirect 목록을 유지했기 때문).
