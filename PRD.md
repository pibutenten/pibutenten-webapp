# 피부텐텐 (Pibutenten) — PRD & 개발 현황

> 마지막 업데이트: 2026-05-11
> 기준 commit: `f9ad701` (별점 시스템 숨김)
> 라이브: https://pibutenten-webapp.vercel.app

---

## 0. 프로젝트 개요

- **이름**: 피부텐텐 — 피부과 전문의가 함께하는 Q&A SNS
- **회사**: 주식회사 진솔컴퍼니
- **운영자**: jminbae@gmail.com
- **슬로건**: 피부가 예뻐지는 모든 이야기 / 피부가 예뻐지는 10분
- **현재 라이브**: https://pibutenten-webapp.vercel.app
- **정식 도메인 (예정)**: https://pibutenten.com
- **출시 계획**
  - 5월: 기본 개발 완료 → 5개 지점(강남·수원·판교·건대·대구) 직원·가족 비공개 베타
  - 6월: pibutenten.com 정식 런칭

### 핵심 원칙

- **AEO/GEO 우선** — LLM 인용을 1순위 노출 채널로 (JSON-LD 풀세트 + VideoObject + Citation)
- **YMYL 컴플라이언스** — 의료 사이트로서 신뢰 신호 빠짐없이 (MedicalOrganization, Person.hasCredential)
- **인덱싱 자산은 의사 글만** — 회원 글은 SNS UI에서만, `noindex`
- **UI 단순성** — 본인 활동/설정은 `/settings/*` 안에서 처리, 별도 드롭다운 X
- **멀티 아이덴티티 완전 분리** — 같은 사람이라도 좋아요·저장·댓글은 identity별 독립

---

## 1. 기술 스택

- **Next.js 16.2.4** (App Router, Turbopack), TypeScript strict
- **Supabase**: Auth (Email + Google OAuth + Kakao OAuth), Storage (`articles`, `avatars` bucket), RLS, Postgres RPC, Management API
- **Vercel**: ICN1 region, OG ImageResponse, 자동 배포
- **Anthropic Claude API**: `claude-opus-4-7` — AI Q&A 초안 자동 생성
- **YouTube Transcript**: 자막 fetch + fallback
- **Tailwind CSS v4** + CSS variables
- **react-masonry-css** — 가로 flow 단일 DOM 메이슨리
- **react-easy-crop** — 프로필 사진 정사각형 자르기

---

## 2. 도메인/리소스

### Supabase
- 프로젝트 ref: `nahznfvouuwxqctwlwfs`
- OAuth Callback: `https://nahznfvouuwxqctwlwfs.supabase.co/auth/v1/callback`
- Management API token: `.env.local` (`SUPABASE_ACCESS_TOKEN`)

### Google OAuth
- Cloud 프로젝트: `pibutenten`
- Client ID: `1043775518147-vpnnf87ags5j72qsi21nbg9n6a5pq3l1.apps.googleusercontent.com`
- 상태: ✅ 완료

### Kakao OAuth
- 앱 ID: `1449024`, REST API 키: `831e411169187b24e024157789de8ac1`
- 비즈 앱 전환 완료, account_email 권한 풀림
- 상태: ✅ 완료

### Vercel
- 프로젝트: `jminbaes-projects/pibutenten-webapp`
- Plan: Hobby → Pro 업그레이드 검토 (베타 비공개 운영 시 필요)

---

## 3. 카테고리 5색 팔레트 + 슬러그 (확정)

| 슬러그 | 라벨 | 색상 |
|---|---|---|
| concerns | 피부고민 | #7E57C2 (딥 라벤더) |
| lifting | 리프팅 | #29B6F6 (파스텔 하늘) |
| injectables | 스킨부스터 | #F48FB1 (연핑크) |
| homecare | 홈케어 | #BF6E5C (테라코타) |
| knowledge | 피부상식 | #9E9D24 (올리브) |

### 글 type
- `qa` — 일문일답 Q&A
- `post` — 일반 포스팅 (의사 꿀팁, 회원 공유, 일기 등)
- ~~`article`~~ — **칼럼 폐기됨 (commit 94f5aab)**

