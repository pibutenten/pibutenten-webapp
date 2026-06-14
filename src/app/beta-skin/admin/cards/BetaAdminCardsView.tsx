"use client";

/**
 * BetaAdminCardsView — /beta-skin/admin/cards "전체 글 관리" 본문 (클라이언트).
 *
 * 원칙(Phase 3 ②-a): UI 는 베타 스킨 톤(var(--ink-*) · var(--tt-blue*) · var(--line) 토큰),
 *   데이터·필터 로직·RPC·운영 클라 컴포넌트(PickToggle / AdminCardsDoctorFilter)는 운영 /admin/cards 재사용.
 *   - 서버(page.tsx)가 운영 admin/cards/page 의 가드·searchParams 파싱·doctor 강제필터·데이터 fetch 로직을
 *     그대로 복제해 row·counts·doctors·필터값을 props 로 내려준다.
 *   - 이 컴포넌트는 그 props 를 베타 톤 status 탭·type/pick 칩·검색 form·테이블·페이지네이션으로 렌더한다.
 *   - searchParams 키(status/type/category/q/doctor/pick/page/sort/dir)는 운영과 100% 동일 → 같은 URL 규약.
 *   - 편집 링크(/admin/cards/[id]/edit)·액션 RPC(toggle_card_pick)는 운영 그대로(베타 편집 페이지는 아직 없음).
 *
 * 격리: 운영 파일 무수정. 베타 톤 영역은 인라인 style 의 베타 토큰만 사용(운영 var(--text)/var(--primary) 미사용).
 *   운영 컴포넌트(PickToggle/AdminCardsDoctorFilter) 내부 Tailwind 톤은 그대로 임베드(Phase3① ActivityKpis 방침).
 */

import Link from "next/link";
import PickToggle from "@/components/PickToggle";
import AdminCardsDoctorFilter from "@/app/admin/cards/AdminCardsDoctorFilter";
import { labelForCategory } from "@/lib/post-category";
import { formatYmd } from "@/lib/format-date";
import { truncate } from "@/lib/string-utils";
import BetaSkinShell from "../../BetaSkinShell";
import { useBetaSearchRouting } from "../../beta-ui";
import styles from "../../beta-skin.module.css";

// ── 운영 admin/cards/page.tsx 와 동일한 타입(데이터 계약 1:1) ──
type QAStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "archived"
  | "hidden";
type QAType = "qa" | "post";
type TypeFilter = "qa" | "post" | "review" | "review_summary" | "all";
type StatusFilter = QAStatus | "all" | "deleted";
type CategoryFilter = "doodle" | "all";

export type BetaAdminCardRow = {
  id: number;
  status: QAStatus;
  type: QAType;
  category: string | null;
  post_slug: string | null;
  is_pick: boolean | null;
  title: string;
  body: string | null;
  like_count: number | null;
  view_count: number | null;
  save_count: number | null;
  share_count: number | null;
  comments_count: { count: number }[] | null;
  created_at: string;
  deleted_at: string | null;
  doctor: { slug: string; name: string; branch: string | null } | null;
  author: {
    display_name: string | null;
    handle: string | null;
  } | null;
};

export type BetaAdminCardsDoctorOption = {
  id: string;
  slug: string;
  name: string;
};

type StatusCounts = Record<StatusFilter, number>;

export type BetaAdminCardsViewProps = {
  /** super admin 이면 전체 카드 + 원장 dropdown. doctor admin 이면 본인 글만. */
  isAdmin: boolean;
  rows: BetaAdminCardRow[];
  statusCounts: StatusCounts;
  doctors: BetaAdminCardsDoctorOption[];
  /** doctor admin 의 본인 이름(readonly chip 표시용). */
  ownDoctorName: string | null;
  // 현재 필터 상태(운영 page.tsx 파싱 결과 그대로)
  statusParam: StatusFilter;
  typeParam: TypeFilter;
  categoryParam: CategoryFilter;
  qParam: string;
  doctorSlugParam: string;
  pickOnly: boolean;
  sortKey: string;
  sortDir: "asc" | "desc";
  // 페이지네이션
  pageNum: number;
  totalPages: number;
  total: number;
  listError: string | null;
};

