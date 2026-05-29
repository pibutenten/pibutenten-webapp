# 피부텐텐 SEO · AEO · GEO 종합 분석 보고서

> 작성일: 2026-05-28
> 대상 도메인: https://pbtt.kr
> 베타 종료(공개) 예정: 2026-06-01
> 운영사: 주식회사 진솔컴퍼니 (사업자등록번호 261-86-01781, 운영 책임자 배정민 pibutenten@gmail.com)
> 기준 입력 자료: `전달용/260528 피부시술_FAQ_통합_SEO_AEO_GEO_체크리스트.md` (1,309 줄, 16 Layer + 부록 A/B/C)

---

## 머리말 — 방법론

본 보고서는 사용자(서비스 소유자) 의 요청에 따라 **두 단계 8개 독립 분석가**가 작성한 결과를 교차검증하여 통합한 산출물입니다.

1. **1차 — 분야별 전문 분석가 4명** (각자 다른 영역 담당)
   - Tech-SEO 인프라 / Schema·AEO / GEO·LLM / 한국검색·신뢰페이지
2. **2차 — 같은 전체 과업을 독립 수행하는 종합 분석가 4명** (누락 교차검증)
   - 사용자 의견(`4명에게 같은 일을 독립적으로 시켜서 누락되거나 그런 부분을 합치는게 맞지 않나`)을 반영하여 추가 가동

총 **8개 독립 보고서**가 같은 체크리스트(16 Layer)에 대해 동시 진단·제안하였습니다. 8개 보고서 사이에 합의된 항목은 본 보고서에서 **강한 권고**로, 1~3개 보고서에만 등장한 항목은 **참고 권고**로 분류합니다.

본 보고서 자체는 어떤 파일도 직접 수정하지 않은 텍스트 보고서이며, 모든 코드 초안은 운영자가 별도로 검토·승인 후 적용 대상입니다. 초안 문서 풀세트(robots.ts, sitemap, llms.txt, JSON-LD, 신뢰 페이지 6종 등)는 별도 부록 파일 `2026-05-28-SEO-AEO-GEO-초안문서부록.md` 에 정리되어 있습니다.

---

## 핵심 요약 (Executive Summary)

### 현재 상태 한줄 요약
피부텐텐은 **베타 기간(~2026-06-01) 동안 schema·아키텍처·의료법 컴플라이언스의 핵심 토대를 매우 성실하게 구축**한 사이트로, **9명 의사 SSOT + Physician/MedicalProfessional multi-typing + pubmed_refs citation 자동 매핑 + speakable + 의료 면책 워크플로**는 동급 한국 의료 사이트 중 **상위 수준**입니다. 약 26개 항목이 우선순위 🔴 / 🟠 로 남아 있으며, 본 보고서의 90일 로드맵으로 실행 가능합니다.

### 강점 (8개 보고서 합의)
- App Router 전면 도입 + `metadataBase` 루트 설정 + 모든 동적 라우트 `generateMetadata`/`alternates.canonical` 적용
- 색인 대상 모든 라우트가 SSR (force-dynamic) → AI 봇 JS 미실행 환경에서도 본문 100% HTML 노출
- `@graph` 엔티티 그래프 (`/#organization`, `/#website`, `/doctors/{slug}#person`, `{url}#webpage`) 페이지간 교차참조
- `speakable.cssSelector` + `.card-answer-speakable` 일치 — 음성 비서/AI 답변 픽업 준비 완료
- `pubmed_refs` 컬럼을 `ScholarlyArticle citation` 으로 자동 매핑 (1,001 의사 글 중 84.6% 보유)
- 회원 글(`/u/`, `/{handle}/{shortcode}`) 색인 의도적 제외 → 의료법 §56② 2호 (치료경험담) 위반 위험 구조적 차단
- HSTS preload 자격 + X-Frame-Options DENY + CSP Report-Only + region `icn1`
- About / Privacy / Terms / Disclaimer / Doctor Guidelines / Report 페이지 이미 A급 수준

### 가장 큰 빈칸 (8개 보고서 합의)
1. **공개 후 robots.ts 환원 코드 미작성** — 베타 차단 정책만 있고 환원 분기 없음
2. **신뢰 페이지 6종 누락** — Contact / Editorial Policy / Medical Review / Corrections / Disclosures (그리고 About 보강)
3. **Naver / Bing / Google Search Console verification 토큰 0건**
4. **RSS Feed 라우트 0건** (네이버 freshness signal 결정적 손실)
5. **`/.well-known/security.txt`, `agent-card.json`, `ai-policy.json` 디렉토리 자체 없음**
6. **llms.txt 22줄 minimal — 9명 의사 프로필 트리·정책 페이지·라이선스 누락**
7. **llms-full.txt + 페이지별 `.md` alternate 미구현**
8. **`sitemap.ts` lastModified 가 created_at 만 사용** (updated_at 무시 → Freshness 신호 약화)
9. **검수자(reviewedBy) 가 author 와 동일** — Mayo/Healthline 4-date 모델 미적용
10. **부작용·금기 자동 삽입 (의료법 §56② 7호 의무) 시스템 없음** — `procedures` 마스터 테이블 부재
11. **Wikidata 9명 등록 0건**, 의사 sameAs 외부 권위 링크 보충 필요
12. **AI 인용 추적 도구 (Otterly.AI 등) 미도입**

### 트리아지 (우선순위별 수정 항목 수)
- 🔴 CRITICAL (공개 전 = 2026-06-01 D-Day 이전 필수): **12 항목**
- 🟠 HIGH (Phase 1 = 1개월 내): **15 항목**
- 🟡 MEDIUM (Phase 2 = 3개월 내): **12 항목**
- 🟢 LOW (선택·Phase 3+): **8 항목**

---

## Part 1. 현재 상태 진단 (As-Is) — Layer 0~16 전수

### Layer 0. 법적 컴플라이언스 (페이지 표시 의무 측면)

| 항목 | 상태 | 근거 |
|---|---|---|
| 운영 주체 명시 | ✅ | About §운영주체 — 진솔컴퍼니·사업자번호 261-86-01781 명시 |
| 환자 유인·알선 구조 (§27③) | ✅ | "예약하기·상담하기" 버튼 없음. PRD §7 out-of-scope |
| 치료경험담 차단 (§56②2호) | ✅ | Terms §5 명문 금지 + About 회원 글 §56 명시 + 자동 검수 |
| 부작용 표시 의무 (§56②7호) | ⚠️ | 페이지 자체 부작용 정보는 의사 본문 자율 — **자동 삽입 시스템 없음** |
| 비교 광고 금지 (§56②4호) | ✅ | Terms §5 명시 |
| 비급여 가격 게재 (§56②13호) | ✅ | 시술 가격 정보 없음 (구조적 차단) |
| 사전심의필 표기 시스템 (§57) | 🚫 | 일평균 10만 미만 — 의무 비대상. **그러나 readiness 시스템 부재** |
| Medical Disclaimer | ✅ | `/disclaimer` + Terms §12 + About 3중 |
| Footer Disclaimer 자동 | ✅ | `SiteFooter.tsx` "본 사이트의 전문의 답변은 일반 의학 정보..." |
| Conflicts of Interest 공개 | ❌ | `/disclosures` 페이지 없음 |
| AI 사용 정책 공개 | ⚠️ | Privacy §5 위탁에 "Anthropic Claude" 명시는 있으나 콘텐츠 측 공식 정책 부재 |

