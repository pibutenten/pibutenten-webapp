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
| 부가 라이브러리 | `web-push`, `nanoid`, `youtubei.js`, `youtube-transcript`, `@mozilla/readability`, `jsdom`, `react-easy-crop`, `pretendard`, `zod`, `sharp`, `simple-git-hooks` |

작업 디렉토리: `<repo>/pibutenten-app` (메인 PC=D:\Dropbox, 보조=C:\Dropbox — 머신마다 드라이브만 다름)

---

## 2. 라우트 구조

### 2.1. 공개 페이지
```
/                                   홈 (AppShell 인-헤더 검색 + FeedView 피드(인기태그=FeedSidebar)). 검색은 /?q= 로 수행 — 결과는 피드 글상자만(qa/review/doodle), 시술 리포트 블렌딩 제거(searchReport 항상 null, 2026-06-29 — 리포트는 /reports 전용)
/about                              소개
/topics/[tag]                       태그별 전문의 Q&A 허브 (qa 만, SEO 인덱싱). 개별 후기 미노출 — /reports 존재 시 닫힌 리포트 글상자(공용 ReportSummaryBox → /reports/{ko}) 임베드 (2026-07-02, 구 "후기 N건 보기" 얇은 링크 갱신). h1 "피부과 전문의가 답한 {tag} 관련 Q&A N개"(--ink-300 연회색). bare /topics 직접 진입은 홈 308(next.config — 검색·AI 유입 전용 밸브)
/reports                            시술 리포트 허브 (인덱스: ReportsIndexView + ReportsIndexCard + 공용 ReportsIndexSidebar, 2단 레이아웃; 시술 리포트 목록 후기 N≥4 게이트 + count desc; 회전 헤드라인(report-headline) 매 요청 랜덤 → force-dynamic; SEO 셸 보존 = generateMetadata + JSON-LD CollectionPage/ItemList + canonical, 자격 0건 noindex; 인덱스↔상세는 공유 layout 셸(app/reports/layout.tsx + ReportsShell, 상단바·사이드바 persist·좌측 본문만 교체, ADR 0025); 카드=접힘(공용 ReportSummaryBox — 재시술% 큰 숫자·통증·만족도·진행 막대·헤드라인)/펼침(통증 척도 바·효과 top3·효과시점·CTA 2버튼) 구조 + 정렬 칩 5종 알약(선택 #1A9DE8), 캔버스 variant canvas="report"(#F5FBFF))
/reports/[procedure]                시술별 후기 리포트 (상세: ReportsDetailView + ReportsReviewCard, 2단 레이아웃 + ReportsIndexSidebar; 실시간 집계 + review_summary 앵커 카드; 후기 카드 = 따옴표 본문 + 아바타 + 작성자 나이·성별 한 줄(get_review_author_demographics, 0322); 정식 URL=/reports/{ko}(한글), canonical=ko; 영문 /reports/{en} 은 middleware 가 308 영구 리다이렉트 전용(1홉)→ko; index(후기 4건 미만은 noindex·follow — FEED_MIN_REVIEWS 허브 게이트 공유, 2026-07-02); SEO 셸 보존 = JSON-LD MedicalWebPage + Service(additionalType=MedicalProcedure) + AggregateRating + BreadcrumbList(Product 폐기 2026-06-05); /topics 존재(qa≥4) 시 "전문의 Q&A 보기 →"(→/topics/{ko}) 얇은 링크; 본문=히어로 카테고리 그라데이션(tt 워터마크·재시술 사람 그리드·헤드라인·저장/공유)→만족도→통증·회복→효과→타임라인→작성자 통계→리뷰→전문의 섹션 구성 + 모바일 탭바 위 하단 고정 바(저장=앵커 card_saves 진짜 북마크·공유 — 데스크탑 사이드바 푸터 ReportShareButtons 동일 배선), 후기 카드 댓글 수=visible 실집계, WriteFab 미노출(허브는 노출))
/reports-new, /reports-new/[procedure]   구 staging 미리보기 라우트 — 신디자인 /reports 정식 승격 후 308 영구 리다이렉트(→/reports, →/reports/{ko}). 이전 미리보기 링크 보호용 (2026-06-29)
/doctors                            원장님 목록
/doctors/[slug]                     원장님 소개 (OG: /og/{slug}.png)
/doctors/[slug]/[year]/[postSlug]   원장님 글 단독 (SEO URL)
/[handle]                           사용자/원장 프로필 — 프로필 카드(사진·이름·@handle·태그 3종·통계 3등분) + 필터 칩(본인 5: 내가 쓴 글/내 후기/내 댓글/좋아요/북마크 · 타인 3: 작성한 글/후기/댓글) + 카드 목록, canvas="profile"(#EAF2F8).
                                    skin 탭 없음(피부정보 상세는 /my '내 피부 정보') — 무효 ?tab=(구 skin 딥링크 포함)은 posts fallback. 본인 "프로필 수정"→/my/settings(설정 아코디언 없음)·AccountSwitcherCard 유지, 타인 FollowButton+⋯ 메뉴 (ADR 0026)
/[handle]/[shortcode]               회원 글 단독
/u/[id]                             구식 user URL (compat)
/privacy, /terms, /doctor-guidelines, /disclaimer, /report   법적/안내 페이지
/contact                            문의 (회사 정보 + 채널)
/editorial-policy                   편집 정책 (Mayo/Cleveland Clinic 벤치마크)
/medical-review                     의학 검수 프로세스 (4-date 모델)
/corrections                        정정 정책 (30일 이력 공개)
/disclosures                        이해상충 공개
```

