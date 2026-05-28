# 시스템 구조 (ARCHITECTURE)

피부텐텐의 기술 스택·라우트·컴포넌트·Identity 시스템·미들웨어 구조를 다룬다. DB 스키마는 `DATABASE.md`, 도메인별 명세는 `TECH_SPEC.md`.

---

## 1. 기술 스택

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16.2.6 (App Router, Turbopack dev/build) |
| 언어 | TypeScript strict |
| 스타일 | Tailwind CSS v4 |
| DB / Auth / Storage | Supabase (Postgres + RLS + RPC + Storage) |
| 배포 | Vercel Pro (auto-deploy from `main`) |
| AI | Anthropic Claude (`@anthropic-ai/sdk` 0.93) |
| React | 19.2.4 |
| 부가 라이브러리 | `web-push`, `nanoid`, `youtubei.js`, `youtube-transcript`, `@mozilla/readability`, `jsdom`, `react-easy-crop`, `react-masonry-css`, `pretendard`, `zod`, `sharp`, `simple-git-hooks` |

작업 디렉토리: `D:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\pibutenten-app\`

---

## 2. 라우트 구조

### 2.1. 공개 페이지
```
/                                   홈 (검색 + CategoryWithChips + 피드)
/about                              소개
/search                             검색 결과
/topics/[tag]                       태그별 글 목록 (SEO 인덱싱)
/doctors                            원장님 목록
/doctors/[slug]                     원장님 소개 (OG: /og/{slug}.png)
/doctors/[slug]/[year]/[postSlug]   원장님 글 단독 (SEO URL)
/[handle]                           사용자/원장 프로필
/[handle]/[shortcode]               회원 글 단독
/u/[id]                             구식 user URL (compat)
/privacy, /terms, /doctor-guidelines, /disclaimer, /report   법적/안내 페이지
```

### 2.2. 인증 / 온보딩
```
/login, /signup                     인증
/auth/callback                      OAuth 콜백 (약관/온보딩 가드)
/onboarding                         추가정보 입력
/login/conflict                     OAuth provider 충돌 안내
```

### 2.3. 사용자 영역
```
/settings                           대시보드 (admin 도구 + doctor 통계 + user Hero)
/settings/profile                   프로필 수정
/settings/notifications             알림 설정
/notifications                      알림 목록
/write                              글쓰기
/write/[shortcode]                  글 수정 (자기 글)
```

### 2.4. 관리자 영역 (role=admin 또는 doctor)
```
/admin                              운영 대시보드
/admin/cards                        전체 글 관리
/admin/cards/[id]/edit              글 편집
/admin/comments                     댓글 관리
/admin/doctors                      원장 목록 관리
/admin/doctors/[slug]/edit          원장 프로필 편집
/admin/draft                        AI 글 초안 생성
/admin/users                        회원 관리
/admin/users/[id]                   역할/매핑 변경
/admin/stats/[kind]                 세부 통계
/admin/auth-errors                  회원가입 에러 로그
```

### 2.5. API 라우트

#### 글/댓글/카드
```
POST   /api/articles                글 생성 (post/qa)
PUT    /api/articles/[id]           글 수정
GET    /api/cards                   search_cards_scored RPC
*      /api/comments                댓글 CRUD
*      /api/comments/[id]
```

#### 알림 / 푸시
```
*      /api/notifications
PATCH  /api/notifications/read
*      /api/notifications/preferences
POST   /api/push/subscribe / unsubscribe / send
```

#### 미디어 / 메타
```
POST   /api/upload                  이미지 업로드
GET    /api/og-extract              OG 메타 추출
GET    /api/preview-link            링크 미리보기
```

#### 인증 / 아이덴티티
```
POST   /api/identity/switch
GET    /api/auth/naver/start
GET    /api/auth/naver/callback
DELETE /api/me/delete               계정 삭제 (soft-delete)
POST   /api/reports                 신고 접수
```

#### 관리자 / AI
```
PATCH  /api/admin/users/[id]/role
*      /api/admin/comments
*      /api/admin/stats/[kind]
POST   /api/admin/draft
POST   /api/admin/draft/step1
POST   /api/admin/draft/step2
POST   /api/admin/draft/save
POST   /api/admin/draft/analyze
POST   /api/admin/draft/publish
POST   /api/admin/draft/pubmed-by-pmid
POST   /api/admin/extract-keywords
GET    /api/admin/youtube-oauth/start / callback / status
```

#### dev only
```
GET    /api/dev-sql/[name]          로컬 SQL 실행
```

### 2.6. 메타 / SEO
```
/sitemap.xml                        동적 sitemap (force-dynamic — cookies 사용)
/robots.txt                         robots
/manifest.json                      PWA manifest
```

---

## 3. 디렉터리 구조

```
src/
├── app/                            Next.js App Router
│   ├── layout.tsx                  max-w 1080 컨테이너 + Sticky TopNav + ScrollManager
│   ├── page.tsx                    홈 피드
│   ├── (route)/page.tsx            각 페이지
│   ├── (route)/[Client].tsx        클라이언트 페이지 컴포넌트
│   └── api/                        API 라우트
├── components/                     공용 React 컴포넌트
│   ├── card/                       Card 시스템 (Header/Body/Media/Actions + hooks + utils)
│   ├── card-editor/                CardEditor 통합 (모든 작성·수정 진입점)
│   └── *.tsx                       TopNav, Feed, IdentitySwitcher, CommentsBlock, ...
├── lib/                            비즈니스 로직 / 유틸
│   ├── supabase/                   3종 클라이언트 (client/server/admin)
│   ├── ai/                         Claude 초안 파이프라인
│   ├── auth/                       OAuth (naver, providers)
│   ├── schema/                     JSON-LD (doctor/clinic/procedure) + zod 검증
│   └── identity*.ts                Identity 시스템 (Phase 9)
├── data/                           정적 매핑 (procedure-mappings)
└── middleware.ts                   약관/온보딩 가드 + CSRF Origin 검증

