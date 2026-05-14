# 피부텐텐 (Pibutenten) — PRD & 개발 현황

> 마지막 업데이트: 2026-05-14 (qas → cards 전면 rename + 알림 시스템 + 메트릭 재정의)
> 기준 commit: `ed17067` (cards 1차) — 이후 추가: /admin/cards + 파일 rename Phase 2

## 🆕 2026-05-14 후반 작업 (현재 세션)

### 1) qas → cards 전면 rename (Option C 확정)
- **DB 변경 (migration 0065)**:
  - 테이블 rename: `qas → cards`, `qa_views/likes/saves/shares/impressions/ratings → card_*`
  - 컬럼 rename: 모든 외래키 `qa_id → card_id` (comments, notifications + 6개 metric 테이블)
  - 인덱스 25개 모두 rename (`qas_*/qa_* → cards_*/card_*`)
  - **임시 backwards-compat VIEW 7개 (qas, qa_views, ...)** — 39개 legacy RPC 함수가 즉시 깨지지 않도록.
    PostgreSQL은 simple view를 인라인 처리 → 성능 비용 0. 영구 abstraction layer로 유지.
- **코드 변경 (38 파일)**:
  - `.from('qas')` → `.from('cards')`, qa_* → card_*
  - `qa_id` 82회 → `card_id`
  - 관계 alias: `qa:qas(...)` → `qa:cards(...)` (응답 변수명 `qa` 보존 → 호환)
- **디렉토리/파일 rename (Phase 2)**:
  - `/api/qas/route.ts` → `/api/cards/route.ts`
  - `/admin/qas/*` → `/admin/cards/*` (전체 디렉토리)
  - `src/components/QACard.tsx` → `Card.tsx`
  - `src/lib/qa-url.ts` → `card-url.ts`
  - `src/lib/qa-highlight.ts` → `card-highlight.ts`
- **보류한 작업** (별도 phase):
  - 39개 legacy RPC 함수 body 마이그레이션 (`from qas` → `from cards`) — compat view 통해 정상 동작 중이라 우선순위 낮음
  - qa_type enum 'article' 값 물리 제거 — RLS policy 의존성 다수, cosmetic 비용 vs 효용

### 2) 알림 시스템 구축 (migration 0062 + 0063)
- 6종 trigger: `comment` / `reply` / `like` (24h debounce) / `new_ask` (모든 원장) / `review_request` / `published`
- TopNav 우측 종(🔔) + 빨간 배지 + 드롭다운 (20건)
- 60초 폴링, 클릭 시 자동 모두 읽음 처리
- **PWA Badge API** (`navigator.setAppBadge`) — 홈 화면 앱 아이콘에 미확인 수 표시
- `/settings/profile` 하단 알림 종류별 on/off 설정 (6개 토글, 즉시 자동 저장)
- 알림 설정 default true, role 별 노출 항목 분기 (`review_request`/`new_ask`는 doctor/admin 한정)

### 3) 메트릭 정의 재정립 (migration 0061)
- 옛 마운트 즉시 INSERT 누적된 `qa_views` 부풀려진 데이터 → 전체 리셋
- `get_admin_kpi` 재정의:
  - **방문자 = unique(user|session) FROM card_impressions** — 페이지 로드만 해도 카운트 (자연스러운 UV)
  - **조회수 = count(*) FROM card_views** — 4-10초 dwell 통과만 (의도 신호)
- `get_top_visitors` 도 card_impressions 기반

### 4) 작성자(author_id) Phase 9 정합성 복구 (migration 0060 + 0064)
- `publish/route.ts` 옛 코드가 `author_id = auth.users.id` 저장 → Phase 9 신규 profile에서 JOIN 실패 → "(작성자 없음)"
- migration 0060: NULL/orphan author_id → admin profile / doctor profile 로 일괄 복구
- migration 0064: doctor_id 있는 카드는 `author_id = doctor_accounts.profile_id` 강제 교체 (admin이 author로 남은 잔여 정리)
- 새 publish: `author_id = doctor's profile_id` (검수 발행 시) / `admin profile_id` (직접 발행 시)

### 5) Q&A 화면 개선
- 댓글 많은 글 TOP에 글 본문 댓글(대댓글 포함) **항상 펼침** — `CommentsBlock` 부모-자식 트리, 답글은 `↳` 들여쓰기
- TOP 리스트 한 줄 레이아웃: rank 번호(1,2,3,4) 제거 → `닉네임(좌, 고정폭) · 제목(가운데, truncate) · 카운트(우)`
- StatsListClient: 작성자 display_name 우선 표시 (handle 폴백)
- QACard ⋮ 메뉴 권한 복구: Phase 9 묶음 내 모든 profile.id 매칭으로 admin/원장 모두 ⋮ 노출

### 6) type='article' 코드 정리
- TypeScript type union 5곳 `'article'` 제거 (qas/page, users/[id], write/page, write/EditClient, QACard, qa-url)
- v5.1 deprecation 주석 정리 (sitemap, articles route, WriteClient)
- DB enum 값은 보존 (물리 제거는 RLS policy 의존성으로 별도 phase)

### 7) 편집기 개선
- 영상 URL → 외부 링크 라벨 (video 아닐 수도)
- PubMed URL/PMID 모두 입력 가능 (regex `\d{6,9}` 자동 추출)
- 태그 자동 추출 버튼 (✨) — `/api/admin/extract-keywords` (Claude Opus 4.7 호출)

### 8) UI 정리
- /write 액션 버튼 순서: 초기화 / 저장 / 검수 요청 / 올리기
- /write Phase 9 active identity 기반 role 결정 (사람 부계정 권한 차단)
- 톤 다운: `--primary` `#5FA8D3 → #8BC3DE` (전역)
- 좋아요 안 눌림 fix (anon path 제거, RPC silent fail 방지)
- 4 페이지 footer 순서 통일 (about/privacy/terms/doctor-guidelines)
- 관리자/원장/회원 대시보드 모두 하단 LogoutButton 통일

