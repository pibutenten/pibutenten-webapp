"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";

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

// post는 키워드 미사용(0). qa·article은 최대 10개. (필요 시 post도 활성 가능)
const KEYWORD_MIN: Record<WriteType, number> = {
  post: 0,
  article: 0,
  qa: 0,
};

const KEYWORD_MAX: Record<WriteType, number> = {
  post: 0,
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

  // type 결정 — 모든 회원 기본값은 post (인스타·페이스북 같은 일관 경험)
  // - 일반 사용자: post 만
  // - 원장: post / qa 선택 가능 (Q&A는 의료 답변)
  // - 관리자: post / qa 선택 가능 (칼럼/AI URL 초안은 /admin 영역에서 별도)
  const allowedTypes: WriteType[] =
    role === "admin" || role === "doctor" ? ["post", "qa"] : ["post"];
  const [type, setTypeState] = useState<WriteType>("post");

  // 글쓴이 (원장 명의) — 모든 type에 공통 노출. ""=관리자 명의(admin), 원장 본인은 자기 slug 고정
  const [authorDoctor, setAuthorDoctor] = useState<string>(
    role === "doctor" ? (myDoctor?.slug ?? "") : "",
  );

  // 통합: post + qa 공통 — 제목 / 내용 (qa는 질문 / 답변)
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // article 전용 (admin만)
  const [sections, setSections] = useState<Section[]>([
    { heading: "", body: "", image: null },
  ]);

  // 공통 키워드
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

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

  /** type 전환 — 작성 중 내용 있으면 경고, 확인 시 모두 초기화 */
  function setType(next: WriteType) {
    if (next === type) return;
    if (hasUnsavedContent()) {
      const ok = window.confirm(
        "작성 중인 내용이 있습니다.\n타입을 변경하면 작성한 내용이 모두 사라집니다.\n계속하시겠습니까?",
      );
      if (!ok) return;
      // 모든 필드 초기화
      setTitle("");
      setBody("");
      setSections([{ heading: "", body: "", image: null }]);
      setKeywords([]);
      setKeywordInput("");
      setError(null);
    }
    setTypeState(next);
  }

  function addKeyword(k: string) {
    const v = k.trim().replace(/^#/, "");
    if (!v) return;
    if (keywords.includes(v)) return;
    if (keywords.length >= maxKw) {
      setError(`키워드는 최대 ${maxKw}개까지 가능합니다.`);
      return;
    }
    setKeywords((prev) => [...prev, v]);
    setKeywordInput("");
    setError(null);
  }

  function removeKeyword(k: string) {
    setKeywords((prev) => prev.filter((x) => x !== k));
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
        return `칼럼은 키워드를 최소 ${minKw}개 입력해주세요.`;
      return null;
    }
    // post / qa 공통: 제목 + 본문 필수
    if (!title.trim()) return "제목을 입력해주세요.";
    if (!body.trim()) return "본문을 입력해주세요.";
    if (body.length > 4000) return "본문은 최대 4000자까지 가능합니다.";
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
          keywords,
          status: submitStatus,
        };
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
          router.push(`/feed`);
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

  const writerLabel =
    role === "admin"
      ? authorDoctor
        ? `${doctors.find((d) => d.slug === authorDoctor)?.name ?? ""} 원장님 명의로`
        : `${displayName || "관리자"} (관리자)`
      : role === "doctor"
        ? `${myDoctor?.name ?? displayName} 원장님`
        : `${displayName || "회원"}`;

  return (
    <section className="w-full py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">글쓰기</h1>
      <p className="mb-5 text-[13px] text-[var(--text-muted)]">{writerLabel}</p>

      {/* type 토글 (선택지 2개 이상일 때만 노출) */}
      {allowedTypes.length > 1 && (
        <div className="mb-5 inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-0.5">
          {allowedTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors " +
                (type === t
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
              }
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {/* 폼 본체 */}
      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {/* 글쓴이 선택 — 모든 type 공통, 고정 노출 (admin만 변경 가능) */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            글쓴이
          </label>
          {role === "admin" ? (
            <select
              value={authorDoctor}
              onChange={(e) => setAuthorDoctor(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              <option value="">관리자</option>
              {doctors.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name} 원장님
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              {writerLabel}
            </div>
          )}
        </div>

        {/* 포스팅·Q&A 통합 form — 제목 / 본문 동일 구조 */}
        {(type === "post" || type === "qa") && (
          <PostQaForm
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
          />
        )}

        {type === "article" && (
          <ArticleForm
            title={title}
            onTitle={setTitle}
            sections={sections}
            onUpdateSection={updateSection}
            onAddSection={addSection}
            onRemoveSection={removeSection}
            onMoveSection={moveSection}
          />
        )}

        {/* 공통: 키워드 — maxKw=0이면 비표시 (post는 키워드 없음) */}
        {maxKw > 0 && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            키워드{" "}
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
              placeholder="키워드 입력 후 Enter"
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

        {maxKw > 0 && (
        <div className="text-[11px] text-[var(--text-muted)]">
          ⓘ 카테고리는 키워드 기반 자동 분류:{" "}
          {CATEGORIES.map((c) => c.label).join(" · ")}
        </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 — 일반인은 발행만, 원장/관리자는 저장 + 검수(관리자만) + 발행 */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
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
            className="h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
          >
            {pending ? "처리 중…" : "발행"}
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
            ({body.length} / 4000)
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={10}
          maxLength={4000}
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
