# 피부텐텐 (Pibutenten) — PRD & 개발 현황

> 마지막 업데이트: 2026-05-06

## 프로젝트 개요

- **이름**: 피부텐텐 — 피부과 전문의가 함께하는 Q&A·SNS
- **회사**: 주식회사 진솔컴퍼니
- **운영자**: jminbae@gmail.com
- **슬로건**: 피부가 예뻐지는 모든 이야기 / 피부가 예뻐지는 10분
- **현재 라이브**: https://pibutenten-webapp.vercel.app
- **정식 도메인 (예정)**: https://pibutenten.com
- **출시 계획**:
  - 5월: 기본 개발 완료 → 5개 지점(강남·수원·판교·건대·대구) 직원·가족 비공개 베타 1개월
  - 6월: pibutenten.com 정식 런칭

---

## 기술 스택

- **Next.js 16.2.4** (App Router, Turbopack), TypeScript strict
- **Supabase**: Auth (Email + Google OAuth + Kakao OAuth), Storage (`articles` bucket), RLS, Postgres RPC, Management API
- **Vercel**: ICN1 region, OG ImageResponse, 자동 배포
- **Anthropic Claude API**: `claude-opus-4-7` — AI Q&A 초안 자동 생성
- **YouTube Transcript**: 자막 fetch + fallback
- **Tailwind CSS v4** + CSS variables

---

## 도메인/리소스

### Supabase
- 프로젝트 ref: `nahznfvouuwxqctwlwfs`
- OAuth Callback (Google/Kakao 등 모두 공통):
  ```
  https://nahznfvouuwxqctwlwfs.supabase.co/auth/v1/callback
  ```
- Management API token: `.env.local` (`SUPABASE_ACCESS_TOKEN`)

### Google OAuth
- Cloud 프로젝트: `pibutenten` (organization 없음)
- Client ID: `1043775518147-vpnnf87ags5j72qsi21nbg9n6a5pq3l1.apps.googleusercontent.com`
- 상태: ✅ **완료, 정상 로그인 작동 확인됨**

### Kakao OAuth
- 앱 ID: `1449024`
- 앱 이름: 피부텐텐 / 사업자명: 주식회사 진솔컴퍼니
- REST API 키: `831e411169187b24e024157789de8ac1`
- 상태: ✅ 비즈 앱 전환 완료 → account_email 권한 풀림 → SDK 정상 호출 가능
- 동의 항목: 닉네임/프로필 사진 필수, 이메일 선택 동의 (선택)

### Vercel
- 프로젝트: `jminbaes-projects/pibutenten-webapp`
- Plan: Hobby (무료) — **2026-05-06 기준 일일 배포 한도(100회) 초과로 24시간 배포 잠김**
- Pro 업그레이드 검토 중

---

## 카테고리 5색 팔레트 + 슬러그

| 슬러그 | 라벨 | 색상 |
|---|---|---|
| concerns | 피부고민 | #7E57C2 (딥 라벤더) |
| lifting | 리프팅 | #29B6F6 (파스텔 하늘) |
| injectables | 스킨부스터 | #F48FB1 (연핑크) |
| homecare | 홈케어 | #BF6E5C (테라코타) |
| knowledge | 피부상식 | #9E9D24 (올리브) |

---

## 등록 원장 (9명)

| 이름 | 슬러그 | 지점 |
|---|---|---|
| 정한미 | jeonghanmi | 강남 |
| 배정민 | baejungmin | 강남 |
| 권수현 | kwonsuhyun | 수원 |
| 김수형 | kimsoohyung | 수원 |
| 고혜림 | gohyerim | 수원 |
| 김종식 | kimjongsik | 판교 |
| 이도영 | leedoyoung | 건대 (대표) |
| 강현진 | kanghyunjin | 건대 |
| 박효진 | parkhyojin | 대구 (대표) |

---

## 데이터 모델 핵심 (qas 테이블)

| 컬럼 | 의미 |
|---|---|
| id | PK |
| type | `qa` / `post` / `article` |
| status | `draft` / `pending_review` / `published` / `archived` |
| author_id | 작성자 (auth.users) |
| doctor_id | 글쓴이 원장 (nullable — admin 명의 등) |
| question | 제목 |
| answer | 본문 (post는 전체, article은 sections 합본) |
| keywords | string[] |
| article_sections | jsonb (article 전용) |
| article_slug | text (article 전용 URL slug) |
| article_cover_image | text |
| is_pick | boolean (원장 추천 5개 한도) |
| like_count, view_count, share_count, comment_count | 카운트 |
| published | boolean (status='published'와 동기) |
| created_at | |

### 부속 테이블
- **comments**: parent_id로 1단계 답글 지원
- **qa_likes** (user_id, qa_id) — 로그인 사용자별 좋아요 (트리거로 like_count 자동 동기화)

