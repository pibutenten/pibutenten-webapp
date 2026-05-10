"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  categoriesForRole,
  defaultHideCredential,
  type PostCategorySlug,
} from "@/lib/post-category";

/** 글쓰기 페이지 진입 시 랜덤 노출 카피 (꼭 공유하고 싶은 나만의 피부 비법은 베리에이션 강조) */
const WRITE_PHRASES = [
  "유독 잘 받은 화장의 비결은..",
  "오늘 나의 스킨케어 꿀팁은?",
  "꼭 공유하고 싶은 나만의 피부 비법은?",
  "꼭 공유하고 싶은 나만의 시술 후기는?",
  "꼭 공유하고 싶은 나만의 화장품 한 가지는?",
  "꼭 공유하고 싶은 나만의 데일리 루틴은?",
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

type Doctor = {
  id: string;
  slug: string;
  name: string;
  branch: string | null;
};

type Section = {
  heading: string;
  body: string;
  image: string | null;
};

type WriteType = "post" | "article" | "qa";

type Props = {
  role: "admin" | "doctor" | "user";
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
  displayName: string;
};

const TYPE_LABEL: Record<WriteType, string> = {
  post: "포스팅",
  article: "칼럼",
  qa: "Q&A",
};

// 모든 type 태그 최대 10개 (필수는 0개 — 선택)
const KEYWORD_MIN: Record<WriteType, number> = {
  post: 0,
  article: 0,
  qa: 0,
};

const KEYWORD_MAX: Record<WriteType, number> = {
  post: 10,
  article: 10,
  qa: 10,
};

export default function WriteClient({
  role,
  myDoctor,
  doctors,
  displayName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 카테고리 선택 — Phase 2부터 type 토글을 카테고리로 통합.
  //   - user: review / daily / question / news
  //   - doctor·admin: + qa
  // 내부 type은 category에서 자동 파생 (qa → 'qa', 그 외 → 'post').
  const availableCategories = categoriesForRole(role);
  const [category, setCategory] = useState<PostCategorySlug>("diary");
  const type: WriteType = category === "qa" ? "qa" : "post";
  const allowedTypes: WriteType[] = []; // type 토글 UI 제거 (호환용 더미)

  // 글쓴이 (원장 명의) — 모든 type에 공통 노출. ""=관리자 명의(admin), 원장 본인은 자기 slug 고정
  const [authorDoctor, setAuthorDoctor] = useState<string>(
    role === "doctor" ? (myDoctor?.slug ?? "") : "",
  );

  // 페이지 진입 시 헤더 카피 랜덤 (SSR-safe — 첫 렌더는 첫 phrase)
  const [headerPhrase, setHeaderPhrase] = useState(WRITE_PHRASES[0]);
  useEffect(() => {
    setHeaderPhrase(WRITE_PHRASES[Math.floor(Math.random() * WRITE_PHRASES.length)]);
  }, []);

  // 통합: post + qa 공통 — 제목 / 내용 (qa는 질문 / 답변)
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // article 전용 (admin만)
  const [sections, setSections] = useState<Section[]>([
    { heading: "", body: "", image: null },
  ]);

  // 공통 태그
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  // 의사 직함 숨김 토글 — 카테고리별 default + 사용자가 토글 가능
  const [hideCredential, setHideCredential] = useState<boolean>(
    defaultHideCredential("diary"),
  );
  // 카테고리 변경 시 default 따라가도록 — changeCategory에서 처리

  // 외부 링크 — 모든 카테고리에서 옵션. [채우기] 누르면 메타 fetch해서 제목/본문/태그 채움
  const [externalUrl, setExternalUrl] = useState("");
  const [externalMeta, setExternalMeta] = useState<{
    title?: string;
    description?: string;
    image?: string | null;
    siteName?: string;
  } | null>(null);
  const [filling, setFilling] = useState(false);
  const [autoTagging, setAutoTagging] = useState(false);

  // 공유하기 — 첫 댓글 동시 작성. 공유한 콘텐츠에 본인 코멘트를 함께 남기는 흐름.
  const [firstComment, setFirstComment] = useState("");

  const [error, setError] = useState<string | null>(null);

  const minKw = KEYWORD_MIN[type];
  const maxKw = KEYWORD_MAX[type];

  /** 작성 중 내용이 있는지 체크 — type 전환 경고용 */
  function hasUnsavedContent(): boolean {
    if (title.trim()) return true;
    if (body.trim()) return true;
    if (type === "article" && sections.some((s) => s.heading.trim() || s.body.trim())) return true;
    if (keywords.length > 0) return true;
    return false;
  }

  /** 카테고리 전환 — 작성 중 내용 있고 type이 바뀌면 경고 (qa ↔ 일반) */
  function changeCategory(next: PostCategorySlug) {
    if (next === category) return;
    const nextType: WriteType = next === "qa" ? "qa" : "post";
    if (nextType !== type && hasUnsavedContent()) {
      const ok = window.confirm(
        "작성 중인 내용이 있습니다.\n카테고리를 변경하면 작성한 내용이 모두 사라집니다.\n계속하시겠습니까?",
      );
      if (!ok) return;
      setTitle("");
      setBody("");
      setSections([{ heading: "", body: "", image: null }]);
      setKeywords([]);
      setKeywordInput("");
      setError(null);
    }
    setCategory(next);
    // 카테고리 변경 시 의사 직함 숨김 default도 업데이트
    setHideCredential(defaultHideCredential(next));
    // share 외 카테고리로 전환 시 외부 링크·첫 댓글 초기화
    if (next !== "share") {
      setExternalUrl("");
      setExternalMeta(null);
      setFirstComment("");
    }
  }

  function addKeyword(k: string) {
    const v = k.trim().replace(/^#/, "");
    if (!v) return;
    if (keywords.includes(v)) return;
    if (keywords.length >= maxKw) {
      setError(`태그는 최대 ${maxKw}개까지 가능합니다.`);
      return;
    }
    setKeywords((prev) => [...prev, v]);
    setKeywordInput("");
    setError(null);
  }

  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x !== k));
  }

  /** URL [채우기] — 외부 링크 메타 fetch → 제목/본문/태그 자동 채움 */
  async function fillFromUrl() {
    const url = externalUrl.trim();
    if (!url) return;
    setError(null);
    setFilling(true);
    try {
      const r = await fetch("/api/preview-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      // 응답이 HTML(에러 페이지)일 수 있어 안전 파싱
      const raw = await r.text();
      let data: { error?: string; title?: string; description?: string; image?: string | null; siteName?: string } | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        setError(`링크 정보를 가져오지 못했어요 (${r.status}). 잠시 후 다시 시도해주세요.`);
        return;
      }
      if (!r.ok) {
        setError(data?.error ?? `링크 정보를 가져오지 못했어요 (${r.status}).`);
        return;
      }
      const meta = data as {
        title?: string;
        description?: string;
        image?: string | null;
        siteName?: string;
      };
      setExternalMeta(meta);
      // [채우기] 동작 — 사용자가 명시적으로 누른 액션이므로 항상 덮어씀
      // (이미 쓴 내용이 있어도 새 URL 메타로 갱신해야 직관적)
      if (meta.title) setTitle(meta.title);
      if (meta.description) setBody(meta.description);
      // 키워드는 사전 매칭으로 추출 — 메타 + 본문 합쳐서
      const { extractTagsFromText } = await import("@/lib/auto-tag");
      const haystack = [meta.title, meta.description, body, title]
        .filter((s): s is string => Boolean(s))
        .join("\n");
      const auto = extractTagsFromText(haystack, {
        limit: 5,
        exclude: keywords,
      });
      if (auto.length > 0) {
        setKeywords((prev) => {
          const merged = [...prev];
          for (const k of auto) {
            if (merged.length >= maxKw) break;
            if (!merged.includes(k)) merged.push(k);
          }
          return merged;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "링크 처리 실패");
    } finally {
      setFilling(false);
    }
  }

  /** [태그 자동 생성] — 본문(+제목+외부 메타)에서 사전 매칭으로 태그 추출 */
  async function autoGenerateTags() {
    setError(null);
    setAutoTagging(true);
    try {
      const { extractTagsFromText } = await import("@/lib/auto-tag");
      const haystack = [
        title,
        body,
        externalMeta?.title,
        externalMeta?.description,
      ]
        .filter((s): s is string => Boolean(s))
        .join("\n");
      if (!haystack.trim()) {
        setError("본문이나 제목을 먼저 입력해주세요.");
        return;
      }
      const auto = extractTagsFromText(haystack, {
        limit: maxKw,
        exclude: keywords,
      });
      if (auto.length === 0) {
        setError("매칭되는 태그가 없어요. 직접 입력해주세요.");
        return;
      }
      setKeywords((prev) => {
        const merged = [...prev];
        for (const k of auto) {
          if (merged.length >= maxKw) break;
          if (!merged.includes(k)) merged.push(k);
        }
        return merged;
      });
    } finally {
      setAutoTagging(false);
    }
  }

  function updateSection(i: number, patch: Partial<Section>) {
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  function addSection() {
    if (sections.length >= 12) {
      setError("섹션은 최대 12개까지 가능합니다.");
      return;
    }
    setSections((prev) => [...prev, { heading: "", body: "", image: null }]);
  }

  function removeSection(i: number) {
    setSections((prev) => prev.filter((_, idx) => idx !== i));
  }

  function moveSection(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function validateBeforeSubmit(forStatus: SubmitStatus): string | null {
    if (forStatus === "draft") {
      if (!title.trim() && !body.trim()) return "제목 또는 본문을 입력해주세요.";
      return null;
    }
    if (type === "article") {
      if (!title.trim()) return "제목을 입력해주세요.";
      const filled = sections.filter(
        (s) => s.heading.trim() || s.body.trim(),
      );
      if (filled.length === 0) return "섹션을 1개 이상 작성해주세요.";
      if (keywords.length < minKw)
        return `칼럼은 태그를 최소 ${minKw}개 입력해주세요.`;
      return null;
    }
    // post / qa 공통: 제목 + 본문 필수
    if (!title.trim()) return "제목을 입력해주세요.";
    if (!body.trim()) return "본문을 입력해주세요.";
    if (body.length > 800) return "본문은 최대 800자까지 가능합니다.";
    return null;
  }

  type SubmitStatus = "draft" | "pending_review" | "published";

  function handleSubmit(submitStatus: SubmitStatus) {
    setError(null);
    const ve = validateBeforeSubmit(submitStatus);
    if (ve) {
      setError(ve);
      return;
    }
    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          type,
          category,
          keywords,
          status: submitStatus,
          hide_doctor_credential: hideCredential,
        };
        // 외부 링크가 있으면 메타와 함께 전송 (Phase 3)
        if (externalUrl.trim()) {
          payload.external_url = externalUrl.trim();
          if (externalMeta) {
            payload.external_meta = {
              title: externalMeta.title,
              description: externalMeta.description,
              image: externalMeta.image,
              siteName: externalMeta.siteName,
            };
          }
        }
        // 글쓴이 — admin이 본인 명의면 비움, 원장 명의면 slug 전달
        if (role === "admin" && authorDoctor) {
          payload.doctor_slug = authorDoctor;
        }
        // 원장은 항상 본인 명의 (myDoctor.slug)
        if (role === "doctor" && myDoctor) {
          payload.doctor_slug = myDoctor.slug;
        }
        if (type === "article") {
          payload.title = title;
          payload.sections = sections.filter(
            (s) => s.heading.trim() || s.body.trim(),
          );
        } else if (type === "post") {
          // post: title을 question에, body를 answer에 통일
          payload.title = title;
          payload.body = body;
        } else if (type === "qa") {
          payload.question = title;
          payload.answer = body;
        }

        const res = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? `저장 실패 (${res.status})`);
          return;
        }

        // 공유하기 — 첫 댓글이 있으면 동시 등록 (실패해도 글 저장은 유지)
        if (
          category === "share" &&
          firstComment.trim() &&
          submitStatus !== "draft" &&
          typeof data.id === "number"
        ) {
          try {
            await fetch("/api/comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                qaId: data.id,
                body: firstComment.trim(),
              }),
            });
          } catch {
            /* 댓글 등록 실패 — 사용자에게 별도 안내 없이 본문만 저장 유지 */
          }
        }

        // 저장된 상태에 따른 redirect
        if (submitStatus === "draft") {
          // 저장 — 목록(검수/내 글) 또는 dashboard
          if (role === "doctor") router.push("/me/qnas?status=draft");
          else router.push("/admin/qas?status=draft");
          return;
        }
        if (data.type === "article" && data.article_slug) {
          router.push(`/article/${encodeURIComponent(data.article_slug)}`);
        } else if (data.type === "qa") {
          router.push(`/me/qnas?status=${submitStatus}`);
        } else {
          router.push(`/`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    });
  }

  // "검수 요청" 활성화 조건:
  //  - 작성자(role)와 글쓴이(authorDoctor)가 다름 (예: admin이 원장 명의로 작성)
  //  - 일반 사용자(user)는 검수 요청 비활성 (post만 가능, 자기 명의)
  //  - 원장 본인이 본인 글 쓰는 건 본인 발행이라 검수 요청 비활성
  const canRequestReview =
    role === "admin" && !!authorDoctor; // admin이 원장 명의로 쓸 때만

  // "발행" 활성화 조건:
  //  - admin이 본인 명의로 → 발행
  //  - admin이 원장 명의로 → 발행 가능 (원장 대신 즉시 발행)
  //  - 원장이 본인 명의로 → 발행
  //  - user → 발행 (post 한정)
  // 결국 모두 발행 가능. canRequestReview만 분기.

  // 글쓴이 라벨은 노출하지 않음 — admin도 항상 본인 명의로 작성, 원장은 본인 doctor 고정.
  // (다른 명의로 쓰려면 해당 계정으로 로그인하면 됨)

  return (
    <section className="w-full py-6">
      <h1 className="mb-5 text-center text-2xl font-bold text-[var(--text)]">
        {headerPhrase}
      </h1>

      {/* 폼 본체 */}
      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* 카테고리 선택 — 글 종류 분류. role별로 옵션 다름 */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
            카테고리
          </label>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map((c) => {
              const selected = c.slug === category;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => changeCategory(c.slug)}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors " +
                    (selected
                      ? "border-[var(--primary-light)] bg-[var(--primary-light)] text-white"
                      : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:border-[var(--primary-light)] hover:text-[var(--primary-light-hover)]")
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {/* 의사 직함 숨김 토글 — role이 doctor·admin일 때만 노출 */}
          {(role === "doctor" || role === "admin") && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={hideCredential}
                onChange={(e) => setHideCredential(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary-light)] focus:ring-[var(--primary-light)]"
              />
              <span>이 글에서 &ldquo;피부과 전문의&rdquo; 직함 숨기기 <span className="text-[var(--text-muted)]">(사적 모드)</span></span>
            </label>
          )}
        </div>

        {/* 외부 링크 — "공유하기"(share) 카테고리에서만 노출. v3 spec D-6 */}
        {category === "share" && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            외부 링크{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              URL 입력 후 [채우기] 누르면 제목·본문·태그 자동 채움
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary-light)] focus:outline-none"
            />
            <button
              type="button"
              onClick={fillFromUrl}
              disabled={filling || !externalUrl.trim()}
              className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--primary-light)] bg-[var(--primary-light)] px-3 text-sm font-semibold text-white hover:bg-[var(--primary-light-hover)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--border)]"
            >
              {filling ? "가져오는 중…" : "채우기"}
            </button>
          </div>
          {externalMeta?.title && (
            <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">
              <span className="font-semibold">{externalMeta.siteName ?? "외부 링크"}</span>
              <span className="mx-1.5">·</span>
              {externalMeta.title}
            </p>
          )}
        </div>
        )}

        {/* 공유하기 — 첫 댓글 동시 작성. 올리기와 함께 자동 등록됨. */}
        {category === "share" && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
              내 코멘트{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                선택 — 글과 동시에 첫 댓글로 등록됨
              </span>
            </label>
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              placeholder="이 콘텐츠에 대한 내 생각을 짧게 남겨보세요"
              rows={3}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--primary-light)] focus:outline-none"
            />
          </div>
        )}

        {/* 포스팅·Q&A 통합 form — 제목 / 본문 동일 구조 */}
        {(type === "post" || type === "qa") && (
          <PostQaForm
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
          />
        )}

        {/* article(칼럼) 글쓰기 진입점은 Phase 1에서 제거됨 — 카드 포스팅으로 통일 */}

        {/* 공통: 태그 — maxKw=0이면 비표시 (post는 태그 없음) */}
        {maxKw > 0 && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            태그{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              {minKw > 0 ? `${minKw}~${maxKw}개` : `최대 ${maxKw}개`}
            </span>
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => removeKeyword(k)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20"
              >
                {k} <span aria-hidden>×</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword(keywordInput);
                }
              }}
              placeholder="태그 입력 후 Enter"
              className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => addKeyword(keywordInput)}
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm hover:bg-[var(--bg-soft)]"
            >
              추가
            </button>
          </div>
        </div>
        )}

        {/* 카테고리 안내 문구 제거 — Phase 2에서 카테고리 드롭다운으로 교체 예정 */}

        {/* 에러 */}
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 — 일반인은 발행만, 원장/관리자는 저장 + 검수(관리자만) + 발행 */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--border)] pt-4">
          {role !== "user" && (
            <button
              type="button"
              onClick={() => handleSubmit("draft")}
              disabled={pending}
              className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-sm hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              저장
            </button>
          )}
          {role === "admin" && canRequestReview && (
            <button
              type="button"
              onClick={() => handleSubmit("pending_review")}
              disabled={pending}
              className="h-10 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="원장 검수 큐로 전송"
            >
              검수 요청
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSubmit("published")}
            disabled={pending}
            className="h-10 rounded-[var(--radius-sm)] bg-[var(--primary-light)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-light-hover)] disabled:opacity-50"
          >
            {pending ? "올리는 중…" : "올리기"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// PostQaForm — 포스팅 + Q&A 공통: 제목 / 본문
// ────────────────────────────────────────────────────────────
function PostQaForm({
  title,
  onTitle,
  body,
  onBody,
}: {
  title: string;
  onTitle: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          제목
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={200}
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          본문{" "}
          <span className="text-xs font-normal text-[var(--text-muted)]">
            ({body.length} / 800)
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={10}
          maxLength={800}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// ArticleForm — 대표 이미지 제거, placeholder 예시 제거
// ────────────────────────────────────────────────────────────
function ArticleForm({
  title,
  onTitle,
  sections,
  onUpdateSection,
  onAddSection,
  onRemoveSection,
  onMoveSection,
}: {
  title: string;
  onTitle: (s: string) => void;
  sections: Section[];
  onUpdateSection: (i: number, patch: Partial<Section>) => void;
  onAddSection: () => void;
  onRemoveSection: (i: number) => void;
  onMoveSection: (i: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="space-y-5">
      {/* 제목 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          제목
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={120}
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* 섹션 */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label className="block text-sm font-semibold text-[var(--text)]">
            섹션 ({sections.length})
          </label>
          <button
            type="button"
            onClick={onAddSection}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            + 섹션 추가
          </button>
        </div>
        <div className="space-y-4">
          {sections.map((s, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-soft)]/40 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  섹션 {i + 1}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveSection(i, -1)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-white"
                    aria-label="위로 이동"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveSection(i, 1)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-white"
                    aria-label="아래로 이동"
                  >
                    ↓
                  </button>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveSection(i)}
                      className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={s.heading}
                onChange={(e) =>
                  onUpdateSection(i, { heading: e.target.value })
                }
                maxLength={100}
                placeholder="소제목"
                className="mb-2 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-[15px] font-semibold focus:border-[var(--primary)] focus:outline-none"
              />
              <textarea
                value={s.body}
                onChange={(e) => onUpdateSection(i, { body: e.target.value })}
                rows={5}
                maxLength={2000}
                placeholder="본문"
                className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 text-[14px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// QaForm 제거됨 — PostQaForm으로 통합 (포스팅·Q&A 동일 구조)