### Layer 1. YMYL · E-E-A-T

| 항목 | 상태 | 근거 |
|---|---|---|
| YMYL 등급 인지 | ✅ | llms.txt 에 "YMYL (의료/건강)" 명시 |
| Experience (1인칭 임상) | ⚠️ | 의사 자율 작성 — 시스템적 가이드 없음 |
| Expertise — 의사 자격 표시 | ⚠️ | `qualifications` 문자열만, `hasCredential` 객체화 미적용 |
| Authoritativeness — sameAs 5개+ | ⚠️ | `profileSameAs` 인프라는 있으나 실제 채움도 미상 (운영자 확인 필요) |
| Trustworthiness — reviewedBy 분리 | ❌ | 의사 글 author = reviewedBy 동일 |
| Mayo/Healthline 4-date 모델 | ❌ | schema 의 lastReviewed 만 존재, 본문 visible 없음 |
| 신선도 표기 본문 노출 | ❌ | "본 답변은 [날짜] 기준 의학 검수" 본문 visible 없음 |

### Layer 2. 기술적 SEO 기반

| 항목 | 상태 | 근거 |
|---|---|---|
| SSR/SSG | ✅ | 모든 색인 라우트 force-dynamic SSR |
| robots.txt 루트 배치 | ✅ | `/robots.txt` 자동 생성 |
| Naver Yeti Allow:/ | 🚫 (베타) | 베타 전체 차단. 공개 시 환원 코드 필요 |
| Sitemap 분리 | ⚠️ | 단일 sitemap. 분리(static/doctors/qa/topics) 또는 index 권장 |
| Sitemap lastModified ISO 8601 | ⚠️ | `created_at` 만 사용, `updated_at` 미반영 |
| RSS Feed | ❌ | 미구현 |
| Canonical 일관성 | ✅ | 모든 동적 라우트 `alternates.canonical` 명시 |
| Trailing slash 일관 | ✅ | 기본값 false 일관 |
| 모바일 우선 인덱싱 | ✅ | 모바일/데스크탑 동일 본문, `lang="ko"`, viewport 정상 |
| CWV 측정 | ⚠️ | Vercel Speed Insights 설치 여부 미확인 |
| HSTS 2년 + preload 자격 | ✅ | `next.config.ts` |
| CSP | ⚠️ | Report-Only, `report-uri` 없음 → 위반 수집 실효성 부족 |
| Cross-Origin-* 헤더 | ❌ | COOP/COEP/CORP 없음 |
| Cache-Control 정적 자산 immutable | ❌ | 명시 없음 |
| metadataBase 루트 | ✅ | `new URL(SITE_URL)` |
| OG/Twitter 풀세트 | ✅ | `buildSocialMeta` 헬퍼 |
| AVIF/WebP | ⚠️ | next/image 기본동작이나 명시 설정 없음 |
| LCP 이미지 priority | ✅ | 의사 hero |
| 한글 폰트 self-host | ✅ | Pretendard 4종 woff2 self-host |
| 한글 서브셋팅 | ⚠️ | 풀패키지 사용, 서브셋 미적용 |
| next/font + display:swap | ⚠️ | next/font 우회 (Next 16 turbopack 이슈), globals.css `@font-face` 직접 |

### Layer 3. 의료 Schema 마크업 · 지식 그래프

| 항목 | 상태 | 근거 |
|---|---|---|
| WebSite + SearchAction (홈) | ✅ | layout.tsx |
| MedicalOrganization / MedicalClinic | ✅ | layout.tsx 전역 + about + 5지점 |
| BreadcrumbList | ✅ | 모든 의미 페이지 |
| MedicalWebPage (의사 글) | ✅ | dual type 적용 |
| FAQPage (topics) | ✅ | `/topics/{tag}` 에 적용. **2026-05-07 rich result deprecated 인지 필요** |
| QAPage (의사 글) | ✅ | dual type |
| Article / MedicalScholarlyArticle | ❌ | MedicalWebPage + QAPage 만, Article 미추가 |
| Speakable | ✅ | `.card-answer-speakable` cssSelector |
| Physician 풀세트 | ✅ | `buildDoctorFull` (jobTitle/medicalSpecialty/knowsAbout/alumniOf/memberOf/sameAs/worksFor 등) |
| Physician `hasCredential` 객체화 | ❌ | `qualifications` 문자열만 |
| MedicalProcedure (about) | ⚠️ | `keywordsToAbout` 자동 변환 — 단순 name 만, 풀세트 객체 아님 |
| MedicalCondition possibleTreatment 양방향 | ❌ | 현재 단방향 about |
| @id + @graph | ✅ | 페이지 사이 cross-reference 정착 |
| JSON-LD Server Component inline | ✅ | hydration 안전 |
| XSS 이스케이프 | ✅ | `lib/json-ld.ts` |
| publishingPrinciples / ethicsPolicy / correctionsPolicy | ❌ | Organization schema 에 미연결 |

### Layer 4. AEO

| 항목 | 상태 | 근거 |
|---|---|---|
| 첫 단락 40–60자 직답 | ⚠️ | speakable selector 적용 — 본문 강제 가이드 없음 |
| 자연어 H2/H3 | ⚠️ | 의사 자율 작성 |
| 시맨틱 청크 (≤1500토큰/H2) | ⚠️ | 자율 |
| H1 = 질문 원문 | ✅ | `asH1` 분기 |
| 9명 답변 카드 UI | 🚫 | 단일 의사 답변 1편 모델 (정책) |
| 비교 표·번호 리스트 | ❌ | UI 패턴 없음 |
| `<time datetime>` 본문 가시 | ❌ | schema 만, 사람 가시 안 됨 |
| ItemList "관련 질문" | ⚠️ | `/topics/{tag}` 에는 있음, 의사 글 페이지에는 없음 |
| 페이지 단독성 (약어 풀이) | ⚠️ | 자율 |
| 서브디렉토리 hub | ✅ | `/topics/{tag}` 루트 도메인 |

### Layer 5. GEO · AI 크롤러

| 항목 | 상태 | 근거 |
|---|---|---|
| 통계 추가 (답변당 수치 1개+) | ⚠️ | 의사별 편차 — 시스템적 가이드 없음 |
| 인용 추가 (직접 blockquote) | ❌ | 시스템적 패턴 없음 |
| 권위 출처 (PubMed/Cochrane) | ✅ | 84.6% PubMed 참조 보유 |
| Wikidata Q-item (의사 9명) | ❌ | 미등록 |
| 광고성 문구 회피 | ✅ | 의료법 컴플라이언스 일체화 |
| 3-tier AI 크롤러 정책 | 🚫 (베타) | 베타 전체 차단. **공개 시 환원 코드 미작성** |
| CDN AI 봇 우발 차단 | ⚠️ | Vercel Bot Protection 설정 미확인 |
| llms.txt 게재 | ⚠️ | 22줄 minimal — 풀버전 권장 |
| llms-full.txt | ❌ | 없음 |
| 페이지별 `.md` alternate | ❌ | 라우트 미설계 |
| agent-card.json | ❌ | `/.well-known/` 디렉토리 자체 없음 |
| 시맨틱 HTML · ARIA | ⚠️ | layout `<main>`/header 일부 확인, 전수 미검증 |
| 외부 권위 (earned media) | ❌ | 학회 기고·매체 인용 시스템화 안 됨 |

