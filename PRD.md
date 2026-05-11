# 피부텐텐 (Pibutenten) — PRD & 개발 현황

> 마지막 업데이트: 2026-05-11 (Phase 6 — Q&A 파이프라인 v5 + 카드 v7)
> 기준 commit: `645ed82` (인라인 더보기 + Title Case + 어절 경계 룰)
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

### 작업 디렉토리 구조 (워크스페이스 루트 = `D:\Dropbox\Claude Code\260503 피부텐텐 웹앱개발\`)

코드 외 운영 자료가 워크스페이스 루트 (`pibutenten-app` 상위)에 별도 폴더로 정리되어 있음. Git 추적 X — 작업 환경에서만 참조.

| 폴더 | 용도 |
|---|---|
| `pibutenten-app/` | Next.js 앱 코드 (Git 추적, Vercel 배포 소스) |
| `자막/` | 유튜브 영상의 **수동 한글 자막** WebVTT 파일 (자동자막 X). 파일명 패턴 `{YYMMDD}_{video_id 또는 키워드}.ko.vtt`. Phase 6 Q&A 파이프라인의 1차 입력. |
| `전달용/` | **운영자가 작업 파일을 전달**하는 폴더. 사용자가 새 프롬프트·스펙·매핑 파일을 여기에 업로드하면 작업 진행. 현재 핵심 파일: `pibutenten_prompt_step1_v5.md`(자막→Q&A 카드), `pibutenten_prompt_step2_v2.md`(PubMed reference 매칭), `pibutenten-dev-spec-260510-v5.1.md`(앱 스펙), `slug-mapping.ts`, `procedure-mappings.json`. |
| `Q&A_백업/` | Phase 6 파이프라인의 **카드 산출물 JSON 백업**. 파일명은 자막과 동일 베이스(`{YYMMDD}_{id}.json`). DB INSERT 후에도 보존해 운영자가 본문·bold·reference 검토 가능. |

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

### post 카테고리 (sub-type) — 2026-05-11 최신
| 슬러그 | 라벨 | 비고 |
|---|---|---|
| Q&A (`type=qa`) | Q&A | 의사 답변 글 (구 `답해드려요`) |
| link (구 share, 구 news) | 공유하기 | URL 큐레이션 + 외부 공유. slug는 `link`로 변경 — 푸터 액션 `share(공유)`와 변수명 충돌 회피, 라벨은 그대로 |
| tip | 꿀팁 | 의사·회원 꿀팁 |
| diary | 피부일기 | 회원 일상 |
| ask | 궁금해요 | 회원 질문 |

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
| pubmed_ref | jsonb — 단일 PubMed 참고 논문 {pmid, doi, title, journal, year, authors_short, pubmed_url, doi_url, reasoning(내부)} (마이그레이션 `0037`) |

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

### Phase 6: Q&A 파이프라인 v5 + 카드 v7 + PubMed 참고문헌 (2026-05-11)

**파이프라인 (자막 → Q&A 카드 + PubMed 인용)**:
- 자막 폴더: `/자막/*.ko.vtt` (수동 한글 자막, 자동자막 X).
- 1단계 프롬프트 `전달용/pibutenten_prompt_step1_v5.md` — 영상 자막을 입력받아 Q&A 카드(최대 8개) + PubMed 검색 키워드 + 출처(`source.video_id/title/source_file/video_url`) 생성. 카드별 9 카테고리 분류, bold 위치-길이 비대칭(P1 10~25자 짧게 + P2 25~50자 길게), 한국어 어절 경계 룰, 두괄식 패턴 분산.
- 후처리: 카드별 `pubmed_search_keywords`로 PubMed API 호출 → 후보 5~10개 메타데이터 수집.
- 2단계 프롬프트 `전달용/pibutenten_prompt_step2_v2.md` — 후보 중 답안 핵심 주장을 직접 뒷받침하는 PMID 1개 선택 → `reference` 객체({pmid, doi, title, journal(Title Case 정규화), year, authors_short, pubmed_url, doi_url, reasoning(운영 내부)}). 적합 후보 없으면 `null`.
- 산출물 백업: `/Q&A_백업/*.json` (영상별 카드 묶음 + reference).

