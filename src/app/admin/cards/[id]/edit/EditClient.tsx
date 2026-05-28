"use client";

/**
 * Admin EditClient — `/admin/cards/[id]/edit` Phase 4c 통합 wrapper (2026-05-22).
 *
 * 본 wrapper 책임:
 *   - initialCard prefill 변환 (DB Card → CardEditorInitial)
 *   - adminExtras 묶음 전달 (currentAuthorDisplay, isDoctorAuthored, Pick, LLM 태그추출, soft-delete)
 *   - onSubmit — supabase direct (admin RLS 통과) + author 변경 시 doctor_id 자동 추론
 *   - meta JSON timestamp 갱신
 *
 * UI·필드·검증·헤더 라벨은 CardEditor 가 담당.
 * 회원 글(type=post, doctor_id=null) 도 카테고리·type 분기로 자연 처리
 * — 옛 회귀(Q&A 라벨 잘못, 의사 전용 필드 노출, 글쓴이 빈칸) 모두 해결.
 *
 * 권한:
 *   - canChangeAuthor=true → super admin (author dropdown 활성 — 회원 검색 API 다음 sprint)
 *   - canTogglePick — 0151 RPC 가드. 페이지 도달 = admin 또는 self-doctor → 항상 true
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeAnswerBody } from "@/lib/normalize-body";
import { normalizeTags } from "@/lib/tag-dictionary";
import CardEditor, {
  type AuthorOption,
  type CardEditorInitial,
  type CardEditorPayload,
  type CardStatus,
  type SubmitAction,
  type AdminExtras,
} from "@/components/card-editor/CardEditor";
import { isPostCategorySlug, type PostCategorySlug } from "@/lib/post-category";
import type { ExternalMeta } from "@/components/card-editor/fields/ExternalLinkField";
import type { PubmedRefObj } from "@/lib/schema/api/articles";
import { getDoctorIdForProfile } from "@/lib/doctor-mapping";
import { ROLES } from "@/lib/identity-shared";

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type AuthorBrief = {
  id: string;
  display_name: string | null;
  handle: string | null;
  role: string | null;
};

type Card = {
  id: number;
  title: string;
  body: string;
  meta: string | null;
  keywords: string[];
  status: CardStatus;
  type: "qa" | "post";
  category: string | null;
  is_pick?: boolean;
  doctor_id: string | null;
  author_id: string | null;
  video_id: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
  external_url?: string | null;
  external_title?: string | null;
  external_image?: string | null;
  external_site_name?: string | null;
  pubmed_refs?: PubmedRefObj[] | null;
  author: AuthorBrief | null;
  doctor: Doctor | null;
};

type Props = {
  card: Card;
  /** 2026-05-22: doctor picker UI 폐기. author 변경 시 doctor_id 자동 추론 (server). */
  doctors?: Doctor[];
  doctorPickCount?: number;
  commentCount?: number;
  canChangeAuthor?: boolean;
  /** super admin 글쓴이 dropdown 옵션 (관리자 + 의사 9명 profile.id) */
  authorOptions?: AuthorOption[];
};

function extractStartSeconds(url: string): number {
  if (!url) return 0;
  const m = url.match(/[?&]t=(\d+)s?/);
  return m ? parseInt(m[1], 10) : 0;
}