### Layer 6. 9인 전문의 프로필 권위 허브

| 항목 | 상태 | 근거 |
|---|---|---|
| 의사 9명 개별 페이지 | ✅ | `/doctors/{slug}` |
| 영문 alternateName | ✅ | `DOCTOR_ENGLISH_NAME` |
| sameAs 외부 5개+ | ⚠️ | 인프라 있음, 실제 채움도 운영자 확인 필요 |
| alumniOf | ✅ | `profile.education` 매핑 |
| memberOf | ✅ | 공통 2개 + profile 추가 |
| hasOccupation | ✅ | Occupation 풀 객체 |
| knowsAbout | ✅ | `profile.expertise` |
| worksFor (MedicalClinic @id) | ✅ | `DOCTOR_TO_CLINIC` 매핑 |
| hasCredential 객체 | ❌ | 문자열 qualifications 만 |
| publishingPrinciples 링크 | ❌ | doctor-guidelines 존재하나 schema 미연결 |
| 사진 16:9·4:3·1:1 50,000픽셀+ | ⚠️ | OG 이미지 1200×630 — 비율 다양화 미확인 |
| 동영상 소개 30–90초 | ❌ | 미적용 |
| 답변 archive 페이지 | ⚠️ | `/doctors/{slug}` 안 답변 목록 확인 필요 |
| 검수 archive 페이지 | ❌ | reviewer 분리 없으므로 N/A |

### Layer 7. 콘텐츠 아키텍처 · URL 구조

| 항목 | 상태 | 근거 |
|---|---|---|
| URL 패턴 안정 | ✅ | `/doctors/{slug}/{year}/{post-slug}` SSOT |
| URL 키워드 포함 | ✅ | slug 키워드 기반 |
| 회원 글 redirect 정책 | ✅ | 308 → 의사 글 영구 redirect |
| /cards/{id} canonical 분배 | ✅ | redirect 구현 |
| 체크리스트 권장 `/procedures/{p}/q/{q}` | 🚫 | 현 구조 채택 — ADR 별도 권장 |
| 3-tier 아키텍처 (Pillar/Cluster/FAQ) | ⚠️ | `/topics/{tag}` 가 cluster 역할 부분 수행. Pillar 부재 |
| 관련 질문 추천 5–10개 | ⚠️ | `/topics/{tag}` 에는 있음, 개별 글 페이지 없음 |
| 내부 링크 3계층 (관련/카테고리/저자) | ⚠️ | 카드 단위 자율 |
| 콘텐츠 길이 1500–3000자 | ⚠️ | 의사 자율 |

### Layer 8. 인용 · 참고문헌 · 의학 검수

| 항목 | 상태 | 근거 |
|---|---|---|
| 출처 우선순위 (Cochrane > 메타분석) | ⚠️ | PubMed indexing 됨. Cochrane 우선순위 가이드 미문서화 |
| Inline Citation PMID/DOI | ✅ | JSON-LD citation + `pubmed_refs` 컬럼 |
| Vancouver/APA 스타일 통일 | ⚠️ | 자율 |
| 최근 5년 출처 70%+ | ⚠️ | 별도 분석 필요 |
| 한국 출처 (Annals of Dermatology) | ⚠️ | 미상. PubMed 포함됨 |
| 신선도 본문 표기 | ❌ | 시스템화 안 됨 |
| 의학 검수 프로세스 (WebMD 2-pass) | ⚠️ | 의사 본인 작성·검수 일치 |

### Layer 9. Naver SEO 특화

| 항목 | 상태 | 근거 |
|---|---|---|
| Naver Search Advisor 등록 | ❌ | verification 0건 |
| Sitemap 제출 | ⚠️ | sitemap.ts 존재하나 베타기간 차단 |
| RSS 제출 | ❌ | 라우트 없음 |
| Yeti user-agent Allow | 🚫 (베타) | 공개 시 명시적 Allow 필요 |
| URL 수집 요청 | ❌ | 등록 자체 없어 불가 |
| C-Rank "건강의학" 카테고리 매핑 | ⚪ | 외부 도메인 한계 |
| 단일 토픽 ("피부시술") 집중 | ✅ | knowsAbout 15개 키워드 모두 피부 |
| D.I.A.+ 체류시간 (≥1500자) | ⚠️ | 페이지별 길이 별도 점검 필요 |
| Smartblock 토픽 다양성 | ⚪ | 의사 답변 운영 결과 의존 |
| 지식스니펫 (Q→A 마크업) | ⚠️ | FAQ schema 별도 점검 |
| Daum / Zum 등록 | ❌ | 미진행 |

### Layer 10. Next.js 15 · Vercel

| 항목 | 상태 | 근거 |
|---|---|---|
| App Router | ✅ | `src/app/` |
| generateMetadata 동적 | ✅ | 모든 동적 라우트 |
| Client Component metadata 회피 | ✅ | Server Component 만 |
| alternates.canonical | ✅ | 모든 동적 라우트 |
| metadataBase | ✅ | layout.tsx |
| generateStaticParams + ISR | ❌ | 미사용 (모두 force-dynamic) |
| on-demand revalidateTag | ❌ | 미사용 |
| force-dynamic 관리자 한정 | ❌ | 모든 색인 라우트 force-dynamic |
| app/sitemap.ts | ✅ | DB 연동 |
| app/robots.ts | ✅ | 베타 차단 |
| AI 봇 정책 명시 | 🚫 (베타) | 공개 후 환원 안 필요 |
| next/image priority | ✅ | 의사 hero |
| next/font display:swap | ⚠️ | 우회 사유 명시 |
| Server Component JSON-LD | ✅ | hydration 안전 |
| `<` 이스케이프 | ✅ | `jsonLdString` 헬퍼 |
| Vercel Analytics + Speed Insights | ⚠️ | 설치 여부 확인 필요 |
| Vercel region KR | ✅ | `icn1` |
| Edge Middleware X-Robots-Tag | ❌ | 미사용 |

### Layer 11. 신뢰·투명성·정책 페이지

