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
    .select("handle, alt_handle")
    .eq("id", id)
    .maybeSingle()
    .returns<{ handle: string | null; alt_handle: string | null }>();
  if (!profile) notFound();
  const target = profile.handle ?? profile.alt_handle;
  if (!target) notFound();
  redirect(`/${target}`);
}