## 🟢 진행 상황 한눈에
- ✅ Phase 9 — multi-ID 단순화 (profiles + auth_user_id 묶음), `profile_identities` table·`identity_id` 컬럼 모두 drop (migration 0055)
- ✅ admin API 10개 권한 검사 → `auth_user_id` 묶음 기준 helper(`requireAdmin` / `requireAdminOrDoctor`)
- ✅ 영상 URL 백필 994/994 카드
- ✅ Admin 대시보드: KPI 6종 + 5개 기간 prefetch (방문자/조회수/댓글/좋아요/저장/공유)
- ✅ 인기 검색어·태그 6개 기간 prefetch (클릭 시 깜빡임 0)
- ✅ /admin/comments 신규 페이지 (제목 → ↳ 댓글 본문)
- ✅ qa_views / qa_shares 이벤트 로그 (session dedup, fail silent)
- ✅ QACard ⋮ 메뉴 — admin 전체 / 본인 author 글 (원장 출연 Q&A 포함)
- ✅ OAuth callback URL — env 자동 분기 (`NEXT_PUBLIC_SITE_URL` > `VERCEL_URL` > localhost)
- ✅ /write 사적 모드(직함 숨기기) 토글 제거 (Phase 9에서 ID 분리됐으므로 불필요)
- ✅ /write Q&A 카테고리: 영상 URL [미리보기] 버튼 (본문 안 덮음)
- ✅ /write Q&A 본문 4색 형광펜 (`MarkdownBoldEditor` + `pickHighlight`) — 카드 편집기와 동일 시각 톤
- ✅ RLS Phase 9 호환 (migration 0059): `is_admin()` / `current_doctor_id()` / `same_group_profile_ids()` 묶음 기반 + profiles·qa_likes·qa_saves·qa_ratings·comments·qas 정책에 묶음 내 profile.id 허용
- ✅ OG-extract User-Agent도 SITE_URL 기반으로 통일
- ✅ **pbtt.kr 도메인 연결 — 풀 스택** (2026-05-13)
  - 가비아 DNS: A `@ → 216.198.79.1` + CNAME `www → d9eae3c8237d555c.vercel-dns-017.com` (점 포함)
  - Vercel: pbtt.kr (apex) + www.pbtt.kr (308 redirect to apex) + pibutenten-webapp.vercel.app (308 redirect to apex)
  - Vercel env: `NEXT_PUBLIC_SITE_URL=https://pbtt.kr` (Production only)
  - `next.config.ts`: `pibutenten-webapp.vercel.app` host → `https://pbtt.kr/:path*` 308 permanent redirect
  - Supabase Auth: `site_url=https://pbtt.kr` + `uri_allow_list`에 pbtt.kr·www.pbtt.kr 추가 (Management API PATCH)
  - 코드: `src/lib/site.ts` 주석 갱신 / `public/llms.txt` URL pbtt.kr / `public/manifest.webmanifest` URL pbtt.kr / `.env.local.example` 주석 갱신 / PRD 도메인 정보 갱신
  - Smoke test: `pbtt.kr` 200 / `www.pbtt.kr` 308→pbtt.kr / `vercel.app` 308→pbtt.kr 모두 통과
- ✅ **OAuth provider 4종 도메인 갱신** (2026-05-13)
  - Google Cloud OAuth: Authorized JavaScript origins에 `https://pbtt.kr` + `https://www.pbtt.kr` 추가
  - Kakao Developers: 앱 대표 도메인을 `https://pbtt.kr`로 변경
  - Naver Developers: 서비스 URL `https://pbtt.kr` + Callback URL `https://pbtt.kr/api/auth/naver/callback` 추가 (구 vercel.app도 유지 — preview 대비). **검수 요청 진행 중** (단계별 캡처 5장 + 신규 회원가입 적용)
  - Supabase는 위 도메인 작업으로 이미 갱신됨 (구글·카카오는 Supabase 중계 OAuth)
- ✅ **약관 페이지 신설** (2026-05-13)
  - `/privacy` 개인정보 처리방침 11조 (한국 개인정보보호법 표준)
  - `/terms` 이용약관 12조
  - SignupForm 체크박스 텍스트에 두 페이지 링크 연결
  - SiteFooter nav에 두 페이지 링크 추가
  - 초안 상태 명시 — 베타 안정화 이후 법무 자문 권장
- ✅ **MigrationBanner 제거 + login 페이지 안내 문구 정리** — pibutenten.com 이전 안내(쇼핑몰 분리)가 pbtt.kr 신규 도메인엔 부적합. 로그인 페이지 "관리자/원장님 계정 전용 (일반 회원가입은 추후 오픈)" 문구는 네이버 검수와 모순돼 제거.
- ✅ **약관 정식 검토본 반영** (2026-05-14) — terms.md/privacy.md/about.md/doctor-guidelines.md 4종 검토본 적용
  - `/terms` 16조 (의료법 56조/시행령 23조 광고 금지 + 응급의료 안내 + 게시물 외부 활용 중단권 등 보강)
  - `/privacy` 12조 + 제5조의2 (개인정보 국외 이전 표) 신규
  - `/about` JSON-LD schema 보존 + 관련 문서 섹션 추가
  - `/doctor-guidelines` 신규 페이지 (8섹션)
  - 4 페이지 footer 표준 순서 통일: 홈으로 / 사이트 안내 / 전문의 / 이용약관 / 개인정보 처리방침 / 의사 답변 가이드라인 (본인 페이지만 빠짐)
  - SiteFooter에도 "의사 답변 가이드라인" 추가
  - 운영 이메일 `jminbae@gmail.com` → `pibutenten@gmail.com` 일괄 통일 (4 페이지 + PRD + llms.txt)
  - 개인정보 보호책임자: 배진민 → 배정민
  - "홈으로" 버튼 하늘색 → 회색(text-secondary) + 흰글씨 통일
- ✅ **A 트랙: 대시보드 시각 정비** (2026-05-14)
  - A1: "운영 도구" → "대시보드" 라벨 / AdminBackLink 라운드 박스 제거
  - A2: 자주 쓰는 진입점 3개 제거 (검수대기/Pick/새 글 쓰기)
  - A3: 원장 본인 대시보드 중복 헤더 + "본인만 보임" 뱃지 제거
  - A4: privacy/terms "홈으로" 흰글씨 보장
  - A5: 로그아웃 버튼을 `/{handle}` 본인 프로필 하단으로 이동 (프로필 수정에서는 제거)