### post 카테고리 (sub-type) — 2026-05-10 정리
| 슬러그 | 라벨 | 비고 |
|---|---|---|
| Q&A (`type=qa`) | Q&A | 의사 답변 글 (구 `답해드려요`) |
| share (구 news) | 공유하기 | URL 큐레이션 + 외부 공유 (구 `새소식`) |
| tip | 꿀팁 | 의사·회원 꿀팁 |
| diary | 피부일기 | 회원 일상 |
| ask | 물어봐요 | 회원 질문 |

---

## 4. 등록 원장 (9명)

| 이름 | 슬러그 (handle) | 지점 |
|---|---|---|
| 정한미 | jung-hanmi | 강남 |
| 배정민 | bae-jungmin | 강남 |
| 권수현 | kwon-suhyun | 수원 |
| 김수형 | kim-soohyung | 수원 |
| 고혜림 | go-hyerim | 수원 |
| 김종식 | kim-jongsik | 판교 |
| 이도영 | rhee-doyoung | 건대 (대표) |
| 강현진 | kang-hyunjin | 건대 |
| 박효진 | park-hyojin | 대구 (대표) |

---

## 5. URL 구조 (확정·v5.1+ 최신)

### 공개 페이지
```
/                                           메인 피드 (피드 + 검색칩)
/search?q={query}                           검색 결과 (영구 noindex)
/tags/{한국어 태그}                          태그 페이지 (의사 글 4+, ISR 1h, 인덱싱)
/popular                                    인기글
/doctors                                    의사 리스트 (CollectionPage JSON-LD)
/doctors/{slug}                             의사 프로필 (외부) / 본인은 dashboard-only
/doctors/{slug}/{year}/{post-slug}          의사가 쓴 글 (인덱싱 자산)
/{handle}                                   회원 프로필 (year segment 없음)
/{handle}/{shortcode}                       회원이 쓴 글 (shortcode, year 없음, 영구 noindex)
/about                                      사이트 안내 (AboutPage + MedicalOrganization)
/login, /signup                             인증 (영구 noindex)
```

### 본인 영역 — `/settings/*` (구 `/me/*`에서 이전)
```
/settings                                   대시보드 (활동 요약)
/settings/profile                           프로필 수정 (identity-aware)
/settings/password                          비밀번호 변경
/settings/account                           계정 관리
/settings/skin                              피부 정보
/notifications                              알림 페이지 (자동 읽음 처리)
```

### 글쓰기 — `/write` 단일 진입
```
/write                                      새 글 작성
/write/{shortcode}                          기존 글 수정 (qa/post 통합)
```

### 관리자 — `/admin/*`
```
/admin                                      대시보드 (인기 검색어·태그 위젯 포함)
/admin/qas                                  전체 글 관리 (status·type·doctor·pick 필터)
/admin/draft                                초안 / 검수 대기 (AI 초안 생성)
/admin/users                                회원 관리
/admin/users/{id}                           역할 변경 + 원장 매핑 (RoleChangeForm)
/admin/doctors                              의사 프로필 관리
```

### 폐기된 URL
```
/qa/[id]              ✗ 삭제 (모두 /{handle}/{shortcode}로 통합)
/feed                 ✗ 삭제 (→ /)
/article/[slug]       ✗ 삭제 (칼럼 폐기)
/me/*                 ✗ 삭제 (→ /settings/*)
/me/qnas              ✗ 삭제
```

---

## 6. 데이터 모델 (최신)

### qas 테이블
| 컬럼 | 의미 |
|---|---|
| id | PK (bigint) |
| shortcode | text (회원 글 URL용, unique) |
| type | `qa` / `post` |
| category | `concerns` / `lifting` / `injectables` / `homecare` / `knowledge` (qa) <br/> `tip` / `diary` / `ask` / `share` (post) |
| status | `draft` / `pending_review` / `published` / `archived` |
| author_id | 작성자 (auth.users, nullable) |
| doctor_id | 글쓴이 원장 (nullable) |
| question | 제목 |
| answer | 본문 |
| keywords | text[] |
| is_pick | boolean (원장 추천 5개 한도) |
| like_count, view_count, share_count, comment_count, save_count | 카운트 |
| ~~rating_avg, rating_count~~ | **DB 보존, UI 숨김 (commit f9ad701)** |
| video_url | YouTube URL (VideoObject용) |
| published | boolean |
| created_at | |