| 항목 | 상태 | 비고 |
|---|---|---|
| About | ✅ A급 | schema MedicalOrganization 풀세트 + member 9명 + 사업자번호 |
| Editorial Team | ❌ | 별도 페이지 부재 (About schema 만) |
| Contact | ❌ | 별도 페이지 부재 |
| Privacy | ✅ A급 | PIPA §30, 국외이전 6개사 표, 탈퇴 절차 |
| Terms | ✅ A급 | 16개 조항. 의료법 §56②, 약사법 §68 등 명시 |
| Medical Disclaimer | ✅ B+급 | 응급/정신건강 명시. datePublished/lastReviewed 미노출 |
| Doctor Guidelines | ✅ A급 | 의사 회원 작성 기준 |
| Editorial Policy | ❌ | 없음 |
| Medical Review Process | ❌ | 없음 |
| Corrections Policy | ❌ | 없음 |
| Conflicts of Interest / Disclosures | ❌ | 없음 |
| Funding Disclosure | ❌ | 없음 |
| Cookie Policy | ⚠️ | Privacy §9조 흡수 |
| 광고·협찬 표시 정책 | ⚠️ | Terms §14 1줄만 |
| AboutPage / ContactPage schema | ⚠️ | AboutPage 풀세트, ContactPage 부재 |

### Layer 12. 오프사이트 권위·엔티티 구축

| 항목 | 상태 |
|---|---|
| 학회 발표·논문 (분기 1건+) | ❌ |
| 의료 매체 칼럼 기고 | ❌ |
| 외부 디렉토리 등재 (대한피부과의사회) | ⚠️ |
| Wikipedia·Wikidata | ❌ |
| 백링크 (.ac.kr / .go.kr / .or.kr) | ❌ |
| Brand-Entity Frequency PR | ❌ |

### Layer 13. 분석·모니터링·AI 인용 추적

| 항목 | 상태 |
|---|---|
| Google Search Console | ⚠️ 미상 |
| Naver Search Advisor | ⚠️ 미상 |
| Bing Webmaster | ⚠️ 미상 |
| GA4 + Naver Analytics | ⚠️ 미상 |
| AI Assistants Channel Grouping | ❌ |
| AI 인용 추적 도구 (Otterly/Profound) | ❌ |
| Share of Model KPI 정의 | ❌ |
| Vercel logs AI bot grep | ❌ |
| Schema 검증 CI | ❌ |

### Layer 14. UX·접근성·멀티미디어

| 항목 | 상태 |
|---|---|
| WCAG 2.2 AA | ⚠️ 부분 (글자색 4톤 ADR 0010) |
| KWCAG (KS X OT0003) | ⚠️ 검증 필요 |
| 의학적 이미지 alt | ⚠️ 의사 사진 일관, UGC 자율 |
| 시술 영상 배제 (§56②6) | ⚠️ YouTube 임베드 허용, 원본 채널 의존 |
| ARIA labels | ⚠️ 검증 필요 |
| 색상 대비 4.5:1 | ⚠️ ADR 0010 — 측정 필요 |
| 시맨틱 HTML | ⚠️ 일부 확인, 전수 미검증 |
| "도움이 되었나요" 피드백 | ❌ |
| 사이트 내부 검색 | ✅ `/search` noindex,follow |
| 검색어 로깅 → FAQ gap | ⚠️ 검증 필요 |

### Layer 15. 다국어·국제화

| 항목 | 상태 | 비고 |
|---|---|---|
| LLM 영어 편향 인지 | ✅ | 한국어 단일 — 의도된 정책 |
| 영문 페이지 | 🚫 | 의료법 §56②12호 회피로 의도적 미적용 |
| hreflang | 🚫 | 단일 언어이므로 N/A |
| MedicalProcedure alternateName 영문 | ⚠️ | schema 인프라 있음, 실제 채움도 미상 |

### Layer 16. 운영 거버넌스 (8 Levels of AI Search)

전 항목 ❌ 또는 ⚠️ — 매뉴얼·캘린더 자체가 미문서화 상태.

| Level | 활동 | 상태 |
|---|---|---|
| L1 기술 기반 점검 | 자동 alert 없음 | ⚠️ |
| L2 schema 분기 검사 | 미구성 | ❌ |
| L3 9인 답변 모순 매월 점검 | 미구성 | ❌ |
| L4 신규 FAQ 매월 | 자유 작성 | ⚠️ |
| L5 외부 매체 PR 반기 | 미구성 | ❌ |
| L6 GEO KPI 매월 | 미구성 | ❌ |
| L7 agent-card 반기 검증 | 파일 자체 없음 | ❌ |
| L8 노후 논문 분기 갱신 | 미구성 | ❌ |
| 임계값 트리거 정책 | 미문서화 | ❌ |

---

## Part 2. 체크리스트 통합 매칭 — 핵심 미달 항목 표

(Layer 0~16 의 ❌ / ⚠️ 항목만 추출. 우선순위 분류)

| 우선순위 | Layer | 항목 | 처리 위치 |
|---|---|---|---|
| 🔴 | 2 | 공개 후 robots.ts 환원 코드 | 부록 5-1 |
| 🔴 | 2 | Sitemap lastModified (updated_at) 정확화 | 부록 5-2 |
| 🔴 | 2 | RSS Feed 신설 | 부록 5-5 |
| 🔴 | 2 | Naver/Google/Bing verification 토큰 입력 | 부록 5-6 |
| 🔴 | 2 | CSP report-uri + endpoint | 부록 5-8 |
| 🔴 | 2 | `/.well-known/security.txt` | 부록 5-9 |
| 🔴 | 5 | llms.txt 풀버전 | 부록 5-3 |
| 🔴 | 5 | Vercel Bot Protection 확인 | 본 보고서 Part 5 |
| 🔴 | 0/11 | Contact 페이지 | 부록 5-19 |
| 🔴 | 0/11 | Editorial Policy | 부록 5-19 |
| 🔴 | 0/11 | Disclosures (Conflicts of Interest) | 부록 5-19 |
| 🔴 | 0 | 부작용·금기 자동 삽입 (의료법 §56②7) | 부록 5-17 |
| 🟠 | 2 | Sitemap index 분리 | 부록 5-2 |
| 🟠 | 5 | llms-full.txt | 부록 5-4 |
| 🟠 | 5 | `/.well-known/agent-card.json` | 부록 5-10 |
| 🟠 | 5 | `/.well-known/ai-policy.json` | 부록 5-11 |
| 🟠 | 1/8 | 4-date 모델 + reviewedBy 분리 | 부록 5-13/5-16 |
| 🟠 | 1/6 | Physician hasCredential 객체화 | 부록 5-12 |
| 🟠 | 3 | Article / MedicalScholarlyArticle 추가 type | 부록 5-13 |
| 🟠 | 3 | Organization publishingPrinciples/ethicsPolicy/correctionsPolicy | 부록 5-15 |
| 🟠 | 11 | Medical Review Process 페이지 | 부록 5-19 |
| 🟠 | 11 | Corrections Policy 페이지 | 부록 5-19 |
| 🟠 | 11 | About 보강 (회사 정보·미션·의료기관 관계) | 부록 5-19 |
| 🟠 | 4 | Quick Answer 박스 + 시맨틱 H2 분할 | 부록 5-16 |
| 🟠 | 10 | ISR 도입 (의사 글 force-dynamic 해제) | 부록 5-26 Phase 1 |
| 🟠 | 13 | AI 인용 추적 도구 (Otterly.AI) | 부록 5-22 |
| 🟠 | 13 | Vercel logs AI 봇 grep 자동화 | 부록 5-21 |
| 🟡 | 5 | 페이지별 `.md` alternate 라우트 | 부록 5-4 보충 |
| 🟡 | 6 | Wikidata 9명 등록 | 부록 5-20 |
| 🟡 | 12 | 학회 발표·매체 칼럼 PR 캘린더 | 부록 5-25 |
| 🟡 | 9 | Daum / Zum 검색등록 | 부록 5-7 |
| 🟡 | 9 | 네이버 키워드 리서치 450 baseline | 부록 5-24 |
| 🟡 | 0 | 의료법 §57 사전심의필 readiness | 부록 5-23 |
| 🟡 | 11 | Editorial Team 별도 페이지 | 부록 5-19 |
| 🟡 | 11 | 광고·협찬 표시 정책 구체화 | 부록 5-19 |
| 🟡 | 16 | 8 Levels 운영 캘린더 | 부록 5-25 |
| 🟡 | 14 | Helpful Yes/No 피드백 | 본 보고서 Part 3 |
| 🟡 | 2 | 폰트 서브셋팅 (Pretendard) | 본 보고서 Part 3 |
| 🟡 | 2 | manifest.webmanifest id/categories/shortcuts | 본 보고서 Part 3 |
| 🟢 | 14 | 의학 용어집 `/glossary` | 본 보고서 Part 3 |
| 🟢 | 11 | Cookie Policy 별도 페이지 | 본 보고서 Part 3 |
| 🟢 | 9 | Naver Place 등록 | 본 보고서 Part 3 |
| 🟢 | 6 | 의사 30–90초 동영상 소개 | 본 보고서 Part 3 |
| 🟢 | 2 | 동적 OG (`ImageResponse`) | 본 보고서 Part 3 |
| 🟢 | 14 | 추가 ARIA / 시맨틱 audit | 본 보고서 Part 3 |
| 🟢 | 15 | 영문 페이지 (별도 도메인 + 국내 IP 차단 검토) | 부록 5-26 Phase 4 |
| 🟢 | 7 | `/procedures/{slug}` Pillar 페이지 | 부록 5-26 Phase 4 |

