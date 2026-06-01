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
import { showToast } from "@/lib/toast";
import { pickErrorMessage } from "@/lib/api-error";

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
      // P2-4 (2026-05-27): API 계약 title/body 통일.
      title: payload.title,
      body: payload.body,
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
      } else if (payload.category === "qa") {
        // 카테고리상 외부 링크 영역(Q&A 영상)이 노출되는데 URL 비웠으면 명시적 null 로 비움.
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
    }

    try {
      const res = await fetch(`/api/articles/${cardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        // B-3 (2026-05-29 / P1-F): message (한글) 우선, error (kind enum) fallback.
        return { ok: false, error: pickErrorMessage(data, res.status) };
      }
      // P1-② (2026-05-28): silent fail 방지 — 수정 시에도 검수가 발동될 수 있다
      // (회원이 본문/제목 수정 시). 응답의 screening 객체 존재 시 토스트 1회 노출.
      const data = (await res.json().catch(() => null)) as {
        saved?: number;
        cardId?: number;
        screening?: {
          status: string;
          reasons: string[];
          userMessage: string;
        } | null;
      } | null;
      if (data?.screening) {
        showToast(
          "광고성·대가성 후기나 효과를 단정·보장하는 표현은 의료법에 따라 게시가 제한될 수 있어요. 글이 검토 대기로 전환되었습니다.",
          { tone: "danger" },
        );
        await new Promise((r) => setTimeout(r, 1500));
      }
      router.push(returnUrl);
      router.refresh();
      return { ok: true, cardId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network" };
    }
  }

  // 일반 사용자(원장·회원) 본인 글 지우기 — soft-delete via SECURITY DEFINER RPC (0156).
  // 배경: 직접 `cards.update({deleted_at})` 호출 시 일부 카드(특히 type='qa') 에서
  //       RLS WITH CHECK 가 sub-select 패턴을 미묘하게 막아
  //       "new row violates row-level security policy for table 'cards'" 에러 발생.
  //       (정책 expression 자체는 직접 평가 시 TRUE 인데 evaluator 단에서 막힘 —
  //        PostgreSQL RLS sub-select 평가의 미묘한 이슈로 추정.)
  //       0156 의 `soft_delete_card(p_card_id)` RPC 가 권한 체크 + UPDATE 를
  //       SECURITY DEFINER 컨텍스트에서 처리 — RLS 우회 + 권한 명시 검증.
  async function handleOwnerDelete(): Promise<void> {
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.rpc("soft_delete_card", { p_card_id: cardId });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("forbidden")) {
        throw new Error("권한이 없어 삭제할 수 없어요.");
      }
      if (msg.includes("card_not_found")) {
        throw new Error("이미 삭제되었거나 존재하지 않는 카드입니다.");
      }
      throw new Error(msg || "삭제 실패");
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
