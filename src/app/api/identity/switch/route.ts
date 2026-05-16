import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 9: ID 스위치 — 모든 ID = profiles row.
 *
 * POST { identityId: 'primary' | <profiles.id> }
 *
 * cookie 'pibutenten:identity'에 target profile.id 저장.
 * 본인 묶음(auth_user_id) 안의 profile인지 검증.
 */
export async function POST(req: Request) {
  let body: { identityId?: string } = {};
  try {
    body = (await req.json()) as { identityId?: string };
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const target = (body.identityId ?? "").trim();
  if (!target) {
    return NextResponse.json({ error: "identityId 필요" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  // 'primary'는 항상 허용 (legacy 호환)
  if (target !== "primary") {
    // 본인 묶음 (auth_user_id) 안의 profile인지 검증
    const { data: row } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", target)
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .maybeSingle();
    if (!row) {
      return NextResponse.json(
        { error: "권한 없음 — 본인 ID가 아닙니다." },
        { status: 403 },
      );
    }
  }

  // 보안 패턴 (2026-05-16): 쿠키 2개 분리.
  //   1) pibutenten:identity         — httpOnly. 서버가 신뢰하는 단일 진실. (XSS 탈취 불가)
  //   2) pibutenten:identity-mirror  — httpOnly X. UI 표시 전용. 탈취돼도 위장 불가 (서버가 무시).
  // 두 값을 항상 동일하게 set. server side getIdentityContext 는 (1)만 읽는다.
  const cookieStore = await cookies();
  const baseOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  cookieStore.set("pibutenten:identity", target, {
    ...baseOpts,
    httpOnly: true, // 보안: JS 접근 차단 (XSS 방어)
  });
  cookieStore.set("pibutenten:identity-mirror", target, {
    ...baseOpts,
    httpOnly: false, // 클라이언트 표시용 — 서버는 신뢰 X
  });

  return NextResponse.json({ ok: true, identityId: target });
}