**DB 변경 (마이그레이션 `0037_qa_pubmed_ref.sql`)**:
- `qas.pubmed_ref jsonb` 컬럼 추가.
- `search_qas_scored` RPC 반환에 `pubmed_ref` 포함 (시그니처 갱신).
- `[handle]/[shortcode]`, `doctors/[slug]/[year]/[postSlug]` select 쿼리에 `pubmed_ref` 추가.

**최초 발행 16개 카드 (2026-05-11)**:
- 정한미(`jung-hanmi`, `93b30a7c-bd6f-4a98-b7fe-2c169cf07962`) 작성자, `type=qa`, `category=qa`, `status=published`, `post_year=2026`.
- 4편 영상 × 4카드: 쥬브젠(260430), 땅콩형 얼굴(260424), 스킨케어(260417), 힐로웨이브(260414).
- `external_url`에 YouTube 타임스탬프 링크. PubMed reference 13개 매칭 + 3개 null.

**카드 디자인 v7 (`QACard.tsx`)**:
- **본문 multi-paragraph**: `\n\n` 분리 후 단락 사이 `mt-2.5`.
- **bold 형광펜 하이라이트**: `<strong>`에 `linear-gradient(transparent 60%, rgba(255,230,90,0.55) 60%)` 인라인 스타일.
- **line-clamp 반응형**: closed 상태에서 첫 단락 `line-clamp-4 md:line-clamp-5`, 나머지 단락 hidden.
- **"더보기" 인라인**: 첫 단락 끝 inline `<span>`으로 작고 연하게(`text-[12px] text-[var(--text-muted)]/70`) 노출. line-clamp 자동 ellipsis만 활용, 별도 `…` 표기 X.
- **참고문헌 인라인 footer**: border 박스 제거. `<cite itemScope itemType="https://schema.org/ScholarlyArticle">` 한 줄 — "참고문헌" 작은 라벨(10px) + `Title — Authors, Journal (Year)`. 제목이 PubMed 링크(DOI는 JSON-LD에 보존). closed 상태에서는 hidden.

**JSON-LD Citation** (`/doctors/{slug}/{year}/{post-slug}` `acceptedAnswer.citation`):
- `@type: ScholarlyArticle`
- `name`, `url(DOI canonical)`, `sameAs(PubMed)`, `datePublished`, `publisher(Journal)`, `author(Authors)`, `identifier: PMID:...`

**v5 핵심 룰 요약 (Q&A 카드 작성)**:
- 분량 400~600자 / 8~10문장 / 2단락 기본.
- 카드당 bold **2개 권장(기본)**, 1개 가능, 0개는 예외(4카드 중 최대 1개).
- bold 위치-길이 비대칭: P1 10~25자 짧은 핵심 명사·수치, P2 25~50자 답+백데이터 통합 절.
- **한국어 어절 경계 룰**: 어간 + 어미/조사 분리 금지. `낮|고` X → `낮고` O / `손상|으로` X → `손상으로` O.
- 데코·엔게이지먼트 표현 bold 금지("딱 5분만 투자", "노화 방지의 기본").
- 시술명 단독 bold 금지(절에 포함 시 OK).
- 4카드 영상 단위 분포: P1+P2 둘다 50~75%, 1개 25~50%, 0개 ≤25%.
- 자체 검증: 2개 bold 카드 최소 2개 이상.

**v2 핵심 룰 요약 (PubMed 매칭)**:
- 적합도 우선순위: 주제 직접 일치 > 답안 주장 뒷받침 > Systematic Review/Meta-analysis > RCT > Clinical Trial > 한국 연구 가중(같은 적합도일 때).
- 적합 후보 없으면 `null` 반환. 억지 매칭 금지.
- **저널명 Title Case 정규화**: PubMed 원본 sentence-case → 주요 단어 첫 글자 대문자, 짧은 전치사·관사·접속사(`of, in, on, for, the, a, an, and, or, but, to`)는 첫 단어가 아니면 소문자. 약어(JAMA, BMJ, PLOS) 원본 유지.