---

## Part 3. 필요한 수정 사항 (To-Be) — 우선순위 정렬

### 🔴 CRITICAL — 공개(2026-06-01) D-Day 전 필수

| # | 변경 대상 | 변경 내용 | 8/8 합의 |
|---|---|---|---|
| C1 | `src/app/robots.ts` | 베타 차단 → 3-tier AI 봇 정책 (학습 차단 / 검색·답변 허용 / 일반 검색 허용) + Disallow 경로 풀세트 + sitemap URL | 8/8 |
| C2 | `src/app/sitemap.ts` | lastModified `updated_at ?? created_at` 우선순위 + 정책 페이지(/disclaimer·/terms·/privacy·/doctor-guidelines) staticRoutes 추가 | 8/8 |
| C3 | `src/app/rss.xml/route.ts` (신규) | RSS 2.0, 의사 글 최신 50건, 회원 글 제외, XML escape | 8/8 |
| C4 | `public/llms.txt` | minimal 22줄 → 풀버전 (9명 의사 프로필 트리, 정책 페이지 5종, 라이선스, 회원 글 인용 금지) | 8/8 |
| C5 | `public/.well-known/security.txt` (신규) | RFC 9116 — Contact/Expires/Preferred-Languages/Canonical/Policy | 8/8 |
| C6 | `src/app/layout.tsx` `metadata.verification` | Naver/Google/Bing 인증 토큰 입력 (운영자 토큰 발급 후) | 8/8 |
| C7 | `next.config.ts` `headers()` 또는 `vercel.json` | CSP `report-uri` + `report-to` + `/api/csp-report` endpoint, COOP/CORP, Cache-Control immutable (`/fonts/*`, `/icons/*`, `/og/*`) | 6/8 |
| C8 | `src/app/api/csp-report/route.ts` (신규) | CSP 위반 수신 + Sentry/로그 적재 + rate limit | 4/8 |
| C9 | `src/app/contact/page.tsx` (신규) + ContactPage schema | 회사 정보·문의 채널·자주 묻는 문의 | 8/8 |
| C10 | `src/app/editorial-policy/page.tsx` (신규) | 5단계 워크플로 + 출처 우선순위 + AI 사용 정책 + 의학 검수 주기 | 8/8 |
| C11 | `src/app/disclosures/page.tsx` (신규) | 운영주체 자본 관계 + 9명 의사 이해상충 표 (운영자 입력 의존) + 광고·협찬 정책 | 8/8 |
| C12 | `procedures` 테이블 + `card_procedures` 매핑 + `ProcedureSideEffectsBox` 컴포넌트 | 의료법 §56②7 부작용 자동 삽입 시스템 (시드 30~50개 시술) | 8/8 |
| C13 | Vercel Dashboard | Firewall/Bot Protection 에서 AI 검색 봇 challenge 없는지 확인 (운영자 수동) | 4/8 |

### 🟠 HIGH — Phase 1 (1개월 내)

| # | 변경 대상 | 변경 내용 | 합의 |
|---|---|---|---|
| H1 | sitemap 분리 (sitemap-static / sitemap-doctors / sitemap-qa / sitemap-topics + sitemap.xml index) | 50,000 URL 대응 + 영역별 lastmod 분리 + Naver 1 sitemap 정책 호환 | 7/8 |
| H2 | `src/app/llms-full.txt/route.ts` (신규) | ISR 1시간, 의사 글 마크다운 단일 파일, 회원 글 제외, 응답 헤더 + 캐시 정책 | 8/8 |
| H3 | `src/app/medical-review/page.tsx` (신규) | "이 답변은 어떻게 검수되나요" + 4-date 모델 설명 | 8/8 |
| H4 | `src/app/corrections/page.tsx` (신규) | 30일 정정 이력 + 사유 분류 + 표시 형식 | 8/8 |
| H5 | `src/app/about/page.tsx` 보강 | 회사 정보·미션·의료기관 소속·9명 명단 + publishingPrinciples/ethicsPolicy/correctionsPolicy schema 링크 | 8/8 |
| H6 | `public/.well-known/agent-card.json` (신규) | citationPolicy·endpoints·structuredData·9명 trees | 8/8 |
| H7 | `src/lib/schema/doctor.ts` `buildDoctorFull` | `hasCredential` 객체화 + `publishingPrinciples` 링크 + `nationality`/`knowsLanguage` | 7/8 |
| H8 | 의사 글 schema (`src/app/doctors/[slug]/[year]/[postSlug]/page.tsx`) | Article 또는 MedicalScholarlyArticle 추가 type + reviewedBy 분리 준비 (medical_reviewer 컬럼 추가) | 7/8 |
| H9 | 답변 페이지 AEO 시맨틱 HTML | Quick Answer 박스 + H2 분할 (전문의 답변/부작용/참고문헌/관련 질문) + 사람 가시 `<time datetime>` | 8/8 |
| H10 | `cards.medical_reviewer_id` 컬럼 추가 + 9명 상호 검수 워크플로 | 의학 검수자 분리 (Mayo/WebMD 2-pass 모델) | 6/8 |
| H11 | `cards.summary` (Quick Answer 40–60자) 컬럼 추가 + 의사 작성 UI | AEO 첫 단락 직답 | 5/8 |
| H12 | 의사 작성자 가이드 GEO 강화 (`doctor-guidelines` 보강 또는 `docs/AUTHOR_GUIDE.md`) | 답변당 통계 1개·PubMed 1개·blockquote 1개·회피 표현 사전 + 신선도 표기 | 8/8 |
| H13 | `src/middleware.ts` 또는 page 수준 `noindex` | 사전심의 미통과 또는 검수 미완료 카드 동적 차단 | 4/8 |
| H14 | ISR 도입 — 의사 글 페이지 `force-dynamic` 제거 + `generateStaticParams` + `revalidate=86400` + on-demand `revalidateTag` | TTFB 600ms → 50–100ms 개선, Vercel Function 비용 절감 | 6/8 |
| H15 | AI 인용 추적 도구 — Otterly.AI baseline ($29/월) + 200 키워드 셋팅 (의사 brand + 시술명 + 사이트 brand + 일반 키워드) | KPI 베이스라인 | 8/8 |