- ✅ **B 트랙: 대시보드 기능 추가** (2026-05-14)
  - B1: 기간 토글 6종 통일 (24h/7d/30d/90d/1y/all) + active 칩 bg-primary/80 톤 다운
  - B2 (partial): 원장 KPI 5개 → 8개 (발행 Q&A/검수대기/발행 포스팅/임시 / 받은 댓글/좋아요/저장/공유). 누적 카운트 기준 — 기간 토글은 B2-rest 다음 세션
  - B3: 원장 대시보드에 인기 검색어/태그 위젯 추가 (admin과 동일)
  - B4: /admin/users에 회원별 기간 KPI 5개 (방문일수/조회/댓글/좋아요/공유) + 기간 토글
  - B5: /admin/comments 글 묶음화 + 무한 스크롤 (CommentsClient + API route)
  - B6: 활동통계 6개 KPI 카드 클릭 시 TOP 리스트 페이지 6종 (visitors/views/comments/likes/saves/shares)
    - 통합 `/admin/stats/[kind]` + StatsListClient + API route
    - 무한 스크롤 + 기간 토글 6종
- ✅ **C1 (D1·D2): admin/draft LLM 강화 + 카드별 화자 dropdown** (2026-05-14)
  - D1: step1 LLM 프롬프트에 영상 출연 원장 목록 + 주 화자 표시 전송. LLM이 카드별 `doctor_slug` 응답
  - D2: CardEditor 화자 readonly chip → 9 doctor select dropdown (LLM 추정 틀려도 수동 수정 가능)
- ✅ **C2 partial: migration 0044 `qas.pubmed_refs jsonb[]`** 신설 + 적용 (843/995 row 백필). EditClient 멀티 ref UI는 이미 구현됨. WriteClient 멀티 ref 통합은 다음 세션.
- ✅ **DB migrations 신규** (2026-05-14)
  - `0044_qa_pubmed_refs_multi.sql` — `qas.pubmed_refs jsonb[]` 신설 + 기존 단일 `pubmed_ref` 백필
  - `0046_admin_kpi_lists.sql` — RPC 7종 (`get_users_kpi`, `get_top_visitors`, `get_top_qas_by_views/comments/likes/saves/shares`)
- ⏳ 다음 세션
  - C2 잔여: E2 (Pick 토글 좌우 배치) / E3 (영상 제목 readonly + oEmbed) / E4 (YouTube 진입 버튼 제거) / WriteClient 멀티 PubMed ref UI
  - B2 잔여: 원장 KPI 8개에 기간 토글 (RPC `get_doctor_kpi(doctor_id, days)` 신규 필요)
  - 네이버 OAuth 검수 결과 대기 (3~7영업일)
  - sitemap.xml / robots.txt / llms.txt 인덱싱 정책 논의 (베타 동안 noindex 유지)
  - Supabase Pro 업그레이드 ($25/월) — 6월 정식 런칭 전

> 라이브: https://pbtt.kr (구: https://pibutenten-webapp.vercel.app, https://www.pbtt.kr — 모두 308 redirect)

---

## 0. 프로젝트 개요

- **이름**: 피부텐텐 — 피부과 전문의가 함께하는 Q&A SNS
- **회사**: 주식회사 진솔컴퍼니
- **운영자**: pibutenten@gmail.com
- **슬로건**: 피부가 예뻐지는 모든 이야기 / 피부가 예뻐지는 10분
- **메인 도메인**: https://pbtt.kr (2026-05-13 연결)
- **보조 도메인**: https://www.pbtt.kr → 308 redirect to apex / https://pibutenten-webapp.vercel.app → 301 redirect
- **출시 계획**
  - 5월: 기본 개발 완료 → 5개 지점(강남·수원·판교·건대·대구) 직원·가족 비공개 베타
  - 6월: 정식 런칭 (pbtt.kr 유지, pibutenten.com 확보 시 추가 연결)

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

### Phase 7: 자막 1,371 → 990 카드 일괄 INSERT + UI 정비 (2026-05-12)

**파이프라인 (코드 + sub-agent batch)**:
- 워크스페이스 루트 `scripts_phase7/` 에 작업 스크립트 일괄 배치 (git 추적 X, 운영 자료).
- **Step1 산출물**: 이전 세션에서 자막 345 영상 → `Q&A_백업/*.json` (1,371 카드, 각 카드에 `question/answer/keywords/category/pubmed_search_keywords/script_evidence/source/timestamp`).
- **Step2 v2 (이번 세션, sub-agent batch)**: 카드별 best PubMed reference 1개 선택.
  - **Phase A (PubMed 후보 fetch)**: `13_pubmed_candidates.py` — esearch + efetch 직렬 호출, retmax 8 → 20 → 40 단계 확장. 카드별 `references_candidates` 배열 (8~40 후보) 저장.
  - **Phase B (LLM 선택)**: `36_make_chunks_simple.py` 로 10 카드씩 chunk 분할 → Claude Code 본 세션에서 Task tool sub-agent (`general-purpose`, claude-opus-4-7) 5개씩 병렬 호출. step2 v2 시스템 프롬프트 적용. 카드별 `reference` (dict or null) + `reasoning` 저장. 8 후보 라운드 → 20 후보 expand → 40 후보 expand 3단계 retry.
  - **결과**: 990 카드 중 **866 reference 확정 (87%)**, 124 null (적합 PubMed 후보 없음).

**원장 식별 + 파일 정리**:
- `30_identify_doctors.py` — 자막 자기소개 패턴 + 영상 제목 분석 + 자막 본문 호명 빈도로 9명 원장 식별. 외부 5명 화이트리스트 (김율희·김안나·김협·황동현·김창식).
- `33_rename_and_archive.py` — 단일 9명 + 이중 9명 + 9명+외부 혼합 영상 자동 rename (`YYMMDD_원장이름_videoid.json`). 외부만/미식별 88 영상 → `Q&A_백업_review/` 격리.
- `34_fix_filenames.py` — 자막 패턴이 잘못 잡은 외부 이름 토큰 89개 정정 ("박효진이", "이도영로서의", "생활하면" 등). 외부 5명 등장 9 영상 자동 삭제.
- **중복 정리**: 같은 video_id가 두 파일에 들어간 8 영상 + step1 LLM 중복 question 10건 → DB row 31개 제거. **1,021 → 990 카드**.

**DB 작업 (마이그레이션 없음, Supabase Management API 직접 SQL)**:
- 기존 1,228 qas + 관련 의존 테이블 (qa_likes 63, qa_saves 21, qa_ratings 20, comment_likes 14, comments 34, notifications 15) 전수 삭제. 회원 16 profiles / 9 doctors 보존.
- 990 카드 INSERT (배치 100개씩 트랜잭션). doctor_id는 영상 제목/자막에서 식별된 9명 슬러그 매핑. type=qa, category=qa, status=published, is_pick=false.
- 카드별 `external_url/external_image (i.ytimg.com hqdefault)/external_title/external_site_name` 메타 UPDATE (`22_update_external_meta.py`).