supabase/
├── migrations/                     SQL 마이그레이션 (0001~)
└── MIGRATION_HISTORY.md            실행 순서·동일번호 충돌 명문화
```

---

## 4. 핵심 컴포넌트 (`src/components/`)

### 4.1. 카드 시스템
| 파일 | 역할 |
|---|---|
| `card/Card.tsx` | 카드 root. view 카운트, 좋아요/저장/공유 |
| `card/CardHeader.tsx` | 작성자·시간·HOT/NEW/Pick 배지·⋮ 메뉴 |
| `card/CardBody.tsx` | 본문 + 강조 하이라이트 |
| `card/CardMedia.tsx` | YouTube 영상 보러가기 + 외부 링크 OG |
| `card/CardActions.tsx` | 좋아요·댓글·저장·공유 |
| `card/CardKeywords.tsx` | 키워드 칩 |
| `card/hooks/useCardViewer.ts` | view·impression 큐 |
| `card/hooks/useCardEngagement.ts` | like·save·share 인터랙션 |

### 4.2. 카드 에디터 통합
| 파일 | 역할 |
|---|---|
| `card-editor/CardEditor.tsx` | 작성·수정 단일 컴포넌트 (mode='write'/'edit') |
| `card-editor/KeywordsEditor.tsx` | 키워드 추출·편집 |
| `card-editor/fields/PubmedRefsField.tsx` | PubMed 참고문헌 |
| `card-editor/fields/ExternalLinkField.tsx` | 외부 URL 등록 → 미리보기 2단계 |

### 4.3. 네비·검색·피드
| 파일 | 역할 |
|---|---|
| `TopNav.tsx` | 헤더 + 현재 active profile 아이콘 |
| `IdentitySwitcher.tsx` | 신분(profile) 전환 dropdown — 묶음 안 동등 독립한 profile 들 (ADR 0001, 0011) |
| `Feed.tsx`, `CardMasonry.tsx` | 피드 + grid (react-masonry-css) |
| `HeroSearch.tsx`, `SearchBar.tsx` | 메인 검색창·sticky 검색바 |
| `CategoryWithChips.tsx` | 인기 키워드 5탭 + 칩 |
| `CategoryTabs.tsx` | 단순 카테고리 탭 |

### 4.4. 댓글·인터랙션
| 파일 | 역할 |
|---|---|
| `CommentsBlock.tsx` | 댓글 트리 + 인라인 답글 |
| `RecentLikers.tsx`, `LikersDialog.tsx` | 최근 likers 칩·모달 |
| `LoginPromptDialog.tsx` | 비로그인 좋아요/저장/댓글 시도 시 모달 |
| `EngagementPromptDialog.tsx` | 흥미 점수 기반 회원가입 권유 모달 |
| `EngagementPromptListener.tsx` | layout.tsx mount — 자동 점수 트리거 |
| `SessionContext.tsx` | SSR session 즉시 me 결정 |

### 4.5. 알림 / PWA
| 파일 | 역할 |
|---|---|
| `NotificationBadge.tsx`, `NotificationsBell.tsx` | 헤더 알림 |
| `NotificationPreferences.tsx`, `PushNotificationToggle.tsx` | 설정 |
| `InstallPrompt.tsx` | PWA 설치 프롬프트 |
| `InAppBrowserNotice.tsx` | 인앱브라우저 안내 |

### 4.6. 안내 / 푸터
| 파일 | 역할 |
|---|---|
| `InfoPageLayout.tsx`, `InfoNav.tsx` | 안내 페이지 wrapper (6칩 nav) |
| `SiteFooter.tsx` | 사이트 푸터 (7→6 링크) |
| `BackButton.tsx` | 뒤로가기 |
| `ScrollManager.tsx` | 스크롤 위치 복원 |
| `SocialLoginButtons.tsx`, `LogoutButton.tsx` | 인증 UI |

---

## 5. Identity 시스템 (Phase 9)

ADR 0001 참조. 단일 표준 — Persona 시스템(official/personal)은 2026-05-15 완전 폐기.

### 5.1. 모델
- 쿠키: `pibutenten:identity` = `primary` 또는 `profile.id` (UUID)
- 같은 `auth_user_id` 묶음으로 묶인 **독립 profiles row 다수**
- 한 사람이 두 모드 (의사·일반) 활동 → **별개 profile row** 생성 후 묶음에 추가
- 모든 인터랙션 `user_id`/`author_id` = active profile.id
- 의사 vs 회원 구분 = `doctor_accounts` 매핑 유무

### 5.2. 헬퍼
- 서버: `getIdentityContext()` → `{user, active, isSuperAdmin, isDoctorAdmin, activeDoctorId}` (`src/lib/identity.ts`)
- 서버 헬퍼 추출: `resolveActiveIdentity()` (`src/lib/identity-server.ts`)
- 공통: `src/lib/identity-shared.ts` (isomorphic. IDENTITY_COOKIE/UUID_RE/ActiveIdentity 타입)
- 클라: `getActiveIdentityId()` (`src/lib/active-identity.ts`)

### 5.3. UI
- `IdentitySwitcher`: 묶음 내 ID 전환 (TopNav 아바타 클릭)
- `/api/identity/switch`: 쿠키 set 엔드포인트
- 쿠키 2종: `pibutenten:identity` (httpOnly, 서버 신뢰) + `pibutenten:identity-mirror` (httpOnly false, UI 표시)

---

## 6. 미들웨어 (`src/middleware.ts`)

### 6.1. Fast paths (Supabase 호출 없이 통과)
1. 면제 경로 prefix: `/onboarding`, `/signup`, `/login`, `/auth/`, `/api/`
2. 정적 자산 확장자: `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico`, `.css`, `.js`, `.woff*`, `.ttf`, `.otf`, `.map`, `.json`, `.txt`, `.xml`, `.webmanifest`
3. 강제 게이트 쿠키 `pibutenten_must_onboard` → 즉시 `/onboarding` 리다이렉트
4. 캐시 쿠키 `pibutenten_onboarded` 보유

### 6.2. Slow path
- Supabase 토큰 갱신 + getUser
- profiles select (terms_agreed_at, birthdate)
- 약관 미동의 → `/signup`
- 통과 시 `pibutenten_onboarded` 쿠키 set (12시간 유효)
- ONBOARDED_COOKIE set 직후 `site_visits` INSERT (24h 1회, ADR 0010)

### 6.3. CSRF Origin 검증
- allow-list: `pbtt.kr`, `pibutenten-webapp-*.vercel.app` (정확 매칭)
- `VERCEL_ENV` 기반 환경별 분기
- LAN IP 는 dev 한정

---

## 7. Supabase 클라이언트 3종

| 파일 | 사용처 | 권한 |
|---|---|---|
| `src/lib/supabase/client.ts` | 브라우저 (브라우저 쿠키) | anon |
| `src/lib/supabase/server.ts` | 서버 컴포넌트·API (Next.js cookies()) | anon (사용자 세션 기반) |
| `src/lib/supabase/admin.ts` | 서버 측 service_role 필요한 작업 | service_role |

- `admin.ts` 는 `server-only` import 로 클라이언트 번들 노출 차단

---

## 8. 디자인 토큰 (`src/app/globals.css`)

```css
:root {
  --primary: #4CBFF2;
  --primary-dark: #2EA8DC;
  --primary-soft: #E8F6FD;
  --secondary: #1B4965;
  --bg: #F4F5F7;
  --bg-soft: #ECEEF1;
  --white: #FFFFFF;
  --text: #383F47;           /* 제목 / 좋아요 닉네임 / 댓글 닉네임 */
  --text-secondary: #595E60; /* 본문 / 댓글 본문 */
  --text-icon: #77868F;      /* 좋아요·댓글·북마크·공유 아이콘+숫자 */
  --text-muted: #A2A6AF;     /* 카테고리 / 더보기 / 영상보러가기 / 태그 */
  --border: #E5E3DD;
  --accent: #FF6B81;
  --accent-soft: #FFE4E8;
}
```

카드 강조 하이라이트 5색 (`src/lib/card-highlight.ts`): Sky `#E0F2FE` / Mint `#DCFCE7` / Pink `#FFEBF2` / Apricot `#FFEDD5` / Lavender `#F3E8FF`.

