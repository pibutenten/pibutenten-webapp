# API 라우트 작성 정책

## 1. 입력 검증

**신규 라우트는 zod 스키마 검증을 사용한다.**

```ts
import { z } from "zod";

const Body = z.object({
  cardId: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // parsed.cardId 안전하게 사용
}
```

기존 라우트의 수동 `typeof` 검증 패턴은 점진 마이그레이션 (회귀 위험 작은 라우트부터).

스키마 위치: `src/lib/schema/api/{routeName}.ts` (예: `comments.ts`, `articles.ts`).

## 2. 인증/권한

| 라우트 종류 | 헬퍼 |
|---|---|
| 일반 로그인 필요 | `supabase.auth.getUser()` |
| Active identity 컨텍스트 필요 | `getIdentityContext(supabase)` from `@/lib/identity` |
| admin 묶음 검사 (super admin / doctor admin) | `requireAdmin()`, `requireAdminOrDoctor()` from `@/lib/admin-guard` |

신규 admin 라우트는 직접 `idCtx.isSuperAdmin` 검사하지 말고 위 헬퍼 사용.

## 3. service_role 클라이언트

**`createClient(URL, SERVICE_ROLE_KEY, ...)` 직접 호출 금지.**
항상 `createSupabaseAdminClient()` from `@/lib/supabase/admin` 사용.

## 4. 에러 응답 포맷

```ts
return NextResponse.json({ error: "사용자 표시 메시지" }, { status: 400 });
```

status code 일관성:
- 400: 입력 검증 실패
- 401: 미인증
- 403: 권한 부족
- 404: 자원 없음
- 422: 외부 의존 처리 실패 (자막 fetch 등)
- 500: 내부 오류
- 502: 외부 API 응답 실패 (PubMed, Anthropic 등)

## 5. CSRF / dynamic

```ts
export const dynamic = "force-dynamic";
```

mutation 라우트는 미들웨어가 Origin 검증 (allow-list: pbtt.kr / *.vercel.app / localhost).
webhook 등 예외는 `src/middleware.ts` 의 `CSRF_EXEMPT_PATHS` 에 명시.

## 6. CORS

기본 same-origin. 외부 도메인 호출 허용하지 말 것 (특히 mutation).

## 7. 응답 캐시 헤더

```ts
return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
```

GET 라우트는 명시 권장 (실시간 데이터).