**의사별 카드 분포 (DB)**:
| 슬러그 | 카드 수 |
|---|---|
| jung-hanmi (정한미) | 약 368 |
| kim-jongsic (김종식) | 약 174 |
| park-hyojin (박효진) | 약 112 |
| rhee-doyoung (이도영) | 약 90 |
| kwon-soohyun (권수현) | 약 81 |
| ko-hyerim (고혜림) | 약 81 |
| kang-hyunjin (강현진) | 약 52 |
| kim-soohyung (김수형) | 약 46 |
| bae-jungmin (배정민) | 약 17 |

**UI 변경 (commit 8건)**:
- **카드 형광펜 4색 결정적 매핑** (`QACard.tsx`): Yellow `#FFE65A` / Mint `#A8EBD0` / Lavender `#D4C5F9` / Sky Blue `#A8DEFF`. 카드 ID 해시 % 4 SSR safe. 한 카드 안에서는 P1·P2 동일 색.
- **단락 간격 축소** mt-2.5 → mt-1 (10px → 4px).
- **메인 피드 F5 셔플** (`page.tsx`): RPC fetch 80개 → Fisher-Yates 셔플 → 20개 노출. `dynamic=force-dynamic + force-no-store`.
- **글 카테고리 검색 분기** (`search/page.tsx`): "Q&A/꿀팁/피부일기/궁금해요/공유하기" 라벨이면 category 컬럼 직접 필터, 그 외엔 search_qas_scored RPC 유지.
- **글 카테고리 라벨 검색 시 콘텐츠 카테고리 추정 X**: queryCategoryColor null 처리.
- **댓글 멀티 ID 분리** (`api/comments/route.ts`): comments.identity_id로 profile_identities join → identity별 display_name/avatar.
- **프로필 댓글 탭 identity 필터** (`ProfileTabs.tsx`): active identity 매칭 + primary는 IS NULL.
- **라우트 충돌 해소**: 폐기된 `/[handle]/[year]/[shortcode]/` 디렉토리 삭제 (Next 16 dev 빌드 통과).
- **next.config.ts**: i.ytimg.com / img.youtube.com remotePatterns 허용.

**박효진 원장 SNS 등록 (DB doctors.profile_data jsonb)**:
- instagram: https://www.instagram.com/drsolarderma
- threads: https://www.threads.com/@felice_bk
- blog: https://blog.naver.com/doctorsolar
- UI(의사 프로필 page.tsx)는 이미 칩 노출 코드 있어 자동 표시.

**Phase 7 commit 히스토리**:
| Commit | 내용 |
|---|---|
| `74cb617` | 메인 피드 F5 카드 순서 셔플 (Fisher-Yates) |
| `9359a7b` | 프로필 댓글 탭 active identity 필터 |
| `6234104` | 댓글 작성자 display를 active identity 기준으로 |
| `9ba933e` | 4색 추가 (Sky Blue) + 글 카테고리 검색 시 콘텐츠 카테고리 추정 X |
| `51e1beb` | 영상 미리보기 메타 (external_image i.ytimg.com) + 카테고리 검색 + 단락 간격 |
| `7add2a2` | highlightColor renderAnswerBody 인자 전달 + /[handle]/[year]/[shortcode] 폐기 라우트 삭제 |
| `ada46db` | 카드 형광펜 3색 1차 (Yellow/Mint/Lavender) |

**Phase 7 운영 자료 (scripts_phase7/)** — git 추적 X, 워크스페이스 로컬:
- `10_scan_status.py` — JSON step2 진행 상황 점검
- `13_pubmed_candidates.py --retmax N` — PubMed 후보 fetch (8/20/40)
- `16_merge_results.py` — sub-agent 결과 JSON 머지
- `20_build_dataset.py` — JSON → INSERT용 dataset
- `21_insert_qas.py` — DB INSERT (100/batch)
- `22_update_external_meta.py` — 영상 메타 UPDATE
- `30_identify_doctors.py` — 영상 출연 원장 식별
- `33_rename_and_archive.py` — 파일 rename + review 격리
- `34_fix_filenames.py` — 파일명 토큰 정정 + 외부 5명 영상 삭제
- `36_make_chunks_simple.py` — sub-agent용 chunk 생성
- `db_util.py` — Supabase Management API SQL 헬퍼 (UA: curl/8.0.0 필수)
- `원장_검수_보고서.md` — 사용자 수동 검수용 분류 보고서

---

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

### 완료 (Phase 7, 2026-05-12)
- [x] **자막 345 영상 → 990 카드 일괄 DB INSERT** (1,371 중 중복 31 + review 88영상 제외)
- [x] **PubMed reference 866/990 (87%)** — 3단계 retry (8/20/40 후보)
- [x] **영상 출연 원장 자동 식별** — 자기소개 패턴 + 영상 제목 + 본문 빈도. 외부 5명 영상 9개 삭제. 88 영상 review 폴더 격리
- [x] **카드 영상 메타 1,001/1,021 카드** — external_url + external_image (i.ytimg.com hqdefault) + external_title
- [x] **카드 형광펜 4색 결정적 매핑** (Yellow/Mint/Lavender/Sky Blue)
- [x] **단락 간격 축소** mt-2.5 → mt-1
- [x] **메인 피드 F5 셔플** (Fisher-Yates, fetch 80 → 노출 20)
- [x] **글 카테고리 칩 검색 분기** (Q&A/꿀팁/피부일기/궁금해요/공유하기 → category 컬럼 직접 필터)
- [x] **댓글 멀티 ID 분리** (identity_id 기준 display_name/avatar)
- [x] **프로필 댓글 탭 active identity 필터**
- [x] **박효진 원장 SNS 등록** (doctors.profile_data jsonb)
- [x] **폐기 라우트 삭제** (/[handle]/[year]/[shortcode]/)

### Phase 7.5: 멀티 identity 권한 시스템 + admin/doctor/user 통일 (2026-05-12, 진행 중)

**목표**: `profile_identities`를 single source of truth로 — 한 사람이 `admin` / `doctor` / `user` 3가지 kind의 identity를 독립 보유. 미가입 원장도 doctor identity row 미리 존재. `qas`는 `author_identity_id`로 작성자를 identity 단위로 분리. 권한 분기는 active identity의 kind/doctor_id 기준.