// 베타 status 라벨(운영 STATUS_STYLE 톤을 베타 토큰으로 재현 — 색만 베타화, 의미 동일).
//   deleted 는 DB enum 이 아니라 deleted_at IS NOT NULL row 표기용 라벨(운영 동일).
const BETA_STATUS_STYLE: Record<
  QAStatus | "deleted",
  { bg: string; fg: string; label: string; border: string }
> = {
  draft: { bg: "#fff", fg: "var(--ink-500)", label: "초안", border: "var(--line)" },
  pending_review: { bg: "var(--tt-blue-tint)", fg: "var(--tt-blue-deep)", label: "대기", border: "var(--tt-blue-soft)" },
  published: { bg: "transparent", fg: "#2a7330", label: "발행", border: "#bfe6c4" },
  archived: { bg: "#f4f6f8", fg: "var(--ink-700)", label: "보관", border: "var(--line)" },
  hidden: { bg: "#fdeef0", fg: "#b81c5e", label: "숨김", border: "#f6cdd9" },
  deleted: { bg: "#fdeef0", fg: "#9c1140", label: "삭제", border: "#f1b6c8" },
};
const BETA_STATUS_FALLBACK = {
  bg: "#f4f6f8",
  fg: "var(--ink-500)",
  label: "?",
  border: "var(--line)",
} as const;

const STATUS_LIST: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "pending_review", label: "대기" },
  { key: "published", label: "발행" },
  { key: "archived", label: "보관" },
  { key: "hidden", label: "숨김" },
  { key: "deleted", label: "삭제됨" },
];

const TYPE_LIST: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "전체 타입" },
  { key: "qa", label: "Q&A" },
  { key: "post", label: "끄적끄적" },
  { key: "review", label: "시술후기" },
  { key: "review_summary", label: "피부텐텐 리포트" },
];

const SORTABLE_COLS: Record<string, string> = {
  like: "like_count",
  view: "view_count",
  save: "save_count",
  share: "share_count",
  created: "created_at",
};