### profiles 테이블
| 컬럼 | 의미 |
|---|---|
| id | auth.users.id |
| role | `admin` / `doctor` / `user` |
| handle | 영문 핸들 (예: `bae-jungmin`) |
| display_name | 표시명 |
| avatar_url | 아바타 |
| bio | 자기소개 |
| birthdate, gender | 공통 신원 |
| face_shape, skin_type | 피부 정보 |
| skin_concerns[], interested_procedures[], liked_procedures[] | 관심사 |
| field_visibility | jsonb (필드별 노출 정책) |
| marketing_email_consent | boolean |

### profile_identities 테이블 (멀티 identity, commit 83490ea)
| 컬럼 | 의미 |
|---|---|
| id | PK (uuid) |
| profile_id | profiles.id FK |
| kind | `primary` / `admin` / `personal` / 기타 |
| handle, display_name, avatar_url, bio | identity별 독립 |
| face_shape, skin_type, skin_concerns[], interested_procedures[], liked_procedures[], field_visibility | identity별 온보딩 |

- 모든 profile에 자동으로 `kind='primary'` row 생성
- 활성 identity = cookie `pibutenten:identity` ('primary' 또는 UUID)
- 같은 사람이라도 identity별로 좋아요/저장/댓글이 완전 분리됨

### doctor_accounts 테이블
- `profile_id` ↔ `doctor_id` 1:1 매핑
- admin이 `/admin/users/{id}` 에서 RoleChangeForm으로 관리
- doctor 매핑 시 profiles.display_name 자동 동기화

### qa_likes (commit f63aa59 — PK 변경)
- PK: `(identity_id, qa_id)` (구: `(user_id, qa_id)`)
- `identity_id` NOT NULL
- legacy NULL 로우는 primary identity로 백필됨

### qa_saves (commit f63aa59 — PK 변경)
- PK: `(identity_id, qa_id)` (구: `(qa_id, user_id, persona)`)
- 동일하게 identity 기반

### comments
- `identity_id` 컬럼 추가
- parent_id로 1단계 답글 지원

### notifications 테이블 (commit 1e8d937)
- 트리거: `on_qa_like_added`, `on_comment_added`
- profile 단위 발송 (identity가 아닌 사람 단위)

### search_logs 테이블 (commit 83490ea)
- /search 페이지에서 query 자동 로깅
- admin 인기 검색어 위젯 소스

### 주요 RPC
- `increment_qa_view(p_qa_id)` — 조회수 +1
- `toggle_qa_like(p_qa_id, p_identity_id)` — NULL → primary 자동 lookup + 보안 체크
- `toggle_qa_save(p_qa_id, p_identity_id)` — 동일 패턴
- `toggle_qa_pick(p_qa_id, p_pick)` — Pick on/off
- `get_recent_likers(p_qa_id, p_limit)` — identity-based join
- `get_indexable_tags(p_min_count)` — 의사 글 N개 이상 태그
- `get_top_search_queries(p_days, p_limit)` — admin 위젯
- `get_unread_notifications_count`, `get_notifications`, `mark_notifications_read`
- `link_doctor_to_profile`, `unlink_doctor_from_profile` — admin RPC
- `get_profile_month_stats` — 원장 대시보드 위젯

---

## 7. 완료된 기능 — 시간순 (2026-05-06 이후)

### Round 1: URL 통합 (`b7baa1f`, `b495028`)
- `/qa`, `/feed` 라우트 삭제
- `/write/{shortcode}` — qa·post 통합 수정
- 회원 URL `/{handle}/{shortcode}` (year segment 제거)
- `/feed → /` 301 redirect 제거 (라우트 자체 삭제)
- 모든 카드 태그 끝에 카테고리 칩 자동 추가 → 클릭 시 동일 카테고리 검색

### Round 2: 단일 DOM 메이슨리 + 댓글 + URL 미리보기 (`d816069`)
- `react-masonry-css` 도입 — 가로 flow, 좌→우 자연 채움
- 모바일/데스크탑 듀얼 렌더 제거
- 푸터 share count 0 숨김
- 댓글 spacing py-1.5 → py-1
- URL preview `'` 잘림 fix (extractMeta regex)

