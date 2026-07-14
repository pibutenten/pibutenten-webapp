# 의료 Q&A 사이트 SEO · EEAT · PubMed · 검수날짜 시스템 — 개발자 핸드오프

> 이 문서는 피부텐텐(피부과 전문의 Q&A 검색 서비스)에서 실제 운영 중인 4개 시스템을
> **다른 웹사이트에 이식**하려는 개발자를 위해 정리한 기술 명세입니다.
> 원본 스택은 **Next.js(App Router) + Supabase(PostgreSQL) + Anthropic Claude API** 이지만,
> 아래 패턴(schema.org 구조, 날짜 파생 규칙, PubMed 파이프라인)은 프레임워크 무관하게 재현 가능합니다.
> 코드/스키마는 원문 그대로, 설명은 한국어로 작성했습니다.

## 목차
1. [Q&A 카드 SEO · AEO · GEO 최적화](#1-qa-카드-seo--aeo--geo-최적화)
2. [Q&A 페이지 meta description](#2-qa-페이지-meta-description)
3. [원장(의사) 프로필 EEAT 신호](#3-원장의사-프로필-eeat-신호)
4. [PubMed 참고문헌 자동 첨부 알고리즘 · API](#4-pubmed-참고문헌-자동-첨부-알고리즘--api)
5. [작성일 · 검수일 · "마지막 검수일 = 배포일" 시스템](#5-작성일--검수일--마지막-검수일--배포일-시스템)
6. [환경변수 · 파일 맵 · 이식 체크리스트](#6-환경변수--파일-맵--이식-체크리스트)

---

## 설계 3대 원칙 (먼저 이해할 것)

이 시스템 전반을 관통하는 세 가지 원칙입니다. 이식할 때 이 원칙만 지켜도 90%는 재현됩니다.

1. **전역 `@id` 앵커 패턴** — 발행사(`#organization`), 사이트(`#website`), 저자(`/doctors/{slug}#person`) 같은 핵심 엔티티는 **딱 한 곳에서 정의**하고, 나머지 모든 페이지·구조화 데이터는 그 `@id`를 **참조만** 합니다. 중복 정의 0 → 검색엔진이 엔티티를 하나로 병합해 신뢰 그래프를 형성합니다.
2. **서버 렌더 + 클라이언트 오버레이 분리** — JSON-LD `<script>`, `generateMetadata`, canonical, robots는 전부 **서버 컴포넌트**가 방출하고, 인터랙티브 UI(앱 셸)는 그 위에 클라이언트로 얹습니다. 크롤러는 항상 서버 HTML의 구조화 데이터를 읽습니다.
3. **표시/색인의 단일 진실원(SSOT)** — 날짜는 `COALESCE(reviewed_at, created_at)` 하나, 저자는 `#person` `@id` 하나, 참고문헌은 `pubmed_refs` 컬럼 하나. 화면·JSON-LD·sitemap·RSS가 모두 같은 원천을 씁니다.

---

## 1. Q&A 카드 SEO · AEO · GEO 최적화

의사 Q&A 글 페이지(`/doctors/{slug}/{year}/{post-slug}`)에 적용된 최적화 설정 전체입니다.

### 1.1 안전 직렬화 헬퍼

모든 JSON-LD는 `dangerouslySetInnerHTML`에 넣기 전 XSS-안전 직렬화를 거칩니다.

```ts
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
```

### 1.2 전역 JSON-LD (모든 페이지 공통)

레이아웃(`app/layout.tsx`)이 `<head>`에 딱 한 번 주입합니다. 이후 모든 페이지의 구조화 데이터는 여기 정의된 `@id`를 참조만 합니다.

```ts
{
  "@context": "https://schema.org",
  "@graph": [
    // 1) 발행사 — 안정적 @id 앵커 + EEAT 책임정책 링크
    {
      "@type": ["Organization", "MedicalOrganization"],
      "@id": "https://example.com/#organization",
      name: "브랜드명",
      alternateName: ["English Name"],
      url: "https://example.com/",
      logo: { "@type": "ImageObject", url: "https://example.com/logo.png" },
      sameAs: ["https://www.youtube.com/@channel", "https://www.instagram.com/handle"],
      publishingPrinciples: "https://example.com/editorial-policy",  // EEAT
      ethicsPolicy:         "https://example.com/editorial-policy",
      correctionsPolicy:    "https://example.com/corrections",
      ownershipFundingInfo: "https://example.com/disclosures",
      medicalSpecialty: ["Dermatology"],
    },
    // 2) 사이트 + Sitelinks SearchBox (검색 결과 검색창 노출)
    {
      "@type": "WebSite",
      "@id": "https://example.com/#website",
      url: "https://example.com/",
      name: "브랜드명",
      inLanguage: "ko-KR",
      publisher: { "@id": "https://example.com/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: "https://example.com/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    // 3) (선택) 지점/그룹 MedicalOrganization
  ],
}
```

### 1.3 Q&A 페이지 JSON-LD `@graph` (핵심)

`buildJsonLd(card, ...)`가 반환하는 `@graph`는 **4종 노드**로 구성됩니다: ① `MedicalWebPage`+`QAPage` 본체, ② 답변 의사 `Person`(참조형), ③ `BreadcrumbList`, ④ 그 의사의 단일 `MedicalClinic`.

```ts
// ① QAPage 본체 — 이중 타입 (MedicalWebPage + QAPage)
{
  "@type": ["MedicalWebPage", "QAPage"],
  "@id": `${url}#webpage`,
  url,
  name: card.title,
  inLanguage: "ko-KR",

  // --- 날짜 3종 (§5에서 파생 규칙 상술) ---
  datePublished: displayDate,               // = reviewed_at ?? created_at
  dateModified:  card.updated_at ?? displayDate,   // AI freshness 신호
  lastReviewed:  displayDate.slice(0, 10),  // YYYY-MM-DD, 의료 검토일 (YMYL)
  reviewedBy:    { "@id": `${SITE}/doctors/${slug}#person` },  // 검토자 = 그 의사

  isPartOf:  { "@id": `${SITE}/#website` },
  publisher: { "@id": `${SITE}/#organization` },  // 전역 노드 참조
  primaryImageOfPage: { "@type": "ImageObject", url: `${SITE}/og/${slug}.png` },

  // --- AEO: 음성/AI 어시스턴트가 대표 답변을 낭독하도록 첫 문단 지정 ---
  speakable: { "@type": "SpeakableSpecification", cssSelector: [".card-answer-speakable"] },

  // --- 질문/답변 본체 ---
  mainEntity: {
    "@type": "Question",
    name: card.title,
    text: card.title,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    answerCount: 1,
    upvoteCount: card.like_count ?? 0,
    dateCreated: displayDate,
    // ⚠ Question.author 는 의도적으로 생략 (질문=영상 유래 대표질문).
    //   답변자만 명시 → "자문자답 QAPage" 오인 방지.
    acceptedAnswer: {
      "@type": "Answer",
      text: answerText.slice(0, 4000),
      author: { "@id": `${SITE}/doctors/${slug}#person` },  // 답변 저자 = 그 의사
      dateCreated: displayDate,
      upvoteCount: card.like_count ?? 0,
      url,
      citation: [ /* PubMed 참고문헌 → ScholarlyArticle, §4.4 */ ],
    },
  },

  about: keywordsToAbout(card.keywords),    // 태그 → 의료 엔티티 타이핑 (아래)
  specialty: "https://schema.org/Dermatology",
  audience: { "@type": "MedicalAudience", audienceType: "Patient" },
  // video: {VideoObject} 조건부 첨부 (아래)
}
```

**`about[]` — 태그의 의료 엔티티 타이핑.** 카드 키워드(최대 5개)를 사전(`tag_dictionary`) 분류에 따라 타입이 다른 엔티티로 변환합니다.

```ts
function keywordToAboutSchema(keyword) {
  const category = categoryFor(keyword);              // 사전 조회
  const base = { name: keyword, alternateName: englishSlug };
  if (isProcedure(category))                          // 리프팅/레이저/필러 등
    return { "@type": "MedicalProcedure", ...base,
             procedureType: "https://schema.org/PercutaneousProcedure", bodyLocation: "Skin" };
  if (category === "concerns")                        // 피부고민
    return { "@type": "MedicalCondition", ...base };
  return { "@type": "Thing", ...base };               // 그 외
}
```

**`VideoObject` (영상 유래 Q&A일 때 조건부).** YouTube URL·타임스탬프(`?t=276s`)를 파싱해 `Clip.startOffset`(초 단위 숫자)으로 방출합니다.

```ts
medicalPage.video = {
  "@type": "VideoObject",
  name: videoName,
  embedUrl: `https://www.youtube.com/embed/${videoId}`,
  contentUrl: `https://youtu.be/${videoId}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
  uploadDate: v.upload_date,
  inLanguage: "ko-KR",
  hasPart: {                                    // 답변에 해당하는 구간
    "@type": "Clip", name: videoName,
    startOffset: 276,                            // 초(Number), ISO duration 아님
    url: `https://youtu.be/${videoId}?t=276s`,
  },
};
```

**`BreadcrumbList` (3번째 항목은 `name`만).** `/doctors/{slug}/{year}` 라우트가 없으므로 연도 항목에는 `item`(링크)을 넣지 않습니다(깨진 링크 방지).

```ts
{
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "브랜드명", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: `${docName} 원장`, item: `${SITE}/doctors/${slug}` },
    { "@type": "ListItem", position: 3, name: `${year}년` },      // name-only
    { "@type": "ListItem", position: 4, name: card.title },
  ],
}
```

**`Person`(참조형) + `MedicalClinic`.** 그래프 끝에 `worksFor`가 가리키는 `@id`가 같은 문서 안에서 해석되도록 실제 `MedicalClinic` 노드를 동봉합니다. (풀세트 Person 노드는 프로필 페이지에만 있음 → §3.2)

### 1.4 `<head>` 메타 태그 (`generateMetadata`)

```ts
export async function generateMetadata({ params }) {
  const card = await fetchQaByDoctorYearSlug(slug, year, postSlug);
  if (!card) return { title: "브랜드명", robots: { index: false } };   // soft-404 방어
  const canonical = `${SITE}/doctors/${slug}/${year}/${encodeURIComponent(postSlug)}`;
  return {
    title: card.title,                          // 템플릿 "%s | 브랜드명" → 주제 first, 브랜드 last
    description: metaDescriptionFromBody(card.body),   // §2
    alternates: { canonical },
    ...buildSocialMeta({ title: card.title, description: desc, canonical,
                         ogImage: `/og/${slug}.png`, ogType: "article" }),
  };
}
```

- **title 템플릿**: 전역 레이아웃에서 `template: "%s | 브랜드명"`. 콘텐츠 페이지는 **주제(키워드) first, 브랜드 last**, 홈만 brand-first.
- **`metadataBase`**: `new URL(SITE_URL)` — 상대 OG/canonical URL을 절대화.
- **robots(색인) 규칙**: 기본은 색인 허용. `noindex`가 되는 경우 = ① 잘못된 연도, ② 카드 없음(soft-404 방어), ③ 모더레이션 숨김 placeholder.
- **OG/Twitter**: `openGraph`(type=`article`, `siteName`·`locale`을 매 페이지 재선언 — Next의 per-key 덮어쓰기 회피), `twitter`(`summary_large_image`). OG 이미지는 의사별 `/og/{slug}.png`.
- **검색엔진 verification**: Google/Naver/Bing 토큰을 환경변수로 주입하되 **값이 빈 문자열이면 태그 자체를 생략**(`<meta content="">` 오탐 방지).

### 1.5 AEO / GEO (AI 답변엔진 · 생성엔진 최적화)

| 설정 | 내용 |
|---|---|
| **`speakable` DOM 훅** | JSON-LD의 `cssSelector: [".card-answer-speakable"]`이 실제 DOM 첫 답변 문단에 붙는 클래스. 음성/AI가 리드 답변을 집어감. "더보기" 라벨은 CSS `::after`로 렌더 → LLM이 본문에 섞어 읽지 않음. |
| **`public/llms.txt` · `llms-full.txt`** | LLM용 큐레이션 가이드(llmstxt.org 표준). 핵심 링크·정책 페이지·**인용 정책**(의사 글 인용 허용 / 회원 글 인용 금지)·의료 면책·운영주체 정보. `llms-full.txt`는 정책 전문 포함 확장판. |
| **`public/.well-known/ai-policy.json`** | AI 선호 선언(draft-ietf-aipref-vocab). `training/tdm/search/answerWithCitation: allow`, 봇별 allow/deny, 회원 콘텐츠 학습·인용 제외 경로. |
| **`public/.well-known/agent-card.json`** | 기계판독 에이전트 카드: 사이트 정체성, `ymyl: true`, endpoints(sitemap/robots/rss/llmsTxt/search), 방출하는 structuredData 타입 목록, **citationPolicy**(허용/금지 경로, `requireAttribution`, `attributionFormat`, `maxQuotedChars`, `requireDisclaimerInclusion`), 의사 명단(한/영 이름·프로필 URL). |
| **robots 2-tier AI 허용목록** | (§1.7) 검색봇 + AI 인용봇 + 주요 학습봇 허용, 저가치 스크래퍼만 차단, catch-all `*`은 미래 봇 기본 허용. |
| **IndexNow 푸시** | 매일 Cron이 최근 26h 발행/수정된 Q&A URL을 Bing/Yandex/Seznam/Yep에 푸시. `CRON_SECRET` bearer 인증, `public/{INDEXNOW_KEY}.txt`로 소유증명. |

### 1.6 URL · 슬러그 전략

- **URL 규칙(TS SSOT `getQaUrl`)**: 의사 Q&A → `/doctors/{slug}/{year}/{post_slug}`(키워드 슬러그, 연도 유지) · 시술 리포트 → `/reports/{en}` · 회원 글 → `/{handle}/{shortcode}`(8자 base58). 알림 트리거가 INSERT 시점에 URL을 영구 저장하므로 동일 규칙의 **SQL SSOT**(`card_public_url`)와 한 커밋에서 동기화.
- **키워드 슬러그 생성(`buildSlug`)**: 카드의 한국어 키워드를 사전 스냅샷으로 영문 변환 → 목표 3단어(최대 4), 중복 단어 제거, 소문자 하이픈 연결, 50자 컷. 예: `['쥬브젠','효과','지속기간'] → 'juvgen-effect-duration'`. 검증 정규식 `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`, 충돌 시 `-2`, `-3` 접미.
- **발행 시 슬러그 정책**: 관리자가 슬러그를 명시 입력하면 **자동 접미 안 함** — 형식오류·충돌이면 발행 전체를 HTTP 409로 중단시켜 의도치 않은 URL 방지. 빈칸이면 자동 생성.
- **리다이렉트**: 구 도메인/구 슬러그는 하드코딩 301 맵으로 이관. `/reports`의 영문→한글 canonical 308은 미들웨어에서 처리(스트리밍 SSR에선 페이지 레벨 리다이렉트 불가).

### 1.7 sitemap · robots · RSS + ISR

| 자산 | 설정 |
|---|---|
| **Q&A 페이지 ISR** | `revalidate = 86400`(24h), `generateStaticParams=[]`(온디맨드), 쿠키리스 anon 클라 + `unstable_cache(tags:["qa-content"])`. 발행 시 `revalidateTag("qa-content")`로 즉시 무효화. |
| **sitemap.ts** | `revalidate=3600`. 정적 라우트 + 의사 프로필(`is_listed=true`만) + 발행 Q&A(`status=published` AND `category='qa'` AND 의사 `is_listed`, `lastmod = reviewed_at ?? created_at`) + 색인가능 토픽 허브(≥4글) + 리포트 앵커(후기≥4). DB 실패 시 정적 라우트로 폴백. |
| **robots.ts** | **HOLD 스위치**: `SITE_PUBLIC !== "true"`면 fail-safe 전체 `Disallow: /`. 공개 시 2-tier(검색봇+AI인용봇+학습봇 허용 / 저가치 스크래퍼 4종 차단 / `*` 기본 허용). 운영 경로(`/api /admin /auth /onboarding …`)는 공통 차단. |
| **rss/route.ts** | `revalidate=1800`(네이버 freshness). 최신 의사 Q&A 50건, `pubDate = reviewed_at ?? created_at`, `<dc:creator>` 저자명. `/rss.xml`로 노출. |
| **토픽 허브 JSON-LD** | `/topics/{tag}`는 `CollectionPage` + **`FAQPage`**(각 카드 Question/acceptedAnswer 배열, `author`=의사 Person) + BreadcrumbList. `CollectionPage.mainEntity`는 `ItemList` + `itemListOrder: ItemListUnordered`(피드 셔플과 canonical 충돌 방지). |

---

## 2. Q&A 페이지 meta description

### 2.1 본문에서 자동 생성 (문장경계 트림)

의사 Q&A의 description은 답변 본문에서 마크다운을 제거하고 **문장 경계에서 ~150자로 트림**합니다. 단어 중간이 잘리지 않게 합니다.

```ts
function metaDescriptionFromBody(body: string, max = 150): string {
  const text = stripMarkdown(body).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  // 1순위: 문장 종결부호(.!?。…)로 끝나고 20자 이상이면 그 문장까지
  const sentence = slice.match(/^[\s\S]*[.!?。…](?=\s|$)/);
  let cut = (sentence && sentence[0].trim().length >= 20)
    ? sentence[0].trim()
    // 2순위: 마지막 공백(단어 경계)에서 컷
    : (slice.lastIndexOf(" ") > 0 ? slice.slice(0, slice.lastIndexOf(" ")) : slice).trim();
  return cut.length < text.length ? `${cut}…` : cut;
}
```

### 2.2 메타 작성 규칙 (프로젝트 표준)

description을 손으로 쓰거나 다른 페이지에 적용할 때의 규칙입니다.

- **title ↔ description 비중복**: title = 주제/질문, description = 답변/데이터. 같은 문구 반복 금지.
- **description에 브랜드명 반복 금지** (title 템플릿에 이미 있음).
- **수치는 전부 라이브 동적**: Q&A 수·후기 수·만족도·재시술%·전문의 수는 하드코딩 금지, DB 실시간 값.
- **금지 표현**: 최상급("최고", "1등"), 효과 단정, 후기 보증.
- 원장 글 description은 본문 문장경계 트림(위 §2.1)으로 단어 중간 잘림 방지.

> 이 규칙은 의료광고법(의료법 §56② 14금지) 회피와도 맞닿아 있어, 의료 도메인이면 특히 "효과 단정·최상급" 금지를 지켜야 합니다.

---

## 3. 원장(의사) 프로필 EEAT 신호

E-E-A-T(경험·전문성·권위·신뢰) 신호를 강화하기 위한 의사 프로필 설정입니다.

### 3.1 데이터 모델

의사 데이터는 두 소스로 분리합니다.

- **`doctors` 테이블**(운영 표): `id, slug, name, title, clinic, branch, intro, photo_url, sort_order, is_listed, is_affiliated, clinic_id, profile_data(JSONB)`.
- **`profiles` 테이블**(로그인/활동 신분): `doctor_id`(FK→doctors.id, 1:1)로 연결. 글·팔로우 주체는 profiles.id.
- 의사 **slug는 자동 생성이 아니라 이름의 로마자 표기를 수동 배정**한 고정값(예: `배정민 → bae-jungmin`). URL 안정성 보장.

**`profile_data`(JSONB) 확장 스키마** — 운영자가 관리 화면에서 입력하며, 각 필드가 구조화 데이터의 특정 속성으로 매핑됩니다.

```ts
type DoctorProfileData = {
  education?: string[];        // 학력      → alumniOf (EducationalOrganization)
  career?: string[];           // 경력      → 화면 표시
  expertise?: string[];        // 전문 분야 → knowsAbout
  memberOf?: string[];         // 추가 학회 → memberOf
  publications?: string[];     // 출판/저서 → 화면 표시
  youtube?; instagram?; blog?; threads?; clinicUrl?;   // → sameAs
  orcid?: string;              // ORCID iD  → identifier(PropertyValue) + sameAs
  googleScholarUrl?: string;   //           → sameAs
  pmids?: string[];            // 대표 논문 → ScholarlyArticle 노드(author=본인, 화면 비노출)
  societyRoles?: string[];     // 학회 임원 → memberOf(OrganizationRole)
  boardCertifiedYear?: number; // 전문의 취득연도 → hasCredential
};
```

### 3.2 의사 `Person` 노드 (핵심 — `Physician` 금지)

> **중요 설계 결정**: `@type`은 **`Person` 단독**. `Physician`/`IndividualPhysician`은 schema.org 트리상 Organization/LocalBusiness 계열이라 Google이 "개인"이 아닌 "업체"로 인식해 telephone/address/priceRange 경고를 냅니다. `Person`이 Google ProfilePage 공식 권장 타입이며 medicalSpecialty·jobTitle·knowsAbout·alumniOf·memberOf·hasOccupation·worksFor·sameAs가 모두 유효합니다.

**풀세트 빌더(`buildDoctorFull`) — 프로필 페이지에만 존재:**

```ts
{
  "@type": "Person",
  "@id": `${SITE}/doctors/${slug}#person`,   // ★ 전역 저자 앵커 (모든 글이 이 @id 참조)
  name: "배정민",
  alternateName: "Jungmin Bae",              // 한↔영 cross-reference
  jobTitle: title,
  medicalSpecialty: "https://schema.org/Dermatology",
  image: `${SITE}/og/${slug}.png`,
  url: `${SITE}/doctors/${slug}`,
  description: intro,
  hasOccupation: {                           // 자격 신호
    "@type": "Occupation", name: "피부과 전문의",
    occupationalCategory: "Dermatologist",
    qualifications: "대한민국 보건복지부 인증 피부과 전문의",
  },
  memberOf: [                                // 공통 학회 + 추가 학회 + 임원직
    { "@type": "Organization", name: "대한피부과학회" },
    { "@type": "Organization", name: "대한피부과의사회" },
    // ...profile_data.memberOf
    // ...{ "@type": "OrganizationRole", roleName: "..." }
  ],
  sameAs: [ "https://www.youtube.com/@channel", /* youtube/instagram/blog/orcid.org/scholar/clinic */ ],
  worksFor: { "@id": `${SITE}/#clinic-gangnam` },     // 소속 단일 지점 @id 참조
  knowsAbout: [ /* expertise[] */ ],
  alumniOf: [ { "@type": "EducationalOrganization", name: "..." } ],
  identifier: {                              // ORCID (있을 때) — 저자 disambiguation
    "@type": "PropertyValue", propertyID: "ORCID",
    value: "https://orcid.org/0000-0000-0000-0000",
  },
  hasCredential: {                           // 전문의 자격 (boardCertifiedYear 있을 때)
    "@type": "EducationalOccupationalCredential",
    credentialCategory: "피부과 전문의",
    recognizedBy: { "@type": "GovernmentOrganization", name: "대한민국 보건복지부" },
    dateCreated: "2015",
  },
}
```

**참조형 최소 빌더(`buildDoctorReference`) — 개별 글/목록용:** `@type:"Person", @id, name, alternateName, jobTitle, url`만. 개별 글은 이 최소형만 넣고 `@id`로 프로필 페이지의 풀세트 노드를 가리킵니다.

**저자-논문 그래프(`buildDoctorScholarlyArticles`):** `profile_data.pmids`를 화면 비노출 `ScholarlyArticle` 노드로 방출하고 `author: { "@id": #person }`로 연결. "이 의사 = 실제 PubMed 저자" 관계를 봇에 제공하는 GEO 신호.

### 3.3 저자 앵커 패턴 (글 ↔ 의사 연결)

**모든 Q&A 글이 하나의 `@id`(`#person`)를 두 곳에서 참조**해 저자=검수자를 일관 연결합니다.

- `acceptedAnswer.author` → `{ "@id": #person }` (답변자)
- `reviewedBy` → `{ "@id": #person }` (의료 검토자)

**화면 바이라인**도 동일 원천에서:

```tsx
const authorName = card.doctor?.name ?? card.author?.display_name ?? "회원";
const isDoctor   = !!card.doctor && !card.hide_doctor_credential;
// ...
{authorName}
{isDoctor && <span className={styles.verified}><IconVerified/> 피부과 전문의</span>}
```

- 의사면 바이라인 전체가 `/doctors/{slug}`로 링크 → 시각·구조 양쪽에서 의사 프로필로 수렴.
- `hide_doctor_credential`(cards 컬럼)이 true면 배지·링크 억제(회원 취급).

### 3.4 신뢰 페이지 세트 (Mayo/Cleveland Clinic 벤치마크)

정적 정보 페이지 세트가 EEAT의 T(신뢰)를 떠받칩니다. 각 페이지는 `AboutPage`/`ContactPage` JSON-LD로 `isPartOf:{@id:#website}` + `about:{@id:#organization}`를 참조하고, **발행사 노드의 `publishingPrinciples`/`correctionsPolicy`/`ownershipFundingInfo`가 이 페이지들을 기계 링크로 가리킵니다**(§1.2).

| 페이지 | EEAT 기여 |
|---|---|
| `/about` | 운영주체·참여 전문의 명단(Person @id)·MedicalOrganization 풀세트·의료 면책 |
| `/editorial-policy` | 6단계 워크플로(작성→의학검수→팩트체크→법령검수→게재→재검토)·출처 우선순위(Cochrane>메타분석>학회 가이드>1차논문)·AI 사용 정책 |
| `/medical-review` | "이 답변은 어떻게 검수되나" 6단계 + YMYL 근거 + 회원글 검수제외 명시 |
| `/corrections` | 30일 정정 이력 공개(Mayo 모델)·정정 사유 분류·요청 채널 |
| `/disclosures` | 이해상충 공개(비광고·비협찬) |
| `/disclaimer` | 의료 정보 면책·응급 대응 안내 |
| `/doctor-guidelines` | 의사 답변 작성 기준(광고 금지 등) |
| `/contact` | 회사 정보·문의 채널 매트릭스 |

> **의도된 설계(정책 문서 = 4-date, 개별 글 화면 = 대표 1개)**: `/medical-review`·`/editorial-policy` 정책 페이지는 **4-date 모델**(최초 작성일/의학 검수일/팩트체크일/최종 업데이트일)을 신뢰 신호로 **서술**하고, **개별 글 화면에는 대표 날짜 하나만** 노출합니다. 이것이 의도된 정책입니다(§5.5). 이식 시 정책 문서에는 4-date 개념을 두되 화면 표기는 1개로 유지하면 됩니다.

### 3.5 공개 3토글 모델 + 실제 404

의사 공개 여부를 3개 독립 필드로 관리합니다.

- **`clinic_id`** — 근무 지점(불변 참조)
- **`is_affiliated`** — 재직 여부(퇴사 시 off)
- **`is_listed`** — 공개 페이지 on/off (재직과 독립)

**`is_listed=false` 원장은 공개 표면 전체에서 실제 HTTP 404**로 처리합니다("부분 비공개"가 아니라 "없는 페이지"). 일관 적용 지점:

```
프로필 상세  : if (!doctor || !doctor.is_listed) notFound()
프로필 메타  : robots { index:false, follow:false }
의사 글 상세 : if (!doctor || !doctor.is_listed) → notFound()
목록/스키마  : .eq("is_listed", true)
sitemap      : !inner join + .eq("doctor.is_listed", true)
```

미들웨어 존재검사가 렌더 이전에 실제 404(+noindex)를 반환해 soft-404를 차단합니다(로그인/비로그인/크롤러 동일). 관리자 설정 API는 슈퍼관리자 전용이며, **slug 변경은 현재 `is_listed=false`일 때만 허용**(공개 URL 불변 보장, 공개 상태면 409 거부).

---

## 4. PubMed 참고문헌 자동 첨부 알고리즘 · API

### 4.1 파이프라인 개요

정적 큐레이션 매핑이 아니라 **2단계 LLM + 실시간 NCBI 검색** 하이브리드입니다.

```
[Stage 1: LLM]  유튜브 자막 → Q&A 카드 추출 + 카드별 pubmed_search_keywords(영문 검색어 2~3개)
      ↓
[실시간 검색]   각 카드 키워드 → NCBI esearch → efetch → 후보 논문 메타데이터
      ↓
[Stage 2: LLM]  카드 본문 + 후보 목록 → 가장 근거 되는 PMID 1개 선택 (또는 null)
      ↓
[저장]          선택 결과를 cards.pubmed_refs (jsonb[])에 저장
      ↓
[렌더 + 구조화]  "참고문헌" 목록(ScholarlyArticle microdata) + JSON-LD citation
```

- **매칭 방식**: 순수 키워드/태그 매칭 아님, 고정 PMID 목록 아님. LLM 키워드 생성 → 실시간 검색 → LLM 관련성 선택.
- **사람 개입**: 관리자가 Stage 2 결과를 검토·수정(후보 드롭다운에서 override 가능), 이후 수동 추가/편집도 가능(§4.5).

### 4.2 NCBI E-utilities API 설정

모든 NCBI 코드는 `lib/ai/pubmed.ts` 한 파일에 집중되며 프로젝트 종속성이 없어 거의 그대로 이식 가능합니다.

```ts
const NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// esearch — 키워드 → PMID 목록
const params = new URLSearchParams({
  db: "pubmed", term: query, retmax: String(retmax),
  retmode: "json", sort: "relevance",
});
if (apiKey) params.set("api_key", apiKey);
// GET `${NCBI}/esearch.fcgi?${params}` → json.esearchresult.idlist

// efetch — PMID들 → 초록 XML
const p2 = new URLSearchParams({
  db: "pubmed", id: pmids.join(","),
  rettype: "abstract", retmode: "xml",
});
if (apiKey) p2.set("api_key", apiKey);
// GET `${NCBI}/efetch.fcgi?${p2}` → XML (정규식 파서로 파싱, XML 라이브러리 불필요)
```

- **엔드포인트**: `esearch` + `efetch` 만 사용(프롬프트 문서에 `esummary` 언급이 있으나 **실행 코드는 미사용** — 오래된 문서 텍스트).
- **후보 오케스트레이션(`fetchPubmedCandidates`)**: 키워드 목록을 순회하며 esearch, **첫 히트가 나온 키워드의 후보를 반환**(merge 아님, first-hit-wins).
- **추출 필드**: `pmid, title, abstract, journal, year, authors_short, doi, publication_types[], mesh_terms[], pubmed_url, doi_url`.
  - title은 마침표로 정규화, journal은 `ISOAbbreviation` 우선 + Title-Case(JAMA/BMJ 등 keep-list), authors는 `LastName Initials` 3명 + "et al.", URL은 `pubmed.ncbi.nlm.nih.gov/{pmid}/` · `doi.org/{doi}`.
- **환경변수**:
  - `NCBI_API_KEY`(선택) — 없으면 ~3 req/s, 있으면 상향. NCBI 계정 설정에서 발급.
  - `ANTHROPIC_API_KEY`(필수) — Stage 1/2 LLM.
- **레이트리밋·복원력**: 호출 간 슬립 `110ms`(키 있음)/`400ms`(없음), `AbortController` 타임아웃(20/25s), 3회 백오프 재시도, 실패 시 `[]` 반환(throw 안 함 → PubMed 장애 시 "참고문헌 없음"으로 우아하게 강등). 앱 레벨 레이트리밋: step1 10/min, step2·publish 5/min.

### 4.3 선택 로직(Stage 2)

후보를 LLM에 보내기 전 초록 600자·mesh 8개로 트림합니다. 선택 기준(우선순위):

1. 직접 주제 일치(시술/부위/효과/부작용/기전이 title+abstract에)
2. 답변의 핵심 주장을 논문 results/conclusion이 실제 뒷받침
3. 연구 유형 랭킹: **체계적 리뷰/메타분석 > RCT > 임상시험 > 전향 코호트 > 증례군 > 리뷰 > 사설/증례보고**
4. 최신성(동점 시)
5. 한국산 제품엔 국내 기관 저자 약간 가점
6. **적합한 근거가 없으면 `null` 반환**("잘못된 인용보다 인용 없는 게 낫다")

`retmax=8`로 검색해 못 고르면 **20으로 자동 확장 후 1회 재시도**. LLM은 50~100자 한국어 근거(`reasoning`)도 반환하나 최종 사용자에게 노출 안 함(카드 meta 저장).

### 4.4 저장 · 렌더 · 구조화 데이터

**저장**: 단일 Postgres 컬럼 `cards.pubmed_refs` (타입 `jsonb[]`, 객체 배열). zod가 SSOT.

```ts
const PubmedRefSchema = z.object({
  pmid: z.string().max(20).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  title: z.string().max(1000).nullable().optional(),
  journal: z.string().max(300).nullable().optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  authors_short: z.string().max(2000).nullable().optional(),
  pubmed_url: z.union([z.string().url().max(2048), z.literal("")]).nullable().optional(),
  doi_url: z.string().url().max(2048).nullable().optional(),
}).strict();
```

- **정규화 필수**: NCBI 원본은 `year:"2024"`(문자열)·`doi_url:""`. 저장 전 `normalizePubmedRefWire()`로 `year`→int, `""`→null 변환. 카드당 최대 20개.

**화면 렌더**(`CardBody`): `pmid || doi` 있는 것만 "참고문헌"에 노출, 각 항목에 schema.org microdata.

```html
<cite itemScope itemType="https://schema.org/ScholarlyArticle">
  <a href={pubmed_url || doi_url} itemProp="url"><span itemProp="name">{title}</span></a>
  <span itemProp="author">{authors_short}</span>,
  <span itemProp="publisher">{journal}</span>
  (<span itemProp="datePublished">{year}</span>)
</cite>
```

**JSON-LD `citation`**(답변 노드에 첨부): `pubmed_refs`를 `ScholarlyArticle`로. **DOI URL을 canonical로 우선**, PubMed URL은 `sameAs`, `identifier: "PMID:..."`.

```ts
const citation = { "@type": "ScholarlyArticle" };
if (ref.title) citation.name = ref.title;
citation.url = ref.doi_url || ref.pubmed_url;      // DOI 우선(영구 식별자)
if (ref.doi_url && ref.pubmed_url) citation.sameAs = ref.pubmed_url;
if (ref.year) citation.datePublished = ref.year;
if (ref.journal) citation.publisher = ref.journal;
if (ref.authors_short) citation.author = ref.authors_short;
if (ref.pmid) citation.identifier = `PMID:${ref.pmid}`;
// 1개 → 객체, 여러개 → 배열 (둘 다 schema.org 유효)
```

### 4.5 수동 추가 경로 (비-AI)

관리자/의사가 **PubMed URL 또는 PMID를 붙여넣으면** `extractPmid()`가 파싱 → `POST /api/admin/draft/pubmed-by-pmid` → `efetch` → `normalizePubmedRefWire()` → canonical 객체 반환. 작성/편집 폼에서 재사용.

### 4.6 시술 사전(`tag_dictionary.pubmed_keywords`) — Stage 1·2 양쪽에 활성 (2026-07-14)

- `procedures_v6.json`의 각 시술 항목에 `pubmed`(한국어 시술→영문 검색어) 배열이 있고, 마이그레이션으로 `tag_dictionary.pubmed_keywords`(text[])에 적재, 빌드 스크립트가 `pubmed`(canonical 217개)/`pubmedLookup`(별칭 포함 477개) 맵으로 스냅샷(`tag-dictionary.generated.json`) 생성.
- **Stage 1 프롬프트 주입**: `step1.ts`가 `getPubmedDict()`(canonical 217개)를 markdown 표로 직렬화해 `step1_v5.md`의 `{{PUBMED_PROCEDURE_DICT}}` 자리에 주입. 하드코딩 시술표를 폐기하고 **DB 단일 SSOT**로 통일(새 시술은 DB 사전에만 추가하면 프롬프트에 자동 반영). placeholder 부재 시 no-op + `console.warn` 경고.
- **Stage 2 검색 보강**: `step2/route.ts`가 카드 태그(한글)를 `normalizeTags` 후 `pubmedKeywordsFor()`로 조회해 큐레이션 영문 검색어를 확보. `fetchPubmedCandidates`가 first-hit-wins이므로 **LLM 검색어를 앞, 사전 검색어를 뒤**에 두어 특이성 우선 + 무히트 시 결정론적 fallback. 사전 검색어는 카드당 `MAX_DICT_KEYWORDS=8`로 상한(PubMed 순차호출 폭주 방지).
- **이식 팁**: 태그 기반 결정론적 `태그 → pubmed_keywords → esearch` 경로만으로 Stage 1 키워드 생성을 완전히 대체할 수도 있으나, 여기서는 LLM 키워드(카드 특이적) + 사전(fallback) 하이브리드로 회귀 위험을 없앴습니다.

---

## 5. 작성일 · 검수일 · "마지막 검수일 = 배포일" 시스템

> 원장님이 말씀하신 "작성일·검수일이 있고, 마지막 검수일이 배포일이 되는" 시스템의 실제 구현입니다.
> **값을 3계층으로 구분**해 설명합니다: **(a) DB 직접 저장 · (b) 코드 파생·가공 · (c) 미기록**.

### 5.1 DB 컬럼 (a: 직접 저장)

| 컬럼 | 타입 | 성격 | 의미 |
|---|---|---|---|
| `created_at` | `timestamptz` | 실컬럼 | 생성 시각. 의사 Q&A는 **영상 게시일(KST 자정)로 명시 설정**. |
| `updated_at` | `timestamptz` | 실컬럼 | 마지막 수정. **BEFORE UPDATE 트리거**가 UPDATE마다 `now()`로 자동 갱신. |
| `reviewed_at` | `timestamptz NULL` | 실컬럼 | **의료 검토일 SSOT.** Q&A=검수 확정 시각, 일반글=NULL, 미발행=NULL. |

> `published_at`·`last_reviewed_at` 같은 별도 컬럼은 **존재하지 않습니다**. "발행일"·"마지막 검수일"은 별도 컬럼이 아니라 `reviewed_at` 기반 파생값입니다.

### 5.2 표시/색인의 단일 규칙 (b: 파생)

**모든 화면·JSON-LD·sitemap·RSS·정렬이 `COALESCE(reviewed_at, created_at)` 하나를 씁니다.**

```ts
const displayDate = card.reviewed_at ?? card.created_at ?? new Date().toISOString();
```

- Q&A는 `reviewed_at`(검수일)이 있으므로 → **검수일**이 표시/발행일이 됨.
- 일반글은 `reviewed_at=NULL` → 자동으로 `created_at` fallback.

**JSON-LD 날짜 매핑**(schema.org `MedicalWebPage`+`QAPage`):

| JSON-LD 필드 | 파생 공식 | 형식 |
|---|---|---|
| `datePublished` | `reviewed_at ?? created_at` | full ISO |
| `lastReviewed` | 위값 `.slice(0,10)` | `YYYY-MM-DD` |
| `dateModified` | `updated_at ?? datePublished` | full ISO (AI freshness 신호) |
| `reviewedBy` | `{ "@id": .../#person }` | 검수자 Person 참조 |

> **"마지막 검수일 = 배포일" (핵심)**: `datePublished`(발행일)와 `lastReviewed`(마지막 검수일)는 **같은 `displayDate`에서 파생**됩니다. Q&A는 `reviewed_at`(검수일)이 있으므로, 재검수(편집·재발행)할 때마다 **발행일과 마지막 검수일이 함께 그 시각으로 이동**합니다. 곧 마지막 검수일이 그대로 배포(발행)일입니다. (`dateModified`만 별개로 실제 마지막 수정 시각 `updated_at`을 씁니다.)

### 5.3 검수 → 발행 라이프사이클 (a: 쓰기 경로)

상태: `draft` / `pending_review` / `published` / `hidden` / `archived`.

**최초 발행**: `status='published'`로 INSERT하면 `reviewed_at = now()`, draft/pending이면 `NULL`. (`created_at`은 영상 게시일 KST 자정으로 명시.)

**재검수/편집 = 재발행** — "한 글자만 고쳐도 검수를 재확정한다" 정책:

```ts
// 편집 결과 최종 status가 published인 Q&A면 검수일을 now()로 갱신
if (finalType === "qa" && update.status === "published" && isRecentEnough) {
  update.reviewed_at = new Date().toISOString();
}
```

- 갱신 조건(AND): ① `type='qa'`(일반글은 절대 안 건드림, NULL 유지) ② 결과 status가 `published` ③ (프로젝트 한정 임시 게이트) `created_at >= 특정일`.
- **순서 의존성**: 이 로직은 **자동검수(screening) 강제 전환 이후**에 둡니다. 회원 편집이 의심 패턴에 걸려 `pending_review`로 강등되면 `=== 'published'` 조건에서 자연히 제외되어 검수일이 안 찍힙니다.
- `updated_at`은 별개로 항상 갱신(코드 + DB 트리거 이중 보증).

**"마지막 검수일이 발행일이 된다"의 실제 동작**: 재검수로 `reviewed_at`이 갱신되면 `datePublished`·`lastReviewed`·피드 정렬·NEW 배지·sitemap `lastmod`·RSS `pubDate`가 **전부 그 최신 검수일로 이동**합니다. 즉 재검수가 곧 "재발행"처럼 동작해 freshness를 끌어올립니다.

### 5.4 소비처 (b: 파생값이 쓰이는 곳)

| 소비처 | 사용 |
|---|---|
| 의사 Q&A JSON-LD | `datePublished`·`lastReviewed`(=`reviewed_at??created_at`), `dateModified`(=`updated_at`) |
| 카드 헤더/글 상세 표시 | 상대시간("3일 전") + 24h NEW 배지 (`reviewed_at??created_at`) |
| **sitemap `lastmod`** | `reviewed_at ?? created_at` |
| **RSS `pubDate`** | `reviewed_at ?? created_at` |
| 검색/피드 정렬 | `reviewed_at` 우선 정렬(시간감쇠·New부스트) |

### 5.5 계층 구분 요약 + 이식 주의 (c: 미기록)

- **(a) DB 직접 저장**: `created_at`, `updated_at`(트리거 자동), `reviewed_at`.
- **(b) 코드 파생·가공**: `displayDate`, JSON-LD `datePublished`/`lastReviewed`/`dateModified`, sitemap `lastmod`, RSS `pubDate`, 화면 상대시간·NEW 배지.
- **(c) 미기록**:
  - **"팩트체크일"** — 정책 페이지(`/medical-review`)에만 서술, **컬럼·JSON-LD·UI 어디에도 저장/렌더되지 않음**.
  - **개별 글의 "작성일 vs 검수일 분리 표기"** — 화면엔 단일 날짜(상대시간)만.
  - `published_at`/`last_reviewed_at` 전용 컬럼 부재(`reviewed_at`+COALESCE로 대체).

> **이식 함정 3가지**:
> 1. 백필을 **여러 UPDATE**로 하면 트리거가 `updated_at`을 `now()`로 덮어 CASE 분기가 어긋남 → **단일 UPDATE+CASE**로.
> 2. UTC/KST 경계에서 `created_at`·연도가 전날로 잡힘 → `+9h` 후 UTC 메서드 사용.
> 3. **정책 문서의 4-date는 개념 서술, 화면은 대표 1개 표시가 의도된 설계입니다.** 화면에도 4개를 실제로 분리 표기하려는 경우에만 `written_at`·`fact_checked_at` 등 컬럼을 신설하면 됩니다(현 시스템은 3컬럼·1표시일로 운영).

---

## 6. 환경변수 · 파일 맵 · 이식 체크리스트

### 6.1 환경변수

| 변수 | 용도 | 필수 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI 초안/PubMed 선택(Stage 1·2 LLM) | PubMed 자동첨부 시 필수 |
| `NCBI_API_KEY` | PubMed E-utilities 레이트리밋 상향 | 선택(없으면 ~3 req/s) |
| `SITE_PUBLIC` | robots HOLD 스위치(`"true"` 아니면 전체 차단) | 공개 운영 시 |
| `CRON_SECRET` | IndexNow Cron bearer 인증 | IndexNow 사용 시 |
| `INDEXNOW_KEY` | IndexNow 소유증명(`public/{key}.txt`) | IndexNow 사용 시 |
| Google/Naver/Bing verification 토큰 | 검색엔진 소유확인 메타(빈 값이면 미방출) | 선택 |

### 6.2 원본 핵심 파일 맵

| 관심사 | 원본 경로 |
|---|---|
| Q&A 페이지 메타+JSON-LD | `src/app/doctors/[slug]/[year]/[postSlug]/page.tsx` |
| 의사 프로필 JSON-LD | `src/app/doctors/[slug]/page.tsx` |
| 토픽 허브(FAQPage) | `src/app/topics/[tag]/page.tsx` |
| 스키마 빌더 | `src/lib/schema/{organization,doctor,clinic,procedure}.ts` |
| 의사 확장 프로필 | `src/lib/doctor-profile.ts` |
| JSON-LD 직렬화 / OG 메타 | `src/lib/json-ld.ts` / `src/lib/og-meta.ts` |
| 전역 메타+JSON-LD 주입 | `src/app/layout.tsx` |
| sitemap / robots / RSS | `src/app/{sitemap.ts, robots.ts, rss/route.ts}` |
| NCBI 클라이언트 | `src/lib/ai/pubmed.ts` |
| PubMed Stage 1/2 | `src/lib/ai/{step1,step2}.ts` + `prompts/{step1_v5,step2_v2}.md` |
| PubMed 발행/수동추가 | `src/app/api/admin/draft/{publish,step2,pubmed-by-pmid}/route.ts` |
| pubmed_refs 스키마/정규화 | `src/lib/schema/api/articles.ts` |
| 참고문헌 렌더(microdata) | `src/components/card/CardBody.tsx` |
| 슬러그 생성 | `src/data/procedure-mappings/slug-mapping.ts` |
| 카드 URL SSOT | `src/lib/card-url.ts` (+ SQL `card_public_url`) |
| AEO/GEO 정적 파일 | `public/llms.txt`, `public/llms-full.txt`, `public/.well-known/{ai-policy,agent-card}.json` |

### 6.3 최소 이식 체크리스트

1. `SITE_URL` SSOT + `jsonLdString` 직렬화기.
2. 전역 레이아웃: Organization+WebSite(SearchAction) 안정 `@id` 주입, title 템플릿, `metadataBase`, OG/Twitter 기본, env-gated verification.
3. 글 라우트: `generateMetadata`(title·문장경계 트림 description·canonical·OG·not-found noindex) + 서버렌더 `<script type="application/ld+json">`에 `@graph`(MedicalWebPage+QAPage, speakable, Question/acceptedAnswer, citation, VideoObject+Clip, Person 참조+worksFor, BreadcrumbList, 참조 업체 노드). speakable CSS 클래스를 실제 첫 답변 문단에 부착.
4. 토픽/컬렉션 라우트: CollectionPage + FAQPage(author 포함).
5. 저자/프로필 라우트: 풀세트 `Person`(절대 `Physician` 금지) + credentials/education/society/ORCID/PubMed 논문 노드.
6. 날짜: `created_at`/`updated_at`(트리거)/`reviewed_at` 3컬럼 + 모든 표시·정렬·sitemap·RSS에서 `COALESCE(reviewed_at, created_at)` 단일 규칙. 발행 시 `reviewed_at=now()`, 편집·재발행 시 재설정(screening 뒤에 배치).
7. PubMed: `pubmed.ts` 이식(esearch+efetch+정규식 파서+throttle/retry) + 키워드 생성(LLM 또는 사전) + 선택(LLM, 후보 트림·null 허용·8→20 자동확장) + `jsonb[]` 저장(year→int, ""→null 정규화) + microdata/JSON-LD `citation`(DOI 우선) + 수동 add-by-PMID 엔드포인트.
8. sitemap/robots(2-tier AI 허용목록+HOLD)/RSS/IndexNow + `llms.txt`·`ai-policy.json`·`agent-card.json`.

### 6.4 이식 시 알아둘 문서-코드 불일치 (원본에 실재)

1. **`lastReviewed`(마지막 검수일) = `datePublished`(발행일)**, 둘 다 `reviewed_at ?? created_at`에서 나옵니다 — 즉 "마지막 검수일 = 배포일"이 맞습니다. (옛 메모가 원천 컬럼을 `updated_at`으로 적었으나, 현재 코드는 `reviewed_at` 기반이라는 점만 갱신된 것입니다.)
2. 정책 페이지의 **4-date 모델은 개념 서술**이고 개별 글 화면은 대표 1개 노출 — 이것이 의도된 설계입니다.
3. PubMed 선택 프롬프트 문서에 `esummary` 언급이 있으나 **실행 코드는 esearch+efetch만** 사용합니다.
4. 시술 사전의 `pubmed_keywords`는 **Stage 1 프롬프트 주입 + Stage 2 검색 fallback 양쪽에 연결**되어 있습니다(2026-07-14 배선, §4.6). Stage 1 하드코딩 시술표는 폐기하고 DB 사전을 SSOT로 통일했습니다.

---

*본 문서는 피부텐텐 운영 코드 조사(2026-07-14) 기준으로 작성되었습니다. 코드 변경 시 해당 섹션을 갱신하십시오.*
