"use client";

/**
 * WriteClient — 새 글 작성 (`/write`) — Phase 4b 통합 wrapper (2026-05-22).
 *
 * 본 wrapper 책임:
 *   - WRITE_PHRASES 헤더 카피 (5.5초 회전)
 *   - 글쓴이 결정:
 *     · doctor 본인 → myDoctor 자동 (UI 노출 X)
 *     · admin → 글쓴이 dropdown (의사 9명 + 본인 관리자 명의)
 *     · 회원 → 항상 본인 명의
 *   - POST /api/articles 호출 + redirect
 *
 * UI·검증·필드는 모두 CardEditor 담당.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CardEditor, {
  type CardEditorPayload,
  type DoctorOption,
  type SubmitAction,
} from "@/components/card-editor/CardEditor";
import type { PostCategorySlug } from "@/lib/post-category";
import { ROLES } from "@/lib/identity-shared";

const WRITE_PHRASES = [
  "유독 잘 받은 화장의 비결은..",
  "오늘 나의 스킨케어 꿀팁은?",
  "공유하고 싶은 피부 비법은?",
  "공유하고 싶은 시술 후기는?",
  "나만의 인생 화장품 하나는?",
  "매일 챙기는 데일리 루틴은?",
  "이런 시술 어때요?",
  "제가 제일 만족하는 화장품은요..",
  "오늘의 피부 고민은?",
  "오늘 같은 날 꼭 챙기는 피부루틴은",
  "솔직히 말하면 이 제품은요",
  "오늘 아침 저의 스킨케어 루틴은",
  "관리 받는 날 저의 특별 루틴은",
  "피부 고민 해결, 저만의 방법은",
  "제가 다녀온 피부과는요..",
  "저만의 꿀템을 공유하자면,",
  "오늘의 피부 날씨는",
  "시술 후기, 알려드릴게요!",
  "써봤는데 조용히 내려놓은..",
  "저만 그랬던 건지 모르지만..",
  "요즘 제 피부 컨디션은요",
  "피부에게 미안했던 저의 오늘 하루는",
  "피부고민, 이렇게 해결했어요",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type Props = {
  role: "admin" | "doctor" | "user";
  myDoctor: { slug: string; name: string } | null;
  /** admin 의 글쓴이 dropdown 옵션 (의사 9명). doctor 본인은 자동 myDoctor. */
  doctors: Doctor[];
  displayName: string;
  initialCategory?: PostCategorySlug;
};

export default function WriteClient({
  role,
  myDoctor,
  doctors,
  initialCategory,
}: Props) {
  const router = useRouter();
  const [headerPhrase, setHeaderPhrase] = useState(WRITE_PHRASES[0]);

  // 헤더 카피 5.5초 회전 (mount-time shuffle + 순회)
  useEffect(() => {
    let queue: string[] = shuffle(WRITE_PHRASES);
    let prev = WRITE_PHRASES[0];
    setHeaderPhrase(queue[0]);
    queue = queue.slice(1);
    const id = window.setInterval(() => {
      if (queue.length === 0) {
        queue = shuffle(WRITE_PHRASES);
        if (queue[0] === prev) {
          [queue[0], queue[1]] = [queue[1], queue[0]];
        }
      }
      const next = queue.shift()!;
      prev = next;
      setHeaderPhrase(next);
    }, 5500);
    return () => window.clearInterval(id);
  }, []);

  async function handleSubmit(
    payload: CardEditorPayload,
    action: SubmitAction,
  ): Promise<{ ok: true; cardId: number } | { ok: false; error: string }> {
    // status 결정 — action 기준
    const status =
      action === "save_draft"
        ? "draft"
        : action === "request_review"
          ? "pending_review"
          : "published";

    const isQa = payload.category === "qa";

    // API payload 조립 (POST /api/articles 명세)
    const apiPayload: Record<string, unknown> = {
      type: payload.type,
      category: payload.category,
      keywords: payload.keywords,
      status,
      hide_doctor_credential: false,
    };

    // 외부 링크
    if (payload.externalUrl) {
      apiPayload.external_url = payload.externalUrl;
      apiPayload.external_meta = payload.externalMeta
        ? {
            title: payload.externalMeta.title,
            description: payload.externalMeta.description,
            image: payload.externalMeta.image,
            siteName: payload.externalMeta.siteName,
          }
        : null;
    }

    // 의사 명의 (admin 의 dropdown 또는 doctor 본인의 myDoctor)
    if (payload.doctorSlug) {
      apiPayload.doctor_slug = payload.doctorSlug;
    }

    // type 별로 필드명 다름
    if (isQa) {
      apiPayload.question = payload.title;
      apiPayload.answer = payload.body;
      if (payload.pubmedRefs.length > 0) {
        apiPayload.pubmed_refs = payload.pubmedRefs;
      }
    } else {
      apiPayload.title = payload.title;
      apiPayload.body = payload.body;
    }

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { id: number; shortcode?: string };

      // 새소식 첫 댓글
      if (payload.firstComment && status !== "draft") {
        try {
          await fetch("/api/comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cardId: data.id,
              body: payload.firstComment,
            }),
          });
        } catch (e) {
          // 첫 댓글 실패해도 글 저장은 성공 — 사용자는 댓글 누락을 모르므로 기록.
          const isDev = process.env.NODE_ENV !== "production";
          if (isDev) {
            console.warn("[comment-first-save] 새소식 첫 댓글 저장 실패:", e instanceof Error ? e.message : e);
          } else {
            console.error("[comment-first-save] 새소식 첫 댓글 저장 실패:", e instanceof Error ? e.message : e);
          }
        }
      }

      // Redirect — role / status / type 별
      let redirectUrl = "/";
      if (status === "draft") {
        if (role === ROLES.ADMIN) redirectUrl = "/admin/cards?status=draft";
        else if (role === ROLES.DOCTOR && myDoctor)
          redirectUrl = `/doctors/${myDoctor.slug}`;
      } else if (isQa) {
        redirectUrl = `/admin/cards?status=${status}`;
      }
      router.push(redirectUrl);
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return { ok: true, cardId: data.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "network" };
    }
  }

  // 2026-05-22: '검수 요청' 버튼 폐기 — 검수 흐름은 /admin/draft (AI Q&A 추출) 워크플로에만 존재.
  // /write 는 즉시 발행 또는 임시 저장만.

  // admin 만 글쓴이 dropdown — 의사 9명 + 본인 명의 옵션은 CardEditor 내부에서 추가
  const createAuthorOptions: DoctorOption[] | undefined =
    role === ROLES.ADMIN
      ? doctors.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          branch: d.branch,
        }))
      : undefined;

  return (
    <section className="w-full py-6">
      <h1
        key={headerPhrase}
        className="mb-5 text-center text-[20px] font-bold leading-[1.4] text-[var(--text)] fade-in-up"
      >
        {headerPhrase}
      </h1>
      <CardEditor
        mode="create"
        viewerRole={role}
        initialCategory={initialCategory}
        myDoctor={myDoctor}
        createAuthorOptions={createAuthorOptions}
        onSubmit={handleSubmit}
      />
    </section>
  );
}
