"use client";

/**
 * 카드 본문 — 제목 + 답변 본문 + 참고문헌 (Phase 4-8 추출).
 *
 * 영역:
 *  1) 제목 (h1 단독 페이지 / h2 피드 — asH1으로 분기)
 *  2) 답변 본문 (단락 분리 + bold + 형광펜 + clamp / 클릭 펼침)
 *  3) 참고문헌 (pubmed_refs 우선, 없으면 단일 pubmed_ref legacy fallback)
 */
import Link from "next/link";
import type { CardData } from "@/components/Card";
import { getQaUrl } from "@/lib/card-url";
import {
  highlight,
  renderAnswerBody,
} from "@/components/card/utils/card-render";

type Props = {
  card: CardData;
  activeQuery?: string;
  /** 단독 페이지에서 h1, 그 외 h2 */
  asH1: boolean;
  /** 250자/6줄 이상 본문 — 펼침/접기 토글 활성. */
  isLongAnswer: boolean;
  expanded: boolean;
  /** 본문 클릭으로 펼침/접기 불가 (단독 페이지). */
  forceExpanded: boolean;
  /** 형광펜 색 (카드 ID 해시로 결정 — pickHighlight 결과). */
  highlightColor: string;
  /** 펼침 토글 시 호출 — Card.tsx가 setExpanded + recordView 처리. */
  onExpandToggle: () => void;
};

export default function CardBody({
  card,
  activeQuery,
  asH1,
  isLongAnswer,
  expanded,
  forceExpanded,
  highlightColor,
  onExpandToggle,
}: Props) {
  // 표시할 참고문헌 ref 배열 결정 — pubmed_refs 우선, 없으면 단일 pubmed_ref legacy fallback
  const refs: NonNullable<CardData["pubmed_refs"]> =
    card.pubmed_refs && card.pubmed_refs.length > 0
      ? card.pubmed_refs
      : card.pubmed_ref
        ? [card.pubmed_ref]
        : [];
  // 유효한 ref만 (pmid 또는 doi 있는 것)
  const validRefs = refs.filter((r) => r.pmid || r.doi);
  const showRefs = validRefs.length > 0 && !(isLongAnswer && !expanded);

  const titleClass =
    "mb-2.5 whitespace-pre-wrap text-[17px] font-bold leading-[1.45] tracking-[-0.3px]";
  const titleInner = (
    <Link
      href={getQaUrl(card)}
      className="text-[var(--text)] hover:text-[var(--primary)] hover:underline"
    >
      {highlight(card.question, activeQuery)}
    </Link>
  );

  return (
    <>
      {/* 2. 제목 — 부드러운 검정(--text #383F47, 2026-05-20 사용자 결정), 클릭 시 단독 페이지로 이동.
          내부 링크 신호(PageRank · 앵커 텍스트) 누적 + 크롤러가 단독 URL 색인 가능.
          hover 시에만 primary 하늘색 + underline 으로 클릭 가능 시각 신호.
          asH1=true(단독 페이지)면 <h1>, 그 외 피드/리스트에서는 <h2>. */}
      {asH1 ? (
        <h1 className={titleClass}>{titleInner}</h1>
      ) : (
        <h2 className={titleClass}>{titleInner}</h2>
      )}

      {/* 3. 본문 — 단락(\n\n) 분리 + **bold** 인라인(형광펜 하이라이트) 렌더링.
          isLongAnswer && !expanded → 첫 단락만 line-clamp-4(mobile)/md:line-clamp-5(desktop)로 가림.
          expanded → 전체 단락 + 참고문헌까지 펼침.
          6번 — forceExpanded (글 단독 페이지) 일 때는 본문 클릭으로도 접기 불가 (사용자 요청). */}
      <div
        onClick={() => {
          if (!isLongAnswer) return;
          if (forceExpanded) return; // 단독 페이지: 접기 차단
          onExpandToggle();
        }}
        className={isLongAnswer && !forceExpanded ? "cursor-pointer" : ""}
      >
        {renderAnswerBody(
          card.answer,
          activeQuery,
          isLongAnswer && !expanded,
          highlightColor,
        )}
      </div>

      {/* 3a. 참고 논문 — 멀티 ref 지원.
          pubmed_refs(배열) 우선, 없으면 단일 pubmed_ref(legacy) fallback.
          isLongAnswer && !expanded면 가림(펼쳐야 보임). reasoning은 사용자 화면 X. */}
      {showRefs && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <div className="text-[10px] font-semibold tracking-[0.04em] text-[var(--text-muted)]/70">
            참고문헌{validRefs.length > 1 ? ` (${validRefs.length})` : ""}
          </div>
          <ul className="mt-0.5 space-y-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">
            {validRefs.map((r, idx) => {
              const linkHref = r.pubmed_url || r.doi_url;
              return (
                <li key={`${r.pmid ?? r.doi ?? idx}-${idx}`}>
                  <cite
                    itemScope
                    itemType="https://schema.org/ScholarlyArticle"
                    className="not-italic"
                  >
                    {validRefs.length > 1 && (
                      <span className="mr-1 text-[var(--text-muted)]/70">
                        {idx + 1}.
                      </span>
                    )}
                    {linkHref ? (
                      <a
                        href={linkHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--primary)" }}
                        itemProp="url"
                      >
                        <span itemProp="name">{r.title}</span>
                      </a>
                    ) : (
                      <span itemProp="name">{r.title}</span>
                    )}
                    {r.authors_short && (
                      <>
                        {" — "}
                        <span itemProp="author">{r.authors_short}</span>
                      </>
                    )}
                    {r.journal && (
                      <>
                        {", "}
                        <span itemProp="publisher">{r.journal}</span>
                      </>
                    )}
                    {r.year && (
                      <>
                        {" ("}
                        <span itemProp="datePublished">{r.year}</span>
                        {")"}
                      </>
                    )}
                  </cite>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
