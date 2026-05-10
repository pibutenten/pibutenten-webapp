import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v4 multi-identity — 활성 identity 스위치.
 *
 * POST { identityId: 'primary' | <profile_identities.id> }
 *
 * cookie 'pibutenten:identity'에 저장 → layout.tsx getSessionInfo가 읽어서 활성 결정.
 * 본인이 보유한 identity인지 검증 (다른 사람 identity로 스위치 차단).
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

  // 'primary'는 항상 허용 (본인 profiles row)
  if (target !== "primary") {
    // profile_identities 본인 소유인지 검증
    const { data: row } = await supabase
      .from("profile_identities")
      .select("id")
      .eq("id", target)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json(
        { error: "권한 없음 — 본인 identity가 아닙니다." },
        { status: 403 },
      );
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("pibutenten:identity", target, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    sameSite: "lax",
    httpOnly: false, // 클라이언트에서 표시용으로도 읽을 수 있게
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true, identityId: target });
}