### 주요 RPC
- `increment_qa_view(p_qa_id)` — 조회수 +1
- `increment_qa_like(p_qa_id)` / `decrement_qa_like(p_qa_id)` — 익명 좋아요 (anon 호출 가능)
- `toggle_qa_like(p_qa_id)` — 로그인 좋아요 (qa_likes 정확 토글)
- `increment_qa_share(p_qa_id)` — 공유 카운트 +1 (중복 허용)
- `toggle_qa_pick(p_qa_id, p_pick)` — Pick on/off

---

## 페이지 구조

### 공개 페이지
- `/` — 검색(피드 카테고리 칩 + 검색창)
- `/feed` — 카드 피드만
- `/qa/[id]` — 단일 Q&A
- `/article/[slug]` — 단일 칼럼
- `/doctors` — 원장 목록 + 단일 페이지(`?slug=`)
- `/popular` — 인기글
- `/login`, `/signup` — 인증

### 사용자 영역
- `/me` — 본인 대시보드
  - 일반 사용자: 새 글쓰기 / 피드 보기 + 활동 3섹션 (내 글 / 좋아요한 글 / 댓글 단 글)
  - 원장: + 통계 + 빠른 액션
- `/me/profile` — 프로필 (TODO)
- `/me/qnas` — 내 글 목록
- `/me/qnas/[id]/edit` — 원장 글 수정
- `/write` — 글쓰기 (포스팅/칼럼/Q&A)

### 관리자
- `/admin` — 관리자 대시보드
- `/admin/draft` — URL→AI 자동 초안
- `/admin/qas` — 전체 카드 목록 (status·type·doctor·pick 필터)
- `/admin/qas/[id]/edit` — 글 편집

---

## 현재 완료된 주요 기능

### 인증·OAuth
- ✅ Email/Password 로그인
- ✅ Google OAuth
- ✅ Kakao OAuth (비즈 앱 전환 완료)
- ✅ 약관 미동의 → /signup 강제 온보딩
- ✅ 모든 role 로그인 후 `/feed` redirect (관리/내 글은 헤더 본인 아이콘)

### 콘텐츠
- ✅ AI Q&A 초안 생성 (YouTube URL → 자막 → Claude Opus 4-7)
- ✅ 글쓰기 (포스팅/칼럼/Q&A) — 글쓴이 선택, 4 액션(취소/저장/검수/발행), 타입 전환 시 작성중 confirm
- ✅ 칼럼 섹션 분해 → 피드 가상 카드 (소단락)
- ✅ 키워드 칩 UI (생성 + 수정)
- ✅ Pick 토글 (목록에서 별 클릭)
- ✅ Pick만 보기 필터
- ✅ Type 필터 (포스팅/Q&A/칼럼)

### 카드
- ✅ 좋아요 — 익명 (localStorage dedup) / 로그인 (qa_likes 정확)
- ✅ 조회수
- ✅ 댓글 — 미니멀 (헤더 X, 닉네임/배지 X, body+시간만, 자동 확장 textarea)
  - 댓글 0개 + 닫힘 → 미렌더
  - 댓글창 클릭 → 입력폼 노출 (본문 펼침과 별도 state)
- ✅ 공유 카운트 (중복 허용)
- ✅ 키워드 칩 클릭 검색
- ✅ 본문 클릭 펼치기/접기

### 검색
- ✅ 퍼지 검색 + 동의어 + 하이라이트
- ✅ 카테고리 자동 강조 (입력 단계에서 매칭 단어 카테고리로 전환)
- ✅ 모바일 키보드 ON 시 검색창 슬라이드업 (이전 정적사이트 패턴 그대로)
- ✅ 첫 4카드 원장 다양성 + 3-in-row 방지
- ✅ ±2달 노이즈로 자연스러운 셔플

### OG 이미지
- ✅ 원장별 미리 제작된 1200x630 PNG 사용 (`public/og/{slug}.png`)
- ✅ satori 합성 안 거침 → 한글 폰트 이슈 없음
- ✅ 카카오톡/페이스북 공유 시 정상 렌더

### 관리자
- ✅ 대시보드 4개 한 줄 (모바일도 2x2)
- ✅ 상태 카운트(초안/대기/발행/보관) 위쪽 4열 한 줄
- ✅ 전체 카드 목록 (Pick/Status/Type/Doctor 필터)
- ✅ 전체 칼럼 목록 (`?type=article` 단축)
- ✅ 댓글 컬럼 + 공유 컬럼
- ✅ 상태 라벨 모두 2자: 초안 / 대기 / 발행 / 보관

### UI 일관성
- ✅ 헤더(`max-w-[1080px] px-4 sm:px-6`)와 main 패딩 동일
- ✅ scrollbar-gutter: stable — 페이지 이동 시 좌우 흔들림 방지
- ✅ cursor-pointer + hover 효과 (카드 액션 / 칩 / 카테고리 탭)
- ✅ 원장 row 좌우 균형 + hover bg 60% opacity
- ✅ 모바일 원장 hero viewport 끝까지 (가장자리 갭 없음)
- ✅ "배정민님" 띄어쓰기 통일

---

## 미배포된 변경 (Vercel 한도 풀린 후 한 번에 반영)

