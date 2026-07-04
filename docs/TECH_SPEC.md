# 기술 명세 (TECH SPEC)

도메인별 상세 명세. 환경변수·온보딩·아바타·검색·URL·키워드·OG·알림·AI 초안. 시스템 구조는 `ARCHITECTURE.md`, DB 는 `DATABASE.md`.

---

## 1. 환경변수 (`.env.local`)

```
# Production = Supabase Custom Domain (ADR 0018). 로컬·템플릿은 ref 직결(*.supabase.co)
NEXT_PUBLIC_SUPABASE_URL=https://auth.pibutenten.kr
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_PROJECT_REF=nahznfvouuwxqctwlwfs
ANTHROPIC_API_KEY=sk-ant-api03-...

# Web Push VAPID
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:pibutenten@gmail.com
PUSH_WEBHOOK_SECRET=...

# Naver OAuth
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# YouTube OAuth (admin Q&A 추출용)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

환경변수 추가·변경 시 `.env.local.example` 와 `DEPLOYMENT.md` 양쪽 갱신 (CLAUDE.md §5).

---

## 2. 온보딩 시스템

### 2.1. 강제 게이트
- **신규 가입자**: signup 직후 `pibutenten_must_onboard` 쿠키 set → 온보딩 완료까지 다른 페이지 차단
- **기존 가입자**: birthdate NULL 일 경우 동일 강제 (2026-05-16 부터)
- 약관 미동의 (`terms_agreed_at` NULL) → `/signup` 리다이렉트
- 면제 경로: `/onboarding`, `/signup`, `/login`, `/auth/*`, `/api/*`, 정적 자산
- 캐시 쿠키: `pibutenten_onboarded={user_id}` (12시간, DB 조회 절감)

### 2.2. 폼 구성 (`/onboarding`)
1. **프로필 사진을 올려주세요!** (선택) — OAuth 사진 prefill + 카메라/파일 업로드 (256×256 JPEG)
2. **본인 확인을 위한 기본 정보를 알려주세요.** (필수) — 이메일·생년월일·성별 (1 글상자)
3. **피부 정보** (필수) — 시술후기 작성 폼 구조를 계승한 1 글상자로 묶어 flat label 로 나열:
   - 얼굴형 (택1)
   - 피부 타입 (택1)
   - 피부톤 (Fitzpatrick I~VI, 택1) — 번호 동그라미가 선택 시 해당 피부톤 색으로, 미선택 시 연한 회색 (`#E8EAEE`)
   - 요즘 피부 고민 (멀티 — 모바일 5×2 그리드)
4. **피부에 대해 궁금한 것을 골라주시면, 맞춤형 정보를 보여드릴게요.** (필수, 최대 10개, InterestPicker — 별도 영역)
5. **본인을 한 줄로 소개해 주실래요?** (선택, 200자, 미입력 시 "만나서 반갑습니다." 자동 저장 — 별도 영역)

> 칩(chip)은 컴팩트(`px-2.5 py-1`)·좌측 정렬. flat label 헬퍼는 `SubLabel` (중첩 카드 `Section` 미사용).

### 2.3. InterestPicker 컴포넌트
- 시술 6종 카테고리 탭 (lifting/skinbooster/filler/contour/laser/other — `PROCEDURE_CATEGORIES` 파생, `pickDefaultCategory()` 랜덤 진입)
- 카테고리별 인기 키워드 칩 (발행 카드 keywords 빈도 TOP N)
- 모바일 3줄 collapsed / 7줄 expanded, 데스크탑 3줄 / 펼침 시 360px
- 더보기·접기 토글
- 자유 추가 입력 (maxLength 30, IME composition 가드)
- 측정 기반 cutoff (max-height transition 폐기 — fcae184 떨림 fix)

### 2.4. 검증
- 14세 미만 reject (클라 + DB CHECK constraint, 0121)
- 중복 가입자 식별: contact_email + birthdate + gender 조합 (`find_duplicate_profiles(p_email, p_birthdate, p_gender)` RPC, 0111 + 0177 회복)
- 피부정보 활용 동의 필수 체크박스 (`profiles.skin_info_consent_at`, 0138)

---

## 3. 아바타 시스템

> **2026-05-16 폐기**: 인물 PNG 누끼 아바타 (avatar-01~20) 전체 삭제. `public/avatars/` 40개 파일 + `profiles.avatar_bg_color` 컬럼 모두 정리.

### 현재 정책
- 아바타 = SNS (구글/카카오/네이버) OAuth 프로필 사진 또는 사용자 업로드
- `profiles.avatar_url` 단일 사용
- 디폴트: SNS 사진. 변경 시 onboarding/settings 카메라·파일 업로드 (256×256 JPEG)
- 의사: `doctors.photo_url` (card.doctor join 시 우선)
- 비로그인 또는 avatar_url NULL: 헤더 fallback (이니셜 또는 기본 아이콘)

---

## 4. 검색 / 피드

### 4.1. 메인 피드 (`/`, `/api/cards`)
- 별도 `/search` 페이지/디렉터리 폐기 — 검색은 홈(`/?q=`)에서 수행하며 `AppShell` 헤더에 인-헤더 통합(`src/app/search/` 없음, `/search`·`/search?q=x` → `/`·`/?q=x` 308 — next.config).
- RPC: 홈 첫 페이지 `feed_cards_scored`, 검색·홈 스크롤 `search_cards_scored` (q, doctor_slug, offset, limit, boost_doctor_slug)
- **점수 공식 (마이그 0194)**: `인기 × 시간감쇠 × 의사배수 × jitter + New 부스트`
  - 인기 = `ln(좋아요×1 + 저장×2 + 공유×2 + 댓글×2 + 조회×0.1, 최소 1)/ln10 (+1)`. 공유=`cards.share_count`, 댓글=`comments(status='visible')` 점수 계산 시 즉시 count(컬럼/트리거 없음).
  - 시간감쇠 = `0.5^(글나이/14일)`(반감기 14일) · 의사 글 ×2 · jitter ±17.5%.
  - **New 부스트** = `1.5 × 0.5^(글나이[시간])`(반감기 1h) 가산 → 신규 글 ~1h 최상단 후 인기글에 밀리고 ~6h ≈0. 반응 붙으면 인기 점수↑로 상위 유지. 기준 `created_at`.
  - 두 RPC 동일 가중·부스트 → 첫 페이지·스크롤·검색에서 신규 글 노출 일관. 검색은 키워드 매칭 점수가 위에 얹힘.
- 같은 원장 3연속 방지, 첫 4카드 다양화
- HOT 카드: `get_hot_card_ids(p_limit)` 결과로 마킹 (v2 정책 본문 = 시간 가중 + 최소 점수 5)
- **검색 SSOT 헬퍼** (배치 ⑤ H3, 2026-05-28): `src/lib/search-query.ts::fetchCardList(supabase, { q, doctorSlug, boostDoctorSlug, category, offset, limit })` — 3 호출처 (홈 `src/app/page.tsx`, `/api/cards`, `/doctors/[slug]/page.tsx`) 가 동일 헬퍼 사용 (구 `/search/page.tsx` 폐기로 검색 첫 페이지도 홈으로 통합, 2026-06-28). q 가 카테고리 라벨 ("끄적끄적" 등) 이면 `.eq("category", slug)` 직접 필터, 아니면 RPC. 옛 회귀(첫 페이지 vs 무한스크롤 결과 집합 불일치) 해소.
- **검색 결과 = 피드 글상자만 (2026-06-29)**: 검색(`?q=`)은 피드 글상자(qa/review/doodle)만 반환. 시술 리포트 블렌딩 제거 — 홈 `page.tsx` 의 `searchReport` 는 항상 `null`. 리포트는 `/reports` 탭에서만 노출. **`review_summary`(시술 리포트) 카드는 비검색 홈피드에도 직접 주입하지 않음**.
- **"방금 쓴 글" 1회 노출**: WriteClient publish 성공 → sessionStorage `pbtt:justPublished = {id, ts}` 저장. 홈 `<Feed enableJustPublished>` 가 5분 윈도우 + 'shown' 마킹으로 본인 글을 그리드 첫 칸에 1회 노출(이미 피드에 있으면 맨 앞 이동, 없으면 fetch unshift). 클라이언트 전용·타인 영향 0. (2026-05-31 `JustPublishedPrepend` 별도 컴포넌트 → Feed 흡수. 전역 신규 노출은 New 부스트가 담당.)

### 4.2. 카테고리 (현 4종 — SSOT=`src/lib/post-category.ts`)
| slug | 라벨 | 작성 권한 |
|---|---|---|
| `qa` | Q&A | doctor / admin |
| `doodle` | 끄적끄적 | 모두 |
| `review` | 개별 시술후기 | 모두 (전용 폼, noindex) |
| `review_summary` | 시술 리포트 | 시스템 집계 (index) |

> diary/ask/tip/link 폐지 (0198 6종→2종 qa/doodle 통합, 0201 review/review_summary 추가).

### 4.3. 인기 키워드 (CategoryWithChips)
- 9종 카테고리 (피부고민/리프팅/스킨부스터/필러·볼륨/주름·윤곽/레이저/기타/홈케어/피부상식). 검색·온보딩 탭에는 시술 6종만 표시 (`PROCEDURE_CATEGORIES`)
- 3줄 max (`--chips-h: 100px`)
- 색상: 비활성 `#E8EAEE / #5C6470`, 활성 카테고리 색 (concerns #7E57C2 / lifting #1E88E5 / skinbooster #F48FB1 / filler #FFA726 / contour #009688 / laser #E57373 / other #78909C / homecare #BF6E5C / knowledge #9E9D24)
- **데스크탑 사이드바 인기 태그 (`FeedSidebar`)**: 탭 = "전체"(서버 빈도순 `popularTags` 16개) + 시술 6종(`PROCEDURE_CATEGORIES`, cats 소스 상위 16개). 클릭 = `onTagClick` 위임 → 운영 홈(`/?q=`) 검색 라우팅. 선택 탭은 `sessionStorage`(`pbtt:feedSidebar:tagTab`)로 보존.

### 4.4. 인-헤더 검색 (`AppShell`)
- 검색창은 `AppShell` 헤더에 통합 (별도 `/search` 페이지 없음). 데스크탑은 상시 검색 pill, 모바일은 돋보기 탭 → 인-헤더 입력 모드 오버레이.
- **전역 규칙 (2026-06-28)**: `←` = 검색창 닫기(나가기, `clearSearch`) / `✕` = 검색어만 지움(검색창은 유지, `setDraft("")`). 입력 모드 박스 ↔ 결과 헤더 박스가 **동일 알약(pill) 모티프**(← + 검색어 필드 + ✕) — 픽셀 일치.
- placeholder = 정적 문구 "시술·고민 키워드 검색" (옛 HeroSearch 28개 phrase 랜덤 회전 폐기). 검색 제출 → 운영 홈 `/?q=` 라우팅 (피드는 controlled 면 그 자리서 필터). 인-헤더 제출 경로가 `addRecent` 로 최근검색 기록(구 `/search` 페이지 역할 승계).

### 4.5. 검색 발견패널 (`SearchPanel`)
모바일 오버레이·데스크탑 블록 공용. query 비었을 때 = 발견 화면, 입력 중 = 자동완성. 데이터는 `/api/search/suggest`(모듈 캐시 `prefetchDiscover`).
- **카테고리 탭**: 박스 없는 가로 텍스트 탭(시술 6종 `PROCEDURE_CATEGORIES`, `no-scrollbar` 가로 스크롤). 선택만 브랜드색 2.5px 밑줄 + 진하게, 비선택은 회색 — 색점 없음.
- **키워드 칩**: 활성 카테고리 색 옅은 틴트(`${activeColor}17`) 배경 (흰색 칩 폐기).
- **최근 검색어**: localStorage 흰 알약 (시계 아이콘 제거), 칩 클릭 = 검색, ✕ = 개별 삭제, "전체 삭제".
- **자동완성**: 입력 중 카테고리 칩 키워드 접두 우선 → 부분일치 (초성 X), 매칭 없으면 발견 화면 폴백.
- **자동완성 키보드 네비**(↑↓ 하이라이트 이동 + Enter 선택, 한글 IME 가드)는 공유 훅 `useAutocompleteKeyboard`(검색·시술후기 시술선택·시술노트 병원검색 공용 SSOT). SearchPanel 은 `forwardRef`+`useImperativeHandle` 로 키다운 핸들러를 노출하고 AppShell 검색 입력이 위임.
- **인기검색어 표시 제거**: `/api/search/suggest` 는 `popular` 를 반환하나 패널에서 렌더하지 않음(최근검색 + 카테고리 칩만).

---

## 5. URL 정책 (SEO)

### 5.1. 의사 official 글
```
/doctors/{slug}/{post_year}/{post_slug}
ex) /doctors/bae-jungmin/2026/lifting-thread-ulthera
```
- `post_slug`: keywords 첫 3개 결합, 50자 초과 시 단어 경계 cut, 충돌 시 -2/-3
- 의사 페이지 키워드·카테고리 검색 가능

### 5.2. 회원 글 / 의사 personal
```
/{handle}/{shortcode}
ex) /minji-skin/Ab3xK9Pq
```
- `shortcode`: 8자 base58 (nanoid), `cards.shortcode` UNIQUE

### 5.3. 프로필 / 태그
```
/{handle}                 사용자/원장 프로필 (active identity)
/u/{id}                   구식 URL (compat)
/topics/{tag}             정식 인덱싱 (qa 만, 0235)
```

---

## 6. 키워드 추출 정책 (SSOT)

키워드는 `cards.keywords text[]` 컬럼. SSOT=DB `tag_dictionary`(+빌드 스냅샷, §6.9). 3곳 동일 정책:
- **AI 추출**: `POST /api/admin/extract-keywords` (`extract-keywords/route.ts` SYSTEM_PROMPT)
- **사전 매칭**: `src/lib/auto-tag.ts` (회원 글쓰기 무료 경로) — 스냅샷 `autotag`(추천 태그만, §6.9)
- **저장 후처리**: `src/lib/procedure-dict.ts::normalizeTags()` + `src/lib/category-labels.ts::stripCategoryLabels()`
- **저장 시 DB 흡수**: `cards` BEFORE 트리거가 동의어(alias)·영문을 대표어로 통일(§6.9)

### 6.1. 개수 / 표기
- **6~8개** (본문이 짧으면 6, 풍부하면 8)
- 한국어 명사·명사구만. 5~12자
- 영문 시술명은 한국어 표기 우선 (`써마지` ✓ / `Thermage` ✗)
- **영문 의학 약어는 영문 그대로**: SMAS, PLLA, HA, HIFU, RF, IPL 등

### 6.2. 잡아야 할 대상
- **시술명**: 울쎄라, 써마지, 슈링크, 스컬트라, 힐로웨이브, 쥬브젠, 인모드, 세르프, 덴서티
- **제품·브랜드** (카드당 3~4개): 라로슈포제, 뉴트로지나, 닥터지, 닥터디퍼런트, 센카, 퍼펙트휩
- **성분·약물**: 히알루론산, PLLA, 보톡스, 레티놀, 레티날, 콜라겐, 엘라스틴
- **도구·기법**: 재생테이프, 마취크림, 롤러믹서, 스파출라, 캐뉼라, 가교제
- **부위**: 팔자주름, 마리오네트주름, 목주름, 이마주름, 광대, 교근, SMAS
- **부작용·증상**: 볼꺼짐, 볼패임, 결절, 멍, 붉은기, 색소침착
- **효과·대상**: 탄력, 볼륨, 주름, 모공, 수분, 보습

### 6.3. 영상 단위 일관성
한 영상에서 4개 카드가 추출되면 그 영상의 핵심 시술/제품은 4개 카드 모두에 포함. 예: 영상 주제 = 힐로웨이브 → 4개 카드 모두 `힐로웨이브` 포함.

### 6.4. 키워드 순서 (URL slug 결정)
`post_slug = keywords[0:3]` 영문 변환이 URL. 첫 3개 순서가 중요.
- **첫 번째 = 영상 핵심 시술/제품** (영상 단위 고정)
- **두 번째 = Q 문장의 주제어** (카드 차별화)
- **세 번째 이후 = 본문 등장 순서·중요도**

### 6.5. 합성어 분리 룰
| 패턴 | 처리 | 예 |
|---|---|---|
| 수식어 + 핵심명사 | 핵심만 | 깊은주름→주름 / 가벼운보습→보습 |
| 핵심명사 + 메타접미사 | 핵심만 | 결절예방→결절 / 콜라겐자극→콜라겐 |
| 두 핵심명사 | 분리 둘 다 | 약산성클렌저→[약산성, 클렌저] |
| 인구/연령 + 시술 | 인구만 | 50대시술→50대 |

### 6.6. 분리하지 않는 예외
- **피부 타입**: 지성피부, 건성피부, 민감성피부, 복합성피부
- **단일 부위/증상**: 튼살, 흉터, 모공, 볼패임, 팔자주름
- **얼굴 타입**: 땅콩형얼굴, 사각턱
- **시술 분류**: 단극성고주파, 양극성고주파 (+ 카테고리 `고주파` 둘 다)

### 6.7. 절대 금지
- **추상 메타**: 효과지속, 위치미스, 시술선택, 적응증, 시술비교 (`~기간` 은 허용)
- **광범위 일반명사 단독**: 피부, 고민, 관리, 시술, 효과, 부위
- **카테고리 라벨**: "Q&A", "끄적끄적" 등 → `category` 컬럼이 표시 시점에 자동 append

### 6.8. post_slug SSOT 룰 (`src/data/procedure-mappings/slug-mapping.ts`)
- **생성 (`buildSlug()`)**: 영문 단어 기본 3개, 최대 4개. 부분 중복 제거. 50자 초과 시 마지막 `-` 경계 cut. 충돌 시 `resolveSlugCollision()` 이 `-2`, `-3` 부여.
- **형식 검증 (`isValidPostSlug` / `normalizeToSlug`)**: 소문자 영숫자·하이픈, 앞뒤 영숫자, 2~50자. draft·edit·서버·slug-check API 가 모두 이 공용 함수만 사용 (규칙 엇갈림 방지).

#### slug 편집·잠금 정책 (2026-05-30)
- **편집 권한 = active 명함이 admin (super admin) 일 때만** (계정/사람 아님, ADR 0012). 원장 명함 active 시 slug 항목 자체 미노출.
- **편집 구간 = 검수 발송 전 (`status='draft'`) 까지.** 검수 발송(`pending_review`)·발행(`published`) 글은 slug 잠금(read-only). 판정 신호 = `cards.status` (전용 컬럼 없음).
- **5층 방어**: ① 형식 검사(즉시) → ② 중복 검사(blur, 공용 `/api/admin/slug-check`) → ③ 서버 재검사(저장 시 PUT/publish) → ④ 검수발송 잠금 → ⑤ DB 부분 UNIQUE 인덱스 `cards_doctor_year_slug_uidx`(마이그 0193, 동시저장 23505 최후 방어).
- **자동 -2 구분**: "빈 칸 → buildSlug 자동 제안" 경로만 `-2/-3` 허용. **관리자가 명시적으로 확정한(비어있지 않은) slug 가 중복이면 자동 -2 하지 않고 발송 차단**(클라 preflight + 서버 409) — 관리자 모르게 다른 URL 로 나가는 것 방지.
- **draft 발송 시 데이터 보호**: 제목 기반 dedup 으로 skip 된 카드는 화면에 유지 + 안내 (조용히 사라지지 않음). 일부 저장 실패해도 소실 0.
- **공용 API**: `GET /api/admin/slug-check?doctorId|doctorSlug&year&slug&excludeCardId` → `{available, reason, normalized, suggestion}`. 검사 범위 = DB 인덱스와 동일 (`doctor_id`·`post_slug` not null).
- **편집 진입 주소**: 공개 SEO URL `/doctors/{slug}/{year}/{post_slug}` 와 별개로, 편집은 `/write/{shortcode}`(안정적 내부 핸들) 또는 `/admin/cards/[id]/edit`. shortcode 는 slug 가 바뀌어도 안 깨지는 카드별 고정 핸들. 두 경로 모두 저장은 `PUT /api/articles/[id]` 단일 통로(slug 방어 동일 적용).

### 6.9. 태그 사전 SSOT·정규화·흡수·자동태깅 (L-Phase2, 2026-06-07)
- **SSOT = DB `tag_dictionary`** (과거 `procedure-mappings.json`·`procedure_taxonomy` 청산). 컬럼: ko·category(한글, 9종+미지정=10종: 피부고민/리프팅/스킨부스터/필러·볼륨/주름·윤곽/레이저/기타/홈케어/피부상식/미지정 — 마이그 0311 CHECK 확장)·en(slug)·parent_ko·is_procedure·onboarding·sort_order·`aliases text[]`·`pubmed_keywords text[]`·`is_recommendable`·`reviewed_at`·**`maker text[]`**(제조사 `[한글,영문]`, 0318 — DB 전용·스냅샷/UI 미참조). 참조표 `tag_blacklist(word)`·`tag_normalization(canonical=변형어/오타, variants=결과[정상]; 방향 규약 = canonical 입력→variants 출력, 역방향 금지)`. 현 시술 is_procedure=true 249·전체 2167행.
- **빌드 스냅샷 파이프라인**: prebuild `scripts/gen-tag-dictionary.mjs` → `src/data/tag-dictionary.generated.json`(category·slug·pubmed·pubmedLookup·aliases·blacklist·normalizations·autotag, **서버 전용**) + 클라 경량 투영 `tag-dictionary.client.generated.json`(category·slug·blacklist·normalizations — 같은 실행·같은 객체 투영, R4-3). TS lookup 은 클라 공용(`procedure-dict.client.ts` — categoryFor/normalizeTag(s)/isBlacklisted, 경량 투영)과 서버 전용(`procedure-dict.ts` — re-export + slugFor/pubmed 계, 전체 스냅샷)으로 분리(동기·DB 무접근). DB 변경은 다음 배포 prebuild 에서 반영.
- **정규화(`normalizeTag`)**: 블랙리스트(§6.7)면 제거, `tag_normalization` 변형어면 결과 배열로 치환(§6.5 합성어 분리도 여기). 둘 다 DB 테이블 기반.
- **저장 시 DB 흡수 트리거**(통일·SSOT 한 경로 — 일반인·원장·관리자 동일): `cards` BEFORE INSERT/UPDATE OF keywords → `cards_absorb_eng_tags()` ① alias(언어 무관) 매칭 시 대표어로 ② 영문 slugify→en 매칭 폴백. 신규 미매칭은 AFTER `cards_register_tags_trg` 가 미지정 등록. 로그 `tag_absorb_log`.
- **자동태깅 큐레이션(`is_recommendable`)**: auto-tag(회원 무료) 후보를 추천 태그(804, 옛 큐레이션 819를 병합 반영)로 한정 → 일반어 노이즈 차단. 신규 태그 기본 false(향후 거버넌스에서 편입). 관리 화면 토글은 비실용으로 제거(데이터·필터는 유지).
- **관리자 편집**: `/admin/tags` + PATCH `/api/admin/tag-dictionary/[id]` + rename/merge RPC(`rename_tag`·`merge_tag` — cards.keywords 단일 tx 전파·트리거 disable·updated_at 보존). 목록 `get_tag_admin_overview`(사용량·검색량) range 청크(1000 상한 회피).

---

## 7. OG 메타 (소셜 공유)

### 7.1. 기본 (`app/layout.tsx`)
- `og:title` = "피부텐텐 | 피부가 예뻐지는 모든 이야기"
- `og:description` = "피부과 전문의가 직접 답하는 리프팅 · 스킨부스터 · 안티에이징 · 피부시술 커뮤니티"
- `og:image` = `/og.png`

### 7.2. 원장님 페이지 (`/doctors/[slug]`)
- `generateMetadata` 동적 OG
- 이미지: `/og/{slug}.png` (참여 전문의 slug 별 매핑)
- 타이틀: `{name} {title} · {clinic}`
- 검증된 doctor slugs: `baejungmin`, `gohyerim`, `jeonghanmi`, `kanghyunjin`, `kimjongsik`, `kimsoohyung`, `kwonsuhyun`, `leedoyoung`, `parkhyojin`

### 7.3. 단일 글 페이지
- `/doctors/[slug]/[year]/[postSlug]`, `/[handle]/[shortcode]` 모두 `generateMetadata` 동적 OG

---

## 8. 알림 / 푸시 시스템

### 8.1. 종류
- 댓글 알림 (내 글 댓글, 내 댓글 답글)
- 좋아요 알림 (그룹화 0083)
- **저장 알림 (`save`, 0242 — 4-2)**: 누군가 내 글 저장 시 작성자에게 알림. **이름 비노출**(`actor_id`=NULL) — 누적 `save_count` 로 인원수만(message="회원님 글을 N명이 저장했어요"). 좋아요(0083) 24h 묶음 패턴 그대로(recipient+card+kind='save' 24h 내 UPDATE-or-INSERT). self-save skip, `pref_save` 토글(default ON), EXCEPTION 격리. 숫자(N명)는 message→웹푸시 body 로 전달(`get_notifications` RPC 가 message 미반환이라 /notifications 페이지는 라벨만 — 좋아요와 동일 구조).
- **신고 알림 (`report`, 0239 — 4-2 STEP D)**: content_reports 신고 접수 시 관리자(role='admin') fan-out. 신고자=admin 이면 본인 제외. 전용 pref 토글 없음(상시 수신). UI 는 /notifications '운영' 필터에 포함.
- **관심(Q&A) 알림 토대 (`keyword`, 0244 — 4-2 / 3b-1)**: 회원의 관심사·피부고민·피부타입 태그에 맞는 새 Q&A 를 하루 한 번 주제별로 알림 + 그 태그 검색으로 이동(저장 URL `/search?q={태그}` → 검색 폐기로 308 → 홈 `/?q={태그}`, next.config). 본 단계는 **토대만**(색인·토글·종류) — GIN 인덱스 2개(`profiles.interested_procedures`·`skin_concerns`), pref 3컬럼(`pref_keyword_interest`/`pref_keyword_concern`/`pref_keyword_skin_type`, default ON), kind 'keyword'(message 모드·🏷️), UI(설정 "관심 Q&A 알림" 섹션 3토글 + /notifications "관심" 필터 + push fallback 타이틀). **발생(digest+cron)은 3b-2 — 현재 생산자 없음 = keyword 알림 0건**. 게이팅은 `is_notification_enabled` 단일 bool 이 아니라(미수정·ELSE true) 3b-2 digest 가 pref 3컬럼을 dimension 별로 직접 판독.
- ~~ask 전용 답변·지속 알림 (0080)~~ — **물리 제거 완료(0241, 2026-06-06)**: category='ask' 폐지(0198)로 영구 死였던 트리거 `on_card_ask_for_notification`·`on_ask_owner_self_reply`, `new_ask` kind(과거 36행 삭제), `pref_new_ask` 컬럼, `is_notification_enabled` 의 new_ask 분기, UI 잔재(필터·토글·push 타이틀·SSOT) 일체 제거. 현 알림 kind **8종** = comment/reply/like/save/review_request/published/report/keyword(0244).

### 8.2. 트리거 / 생산자
- DB 트리거 (0086 push webhook trigger)
- `notification_preferences` 채널별 on/off
- `push_subscriptions` Web Push VAPID 구독 저장
- `push_webhook_secret` Vault 관리 (0103, 0120 rotation RPC)
- **발송 실패 로깅 (`push_send_failures`, 0240 — 4-2 STEP F)**: `/api/push/send` 의 410/404(만료) 외 발송 실패(500·non-2xx·네트워크)를 영속 로깅. service_role 기록·조회, anon/authenticated 차단. (DB 트리거 net.http_post 예외·secret 누락은 `push_webhook_errors`, 앱 webpush 발송 실패는 `push_send_failures` — 포착 계층 구분.)
- **관심 알림 digest 생산자 (`run_keyword_digest()` + cron, 0245 — 4-2/3b-2)**: 매일 cron `/api/cron/keyword-digest`(21:00 UTC=06:00 KST, `Authorization: Bearer ${CRON_SECRET}`)가 service_role 로 `run_keyword_digest()` 호출. 함수는 커서 `keyword_digest_state.last_run_at`(초기값 **now()** — 폭탄 방지) 이후 발행된 qa 카드를 `unnest(keywords)` 태그별로 회원과 매칭: `interested_procedures`(pref_keyword_interest) / `skin_concerns`(pref_keyword_concern) / `skin_type`(pref_keyword_skin_type), 게이트는 `notification_preferences` LEFT JOIN + `COALESCE(...,true)`. 자기 글 제외(`m.id<>author_id`), (회원,태그)별 distinct 새 글 수 N 집계 → `notifications(kind='keyword', actor_id=NULL, message="'태그'에 새 Q&A N건", url='/search?q='||url_encode_component(태그))` set-based INSERT → 기존 webhook→Web Push 자동. 단일 트랜잭션 + 커서 `FOR UPDATE` → 실패 시 롤백·재시도 = 정확히 1회. 한글 태그는 `url_encode_component()`(UTF8 percent-encode)로 `/search?q=` 정확 이동.

### 8.3. 클라이언트
- `NotificationsBell.tsx`, `NotificationBadge.tsx` — 헤더 표시
- `/notifications` — 목록 페이지
- `/settings/notifications` — 설정
- `PushNotificationToggle.tsx` — 구독 토글
- **목록 RPC message 반환 + 표시 모드(4-2 / 3a, 0243)**: 페이지 목록 RPC `get_notifications` 가 `message` 컬럼 반환(dropdown `get_my_notifications` 는 기존부터 반환). `recipient_id` 스코핑(본인 알림만) 불변. 종류별 표시 모드 SSOT = `notification-kinds.ts::KIND_DISPLAY_MODE` — `actor`(댓글/답글/좋아요: 아바타+이름+라벨) / `message`(저장·관심 키워드: message 본문 그대로, actor_id NULL 로 이름 비노출) / `label`(게시/검수요청/신고: 고정 라벨). 저장 알림이 앱 목록에도 "회원님 글을 N명이 저장했어요" 로 표시됨.

---

## 9. AI 글 초안 시스템 (`/admin/draft`)

### 9.1. 워크플로
1. **Step 1** (`/api/admin/draft/step1`):
   - YouTube URL → transcript (`youtubei.js` + `youtube-transcript`)
   - Claude (prompt `step1_v5.md`) → Q&A 후보 추출
2. **Step 2** (`/api/admin/draft/step2`):
   - 후보 선택 → Claude (prompt `step2_v2.md`) → Q&A 본문
   - PubMed 참고문헌 자동 첨부 (`pubmed.ts`)
3. **검수**: admin 편집 → save / analyze / publish
4. **발행** (`/api/admin/draft/publish`):
   - `cards.status = 'published'`, `doctor_id = 매핑된 doctor`
   - 자동 dedup: 동일 video + (start_seconds + question prefix) 매칭 → skip

### 9.2. YouTube OAuth
- 본인 채널 영상의 caption API 접근용
- `/admin/youtube-oauth/start` → callback → `youtube_oauth_tokens` 테이블 (0097)

### 9.3. PubMed 참고문헌
- `src/lib/ai/pubmed.ts`
- 외국어 HTML entity 디코더 (`Ta&#xef;eb` → `Taïeb`, decimal + hex 둘 다 지원)

---

## 10. 콘텐츠 자동 검수 (`src/lib/content-screening.ts`)

- 의료법 §56② 14금지 + 약사법 §68 + 환자후기 키워드 사전
- **임계점** (배치 ⑤, 2026-05-28): `FLAG_THRESHOLD = 7`. v1 의 5 에서 거짓양성 비율 축소 위해 상향 — 단일 카테고리 통과, 두 신호 결합 시 잡힘.
- 의사·관리자 자동 통과 (active 신분의 role 기준, ADR 0012)
- **적용 범위 (2026-05-28~)**:
  - 카드 작성·수정: `cards.screening_flags` 저장 + `status='pending_review'` (admin 검토 큐)
  - 댓글 작성·수정: `comments.screening_flags` 저장 + `status='hidden'` (0178. comments enum 에 pending_review 없어 hidden 으로 대응)
  - 작성자에게 응답 `screening` 객체로 1회 안내 (silent fail 방지)
- **카테고리 가중치**: patient_testimonial +3 / before_after +3 / comparison_ad +3 / exaggerated_efficacy +3 / price_discount +2 / solicitation +1 / prescription_drug +3 / drug_promotion +2 / **paid_sponsorship +4** (배치 ⑤ 신설) / external_url_with_signal +1.
- **`paid_sponsorship` 카테고리** (배치 ⑤): 약관 ④에서 명시 금지한 "대가·협찬·체험단·서포터즈" 유형. 단독 +4 — 다른 신호 1개 결합 시 임계 7 도달. 키워드는 "받았다는 의미가 분명한 것" 만.
- **admin 가시성·복구** (배치 ⑤): `/admin/cards?status=pending_review` / `?status=hidden` 탭 → EditClient → PUT API. `/admin/comments?status=hidden` 탭 신설 — 자동검수 hidden 댓글 검토 + 행별 "복구 (visible)" 버튼 (`PATCH /api/comments/[id] { status: "visible" }`).
- 자살/자해 키워드 감지 시 안전 메시지 모달 1회 (109/1577-0199/1388) — CardEditor + CommentForm 모두 적용 (`src/lib/safety.ts` SSOT)
- 사전: `src/lib/content-screening-dict.ts`

---

## 10.1 모더레이션 (배치 ④, 2026-05-28)

- 운영 화면: `/admin/reports` (`requireAdminPage` superAdminOnly).
- API: `PATCH /api/admin/reports/[id]` body `{ action: "hide" | "delete" | "dismiss", note? }`.
- **숨김 (영구)**: 카드 `toggle_card_hide('hidden')`, 댓글 `comments.status='hidden'`. 복구 가능. 30일 임시조치·자동 만료 없음.
- **완전삭제** (카드 한정): `soft_delete_card` RPC (ADR 0002 익명화).
- **기각**: `content_reports.status='dismissed'`, 대상 변경 없음.
- 모든 액션 `audit_logs.action = 'moderation.{hide|delete|dismiss}'` 적재 + `content_reports.{status, action_taken, resolved_at, resolved_by, resolution_note}` 갱신.
- **공개 측 숨김 노출**:
  - 카드 단일 URL: admin client (RLS 우회) 로 status mini-fetch → hidden 이면 본문 대신 placeholder + `noindex`.
  - 댓글: 일반 viewer 에게 "(비공개 처리된 댓글입니다)" 한 줄. 본인·admin·doctor 는 회색 본문 + "숨김됨" 라벨로 검토 가능.

---

## 11. 흥미 점수 시스템 (비로그인 회원가입 권유)

`src/lib/engagement-score.ts` 점수표 (ADR 0008, v4 = 15):
| 이벤트 | 점수 |
|---|---|
| 리포트 view (시술 리포트) | +8 |
| 피드 카드 view (Q&A·후기 등) | +2 |
| 카드 펼침 (더보기) | +2 |
| 영상 보러가기 | +3 |
| 검색 | +3 |
| 키워드 칩 클릭 | +1 |
| 태그 클릭 | +2 |
| navigate | +1 |
| 2분 머묾 | +3 |
| 5분 머묾 | +4 |
| 10분 머묾 | +5 |

- v4 (2026-06-30): 콘텐츠 모델이 피드·리포트로 분기됨에 따라 view 점수 분리. **리포트(시술 리포트)는 정보 밀도가 높은 핵심 콘텐츠 → +8** (리포트 2건 = 16 ≥ 15 → 트리거), 일반 피드 카드는 +2. 판별자는 `card.type === "review_summary"` (category 아님 — review_summary 풀 카드는 category 미세팅이라 category 분기 시 항상 false).
- 임계점 ≥15 → `EngagementPromptDialog` 1회 노출. sessionStorage 가드 + localStorage dismiss 일주일.

---

## 12. 표시 패턴 예시 (Identity 일원화 후)

```tsx
// Card.tsx
const credentialHidden = Boolean(card.hide_doctor_credential);
const showAsDoctor = !!doctor && !credentialHidden;
const authorName = doctor?.name ?? card.author?.display_name ?? "익명";
// 클릭: showAsDoctor → /doctors/{slug}, 그 외 → /{author.handle}
```

---

## 13. 피부날씨 측위 / 위치 (참조)

피부날씨("오늘의 피부 날씨")의 측위 사다리(기기 GPS → `/api/iploc` IP 대략위치 → 대치동 폴백)·역지오코딩 단위(GPS=동/읍/면, IP=시/도)·캐시 규칙·Open-Meteo 클라 직접 호출(ADR 0021)·네이티브 측위 권한(ADR 0022) 의 **데이터 도메인 명세 SSOT 는 `ARCHITECTURE.md §12`**(`useWeather`). 중복 방지로 본 문서는 참조만 둔다.

---

**이 문서 변경 시**: 키워드 정책·온보딩 단계 변경은 코드 (`auto-tag.ts`, `OnboardingClient.tsx`) 와 한 commit 으로 갱신.