#### 시술 리포트 앵커 카드 (review_summary, C1~C5 / 인앱 공개 완료, 색인 보류)
- '시술 리포트'를 정식 `cards` 행(type=`review_summary`, 1급 카드)으로 승격. author=pibutenten 관리자, 발행 후기 ≥1 시술마다 1행(마이그 0214 백필 25개, 멱등 부분 유니크 `cards(post_slug) WHERE type='review_summary'`). 생성은 `create/update_procedure_review` RPC 가 발행 시 lazy(ON CONFLICT DO NOTHING). title="피부텐텐 리포트 | {ko}"(0219).
- **수치는 행에 저장하지 않음** — `getProcedureReport` 가 `procedure_reviews` 를 실시간 집계(중복·동기화 누더기 방지). 앵커는 저장·공유·색인·피드·admin 의 "그릇"일 뿐. 같은 시술도 후기 여러 개 허용(ADR 0023, 2026-06-25) — 집계는 각 후기를 **행 기준으로 모두 반영**(작성자 수 지표 `get_research_panel().reviewers` 만 distinct).
- URL (2026-06-05 한글 전환): **정식 = `/reports/{ko}`(한글), canonical=ko**. 영문 `/reports/{en}`(en=`tag_dictionary.en`(is_procedure)=앵커 `post_slug`)은 `middleware.ts` 가 **308 영구 리다이렉트 전용(1홉→ko)** — ASCII slug 만 tag_dictionary en→ko 조회(한글은 조회 없이 통과). (procedure_taxonomy 는 C단계 0257-0259 에서 청산·DROP, tag_dictionary 로 일원화.) 내부 링크(`ProcedureReportCard.reportHref`·`Feed.feedHref`·sitemap·rss)는 전부 ko. 페이지 레벨 redirect 는 스트리밍 SSR 200+meta-refresh 폴백이라 미들웨어에서 처리.
- 저장·공유: 앵커 card_id 로 단독 글과 동일 `useCardEngagement`(toggle_card_save·card_shares). 좋아요·조회수는 데이터만(버튼 미노출). 앵커가 **published 일 때만** 버튼 노출(공개 RLS 경로 조회).
- **피드 노출 = 결정적 주입(점수 무관)**: 앵커는 `feed_cards_scored`·`search_cards_scored` 에서 **제외**(0217/0220 — 점수 독식 도배 방지). 대신 클라이언트 `Feed` 가 유기 카드 **20장당 1장**, 윈도 내 변동 위치(결정적·하이드레이션 안정)에 컴팩트 `ProcedureReportCard`(prop `feedHref` → 카드 전체/더보기 클릭 시 `/reports/{en}`, 저장/공유는 stopPropagation) 주입. 풀은 경량 RPC `get_review_summary_pool()`(0218) → 서버 1회 셔플 후 prop. 검색 결과 목록·프로필 목록에선 제외(중복 방지). 색인(sitemap/rss)은 `INCLUDE_REPORT_ANCHORS`(기본 off) + `status='published'` 이중 게이트.
- ★**인앱 공개 + 검색엔진/AEO 색인 ON 완료(2026-06-05)** — 피드·`/reports`·저장/공유 노출 + sitemap/rss 한글 URL 등재. `INCLUDE_REPORT_ANCHORS=true`(리포트 존재=후기 ≥1 전부, 임계값 없음) + robots `/report$`(접두 차단 해제). 단 전체 색인은 글로벌 `SITE_PUBLIC=true`(라이브) 전제. 비공개 환원=`status='draft'` 1줄.
- **admin 편집 차단(자동 집계물)** — `/admin/cards` 목록에서 review_summary 카드는 편집·클릭 모두 비활성(클릭 무반응). 집계 요약·공개 리포트는 `/admin/review-reports` 전용 표에서 확인. 편집 URL 직접 진입(`/admin/cards/[id]/edit`)도 `type='review_summary'` 가드로 `/reports` redirect(없으면 404).

### 2.2. 인증 / 온보딩
```
/login, /signup                     인증
/auth/callback                      OAuth 콜백 (약관/온보딩 가드)
/onboarding                         추가정보 입력
/login/conflict                     OAuth provider 충돌 안내
```

### 2.3. 사용자 영역
```
/settings, /settings/profile        redirect 경유지 (구 링크 보호용) — admin→/admin, doctor→/doctors/{slug}, 회원→/my/settings. 설정 실화면은 /my/settings (ProfileEditClient 파일은 app/settings/profile/ 위치 유지)
/notifications                      알림 목록
/write                              통합 글쓰기 — 3탭(시술일기/시술후기/끄적끄적) WriteTabs. ?tab=record|review|doodle. FAB·헤더 진입(tab 미지정) 기본 탭=시술후기(review, WriteView tabToKey 기본). ?tab= 명시는 불변
/write/[shortcode]                  글 수정 (자기 글/원장/admin) — WriteEditShell(AppShell) 래핑 + EditClient
/today                              투데이 — 날씨·인사 히어로(KPI 4종 내장: 내 노트·후기·글·댓글)·관심 키워드·인기글. noindex (구 /record)
/notes                              내 노트 — 시술 노트 KPI 3종 + 3토글(타임라인/달력/목록). noindex (구 /record/notes)
/notes/[id]                         시술 노트 상세(본인 소유만, RLS) — noindex (구 /record/[id])
/notes/[id]/edit                    시술 노트 편집·삭제(본인 소유만, RLS) — DiaryForm 회원 편집모드(후기 UI 없이 방문일·병원·원장·메모·금액·시술목록).
                                    병원 대행분(source='clinic')은 지점 정보 잠금·스냅샷 보존. PATCH/DELETE /api/visits/[id](update_visit/delete_visit 0353). noindex
/weather                            오늘의 피부 날씨 상세 — noindex (구 /record/weather)
/my                                 마이페이지 허브(MyPageView, canvas="my" #F5FBFF — R5 헤더·캔버스 동색화. 모바일 헤더=titleHeader "마이페이지"+벨+설정) — 프로필 카드 + 내 피부 정보 접힘/펼침(연령대·얼굴형·피부타입 태그 + 피부고민·관심시술·받은 시술 칩 — PII 는 get_profile_pii RPC 경유, 받은 시술은 diaries 계열 distinct 를 카테고리색 칩으로) +
                                    요약 통계 3등분(좋아요·북마크·최근 본 글) + 나의 활동/관심/설정/고객지원. 진입은 헤더 우상단 아바타로만(하단 탭에서 제거 — 리포트로 교체). 회원은 직접 렌더, admin→/admin·doctor→/doctor·clinic→/clinic 리다이렉트.
                                    활동/관심은 /{handle} 필터 칩으로, 정보 수정·앱 설정·탈퇴하기는 /my/settings 로 연결. noindex
/my/settings                        프로필·설정 전용 화면(MySettingsView — ProfileEditClient(embedded=false, autosave·탈퇴 typed-confirmation footer 내장) + ClinicLinksSection 무조건 렌더, canvas="profile" + back(/my)).
                                    데이터 조립=lib/profile-settings-data.ts::buildProfileSettingsProps(active 명함 base SELECT + get_profile_pii RPC 병합). 비로그인 /login?next= + admin/doctor/clinic 각 대시보드 redirect. noindex (ADR 0026)
/shop                               쇼핑 준비중 — noindex
/review/new                         시술후기 작성 (P3-d, 전용 폼. /write 시술후기 탭이 이 ReviewForm 공유)
/clinic                             병원 대시보드(role=clinic 전용, 그 외 404) — 현황 Stat 카드 + 운영 프로그램 카드(관리자 /admin 패턴).
                                    get_clinic_dashboard RPC(0349). noindex(clinic/layout)
/clinic/patients                    환자 관리 — 정렬·검색·필터 DB 테이블(관리자 /admin/users 패턴: 이름·등록번호·아이디·생일·나이·성별·상태·등록일·최근시술일·시술수(전 컬럼 가운데정렬),
                                    헤더 정렬 7종(등록번호 포함, 0356)·상태 칩·통합검색[이름/등록번호/아이디/생일 790126 OR]·"더 보기"). get_clinic_patients v2(0351/0352/0356)
/clinic/patients/new                환자 등록(handle+실명+생일 → 동의 요청). 별도 페이지
/clinic/patients/[linkId]           환자 상세(스냅샷+병원 항목 수정, 서버 fresh 로드) + 그 환자 시술기록 타임라인(get_clinic_patient_visits 0350). 시술노트 작성·편집 진입(active만)
/clinic/patients/[linkId]/visits/[visitId]/edit
                                    시술노트 대행 열람·편집·삭제(진입=읽기 카드[?mode 기본 view] → '수정' 눌러 DiaryForm mode='clinic' 편집[?mode=edit] → PATCH/DELETE /api/clinic/visits/[id], clinic_update_visit/clinic_delete_visit 0350). 저장·삭제·뒤로가기는 출처(?from=visits&back=, startsWith('/clinic') 검증) 복귀.
                                    active 연결만(C2)·후기 달린 노트 시술목록 교체 차단(C5)
/clinic/visits                      시술기록 관리 — 지점 전체 대장. 2뷰(?view=list|calendar): 목록(방문일·환자·시술요약·원장·금액·다음예약, 정렬·원장필터·검색·기본 방문일 최신순) /
                                    캘린더(데스크탑 md↑ 2단: 우측 고정 캘린더+좌측 선택일 목록[격리 조회] / 모바일 단독). 기간 과거방향(빠른버튼[오늘·최근7일·지난달·최근3개월·전체], 기본 최근3개월·미래 미포함; 년월 드롭다운+범위지정, from~to URL 동기; last3MonthsRange=visits/date-range.ts SSOT). get_clinic_visits·get_clinic_calendar_summary(0350)
/clinic/visits/new                  시술노트 대행 작성(?link=active환자→DiaryForm mode='clinic', 아니면 환자 선택 목록)
                                    ※ 공용: requireClinicPage 가드·_shared(ClinicShell=AppShell wide)·layout(noindex)
/onboarding/clinic-link/[id]        병원 연결 등록 동의(회원, 전체화면 온보딩형 §8.3 확정 문구) — 이중 동의(정보 제공+대행 저장).
                                    pending 아니면 상태 안내만. noindex(onboarding layout 상속)
```