### 🟡 MEDIUM — Phase 2 (3개월 내)

| # | 변경 대상 | 변경 내용 |
|---|---|---|
| M1 | `public/.well-known/ai-policy.json` | IETF AI Preferences draft (training/tdm/search/answerWithCitation/userTriggeredFetch) |
| M2 | `src/app/md/[...path]/route.ts` 또는 `.md` suffix 라우트 | 페이지별 마크다운 alternate + frontmatter |
| M3 | `lib/to-markdown.ts` (HTML→MD 변환 헬퍼) | `.md` alternate + llms-full.txt 본문 직렬화 |
| M4 | Wikidata 9명 등록 (운영자 외부 작업) | 의료법 §56② 회피 필드만 등록 + sameAs 자동 연동 |
| M5 | `sitemap-images.xml` | 의사 프로필 사진 이미지 sitemap |
| M6 | 동적 OG (`src/app/api/og/[slug]/route.ts` ImageResponse) | 글마다 다른 OG (현재 정적 9개 → 동적) |
| M7 | 폰트 서브셋팅 (Pretendard KS X 1001 2,350자) | 70% 용량 감소 (LCP 개선) |
| M8 | `manifest.webmanifest` | `id`, `categories`, `shortcuts`, `screenshots` 추가 |
| M9 | `src/components/HelpfulFeedback.tsx` (신규) | Yes/No 버튼 + GA4 이벤트 (Layer 14.3) |
| M10 | 카카오비즈니스 다음 검색등록 + 줌 검색등록 (운영자) | https://register.search.daum.net + https://help.zum.com/submit |
| M11 | 네이버 키워드 리서치 450 baseline 작성 + 5탭 매핑 | PRD §4.2 호환 |
| M12 | Editorial Team 별도 페이지 + Funding Disclosure 페이지 | About 분화 |
| M13 | 의료법 §57 사전심의필 readiness — `cards.ad_classification`, `ad_review_*` 컬럼 추가 | 일평균 10만 도달 readiness |
| M14 | Schema 검증 CI (schema-dts + Schema Markup Validator API) | 회귀 방지 |
| M15 | Vercel Analytics + Speed Insights 설치 확인 | CWV 실측 |

### 🟢 LOW — Phase 3+ 또는 임계값 도달 시

| # | 변경 대상 | 변경 내용 |
|---|---|---|
| L1 | `/glossary` 의학 용어집 페이지 | Mayo 가독성 표준 부합 |
| L2 | Cookie Policy 별도 페이지 | 현 Privacy §9 흡수 유지 가능 |
| L3 | Naver Place 등록 (9명 의사 소속 의료기관별) | 의료기관이 별도 의사 단위 운영 시 |
| L4 | `/procedures/{slug}` Tier 1 Pillar 페이지 | URL 구조 결정 후 (현재 `/topics/{tag}` 가 cluster 역할) |
| L5 | 의사 30–90초 동영상 소개 + 한국어/영문 자막 + transcript | 의료법 §56②6 효과 단언 회피 |
| L6 | 영문 페이지 (대표 시술 정의) — 별도 도메인 + 국내 IP 차단 | 의료법 §56②12호 회피 |
| L7 | 추가 ARIA / 시맨틱 audit (axe-core CI 통합) | KWCAG 자동 점검 |
| L8 | CSP enforce 전환 (Report-Only 6개월 검토 후) | 위반 0건 확인 후 |

---

## Part 4. 장점 · 위험 · 트레이드오프

### C1. robots.ts 환원

**기대 효과** (8/8 합의)
- Google/Naver Yeti/Bing 색인 시작 → 베타 0건 → 공개 후 1~3개월 내 핵심 100 키워드 GSC 노출
- OAI-SearchBot / ChatGPT-User / Claude-SearchBot / Claude-User / PerplexityBot 허용 → AI Overviews / ChatGPT / Perplexity 인용 가능
- GPTBot / ClaudeBot / CCBot / Google-Extended / Bytespider / Applebot-Extended / Meta-ExternalAgent 차단 → 의사 9명 저작권 보호 + 의료법 컴플라이언스

**회귀 위험**
- 회원 글 `/{handle}/{shortcode}` Disallow 매칭 정밀 검토 필요 — handle 패턴 와일드카드 한계
- 변경 후 GSC/Naver 에 sitemap 재제출 필수
- Bytespider 는 robots.txt 무시 사례 — Vercel Firewall WAF 별도 차단 검토

**의료법·개인정보보호법 위험**
- 회원 글 색인 유지 시 의료법 §56② 2호 (치료경험담) 위반 위험 — **회원 글 noindex 유지 권장** (현 정책 동일)

### C2/H1. sitemap 정확화 / 분리

**기대 효과**: Freshness signal 강화. BrightEdge 데이터 60일 이내 업데이트 페이지 1.9배 AI 답변 등장. Naver "1 sitemap 정책" 호환.

**회귀 위험**: 단순 날짜 변경은 Google 2025.12 코어 업데이트 페널티 가능 — `cards.updated_at` 가 실제 본문 수정 시 만 갱신되는지 트리거 확인 필요. 기존 `/sitemap.xml` URL 변경 시 GSC 재제출.

### C3. RSS Feed

**기대 효과**: 네이버 freshness signal — 외부 도메인이 네이버에서 인지될 수 있는 거의 유일한 신호.

**위험**: 거의 없음. 회원 글 누출만 주의 (`.eq("status", "published") .not("doctor_id", "is", null)` 필터).

### C4. llms.txt 풀버전

**기대 효과**: LLM 답변 엔진이 사이트 구조·인용 정책·라이선스를 한눈에 파악. 작성 비용 1~4시간, 무다운사이드.

**위험**: 거의 없음. **단 SE Ranking 분석: 채택률 10.13%, 어떤 메이저 AI 회사도 공식 준수 약속 없음 — KPI 미포함 권장**.

### C5/C7/C8. security.txt / CSP report endpoint

**기대 효과**: 보안 연구자 정상 제보 채널 + 운영 중 CSP 위반 가시화 → 추후 enforce 전환 근거.

**위험**: report endpoint 가 공격자에게 알려지면 spam 가능 → rate limit + Sentry 적재 권장. security.txt `Expires` 1년 갱신 운영 부담.