**용어 정리 (중요)**:
- `developer` = handle (예: 배정민이 admin identity에 본인이 정한 닉네임)
- `admin` / `doctor` / `user` = kind (DB enum, 권한 종류)
- 한국어 UI 라벨에서도 영문 그대로 사용 (혼동 방지)

**완료**:
- [x] **kind enum 통일** — primary/personal/member 등 혼재 → `admin` / `doctor` / `user` 3가지(영문)
- [x] **profile_identities.profile_id nullable** (migration `0043_unowned_identities.sql`) — 미가입 원장 6명도 doctor identity 미리 보유 가능
- [x] **doctor identity row 9명 전원 등록** — 가입 3(정한미·이도영·배정민) + 미가입 6명
- [x] **qas.author_identity_id 컬럼** (migration `0042_qas_author_identity.sql`) — 994개 row 자동 백필 (doctor_id 매칭 + 회원글은 primary identity)
- [x] **getIdentityContext() helper** (`src/lib/identity.ts`) — 모든 admin 페이지 권한 분기 단일화. cookie `pibutenten:identity` → active identity의 kind/doctor_id 결정
- [x] **doctors.photo_url single source** — 9명 모두 `/doctors/{slug}.png`로 일괄 채움. UI fallback 코드 제거
- [x] **/admin/users 회원관리 재설계**:
  - profile + identity 통합 표시 (identity 단위, 한 사람 여러 row)
  - 원장 9명 묶음 (가입/미가입 구분) + 미가입 원장 → `/admin/doctors/{slug}` 링크
  - 라벨 영문 통일 (`admin` / `doctor` / `user`)
  - 활동 컬럼·level 필터 제거
- [x] **/admin/users/[id] active identity 분기** — `?identity=` 쿼리로 탭 전환, 작성 글은 `author_identity_id` 기준, 헤더 사진/이름은 active identity 기준 (doctor면 doctors.photo_url + name)
- [x] **권한 게이트**:
  - `/admin/draft` (새 Q&A 추출): super admin (active.kind === 'admin') only
  - `/admin/qas/[id]/edit` 글쓴이 변경: super admin only (그 외에는 readonly chip — `canChangeAuthor` prop)
  - `/admin/users/[id]` RoleChangeForm: viewer가 admin일 때만 노출 (`viewerIsAdmin`)
  - 원장 admin은 본인 doctor 글만 편집 가능 (`qa.doctor_id !== activeDoctorId`면 redirect)
- [x] **TopNav identity dropdown 중복 제거** — primary와 동일 handle인 profile_identities row는 dropdown에서 숨김
- [x] **TopNav 우상단 프로필 사진 CSS** — Avatar의 `<img>`에 `objectPosition: "50% 12%"` 추가. doctor.photo_url 상반신 사진의 얼굴이 작은 원형 아바타에서 잘리는 문제 해결, QACard 카드 아바타와 동일 값
- [x] **API `/api/identity/switch`** — cookie 갱신 + 본인 identity 보안 체크
- [x] **Token usage 로깅 + USD 환산** — Step1/Step2 LLM 토큰 사용량 + 비용 표시 (Claude Opus 4: input $15/M, output $75/M, cache read $1.5/M, write $18.75/M). `src/lib/ai/pricing.ts` + DraftClient UsageSummary 컴포넌트
- [x] **Step2 안전망** — `Unexpected end of JSON input` 회피 (`res.text()` + try `JSON.parse` 감싸기)
- [x] **Vivid blue 로고 + OG 교체** — `/brand-logo.svg`, `/logo.svg`, `/og.png`

**관련 migrations**:
- `0040_profiles_doctor_id.sql` — 호환성 컬럼 (실제 미사용, 추후 삭제 검토)
- `0041_identity_doctor_mapping.sql` — 가입 3명의 profile_identities에 doctor_id 매핑
- `0042_qas_author_identity.sql` — `qas.author_identity_id` FK + 자동 백필
- `0043_unowned_identities.sql` — profile_id nullable + 미가입 원장 6명 doctor identity 자동 생성

**남은 작업 (Phase 7.5 이어서)**:

**A. Identity single source 점검 (다른 페이지 UI 일관성)** — doctor.photo_url + face 정렬 적용 확인
- [x] QACard 카드 아바타 (이미 `objectPosition: "50% 12%"` + per-doctor avatarTx/Ty)
- [x] TopNav 우상단 — `objectPosition 12%` + **`scale(1.18)` + `transformOrigin "50% 30%"`** 추가 (이번 세션, 머리 잘림 해결)
- [x] A3. `/doctors/[slug]` 페이지 헤더 사진 (확인) — 누끼 hero 대형 사진이라 objectPosition 불필요 (이미 `object-contain object-bottom`로 정상)
- [x] A4. `/[handle]` 개인 프로필 페이지 사진 — `fetchProfileByHandle`에서 identity.doctor_id 있으면 doctors.photo_url 조회 후 우선 사용. 큰 원형(128px)에 누끼 사진일 때 `objectPosition: "50% 12%"` 적용
- [x] A5. 댓글 작성자 아바타 (`api/comments` 응답) — `profile_identities.doctor_id` 있으면 doctors.photo_url 조회 후 single source로 노출
- [ ] A6. LikersDialog / RecentLikers / NotificationsClient (다음 세션)

**B. 발행 API author_identity_id 자동 채움**
- [ ] `/api/admin/draft/publish` (또는 카드 발행 핸들러) — INSERT 시 active identity 기반 `author_identity_id` 자동 set
- [ ] 카드별 doctor identity 다중 선택 시 자동 매칭 (Step1 출연 원장 식별 결과 사용)
- [ ] 회원 글(`type=post`, doctor 아님)도 자동으로 active identity 기록

**C. 회원 → 원장 연결 메뉴 (역할 부여)**
- [ ] `/admin/users/[id]` RoleChangeForm 확장 — "이 회원을 ○○ 원장과 연결" 액션 추가
- [ ] 동작: 선택한 미가입 doctor identity row의 `profile_id`를 해당 회원 `profile.id`로 UPDATE
- [ ] 동시에 `doctor_accounts(profile_id, doctor_id)` row INSERT
- [ ] 회원 입장에서는 다음 로그인부터 doctor identity가 dropdown에 노출