> **메인 승격(2026-06-11)**: 기존 `/beta` 미리보기 앱이 루트로 이전. `/beta`·`/beta/:path*` → 루트 308. (승격 당시의 `TopNav`(콘텐츠 페이지)·`BottomNav`(앱 라우트) 이원 크롬은 이후 AppShell 단일화로 폐기(2026-06-26) — 현 상태는 위 두 인용블록·§4.3 참조.)

> **하단 바 개편(2026-06-16 → 2026-06-28)**: 하단 5탭 = **투데이(/today)·내 노트(/notes)·피드(/)·리포트(/reports)·쇼핑(/shop)**. 마이는 탭에서 빠지고 **헤더 우상단 아바타**로만 진입. 쇼핑은 준비중(딤드 + 토스트, 텍스트 배지 없음). 로고는 데스크탑=/(피드)·모바일=/today CSS 토글. 글쓰기는 탭에서 분리해 **우하단 FAB(`WriteFab`, 모바일 전용, → /write)** 로 재도입(데스크탑은 헤더 우측 '글쓰기' 버튼). `WriteFab` 은 `layout` 단일 배선 + `z-[110]`(AppShell z-100 오버레이 위) + 경로 블록리스트(write/review/auth/onboarding/admin/doctor). 구 `/record`→`/today`, `/record/notes`→`/notes`, `/record/[id]`→`/notes/[id]`, `/record/weather`→`/weather` (리다이렉트 없이 폴더 교체). 탭 정의는 `AppShell`(`TABS`/`GNB` — 운영 단일 셸)에 존재.

> **'beta' 네이밍 전면 제거(2026-06-16)**: 베타 미리보기 시절 명칭을 운영 표준으로 정리. `BetaSkinShell`→`AppShell`, `BetaNav`→`BottomNav`, `BetaSkinFeed`→`FeedView`, `BetaDiscovery`→`SearchPanel`(`components/beta/`→`components/search/`), `InfoBetaShell`→`InfoShell`, `BetaPolicyFooter`→`PolicyFooter`, `BetaProfileView`→`ProfileView`, `BetaAdminXView`→`AdminXView`(14), `BETA_ROUTES`→`ROUTES`, `BetaActive`→`NavTab`, `BETA_PROMOTED_*`→`APP_SHELL_*`, `useBetaSearchRouting`→`useSearchRouting`, `beta-skin.module.css`→`app.module.css`, `beta-ui`→`ui`, `beta-feed-tab`→`feed-tab`, `beta-recent`→`recent-search`, API `/api/beta-discover`→`/api/search/suggest`. 순수 리네임(동작 무변경). `components/skin/` 폴더는 'beta' 아님 → 유지.

### 2.4. 관리자 영역 (role=admin 또는 doctor)
```
/admin                              운영 대시보드
/admin/cards                        전체 글 관리
/admin/cards/[id]/edit              글 편집
/admin/review-reports               시술 리포트 요약 표 (읽기 전용, 4-1 · get_review_report_overview RPC 0328 확장판.
                                    플랫 목록·전 칸 중앙정렬·기본 후기수 내림차순·헤더 2단계 정렬,
                                    만족도 분포는 툴팁 — 원장 확정 2026-07-04. 대시보드 상단 숫자 카드가 직행)
/admin/comments                     댓글 관리
/admin/doctors                      원장 목록 관리
/admin/doctors/[slug]/edit          원장 프로필 편집
/admin/draft                        AI 글 초안 생성
/admin/users                        회원 관리 (행마다 provider·생일·성별 표시; 이메일은 RPC 보유·화면 미표시)
/admin/users/[id]                   사용자 상세 + 원장 명함 신설·연결 폼 (2026-05-30, ADR 0016 — CRITICAL-3 대체. 회원 role·글 불변)
/admin/stats/[kind]                 세부 통계
/admin/auth-errors                  회원가입 에러 로그
/admin/reports                      신고 검토 큐 (배치 ④, 2026-05-28)
```

### 2.5. API 라우트

#### 글/댓글/카드
```
POST   /api/articles                글 생성 (post/qa)
PUT    /api/articles/[id]           글 수정
POST   /api/reviews                 시술후기 생성 (P3-c, create_procedure_review RPC)
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
GET    /api/iploc                   IP 기반 대략위치 폴백 — Vercel IP 지오 헤더(x-vercel-ip-*)만 읽음, 외부 API 호출 0건(ADR 0021 무관). no-store. 피부날씨 측위 사다리 2단계(§12)
```

> 날씨 데이터(Open-Meteo)는 **클라이언트가 직접 호출**한다(서버 프록시 라우트 없음 — 공유 서버리스 IP per-IP 한도 합산 회피, ADR 0021). `/api/iploc` 은 좌표 폴백만 담당하고 날씨를 프록시하지 않는다.

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
PUT    /api/admin/doctors/[slug]/profile  의사 확장 프로필 (profile_data) 저장 (super admin OR 본인 의사)
POST   /api/admin/users/[id]/doctor-profile  원장 명함 신설·연결 (super admin, ADR 0016. RPC admin_create_doctor_profile)
GET    /api/admin/slug-check  의사 글 post_slug 형식·중복 검사 공용 (super admin. draft·edit 화면 공유. doctorId|doctorSlug + year + slug)
*      /api/admin/comments
*      /api/admin/stats/[kind]
POST   /api/admin/draft
POST   /api/admin/draft/step1
POST   /api/admin/draft/step2
POST   /api/admin/draft/save
POST   /api/admin/draft/analyze
POST   /api/admin/draft/publish
POST   /api/admin/draft/pubmed-by-pmid
PATCH  /api/admin/reports/[id]      모더레이션 액션 (hide/delete/dismiss)
POST   /api/admin/extract-keywords
GET    /api/admin/youtube-oauth/start / callback / status
```

### 2.6. 메타 / SEO / AEO / GEO
```
/sitemap.xml                        ISR sitemap (revalidate=3600 — 쿠키리스 anon 클라이언트, R3-3)
                                    정적 라우트 12종 + 참여 전문의 + Q&A canonical + 토픽 hub
                                    cards.lastModified = updated_at ?? created_at (2026-05-28)
