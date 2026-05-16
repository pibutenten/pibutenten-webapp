# 피부텐텐 (Pibutenten)

피부과 전문의가 함께하는 피부 미용 SNS / Q&A 검색 엔진.

- **Production**: https://pbtt.kr
- **Stack**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres + RLS + RPC + Storage) · Vercel
- **AI**: Anthropic Claude (`@anthropic-ai/sdk`) — AI 글 초안 워크플로
- **Form factor**: 모바일 우선 PWA (모바일 1단 / 데스크탑 ≥900px 2단, 최대 너비 1080px)
- **YouTube**: https://www.youtube.com/@pibutenten

## 개발

```bash
npm install
cp .env.local.example .env.local   # 환경변수 채우기 (SUPABASE / ANTHROPIC / NAVER / VAPID 등)
npm run dev                         # http://localhost:3000
```

## 주요 라우트

### 공개 페이지
| 경로 | 설명 |
|---|---|
| `/` | 홈 (검색 + CategoryWithChips + 피드) |
| `/search` | 검색 결과 |
| `/topics/[tag]` | 태그별 글 목록 (SEO 인덱싱) |
| `/doctors` | 원장님 목록 |
| `/doctors/[slug]` | 원장님 소개 (동적 OG) |
| `/doctors/[slug]/[year]/[postSlug]` | 원장님 글 단독 페이지 |
| `/[handle]` | 사용자/원장 프로필 |
| `/[handle]/[shortcode]` | 회원 글 단독 페이지 |
| `/about`, `/privacy`, `/terms`, `/doctor-guidelines` | 법적/소개 페이지 |

### 인증·온보딩
| 경로 | 설명 |
|---|---|
| `/login`, `/signup` | 인증 |
| `/auth/callback` | OAuth 콜백 (약관/온보딩 가드) |
| `/onboarding` | 추가정보 입력 |

### 사용자 영역
| 경로 | 설명 |
|---|---|
| `/settings` | 대시보드 (admin 도구 + doctor 통계 + user Hero) |
| `/settings/profile` | 프로필 수정 |
| `/settings/notifications` | 알림 설정 |
| `/notifications` | 알림 목록 |
| `/write`, `/write/[shortcode]` | 글 작성·수정 |

### 관리자 영역 (role=admin/doctor)
| 경로 | 설명 |
|---|---|
| `/admin` | 운영 대시보드 |
| `/admin/cards`, `/admin/cards/[id]/edit` | 카드 관리·편집 |
| `/admin/comments`, `/admin/users`, `/admin/doctors` | 운영 관리 |
| `/admin/draft` | AI 글 초안 생성 (YouTube → 검수 → 발행) |
| `/admin/stats/[kind]` | 세부 통계 |

API 라우트 전체 명세는 상위 디렉토리의 `prd.md` 참고 (단일 SSOT).

## 디렉터리 구조

```
src/
├── app/                       # Next.js App Router
│   ├── layout.tsx             # max-w 1080 컨테이너 + Sticky TopNav + ScrollManager
│   ├── page.tsx               # 홈 피드
│   ├── (route)/page.tsx       # 페이지들
│   ├── (route)/[Client].tsx   # 클라이언트 페이지 컴포넌트
│   └── api/                   # API 라우트 (cards/comments/notifications/push/upload/identity/auth/admin/me/og-extract/preview-link)
├── components/                # 공용 React 컴포넌트
│   ├── card/                  # Card 시스템 (Header/Body/Media/Actions + hooks + utils)
│   └── *.tsx                  # TopNav, Feed, IdentitySwitcher, CommentsBlock, …
├── lib/                       # 비즈니스 로직 / 유틸
│   ├── supabase/              # 3종 클라이언트 (client/server/admin)
│   ├── ai/                    # Claude 초안 파이프라인 (step1/step2/pubmed/youtube-*)
│   ├── auth/                  # OAuth (naver, providers)
│   ├── schema/                # JSON-LD (doctor/clinic/procedure)
│   ├── identity*.ts           # Identity 시스템 (Phase 9)
│   └── *.ts                   # card-url, hot-ids, picks, normalize-body, …
├── data/                      # 정적 매핑 데이터 (procedure-mappings)
└── middleware.ts              # 약관/온보딩 가드 + CSRF Origin 검증
supabase/
├── migrations/                # SQL 마이그레이션 (0001~)
└── MIGRATION_HISTORY.md       # 동일번호 충돌·실행 순서 명문화
```

## Identity 시스템 (Phase 9)

- 쿠키: `pibutenten:identity` = `primary` 또는 profile.id (UUID)
- 같은 `auth_user_id` 묶음으로 묶인 독립 profiles row 다수 (의사·일반 분리)
- 좋아요·저장·댓글 등 모든 인터랙션의 user_id/author_id = active profile.id
- 의사 vs 회원 구분은 오직 `doctor_accounts` 매핑 유무로 판단

## 보안 / 정책

- 약관 동의·온보딩 강제 게이트 (`middleware.ts`)
- CSRF Origin 검증 (allow-list: `pbtt.kr`, `*.vercel.app`, localhost)
- SSRF 가드 (`src/lib/ssrf-guard.ts`) — DNS + IPv4/IPv6 사설 대역 + 메타데이터 호스트 + redirect 매 hop 재검증
- 업로드: magic byte 검증 + sharp EXIF 제거 + UUID 파일명 + 8MB 한도
- soft-delete 익명화 (StackOverflow 방식 in-place 마스킹)
- 시크릿 노출 이력: `SECURITY.md`

## 배포

- **Domain**: https://pbtt.kr (canonical)
- **Hosting**: Vercel (Region: ICN1 Seoul)
- **Auto-deploy**: ON (`vercel.json` `git.deploymentEnabled: true`)
- **Repo**: Private GitHub