### Round 3: /tags 라우트 (`3d861e0`)
- `/tags/{한국어 태그}` 신설, ISR 1h
- 의사 글 4+ 최소 노출
- JSON-LD `CollectionPage` + `ItemList`
- RPC `get_indexable_tags` 추가

### Round 4: /doctors·/about JSON-LD (`75a99aa`)
- `/doctors`: CollectionPage + ItemList + Person @id 참조
- `/about`: AboutPage + MedicalOrganization
- 의사 카드 /about에서 제거 (중복 정리)

### Round 5: 인스타식 좋아요 (`1822a2e`, `8f1bcd6`, `be54288`)
- 아바타 겹침 (좌측이 z-top, `-space-x-2.5`)
- "OOO님 외 N명이 좋아합니다"
- `LikersDialog` — N명 클릭 시 리스트 열림
- 카드에서 조회수 표시 제거

### VideoObject (`75da211`)
- 의사 Q&A 페이지 schema에 VideoObject 추가 (AI 인용 친화)

### 칼럼 폐기 (`94f5aab`)
- `src/app/article/`, `src/lib/article/` 디렉토리 삭제
- `QAFeed` → `Feed`로 이름 변경 (Universal Card Feed)

### /me → /settings + Title 형식 (`c2a6bf9`, `2d39b1d`)
- 모든 `/me/*` → `/settings/*` (SNS 표준 like Twitter/Instagram)
- `/me/qnas` 폐기
- `/{handle}` doctor redirect 추가
- Title template `"%s | 피부텐텐"` → `"피부텐텐 | %s"` (prefix)
- 메인: `피부텐텐 | 피부과 전문의가 답하는 리프팅·스킨부스터 Q&A 라운지`

### 카테고리 정리 + 글쓰기 칩 + 공유 toast (`ced89ad`)
- DB 마이그레이션: `news` → `share` (CHECK constraint 갱신)
- 라벨: 답해드려요 → Q&A, 새소식 → 공유하기
- 모바일 글쓰기 카테고리 칩 `flex-nowrap + overflow-x-auto` (한 줄)
- 공유 취소 시 toast 안 뜨게 (AbortError handling)

### 푸터 아이콘 확대 (`350603b`)
- 카드 footer 아이콘 18px → 22px (인스타 표준)
- text 13px → 14px, gap-3.5 → gap-4

### 알림 시스템 (`1e8d937`, `9a7abd5`, `777583e`)
- `notifications` 테이블 + RLS
- Trigger: `on_qa_like_added`, `on_comment_added`
- RPC: `get_unread_notifications_count`, `get_notifications`, `mark_notifications_read`
- `NotificationBadge` — 헤더 아바타 우상단 빨간 배지 (60초 폴링)
- `/notifications` 페이지 — 자동 읽음 처리
- 배지 클릭 → `/notifications` Link

### 이미지 자르기 (`09338f9`)
- `react-easy-crop` 설치
- `ImageCropDialog` — 드래그·확대로 정사각형 위치 조정
- `ProfileEditClient` 통합

### Identity-aware 프로필 수정 + 원장 대시보드 위젯 (`3d79b26`)
- `ProfileEditClient`: 활성 identity에 따라 profile vs profile_identities 업데이트
- doctor 1차 계정: 사진/이름 입력 disabled + "관리자가 관리" 안내
- 원장 대시보드 위젯 (stats, quick actions)
- 헤더 dropdown 정렬: 관리자 → 원장 → 개인

### iPhone Safari 자동 확대 방지 (`774bdc0`)
- 모바일 (≤640px) input/textarea/select: `font-size: 16px !important`
- 댓글 등록 버튼 가려지는 문제 해결

### Disabled UI + 다이얼로그 헤더 + 아바타 통일 (`3ab010f`)
- 사진·이름 input 강제 disabled (원장 1차)
- `LikersDialog` flex-col + max-h-[85vh]
- 아바타 fallback h-6 → h-7 (image와 크기 통일)

### Bottom sheet + 닉네임 공백 (`b8b1a39`)
- LikersDialog 모바일 bottom sheet
- "배스킨님 외 N명" — `님` 앞 공백 제거

