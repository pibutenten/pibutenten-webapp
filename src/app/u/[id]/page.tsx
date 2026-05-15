import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * v4: /u/{id}는 옛 URL. 같은 사용자의 /{handle}로 redirect.
 * id는 profiles.id (UUID).
 */
export default async function UserIdRedirect({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", id)
    .maybeSingle()
    .returns<{ handle: string | null }>();
  if (!profile?.handle) notFound();
  redirect(`/${profile.handle}`);
}