**D. Q&A 추출 UI 정리 (`/admin/draft`)**
- [ ] D1. 다중 출연 원장 영상 — 디폴트 선택 + 카드별 자동 분류 (Step1 화자 식별 결과)
- [ ] D2. 카드 화자 dropdown (현재 readonly chip → 편집 가능)
- [ ] D3. 키워드 태그 UI — 쉼표 입력 → 엔터로 추가, X로 삭제 (현재는 쉼표 추가 불가)
- [ ] D4. 답변 본문 빈 줄 자동 제거 + 문단 간격 정리
- [ ] D5. Step 라벨 순서 정리 (1. 자막/원장 → 2. Q&A 추출 → 3. PubMed → 4. 검수 발행)
- [ ] D6. LLM 사용량 표시 위치 — 검수 발행 버튼 바로 위

**E. 카드 편집기 정리 (`/admin/qas/[id]/edit`)**
- [ ] E1. 버튼 3개 통일: 삭제 / 대기로 변경 / 발행
- [ ] E2. 글쓴이(원장) + Pick 토글 좌우 배치
- [ ] E3. 영상 제목 readonly + 링크 저장 버튼 (oEmbed로 자동 채움)
- [ ] E4. YouTube 진입 버튼 제거 (외부 카드 형태로 통일)
- [x] E5. 본문 강조 버튼 — 굵음 + 형광펜 4색 결정적 매핑 (이미 `src/lib/qa-highlight.ts`로 구현됨: Yellow/Mint/Lavender/Sky Blue 카드 ID 해시 기반)
- [ ] E6. 참고문헌 멀티 ref UI — PMID/URL 추가/삭제 (X / + 버튼) — schema는 `pubmed_refs jsonb[]` 신규 추가, 기존 `pubmed_ref`(단일) 1개짜리 배열로 백필 합의됨 (migration 0044 예정)

**F. 신규 발견·요청 항목 (2026-05-13 세션)**
- [x] **F1. tmp 파일 누더기 정리** — `.tmp.NNN.TIMESTAMP` 형식의 임시 파일 263개 일괄 삭제 (src 233 + 루트 30)
- [x] **F2. identity.ts `personal` 잔존 정리** — `kind === 'user'`로 통일 (PRD enum 규약 일치), admin/page.tsx + admin/qas/page.tsx 주석도 정리
- [x] **F3. `/doctors/[slug]` 모바일 레이아웃 재구성** — 모바일: 인트로 멘트를 가운데 정렬 + 데스크탑처럼 줄바꿈 유지(`whitespace-pre-line`) + 폭 넓게. 이름·소속을 사진 위 여백에 배치(겹치지 않게). 사진은 230×380로 살짝 키우고 중앙에서 약간 우측(`translate-x-[18px]`). 데스크탑은 기존 2단 구조 유지.
- [x] **F4. PubMed Step2 안정화** — `/api/admin/draft/step2`의 카드 루프를 카드별 `try/catch`로 격리. 한 카드의 NCBI 타임아웃·rate limit·Anthropic 일시 오류가 나머지 카드 응답을 막지 않게 함. 실패 카드는 `reasoning: "PubMed/LLM 호출 실패: ..."`로 응답.
- [x] **F5. 영상 바로가기 누락 카드 진단 스크립트** — `scripts/audit_qa_videos.py` 신규. 결과(전수조사 시점): 발행 카드 991개 중 20개 누락 (모두 `external_url IS NULL` + `video_id IS NULL`). 모든 카드의 `video_id`는 NULL 상태이고 `external_url`로만 영상 링크 저장 중. 누락 카드 원장별: 고혜림 4, 김종식 4, 정한미·이도영 등.
- [ ] **F6. 누락 카드 백필** — 카드 편집기에서 영상 URL 편집 가능하게 만들고 (E3) admin이 수동 채움. + 발행 API에서 Q&A 카테고리는 `external_url` 또는 `video_id` 필수 검증 추가 (다음 세션)
- [ ] **F7. A6 잔여 아바타** — LikersDialog / RecentLikers / NotificationsClient에 동일하게 doctor identity → doctors.photo_url single source 적용 (다음 세션)
- [ ] **F8. Migration 0044 + B + C + D 잔여 + E 잔여** — schema 0044(pubmed_refs jsonb[] + RPC 갱신), 발행 API author_identity_id 자동(B), 회원→원장 연결(C), Q&A 추출 UI 정리(D1~D6 중 D5 완료 제외), 카드 편집기(E1~E4·E6) — 다음 세션
- [x] **F9. `/doctors/[slug]` 모바일 레이아웃 추가 보정** — 인트로 멘트 시작·끝을 곡선 따옴표(U+201C/201D)로 감싸기, 사진은 정중앙(translate-x 제거), 상단 여백 pt-6 → pt-12. 프로필 박스 "학회·소속" → "학회"로 라벨 단축. dl 라벨 칸 폭 80→52(모바일)/100→64(데스크탑)로 축소해서 우측 본문 가용 폭 확장.
- [x] **F10. 카드 편집기 버튼 3개 통일 (E1 일부)** — `/admin/qas/[id]/edit`의 액션 버튼을 4~5개에서 항상 3개로 단순화: 🗑 삭제 / ⏳ 대기 / 🚀 발행. 현재 상태와 동일한 버튼은 disabled 처리. 초안으로·보관 버튼은 제거.
- [ ] **F11. 영상 누락 카드 원인 정리** — 발행 API에 `external_url`/`video_id` 검증이 없어서 누락된 채 발행됨이 확인됨 (audit 결과 batch별 누락 패턴). F6과 함께 처리.

---

### Phase 9: 멀티 ID 데이터 모델 단순화 (다음 세션, 대형 작업)

**목표**: 사용자 결정 — `profile_identities`를 폐기하고 모든 ID가 `profiles` 테이블 단일 row로 동등하게 관리되는 모델로 단순화. 한 사람의 여러 ID는 `profiles.auth_user_id` 컬럼으로 묶음.

**핵심 합의 사항 (2026-05-13 세션)**:
- `profile_identities` 테이블 **폐기**
- `profile_identities.kind` 컬럼 **폐기** — 모든 등급은 `profiles.role`로 단일화
- `profiles.role` enum에 `developer` 추가 (현재: `user` / `doctor` / `admin` → 변경 후: `user` / `doctor` / `developer`)
- `profiles`에 `auth_user_id` 컬럼 추가 — Supabase `auth.users.id`를 가리키는 UUID (영구 불변 식별자). 같은 `auth_user_id` 값을 가진 profiles row들이 한 사람.
- 메인/부계정 개념 **삭제** — 모든 ID는 동등한 profiles row
- 미가입 원장은 `auth_user_id = NULL` (아직 로그인 안 함)