---

## 9. 관련 ADR

- **0001** Multi-profile identity (Phase 9) — `0011`, `0012` 의 토대
- **0002** Soft-delete in-place 익명화
- **0003** Email 기반 dedup
- **0004** cards 테이블 리네임 (구 qas)
- **0005** Active identity 쿠키 분리 (httpOnly + mirror)
- **0006** RLS 정책 전략
- **0007** 콘텐츠 자동 검수기 v1
- **0008** 흥미 점수 임계점 (v3=15)
- **0009** PWA 아이콘 2그룹 구조
- **0010** Visitor 1일 1방문 dedup
- **0011** Active identity 권한 시스템 (Phase 1 — 2026-05-26). `0001` 의 SQL 측 구현 (RLS·RPC 가 `current_active_profile_id()` GUC 인식). `0012` 와 양방향.
- **0012** 명함(profile) 단위 완전 독립 (Phase 3 — 2026-05-26). `0011` 의 application layer 확장. 묶음 OR 패턴 폐기, active 단위만 권한 판정. `0001` 의 "모든 profile 동등 독립" 원칙 강제.

---

**이 문서 변경 시**: 새 컴포넌트·라우트 추가는 `PRD.md §4` (핵심 기능) 와 `CHANGELOG.md` 양쪽 갱신.
