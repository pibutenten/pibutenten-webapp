# ADR 0017 — 콘텐츠에 자기 사이트 절대 URL 저장 금지 (내부 링크는 상대경로/ID)

- 상태: 채택 (2026-05-31)
- 맥락: 도메인 이전 (`pbtt.kr` → `pibutenten.kr`) A-1 작업 중 정립.

## 맥락 (Context)

도메인을 옮길 때마다 DB에 박힌 자기 사이트 절대 URL(`https://pbtt.kr/...`)을 일괄 치환해야 한다면,
그것은 매번 재발하는 땜빵이다. 도메인이 또 바뀌면 또 DB를 건드려야 한다.

`SITE_URL`(`src/lib/site.ts`, 환경변수 `NEXT_PUBLIC_SITE_URL` 단일 출처)을 두는 이유와 같은 원칙을
저장 데이터에도 적용한다: **동작에 쓰는 자기 도메인 글자는 코드의 한 곳(SITE_URL)에만 두고,
저장 데이터에는 두지 않는다.**

## 결정 (Decision)

1. **콘텐츠(카드 본문·article_sections·댓글·프로필 bio 등)에는 자기 사이트 절대 URL을 저장하지 않는다.**
   - 내부 링크는 **상대경로**(`/doctors/{slug}/...`, `/{handle}/{shortcode}`) 또는 **ID**로 저장한다.
   - 렌더링·외부 노출(OG·canonical·sitemap·RSS·JSON-LD) 시점에 `SITE_URL`을 prefix 로 붙여
     완전한 절대 URL을 만든다. 따라서 외부에 보이는 주소는 항상 현재 canonical 도메인으로 정상 출력된다.
2. **외부 링크 OG 카드**(`cards.external_url` 및 `external_*`)는 타 사이트 주소이므로 그대로 저장한다.
   단, 자기 사이트를 외부 링크로 첨부한 경우는 예외적 혼입이며 위 1)의 상대경로 규칙으로 처리한다.
3. 도메인이 또 바뀌어도 **DB는 손대지 않는다.** 코드의 `SITE_URL`(env) 한 곳만 바꾼다.

## 1회 정리 결과 (2026-05-31 production 스캔)

`public` 스키마 전체 텍스트/varchar 컬럼을 ILIKE `%pbtt.kr%` / `%pibutenten-webapp.vercel.app%` 로 전수 스캔:

| 대상 | 자기사이트 절대 URL |
|---|---|
| `cards` (1,039건) — body/meta/title/article_sections/cover/external_* | **0건** |
| `comments` (40건) — body | **0건** |
| `profiles` (46건) — bio/avatar_url | **0건** |
| 전 public 텍스트 컬럼 전수 | **0건** |

→ **정리할 레거시 데이터 없음.** 현재 콘텐츠는 이미 본 규칙을 준수하고 있다(단순 치환 불필요).
   본 ADR은 그 사실을 규칙으로 명문화해 재발(도메인 글자가 콘텐츠에 박히는 것)을 차단한다.

## 결과 (Consequences)

- 다음 도메인 변경 시 콘텐츠 DB 마이그레이션 불필요.
- 신규 작성/임포트 경로에서 자기 사이트 절대 URL이 들어오면 상대경로로 정규화해야 한다(향후 입력 검증 지점).
- `avatar_url` 등 Supabase Storage 절대 URL은 자기 "페이지" URL이 아니라 스토리지 자산이므로 본 규칙 대상 아님.