**왜 `auth_user_id`인가**:
- DB 관례에 부합 (`xxx_id` 형식의 FK)
- Supabase auth.users 1 row = 1 이메일 제약 회피 가능 (이메일 없이 anonymous도 가능, NULLABLE)
- UUID 영구 불변 → display_name·handle 같은 변경 가능 필드와 분리

**마이그레이션 작업 (Migration 0045 예상)**:
1. DB 백업 스냅샷 우선 작성
2. `profiles.auth_user_id uuid` 컬럼 추가 (FK → `auth.users.id`, NULLABLE)
3. 기존 `profiles.id` 데이터 → 본인 `auth_user_id`로 백필 (현재 1:1이므로 자기 자신)
4. `profile_identities` row들 → `profiles` 새 row로 이관 + 같은 `auth_user_id` 설정
5. `qas.author_id`·`qas.author_identity_id` 통합 → 새 `profiles.id` 가리키도록 재배선
6. `qa_likes.user_id`·`qa_likes.identity_id`·`qa_saves`·`qa_ratings`·`comments.author_id`·`comments.identity_id` 재배선 — 모두 새 `profiles.id`만 사용
7. `doctor_accounts` 테이블 검토 — `profiles.id ↔ doctors.id` 매핑이 `profiles.role='doctor'`인 row로 통합 가능한지
8. RLS 정책 전부 재작성 — `auth.uid() = profiles.auth_user_id` 패턴으로 변경
9. `role` enum에 `developer` 값 추가, 기존 `admin` 데이터 일괄 변경
10. 마이그레이션 후 `profile_identities` 테이블 폐기

**코드 작업**:
- `src/lib/identity.ts`의 `getIdentityContext()` — `auth_user_id` 기반으로 단순화. profile_identities 조회 제거.
- `src/lib/active-identity.ts` — 어느 profiles.id가 활성인지만 cookie로 관리
- `src/components/IdentitySwitcher.tsx` — 같은 `auth_user_id`의 profiles 목록 표시 + 스위치
- `src/components/QACard.tsx` — `posted_as` / persona 로직 단순화 (author_id가 직접 profiles row이므로)
- `src/lib/viewer-states.ts` — `user_id` 비교만으로 자동 분리 ✓ (identity_id 분기 제거)
- `src/app/[handle]/page.tsx` — `fetchProfileByHandle`은 `profiles.handle`만 조회. profile_identities lookup 제거.
- `src/app/api/comments/route.ts` — comments.identity_id 컬럼 폐기, author_id가 직접 profiles row
- `src/app/admin/users/page.tsx` — 표 단일화 (메인/부계정 구분 없음, 모든 row 동등 표시 + 묶음 시각 표시)
- `src/app/admin/users/[id]/page.tsx`·`RoleChangeForm.tsx` — kind·doctor 연결 메뉴 단순화 또는 폐기
- TopNav identity dropdown — `auth_user_id` 묶음 멤버 목록

**자동 해결되는 기존 이슈**:
- ✅ 배스킨 ↔ 배정민 좋아요·저장·평점 섞임 (각 ID가 독립 profiles.id이므로 user_id 비교만으로 자동 분리)
- ✅ 댓글 좋아요 동일 패턴 문제
- ✅ `getIdentityContext` 권한 분기 단순화
- ✅ `qas.author_identity_id`·`comments.identity_id` 등 이중 컬럼 정리

**Phase 9 결과**:
- DB row 수는 늘어남(profile_identities 데이터가 profiles로 이관) 하지만 테이블 수는 줄고 코드가 매우 단순해짐
- `profile_identities` 관련 200줄+ 코드 제거
- 향후 멀티 ID 확장 (한 사람이 ID 5~10개 추가) 비용 거의 0

**Phase 9 진행 상황 (2026-05-13 세션, 마지막 단계)**:
- [x] **0044 적용 완료** — `profiles.auth_user_id uuid` 추가 + FK + 인덱스. 17개 row 본인 id로 백필. role enum 'developer' 안전 처리 (enum이면 ADD, 아니면 skip).
- [x] **0045 작성 (적용 X)** — `profile_identities` → `profiles` INSERT (id 재사용으로 기존 FK 그대로 통함) + `doctor_accounts` 보존 + `qas`·`comments`·`qa_likes`·`qa_saves`·`comment_likes` FK 재배선 + `admin` → `developer` 변환. 코드 변경과 함께 적용 예정.
- [ ] **다음 세션 — 0045 적용 + 코드 변경** — `getIdentityContext` 단순화, `viewer-states.ts` identity 분기 제거, `IdentitySwitcher`를 같은 `auth_user_id` 묶음 표시로 변경, profile_identities·관련 컬럼 폐기(0046)

**Phase 7.5 commit 히스토리** (이번 세션):

| commit | 내용 |
|---|---|
| (TBD) | 0040 profiles.doctor_id 호환 컬럼 |
| (TBD) | 0041 정한미·이도영·배정민 doctor identity 매핑 |
| (TBD) | 0042 qas.author_identity_id 컬럼 + 백필 |
| (TBD) | 0043 profile_identities.profile_id nullable + 미가입 원장 6명 |
| `1666843` | identity 통일 정리 (kind enum + UI 라벨) |
| `6f1d653` | doctors.photo_url single source 적용 |
| `128cd1e` | 글쓴이 변경 super admin only (`canChangeAuthor` prop) |
| `5b475d6` | `/admin/users/[id]` RoleChangeForm viewer admin only (`viewerIsAdmin`) |
| (이번 세션) | tmp 파일 263개 일괄 삭제 + identity.ts `personal`→`user` 통일 |
| (이번 세션) | TopNav 우상단 프로필 CSS — `objectPosition: "50% 12%"` + `scale(1.18)` + `transformOrigin "50% 30%"` (머리 잘림 해결) |
| (이번 세션) | `/[handle]` 프로필 사진 — doctor identity는 doctors.photo_url single source |
| (이번 세션) | `/api/comments` 응답 아바타 — doctor identity는 doctors.photo_url single source |
| (이번 세션) | `/doctors/[slug]` 모바일 레이아웃 재구성 — 멘트 가운데/넓게 + 사진 아래 중앙 약간 우측 |
| (이번 세션) | `/api/admin/draft/step2` 카드별 try/catch 격리 (PubMed/LLM 일시 실패 안정화) |
| (이번 세션) | `scripts/audit_qa_videos.py` 영상 링크 누락 카드 진단 — 20개 발견 |
| `28bedf0` | `/doctors/[slug]` 모바일 레이아웃 + 프로필 라벨 폭 축소 |
| `a900f7b` | PubMed step2 카드별 try/catch 격리 |
| `ec8cb40` | 카드 편집기 버튼 3개 통일 (삭제 / 대기 / 발행) |
| `6c1b6b0` | `scripts/audit_qa_videos.py` 영상 링크 누락 진단 스크립트 |
| `7f57b6f` | 발행 API videos UPSERT + qas.video_id 자동 채움 + 994개 백필 |
| (이번 세션) | 0044 적용 — `profiles.auth_user_id` 컬럼 추가 + role enum 'developer' 안전 추가 |
| (이번 세션) | 0045 작성 — `profile_identities` → `profiles` 이관 SQL (적용은 다음 세션) |