**관련 commit**: `e1180ac` (RPC + 16 카드 + 디자인 초기) → `c9a18af` (v7 디자인) → `0efb420` (DOI→PubMed) → `a12d495` (더보기 라벨) → `ddab499` (참고문헌 한글화) → `8e9f3e8` (더보기 overlay) → `645ed82` (더보기 인라인).

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

### 좋아요/추천 분기 시도 + 푸터 개편 (`d950f4e`)
- **시도**: Q&A에 👍 추천(secondary navy), post에 ♥ 좋아요(accent coral) 분기
- 카테고리 slug `share` → `link` 마이그레이션 (0036_share_to_link.sql)
- prefetch identity_id 기반화

### 포커스 선 + dropdown 중복 fix (`e3f3797`)
- :focus-visible의 outline 강제 제거 (사용자 10회 이상 요청)
- layout.tsx에서 `profile.handle`과 동일한 `kind='primary'` row 중복 제거
  - 배정민 4개 → 3개로 정리 (개발자/원장/개인)

### 추천 폐기 → ♥ 좋아요 통일 + 푸터 순서 + 저장 노란색 (`c70ec40`)
- 👍 ThumbsUp 인지도 낮아 폐기, 모든 카드에서 ♥ 좋아요로 일원화
- RecentLikers·LikersDialog qaType prop은 호환성 유지하되 실제로는 무시
- 푸터 순서: 좋아요 → 댓글 → 저장 (좌측 묶음) → 공유 (우측 ml-auto)
- 저장 색: 하늘색 → **앰버 #F59E0B** (브랜드 톤앤매너 따뜻한 호박색)

### 저장 토글 진짜 원인 fix (`eb6fc61`)
- **증상**: 저장 한 번은 되는데 두 번째 클릭부터 취소 안 됨 (10회 신고)
- **원인**: `setSavePending(true)` 후 함수 끝에서 `setSavePending(false)` 호출 누락 → 첫 클릭 후 영원히 true로 stuck → 모든 후속 클릭이 `if (savePending) return;` 가드에 막힘
- **수정**: 전체를 `try/finally`로 감싸 finally에서 강제 false 처리

### 헤더 아바타 inline-flex fix (`942ddd6`)
- **증상**: 특정 사용자(세로로 긴 portrait 아바타)에서 헤더 IdentitySwitcher의 아바타가 28x28 동그라미가 아니라 원본 이미지 크기로 노출
- **원인**: Avatar wrapper가 `<span>` (기본 `display:inline`) → width/height 인라인 스타일 무시 → 박스 크기 0/inline → `overflow-hidden`·`rounded-full` 무력화 → 내부 `<img>`가 자연 크기로 폴백
- **수정**: `className`에 `inline-flex` 추가 (display 강제) — 다른 위치(Profile·Doctor·Admin)는 모두 `<div>`라서 영향 없음

---

## 8. 디자인 결정사항 (확정)

### 글쓰기 폼
- 라벨: **Q&A / 꿀팁 / 피부일기 / 물어봐요 / 공유하기**
- 모바일: 카테고리 칩 한 줄 가로 스크롤
- 키워드 max: qa 8 / post 4
- 액션 4버튼: 취소 / 저장 / 검수 요청 / 발행
- 글쓴이 선택 모든 type 고정 노출

### 카드 푸터 (피부텐텐 v5.1+ 확정)
- 아이콘 크기: 22px
- 텍스트: 14px
- gap: 4
- 0 카운트는 숨김 (좋아요·댓글·저장·공유)
- 별점: **숨김 (DB 보존, 부활 가능)**

**순서**: `[♥ 좋아요] [💬 댓글] [🔖 저장]` 좌측 묶음 / `[📤 공유]` 우측 (ml-auto)

