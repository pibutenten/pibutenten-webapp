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

// dead — 칼럼 폐기 후에도 ArticleEditor sub-component가 남아있어서 type만 유지
type Section = {
  heading: string;
  body: string;
  image: string | null;
};

// v5.1: 'article'(칼럼) 폐기 — post/qa 만 지원.
type WriteType = "post" | "qa";

type Props = {
  role: "admin" | "doctor" | "user";
  myDoctor: { slug: string; name: string } | null;
  doctors: Doctor[];
  displayName: string;
};

const TYPE_LABEL: Record<WriteType, string> = {
  post: "포스팅",
  qa: "Q&A",
};

// 모든 type 태그 최대 10개 (필수는 0개 — 선택)
const KEYWORD_MIN: Record<WriteType, number> = {
  post: 0,
  qa: 0,
};

const KEYWORD_MAX: Record<WriteType, number> = {
  post: 10,
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

  // 새소식 — 첫 댓글 동시 작성. 공유한 콘텐츠에 본인 코멘트를 함께 남기는 흐름.
  const [firstComment, setFirstComment] = useState("");

  // Q&A 참고문헌 — 발행 시 본문 끝에 "\n\n참고문헌\n1. …\n2. …" 형식으로 append.
  // 빈 항목은 제출 시 자동 필터. [+ 추가] 버튼으로 행 추가 / [×] 버튼으로 제거.
  const [references, setReferences] = useState<string[]>([""]);

  const [error, setError] = useState<string | null>(null);

  const minKw = KEYWORD_MIN[type];
  const maxKw = KEYWORD_MAX[type];

  /** 참고문헌이 있으면 본문 끝에 번호 매겨 append (Q&A 카테고리 + 비어있지 않은 항목만) */
  function bodyWithReferences(): string {
    if (category !== "qa") return body;
    const filled = references.map((r) => r.trim()).filter(Boolean);
    if (filled.length === 0) return body;
    const refBlock =
      "참고문헌\n" + filled.map((r, i) => `${i + 1}. ${r}`).join("\n");
    return `${body.trimEnd()}\n\n${refBlock}`;
  }

  /** 작성 중 내용이 있는지 체크 — type 전환 경고용 */
  function hasUnsavedContent(): boolean {
    if (title.trim()) return true;
    if (body.trim()) return true;
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
    // 새소식·Q&A 외 카테고리로 전환 시 외부 링크 초기화 (둘 다 외부 URL 사용)
    if (next !== "share" && next !== "qa") {
      setExternalUrl("");
      setExternalMeta(null);
    }
    // 첫 댓글은 새소식 전용
    if (next !== "share") {
      setFirstComment("");
    }
    // 참고문헌은 Q&A 전용
    if (next !== "qa") {
      setReferences([""]);
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
    // 새 URL을 시도하는 시점에 기존 채우기 결과 clear.
    // 성공하면 새로 채워지고, 실패해도 이전 URL 결과가 남지 않음 (사용자 의도와 일치).
    setTitle("");
    setBody("");
    setKeywords([]);
    setExternalMeta(null);
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
      if (meta.description) {
        // 출처 표기 — 새소식은 누구의 콘텐츠인지 본문 끝에 명시 (저작권·예의)
        const sourceTag = meta.siteName
          ? `\n\n(출처 = ${meta.siteName})`
          : "";
        // 새소식은 본문 한도 400자 — 출처 표기 자리 확보 위해 맞춰 trim
        const limit = category === "share" ? 400 - sourceTag.length : 800;
        const desc =
          meta.description.length > limit
            ? meta.description.slice(0, limit).replace(/\s+\S*$/, "") + "…"
            : meta.description;
        setBody(desc + sourceTag);
      }
      // 키워드 자동 추출 — 채우기 시 3~7개만 자동, 사용자가 추가로 maxKw(=10)까지 가능
      const AUTO_TAG_MIN = 3;
      const AUTO_TAG_MAX = 7;
      const { extractTagsFromText } = await import("@/lib/auto-tag");
      const haystack = [meta.title, meta.description]
        .filter((s): s is string => Boolean(s))
        .join("\n");
      const auto = extractTagsFromText(haystack, { limit: AUTO_TAG_MAX });
      const slice = auto.slice(0, Math.max(AUTO_TAG_MIN, Math.min(auto.length, AUTO_TAG_MAX)));
      setKeywords(slice);
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
    // post / qa 공통: 제목 + 본문 필수 (v5.1: 칼럼 폐기)
    if (!title.trim()) return "제목을 입력해주세요.";
    if (!body.trim()) return "본문을 입력해주세요.";
    const bodyLimit = category === "share" ? 400 : 800;
    // Q&A 참고문헌까지 합친 최종 본문 기준으로 한도 체크 (DB 저장 길이)
    const finalLen = bodyWithReferences().length;
    if (finalLen > bodyLimit)
      return `본문 + 참고문헌 합쳐 최대 ${bodyLimit}자까지 가능합니다. 현재 ${finalLen}자.`;
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
        if (type === "post") {
          // post: title을 question에, body를 answer에 통일
          // Q&A 카테고리면 본문 끝에 참고문헌 자동 append
          payload.title = title;
          payload.body = bodyWithReferences();
        } else if (type === "qa") {
          payload.question = title;
          payload.answer = bodyWithReferences();
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

        // 새소식 — 첫 댓글이 있으면 동시 등록 (실패해도 글 저장은 유지)
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

        // 저장된 상태에 따른 redirect — push 후 스크롤 맨 위로 (피드 첫 카드부터 보이게)
        const goTop = () => {
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        };
        // v5.1: /me/qnas 폐기 — 원장 본인 글 관리는 /doctors/{slug} 본인 페이지 위젯에서.
        // 일단 redirect:
        //   - admin: /admin/qas (관리자 글 관리 페이지 그대로)
        //   - doctor: /doctors/{my-slug} (본인 페이지에서 글 목록 확인)
        //   - user/etc: / (메인 피드)
        if (submitStatus === "draft") {
          if (role === "admin") router.push("/admin/qas?status=draft");
          else if (role === "doctor" && myDoctor)
            router.push(`/doctors/${myDoctor.slug}`);
          else router.push("/");
          goTop();
          return;
        }
        if (data.type === "qa") {
          if (role === "admin") router.push(`/admin/qas?status=${submitStatus}`);
          else if (role === "doctor" && myDoctor)
            router.push(`/doctors/${myDoctor.slug}`);
          else router.push("/");
        } else {
          router.push(`/`);
        }
        goTop();
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
          {/* 모바일에서 5개 카테고리 한 줄 유지 — flex-nowrap + 가로 스크롤.
              칩 shrink-0 + whitespace-nowrap로 줄바꿈 방지. 데스크탑은 flex-wrap. */}
          <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 sm:flex-wrap sm:gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableCategories.map((c) => {
              const selected = c.slug === category;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => changeCategory(c.slug)}
                  className={
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors sm:px-3.5 " +
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

        {/* 외부 링크 — "새소식"·"Q&A" 두 카테고리에서 노출. v4 spec.
            - 새소식: 채우기 버튼으로 제목·본문·태그 자동 추출
            - Q&A: 영상 URL만 첨부 (제목·본문은 직접 작성). [영상 보러가기] 표시. */}
        {(category === "share" || category === "qa") && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            {category === "qa" ? "영상 URL" : "외부 링크"}{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">
              {category === "qa"
                ? "선택 — 카드에 [영상 보러가기] 버튼 노출 (시간 포함 URL: ?t=120 또는 t=2m30s)"
                : "URL 입력 후 [채우기] 누르면 제목·본문·태그 자동 채움"}
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
            {category === "share" && (
              <button
                type="button"
                onClick={fillFromUrl}
                disabled={filling || !externalUrl.trim()}
                className="h-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--primary-light)] bg-[var(--primary-light)] px-3 text-sm font-semibold text-white hover:bg-[var(--primary-light-hover)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--border)]"
              >
                {filling ? "가져오는 중…" : "채우기"}
              </button>
            )}
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

        {/* 포스팅·Q&A 통합 form — 제목 / 본문 동일 구조 */}
        {(type === "post" || type === "qa") && (
          <PostQaForm
            title={title}
            onTitle={setTitle}
            body={body}
            onBody={setBody}
            bodyMax={category === "share" ? 400 : 800}
          />
        )}

        {/* Q&A 카테고리 — 참고문헌 입력 (선택). 본문 바로 아래에 위치. */}
        {category === "qa" && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
              참고문헌{" "}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                선택 — 본문 끝에 자동으로 추가됩니다
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              {references.map((ref, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs text-[var(--text-muted)]">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={ref}
                    onChange={(e) => {
                      const next = [...references];
                      next[idx] = e.target.value;
                      setReferences(next);
                    }}
                    placeholder="저자, 논문 제목, 학술지명, 연도 / DOI / URL 등"
                    className="h-9 flex-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 text-sm focus:border-[var(--primary-light)] focus:outline-none"
                  />
                  {references.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setReferences(references.filter((_, i) => i !== idx))
                      }
                      className="h-9 w-9 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
                      aria-label="이 참고문헌 제거"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setReferences([...references, ""])}
                className="mt-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
              >
                + 참고문헌 추가
              </button>
            </div>
          </div>
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

        {/* 새소식 — 첫 댓글 동시 작성. 위치: 태그 아래(원래 댓글이 태그 아래에 붙는 흐름과 동일). */}
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
            onClick={() => {
              if (!title.trim() && !body.trim() && keywords.length === 0 && !externalUrl.trim()) return;
              if (!confirm("작성 중인 내용을 모두 지우고 새로 시작할까요?")) return;
              setTitle("");
              setBody("");
              setKeywords([]);
              setKeywordInput("");
              setExternalUrl("");
              setExternalMeta(null);
              setFirstComment("");
              setReferences([""]);
              setError(null);
            }}
            disabled={pending}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
          >
            초기화
          </button>
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
  bodyMax = 800,
}: {
  title: string;
  onTitle: (s: string) => void;
  body: string;
  onBody: (s: string) => void;
  /** 본문 최대 글자수 — 카테고리별 다름 (새소식은 짧게). 기본 800 */
  bodyMax?: number;
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
            ({body.length} / {bodyMax})
          </span>
        </label>
        <textarea
          value={body}
          onChange={(e) => onBody(e.target.value)}
          rows={10}
          maxLength={bodyMax}
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