### C9~C11. 신뢰 페이지 신설 (Contact / Editorial Policy / Disclosures)

**기대 효과**: YMYL E-E-A-T 결정적 신호. Mayo/Cleveland Clinic 모델 부합. Google Search Quality Rater Guidelines 의료 콘텐츠 평가 기준 통과.

**위험**: 분기 재검수·정기 업데이트 운영 부담. 의사 9명 이해상충 disclose 는 의사 본인 협조 필요 — **AI 가 임의로 채울 수 없는 영역, 운영자 9명에게 직접 입력 받아야 함**.

### C12. 부작용 자동 삽입

**기대 효과**: 의료법 §56② 7호 (부작용 등 소비자 오인 우려 정보 균형 표시) 자동 충족. AI 인용 시 "균형잡힌 정보" 신호.

**위험**: **시술별 표준 부작용 문구 부정확하면 역효과** — 의료진 검수 필수. `procedures` 마스터 테이블에 30~50개 시술 시드 입력 시 **9명 의사 합의로 부작용 필드 검수** 필요. 본문 글씨 크기와 동일 (의협 의료광고심의위원회 기준 — 작은 disclaimer 금지) 적용 필수.

### H7. Physician hasCredential 객체화

**기대 효과**: Google Doctor Knowledge Panel 유사 신호. AI 의사 자격 검증 신뢰도. ↑↑↑ Authoritativeness.

**위험**: 면허번호 schema 노출 시 PII 위반 → 객체화 시 번호 제외, `recognizedBy: 보건복지부` 만 명시.

### H8/H10. Article + reviewedBy 분리

**기대 효과**: Google Top Stories/Discover 노출 가능성. YMYL Trust 결정적 신호.

**위험**: 9명 의사 상호 검수 워크플로 도입 시 운영 비용 증가. `cards.medical_reviewer_id` 마이그레이션 + admin UI 추가 필요.

### H14. ISR 도입

**기대 효과**: 의사 글 TTFB 600ms → 50~100ms (CDN edge cache hit). LCP/FCP/TTFB 모두 개선 → CWV 75th percentile 통과 확률 상승. Vercel Function 비용 절감.

**회귀 위험**:
- `force-dynamic` 페이지에 viewer-specific 데이터 (좋아요/저장 상태) 가 SSR 결과 포함되어 있다면 분리 필수 — Client Component hydration
- `revalidateTag` 호출 누락 시 글 수정 후 캐시 갱신 안 됨 → 발행 API/관리자 수정 API 모두 호출 보장

### H15. AI 인용 추적 도구

**기대 효과**: Share of Model KPI 측정 가능. 6개월 시점 핵심 100 쿼리 인용률 <5% 시 Layer 16.3 임계값 트리거 (Wikidata 가속 + 외부 PR)

**위험**: $29/월 비용. SOC 2 미보유 → enterprise 후순위. 신뢰성 보장 한계.

### M4. Wikidata 9명 등록

**기대 효과**: AI 인용 시 의사 엔티티 reconciliation. Google Knowledge Panel 활성화. sameAs 5개+ 통과 자동.

**위험**: 의료법 §56② 4호 (비교광고) 충돌 가능성. **"권위자", "베스트" 표현 절대 금지**. 사실 기반 진술 (`Board-certified dermatologist`, `Member of Korean Dermatological Association`) 만 사용. P166 (수상) 은 학술상만, "베스트 의사" 미디어 선정 금지. 의사 verifiable references 부족 시 등록 거절 가능.

### 일반 회규 점검 (모든 변경 공통)

- **RLS/권한**: schema 헬퍼는 server-side only, viewer 무관 — 영향 없음
- **빌드/타입**: 기존 `Record<string, unknown>` 패턴 유지 시 안전
- **AggregateRating**: **절대 추가 금지** (의료법 §56② 2호 환자 후기·치료경험담)
- **비교 광고 schema**: 회피 (의료법 §56② 4호)

---

## Part 5. 운영자 결정 필요 항목

본 보고서가 단정하지 않은 항목입니다. 코드만으로 확인 불가하며 운영자가 직접 결정·입력 필요.

### 5-A. 법적 자문
- **변호사 의견서** — 비의료법인 (주식회사 진솔컴퍼니) 이 9명 의사 답변을 정리·노출하는 구조가 의료법 §56·§27 위반인지에 대한 의견서. 9개 보고서 모두 가장 먼저 처리 권고. `admedical.org` 또는 의료광고 전문 변호사.
- **AI 사용 정책 옵션 결정** — Editorial Policy 의 AI 정책. 옵션 A (보수적 — "AI 생성 텍스트 게재 안 함") / 옵션 B (실용 — "AI 보조 + 의사 검수 후 게재"). 부록 5-19 참조.

### 5-B. 회사 정보
- 회사 주소 (사업자등록증상 주소) — Contact 페이지·MedicalOrganization schema 보강용
- 회사 대표 (배정민 외 별도?) — About / Contact
- 회사 전화번호 (선택) — ContactPoint schema

### 5-C. 9명 의사 데이터
- 9명 의사의 실제 ORCID iD
- 9명 의사의 Google Scholar profile URL
- 9명 의사의 PubMed Author Search URL
- 9명 의사의 학회 발급년도 (전문의 자격)
- 9명 의사의 제약사·기기사 자문 관계 (Disclosures 페이지)
- 9명 의사의 Wikidata Q-ID (등록 후)
- 9명 의사의 출판물 5–10개 PMID
- 9명 의사 동의서 (외부 sameAs 게재 / Wikidata 등록 / 학력·면허 공개)

### 5-D. procedures 마스터 데이터
- 30~50개 핵심 시술의 부작용·금기 검수 (9명 의사 합의)
- 시술 영문명·SNOMED-CT 코드·Wikidata Q-ID
- 시술별 회복 기간·시술 시간·마취 종류

### 5-E. 인프라
- Vercel Analytics + Speed Insights 설치 여부
- GA4 property ID + Naver Analytics property ID
- Naver Search Advisor verification 코드
- Google Search Console verification 코드
- Bing Webmaster verification 코드
- Wikidata 신청 시 어떤 의사부터 진행할지 (verifiable references 충분한 의사 우선)

### 5-F. 운영 정책
- 의학 검수자 분리 워크플로 — 9명 의사가 상호 검수하는 방식 (예: 의사 본인 답변은 다른 8명 중 1명이 검수)
- 정정 정책 — 30일 공개 vs 60일 공개
- AI 인용 추적 도구 선정 — Otterly.AI ($29/월) vs 자체 수동 (무료)
- 8 Levels 캘린더 — 누가 담당? (운영팀 1명 또는 9명 의사 로테이션)

### 5-G. 기술 결정
- robots.ts 환원 시점 — 2026-06-01 정시 자동 또는 수동 PR
- ISR 도입 — Phase 1 (Week 3) vs Phase 2 (Week 7)
- URL 구조 — 현 `/doctors/{slug}/{year}/{post-slug}` 유지 (8/8 합의) vs 체크리스트 권장 `/procedures/{slug}/q/{question-slug}` 도입 (0/8)
- 영문 페이지 도입 시점 — Phase 4 (Month 7+) 또는 영구 미도입