/robots.txt                         robots — SITE_PUBLIC env 기반 HOLD 스위치
                                    HOLD: User-agent:* Disallow:/
                                    PUBLIC: 2-tier AI 크롤러 정책 (TIER1 허용·TIER2 차단, 2026-06-06)
/manifest.json                      PWA manifest
/rss.xml                            RSS 2.0 — 의사 Q&A 최신 50건 (네이버 freshness signal)
                                    ISR revalidate=1800 · dc:creator(xmlns:dc) 표준 (R3-3)
/llms.txt                           llmstxt.org 풀버전 (인용 정책 + 운영 정보)
/.well-known/security.txt           RFC 9116 보안 제보 채널
/.well-known/agent-card.json        AI 에이전트 인터페이스 (citationPolicy, endpoints)
/.well-known/ai-policy.json         IETF AI Preferences draft (training/search 선호)
/api/csp-report                     CSP 위반 보고 endpoint (console.warn 적재)
```

---

## 3. 디렉터리 구조

```
src/
├── app/                            Next.js App Router
│   ├── layout.tsx                  max-w 1080 컨테이너 + ScrollManager + WriteFab (TopNav/BottomNav 미렌더 — AppShell 단일화로 폐기 2026-06-26)
│   ├── page.tsx                    홈 피드
│   ├── (route)/page.tsx            각 페이지
│   ├── (route)/[Client].tsx        클라이언트 페이지 컴포넌트
│   └── api/                        API 라우트
├── components/                     공용 React 컴포넌트
│   ├── card/                       Card 시스템 (Header/Body/Media/Actions + hooks + utils)
│   ├── card-editor/                CardEditor 통합 (모든 작성·수정 진입점)
│   ├── skin/                       AppShell(공용 셸·헤더·5탭·인-헤더 검색) + FeedView + FeedSidebar
│   ├── search/                     SearchPanel(검색 발견 패널 — 인-헤더 드롭다운/모바일 풀스크린)
│   └── *.tsx                       Feed, IdentitySwitcher, CommentsBlock, ...
├── lib/                            비즈니스 로직 / 유틸
│   ├── supabase/                   3종 클라이언트 (client/server/admin)
│   ├── ai/                         Claude 초안 파이프라인
│   ├── auth/                       OAuth (naver, providers)
│   ├── schema/                     JSON-LD (doctor/clinic/procedure) + zod 검증
│   │                                — clinic 페이지별 scope: layout=그룹만,
│   │                                  /·about·contact=5개+그룹, 의사 페이지=단일 지점만
│   │                                  헬퍼: groupOnlySchema/allClinicsSchema/
│   │                                  clinicSchemaForDoctor/clinicIdRefForDoctor
│   └── identity*.ts                Identity 시스템 (Phase 9)
├── data/                           slug-mapping.ts(슬러그 헬퍼) + tag-dictionary.generated.json(빌드 스냅샷, gen-tag-dictionary)
└── middleware.ts                   약관/온보딩 가드 + 없는경로 실제404 + CSRF Origin 검증

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
| `card/ReviewSummary.tsx` | 시술후기(review) 카드 제목 아래 정량 요약 한 줄 — `★ · 통증 · 재시술(또 받을래요…) · 회복(당일 회복…) · 효과 3개+"+n"`. 효과 "+n" 탭 = 전체 펼침/재탭 축소(토글, stopPropagation). 값은 procedure_review 임베드(RPC 0330: downtime 포함). 신 스킨 PostCard·구 스킨 Card.tsx(afterTitle) 공유 |
| `card/CardMedia.tsx` | YouTube 영상 보러가기 + 외부 링크 OG |
| `card/CardActions.tsx` | 좋아요·댓글·저장·공유 |
| `card/CardKeywords.tsx` | 키워드 칩 |
| `card/hooks/useCardViewer.ts` | view·impression 큐 (시술 리포트 앵커는 `report/ReportViewTracker` 가 같은 훅 재사용 — /reports 상세도 조회 기록. 2026-06-29 신디자인 승격 때 누락됐다 2026-07-04 복원) |
| `card/hooks/useCardEngagement.ts` | like·save·share 인터랙션 |