### 원장 매핑 RPC + identity 컬럼 + admin 위젯 (`83490ea`)
- RPC: `link_doctor_to_profile`, `unlink_doctor_from_profile`
- `profile_identities` ADD: face_shape, skin_type, skin_concerns[], interested_procedures[], liked_procedures[], field_visibility
- `search_logs` + `get_top_search_queries`
- /search 페이지 로깅
- admin 대시보드 인기 검색어/태그 위젯
- bottom sheet 화면 전체 너비

### 좋아요 다이얼로그 컴팩트 (`d0d3e5b`)
- id 제거, 작은 아바타, 한 줄 2~3명

### 원장 본인 페이지 dashboard-only (`440e3e1`)
- 원장이 자기 `/doctors/{slug}` 들어가면 외부 뷰 숨김 → dashboard만
- `DoctorOwnerWidget` (stats)
- `DoctorCommentsWidget` (받은 댓글)
- "프로필 수정" 링크 제거 (admin이 관리)
- 좋아요 칩 wrap 레이아웃 (3~5명/줄)

### 좋아요 다이얼로그 중앙 팝업 (`995ad67`, `a50ccf2`)
- bottom sheet → 중앙 팝업 (모바일·데스크탑 동일)
- `rounded-2xl` 전 모서리, `max-w-[400px] + max-h-[80vh]`
- `likersPop` 애니메이션 (fade + scale-up, 180ms)
- body scroll 잠금 제거 (페이지 자유롭게 스크롤)

### 멀티 identity 완전 분리 (`f63aa59`)
- 모든 profile에 `kind='primary'` row 자동 생성 (15개)
- `qa_likes` PK: `(user_id, qa_id)` → `(identity_id, qa_id)`, identity_id NOT NULL
- `qa_saves` PK: `(qa_id, user_id, persona)` → `(identity_id, qa_id)`
- legacy NULL identity_id 백필 (primary로)
- `toggle_qa_like`, `toggle_qa_save` — NULL identity 자동 lookup + 보안 체크
- `get_recent_likers` identity-based join
- QACard 저장: 직접 INSERT/DELETE → `toggle_qa_save` RPC

### 별점 시스템 숨김 (`f9ad701`)
- 카드 푸터 별점 div에 `hidden` 클래스 추가
- DB 컬럼·RPC 모두 보존 (`rating_avg`, `rating_count`)
- 향후 부활 옵션 열림

---

## 8. 디자인 결정사항 (확정)

### 글쓰기 폼
- 라벨: **Q&A / 꿀팁 / 피부일기 / 물어봐요 / 공유하기**
- 모바일: 카테고리 칩 한 줄 가로 스크롤
- 키워드 max: qa 8 / post 4
- 액션 4버튼: 취소 / 저장 / 검수 요청 / 발행
- 글쓴이 선택 모든 type 고정 노출

### 카드 푸터 (Instagram 표준)
- 아이콘 크기: 22px
- 텍스트: 14px
- gap: 4
- 0 카운트는 숨김 (좋아요·댓글·공유)
- 별점: **숨김 (DB 보존, 부활 가능)**

### 좋아요 표시
- 아바타 겹침: 좌측이 z-top, `-space-x-2.5`
- 텍스트: "OOO님 외 N명이 좋아합니다" (님 앞 공백 X)
- N명 클릭 → 중앙 팝업 다이얼로그
- 다이얼로그: max-w-[400px] + max-h-[80vh], rounded-2xl, body scroll 허용
- 컴팩트 칩 그리드 (id 제거, 아바타 + 닉네임)

### 댓글
- body + 시간만 (닉네임/배지/아바타 숨김)
- 미리보기 3개, 초과 시 "모두 보기"
- 입력폼은 댓글창 열렸을 때만
- textarea: resize none + 자동 확장

### 공유
- 클릭 카운트 (중복 허용)
- 취소 시 toast 안 뜨게 (AbortError 처리)

### Pick
- 5개 한도, 별 클릭 토글

### Title 패턴
- `피부텐텐 | {페이지 제목}` (prefix)
- 메인: `피부텐텐 | 피부과 전문의가 답하는 리프팅·스킨부스터 Q&A 라운지`