---

### Phase 8 (다음 세션) — 관리자/원장 대시보드 + 글쓰기 모드 정리
**목표**: Phase 7에서 코드+sub-agent batch로 일괄 처리한 step1(자막→카드) + step2(PubMed reference) 파이프라인 전체를 **관리자 웹 UI**에서 수동 실행 가능하게 함. 새 영상 1편씩 추가 발행 시 어드민이 브라우저에서 끝까지 처리.

**구현 범위**:
1. **YouTube 영상 ID 추출 + 자막 fetch** (코드 베이스, 서버 액션)
   - 입력: YouTube 영상 URL
   - 출력: video_id + 한글 자막(WebVTT) + 영상 제목/업로드일/썸네일
   - 자막은 자동자막 X, 수동 한글자막만. fallback 처리
2. **원장 자동 식별** (코드 베이스)
   - 자막 본문 자기소개 패턴 + 영상 제목 → 9명 매칭 (Phase 7 `30_identify_doctors.py` 로직 이식)
   - 외부 원장 등장 시 admin에 경고 + 작업 중단 선택지
3. **Step1: 자막 → Q&A 카드** (Claude Opus 4.7 API 직접 호출, 서버 액션)
   - 시스템 프롬프트: `전달용/pibutenten_prompt_step1_v5.md` 그대로
   - 입력: 자막 WebVTT + 영상 메타
   - 출력: 카드 N개 (질문/답안/keywords/category/pubmed_search_keywords/script_evidence/timestamp)
   - 관리자 UI에 카드 미리보기 + 검수 + 인라인 편집 (bold 위치·문장 수정)
4. **Step2: 카드별 PubMed reference 매칭** (코드 fetch + Claude Opus 4.7 API LLM 선택)
   - **PubMed eutils API 직접 호출** (코드, esearch + efetch retmax 8/20/40)
   - **LLM 선택**: 시스템 프롬프트 `전달용/pibutenten_prompt_step2_v2.md` 그대로 적용. API 직접 호출 (Anthropic SDK)
   - 관리자 UI에 reference 후보 N개 + LLM 추천 + 사용자 수동 선택/교체/null 처리
5. **카드별 중심 화자 결정** (이중·혼합 출연 영상)
   - 자막 timestamp 구간 텍스트 + LLM (선택적)
   - 또는 어드민이 카드별 수동 지정
6. **DB INSERT + Storage 업로드**
   - 영상 메타 → videos 테이블 INSERT (qas.video_id FK 연결)
   - 카드 → qas INSERT (post_year/post_slug/external_url/external_image/pubmed_ref 등)
   - 자막 파일 → Supabase Storage 또는 운영자 로컬 보관

**기술 스택 결정**:
- LLM 호출: **Claude Opus 4.7** (`claude-opus-4-7`), Anthropic Node SDK in API route
  - 환경변수: `ANTHROPIC_API_KEY` (이미 .env.local)
- PubMed: NCBI eutils API (코드만, Node fetch)
- YouTube 자막: `youtube-transcript` (이미 의존성에 있음) + 또는 yt-dlp 서버 호출
- 자막 → 화자 식별: 코드 베이스 (Phase 7 30_identify_doctors.py 로직 TypeScript 포팅)

**UI 위치**:
- `/admin/draft` (기존 AI 초안 페이지 확장) 또는 새 페이지 `/admin/pipeline`
- 단계별 위저드: 1) URL 입력 → 2) 자막+원장 확인 → 3) Step1 카드 미리보기·수정 → 4) Step2 reference 매칭·검수 → 5) 발행

**참고 자료**:
- `전달용/pibutenten_prompt_step1_v5.md` (자막 → 카드 시스템 프롬프트)
- `전달용/pibutenten_prompt_step2_v2.md` (PubMed reference 선택 시스템 프롬프트)
- `scripts_phase7/` (Phase 7 batch 처리 코드 — 로직 참고)
- `scripts_phase7/원장_검수_보고서.md` (88 review 영상 + 외부 원장 영상 목록)

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
- [x] **pbtt.kr 도메인 연결 + OAuth provider 4종 갱신** (2026-05-13)
- [x] **`/privacy`, `/terms` 페이지 신설** (2026-05-13, 초안 — 법무 검토 보류)
- [ ] 네이버 OAuth 검수 결과 대기 (요청 완료, 3~7영업일)
- [ ] iOS/Android 실기기 통합 QA (구글/카카오/네이버 로그인 + 댓글 + 좋아요)
- [ ] `/settings/account` 보강 (이메일/탈퇴)
- [ ] `sitemap.xml`, `robots.txt` 본격 작성 (현재는 기본만)
- [ ] Vercel Pro 업그레이드 결정 (Password Protection 베타 비공개용)
- [ ] 멀티 identity onboarding 플로우 (의사 부계정 생성)

### 베타 운영 중
- [ ] Vercel Password Protection으로 비공개 운영
- [ ] Umami self-hosted (analytics.pibutenten.com)
- [ ] Naver Webmaster Tools 등록
- [ ] AEO/GEO manual log 입력 폼

### 정식 런칭 (6월)
- [ ] pibutenten.com 도메인 확보 시 Vercel 추가 연결 (현재는 pbtt.kr만)
- [ ] Password Protection 해제
- [ ] OG 이미지 prod URL 검증 (이미 pbtt.kr 자동 반영됨)
- [ ] `/privacy`, `/terms` 법무 자문 후 정식 확정
- [ ] Google Search Console + Rich Results Test verify (pbtt.kr 소유 등록)
- [ ] 네이버 Webmaster Tools 사이트 등록 + pbtt.kr 소유 확인

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