git에 commit·push는 됐으나 일일 배포 한도 초과로 production에 미반영:

1. 댓글 미니멀 리디자인 + showInput 분리
2. 익명 좋아요 (anon RPC 사용)
3. 로그인 후 모든 role `/feed` redirect
4. 관리자 대시보드 layout 재정렬 + 모바일 4열
5. "배정민 님" → "배정민님" 띄어쓰기
6. 모바일 원장 hero 풀너비
7. 영상 정보 박스 제거 (다른 input과 동일 층위)
8. Kakao OAuth scope 우회 코드 → SDK 호출로 복귀

**한도 reset**: 약 24시간 후. 또는 Pro 업그레이드 즉시.

---

## 다음 우선순위 (TODO)

### 즉시
- [ ] **Vercel Pro 업그레이드 결정** — 배포 한도 + Function timeout 60s + Password Protection (베타 비공개) + Web Analytics
- [ ] 모바일 키보드 ON 시 검색창 동작 실기기 최종 테스트
- [ ] 카카오 로그인 실기기 최종 테스트 (account_email 풀린 후)

### 베타 전 (5월)
- [ ] `/me/profile` 실제 폼 (이메일/비번/닉네임 변경)
- [ ] SEO: sitemap.xml, robots.txt, 단일 Q&A JSON-LD 구조화
- [ ] 알림 시스템 (검수 반려 알림 등)
- [ ] Naver OAuth (Supabase 미지원이라 custom OAuth 구현 필요)

### 베타 운영 중
- [ ] Vercel Password Protection으로 비공개 운영 (5개 지점·가족만)
- [ ] Analytics 연결 → 인기 카테고리/원장 분석
- [ ] 피드백 반영

### 정식 런칭 (6월)
- [ ] pibutenten.com 도메인 Vercel 연결
- [ ] Password Protection 해제
- [ ] OG 이미지 prod URL 업데이트

---

## 디자인 결정사항 (확정)

### 글쓰기 폼
- 라벨: **포스팅 / 칼럼 / Q&A** ("일반 글" 안 씀)
- 키워드 갯수: 포스팅 4 / 칼럼 10 / Q&A 8 (max), 칼럼만 min 3
- 액션 4버튼: 취소 / 저장(draft) / 검수 요청(admin이 원장 명의 시만 활성) / 발행
- 글쓴이 선택은 모든 type에 고정 노출
- 원장 리스트에 지점 표기 안 함
- 대표 이미지/안내박스/예시 placeholder 제거

### 댓글
- 닉네임/배지/아바타 표시 안 함 — body + 시간만 (인스타식 미니멀)
- 댓글 미리보기 3개, 초과 시 "모두 보기"
- 입력폼은 댓글창 열렸을 때만 노출
- "첫 댓글을 남겨보세요" / "로그인 후 댓글" 안내 모두 제거 (필요 시만 작은 링크)
- textarea resize 비활성 + scrollHeight 자동 확장

### 좋아요
- 익명 OK — localStorage 브라우저 단위 dedup
- 로그인 — qa_likes로 다기기 동기 + /me 대시보드 "좋아요한 글" 섹션 노출

### 공유
- 클릭 카운트 (중복 허용 — 사용자가 여러 곳에 공유 가능)

### Pick
- 5개 한도, 별 클릭 토글 (목록에서 직접)
- Pick만 보기 필터

### 상태 라벨 (2자 통일)
- 초안 / 대기 / 발행 / 보관

### 마케팅 동의 카피
> ☐ 피부 미용 트렌드, 피부텐텐이 가장 먼저 전해드릴게요 ✨
> (이메일 수신, 광고성 정보 포함, 언제든지 해지 가능)

---

## Q&A 작성 규칙 (반드시 따를 것)

- **분량**: 7~8문장 / 350~450자
- **두괄식**: 첫 문장에 결론·핵심
- **단독 이해**: 다른 Q&A 없이도 시술 정의·핵심 정보 매번 포함
- **금지**: 마크다운 강조(`**`), 불필요한 부연·반복
- **전문 용어**: 괄호로 짧게 풀어주기
- **답변 톤**: 친근하지만 전문적 ("효과가 있을 수 있어요/추천드려요")

---

## 사용자 선호 (개발 협업)

- 한국어 + 존댓말
- 간결·직설적
- 변경 후 자동 commit & push
- 시간 추정 표현 X
- 캐시 버스터 매 변경마다 증가
- "원장님" 호칭 통일

---

## Open Questions / 결정 보류

1. Vercel Pro 업그레이드 여부 (월 $20)
2. 비즈 앱 검수 통과 여부 (이메일 동의 자동 활성화 여부)
3. Naver OAuth 우선순위 (Custom OAuth 구현 부담)
4. 댓글 author identification 표시 정도 (지금은 완전 익명. 모더레이션 필요 시 hover 표시 등 검토)
5. 좋아요한 글 비공개 여부 (다른 사용자가 내 좋아요 목록 볼 수 있는지)