### 멀티 identity
- 같은 사람이라도 좋아요/저장/댓글은 identity별 완전 분리
- 정한미: 1개 identity (의사)
- 배정민: 3 identities (개발자=admin / 배정민=원장 / 배스킨=개인)
- 활성 identity는 cookie `pibutenten:identity` 기반
- 헤더 dropdown 순서: 관리자 → 원장 → 개인

### 원장 권한 보호
- 1차 계정(`role='doctor' && !activeIdentity`) 사진/이름 read-only
- 관리자가 `/admin/users/{id}`에서 매핑·관리
- 원장 자기 `/doctors/{slug}` = dashboard만 (외부 뷰 숨김)

### 모바일 UX
- input/textarea/select: `font-size: 16px !important` (iOS Safari zoom 방지)
- bottom sheet 풀너비 + slideUp 애니메이션
- 헤더와 main 동일 패딩 (`max-w-[1080px] px-4 sm:px-6`)

---

## 9. SEO / JSON-LD 구조화 데이터

### 인덱싱 정책
- 의사 글 + 일부 회원 꿀팁만 인덱싱
- 회원 프로필·검색·관리자: 영구 noindex
- 베타 기간: 전 페이지 noindex

### 페이지별 스키마
| 페이지 | JSON-LD |
|---|---|
| `/` | WebSite + SearchAction |
| `/about` | AboutPage + MedicalOrganization |
| `/doctors` | CollectionPage + ItemList + Person @id |
| `/doctors/{slug}` | Person + MedicalBusiness (지점) + hasCredential |
| `/doctors/{slug}/{year}/{post-slug}` | QAPage 또는 Article + Person author + **VideoObject** (영상 있는 경우) + BreadcrumbList |
| `/tags/{태그}` | CollectionPage + ItemList |
| `/{handle}/{shortcode}` | 영구 noindex |

### 핵심 신호
- `Person.hasCredential` — 의사 면허 정보
- `MedicalOrganization` — 진솔컴퍼니 + 5개 지점
- `VideoObject` — YouTube 영상 URL/썸네일/이름
- `BreadcrumbList` — 모든 깊이 페이지
- `AggregateRating` — DB 보존 중이나 UI 숨김으로 인해 현재 노출 X

---

## 10. 다음 작업 (TODO)

### 즉시 (현재 작업 중)
- [ ] **저장(북마크) 토글 버그 fix** — 한 번 더 누르면 취소되어야 하는데 안 됨
- [ ] **저장 아이콘 노란색**으로 변경 (amber-500 계열)
- [ ] **아이콘 순서 표준 결정** — Instagram 패턴 (좋아요 → 댓글 → 공유 → 저장) 적용

### 별점 시스템 결정 보류
- 현재 hidden 상태, DB·RPC 모두 보존
- **3개 옵션**:
  1. 현 상태 유지 (숨김) ← 권고
  2. 별점 → "도움됐어요" 바이너리 버튼 (StackOverflow 패턴)
  3. 부활 (의사 페이지에만 종합 평점)

### 베타 전 (5월)
- [ ] Vercel Pro 업그레이드 결정 (Password Protection 베타 비공개용)
- [ ] iOS/Android 실기기 통합 QA (카카오 로그인, 댓글 입력, 좋아요 다이얼로그)
- [ ] `/settings/account` 보강 (이메일/탈퇴)
- [ ] `sitemap.xml`, `robots.txt` 본격 작성
- [ ] 멀티 identity onboarding 플로우 (의사 부계정 생성)

### 베타 운영 중
- [ ] Vercel Password Protection으로 비공개 운영
- [ ] Umami self-hosted (analytics.pibutenten.com)
- [ ] Naver Webmaster Tools 등록
- [ ] AEO/GEO manual log 입력 폼

### 정식 런칭 (6월)
- [ ] pibutenten.com 도메인 Vercel 연결
- [ ] Password Protection 해제
- [ ] OG 이미지 prod URL 업데이트
- [ ] `/privacy`, `/terms` 페이지 신설
- [ ] Google Search Console + Rich Results Test verify

---

## 11. Q&A 작성 규칙 (변경 없음)

