/**
 * 카드 본문/제목 렌더링 유틸 — 순수 함수.
 *
 *  - highlight(text, query)         : 검색어 부분 일치를 노란 mark로 강조
 *  - renderAnswerBody(...)          : 단락 분리 + bold 마크다운 + 형광펜 + clamp 처리
 *  - absoluteDateTimeLabel(iso)     : title 속성용 절대 시간 문자열
 *
 * Phase 4-1: Card.tsx 분해를 위해 추출.
 */
import { Fragment, type ReactNode } from "react";

/**
 * 텍스트 안에서 query 부분 일치를 노란 mark로 강조 (대소문자 무시).
 * query 비어있으면 원문 반환.
 */
export function highlight(text: string, query?: string): ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lq, i);
    if (idx < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`m${key++}`}
        style={{
          backgroundColor: "#FFF3A3",
          color: "inherit",
          padding: "0 1px",
          borderRadius: "2px",
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return <Fragment>{parts}</Fragment>;
}

/**
 * 답안 본문 렌더링.
 * - `\n\n` 단락 분리 후 각 단락을 <p>로 출력 (단락 사이 살짝 여백, mt-2.5).
 * - `**bold**` 마크다운만 인라인으로 <strong>로 변환 + 형광펜 하이라이트(투명 → 노란 alpha 0.55, 60% 지점).
 * - 검색 query 하이라이트는 plain 텍스트 부분에 highlight()로 적용.
 * - clamped=true면 첫 단락만 line-clamp-4(mobile) / md:line-clamp-5(desktop)로 가리고 이후 단락은 hidden.
 *   펼치면 전체 단락 표시. 인스타식 펼침/접기 UX.
 */
export function renderAnswerBody(
  text: string,
  query: string | undefined,
  clamped: boolean,
  highlightColor: string,
): ReactNode {
  const paragraphs = (text ?? "").split(/\n{2,}/).map((s) => s.trimEnd());
  return (
    <>
      {paragraphs.map((para, pi) => {
        const isFirst = pi === 0;
        // 인라인 bold + 검색 하이라이트 처리
        const inline: ReactNode[] = [];
        const re = /\*\*([^*]+)\*\*/g;
        let lastIdx = 0;
        let m: RegExpExecArray | null;
        let key = 0;
        while ((m = re.exec(para)) !== null) {
          if (m.index > lastIdx) {
            const slice = para.slice(lastIdx, m.index);
            inline.push(
              <Fragment key={`t${pi}-${key++}`}>
                {highlight(slice, query)}
              </Fragment>,
            );
          }
          inline.push(
            <strong
              key={`b${pi}-${key++}`}
              className="font-semibold text-[var(--text-secondary)]"
              style={{
                // 하단 1/3 정도만 형광펜 줄을 깐 듯한 인라인 하이라이트
                // 카드 ID 해시로 3색(Yellow/Mint/Lavender) 결정적 매핑 — 한 카드 안에서는 동일 색
                backgroundImage: `linear-gradient(transparent 60%, ${highlightColor} 60%)`,
                padding: "0 1px",
              }}
            >
              {highlight(m[1], query)}
            </strong>,
          );
          lastIdx = m.index + m[0].length;
        }
        if (lastIdx < para.length) {
          inline.push(
            <Fragment key={`t${pi}-${key++}`}>
              {highlight(para.slice(lastIdx), query)}
            </Fragment>,
          );
        }
        // clamped일 때: 첫 단락은 line-clamp-4 md:line-clamp-5 / 나머지 단락은 hidden.
        // line-clamp가 자동으로 마지막 줄 끝에 '…'을 처리하므로 별도 ellipsis 표시 X.
        const clampClass = clamped
          ? isFirst
            ? "line-clamp-4 md:line-clamp-5"
            : "hidden"
          : "";
        const showMore = clamped && isFirst;
        // 첫 단락에 speakable class — JSON-LD SpeakableSpecification.cssSelector가 이걸 가리킴 (음성·AI assistant 답변 픽업).
        const speakableClass = isFirst ? " card-answer-speakable" : "";
        // SEO/AEO: '더보기' 라벨은 CSS ::after 로 표시. DOM 텍스트로 두면 크롤러/LLM 이
        // 답변 본문 끝에 "...작동 방식.더보기" 식으로 흘려 읽음. ::after content 는
        // pseudo element 라 검색엔진이 본문에서 분리.
        return (
          <p
            key={pi}
            className={`whitespace-pre-wrap text-[15px] leading-[1.7] text-[var(--text-secondary)]${speakableClass} ${
              isFirst ? "" : "mt-1"
            } ${clampClass} ${showMore ? "card-answer--more" : ""}`}
            style={{ transition: "color 0.2s ease" }}
          >
            {inline}
          </p>
        );
      })}
    </>
  );
}

/**
 * 호버 절대 날짜 — title 속성용.
 * 예: "2026년 4월 24일 14:30"
 */
export function absoluteDateTimeLabel(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}년 ${m}월 ${day}일 ${hh}:${mm}`;
}
