# 피부텐텐(Pibutenten) SEO · AEO · GEO 통합 최적화 개발 요청서

> **버전**: 2.0 (최종 결정 반영)
> **현재 도메인**: https://pibutenten-webapp.vercel.app *(한 달 내 자체 도메인으로 이전 예정)*
> **작성일**: 2026-05-07
> **사이트 성격**: 피부과 전문의 + 일반 회원이 함께 활동하는 카드 기반 SNS Q&A 플랫폼
> **분류**: YMYL (Your Money or Your Life) — 의료/건강
> **기술 스택**: Next.js + Vercel
> **별도 프로젝트(차후)**: 스킨부스터 미디어 채널, 리프팅 미디어 채널 *(이 문서 범위 외 — 차후 별도 진행)*

---

## 0. 핵심 정체성 + 한 줄 요약

피부텐텐은 **카드 기반 의료 SNS**입니다 (Threads, Instagram 형태). 블로그·매거진식 long-form 콘텐츠는 도입하지 않고, 깊이 있는 콘텐츠는 향후 별도 미디어 채널에서 다룰 예정. 따라서 이 문서는 **SNS 정체성 강화 + 카드 시스템 + 외부 링크 공유 + Q&A 콘텐츠 SEO 최적화**에 집중.

콘텐츠 형식(질문→직답 Q&A 구조)은 AEO/GEO에 거의 이상적이지만, 현재 구현이 그 가치를 검색엔진과 AI에 전달하지 못하는 상태. 핵심 차단 요소는: (1) 개별 Q&A URL 부재 (2) JSON-LD 구조화 데이터 부재 (3) 페이지별 메타데이터 차별화 부재. 이 문서로 해결.

---

## 1. 우선순위 매트릭스

| 순위 | 항목 | 영향 영역 | 난이도 |
| --- | --- | --- | --- |
| **P0** | §2 분리 namespace + 개별 글 영구 URL | SEO · AEO · GEO 전부 | 중 |
| **P0** | §3 페이지별 동적 메타데이터 + OG 정책 | SEO · 클릭률 · SNS 공유 | 하 |
| **P0** | §4 JSON-LD 구조화 데이터 | AEO · GEO 인용률 | 중 |
| **P0** | §5 sitemap.xml / robots.txt / llms.txt | SEO 색인, AI 크롤러 | 하 |
| **P0** | §6 자체 도메인 마이그레이션 + 301 + canonical | SEO 권위 | 중 |
| **P0** | §11 외부 링크 공유 카드 기능 | SNS 핵심 + 미래 미디어 채널 연결 | 중 |
| **P1** | §7 E-E-A-T 강화 — 전문의 프로필 | YMYL 신뢰도 | 중 |
| **P1** | §8 태그 중복 출력 버그 수정 | 스팸 신호 제거 | 하 |
| **P1** | §9 UGC와 전문의 답변 분리 | 의료 신뢰도 · 법적 리스크 | 중 |
| **P2** | §10 태그 페이지 자동 운영 | Topic 구조 | 하 |
| **P2** | §12 시맨틱 HTML / 헤딩 위계 | 접근성 · SEO | 하 |
| **P2** | §13 이미지 최적화 | SEO · 성능 | 하 |
| **P2** | §14 Core Web Vitals | 랭킹 시그널 | 중 |
| **P2** | §15 추가 사항 (Breadcrumb, 404, Naver, GA4) | UX · SEO | 하 |
| **P3** | §16 의료광고법 컴플라이언스 + 면책 | 법적 리스크 | 중 |

---

## 2. [P0] URL 구조 — 분리 namespace + 자동 슬러그

### 2-1. 결정된 URL 구조

```
/                                                              ← 홈 피드
/feed                                                          ← 전체 피드 (모든 글 집계)
/dermatologists                                                ← 인증 전문의 일람
/dermatologists/{doctor-slug}                                  ← 의사 프로필
/dermatologists/{doctor-slug}/{year}                           ← 의사 연도 아카이브
/dermatologists/{doctor-slug}/{year}/{post-slug}               ← 의사 글 (canonical)
/users/{user-slug}                                             ← 회원 프로필
/users/{user-slug}/{year}/{post-slug}                          ← 회원 글 (noindex)
/tag/{tag-slug}                                                ← 태그 페이지 (자동)
/search?q={query}                                              ← 검색 결과 (noindex)
```

**핵심 원칙**:
- 의사와 회원의 **namespace 분리** (`/dermatologists/` vs `/users/`)
- URL은 **slug only** (ID 없음, 자동 생성)
- 연도는 **4자리** path segment
- 모든 path는 **소문자 + 하이픈** (언더스코어 금지)

### 2-2. 의사 슬러그 명단 (9명 — 확정)

**규칙**: 성-이름 순 + 하이픈 구분 (lastname-firstname)

| # | 영문 표기 | 한글 (추정) | URL slug |
|---|---|---|---|
| 1 | Jongsic Kim | 김종식 | `kim-jongsic` |
| 2 | Hanmi Jung | 정한미 | `jung-hanmi` |
| 3 | Hyojin Park | 박효진 | `park-hyojin` |
| 4 | Do Young Rhee | 이도영 | `rhee-doyoung` |
| 5 | Hyun Jin Kang | 강현진 | `kang-hyunjin` |
| 6 | Soohyun Kwon | 권수현 | `kwon-soohyun` |
| 7 | Hyerim Ko | 고혜림 | `ko-hyerim` |
| 8 | Soohyung Kim | 김수형 | `kim-soohyung` |
| 9 | Jung Min Bae | 배정민 | `bae-jungmin` |

> ⚠️ **이도영 원장님 주의**: 기존 사이트에 `leedoyoung` URL이 존재할 수 있음. Rhee로 통일하므로 `lee-doyoung` → `rhee-doyoung` 301 리다이렉트 처리 필요. 다른 원장님들도 기존 URL 표기와 다른 경우 모두 301 리다이렉트.

### 2-3. 글 슬러그 자동 생성

의사가 글 작성 시 slug를 직접 쓰지 않음. 시스템이 다음 정보로 자동 생성:

1. 시술 태그 (필수 1개) → 영문 매핑 (예: 쥬브젠 → `juvgen`)
2. 키워드 태그 (선택 1~3개) → 영문 매핑 (예: 효과 → `effect`, 지속기간 → `duration`)
3. 결합: `juvgen-effect-duration`

**시술명 영문 매핑 사전**: 운영팀이 사전 작업으로 30~50개 시술의 영문 표기를 정의해야 함. 예시:

```
쥬브젠 → juvgen
스컬트라 → sculptra
힐로웨이브 → hilloweave
울쎄라 → ulthera
인모드 → inmode
리쥬란 → rejuran
... (피부텐텐에서 다루는 모든 시술)
```

