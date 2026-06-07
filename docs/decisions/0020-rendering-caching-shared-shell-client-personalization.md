# 0020. 렌더링·캐싱 — 공유 셸 + 클라이언트 개인화

- **Status**: Accepted
- **Date**: 2026-06-07
- **Related**: ADR 0005(쿠키 UI-only·서버 재검증), ADR 0015(온보딩 게이트 active 명함), CHANGELOG 2026-06-07 V-Phase, `src/app/layout.tsx`·`src/lib/session-context.tsx`·`src/lib/supabase/anon.ts`
- **커밋**: V1 `3b199c3` · V3 `b3cd905→6170738` · 토픽 동적복원 `632700b` · 카운트 라이브 `fdaa6fa` · 홈 CLS `7fd86ce` (전부 프로덕션 라이브)

---

## Context

V-Phase 이전: **루트 `layout.tsx` 가 `force-dynamic` + `await getSessionInfo()`**(쿠키 읽기)였다. 이 둘 때문에 모든 페이지가 동적 렌더 → 엣지 캐시 전부 MISS(`x-vercel-cache: MISS`). 공개 콘텐츠(의사 Q&A 상세·토픽)는 모두에게 동일한데도 매 요청 DB 왕복 + 동적 렌더 → 느림(LCP).

목표: 공개 콘텐츠를 캐시해 속도를 올리되, **개인화(로그인 여부·내 좋아요/저장·아바타)는 정확히 유지**하고 **캐시 HTML 에 개인정보가 섞이지 않게** 한다(캐시 오염 0).

## Decision

### 원칙 — "캐시 가능한 공유 셸 + 클라이언트 개인화" (SNS 표준)
서버는 **모두에게 동일한 공유 셸**만 렌더(캐시 가능). 개인별 데이터는 전부 **클라이언트**가 마운트 후 가져온다. → 같은 HTML 을 전원에게 캐시 서빙해도 개인정보 누출 불가.

### 1. 세션 = 클라 하이브리드 (V1)
- `layout.tsx` 에서 서버 세션 읽기(`getSessionInfo`) 제거.
- `SessionProvider`(클라)가 마운트 즉시 **비-httpOnly mirror 쿠키**로 로그인 여부+active 명함 id 를 **동기** 확정 → 비로그인은 `me=null` 즉시 → 좋아요/저장/댓글 클릭 시 로그인모달 즉발(2026-05-20 silent-fail 회귀 보존).
- 리치 표시(아바타·명함목록·역할)는 `/api/session`(신규)으로 **비동기** 보강.
- 쿠키는 UI 힌트일 뿐, 서버는 모든 변경을 RLS+`auth.getUser()` 로 재검증(ADR 0005 불변).

### 2. 상세 = ISR 캐시 (V3)
- `doctors/[slug]/[year]/[postSlug]`: `generateStaticParams()=[]`(빌드 프리렌더 0, 런타임 on-demand) + `revalidate=86400` + 공유 읽기를 `unstable_cache(tags:["qa-content"])`.
- 쿠키리스 `createSupabaseAnonClient()`(`cookies()` 미사용) 로 읽어 라우트가 동적 강제되지 않게 + RLS 상 published 행만 → 캐시 결과 개인정보 0.
- 개인 상태(좋아요/저장 여부·수)는 `Card`("use client")가 클라에서 가져옴.
- 콘텐츠 변경(발행/수정/숨김/삭제) 라우트에서 `revalidateTag("qa-content","max")` → **수정 즉시 반영**(24h 대기 0). `revalidate=86400` 은 카운트 등 fallback.

### 3. 토픽 = 동적 유지 (캐싱 보류)
- 토픽 URL 은 **한글**(`/topics/콜라겐`). ISR 로 캐시하면 Next 16 이 페이지 경로를 implicit `x-next-cache-tags` HTTP 헤더에 넣는데, **ASCII 전용 헤더가 한글에 깨져 500**(`ERR_INVALID_CHAR`).
- 상세는 ASCII slug 라 무관(정상 캐시). 토픽만 **force-dynamic 유지**.
- **기각안**: 토픽 URL 을 ASCII slug 로 전환 → canonical·SEO 인덱스 비용이 캐싱 이득보다 큼. 한글 URL 은 그대로 둔다.

### 4. 카운트 = 캐시 유지 + 클라 라이브 (택3)
- 캐시된 상세는 좋아요/저장/공유 **수**가 렌더타임에 박제(최대 24h 묵음).
- **기각안**: revalidate 간격 단축 → 캐시 이득 깎임. 카운트를 캐시에서 빼기 → 불가(공유 셸).
- **채택**: 콘텐츠 캐시는 그대로, `useCardEngagement` 가 캐시 상세에서만 마운트 시 `cards` 라이브 카운트 1회 재조회 → 화면 교체(`interactedRef` 레이스 가드). 댓글 수는 기존 `CommentsBlock.onCountChange` 로 라이브.

### 5. 홈 피드 masonry SSR 컬럼 = UA 기반
- react-masonry-css 는 SSR 에 window 없어 `breakpointCols.default`(2)로 2컬럼 렌더 → 모바일 클라가 1컬럼으로 재배치 reflow(CLS 0.17).
- 홈은 동적 라우트라 요청 UA 로 `isMobileUA` 판별 → `default=(isMobileUA?1:2)`. `899:1`·클라 리사이즈 리스너는 그대로 → 폭 기반 반응형 불변.

## Consequences

- **상세**: `x-vercel-cache: HIT`·LCP 0.41s(랩). 콘텐츠 수정 즉시 반영(revalidateTag), 카운트·세션·개인상태 라이브.
- **홈·토픽**: 동적 유지. 홈 CLS 0.171→0.041.
- **캐시 오염 0**: 캐시 상세 HTML 은 쿠키 유/무 바이트 동일(개인 데이터·세션토큰·로그인 UI 0) — 실증 완료.
- **운영 주의**: 한글 URL + ISR 금지(헤더 깨짐). 프리뷰 env 는 prod 와 동일 스코프 필요(미설정 시 미들웨어 500). 배포 후 카나리 1개 점검.
- **남은 것**: 토픽 데이터 캐시(저우선·페이지는 동적, RPC 결과만 unstable_cache), 공개 후 CrUX 필드 INP 확정, 피드 콜드스타트 INP 최적화(필드 🟡/🔴 일 때만).
