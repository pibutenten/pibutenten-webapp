"use client";

/**
 * EditClient — 본인/원장/admin 가 카드 수정 (`/write/{shortcode}`).
 *
 * Phase 4 통합 (260518): 본 컴포넌트는 얇은 wrapper. 모든 UI·검증·저장 로직은
 * <CardEditor> 가 책임. wrapper 는 props 변환 + PUT /api/articles/[id] 호출만 담당.
 *
 * 권한 검증은 진입 시 page.tsx + RLS + PUT API 의 3중 가드.
 */
import { useRouter } from "next/navigation";
import { isPostCategorySlug, type PostCategorySlug } from "@/lib/post-category";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import CardEditor, {
  type CardEditorInitial,
  type CardEditorPayload,
} from "@/components/card-editor/CardEditor";
import {
  type ExternalMeta,
} from "@/components/card-editor/fields/ExternalLinkField";
import { type PubmedRefObj } from "@/components/card-editor/fields/PubmedRefsField";

type Props = {
  cardId: number;
  type: "qa" | "post";
  category: string | null;
  viewerRole: "admin" | "doctor" | "user";
  initialTitle: string;
  initialBody: string;
  initialKeywords: string[];
  initialExternalUrl: string;
  initialExternalMeta: ExternalMeta | null;
  initialPubmedRefs: NonNullable<PubmedRefObj>[];
  returnUrl: string;
};

export default function EditClient({
  cardId,
  type,
  category,
  viewerRole,
  initialTitle,
  initialBody,
  initialKeywords,
  initialExternalUrl,
  initialExternalMeta,
  initialPubmedRefs,
  returnUrl,
}: Props) {
  const router = useRouter();

  const initialCard: CardEditorInitial = {
    cardId,
    type,
    category:
      category && isPostCategorySlug(category)
        ? (category as PostCategorySlug)
        : null,
    title: initialTitle,
    body: initialBody,
    keywords: initialKeywords,
    externalUrl: initialExternalUrl,
    externalMeta: initialExternalMeta,
    pubmedRefs: initialPubmedRefs,
  };

  async function handleSubmit(
    payload: CardEditorPayload,
  ): Promise<{ ok: true; cardId: number } | { ok: false; error: string }> {
    const apiPayload: Record<string, unknown> = {
      question: payload.title,
      answer: payload.body,
      keywords: payload.keywords,
    };
    if (payload.category && payload.category !== initialCard.category) {
      apiPayload.category = payload.category;
    }
    if (payload.externalUrl !== undefined) {
      // null 이면 외부 링크 비움. 값 있으면 meta 도 함께.
      if (payload.externalUrl) {
        apiPayload.external_url = payload.externalUrl;
        apiPayload.external_title = payload.externalMeta?.title ?? null;
        apiPayload.external_description =
          payload.externalMeta?.description ?? null;
        apiPayload.external_image = payload.externalMeta?.image ?? null;
        apiPayload.external_site_name = payload.externalMeta?.siteName ?? null;
      } else if (payload.category === "qa" || payload.category === "link") {
        // 카테고리상 외부 링크 영역 노출되는데 URL 비웠으면 명시적 null 로 비움.
        apiPayload.external_url = null;
        apiPayload.external_title = null;
        apiPayload.external_description = null;
        apiPayload.external_image = null;
        apiPayload.external_site_name = null;
      }
    }
    if (payload.category === "qa") {
      apiPayload.pubmed_refs =
        payload.pubmedRefs.length > 0 ? payload.pubmedRefs : null;
      apiPayload.pubmed_ref = payload.pubmedRefs[0] ?? null;
    }

    try {
      const res = await fetch(`/api/articles/${cardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
      }
      router.push(returnUrl);
      router.refresh();
      return { ok: true, cardId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network" };
    }
  }

  // 일반 사용자(원장·회원) 본인 글 지우기 — soft-delete (cards.deleted_at = now()).
  // RLS: cards_owner_update (0155) 가 same-group 작성자 UPDATE 허용.
  // .select() 로 affected rows 검증 — RLS silent block 감지 (0 rows, no error).
  async function handleOwnerDelete(): Promise<void> {
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb
      .from("cards")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", cardId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error("권한이 없어 삭제할 수 없어요 (RLS).");
    }
    router.push(returnUrl);
    router.refresh();
  }

  return (
    <CardEditor
      mode="edit"
      viewerRole={viewerRole}
      initialCard={initialCard}
      onSubmit={handleSubmit}
      onOwnerDelete={handleOwnerDelete}
      returnUrl={returnUrl}
    />
  );
}