신규 시술 등장 시 매핑 추가만 하면 자동 처리. 운영팀이 별도 매핑 사전 문서로 관리.

### 2-4. 슬러그 충돌 처리

같은 의사가 같은 해에 같은 slug가 자동 생성되는 경우 (드물지만 가능):

```
첫 번째: /dermatologists/jung-hanmi/2026/juvgen-effect-duration
두 번째: /dermatologists/jung-hanmi/2026/juvgen-effect-duration-2
세 번째: /dermatologists/jung-hanmi/2026/juvgen-effect-duration-3
```

발행 시점에 자동 검사 → 있으면 `-2`, `-3` 자동 부여. 운영팀 개입 불필요.

### 2-5. 1 영상 → N 글 워크플로우

원장님 콘텐츠 워크플로우:
- YouTube 롱폼 영상 1개 → **글 4개 자동 생성** → 의사 검수 → 동시 발행
- Reels 영상 1개 → **글 1개 자동 생성** → 의사 검수 → 발행

**필수 데이터 필드**: 글 데이터에 `source_video_id` 필드 추가. 같은 영상에서 파생된 형제 글들을 데이터베이스 차원에서 연결. 활용:

- 글 본문 페이지 하단에 *"이 영상의 다른 답변들"* 섹션 자동 노출
- 4개 글 cross-link 자동 생성
- (추후) 영상 타임스탬프 임베드 시 활용 — 현재는 영상 처음부터 재생

각 글이 *별도 질문에 대한 별도 답변*이므로 SEO·AEO에 매우 유리. 분리 발행이 정답.

### 2-6. URL 영구성 원칙 ⚠️

- **한 번 발행된 URL은 절대 변경 금지**
- 글 제목이 편집되어도 slug는 유지
- 부득이 변경 시 **반드시 301 리다이렉트** 설정
- URL 변경 = 누적된 SEO 가치 손실 + 외부 인용 링크 깨짐
- 로마자 표기(예: 의사명) 변경 금지 — 한 번 정한 표기 영구 사용

### 2-7. 렌더링 방식 — SSR/SSG 필수

- **CSR-only 금지**: 자바스크립트로 본문이 그려지면 검색 봇/AI 크롤러가 본문을 읽지 못함
- Next.js App Router 기준 SSG 또는 ISR 사용:
  ```tsx
  export async function generateStaticParams() {
    const posts = await getAllPosts();
    return posts.map(p => ({ slug: p.slug, year: p.year }));
  }
  ```
- **검증**: 배포 후 브라우저에서 view-source 또는 curl로 확인 — 답변 본문이 초기 HTML에 그대로 보여야 함

### 2-8. 개별 글 페이지 필수 구성요소

- Breadcrumb: `홈 > 의사명 > 연도 > 제목`
- `<h1>` = 질문 텍스트 그대로 (페이지당 H1 1개)
- 작성 의사 정보 (사진, 이름, 자격, 소속 — §7 참조)
- 작성일 + 마지막 검토일 (`<time datetime="ISO 8601">`)
- 답변 본문 (`<article>` 안에)
- 영상 임베드 (있는 경우)
- 태그 chip — 각 chip은 `<a href="/tag/{slug}">`로 링크
- "이 영상의 다른 답변들" 섹션 (해당되는 경우)
- 관련 글 4~6개
- 의료 면책 고지 (§16 참조)

---

## 3. [P0] 페이지별 동적 메타데이터 + OG 이미지 정책

### 3-1. 현재 문제

점검한 모든 페이지가 동일한 메타데이터 사용 (title: "피부텐텐", 동일 description, 동일 og:image). 일부 페이지는 메타 태그 자체 누락.

### 3-2. Next.js 동적 메타 구현