const BASE_PATH = "/beta-skin/admin/cards";

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === null) continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export default function BetaAdminCardsView(props: BetaAdminCardsViewProps) {
  const {
    isAdmin,
    rows,
    statusCounts,
    doctors,
    ownDoctorName,
    statusParam,
    typeParam,
    categoryParam,
    qParam,
    doctorSlugParam,
    pickOnly,
    sortKey,
    sortDir,
    pageNum,
    totalPages,
    total,
    listError,
  } = props;

  const search = useBetaSearchRouting();

  // 공통 query baseline(운영 page.tsx baseQuery 동일 — status/type/category/doctor/pick/q/sort/dir 유지).
  const baseQuery = {
    status: statusParam === "all" ? undefined : statusParam,
    type: typeParam === "all" ? undefined : typeParam,
    category: categoryParam === "all" ? undefined : categoryParam,
    pick: pickOnly ? "1" : undefined,
    q: qParam || undefined,
    doctor: doctorSlugParam || undefined,
    sort: sortKey === "created" ? undefined : sortKey,
    dir: sortDir === "desc" ? undefined : sortDir,
  };

  // 페이지네이션 번호(현재 ± 2) — 운영 동일.
  const pageNumbers: number[] = [];
  const startPage = Math.max(1, pageNum - 2);
  const endPage = Math.min(totalPages, pageNum + 2);
  for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

  // 정렬 헤더 — 운영 SortableTh 를 베타 톤으로 재현(클릭 시 sort/dir 갱신, 첫 클릭 내림차순).
  function SortTh({
    col,
    label,
    align = "right",
  }: {
    col: string;
    label: string;
    align?: "left" | "right";
  }) {
    const active = sortKey === col;
    const nextDir = active && sortDir === "desc" ? "asc" : "desc";
    const arrow = active ? (sortDir === "desc" ? " ↓" : " ↑") : "";
    return (
      <th
        style={{
          whiteSpace: "nowrap",
          padding: "8px 12px",
          fontWeight: 600,
          textAlign: align,
        }}
      >
        <Link
          replace
          href={`${BASE_PATH}${buildQueryString({ ...baseQuery, sort: col, dir: nextDir, page: undefined })}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: active ? "var(--tt-blue-deep)" : "inherit",
          }}
        >
          {label}
          <span style={{ width: 12, fontSize: 10 }}>{arrow}</span>
        </Link>
      </th>
    );
  }

  const thBase: React.CSSProperties = {
    padding: "8px 12px",
    fontWeight: 600,
    color: "var(--ink-500)",
  };
  const tdNum: React.CSSProperties = {
    padding: "8px 12px",
    verticalAlign: "middle",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    color: "var(--ink-700)",
  };

  return (
    <BetaSkinShell active="마이" wide back="/beta-skin/admin" {...search}>
      {/* 제목 + noindex 설명 */}
      <section className={styles.mb20}>
        <div className={styles.profileName} style={{ marginBottom: 4 }}>
          전체 글 관리
        </div>
        <p className={styles.muted}>
          {isAdmin
            ? "Q&A·끄적끄적·시술후기·리포트 상태/타입/원장 필터 + 발행·보관·Pick (영구 noindex)"
            : "내 글 관리 — 본인 명의 글만 표시됩니다 (영구 noindex)"}
        </p>
      </section>

      {/* status 필터 탭 — 베타 톤(밑줄 강조). 가로 스크롤 허용. */}
      <section className={styles.mb20}>
        <div
          style={{
            display: "flex",
            gap: 2,
            borderBottom: "1px solid var(--line)",
            overflowX: "auto",
            marginBottom: 14,
          }}
        >
          {STATUS_LIST.map((s) => {
            const active = s.key === statusParam;
            const href = `${BASE_PATH}${buildQueryString({
              ...baseQuery,
              status: s.key === "all" ? undefined : s.key,
              page: undefined,
            })}`;
            return (
              <Link
                replace
                key={s.key}
                href={href}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  padding: "6px 10px",
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  color: active ? "var(--tt-blue-deep)" : "var(--ink-500)",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>{s.label}</span>
                <span
                  style={{ marginLeft: 5, fontSize: 11, color: "var(--ink-300)" }}
                >
                  {statusCounts[s.key].toLocaleString()}
                </span>
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "var(--tt-blue)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* type 칩 + Pick 칩 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              flexWrap: "wrap",
              gap: 4,
              padding: 4,
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "#fff",
            }}
          >
            {TYPE_LIST.map((t) => {
              const active = t.key === typeParam;
              // 타입을 바꾸면 카테고리 reset(운영 동일 — post 만 카테고리 유지).
              const href = `${BASE_PATH}${buildQueryString({
                ...baseQuery,
                type: t.key === "all" ? undefined : t.key,
                category: t.key === "post" ? baseQuery.category : undefined,
                page: undefined,
              })}`;
              return (
                <Link
                  replace
                  key={t.key}
                  href={href}
                  style={{
                    borderRadius: 10,
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    color: active ? "var(--ink-900)" : "var(--ink-500)",
                    background: active ? "var(--tt-blue-tint)" : "transparent",
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          <Link
            replace
            href={`${BASE_PATH}${buildQueryString({
              ...baseQuery,
              pick: pickOnly ? undefined : "1",
              page: undefined,
            })}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 10,
              border: `1px solid ${pickOnly ? "var(--tt-blue-soft)" : "var(--line)"}`,
              padding: "4px 12px",
              fontSize: 12,
              color: pickOnly ? "var(--tt-blue-deep)" : "var(--ink-500)",
              background: pickOnly ? "var(--tt-blue-tint)" : "#fff",
            }}
          >
            ⭐ {pickOnly ? "Pick만 보는 중" : "Pick만 보기"}
          </Link>
        </div>

        {/* 검색 + 원장 필터(GET form) — searchParams 키 운영 동일. */}
        <form
          method="get"
          action={BASE_PATH}
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          {statusParam !== "all" && (
            <input type="hidden" name="status" value={statusParam} />
          )}
          {typeParam !== "all" && (
            <input type="hidden" name="type" value={typeParam} />
          )}
          {categoryParam !== "all" && (
            <input type="hidden" name="category" value={categoryParam} />
          )}
          {pickOnly && <input type="hidden" name="pick" value="1" />}
          {sortKey !== "created" && (
            <input type="hidden" name="sort" value={sortKey} />
          )}
          {sortDir !== "desc" && (
            <input type="hidden" name="dir" value={sortDir} />
          )}
          {isAdmin ? (
            <AdminCardsDoctorFilter
              doctors={doctors.map((d) => ({
                id: d.id,
                slug: d.slug,
                name: d.name,
              }))}
              currentSlug={doctorSlugParam}
              basePath={`${BASE_PATH}${buildQueryString({
                status: statusParam === "all" ? undefined : statusParam,
                type: typeParam === "all" ? undefined : typeParam,
                category: categoryParam === "all" ? undefined : categoryParam,
                pick: pickOnly ? "1" : undefined,
                q: qParam || undefined,
                doctor: doctorSlugParam || undefined,
              })}`}
            />
          ) : (
            <>
              {/* doctor admin 본인은 doctor 파라미터 서버 강제 + 본인 이름 readonly chip. */}
              <input type="hidden" name="doctor" value={doctorSlugParam} />
              <span
                style={{
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "var(--tt-blue-tint)",
                  padding: "0 12px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink-900)",
                }}
              >
                {ownDoctorName ?? doctorSlugParam}
                <span style={{ fontSize: 10, fontWeight: 400, color: "var(--ink-300)" }}>
                  본인 글
                </span>
              </span>
            </>
          )}
          <input
            type="text"
            name="q"
            defaultValue={qParam}
            placeholder="제목/본문 검색"
            style={{
              height: 36,
              flex: 1,
              minWidth: 180,
              borderRadius: 12,
              border: "1px solid var(--line)",
              background: "#fff",
              padding: "0 12px",
              fontSize: 14,
              color: "var(--ink-900)",
            }}
          />
          <button
            type="submit"
            style={{
              height: 36,
              borderRadius: 12,
              background: "var(--tt-blue)",
              padding: "0 16px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
            }}
          >
            검색
          </button>
          {(qParam || doctorSlugParam) && (
            <Link
              replace
              href={`${BASE_PATH}${buildQueryString({
                status: statusParam === "all" ? undefined : statusParam,
              })}`}
              style={{
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 12,
                border: "1px solid var(--line)",
                padding: "0 12px",
                fontSize: 14,
                color: "var(--ink-500)",
              }}
            >
              초기화
            </Link>
          )}
        </form>
      </section>

      {/* 에러 */}
      {listError && (
        <section className={styles.mb20}>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #f1b6c8",
              background: "#fdeef0",
              padding: 16,
              fontSize: 14,
              color: "#9c1140",
            }}
          >
            목록을 불러오지 못했어요.
            <pre
              style={{
                marginTop: 8,
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {listError}
            </pre>
          </div>
        </section>
      )}

      {/* 결과 테이블 */}
      {!listError && rows.length === 0 ? (
        <section className={styles.mb20}>
          <div
            style={{
              padding: 40,
              textAlign: "center",
              fontSize: 14,
              color: "var(--ink-500)",
            }}
          >
            {qParam || doctorSlugParam || statusParam !== "all" ? (
              <>
                조건에 맞는 글이 없어요.
                <br />
                <span style={{ fontSize: 12, color: "var(--ink-300)" }}>
                  필터를 조정하거나 검색어를 변경해 보세요.
                </span>
              </>
            ) : (
              <>아직 등록된 글이 없어요.</>
            )}
          </div>
        </section>
      ) : (
        !listError && (
          <section className={styles.mb20}>
            {/* 표 — 운영 admin/cards 와 동일하게 좁은 card 래퍼 없이 표 자체가 흰 박스(테두리+그림자).
                wide 컨테이너(1080px)에서 표 minWidth(860) < 컨테이너 → 데스크탑 가로 스크롤 해소.
                모바일에서만 overflow-x 가 가로 스크롤을 허용(좁은 화면 보호). */}
            <div
              style={{
                overflowX: "auto",
                borderRadius: 14,
                border: "1px solid var(--line)",
                background: "#fff",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 860,
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "var(--tt-blue-tint)", color: "var(--ink-500)" }}>
                    <th style={{ ...thBase, textAlign: "left" }}>ID</th>
                    <th style={{ ...thBase, textAlign: "center" }}>Pick</th>
                    <th style={{ ...thBase, textAlign: "left" }}>상태</th>
                    <th style={{ ...thBase, textAlign: "left" }}>타입</th>
                    <th style={{ ...thBase, textAlign: "left" }}>글쓴이</th>
                    <th style={{ ...thBase, textAlign: "left" }}>제목</th>
                    <SortTh col="like" label="좋아요" />
                    <SortTh col="view" label="조회수" />
                    <SortTh col="save" label="저장" />
                    <th style={{ ...thBase, whiteSpace: "nowrap", textAlign: "right" }}>
                      댓글
                    </th>
                    <SortTh col="share" label="공유" />
                    <SortTh col="created" label="생성일" align="left" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    // deleted_at IS NOT NULL → '삭제' 라벨 override(운영 동일).
                    const style = r.deleted_at
                      ? BETA_STATUS_STYLE.deleted
                      : (BETA_STATUS_STYLE[r.status] ?? BETA_STATUS_FALLBACK);
                    // 시술 리포트(review_summary)는 자동 집계물 → 편집 진입 차단(운영 동일).
                    const isReport = r.category === "review_summary";
                    const editHref = `/admin/cards/${r.id}/edit`;
                    const linkHref = isReport ? null : editHref;
                    return (
                      <tr
                        key={r.id}
                        style={{ borderTop: "1px solid var(--line)" }}
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            color: "var(--ink-300)",
                          }}
                        >
                          {linkHref ? (
                            <Link
                              href={linkHref}
                              style={{ color: "inherit" }}
                              title={isReport ? "공개 리포트(편집 불가)" : undefined}
                            >
                              #{r.id}
                            </Link>
                          ) : (
                            <span title="시술 리포트는 자동 집계물이라 편집할 수 없어요.">
                              #{r.id}
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            textAlign: "center",
                          }}
                        >
                          {/* 운영 PickToggle 임베드(toggle_card_pick RPC — 권한은 RLS+SECURITY DEFINER). */}
                          <PickToggle cardId={r.id} initial={!!r.is_pick} />
                        </td>
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              whiteSpace: "nowrap",
                              borderRadius: 999,
                              border: `1px solid ${style.border}`,
                              padding: "1px 8px",
                              fontSize: 11,
                              fontWeight: 600,
                              background: style.bg,
                              color: style.fg,
                            }}
                          >
                            {style.label}
                          </span>
                        </td>
                        <td
                          style={{
                            whiteSpace: "nowrap",
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            fontSize: 12,
                            color: "var(--ink-500)",
                          }}
                        >
                          {r.type === "qa"
                            ? "Q&A"
                            : labelForCategory(r.category) || "끄적끄적"}
                        </td>
                        <td
                          style={{
                            whiteSpace: "nowrap",
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            color: "var(--ink-900)",
                          }}
                        >
                          {r.doctor ? (
                            <span>{r.doctor.name}</span>
                          ) : r.author ? (
                            <span>
                              {r.author.display_name ?? r.author.handle ?? "—"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--ink-300)" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            color: "var(--ink-900)",
                          }}
                        >
                          {linkHref ? (
                            <Link
                              href={linkHref}
                              style={{ display: "block", color: "inherit" }}
                              title={isReport ? "공개 리포트(편집 불가)" : r.title}
                            >
                              {truncate(r.title ?? "", 50)}
                            </Link>
                          ) : (
                            <span
                              style={{ display: "block" }}
                              title="시술 리포트는 자동 집계물이라 편집할 수 없어요."
                            >
                              {truncate(r.title ?? "", 50)}
                            </span>
                          )}
                        </td>
                        <td style={tdNum}>{(r.like_count ?? 0).toLocaleString()}</td>
                        <td style={tdNum}>{(r.view_count ?? 0).toLocaleString()}</td>
                        <td style={tdNum}>{(r.save_count ?? 0).toLocaleString()}</td>
                        <td style={tdNum}>
                          {(r.comments_count?.[0]?.count ?? 0).toLocaleString()}
                        </td>
                        <td style={tdNum}>{(r.share_count ?? 0).toLocaleString()}</td>
                        <td
                          style={{
                            padding: "8px 12px",
                            verticalAlign: "middle",
                            fontSize: 12,
                            color: "var(--ink-300)",
                          }}
                        >
                          {formatYmd(r.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <nav
                aria-label="페이지네이션"
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                <PageLink
                  href={`${BASE_PATH}${buildQueryString({
                    ...baseQuery,
                    page: pageNum > 1 ? pageNum - 1 : undefined,
                  })}`}
                  disabled={pageNum <= 1}
                >
                  이전
                </PageLink>
                {startPage > 1 && (
                  <>
                    <PageLink
                      href={`${BASE_PATH}${buildQueryString({ ...baseQuery, page: 1 })}`}
                    >
                      1
                    </PageLink>
                    {startPage > 2 && (
                      <span style={{ padding: "0 4px", color: "var(--ink-300)" }}>…</span>
                    )}
                  </>
                )}
                {pageNumbers.map((p) => (
                  <PageLink
                    key={p}
                    href={`${BASE_PATH}${buildQueryString({
                      ...baseQuery,
                      page: p === 1 ? undefined : p,
                    })}`}
                    active={p === pageNum}
                  >
                    {p}
                  </PageLink>
                ))}
                {endPage < totalPages && (
                  <>
                    {endPage < totalPages - 1 && (
                      <span style={{ padding: "0 4px", color: "var(--ink-300)" }}>…</span>
                    )}
                    <PageLink
                      href={`${BASE_PATH}${buildQueryString({
                        ...baseQuery,
                        page: totalPages,
                      })}`}
                    >
                      {totalPages}
                    </PageLink>
                  </>
                )}
                <PageLink
                  href={`${BASE_PATH}${buildQueryString({
                    ...baseQuery,
                    page: pageNum < totalPages ? pageNum + 1 : undefined,
                  })}`}
                  disabled={pageNum >= totalPages}
                >
                  다음
                </PageLink>
              </nav>
            )}

            <div
              style={{
                marginTop: 8,
                textAlign: "center",
                fontSize: 12,
                color: "var(--ink-300)",
              }}
            >
              {pageNum} / {totalPages} 페이지 · {total.toLocaleString()}건
            </div>
          </section>
        )
      )}
    </BetaSkinShell>
  );
}

/** 페이지네이션 링크 — 베타 톤. active=현재페이지, disabled=비활성. */
function PageLink({
  href,
  children,
  active,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  const style: React.CSSProperties = {
    height: 36,
    minWidth: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    border: `1px solid ${active ? "var(--tt-blue)" : "var(--line)"}`,
    padding: "0 12px",
    fontSize: 14,
    background: active ? "var(--tt-blue)" : "transparent",
    color: active ? "#fff" : "var(--ink-500)",
    ...(disabled ? { pointerEvents: "none", opacity: 0.5 } : {}),
  };
  if (disabled) {
    return (
      <span aria-disabled style={style}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} style={style}>
      {children}
    </Link>
  );
}