**활성 색상**:
| 액션 | 비활성 | 활성 |
|---|---|---|
| ♥ 좋아요 | `text-secondary` (#62737E) | `--accent` 코랄 (#FF6B81) |
| 💬 댓글 | `text-secondary` | hover: `--primary` 하늘 |
| 🔖 저장 | `text-secondary` | **앰버 #F59E0B** (따뜻한 호박) |
| 📤 공유 | `text-secondary` | hover: `--primary` 하늘 |

**좋아요/추천 분기 폐기**: Q&A별 ThumbsUp 시도했으나 사용자 인지도 낮아 폐기. 모든 카드 ♥ 좋아요로 통일.

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

### 포커스 outline
- `:focus, :focus-visible` 모두 `outline: none !important` + `box-shadow: none !important`
- 사용자 강력 요청 — 클릭 후 잔상 파란 선 완전 제거
- 키보드 접근성은 브라우저 기본 동작에 위임

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
| `/doctors/{slug}/{year}/{post-slug}` | QAPage 또는 Article + Person author + **VideoObject** + **acceptedAnswer.citation (ScholarlyArticle)** + BreadcrumbList |
| `/tags/{태그}` | CollectionPage + ItemList |
| `/{handle}/{shortcode}` | 영구 noindex |

### 핵심 신호
- `Person.hasCredential` — 의사 면허 정보
- `MedicalOrganization` — 진솔컴퍼니 + 5개 지점
- `VideoObject` — YouTube 영상 URL/썸네일/이름 + **`startOffset`** (Phase 6.1, external_url의 `?t={N}s`에서 ISO 8601 `PT{N}S`로 변환 — 답변 구간 시작 지점 명시)
- `BreadcrumbList` — 모든 깊이 페이지
- `AggregateRating` — DB 보존 중이나 UI 숨김으로 인해 현재 노출 X
- **`ScholarlyArticle` Citation** (Phase 6) — acceptedAnswer.citation에 PubMed 참고문헌 {name, url(DOI), sameAs(PubMed), datePublished, publisher, author, identifier: PMID}. AI·검색엔진이 "의사 답변 + 학술 인용" 신호 인식.
- **`SpeakableSpecification`** (Phase 6.1) — cssSelector `.qa-answer-speakable`로 답안 첫 단락(두괄식 답) 음성/AI assistant 픽업 명시.
- **`Question.mainEntityOfPage`** (Phase 6.1) — Question entity와 WebPage cross-reference. Google이 페이지 주제와 Q&A 콘텐츠를 1:1 매핑으로 인식.
- **`publisher: Organization + MedicalOrganization`** (Phase 6.1) — 페이지 게시 책임 주체 명시(주식회사 진솔컴퍼니). YMYL E-E-A-T 신호 보강.

### h1 룰 (Phase 6.1)
- **단독 페이지**(`/doctors/{slug}/{year}/{postSlug}`, `/{handle}/{shortcode}`)의 질문은 **`<h1>`** — QACard에 `asH1` prop을 true로 전달.
- 메인 피드·검색·태그 페이지 등 **리스트 컨텍스트**에서는 카드 질문이 `<h2>` (페이지당 h1 1개 룰 준수).
- 단독 페이지 전체에 h1이 정확히 1개만 존재해야 검색엔진이 페이지 주제를 가장 강하게 인식.

---

## 10. 다음 작업 (TODO)

### 완료 (Phase 6, 2026-05-11)
- [x] **Q&A 추출 파이프라인 v5** — step1 v5 (자막→카드+키워드) + step2 v2 (PubMed reference 매칭)
- [x] **신규 16개 Q&A 카드 발행** — 정한미 4편 영상 × 4카드
- [x] **`qas.pubmed_ref` jsonb 컬럼** + `search_qas_scored` RPC 갱신 (마이그레이션 0037)
- [x] **카드 디자인 v7** — bold 형광펜·line-clamp 4/5·인라인 ref·"더보기" 인라인·"참고문헌" 라벨
- [x] **Schema.org Citation JSON-LD** — acceptedAnswer.citation에 PubMed 학술 인용 마킹
- [x] **저널명 Title Case 정규화** — DB 13건 일괄 + 프롬프트 룰 명시
- [x] **한국어 어절 경계 룰** 프롬프트 추가 (어간/조사 분리 금지)

### 완료 (Phase 6.1 — SEO/AEO 보강, 2026-05-11)
- [x] **`<h1>` 단독 페이지 적용** — QACard `asH1` prop, 메인 피드는 `<h2>` 유지
- [x] **VideoObject `startOffset`** — external_url의 `?t={N}s` → ISO 8601 `PT{N}S` 변환, videos 테이블 매핑 없어도 external_url에서 video_id 추출해 VideoObject 생성
- [x] **`Question.mainEntityOfPage`** cross-reference 추가
- [x] **`SpeakableSpecification`** — `.qa-answer-speakable` cssSelector, 본문 첫 단락 className 부여
- [x] **`publisher: Organization + MedicalOrganization`** — 진솔컴퍼니 명시

### 완료 (오후 라운드, 2026-05-11)
- [x] **헤더 아바타 inline-flex fix** — 원본 크기 노출 버그 (942ddd6)
- [x] **저장(북마크) 토글 버그 fix** — savePending stuck (eb6fc61)
- [x] **저장 아이콘 앰버 #F59E0B**로 변경 (c70ec40)
- [x] **아이콘 순서**: 좋아요/댓글/저장 좌측 묶음 + 공유 우측 (c70ec40)
- [x] **포커스 파란선** 완전 제거 (e3f3797)
- [x] **dropdown 중복 'primary' identity** 숨김 (e3f3797)
- [x] **카테고리 slug** share → link (d950f4e)

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

## 11. Q&A 작성 규칙 (Phase 6 — v5/v2 파이프라인 기준)

### 11.1 1단계 프롬프트 (자막 → 카드)
풀버전: `전달용/pibutenten_prompt_step1_v5.md`. 핵심 룰:

- **분량**: **400~600자, 8~10문장**, 2단락 기본(P1 직접 답·맥락 / P2 메커니즘·세부·비교·주의).
- **두괄식**: 첫 문장 50~70자, 질문에 대한 직접 답.
- **Specificity First**: 자막의 구체 수치·기간·용량·횟수를 정확히 옮김. 일반화·뭉뚱그리기 금지.
- **자막 외 정보 금지**: 추측·암묵 지식 X. `script_evidence`에 자막 원문 2~3 인용으로 검증.
- **bold(마크다운 `**`)** — `markdown`만 허용.
  - **카드당 2개 권장(기본 목표)**, 1개 가능, 0개는 예외(4카드 중 ≤1).
  - **위치-길이 비대칭**: P1 짧게 10~25자(핵심 명사·수치), P2 길게 25~50자(답+백데이터 통합 절).
  - **한국어 어절 경계 룰**: 어간/조사 분리 금지. `낮|고` X → `낮고` O / `손상|으로` X → `손상으로` O / `입증|되어` X → `입증되어` O.
  - 시술명 단독 bold·데코 표현("딱 5분만 투자", "노화 방지의 기본") bold 금지.
  - 단락당 ≤1, 총 분량 30~80자, 영상 단위 분포 50~75%가 P1+P2 둘다.
- **9 카테고리 + mechanism**: 시술 선택·비교 / 효과·지속기간 / 안전성·부작용 / 통증·시술 과정 / 다운타임·회복 / 시술 전 주의사항 / 시술 후 관리 / 비용·정품 확인 / 적합성·금기. 4카드는 최소 3개 카테고리 분포, ★★★ 등급 2개 이상.
- **단독 이해**: 다른 카드 없이 의미 통해야. 시술명 처음 등장 시 1~2단어로 짧게 풀어주기.
- **포맷 금지**: 표·불릿·번호 리스트·이모지·헤더·기타 마크다운 금지. `**bold**`와 단락 구분 `\n\n`만 허용.
- **문체**: 해요체·합니다체 5:5~6:4 혼합. 금지 어휘: "추천드려요"(→ "권해 드려요"), "한답니다", "정말/진짜/엄청/되게", "~거든요" 남발.
- **출처**: `source` 객체 `{video_id, video_title, source_file, video_url}` + `timestamp` + `pubmed_search_keywords` 영문 2~3개.

### 11.2 2단계 프롬프트 (PubMed reference 매칭)
풀버전: `전달용/pibutenten_prompt_step2_v2.md`. 핵심 룰:

- 적합도 우선순위: 주제 직접 일치 > 답안 주장 뒷받침 > Systematic Review/Meta-analysis > RCT > Clinical Trial > 한국 연구 가중(같은 적합도일 때).
- 적합 후보 없으면 `null` 반환. 억지 매칭 금지.
- 출력 `reference {pmid, doi, title, journal, year, authors_short, pubmed_url, doi_url}` + `reasoning(50~100자 운영 검수용)`.
- URL: `pubmed_url = https://pubmed.ncbi.nlm.nih.gov/{pmid}/`, `doi_url = https://doi.org/{doi}`.
- **저널명 Title Case 정규화**: PubMed 원본 sentence-case → 주요 단어 첫 글자 대문자, 짧은 전치사·관사·접속사(`of, in, on, for, the, a, an, and, or, but, to`)는 첫 단어가 아니면 소문자. 약어(JAMA, BMJ, PLOS) 원본 유지.
- `title`은 sentence-case 유지(학술 인용 관행).

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
2. **Vercel Pro 업그레이드** (월 $20) — 베타 비공개 운영 시 필요
3. **Naver OAuth** — Supabase 미지원, custom OAuth 부담
4. **댓글 author identification** — 현재 익명, 모더레이션 필요 시 hover 표시 검토
5. **회원 부계정(identity) 생성 플로우** — 의사는 자동, 회원은 수동 UX 미정
6. **멀티 identity 자동 primary row 처리** — 마이그레이션이 모든 profile에 자동 생성한 `kind='primary'` row가 dropdown에서 숨겨졌지만 DB에는 잔존. qa_likes/qa_saves FK 정리 후 redundant row 일괄 삭제 검토

---

## 14. 주요 변경 이력 (commit 단위)

| Commit | 내용 |
|---|---|
| `645ed82` | **카드 v7-final** — "더보기" 인라인 12px text-muted/70(overlay 제거), 참고문헌 라벨 한글화, JSON-LD sameAs+identifier, 저널명 Title Case |
| `8e9f3e8` | "더보기" overlay 시도(우하단 absolute + fade) → 인라인으로 재변경(645ed82) |
| `ddab499` | 참고문헌 라벨 한글화(`Reference`→`참고문헌`) + URL 텍스트 제거 |
| `0efb420` | ref 링크 DOI→PubMed 전환, JSON-LD에 DOI canonical + sameAs PubMed 보존 |
| `a12d495` | 접힌 카드에 "더보기" 라벨 추가(별도 줄, 이후 인라인으로 재설계) |
| `c9a18af` | **카드 v7 디자인** — 형광펜 bold(linear-gradient) + line-clamp 4/5 + 인라인 ref + Citation JSON-LD + v5 bold 재배치 |
| `e1180ac` | **Phase 6 발행** — `qas.pubmed_ref` jsonb + `search_qas_scored` RPC 갱신(마이그레이션 0037) + 16개 신규 카드 INSERT(정한미 4편) + QACard에 markdown bold·multi-paragraph·ref 박스 초기 구현 |
| `6fc8b4d` | PRD에 헤더 아바타 fix 라운드 정리 |
| `942ddd6` | **헤더 아바타 fix** — span inline 요소로 인한 원본 크기 노출 (inline-flex 추가) |
| `eb6fc61` | **저장 토글 진짜 fix** — savePending state stuck 해제 (try/finally) |
| `c70ec40` | 추천(👍) 폐기 → ♥ 좋아요 통일 + 푸터 순서(좌측 묶음 + 공유 우측) + 저장 앰버색 |
| `e3f3797` | 포커스 파란선 완전 제거 + dropdown 중복 primary identity 숨김 |
| `d950f4e` | Q&A 추천/post 좋아요 분기 시도 + 푸터 개편 + share→link slug 마이그레이션 + PRD 풀업데이트 |
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

> 본 문서는 라이브 코드(`pibutenten-app`)와 git 히스토리, 그리고 워크스페이스 운영 자료(`전달용/`, `자막/`, `Q&A_백업/`)를 함께 참조해 작성되었으며, Phase 6 (Q&A 파이프라인 v5 + 카드 v7) 정리까지 반영된 상태. 다음 라운드 작업(베타 전 점검·새 영상 추가 발행) 진행 시 갱신.