```tsx
// app/dermatologists/[doctor]/[year]/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params);
  return {
    title: `${post.question} | 피부텐텐`,
    description: post.answer.slice(0, 150),
    alternates: {
      canonical: `https://[자체도메인]/dermatologists/${post.doctor.slug}/${post.year}/${post.slug}`
    },
    openGraph: {
      title: post.question,
      description: post.answer.slice(0, 150),
      url: `https://[자체도메인]/dermatologists/${post.doctor.slug}/${post.year}/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [`https://[자체도메인]/dermatologists/${post.doctor.slug}`],
      images: [{ url: post.doctor.ogImage, width: 1200, height: 630, alt: post.doctor.name }],
      locale: "ko_KR",
      siteName: "피부텐텐",
    },
    twitter: { card: "summary_large_image" /* ... */ },
  };
}
```

### 3-3. 페이지 타입별 메타데이터 규칙

| 페이지 | title | description |
| --- | --- | --- |
| `/` (홈) | 피부텐텐 — 피부과 전문의 Q&A SNS | 피부 시술, 안티에이징 관련 전문의 답변 모음 |
| `/feed` | 최신 피드 \| 피부텐텐 | 최근 등록된 Q&A 미리보기 |
| `/dermatologists/{slug}/{year}/{post-slug}` | `{질문}` \| 피부텐텐 | 답변 첫 150자 |
| `/dermatologists` | 참여 전문의 \| 피부텐텐 | 전문의 N명의 프로필 소개 |
| `/dermatologists/{slug}` | `{이름}` 원장 — 피부과 전문의 \| 피부텐텐 | 이력 + 전문 분야 요약 |
| `/users/{slug}` | (noindex 적용 — title 무관) | (noindex) |
| `/tag/{slug}` | `{태그}` 관련 Q&A \| 피부텐텐 | 태그 설명 + Q&A 개수 |
| `/search?q=...` | (noindex) | (noindex) |

### 3-4. description 작성 규칙

- **155자 이내** (한글 기준 약 70자)
- **첫 문장 = 본문 핵심 답변의 요약** (AEO에 직접 영향)
- 의사명·시술명을 자연스럽게 포함
- 광고성 문구 지양

### 3-5. OG 이미지 정책 — 통일 + 의사별 정적

**확정된 정책**: 동적 OG 이미지 생성 없음. 정적 이미지 + 의사별 차별화.

| 페이지 | 사용 OG 이미지 |
|---|---|
| `/`, `/feed`, `/search`, `/tag/*` | **사이트 통일 브랜드 OG** |
| `/dermatologists` | 사이트 통일 브랜드 OG |
| `/dermatologists/{slug}` | **그 의사의 정적 OG** |
| `/dermatologists/{slug}/{year}/{post-slug}` | **그 의사의 정적 OG** (글 작성자 기준) |
| `/users/{slug}/*` | 사이트 통일 브랜드 OG |

**필요 자산**:
- 사이트 통일 OG 이미지 1개 (1200×630px)
- 의사별 OG 이미지 9개 (의사 사진 + 이름 + "피부과 전문의" + 피부텐텐 로고)

운영팀이 사전 디자인 작업으로 제공.

---

## 4. [P0] JSON-LD 구조화 데이터 — AEO/GEO 핵심

> 이 항목이 없으면 Google AI Overviews, ChatGPT Search, Perplexity, Gemini 등이 콘텐츠를 인용 후보로 삼을 가능성이 크게 떨어집니다. 의료 콘텐츠는 특히 더 그렇습니다.

### 4-1. 사이트 전역 (모든 페이지 루트 레이아웃)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://[도메인]/#organization",
      "name": "피부텐텐",
      "alternateName": "Pibutenten",
      "url": "https://[도메인]/",
      "logo": "https://[도메인]/logo.svg",
      "description": "피부과 전문의가 함께 만드는 피부 미용 Q&A SNS",
      "sameAs": [
        "https://www.youtube.com/@pibutenten",
        "https://www.instagram.com/{handle}"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://[도메인]/#website",
      "url": "https://[도메인]/",
      "name": "피부텐텐",
      "inLanguage": "ko-KR",
      "publisher": { "@id": "https://[도메인]/#organization" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://[도메인]/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

### 4-2. 의사 글 페이지 — `MedicalWebPage` + `FAQPage`

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["MedicalWebPage", "FAQPage"],
      "@id": "https://[도메인]/dermatologists/jung-hanmi/2026/juvgen-effect-duration#webpage",
      "url": "https://[도메인]/dermatologists/jung-hanmi/2026/juvgen-effect-duration",
      "name": "쥬브젠 효과 바로 나타나나요? 얼마나 오래 가요?",
      "inLanguage": "ko-KR",
      "datePublished": "2026-04-30T00:00:00+09:00",
      "dateModified": "2026-04-30T00:00:00+09:00",
      "lastReviewed": "2026-04-30",
      "reviewedBy": { "@id": "https://[도메인]/dermatologists/jung-hanmi#person" },
      "isPartOf": { "@id": "https://[도메인]/#website" },
      "primaryImageOfPage": {
        "@type": "ImageObject",
        "url": "https://[도메인]/og/dermatologists/jung-hanmi.png"
      },
      "mainEntity": {
        "@type": "Question",
        "name": "쥬브젠 효과 바로 나타나나요? 얼마나 오래 가요?",
        "answerCount": 1,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "쥬브젠은 시술 직후 바로 효과가 나타나고, 두세 달이 지나면서 더 좋아집니다. … (본문 전체)",
          "author": { "@id": "https://[도메인]/dermatologists/jung-hanmi#person" },
          "dateCreated": "2026-04-30T00:00:00+09:00"
        }
      },
      "about": [
        {
          "@type": "MedicalProcedure",
          "name": "쥬브젠",
          "alternateName": "Juvgen",
          "procedureType": "https://schema.org/PercutaneousProcedure"
        },
        { "@type": "MedicalCondition", "name": "팔자주름" }
      ],
      "specialty": "https://schema.org/Dermatologic",
      "audience": {
        "@type": "MedicalAudience",
        "audienceType": "Patient"
      }
    },
    {
      "@type": "VideoObject",
      "name": "쥬브젠 효과 바로 나타나나요?",
      "description": "{답변 첫 두 문장}",
      "thumbnailUrl": "https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg",
      "uploadDate": "2026-04-30",
      "embedUrl": "https://www.youtube.com/embed/{videoId}",
      "contentUrl": "https://youtu.be/{videoId}"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "피부텐텐", "item": "https://[도메인]/" },
        { "@type": "ListItem", "position": 2, "name": "정한미 원장", "item": "https://[도메인]/dermatologists/jung-hanmi" },
        { "@type": "ListItem", "position": 3, "name": "2026", "item": "https://[도메인]/dermatologists/jung-hanmi/2026" },
        { "@type": "ListItem", "position": 4, "name": "쥬브젠 효과 바로 나타나나요?" }
      ]
    }
  ]
}
```

### 4-3. 회원 글 페이지 — 단순 `Question`만

회원 글에는 **`MedicalWebPage`, `FAQPage`, `Answer` 스키마 절대 사용 금지**. 의료 정보로 인식되면 안 됨.

```json
{
  "@context": "https://schema.org",
  "@type": "Question",
  "name": "{회원이 쓴 질문}",
  "author": {
    "@type": "Person",
    "name": "{회원 닉네임}"
  },
  "dateCreated": "2026-04-30",
  "answerCount": 0
}
```

회원 글 페이지는 `<meta name="robots" content="noindex, follow">` 적용 (§9 참조).

### 4-4. 전문의 프로필 페이지 — `Physician`

```json
{
  "@context": "https://schema.org",
  "@type": "Physician",
  "@id": "https://[도메인]/dermatologists/jung-hanmi#person",
  "name": "정한미",
  "alternateName": "Hanmi Jung",
  "jobTitle": "피부과 전문의",
  "medicalSpecialty": "https://schema.org/Dermatologic",
  "image": "https://[도메인]/dermatologists/jung-hanmi.png",
  "url": "https://[도메인]/dermatologists/jung-hanmi",
  "worksFor": {
    "@type": "MedicalClinic",
    "name": "힐하우스피부과 강남점",
    "url": "https://healhousegn.com",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "KR",
      "addressRegion": "서울특별시",
      "addressLocality": "강남구"
    }
  },
  "alumniOf": {
    "@type": "EducationalOrganization",
    "name": "{출신 의대}"
  },
  "memberOf": [
    { "@type": "Organization", "name": "대한피부과학회" }
  ],
  "knowsAbout": ["쥬브젠", "스컬트라", "힐로웨이브", "안티에이징", "백반증"],
  "sameAs": [
    "https://www.youtube.com/@pibutenten"
  ]
}
```

### 4-5. 검증

- [Schema Markup Validator](https://validator.schema.org/) — 에러 0
- [Google Rich Results Test](https://search.google.com/test/rich-results) — FAQPage 리치 결과 자격 통과

---

## 5. [P0] sitemap.xml / robots.txt / llms.txt

### 5-1. `app/robots.ts`

```tsx
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/login",
          "/admin",
          "/users/",        // ⭐ 회원 글·프로필 색인 차단
          "/search",        // 검색 결과 페이지 차단
        ],
      },
      // AI/LLM 크롤러 명시적 허용 — GEO 필수
      { userAgent: "GPTBot", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "ChatGPT-User", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "ClaudeBot", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "anthropic-ai", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "PerplexityBot", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "Google-Extended", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "CCBot", allow: "/", disallow: ["/users/", "/search"] },
      // 한국 검색엔진 봇 명시
      { userAgent: "Yeti", allow: "/", disallow: ["/users/", "/search"] },
      { userAgent: "Daum", allow: "/", disallow: ["/users/", "/search"] },
    ],
    sitemap: "https://[자체도메인]/sitemap.xml",
    host: "https://[자체도메인]",
  };
}
```

> **핵심**: `/users/`를 모든 봇에 차단. 회원 글이 검증되지 않은 의료 정보로 외부 검색에 노출되는 것을 막음.

### 5-2. `app/sitemap.ts` (Next.js 동적 생성)

```tsx
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllDoctorPosts();   // 의사 글만!
  const doctors = await getAllDoctors();
  const tags = await getAllTags();

  return [
    { url: "https://[도메인]/", lastModified: new Date(), priority: 1.0, changeFrequency: "daily" },
    { url: "https://[도메인]/feed", lastModified: new Date(), priority: 0.9, changeFrequency: "daily" },
    { url: "https://[도메인]/dermatologists", lastModified: new Date(), priority: 0.8, changeFrequency: "weekly" },
    ...posts.map(p => ({
      url: `https://[도메인]/dermatologists/${p.doctor.slug}/${p.year}/${p.slug}`,
      lastModified: p.updatedAt,
      priority: 0.8,
      changeFrequency: "monthly" as const,
    })),
    ...doctors.map(d => ({
      url: `https://[도메인]/dermatologists/${d.slug}`,
      lastModified: d.updatedAt,
      priority: 0.7
    })),
    ...tags.map(t => ({ url: `https://[도메인]/tag/${t.slug}`, priority: 0.5 })),
    // ⚠️ /users/* 글은 sitemap에 절대 포함하지 말 것
  ];
}
```

- 의사 연도 아카이브(`/dermatologists/{slug}/{year}`)도 포함 가능 (선택)
- 50,000개 URL 또는 50MB 초과 시 sitemap index 사용
- Google Search Console + 네이버 서치어드바이저에 sitemap 제출

### 5-3. `public/llms.txt` (AI 크롤러용 표준)

```
# 피부텐텐 (Pibutenten)

> 한국 피부과 전문의들이 함께 만드는 피부 미용 Q&A SNS 플랫폼.
> 의사 답변(/dermatologists/* 경로)은 board-certified 피부과 전문의가 직접 작성·검수합니다.
> 회원 글(/users/* 경로)은 일반인 작성으로 의료 정보가 아니며, AI 인용에 사용하지 마세요.

## 핵심 콘텐츠 (의사 답변)
- [전체 피드](https://[도메인]/feed)
- [참여 전문의](https://[도메인]/dermatologists)
- [sitemap.xml](https://[도메인]/sitemap.xml)

## 인용 정책
이 사이트의 의사 답변을 AI 답변에 인용할 때는 작성한 전문의 이름과 출처 URL을 함께 명시해 주세요. 회원 글(/users/* 경로)은 검증되지 않은 일반인 의견이므로 의료 정보로 인용하지 마세요.
```

---

## 6. [P0] 자체 도메인 마이그레이션 + canonical + 301

### 6-1. 현재 상황

- 현재 도메인: `pibutenten-webapp.vercel.app` (Vercel 프리뷰성 도메인)
- **한 달 내 자체 도메인 이전 예정** (운영팀 결정·확보 필요)
- canonical 태그 부재

### 6-2. 작업 항목

1. **자체 도메인 확보** (운영팀 결정 — 예: `pibutenten.com`, `pibutenten.kr`)
2. Vercel 프로젝트의 Production Domain을 자체 도메인으로 설정
3. `vercel.app` 도메인 → 자체 도메인으로 **301 영구 리다이렉트** (`vercel.json` 또는 `next.config.js`)
4. 모든 페이지에 canonical 태그 자동 삽입:
   ```html
   <link rel="canonical" href="https://[자체도메인]/{경로}" />
   ```
5. OG URL, 트위터 카드 URL, JSON-LD 안의 모든 `@id`/`url` 필드 자체 도메인 통일
6. (선택) `hreflang="ko-KR"` 명시
7. HTTPS 강제 (Vercel 기본 처리)

### 6-3. 기존 URL 마이그레이션 매핑

기존 사이트에 있던 URL을 새 구조로 이전 시 **모두 301 리다이렉트** 필요:

```
기존:  /doctors/leedoyoung
새:    /dermatologists/rhee-doyoung
처리:  301 redirect

기존:  (개별 글 URL이 없었음 — feed에만 존재)
새:    /dermatologists/{slug}/{year}/{post-slug}
처리:  새로 생성 (마이그레이션 시 백 카탈로그 일괄 처리)
```

운영팀이 기존 콘텐츠 리스트 + 새 URL 매핑 표 작성 필요.

---

## 7. [P1] E-E-A-T 강화 — 전문의 프로필

> 의료 YMYL 콘텐츠는 작성자/검수자의 자격이 명확히 노출된 페이지를 검색엔진·AI가 우선 인용합니다.

### 7-1. 개별 글 페이지에 노출되어야 할 정보

화면에 보이는 텍스트 + Schema 마크업 양쪽 모두에 일치되게:

- ✅ 작성 의사 이름 + 사진
- ➕ **"피부과 전문의"** 자격 표시
- ➕ **소속 의원명** + 외부 링크
- ➕ **작성일 + 마지막 검토일** (예: "작성: 2026-04-30 | 마지막 검토: 2026-05-07")
- ➕ **"전문의 프로필 보기 →"** 링크

### 7-2. 의사 프로필 페이지(`/dermatologists/{slug}`) 강화

다음 정보가 화면 + JSON-LD 양쪽에:

```
/dermatologists/jung-hanmi
├── 프로필 사진 (alt = "정한미 피부과 전문의 프로필 사진")
├── H1: 정한미 원장
├── 직함: 피부과 전문의 (board-certified dermatologist)
├── 소속: 힐하우스피부과 강남점 (외부 링크)
├── 출신 의대 + 졸업년도
├── 전문 분야: (예: 안티에이징, 리프팅, 스킨부스터, 백반증)
├── 학회 회원: 대한피부과학회 등
├── 주요 학력/경력 타임라인
├── 출판/저서
├── 미디어: YouTube 피부텐텐, Instagram 등
├── 작성한 글 목록 (페이지네이션, 연도별 필터)
└── 면책 조항
```

운영팀이 9명 분의 프로필 콘텐츠 사전 작성.

### 7-3. About / 운영정책 페이지 신설

- `/about` — 운영 주체, 미션, 사업자번호
- `/about/editorial-policy` — 답변 작성·검수 프로세스 명시
- `/about/contact` — 연락처
- `/legal/privacy` — 개인정보 처리방침
- `/legal/terms` — 이용약관

LLM이 사이트 권위를 판단할 때 참조하는 신호.

---

## 8. [P1] 태그 중복 출력 버그 수정

### 8-1. 현재 문제

기존 사이트의 의사 페이지 카드 하단에 태그가 **두 번 출력**:
1. **첫 번째**: 모든 태그를 공백 없이 이어붙인 형태 (예: `땅콩형얼굴울쎄라볼패임...`) — 키워드 스터핑 스팸 신호
2. **두 번째**: 정상 chip 형태

### 8-2. 해결안

- 태그 컴포넌트 렌더링 로직 점검 — **한 번만** 렌더링
- visually hidden 등 시각 미노출 텍스트 노드에도 키워드 중복 금지
- 각 태그 chip은 `<a href="/tag/{slug}">`로 감싸기 (내부 링크 강화)
- 좋아요/댓글/공유 카운트도 `aria-label` 명확히:
  ```html
  <span aria-label="좋아요 191개">❤️ 191</span>
  ```

---

## 9. [P1] UGC와 전문의 답변 분리 — Namespace 기반

### 9-1. 분리 원칙

| 차원 | 의사 답변 | 회원 글 |
|---|---|---|
| URL | `/dermatologists/{slug}/{year}/{post-slug}` | `/users/{slug}/{year}/{post-slug}` |
| robots 색인 | 허용 ✅ | **`noindex, follow`** ❌ |
| sitemap 포함 | 포함 | **제외** |
| JSON-LD | `MedicalWebPage` + `FAQPage` + `Question` + `Answer` + `Physician` | 단순 `Question`만 |
| 시각적 표시 | "전문의 인증" 뱃지 + 의사 사진 | "회원 작성" 뱃지 + 회원 아바타 |
| OG 이미지 | 의사별 정적 OG | 사이트 통일 OG |

### 9-2. 시각적 구분 강화

피드 카드에서 한 눈에 구분되어야 함:

```
[전문의 답변 카드]
┌──────────────────────────────────┐
│ ✓ 전문의 답변                   │  ← 인증 뱃지 (브랜드 컬러)
│ 쥬브젠 효과 바로 나타나나요?     │
│ 정한미 원장 · 2026.04.30        │  ← 의사 사진 + 인증 표시
│ "쥬브젠은 시술 직후..."          │
└──────────────────────────────────┘

[회원 글 카드]
┌──────────────────────────────────┐
│ 💬 회원 작성                    │  ← 회원 뱃지 (다른 컬러)
│ 쥬브젠 시술받았는데 효과 별로...  │
│ 민지 · 2026.04.30                │  ← 회원 아바타
│ "다른 분들도 그러신가요..."      │
└──────────────────────────────────┘
```

### 9-3. 구현 체크리스트

- [ ] `/users/` namespace 생성 + 회원 가입/프로필 시스템
- [ ] 회원 글 페이지에 `<meta name="robots" content="noindex, follow">` 자동 적용
- [ ] sitemap에서 `/users/*` 제외
- [ ] robots.txt에 `Disallow: /users/`
- [ ] 회원 글 JSON-LD는 `Question`만 (절대 `MedicalWebPage`/`FAQPage`/`Answer` 금지)
- [ ] 카드 UI에 발신자 type별 뱃지·디자인 차별화
- [ ] 회원이 의사 인증 받는 경우 글의 namespace 이전 + 301 리다이렉트 처리

---

## 10. [P2] 태그 페이지 자동 운영 + 시술 허브 정책

### 10-1. 시술 허브(`/topic/{slug}`) — **만들지 않음** (확정)

이전 버전에서 권장했던 시술 허브 페이지(`/topic/juvgen` 등 운영팀 큐레이션 페이지)는 **이 문서 범위에서 제외**.

이유:
- 피부텐텐은 SNS 정체성 유지 (블로그·매거진 기능 추가하지 않음)
- 깊이 있는 시술별 종합 콘텐츠는 **차후 별도 미디어 채널**(스킨부스터, 리프팅)에서 다룸
- 피부텐텐 안에서는 카드 시스템 일관성 유지

### 10-2. 태그 페이지(`/tag/{slug}`) — 자동 운영

태그 페이지는 자동 생성, 운영 부담 0:

```
URL: /tag/anti-aging
─────────────────────────────────
[페이지 구성 — 자동]
H1: 안티에이징 관련 답변

(태그 설명 1줄 — 선택, 자동 또는 수동)

[글 카드 목록]
- (안티에이징 태그 달린 의사 글들이 시간순)
- 회원 글은 노출 안 됨 (noindex 정책상)
```

**구현 사항**:
- 태그 자동 추출: 글 작성 시 시술명·키워드 태그
- 페이지 자동 생성: 태그가 1개 이상 글에 달리면 자동
- 색인 정책: 색인 허용, canonical 자기 자신
- JSON-LD: `CollectionPage`(선택)

### 10-3. 차후 미디어 채널과의 연결

피부텐텐의 태그 페이지는 *가벼운 내부 탐색 도구*. 깊이 있는 시술 종합은 별도 미디어 채널이 담당:

```
피부텐텐 안:                    별도 미디어 채널 (Phase 2):
/tag/skin-booster              boosterMag.kr (또는 다른 도메인)
(태그 글 자동 목록)              (전문 매거진 콘텐츠)
```

미디어 채널의 글이 피부텐텐에 카드로 들어오는 메커니즘은 §11(외부 링크 공유 카드) 참조.

---

## 11. [P0] ⭐ 외부 링크 공유 카드 기능 — SNS 핵심

> SNS의 핵심 기능 중 하나. Twitter/Threads에서 외부 뉴스·블로그 링크를 카드로 공유하는 그 패턴.

### 11-1. 기능 정의

사용자(의사 또는 회원)가 외부 URL을 입력하면 카드 형태로 피드에 발행되는 기능. 본문은 외부 사이트에 있고, 피부텐텐에는 *요약 카드* + *외부 링크*만 있음.

### 11-2. 사용자 시나리오

**시나리오 1**: 의사가 피부 관련 뉴스 공유
> 정한미 원장이 "최근 NEJM에 발표된 백반증 치료 신약 논문" URL을 입력
> → 카드 자동 생성: 논문 제목 + 요약 + 출처 표시 + "더 읽기 →"
> → 피드에 발행

**시나리오 2**: 회원이 좋은 의료 칼럼 공유
> 회원 민지가 헬스조선 칼럼 URL 입력
> → 카드 자동 생성
> → 피드에 발행 (회원 글이므로 noindex)

**시나리오 3**: 미디어 채널 글 가져오기 (차후)
> 의사·회원이 차후 운영될 스킨부스터 매거진 글 URL 입력
> → 카드 자동 생성, 피드 노출
> → "더 읽기" 클릭 시 미디어 채널 사이트로 이동

### 11-3. 카드 구성

```
[외부 링크 공유 카드]
┌──────────────────────────────────────┐
│ 🔗 외부 링크                       │  ← 외부 링크 뱃지
│ ┌─────────────────────────────────┐ │
│ │ [OG 이미지 — 외부 사이트]        │ │
│ └─────────────────────────────────┘ │
│ 백반증 신약, NEJM에 발표된 결과...  │  ← 제목 (외부 OG title)
│ "JAK 억제제 계열 신약이..."         │  ← 요약 2~3문장 (외부 OG description)
│                                     │
│ healthchosun.com →                 │  ← 출처 도메인
│                                     │
│ 정한미 원장이 공유 · 2026.05.07     │  ← 공유한 사용자
│ ❤ 24    💬 3                       │
└──────────────────────────────────────┘
```

### 11-4. 기술 구현

#### URL 입력 시 백엔드 처리:

1. URL 유효성 검증 (https only, blocked domain 체크)
2. 외부 사이트의 OG 메타데이터 자동 추출:
   - `og:title`
   - `og:description`
   - `og:image`
   - `og:site_name`
   - canonical URL
3. 추출 데이터를 데이터베이스에 저장
4. (선택) 추출 실패 시 사용자가 수동 입력

#### URL 구조

외부 링크 카드도 피부텐텐 안의 글이므로 동일 URL 패턴:

```
의사 공유: /dermatologists/jung-hanmi/2026/{auto-slug}
회원 공유: /users/minji/2026/{auto-slug}
```

`{auto-slug}`는 외부 글 제목에서 추출한 키워드 또는 도메인 기반 자동 생성 (예: `nejm-vitiligo-jak`).

#### 카드 클릭 동작 — 두 단계

```
카드 클릭
↓
피부텐텐 내부 페이지(`/dermatologists/{slug}/2026/{auto-slug}`)에 도착
   - 카드 확장 뷰 (요약 + 코멘트 + 댓글)
   - "더 읽기 →" 버튼 (외부 링크)
↓
"더 읽기" 클릭 시 외부 사이트 새 탭으로 열림
```

이 두 단계 구조를 권장하는 이유:
- 피부텐텐에 댓글·좋아요·공유 등 *SNS 인터랙션*이 가능해짐
- 사용자가 외부 사이트로 빠져나가기 전 사이트 머무름 시간 증가 (SEO에 유리)
- 외부 사이트 링크의 출처가 피부텐텐임이 명확해짐

대안: 카드 클릭 시 바로 외부 사이트로 (Twitter 패턴) — 더 단순하지만 댓글 등 인터랙션 어려움. 운영팀 선택.

### 11-5. SEO 처리

- 외부 링크 카드 페이지는 색인 가능 (canonical 자기 자신)
- 외부 링크는 `rel="noopener nofollow"` 또는 `rel="noopener ugc"` (사용자 공유 콘텐츠 표시)
- 회원이 공유한 외부 링크 페이지는 `noindex` (§9 정책)
- JSON-LD: `SocialMediaPosting` + `sharedContent` (외부 글 메타) 사용 가능

### 11-6. 차단 도메인 정책

운영팀이 차단 도메인 리스트 관리:
- 의료 광고성 사이트
- 검증되지 않은 의학 정보 사이트
- 스팸·악성 사이트

차단 도메인 URL은 입력 시 거부.

### 11-7. AI 크롤러 처리

- 외부 링크 카드 페이지에는 카드 요약만 있고 본문은 외부에 있음
- AI 크롤러는 카드 요약 + 외부 링크를 같이 인지
- llms.txt에 외부 공유 콘텐츠 표시 정책 명시 가능

---

## 12. [P2] 시맨틱 HTML / 헤딩 위계

### 12-1. 헤딩 위계 (페이지 타입별)

| 페이지 | H1 | H2 | H3 |
| --- | --- | --- | --- |
| `/` | 피부텐텐 — 피부과 전문의 Q&A SNS | 최신 답변, 전문의 소개 | 카드 제목 |
| `/feed` | 전체 피드 | (그룹 라벨) | 카드 제목 |
| `/dermatologists/{slug}/{year}/{post-slug}` | **{질문 텍스트}** ← AEO 핵심 | 답변, 관련 글 | (필요 시) |
| `/dermatologists` | 피부텐텐 참여 전문의 | (없음) | 의사 카드 |
| `/dermatologists/{slug}` | {이름} 원장 | 프로필, 작성한 답변 | 카드 제목 |
| `/tag/{slug}` | {태그} 관련 답변 | (없음) | 카드 제목 |

### 12-2. 시맨틱 태그

- 카드 = `<article>`
- 사이트 헤더 = `<header>`, 푸터 = `<footer>`, 네비 = `<nav>`
- 답변 본문 = `<article>` 안에 `<section aria-labelledby="...">`
- 시술 가격, 비교 데이터는 실제 `<table>`, `<th>`, `<tr>` (CSS 가짜 표 금지)
- 시술 순서/장점은 `<ul>`, `<ol>`

---

## 13. [P2] 이미지 최적화

### 13-1. alt 텍스트 보강

- 의사 프로필 사진: `"{이름} 피부과 전문의 — {소속}"`
- 본문 첨부 이미지: 콘텐츠 설명
- 로고: `"피부텐텐 로고"`
- 장식 이미지: `alt=""`

### 13-2. 기타

- 모든 이미지에 명시적 width/height (CLS 방지)
- AVIF/WebP 자동 생성 (Next/Image 기본)
- LCP 이미지에 `priority` prop
- 의사 프로필 이미지 파일명 의미 있게 (예: `jung-hanmi-dermatologist.png`)
- `loading="lazy"` (Next/Image 기본)

---

## 14. [P2] Core Web Vitals + 성능

### 14-1. 점검 도구 + 목표

- [PageSpeed Insights](https://pagespeed.web.dev/) (모바일 기준)
- 목표: LCP < 2.5s, INP < 200ms, CLS < 0.1
- PageSpeed 모바일 75점, 데스크톱 90점 이상

### 14-2. 점검 포인트

- 무한 스크롤 LCP/INP 영향
- 의사 프로필 이미지 LCP 후보 → `priority`
- 폰트 로딩 — `next/font` + `display: swap`
- 3rd party 스크립트 지연 로딩
- 카드 피드 로딩 시 스켈레톤 UI로 CLS 방지
- 외부 링크 카드의 OG 이미지 lazy 로딩

---

## 15. [P2] 추가 구현 사항

### 15-1. Breadcrumb (이동경로)

개별 글 페이지에 표시 + JSON-LD `BreadcrumbList`:
```
홈 > {의사명} 원장 > 2026 > 쥬브젠 효과 바로 나타나나요?
```

### 15-2. 검색 결과 페이지(`/search?q=...`)

- `<meta name="robots" content="noindex, follow">`
- robots.txt에 `Disallow: /search`
- 같은 키워드도 매번 다른 순서로 노출 가능 (UX 다양성, SEO 영향 없음 — noindex라서)

### 15-3. 페이지네이션

- 피드/태그 페이지가 페이지네이션 시 각 페이지 canonical은 자기 자신

### 15-4. 404 페이지

- 사용자 친화적 404 (관련 인기 글 추천)
- 정상 404 응답 코드 (소프트 404 금지)

### 15-5. 외부 링크 정책

- 본인 채널(YouTube): `rel="noopener"`만, dofollow 유지
- 외부 도메인 일반: `rel="noopener noreferrer"`
- 사용자가 공유한 외부 링크: `rel="noopener nofollow ugc"` 권장

### 15-6. 분석 도구 연동

- **Google Search Console** 등록 + sitemap 제출
- **네이버 서치어드바이저** 등록 + sitemap 제출
- **GA4** 설정

### 15-7. 날짜 형식

- 화면 표시: "26.04.30" 가능
- HTML: `<time datetime="2026-04-30">26.04.30</time>` (ISO 8601 명시)

---

## 16. [P3] 의료광고법 컴플라이언스 + 면책

### 16-1. 점검 필요 사항 (편집팀 + 법무 검토)

기존 글 일부에서 의료법 제56조 의료광고 제한 위반 소지 표현 확인:

- "117만 명을 넘었는데" / "550% 늘었을 정도로" — 출처 없는 통계
- "실제 응급실에서 코 필러 후 실명된 20대 환자를 본 적도 있어요" — 환자 사례 인용 (의료법 위반 가능)
- "가장 확실한 효과" — 우월성 표현

### 16-2. 작업 항목

1. **모든 의사 글 페이지 하단 면책 조항** (필수):
   ```
   ⚠️ 본 콘텐츠는 피부과 전문의가 작성한 일반적인 의학 정보이며,
      개인의 진단·치료를 대체하지 않습니다.
      시술 결정 전 반드시 의료진과 직접 상담하시기 바랍니다.
   ```
2. **모든 회원 글 페이지 면책 조항**:
   ```
   ⚠️ 본 글은 회원이 작성한 개인 의견이며 의료 정보가 아닙니다.
      의료 결정 시에는 반드시 전문의와 상담하시기 바랍니다.
   ```
3. **외부 링크 카드 면책**: 외부 콘텐츠임을 명확히 표시
4. **의료광고심의 받은 콘텐츠 표시** — 가능한 경우 심의번호
5. **답변 작성·검수 정책 페이지** (`/about/editorial-policy`) — 운영팀 작성

---

## 17. [참고] AEO/GEO 콘텐츠 작성 가이드라인 — 편집팀

### 잘 되어 있는 점 (그대로 유지)

- "질문 형태의 H2 + 첫 문장이 직접 답변" 구조 — AEO 이상적
- 1문단 안에 핵심 답변 — AI Overviews/ChatGPT 인용 유리

### 추가 권장

- 답변 첫 문장: 30~80자 압축 직답
- 시술명 정확한 표기 일관 (예: 쥬브젠 / Juvgen — 영문 매핑 사전대로)
- 시술 효과 수치 정보 (유지 기간, 시술 시간 등)
- 본문에 "근거"·"의학적 메커니즘" 한 줄
- 줄글뿐 아니라 비교 표·요약 리스트 활용

---

## 18. 작업 순서 — Phase 1 (피부텐텐 SNS 자체)

이 문서의 범위는 **Phase 1 (피부텐텐 SNS 자체)**. Phase 2 이후 미디어 채널은 별도 프로젝트로 차후 진행.

### Sprint 1 (2주) — 인프라 + 도메인
- [ ] §6 자체 도메인 확보 + DNS + 301 redirect (1개월 데드라인)
- [ ] §2 분리 namespace 구현 (`/dermatologists/`, `/users/`)
- [ ] §2 의사 슬러그 9명 적용 + 기존 URL 301 리다이렉트
- [ ] §2 SSG/ISR로 개별 글 페이지 정적 생성
- [ ] §2 슬러그 자동 생성 시스템 + 충돌 처리
- [ ] §3 페이지별 동적 메타데이터
- [ ] §3 의사별 정적 OG 이미지 9개 + 사이트 통일 OG 1개
- [ ] §8 태그 중복 출력 버그 수정

### Sprint 2 (2주) — SNS 핵심 기능 + AEO/GEO
- [ ] §11 외부 링크 공유 카드 기능 (백엔드 OG 추출 + 카드 UI + 외부 링크 처리)
- [ ] §4 JSON-LD 전체 구현 (의사 글, 회원 글, 의사 프로필, 사이트 전역, BreadcrumbList, VideoObject)
- [ ] §5 sitemap.xml + robots.txt + llms.txt
- [ ] §9 UGC와 의사 답변 시각·마크업·인덱싱 분리
- [ ] §12 헤딩 위계 + 시맨틱 HTML 정비
- [ ] §13 이미지 alt + 최적화
- [ ] Google Search Console + 네이버 서치어드바이저 등록 + sitemap 제출

### Sprint 3 (2주) — E-E-A-T + 부가 기능
- [ ] §10 자동 태그 페이지 (`/tag/{slug}`)
- [ ] §7 의사 프로필 페이지 강화 (9명 콘텐츠 입력)
- [ ] §7 About / 운영정책 / 의료면책 페이지 신설
- [ ] §15-1 Breadcrumb (페이지 + JSON-LD)
- [ ] §15-4 사용자 친화적 404
- [ ] §15-2 검색 결과 페이지 noindex
- [ ] §16 면책 조항 일괄 삽입 (의사 글 + 회원 글 + 외부 링크 카드)

### Sprint 4 (1주) — 검증·모니터링
- [ ] §4-5 Schema validator 전체 페이지 통과
- [ ] §14 Core Web Vitals 베이스라인 측정 + 개선
- [ ] 기존 콘텐츠 백 카탈로그 마이그레이션 완료 검증
- [ ] 모든 301 리다이렉트 작동 확인
- [ ] 색인 상태 모니터링 시작

### Phase 1 이후 — 모니터링 (지속)
- Search Console 색인 모니터링 (4주+ 관찰)
- Schema Markup Validator 정기 검증
- 주요 키워드 순위 추적
- AI Overviews / ChatGPT / Perplexity 인용 여부 모니터링

### Phase 2 이후 — 별도 프로젝트
- **Phase 2 (피부텐텐 안정화 후)**: 첫 미디어 채널 (스킨부스터) — 별도 SEO/AEO/GEO 요청서 작성
- **Phase 3 (Phase 2 효과 검증 후)**: 두 번째 미디어 채널 (리프팅) — 별도 진행
- 미디어 채널 글이 피부텐텐 외부 링크 카드(§11)로 자동 유입되는 시너지

---

## 19. 배포 전 검증 체크리스트

배포 직전 모든 항목 ✓:

- [ ] `https://[자체도메인]/dermatologists/{slug}/{year}/{post-slug}` 페이지가 view-source에서 완전한 HTML로 보임 (CSR-only ❌)
- [ ] 모든 의사 글 페이지에 고유한 title/description/og 태그
- [ ] 의사별 OG 이미지가 의사 프로필·글 페이지에 정확히 적용
- [ ] FAQPage / MedicalWebPage / Physician JSON-LD가 [Schema validator](https://validator.schema.org/)에서 에러 0
- [ ] [Google Rich Results Test](https://search.google.com/test/rich-results)에서 FAQPage 리치 결과 자격 통과
- [ ] sitemap.xml 접근 가능, **의사 글만** 포함, `/users/*` 제외
- [ ] robots.txt 접근 가능, AI 봇 명시 허용, `/users/*` 차단
- [ ] llms.txt 접근 가능, 의사·회원 글 구분 명시
- [ ] 회원 글 페이지에 `<meta name="robots" content="noindex, follow">` 자동 적용
- [ ] 회원 글 JSON-LD에 `MedicalWebPage`/`FAQPage` 미사용 확인
- [ ] 모든 페이지에 H1 존재 + 의미 있는 텍스트
- [ ] 모든 이미지에 alt
- [ ] 모든 카드의 제목이 개별 글 URL로 클릭 가능
- [ ] 태그 클릭 시 `/tag/{slug}`로 이동
- [ ] 외부 링크 공유 카드: OG 추출 정상, 외부 링크 새 탭, rel 속성 정확
- [ ] HTTPS, canonical URL 설정
- [ ] [Mobile-friendly Test](https://search.google.com/test/mobile-friendly) 통과
- [ ] PageSpeed Insights 모바일 75점, 데스크톱 90점 이상
- [ ] 자체 도메인 + 301 redirect 정상 작동
- [ ] 기존 의사 URL(예: `/doctors/leedoyoung`) → 새 URL(예: `/dermatologists/rhee-doyoung`) 301 작동
- [ ] 모든 의사 글에 작성일·마지막 검토일·면책 조항 노출

---

## 20. 확정된 핵심 결정 사항 (참조표)

이 문서에서 모든 의사결정이 확정되었으므로 운영팀 추가 결정 사항은 최소화. 단, 다음은 사전 작업으로 확보 필요:

| 항목 | 확정 내용 | 운영팀 작업 |
|---|---|---|
| URL namespace | `/dermatologists/` + `/users/` 분리 | — |
| 슬러그 형식 | 성-이름 + 하이픈, slug only, 4자리 연도 | — |
| 의사 9명 슬러그 | §2-2 표 확정 | — |
| 시술명 영문 매핑 사전 | 30~50개 사전 정의 | **사전 작성 필요 (별도 문서)** |
| 자체 도메인 | 한 달 내 이전 | **도메인 결정·확보** |
| 회원 글 색인 | noindex (모든 봇 + sitemap 제외) | — |
| OG 이미지 | 사이트 통일 + 의사별 9개 정적 | **이미지 사전 디자인** |
| 시술 허브 (`/topic/`) | 만들지 않음 | — |
| 태그 페이지 (`/tag/`) | 자동 운영 | — |
| 외부 링크 공유 카드 | 의사·회원 모두 사용 가능 | **차단 도메인 리스트 관리** |
| 1영상-N글 워크플로우 | 자동 생성 → 의사 검수 → burst 발행 | — |
| 관련 글 cross-link | `source_video_id` 필드 활용 | — |
| 의사 프로필 콘텐츠 (9명) | §7-2 구성요소 | **사전 작성** (출신·경력·전문분야 등) |
| About / Editorial Policy / 면책 | 신설 | **사전 작성** |

### 미디어 채널 (Phase 2 이후 — 별도 프로젝트)

| 항목 | 결정 |
|---|---|
| 스킨부스터 미디어 채널 | Phase 2 진행 (피부텐텐 안정화 후) |
| 리프팅 미디어 채널 | Phase 3 진행 (Phase 2 효과 검증 후) |
| 미디어 채널 ↔ 피부텐텐 연결 | 외부 링크 공유 카드(§11) 통해 |

---

## 21. 참고 자료

- [Google Search Central — 의료/YMYL 콘텐츠 가이드라인](https://developers.google.com/search/docs/appearance/structured-data/medical-content)
- [Schema.org — MedicalWebPage](https://schema.org/MedicalWebPage)
- [Schema.org — Physician](https://schema.org/Physician)
- [Schema.org — FAQPage](https://schema.org/FAQPage)
- [Schema.org — MedicalProcedure](https://schema.org/MedicalProcedure)
- [Schema.org — SocialMediaPosting](https://schema.org/SocialMediaPosting)
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema Markup Validator](https://validator.schema.org/)
- [네이버 서치어드바이저 가이드](https://searchadvisor.naver.com/guide)
- [Vercel — Custom Domains & Redirects](https://vercel.com/docs/projects/domains)
- [llms.txt 표준](https://llmstxt.org/)
- [Open Graph Protocol](https://ogp.me/)
- 의료법 제56조 의료광고 제한 (법제처)

---

> **요약**: 콘텐츠 형식(질문→직답 구조)은 AEO/GEO에 매우 적합하게 잘 짜여 있습니다. SNS 정체성을 유지하면서 인프라(개별 URL · 메타 · 스키마 · sitemap · 자체 도메인 · 외부 링크 공유 카드)를 채우면, 그 좋은 콘텐츠가 검색엔진과 AI에 정확히 전달됩니다. Phase 1 작업 완료 후 **3~6개월 내** 자연 검색 유입 + AI 답변 인용 노출이 큰 폭으로 증가할 것으로 예상되며, 이후 Phase 2(스킨부스터 미디어 채널)와 Phase 3(리프팅 미디어 채널)이 별도 프로젝트로 더해지면 토픽 권위가 입체적으로 누적됩니다.

> **문의 사항이나 우선순위 조정이 필요하면 알려주세요.**