> **상대시간 SSOT**: `lib/relative-time.ts::formatRelativeTime`(+ `skin/ui.tsx::timeAgo`) — 인스타식 '전' 없는 압축 표기("3시간 / 3일 / 1달", "방금"). 댓글·카드 헤더·알림 공통. 노트 연도 그룹 헤더("올해 / 1년 전")·약관 "N일 전"·"몇 년 전" 폼 선택지는 상대 타임스탬프가 아니라 별도 맥락(미적용).
>
> **댓글 메타 배치**: `comments/CommentItem.tsx` — 시간·답글·♡는 본문 마지막 문장 끝에 인라인(우측 float 아님), ⋮ 메뉴만 우상단.

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
| `skin/AppShell.tsx` | 공용 셸 — 헤더(로고·GNB·우상단 알림/아바타) + 하단 5탭(투데이/내노트/피드/리포트/쇼핑) + **인-헤더 검색**(데스크탑 pill·모바일 풀스크린 패널, /?q= 라우팅, ←=검색 닫기/✕=검색어만 지움) + **페이지별 캔버스 variant**(`canvas?: "report"\|"my"\|"profile"` — app.module.css variant 클래스가 `--tt-canvas`/`--tt-canvas-top` 만 재정의해 상태바 필러·헤더·sticky 칩 자동 추종, 미지정=공용 그라데이션. **report·my·profile 3종은 #F5FBFF 동색화**(R5 2026-07-09 — 헤더·바디 한 색, 데스크탑 포함. /my/settings 도 canvas="profile" 이라 동반)) + **2뎁스 헤더 variant**(`backHeader?: { fallbackHref?, title?, action? }` — 모바일 헤더 좌측 로고 자리를 BackButton 으로 교체·데스크탑은 로고+GNB 유지+본문 "< 뒤로" 행. **R5(2026-07-09) title/action 슬롯 확장**: 모바일 헤더 한 줄에 페이지 타이틀·우측 액션까지 승격(내정보=`[< 내정보 … 수정]`·타인=`[< … ⋯]`, 검색·벨·아바타는 셸이 숨김). 세부 13화면 적용: 리포트 상세·프로필·/my/settings·글상세 3종·/notes/[id]·/weather·/my/recent·/topics/[tag]·/doctors/[slug]·/notifications·체크인. **이탈 가드 폼(/write*·/review 작성/수정·/notes/[id]/edit)은 가드 우회 위험으로 미적용** — R2-3) + **titleHeader variant**(`titleHeader?: { title, action? }` — R5: /my 모바일 헤더를 로고 대신 페이지 타이틀(19px/800)+우측 액션(설정)으로 승격, 검색 아이콘 미렌더·아바타 숨김. 데스크탑은 로고+GNB 유지) |
| `components/icons/index.tsx` | 공용 아이콘 모듈 — 디자인팀 SVG 21종(리포트 8·마이페이지 13) + R3 자체 2종(IconPersonGrid=리포트 히어로 그리드 전용 세로형 인물·IconBrandTT=brand-logo.svg 글리프 추출 워터마크). 단색=`currentColor`+`size` prop, 고정색·멀티컬러 3종(IconClock·IconPerson·IconShare — share 는 stroke prop) 예외. 훅 없는 순수 함수(서버/클라 공용), 기존 파일 로컬 인라인 아이콘은 점진 전환 |
| `skin/mypage/MySettingsView.tsx` | `/my/settings` 설정 전용 화면 본문 — AppShell canvas="profile"+backHeader(/my) 안에서 `ProfileEditClient`(embedded=false, 자체 h1 "내 정보") + `ClinicLinksSection` 무조건 렌더 |
| `search/SearchPanel.tsx` | 검색 발견·자동완성 패널 — 최근검색 알약 + 카테고리 텍스트 탭(시술 6종) + 키워드 칩 + 부분일치 자동완성 |
| `IdentitySwitcher.tsx` | 신분(profile) 전환 dropdown — 묶음 안 동등 독립한 profile 들 (ADR 0001, 0011) |
| `skin/FeedView.tsx` | 홈 피드(단일 컬럼 리스트) + 카테고리 탭 = **`/?cat=` URL 라우팅(서버 카테고리별 풀, 마이그 0326·URL 이 SSOT)** — 슬러그·라벨은 `lib/feed-categories.ts` SSOT, 클라 필터(matchesChip)는 전환 중 임시 표시용(2026-07-03. 종전 "풀 1개 클라 필터"는 시술후기 대량 유입 시 다른 탭이 비는 한계로 폐기). 검색 시 리포트 블렌딩 제거(2026-06-29 — searchReport 항상 null) |
| `skin/FeedSidebar.tsx` | 데스크탑 우측 사이드바 — 인기 태그·인기 Q&A·글쓰기 CTA (홈/토픽/리포트 공용) |
| `app/reports/ReportsIndexView.tsx` (+ `ReportsIndexCard.tsx`) | 시술 리포트 허브 인덱스 신디자인 — 리포트 목록 카드 + 회전 헤드라인. 접힘(요약)부는 공용 `components/report/ReportSummaryBox.tsx` 로 추출(토픽 닫힌 글상자와 SSOT 공유, 2026-07-02). SEO/JSON-LD 는 상위 `page.tsx` 가 담당(렌더만) |
| `app/reports/[procedure]/ReportsDetailView.tsx` (+ `ReportsReviewCard.tsx`) | 시술 리포트 상세 신디자인 — 집계 + 후기 카드(따옴표 본문·아바타·작성자 나이·성별)·비슷한 시술. SEO/JSON-LD 는 상위 `page.tsx` 담당 |
| `components/report/ReportsIndexSidebar.tsx` | 리포트 인덱스·상세 공용 사이드바 (2단 레이아웃; 상세에선 `footer` 로 `ReportShareButtons` 저장/공유 렌더) |
| `app/reports/layout.tsx` + `ReportsShell.tsx` | /reports 공유 layout 셸 — 서버 `layout`(force-dynamic)이 풀(`reports-pool.ts`, React `cache()`) 로드 → 클라 `ReportsShell` 이 `AppShell`(상단바·사이드바) persist(인덱스↔상세 좌측 본문만 교체). 메타/JSON-LD 는 각 `page.tsx` 보유(셸 미관여). ADR 0025 |
| `app/reports/category-context.tsx`, `app/reports/reports-pool.ts` | 카테고리 필터 클라 컨텍스트(URL RSC 재요청 회피) / 풀 요청단위 메모(`getReportsPoolCached`) |
| `app/reports/ReportShareButtons.tsx` | 상세 저장/공유 2버튼 — 저장=앵커 카드 `card_saves` 진짜 북마크(toggle_card_save), 데스크탑 사이드바 푸터(상세 전용) 렌더. 모바일 하단 고정 바·히어로 버튼과 동일 배선(앵커 없으면 미노출) |
| `lib/report-headline.ts` | 회전 헤드라인 엔진 — 시술 시그널 → 헤드라인 풀 빌드·매 요청 랜덤 픽(효과 단정 금지) |

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
| `ServiceWorkerRegister.tsx` | `/sw.js` 등록 (오프라인·웹푸시 토대). `layout` mount. 옛 `InstallPrompt`(PWA 설치 안내 모달)에서 등록하던 것을 모달 제거(2026-06-24, 네이티브 앱 출시) 후 별도 컴포넌트로 분리 |
| `NativeStatusBar.tsx` | 네이티브(Capacitor) 상태바 글씨/아이콘 색 런타임 보정 — 밝은 헤더 배경에 어두운(검정) 글씨(`StatusBar.setStyle(Light)`). `layout` mount, 웹=no-op(동적 import 가드). 상태바 플러그인 설치된 라이브 앱엔 웹 배포만으로 즉시 반영 |
| `InAppBrowserNotice.tsx` | 인앱브라우저 안내 |

### 4.6. 안내 / 푸터
| 파일 | 역할 |
|---|---|
| `InfoPageLayout.tsx`, `InfoNav.tsx` | 안내 페이지 wrapper (6칩 nav) |
| `SiteFooter.tsx` | 사이트 푸터 (7→6 링크) |
| `BackButton.tsx` | 뒤로가기 |
| `ScrollManager.tsx` | 라우트 전환 시 스크롤 위치 저장·복원. 피드 뒤로가기 복원은 `lib/feed-scroll-restore.ts`(풀 전체+scrollTop+q/cat 스냅샷, sessionStorage·safe-storage 경유·단일 키·TTL 30분)와 연동 — 앱셸이 fixed 오버레이 내부 `.root` 스크롤러라 window.scrollY 가 항상 0 이던 문제 대응(R5-3). 소진형 트리거(문서 back_forward + SPA popstate), PTR·검색·칩전환·새로고침은 미발화 |
| `SocialLoginButtons.tsx`, `LogoutButton.tsx` | 인증 UI |

---

## 5. Identity 시스템 (Phase 9)

ADR 0001 참조. 단일 표준 — Persona 시스템(official/personal)은 2026-05-15 완전 폐기.

### 5.1. 모델
- 쿠키 2개: `pibutenten:identity` (httpOnly — 서버 전용 신뢰) + `pibutenten:identity-mirror` (클라 UI 표시 전용) — 값은 항상 active `profile.id` **UUID**. `/api/identity/switch` 가 두 값 동시 set. 옛 sentinel `"primary"` 는 폐지 — 구 쿠키값이 오면 서버 진입 시 base UUID 로 정규화 (`src/lib/identity-shared.ts`)
- 같은 `auth_user_id` 묶음으로 묶인 **독립 profiles row 다수**
- 한 사람이 두 모드 (의사·일반) 활동 → **별개 profile row** 생성 후 묶음에 추가
- 모든 인터랙션 시 명함 ID 컬럼 (`author_id` / `profile_id`) = active profile.id
- 의사 vs 회원 구분 = `profiles.doctor_id` (SSOT)

### 5.1.1. 사람 ID 3계층 (ADR 0014)

| 계층 | 컬럼 | 의미 | 코드에서 |
|---|---|---|---|
| 인증 ID | `auth.users.id` | OAuth 로그인 단위 (1사람 = 1개) | `user.id` (supabase.auth.getUser 결과) |
| 명함 ID | `profiles.id` | 활동 단위 (1사람 = N명함) | `idCtx.active.profileId` |
| 묶음 표시 | `profiles.auth_user_id` | 같은 사람의 명함끼리 같은 값 (FK 없음) | `bundleProfileFilter` 등에서 사용 |

### 5.1.2. `profiles.id` 참조 컬럼 명명 (ADR 0014 — 9개 테이블 `user_id`→`profile_id` RENAME 완료, 마이그 0186/0187)

| 역할 | 컬럼명 | 사용 테이블 |
|---|---|---|
| 콘텐츠 책임 주체 | `author_id` | `cards`, `comments` |
| 명함 소유·행위자 | `profile_id` | `notification_preferences`, `push_subscriptions`, `search_logs`, `card_likes`, `card_saves`, `comment_likes`, `card_views`, `card_impressions`, `card_shares`, `activity_points`, `daily_logins`, `site_visits` |
| 한 row 둘 이상 등장 | 역할 접두사 (`actor_*`, `recipient_*`, `reporter_*`, `resolved_by`) | `notifications`, `content_reports`, `audit_logs` |
| 로그인 계정 참조 | `auth_user_id` | `profiles.auth_user_id`, `audit_logs.actor_auth_user_id` |

`user_id` 신규 사용 금지. pre-commit hook `scripts/column-naming-check.js` 가 자동 차단.

### 5.2. 헬퍼
- 서버: `getIdentityContext()` → `{user, active, isSuperAdmin, isDoctorAdmin, activeDoctorId}` (`src/lib/identity.ts`)
- 서버 헬퍼 추출: `resolveActiveIdentity()` (`src/lib/identity-server.ts`)
- 공통: `src/lib/identity-shared.ts` (isomorphic. IDENTITY_COOKIE/UUID_RE/ActiveIdentity 타입)
- 클라: `getActiveIdentityId()` (`src/lib/active-identity.ts`)

### 5.3. UI
- `IdentitySwitcher`: 묶음 내 ID 전환 (AppShell 헤더 우상단 아바타로 진입, → /my)
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
- allow-list: `pibutenten.kr`, 레거시 `pbtt.kr`, `pibutenten-webapp-*.vercel.app` (정확 매칭)
- `VERCEL_ENV` 기반 환경별 분기
- LAN IP 는 dev 한정

### 6.4. 없는 경로 실제 404 (소프트 404 차단, 2026-07-05)
- `/reports/{slug}`·`/{handle}`(단일 세그먼트)·최상위 미존재 `.xml` 은 route-level `loading.tsx`+force-dynamic 부모 layout 이 만드는 `<Suspense>` 스트리밍 경계 아래에서 `notFound()` 를 부르므로 그 시점엔 이미 200(소프트 404)이 확정됨 → **렌더 이전 미들웨어**에서 존재검사 후 미존재면 `lib/not-found-response.ts` 로 `status:404`+`X-Robots-Tag:noindex` Response 를 직접 반환(친절 안내 HTML — `app/not-found.tsx` 와 dual-source, CLAUDE.md §5 페어). rewrite 는 루트 `app/loading.tsx` 가 다시 Suspense 로 감싸 200 재발하므로 미사용.
- **온보딩 fast-path(6.1) 이전 실행** — 라우팅 존재판정은 로그인·온보딩과 무관하므로 비로그인·크롤러 + 로그인 회원 모두 동일 적용(2026-07-05 정정: 종전 온보딩 쿠키 fast-path 뒤라 로그인 회원 소프트 404 잔존).
- 오탐 방지: `RESERVED_FIRST_SEGMENT`(`route-class.ts` SSOT) 실제 라우트·홈은 조회 없이 통과, `HANDLE_RE`(`identity-shared.ts` SSOT) 형식 게이트 불일치·`decodeURIComponent` 실패(malformed 인코딩)는 조회 없이 404. `/reports` en 슬러그는 ko 로 308 유지.
- 모든 DB 존재검사는 **fail-open**(조회 예외·에러 시 통과 — 유효 페이지 오404 차단). 비용은 단일 세그먼트 비예약 경로·리포트 상세 진입에만.

---

## 7. Supabase 클라이언트 4종

| 파일 | 사용처 | 권한 |
|---|---|---|
| `src/lib/supabase/client.ts` | 브라우저 (브라우저 쿠키) | anon |
| `src/lib/supabase/server.ts` | 서버 컴포넌트·API (Next.js cookies()) | anon (사용자 세션 기반) |
| `src/lib/supabase/admin.ts` | 서버 측 service_role 필요한 작업 | service_role |
| `src/lib/supabase/anon.ts` | **캐시/ISR 공개 렌더** (쿠키리스) | anon (세션 없음) |

- `admin.ts` 는 `server-only` import 로 클라이언트 번들 노출 차단
- `anon.ts`(V3, 2026-06-07)는 `cookies()` 를 건드리지 않아 라우트가 동적 강제되지 않음 → 상세 등 ISR 캐시 페이지의 공개 데이터 읽기 전용. RLS 상 published 행만 → 캐시 결과 개인정보 0 (§11·ADR 0020).
- **클라이언트 base URL**: 세 클라이언트 모두 `NEXT_PUBLIC_SUPABASE_URL` 사용. production 값은 Supabase **Custom Domain** `https://auth.pibutenten.kr` (auth/rest/storage/realtime 전부 프록시). 로컬·템플릿은 프로젝트 ref 의 `*.supabase.co` 직결. 도메인 이전(2026-05-31, ADR 0018)으로 OAuth redirect URI·CSP `connect-src` 도 `auth.pibutenten.kr` 기준.

---

## 8. 디자인 토큰 (`src/app/globals.css`)

색상·간격·라운드·그림자 토큰의 **단일 출처(SSOT)는 `src/app/globals.css` 의 `:root`** 입니다. 아래는 역할 안내일 뿐이며 **실측 hex 는 globals.css 가 권위** — 드리프트 방지를 위해 본 문서에 hex 를 복제하지 않습니다.

- 메인: `--primary`(#4CBFF2 하늘색) · `--primary-dark`(hover/active) · `--primary-active`(흰글씨 대비 ≥4.5:1 칩) · `--primary-soft`(hover/selection) · `--primary-light`/`--primary-light-hover`(CTA·칩)
- 보조: `--secondary`(딥 네이비) · `--secondary-light`
- 텍스트 4톤: `--text`(제목/닉네임) · `--text-secondary`(본문) · `--text-icon`(액션 아이콘·숫자) · `--text-muted`(카테고리/더보기/태그)
- 배경/경계: `--bg` · `--bg-soft` · `--white` · `--border`
- 액센트·배지: `--accent`(좋아요 코랄) · `--accent-soft` · `--accent-new/-hot/-pick/-like/-save` · `--doctor-badge` · `--card-highlight`
- admin 칩 활성 배경: `--chip-active-bg`(/admin/cards·/admin/tags 공유)
- 그림자 `--shadow-sm/-/-lg` · 라운드 `--radius-sm/-/-lg`

카드 강조 하이라이트 5색의 SSOT 는 `src/lib/card-highlight.ts` 의 `HIGHLIGHT_PALETTE` 입니다(현재 100/200 중간 톤: Sky #CDECFE / Mint #CCFAD9 / Pink #FDDDE9 / Apricot #FEE2BF / Lavender #EEDFFF).

**admin 칩·탭 통일(Q, 2026-06-07)**: `/admin/tags` 분류·상태·기간 칩은 `/admin/cards` '전체 타입' 칩의 마크업·클래스를 1:1 차용(세그먼트 컨테이너 `inline-flex … border bg-white p-0.5` + 칩 `rounded-[var(--radius-sm)] px-3 py-1 text-xs`, 활성 배경 `--chip-active-bg` 인라인 style). 요약 탭(KPI) 활성 = `--primary` 텍스트+밑줄(카드 status 탭과 동일). 화면별 인라인 색 금지 — 토큰만 참조.

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
- **0014** 사람 ID 컬럼 명명 통일 (`author_id`/`profile_id`/`auth_user_id`)
- **0015** 온보딩 게이트 active 명함 기준 정합
- **0016** 의사 프로필 연결
- **0017** 콘텐츠에 자기 사이트 절대 URL 저장 금지 — 도메인 이전 시 DB 무수정
- **0018** 도메인 이전 `pbtt.kr` → `pibutenten.kr` (전략·단계·인프라). auth 커스텀 도메인·SITE_URL 단일 출처·308 영구 리다이렉트.
- **0019** P3 시술 후기 — 분류 체계·이중집계·노출 정책. (2026-06-25 amend: 1인1시술1후기 제약 해제 → `0023`)
- **0020** 렌더링·캐싱 = 공유 셸 + 클라이언트 개인화 (V-Phase 2026-06-07). 상세 ISR 캐시 + 개인화는 클라. §11.
- **0021** 무료 per-IP 한도 API 를 공유 서버리스 IP 로 프록시 금지 — 날씨(Open-Meteo)는 클라 직접 호출. `/api/iploc`(Vercel 헤더만) 은 적용범위 밖. §12.
- **0022** 네이티브 웹뷰 측위 권한 — 원격 URL 로드 WebView 는 iOS `Info.plist NSLocationWhenInUseUsageDescription`·Android `ACCESS_COARSE/FINE_LOCATION` 선언 + `@capacitor/geolocation` 경로 필요. §12.
- **0023** 같은 시술 후기 다중 작성 허용 (1인1시술1후기 제약 해제, `0019` amend) — 2026-06-25
- **0024** `/reports-new` 신디자인을 정식 `/reports` 로 승격 — SEO 셸(generateMetadata·JSON-LD·canonical·en→ko 308) 보존하고 렌더만 교체(in-place), `/reports-new`→308, 개별 작성자 인구통계 RPC(0322) 도입(집계 0212와 별개·개인 단위 노출 트레이드오프) — 2026-06-29
- **0025** `/reports` 인덱스↔상세 공유 layout — `layout.tsx`(서버, 풀 cache) → `ReportsShell`(클라) → `AppShell` persist 로 상단바·사이드바 유지·좌측 본문만 교체(메타/JSON-LD 는 page 보유=SEO 무손상). 근본 로딩속도는 별도 안건, 셸 persist 로 생긴 `.root` 스크롤 잔존 회귀는 상세 마운트 시 scrollTop=0 으로 수정 — 2026-06-29
- **0026** 마이페이지·프로필 재편 — 설정 전용 라우트 `/my/settings` 분리(구 /{handle} 아코디언 이관, `profile-settings-data.ts` 공용 조립), skin 탭 제거(피부정보 상세 → /my '내 피부 정보'), 프로필=필터 칩+카드 목록, 페이지별 캔버스 variant(AppShell canvas prop) — 2026-07-08

---

## 10. 태그 사전 SSOT (`tag_dictionary`) — L-Phase2 (2026-06-07)

태그·시술명 사전이 **DB `tag_dictionary` 단일 SSOT** 로 일원화됨. 과거 `procedure-mappings.json`(819 큐레이션)·`procedure_taxonomy`(중복 시술표)는 청산.

- **DB 스키마**: `tag_dictionary(ko PK-uniq, category(한글), en(slug), parent_ko, is_procedure, onboarding, sort_order, aliases text[], pubmed_keywords text[], is_recommendable)` + 참조 테이블 `tag_blacklist(word)`·`tag_normalization(canonical=변형어, variants=결과[])`.
- **빌드타임 스냅샷**: `scripts/gen-tag-dictionary.mjs`(package.json prebuild)가 DB 를 anon REST 로 읽어 `src/data/tag-dictionary.generated.json` 산출(필드: category·slug·pubmed·pubmedLookup·aliases·blacklist·normalizations·autotag). DB 미접근 시 커밋된 스냅샷 보존(빌드 무중단). **같은 실행에서 클라이언트 경량 투영 `tag-dictionary.client.generated.json` 도 함께 생성**(R4-3) — 클라 사용 4필드(category·slug·blacklist·normalizations)만 같은 객체 참조로 투영(drift 불가). 전체 스냅샷(203KB, pubmed·autotag 포함)은 **서버 전용** — 클라 번들 유입 금지.
- **TS lookup 레이어**: 클라 공용 함수(`categoryFor`·`normalizeTag(s)`·`isBlacklisted`)는 `src/lib/procedure-dict.client.ts`(경량 투영 로드)에 구현, `src/lib/procedure-dict.ts`(서버 진입점)가 re-export + 서버 전용 `slugFor`·`pubmedKeywordsFor`·`getPubmedDict`(전체 스냅샷). thin wrapper: `tag-dictionary.ts`(서버 전용)·`category-sets.ts`(클라 공용)·`schema/procedure.ts`. 슬러그 생성 `data/procedure-mappings/slug-mapping.ts`(buildSlug)는 경량 투영의 `slug` 사용(동일 데이터).
- **자동태깅(현황)**: 옛 `lib/auto-tag.ts`(회원 글쓰기 무료 사전 매칭)는 미사용으로 삭제됨(2026-06-26, import 0건). 스냅샷 `autotag` 필드(=`is_recommendable=true` 대표어 + aliases, 804)는 계속 생성되나 **현재 코드 소비처 없음**(향후 재도입 대비 데이터 유지). 현재 태그 자동 추출은 관리자 LLM 경로(`POST /api/admin/extract-keywords`)뿐.
- **흡수 트리거 통일**(SSOT 한 경로 — 일반인·원장·관리자 동일): `cards` BEFORE INSERT/UPDATE OF keywords → `cards_absorb_eng_tags()` 가 ① alias(언어 무관) 매칭 시 대표어로 ② 영문 slugify→en 매칭 폴백. 미매칭 신규 태그는 AFTER `cards_register_tags_trg` 가 미지정으로 등록. 로그 `tag_absorb_log`.
- **관리자 편집**: `/admin/tags`(태그 관리) + PATCH `/api/admin/tag-dictionary/[id]`(분류·영문·부모·시술·온보딩·is_recommendable) + rename/merge RPC(`rename_tag`·`merge_tag`, cards.keywords 단일 tx 전파·트리거 disable·updated_at 보존). 목록은 `get_tag_admin_overview` RPC(사용량·검색량) range 청크(행 상한 1000 회피).

---

## 11. 렌더링·캐싱 전략 (공유 셸 + 클라 개인화) — V-Phase (2026-06-07)

원칙: **서버는 모두에게 동일한 공유 셸만 렌더(캐시 가능), 개인화는 전부 클라.** 같은 HTML 을 전원에게 캐시 서빙해도 개인정보 누출 불가. 결정 배경·기각안 = ADR 0020.

| 영역 | 렌더 | 캐시 | 비고 |
|---|---|---|---|
| 의사 Q&A **상세** `doctors/[slug]/[year]/[postSlug]` | ISR (`●`) | `revalidate=86400` + `unstable_cache(tags:["qa-content"])` | `x-vercel-cache: HIT`. `generateStaticParams()=[]`(on-demand). 쿠키리스 `anon.ts` 읽기 |
| **홈** `/` · **토픽** `/topics/[tag]` · 개인 페이지 | 동적 (`ƒ`) | 페이지=no-store, **데이터=`unstable_cache`** | 홈=force-dynamic 이나 비검색 피드 풀(`home-feed` 90s)·리포트 풀(`home-report` 90s)·인기태그(`popular-tags` 300s)는 쿠키리스 anon `unstable_cache`(발행/수정/삭제 라우트가 `revalidateTag` 로 즉시 무효화 + 타이머 폴백). per-user 좋아요/저장은 SSR 에서 제거 — FeedView 가 마운트 후 `/api/viewer-states` 로 클라 배치 조회(비검색 홈 사용자 무관·경량). 토픽=한글 URL ISR 헤더 깨짐(아래)으로 동적 유지 |
| **세션**(로그인·아바타·명함) | 클라 | — | `SessionProvider` 가 mirror 쿠키(동기)+`/api/session`(비동기) |
| **좋아요/저장/공유 수** | 클라 | — | 캐시 상세에서만 마운트 시 라이브 재조회(`useCardEngagement`) |
| **내 좋아요/저장 여부** | 클라 | — | `Card`("use client") |

- **레이아웃**: `layout.tsx` 는 V1 이후 서버 세션·쿠키를 안 읽음. `force-dynamic` 도 V3 에서 제거(전역). (2026-06-11 구 FAB 폐기 후 2026-06-16 `WriteFab` 재도입 — 하단 5탭은 `AppShell` 단일 셸.) **개인·동적 페이지**(/, /reports, /[handle], /write, /today, /notes, /my, /my/settings, /shop, settings, admin, notifications, review, onboarding)는 각자 `export const dynamic="force-dynamic"`(검색은 별도 라우트 없이 홈 /?q= — 홈이 이미 force-dynamic).
- **캐시 무효화**: 콘텐츠 변경(발행/생성/수정/숨김/삭제) 라우트가 `revalidateTag("qa-content"/"topics","max")`(Next 16 2인자) → 상세 수정 **즉시** 반영. 카운트는 24h fallback이지만 클라 라이브라 실질 즉시.
- **★한글 URL + ISR 금지**: ISR 캐시 페이지는 Next 16 이 페이지 경로를 implicit `x-next-cache-tags` HTTP 헤더(ASCII 전용)에 넣음. 토픽 URL 은 한글(`/topics/콜라겐`)이라 헤더가 깨져 **500(`ERR_INVALID_CHAR`)** → 토픽은 동적 유지. 상세는 ASCII slug 라 무관.
- **홈 피드 단일 컬럼 리스트**: 승격된 홈은 `components/skin/FeedView.tsx` 가 단일 컬럼 리스트(`app.module.css` 의 `.feedList` = flex column)로 렌더(react-masonry-css 미사용 — `page.tsx` 에 breakpointCols/isMobileUA prop 없음). CLS 는 카드 고정 골격·스켈레톤(`FeedSkeleton`)으로 관리.
- **CWV(합성 모바일 랩)**: 캐시 상세 LCP 0.41s·CLS 0·INP 72ms 🟢. 홈/토픽은 동적이라 LCP ~2.1–2.6s. 상세 = 표준 PSI/Lighthouse 가 GA4 비콘 행잉으로 불가 → Playwright Performance API 로 실측. 진짜 INP 는 공개 후 CrUX 필드값으로 확정.

---

## 12. 피부날씨 측위·역지오코딩 (`useWeather`)

"오늘의 피부 날씨"(`/today` 상단 카드 + `/weather` 상세)의 위치 획득·표시 구조. 훅 `src/components/skin/record/skin-weather/useWeather.ts` 가 카드·상세 공용 데이터 소스(stale-while-revalidate).

**측위 사다리 (3단 폴백)**:
1. **기기 측위** — `acquirePosition()`. 웹/PWA=`navigator.geolocation`, 네이티브(Capacitor)=`@capacitor/geolocation`(동적 import; 권한 확인·요청 후 `getCurrentPosition`). 플러그인 미존재·로드 실패·권한거부 시 `navigator` 로 폴백(no-op 안전). 네이티브 권한 선언 토대 = ADR 0022.
2. **IP 대략위치** — 기기 측위 실패 시 `/api/iploc`(Vercel IP 지오 헤더, 외부호출 0건). 시 단위 좌표만.
3. **`DEFAULT_LOC`(대치동)** — IP 폴백도 실패(404·무효 좌표)할 때만 쓰는 최후 수단.

**표시 이름(역지오코딩)**: `reverseGeocodeKo`(BigDataCloud, 무료·키 불필요). GPS=동/읍/면 단위(`coarse=false`), IP=시/도 단위(`coarse=true` — 동·구는 IP 로 부정확해 의도적으로 안 내려감). 실패 시 "내 위치" placeholder 유지.

**캐시(localStorage, stale-while-revalidate)**: 좌표키(`coordKey`) + last 키(`LAST_KEY`, 30분 TTL). 첫 표시 지연 제거용으로 직전 *실제* 위치 스냅샷을 seed 로 즉시 렌더 후 측위로 revalidate. **"내 위치"(placeholder)·"대치동"(DEFAULT_LOC) 은 seed 로 굳히지 않음** — 역지오코딩 지연·정밀 fetch 실패 시 이 둘이 `LAST_KEY` 에 영구 잔존해 동 이름 대신 계속 표시되던 회귀('전원 대치동' 잔존) 방지. 실제 동 이름이 도착한 정밀 결과만 seed.

**날씨 데이터**: Open-Meteo 를 **클라이언트가 직접 호출**(`fetchWeather`, 병렬). 서버 프록시 라우트 없음 — 공유 서버리스 egress IP 의 per-IP 한도 합산 회피(ADR 0021). 따라서 `/api/weather` 류 프록시 라우트는 존재하지 않는다.

> 데이터 도메인 명세(역지오코딩 단위 선택·캐시 키 규칙 등)는 본 절이 SSOT. `TECH_SPEC.md` 는 이 절을 참조만 한다.

---

**이 문서 변경 시**: 새 컴포넌트·라우트 추가는 `PRD.md §4` (핵심 기능) 와 `CHANGELOG.md` 양쪽 갱신.
