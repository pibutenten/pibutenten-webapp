"use client";

import Image from "next/image";
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

const KEYWORD_SUGGESTIONS = [
  "여드름",
  "기미",
  "주름",
  "리프팅",
  "쥬베룩",
  "스킨부스터",
  "보톡스",
  "필러",
  "레이저",
  "홈케어",
  "선크림",
  "트러블",
  "잡티",
  "모공",
];

export default function WriteClient({
  role,
  myDoctor,
  doctors,
  displayName,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // type 결정 — 일반 사용자는 post 강제
  const allowedTypes: WriteType[] =
    role === "admin"
      ? ["post", "article", "qa"]
      : role === "doctor"
        ? ["post", "article"]
        : ["post"];
  const [type, setType] = useState<WriteType>(
    role === "doctor" || role === "admin" ? "article" : "post",
  );

  // post
  const [postBody, setPostBody] = useState("");

  // article
  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([
    { heading: "", body: "", image: null },
  ]);

  // qa (admin)
  const [qaDoctor, setQaDoctor] = useState<string>(doctors[0]?.slug ?? "");
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");

  // article로 쓸 doctor (admin이 본인 명의로 작성 시 비워둠 가능)
  const [articleDoctor, setArticleDoctor] = useState<string>("");

  // 공통 키워드
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  const [error, setError] = useState<string | null>(null);

  const minKw = type === "article" ? 3 : 0;
  const maxKw = type === "article" ? 6 : 3;

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

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(`이미지 업로드 실패: ${j?.error ?? res.status}`);
      return null;
    }
    const j = (await res.json()) as { url: string; path: string };
    return j.url;
  }

  function validateBeforeSubmit(): string | null {
    if (type === "post") {
      if (!postBody.trim()) return "내용을 입력해주세요.";
      if (postBody.length > 4000) return "post는 최대 4000자까지 가능합니다.";
    } else if (type === "article") {
      if (!title.trim()) return "제목을 입력해주세요.";
      const filled = sections.filter(
        (s) => s.heading.trim() || s.body.trim(),
      );
      if (filled.length === 0) return "섹션을 1개 이상 작성해주세요.";
      if (keywords.length < minKw)
        return `칼럼은 키워드를 최소 ${minKw}개 입력해주세요.`;
    } else if (type === "qa") {
      if (!qaDoctor) return "원장을 선택해주세요.";
      if (!qaQuestion.trim()) return "질문을 입력해주세요.";
      if (!qaAnswer.trim()) return "답변을 입력해주세요.";
    }
    return null;
  }

  function handleSubmit() {
    setError(null);
    const ve = validateBeforeSubmit();
    if (ve) {
      setError(ve);
      return;
    }
    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = { type, keywords };
        if (type === "post") {
          payload.body = postBody;
        } else if (type === "article") {
          payload.title = title;
          payload.cover_image = coverImage;
          payload.sections = sections.filter(
            (s) => s.heading.trim() || s.body.trim(),
          );
          if (role === "admin" && articleDoctor) {
            payload.doctor_slug = articleDoctor;
          }
        } else if (type === "qa") {
          payload.doctor_slug = qaDoctor;
          payload.question = qaQuestion;
          payload.answer = qaAnswer;
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
        // type별 redirect
        if (data.type === "article" && data.article_slug) {
          router.push(`/article/${encodeURIComponent(data.article_slug)}`);
        } else if (data.type === "qa") {
          router.push(`/me/qnas?status=pending_review`);
        } else {
          router.push(`/feed`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    });
  }

  return (
    <section className="w-full py-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--text)]">글쓰기</h1>
      <p className="mb-5 text-[13px] text-[var(--text-muted)]">
        {role === "user"
          ? "여러분의 피부 이야기를 남겨주세요."
          : role === "doctor"
            ? `${myDoctor?.name ?? displayName} 원장님의 글로 작성됩니다.`
            : "관리자: 원장 명의 Q&A / 칼럼 / 일반 글을 모두 작성할 수 있어요."}
      </p>

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
              {t === "post" ? "일반 글" : t === "article" ? "칼럼" : "Q&A"}
            </button>
          ))}
        </div>
      )}

      {/* 폼 본체 */}
      <div className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
        {type === "post" && (
          <PostForm body={postBody} onChange={setPostBody} />
        )}

        {type === "article" && (
          <ArticleForm
            role={role}
            doctors={doctors}
            articleDoctor={articleDoctor}
            onChangeArticleDoctor={setArticleDoctor}
            title={title}
            onTitle={setTitle}
            coverImage={coverImage}
            onCoverImage={setCoverImage}
            sections={sections}
            onUpdateSection={updateSection}
            onAddSection={addSection}
            onRemoveSection={removeSection}
            onMoveSection={moveSection}
            uploadImage={uploadImage}
          />
        )}

        {type === "qa" && (
          <QaForm
            doctors={doctors}
            qaDoctor={qaDoctor}
            onQaDoctor={setQaDoctor}
            qaQuestion={qaQuestion}
            onQaQuestion={setQaQuestion}
            qaAnswer={qaAnswer}
            onQaAnswer={setQaAnswer}
          />
        )}

        {/* 공통: 키워드 */}
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
              placeholder="키워드 입력 후 Enter (예: 여드름)"
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
          <div className="mt-2 flex flex-wrap gap-1.5">
            {KEYWORD_SUGGESTIONS.filter((k) => !keywords.includes(k))
              .slice(0, 10)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addKeyword(k)}
                  className="rounded-full border border-[var(--border)] bg-white px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  + {k}
                </button>
              ))}
          </div>
        </div>

        {/* 카테고리 안내 (단순 표시) */}
        <div className="text-[11px] text-[var(--text-muted)]">
          ⓘ 카테고리는 키워드 기반 자동 분류:{" "}
          {CATEGORIES.map((c) => c.label).join(" · ")}
        </div>

        {/* 에러 */}
        {error && (
          <div className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 액션 */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-sm hover:bg-[var(--bg-soft)]"
            disabled={pending}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="h-10 rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
          >
            {pending
              ? "저장 중…"
              : type === "qa"
                ? "검수 요청 (원장 발행 대기)"
                : "발행"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// PostForm
// ────────────────────────────────────────────────────────────
function PostForm({
  body,
  onChange,
}: {
  body: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
        내용{" "}
        <span className="text-xs font-normal text-[var(--text-muted)]">
          ({body.length} / 4000)
        </span>
      </label>
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        maxLength={4000}
        placeholder="피부 고민이나 후기를 자유롭게 적어주세요."
        className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        텍스트만 작성 가능 (이미지 첨부 불가)
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ArticleForm
// ────────────────────────────────────────────────────────────
function ArticleForm({
  role,
  doctors,
  articleDoctor,
  onChangeArticleDoctor,
  title,
  onTitle,
  coverImage,
  onCoverImage,
  sections,
  onUpdateSection,
  onAddSection,
  onRemoveSection,
  onMoveSection,
  uploadImage,
}: {
  role: "admin" | "doctor" | "user";
  doctors: Doctor[];
  articleDoctor: string;
  onChangeArticleDoctor: (s: string) => void;
  title: string;
  onTitle: (s: string) => void;
  coverImage: string | null;
  onCoverImage: (s: string | null) => void;
  sections: Section[];
  onUpdateSection: (i: number, patch: Partial<Section>) => void;
  onAddSection: () => void;
  onRemoveSection: (i: number) => void;
  onMoveSection: (i: number, dir: -1 | 1) => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  return (
    <div className="space-y-5">
      {/* admin이 칼럼 작성 시 원장 선택 (선택사항) */}
      {role === "admin" && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            원장 (선택사항 — 비우면 관리자 명의)
          </label>
          <select
            value={articleDoctor}
            onChange={(e) => onChangeArticleDoctor(e.target.value)}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            <option value="">— 관리자 명의로 작성 —</option>
            {doctors.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
                {d.branch ? ` · ${d.branch}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

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
          placeholder="예) 가을철 피부, 어떻게 관리해야 할까요?"
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-base font-medium focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* 대표 이미지 */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          대표 이미지 (옵션)
        </label>
        {coverImage ? (
          <div className="relative inline-block">
            <Image
              src={coverImage}
              alt="대표 이미지"
              width={400}
              height={225}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => onCoverImage(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-black/80"
            >
              제거
            </button>
          </div>
        ) : (
          <ImageUploadButton
            label="대표 이미지 업로드 (jpg/png/webp, ~8MB)"
            onUploaded={(url) => onCoverImage(url)}
            uploadImage={uploadImage}
          />
        )}
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
                placeholder="소제목 (예: 가을 피부의 특징)"
                className="mb-2 h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-[15px] font-semibold focus:border-[var(--primary)] focus:outline-none"
              />
              <textarea
                value={s.body}
                onChange={(e) => onUpdateSection(i, { body: e.target.value })}
                rows={5}
                maxLength={2000}
                placeholder="섹션 본문"
                className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 text-[14px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
              />
              <div className="mt-2">
                {s.image ? (
                  <div className="relative inline-block">
                    <Image
                      src={s.image}
                      alt={`섹션 ${i + 1} 이미지`}
                      width={300}
                      height={170}
                      className="rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateSection(i, { image: null })}
                      className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-black/80"
                    >
                      제거
                    </button>
                  </div>
                ) : (
                  <ImageUploadButton
                    label="섹션 이미지 (옵션)"
                    onUploaded={(url) => onUpdateSection(i, { image: url })}
                    uploadImage={uploadImage}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// QaForm (admin only)
// ────────────────────────────────────────────────────────────
function QaForm({
  doctors,
  qaDoctor,
  onQaDoctor,
  qaQuestion,
  onQaQuestion,
  qaAnswer,
  onQaAnswer,
}: {
  doctors: Doctor[];
  qaDoctor: string;
  onQaDoctor: (s: string) => void;
  qaQuestion: string;
  onQaQuestion: (s: string) => void;
  qaAnswer: string;
  onQaAnswer: (s: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Q&A는 해당 원장의 검수(pending_review) 큐로 들어갑니다. 원장이 발행을
        해야 노출됩니다.
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          원장
        </label>
        <select
          value={qaDoctor}
          onChange={(e) => onQaDoctor(e.target.value)}
          className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          {doctors.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
              {d.branch ? ` · ${d.branch}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          질문
        </label>
        <input
          type="text"
          value={qaQuestion}
          onChange={(e) => onQaQuestion(e.target.value)}
          maxLength={200}
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-base focus:border-[var(--primary)] focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          답변
        </label>
        <textarea
          value={qaAnswer}
          onChange={(e) => onQaAnswer(e.target.value)}
          rows={8}
          maxLength={3000}
          placeholder="350~450자, 두괄식으로 작성"
          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-white p-3 text-[15px] leading-[1.7] focus:border-[var(--primary)] focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          현재 글자 수: {qaAnswer.length}
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ImageUploadButton
// ────────────────────────────────────────────────────────────
function ImageUploadButton({
  label,
  onUploaded,
  uploadImage,
}: {
  label: string;
  onUploaded: (url: string) => void;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <label
      className={
        "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-white px-3 py-2 text-xs hover:border-[var(--primary)] " +
        (busy ? "pointer-events-none opacity-60" : "")
      }
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const url = await uploadImage(f);
            if (url) onUploaded(url);
          } finally {
            setBusy(false);
            // input reset
            e.target.value = "";
          }
        }}
      />
      <span>{busy ? "업로드 중…" : label}</span>
    </label>
  );
}