function formatMMSS(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function EditClient({
  card,
  doctorPickCount = 0,
  commentCount = 0,
  canChangeAuthor = false,
  authorOptions,
}: Props) {
  const router = useRouter();
  // page.tsx 가드 기준: 이 페이지에 도달 = super admin 또는 본인 doctor admin → Pick 항상 가능
  const [canTogglePick] = useState(true);

  // 의사 글 판정: 카드의 doctor_id 가 있거나 author 가 doctor role 이면 의사 글
  const isDoctorAuthored =
    !!card.doctor_id || card.author?.role === ROLES.DOCTOR;

  // initialCard 변환 — DB Card → CardEditorInitial.
  // Critical-4 (마이그레이션 0169): pubmed_refs 가 이미 SSOT (PubmedRefObj) 형태로
  // 정규화되어 옛 normalizePubRef (string ↔ number 변환) 가 불필요.
  const initialPubmedRefs: PubmedRefObj[] = card.pubmed_refs ?? [];

  const initialExternalMeta: ExternalMeta | null = card.external_title
    ? {
        title: card.external_title,
        description: "",
        image: card.external_image ?? "",
        siteName: card.external_site_name ?? "",
      }
    : null;

  const initialCard: CardEditorInitial = {
    cardId: card.id,
    type: card.type,
    category:
      card.category && isPostCategorySlug(card.category)
        ? (card.category as PostCategorySlug)
        : null,
    title: card.title,
    body: card.body,
    keywords: card.keywords ?? [],
    externalUrl: card.external_url ?? "",
    externalMeta: initialExternalMeta,
    pubmedRefs: initialPubmedRefs,
    status: card.status,
    isPick: card.is_pick ?? false,
    doctorId: card.doctor_id,
    authorProfileId: card.author_id,
    startSeconds: extractStartSeconds(card.external_url ?? ""),
    metaJson: card.meta,
  };

  // 현재 글쓴이 표시 — 이름만 (변경 불가일 때도 readonly 박스에 노출)
  const currentAuthorDisplay = card.author
    ? card.author.display_name ?? card.author.handle ?? "이름 없음"
    : "— 알 수 없음 —";

  // soft-delete via SECURITY DEFINER RPC (0156).
  // 배경: 직접 `cards.update({deleted_at})` 는 PostgreSQL RLS WITH CHECK 의 sub-select
  // 평가 미묘 이슈로 type='qa' 카드에서 "new row violates row-level security policy"
  // raw 에러를 form 빨간 박스에 노출시킴 (이도영 원장 카드 #2316 사례).
  // 일반 EditClient / Card.tsx 는 이미 RPC 로 통일됐는데 admin EditClient 만 누락 →
  // doctor admin 본인이 본인 카드 admin/cards/[id]/edit 진입 후 [지우기] 시 회귀 발생.
  async function handleSoftDelete() {
    const supabase = createSupabaseBrowserClient();
    const { error: delErr } = await supabase.rpc("soft_delete_card", {
      p_card_id: card.id,
    });
    if (delErr) {
      const msg = delErr.message || "";
      if (msg.includes("forbidden")) throw new Error("권한이 없어 삭제할 수 없어요.");
      if (msg.includes("card_not_found"))
        throw new Error("이미 삭제되었거나 존재하지 않는 카드입니다.");
      throw new Error(msg || "삭제 실패");
    }
    router.push("/admin/cards");
  }

  // 숨김/공개 토글 — 계정 단위 권한 검증 RPC (0162 신설).
  // 이전: 직접 cards.update({status}) 호출 → cards_owner_update RLS 통과해야 하는데
  // 옛 묶음 단위 RLS (0155) 였음. 0160 active 단위 재작성 후에도 동일 패턴 유지 가능하나,
  // soft-delete 와 일관되게 SECURITY DEFINER RPC 로 통일하여 계정 단위 권한 검증 명시화.
  async function handleToggleHide() {
    const supabase = createSupabaseBrowserClient();
    const next = card.status === "hidden" ? "published" : "hidden";
    const { error: hideErr } = await supabase.rpc("toggle_card_hide", {
      p_card_id: card.id,
      p_next_status: next,
    });
    if (hideErr) {
      const msg = hideErr.message || "";
      if (msg.includes("forbidden")) throw new Error("권한이 없어 처리할 수 없어요.");
      if (msg.includes("card_not_found"))
        throw new Error("카드를 찾을 수 없습니다.");
      throw new Error(msg || "숨김 토글 실패");
    }
    router.refresh();
  }

  async function handleSubmit(
    payload: CardEditorPayload,
    _action: SubmitAction,
  ): Promise<{ ok: true; cardId: number } | { ok: false; error: string }> {
    void _action;
    const supabase = createSupabaseBrowserClient();

    // meta(timestamp) 갱신 — 옛 EditClient 와 동일.
    let metaObj: Record<string, unknown> = {};
    try {
      if (card.meta) metaObj = JSON.parse(card.meta) as Record<string, unknown>;
    } catch {
      metaObj = {};
    }
    const prevTs = metaObj.timestamp as { end?: string } | undefined;
    const startSec = payload.startSeconds ?? 0;
    metaObj.timestamp = {
      start: formatMMSS(startSec),
      start_seconds: startSec,
      ...(prevTs?.end ? { end: prevTs.end } : {}),
    };

    // 배치 ⑤ 6번 (2026-05-28): cards 직접 update → PUT /api/articles/[id] 통일.
    //   PUT 가드: active 단위 권한 (ADR 0012) + zod + rate-limit + audit_logs 자동.
    //   meta·author_id 두 필드는 PUT API 가 admin/doctor 전용으로 새로 수용.
    const apiPayload: Record<string, unknown> = {
      title: payload.title,
      body: normalizeAnswerBody(payload.body),
      keywords: normalizeTags(payload.keywords),
      status: payload.status ?? card.status,
      is_pick: payload.isPick ?? false,
      external_url: payload.externalUrl,
      external_title: payload.externalTitle ?? null,
      external_image: payload.externalMeta?.image ?? null,
      external_site_name: payload.externalMeta?.siteName ?? null,
      meta: JSON.stringify(metaObj),
      pubmed_refs: payload.pubmedRefs.length > 0 ? payload.pubmedRefs : null,
      category: payload.category,
    };

    // author 변경 (super admin 만) + 변경 시 doctor_id 자동 추론.
    if (
      canChangeAuthor &&
      payload.authorProfileId !== undefined &&
      payload.authorProfileId !== card.author_id
    ) {
      apiPayload.author_id = payload.authorProfileId;
      if (payload.authorProfileId) {
        apiPayload.doctor_id = await getDoctorIdForProfile(
          supabase,
          payload.authorProfileId,
        );
      } else {
        apiPayload.doctor_id = null;
      }
    }

    try {
      const res = await fetch(`/api/articles/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        const msg = j?.message ?? j?.error ?? `HTTP ${res.status}`;
        if (msg.includes("PICK_LIMIT_EXCEEDED")) {
          return {
            ok: false,
            error:
              "Pick은 한 원장당 최대 5개까지 가능합니다. 다른 글의 Pick을 먼저 해제해주세요.",
          };
        }
        return { ok: false, error: `저장 실패: ${msg}` };
      }
    } catch (e) {
      return {
        ok: false,
        error: `저장 실패: ${e instanceof Error ? e.message : "network"}`,
      };
    }

    const finalStatus = payload.status ?? card.status;
    router.push(`/admin/cards?status=${finalStatus}`);
    router.refresh();
    return { ok: true, cardId: card.id };
  }

  const adminExtras: AdminExtras = {
    currentAuthorDisplay,
    canChangeAuthor,
    authorOptions,
    isDoctorAuthored,
    doctorPickCount,
    commentCount,
    enableLlmTagExtract: true,
    enableSoftDelete: true,
    onSoftDelete: handleSoftDelete,
    canTogglePick,
    // 숨김 토글 — published/hidden 상태일 때만 의미. admin 전용 (page.tsx 가드).
    canHide: card.status === "published" || card.status === "hidden",
    onToggleHide: handleToggleHide,
  };

  return (
    <CardEditor
      mode="edit"
      viewerRole="admin"
      initialCard={initialCard}
      adminExtras={adminExtras}
      returnUrl="/admin/cards"
      onSubmit={handleSubmit}
    />
  );
}