---

## Part 6. 90일 실행 로드맵 (요약)

상세 일정 + 통과 기준 + 담당은 부록 5-26 참조.

### Phase 0 (Week 1–2, 2026-06-01 ~ 06-14) — 베타 락다운 환원 + 법적 컴플라이언스 🔴
- **Go/No-Go**: 변호사 의견서 또는 admedical.org 자문 결과 "본 구조는 의료법 §56·§27 위반 아님" 명시
- 9명 의사 동의서 갱신, procedures 마스터 30~50개 시드, robots.ts 환원 PR 준비, 신뢰 페이지 5종 초안 작성

### Phase 1 (Week 3–6, 2026-06-15 ~ 07-12) — 기술 인프라 🔴
- **통과 기준**: LCP < 2.5s, INP < 200ms, CLS < 0.1 (75 percentile)
- robots/sitemap/RSS/llms.txt/.well-known/* 풀세트 적용
- Naver/Google/Bing Webmaster 3개 등록 + sitemap·RSS 제출
- 신뢰 페이지 5종 + About 보강 배포
- Physician hasCredential / Article schema / publishingPrinciples 보강

### Phase 2 (Week 7–12, 2026-07-13 ~ 08-23) — 콘텐츠 시드 🔴
- **통과 기준**: 발행 의사 글 200건+, 모든 페이지 schema 유효, 부작용 자동 삽입 + 검수자 + 검수일 + 출처 4종 표시
- procedures 자동 삽입 컴포넌트 적용
- Quick Answer (cards.summary) 컬럼 + 의사 작성 가이드 GEO 패턴 배포
- 4-date 모델 본문 노출
- AI 글 초안 워크플로 가동 → 매월 5-10건 신규 답변

### Phase 3 (Week 13–24, 2026-08-24 ~ 11-15) — 엔티티·권위 🟠
- **통과 기준**: 9명 중 4명+ Wikidata 활성화, 핵심 100 키워드 중 30% Google 1페이지, AI Overviews 인용 5+건
- Wikidata 9명 등록 + sameAs 자동 연동
- 외부 권위 시그널 (학회 발표·매체 칼럼 분기당 의사당 1건+)
- Otterly.AI baseline 도입 + 200 키워드 셋팅
- 매주 FAQ gap 분석 → 5-10건 신규 답변
- 매분기 18~24개월 페이지 재검수

### Phase 4 (Month 7–12, 2026-12 ~ 2027-05) — 최적화·확장 🟡
- AI 인용률 분기 5%씩 상승 목표
- 시술 Pillar 페이지 (`/procedures/{slug}`) 신설 검토
- 영문 페이지 검토 (대표 시술, 별도 도메인 + 국내 IP 차단)
- WCAG 2.2 AA 자동 점검 CI 통합 (axe-core)
- CSP enforce 전환 (Report-Only 6개월 검토 후)
- 사전심의필 readiness 활성 (트래픽 10만+ 도달 시)

---

## Part 7. 부록 문서

**모든 코드 초안·신뢰 페이지 콘텐츠·AI 봇 모니터링 스크립트·키워드 카테고리 등 26개 초안 문서**는 별도 부록 파일에 정리되어 있습니다:

> `pibutenten-app/docs/reports/2026-05-28-SEO-AEO-GEO-초안문서부록.md`

부록은 다음 25개 섹션 (5-1 ~ 5-26) 으로 구성됩니다:

| # | 제목 |
|---|---|
| 5-1 | 공개 후 robots.ts 풀버전 (3-tier AI 크롤러 정책) |
| 5-2 | 개선된 sitemap.ts + sitemap index 분리 패턴 |
| 5-3 | llms.txt 공개 후 풀버전 (llmstxt.org) |
| 5-4 | llms-full.txt 라우트 설계 |
| 5-5 | RSS Feed 라우트 (`app/rss.xml/route.ts`) |
| 5-6 | 네이버 사이트 인증 (메타태그·HTML·등록 절차) |
| 5-7 | Bing / Daum / Zum 등록 가이드 |
| 5-8 | vercel.json / next.config.ts 보안 헤더 풀세트 |
| 5-9 | `/.well-known/security.txt` (RFC 9116) |
| 5-10 | `/.well-known/agent-card.json` 초안 |
| 5-11 | `/.well-known/ai-policy.json` 초안 (선택) |
| 5-12 | 의사 프로필 JSON-LD 풀세트 |
| 5-13 | 의사 글 JSON-LD 풀세트 |
| 5-14 | 토픽 hub JSON-LD |
| 5-15 | 홈+About JSON-LD 보강 |
| 5-16 | 답변 페이지 AEO 시맨틱 HTML |
| 5-17 | 부작용·면책 자동 삽입 (procedures 테이블 + 컴포넌트 + 문구) |
| 5-18 | 의사 작성자 가이드 GEO 강화 체크리스트 |
| 5-19 | 신뢰 페이지 신규 풀세트 (Contact / Editorial Policy / Medical Review / Corrections / Disclosures / About 보강) |
| 5-20 | Wikidata 9명 등록 가이드 (의료법 §56② 회피 필드 표) |
| 5-21 | AI 봇 모니터링 (Vercel logs grep + 주별 리포트) |
| 5-22 | AI 인용 추적 도구 선정 + 200 키워드 카테고리 |
| 5-23 | 의료법 §57 사전심의필 readiness (CMS 컬럼) |
| 5-24 | 네이버 키워드 리서치 워크플로우 (450 baseline + 5탭 매핑) |
| 5-25 | 운영 거버넌스 8 Levels 캘린더 |
| 5-26 | 90일 실행 로드맵 상세 (Phase 0~4) |

---

## 마무리

본 보고서는 **8개 독립 분석가**의 의견을 교차검증한 결과로, 합의된 항목은 강한 권고로, 1~3개 보고서에만 등장한 항목은 참고 권고로 분류했습니다.

피부텐텐의 출발선은 동급 한국 의료 정보 사이트 대비 **상당히 우수**합니다. 베타 종료 후 1~2주 내 처리해야 할 12개 🔴 CRITICAL 항목을 적용하면, 핵심 100 키워드 GSC 노출과 AI 답변 엔진 인용의 기본 인프라가 완성됩니다.

가장 큰 미해결 위험은 **외부 권위 (earned media) 81.9% 비중** (University of Toronto 2025 연구) 으로, 9명 의사의 학회 발표·의학신문 기고를 분기 캘린더로 시스템화하지 않으면 onsite SEO 만으로는 한계가 분명합니다.

**다음 행동**:
1. 본 보고서 + 부록 검토 (운영자)
2. 변호사 의견서 의뢰 (Phase 0 Day 1 — 가장 시급)
3. Part 5 운영자 결정 항목 답변 정리
4. Phase 0 ~ Phase 1 작업을 별도 PR 단위로 분할하여 코드 적용

작성: 8개 독립 분석가 + 통합 에디터
검증: 8/8 합의 / 6-7/8 합의 / 4-5/8 합의 / 1-3/8 단독 으로 분류