- **분량**: 7~8문장 / 350~450자
- **두괄식**: 첫 문장에 결론·핵심
- **단독 이해**: 다른 Q&A 없이도 시술 정의·핵심 정보 매번 포함
- **금지**: 마크다운 강조(`**`), 불필요한 부연·반복
- **전문 용어**: 괄호로 짧게 풀어주기
- **답변 톤**: 친근하지만 전문적 ("효과가 있을 수 있어요/추천드려요")

---

## 12. 사용자 선호 (개발 협업)

- 한국어 + 존댓말
- 간결·직설적
- 변경 후 자동 commit & push
- 시간 추정 표현 X
- "원장님" 호칭 통일
- 일괄 진행 우선 (묻지 말고 진행 후 한꺼번에 검토)

---

## 13. Open Questions / 결정 보류

1. **별점 시스템 부활 여부** — 현재 숨김. 부활 시 SNS 맥락에서 부자연스러움 vs E-E-A-T 신호 트레이드오프
2. **저장 토글 색상** — 노란색 확정. 정확한 톤 (amber-500 / yellow-500) 미확정
3. **아이콘 순서** — Instagram 표준 (♥ 💬 📤 🔖) 적용 권고, 사용자 결정 대기
4. **Vercel Pro 업그레이드** (월 $20)
5. **Naver OAuth** — Supabase 미지원, custom OAuth 부담
6. **댓글 author identification** — 현재 익명, 모더레이션 필요 시 hover 표시 검토
7. **회원 부계정(identity) 생성 플로우** — 의사는 자동, 회원은 수동 UX 미정

---

## 14. 주요 변경 이력 (commit 단위)

| Commit | 내용 |
|---|---|
| `f9ad701` | 별점 시스템 사용자 화면 hide (DB 보존) |
| `f63aa59` | 멀티 identity 완전 분리 — qa_likes·qa_saves PK identity 기반 |
| `a50ccf2` | 좋아요 팝업 떠 있을 때 페이지 스크롤 허용 |
| `995ad67` | LikersDialog 중앙 팝업 (모바일·데스크탑 동일) |
| `440e3e1` | 원장 본인 페이지 dashboard-only + 받은 댓글 위젯 |
| `d0d3e5b` | 좋아요 다이얼로그 컴팩트 (id 제거, 1줄 2~3명) |
| `83490ea` | 원장 매핑 RPC + identity 온보딩 컬럼 + admin 인기 검색어/태그 |
| `b8b1a39` | LikersDialog bottom sheet + 닉네임 공백 제거 |
| `3ab010f` | disabled UI + 아바타 크기 통일 |
| `774bdc0` | iPhone Safari 자동 확대 방지 (16px) |
| `3d79b26` | identity-aware ProfileEditClient + 원장 위젯 + dropdown 정렬 |
| `09338f9` | 프로필 사진 자르기 (react-easy-crop) |
| `777583e` | /notifications 페이지 + 자동 읽음 |
| `9a7abd5` | 배정민 multi-identity 정리 + 알림 트리거·배지 |
| `1e8d937` | identity_id INSERT + notifications 테이블 |
| `ba21674` | 인스타식 좋아요 다이얼로그 1차 |
| `350603b` | 푸터 아이콘 22px (인스타 표준) |
| `ced89ad` | 카테고리 정리 (news→share, 답해드려요→Q&A) + 공유 toast 제거 |
| `2d39b1d` | 메인 title 변경 |
| `c2a6bf9` | /me → /settings 마이그레이션 + title 형식 변경 |
| `8f1bcd6` | 좋아요 아바타 z-order + 조회수 표시 제거 |
| `94f5aab` | 칼럼 완전 폐기 + QAFeed→Feed 리네임 |
| `75da211` | 의사 글 VideoObject 추가 |
| `1822a2e` | 인스타식 좋아요 표시 — 아바타 + N명 |
| `75a99aa` | /doctors·/about JSON-LD 풀세트 |
| `3d861e0` | /tags/{태그} 라우트 신설 |
| `d816069` | masonry 단일 DOM + footer share 0 숨김 |
| `b7baa1f` | URL 통합 — /qa·/feed 폐기 + /write/{shortcode} 통합 |

---

> 본 문서는 라이브 코드(`pibutenten-app`)와 git 히스토리를 기준으로 작성되었으며, 다음 결정 사항(별점·저장 색·아이콘 순서) 확정 후 다시 업데이트 예정.
