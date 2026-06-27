"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  KIND_LONG_LABEL,
  KIND_ICON,
  KIND_DISPLAY_MODE,
  type NotificationKind,
} from "@/lib/notification-kinds";

/**
 * /notifications — 알림 전체 페이지.
 *
 * - 50개씩 무한 스크롤 (IntersectionObserver)
 * - 필터 칩: 전체 / 댓글 / 답글 / 좋아요 / 궁금해요 / 운영 (doctor/admin만)
 * - 기간 필터: 전체 / 1일 / 1주 / 1달 (client side)
 * - kind 6종 라벨 (NotificationsBell과 동기화)
 * - 알림 클릭 시 notifications.url 직접 사용 (0071 migration에서 정합된 경로)
 * - 페이지 진입 시 자동 모두 읽음 (단 ask 본인 미답 알림은 mark_my_notifications_read RPC 측에서 제외 — 0080)
 * - 행별 × 버튼 — 개별 읽음 처리 (unread만 노출)
 * - 선택 모드 토글 → 체크박스 + "모두 읽음" 일괄 처리
 */

type Kind = NotificationKind;

type Notification = {
  id: number;
  kind: Kind | string;
  card_id: number | null;
  comment_id: number | null;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_handle: string | null;
  // P2-4 (2026-05-27): get_notifications RPC 반환 alias card_question → card_title.
  card_title: string | null;
  // 4-2 / 3a (0243): message 모드 알림(저장·관심 키워드)의 본문. 그 외 종류는 null 또는 미사용.
  message: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_LABEL = KIND_LONG_LABEL;

type FilterKey = "all" | "comment" | "reply" | "like" | "save" | "keyword" | "follow" | "ops";

const FILTER_KINDS: Record<FilterKey, Kind[] | null> = {
  all: null,
  comment: ["comment"],
  reply: ["reply"],
  like: ["like"],
  save: ["save"],
  keyword: ["keyword"],
  follow: ["follow_post"],
  ops: ["review_request", "published", "report"],
};

type PeriodKey = "all" | "1d" | "7d" | "30d";

const PERIOD_MS: Record<PeriodKey, number | null> = {
  all: null,
  "1d": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

const PAGE_SIZE = 50;

export default function NotificationsClient({
  showOps,
}: {
  showOps: boolean;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  // 상단 2탭(Figma 구조): 활동(기존 실제 알림) / 내 기록(주기·예정 — 현재 더미).
  const [tab, setTab] = useState<"activity" | "records">("activity");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [done, setDone] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  // 1) 초기 + 모두 읽음 처리 (페이지 진입 시 1회)
  //
  // active profile 한 장 기준 (CLAUDE.md 원칙 #1) — 서버 API 경유.
  // 브라우저는 active.profileId (httpOnly cookie) 를 직접 모르므로,
  // 서버 라우트가 idCtx 에서 읽어 RPC 에 명시 전달 (마이그레이션 0168).
  const fetchInitial = useCallback(async (signal?: AbortSignal) => {
    try {
      setFetchError(false);
      const res = await fetch(
        `/api/notifications?offset=0&limit=${PAGE_SIZE}`,
        { cache: "no-store", signal },
      );
      if (!res.ok) {
        setFetchError(true);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { items?: Notification[] };
      const rows = json.items ?? [];
      setItems(rows);
      offsetRef.current = rows.length;
      setDone(rows.length < PAGE_SIZE);
      setLoading(false);

      // 모두 읽음 처리 — 서버가 mark_my_notifications_read 호출 (ask 본인 미답 제외 정책 유지)
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      window.dispatchEvent(new CustomEvent("pibutenten:notifications-read"));
    } catch (e) {
      // AbortError 는 silent — 페이지 unmount 시 발생
      if (e instanceof DOMException && e.name === "AbortError") return;
      setFetchError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void fetchInitial(ac.signal);
    return () => ac.abort();
  }, [fetchInitial]);

  // 2) 더 불러오기
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || done) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(
        `/api/notifications?offset=${offsetRef.current}&limit=${PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        fetchingRef.current = false;
        return;
      }
      const json = (await res.json()) as { items?: Notification[] };
      const rows = json.items ?? [];
      if (rows.length > 0) {
        setItems((prev) => [...prev, ...rows]);
        offsetRef.current += rows.length;
      }
      if (rows.length < PAGE_SIZE) setDone(true);
    } finally {
      fetchingRef.current = false;
    }
  }, [done]);

  // 3) IntersectionObserver — sentinel 보이면 더 불러오기
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // 4) 필터링 (kind + 기간) — client side
  const now = Date.now();
  const periodMs = PERIOD_MS[period];
  const visible = items.filter((n) => {
    const allowed = FILTER_KINDS[filter];
    if (allowed && !allowed.includes(n.kind as Kind)) return false;
    if (periodMs !== null) {
      const age = now - new Date(n.created_at).getTime();
      if (age > periodMs) return false;
    }
    return true;
  });

  // 5) 개별 알림 읽음 처리
  async function readOne(id: number) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, read_at: it.read_at ?? new Date().toISOString() }
            : it,
        ),
      );
      window.dispatchEvent(new CustomEvent("pibutenten:notifications-read"));
    } catch (e) {
      // read API 실패 — 사용자는 UI 상 읽음 처리됐으나 서버 반영 안 됨.
      // 새로고침 시 다시 unread 로 돌아오는 회귀 추적용 기록.
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        console.warn("[notif-read-mark] 개별 read 실패:", e instanceof Error ? e.message : e);
      } else {
        console.error("[notif-read-mark] 개별 read 실패:", e instanceof Error ? e.message : e);
      }
    }
  }

  // 6) 선택한 알림 일괄 읽음
  async function readSelected() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setItems((prev) =>
        prev.map((it) =>
          selected.has(it.id)
            ? { ...it, read_at: it.read_at ?? new Date().toISOString() }
            : it,
        ),
      );
      setSelected(new Set());
      setSelectMode(false);
      window.dispatchEvent(new CustomEvent("pibutenten:notifications-read"));
    } catch (e) {
      // 일괄 read 실패 — UI 상 읽음 처리됐으나 서버 미반영. 회귀 추적용 기록.
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        console.warn("[notif-read-mark] 일괄 read 실패:", e instanceof Error ? e.message : e);
      } else {
        console.error("[notif-read-mark] 일괄 read 실패:", e instanceof Error ? e.message : e);
      }
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const unreadActivity = items.filter((n) => !n.read_at).length;

  return (
    <div>
      {/* 상단 2탭 — 내 기록 / 활동 (Figma 구조) */}
      <div className="mb-4 flex border-b border-[var(--border)]" role="tablist">
        {([
          { id: "records" as const, label: "내 기록" },
          { id: "activity" as const, label: "활동" },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              "relative flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] transition-colors " +
              (tab === t.id ? "font-bold text-[var(--text)]" : "font-normal text-[var(--text-muted)]")
            }
          >
            {t.label}
            {t.id === "activity" && unreadActivity > 0 && (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none " +
                  (tab === "activity" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg-soft)] text-[var(--text-muted)]")
                }
              >
                {unreadActivity}
              </span>
            )}
            {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--primary)]" />}
          </button>
        ))}
      </div>

      {tab === "records" ? (
        <div role="tabpanel">
        <RecordNotis />
        </div>
      ) : (
        <div role="tabpanel">
        <>
      {/* 필터 칩 — kind */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <FilterChip
          label="전체"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label="댓글"
          active={filter === "comment"}
          onClick={() => setFilter("comment")}
        />
        <FilterChip
          label="답글"
          active={filter === "reply"}
          onClick={() => setFilter("reply")}
        />
        <FilterChip
          label="좋아요"
          active={filter === "like"}
          onClick={() => setFilter("like")}
        />
        <FilterChip
          label="저장"
          active={filter === "save"}
          onClick={() => setFilter("save")}
        />
        <FilterChip
          label="관심"
          active={filter === "keyword"}
          onClick={() => setFilter("keyword")}
        />
        <FilterChip
          label="새 글"
          active={filter === "follow"}
          onClick={() => setFilter("follow")}
        />
        {showOps && (
          <FilterChip
            label="운영"
            active={filter === "ops"}
            onClick={() => setFilter("ops")}
          />
        )}
      </div>

      {/* 기간 + 액션 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <PeriodChip label="기간 전체" active={period === "all"} onClick={() => setPeriod("all")} />
          <PeriodChip label="1일" active={period === "1d"} onClick={() => setPeriod("1d")} />
          <PeriodChip label="1주" active={period === "7d"} onClick={() => setPeriod("7d")} />
          <PeriodChip label="1달" active={period === "30d"} onClick={() => setPeriod("30d")} />
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {selectMode ? (
            <>
              <span className="text-[var(--text-muted)]">
                {selected.size}건 선택
              </span>
              <button
                type="button"
                onClick={readSelected}
                disabled={selected.size === 0}
                className="rounded-full bg-[var(--primary)] px-3 py-1 font-semibold text-white disabled:opacity-50"
              >
                모두 읽음
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectMode(false);
                  setSelected(new Set());
                }}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)]"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]"
            >
              선택 모드
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      {fetchError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-gray-500 text-sm">
          <p>알림을 불러오지 못했어요</p>
          <button
            onClick={() => { setFetchError(false); setLoading(true); void fetchInitial(); }}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
          >
            다시 시도
          </button>
        </div>
      ) : loading ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-secondary)]">
          {filter === "all" && period === "all"
            ? "아직 알림이 없어요."
            : "조건에 맞는 알림이 없어요."}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)] bg-white">
          {visible.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              selectMode={selectMode}
              selected={selected.has(n.id)}
              onToggleSelect={() => toggleSelect(n.id)}
              onDismiss={() => readOne(n.id)}
            />
          ))}
        </ul>
      )}

      {/* 무한 스크롤 sentinel */}
      {!done && !loading && (
        <div
          ref={sentinelRef}
          className="py-6 text-center text-xs text-[var(--text-muted)]"
        >
          더 불러오는 중…
        </div>
      )}
        </>
        </div>
      )}
    </div>
  );
}

/* '내 기록' 탭 — 시술 주기·예정·답변 알림. 현재 더미(자리만, 데이터 미생성).
   추후 diaries 주기 계산 + 예약/검수 연동으로 실데이터화 예정. */
const RECORD_NOTIS: {
  tone: "amber" | "primary" | "violet";
  bold: string;
  sub: string;
  time: string;
}[] = [
  { tone: "amber", bold: "스킨부스터 권장 주기가 다가왔어요", sub: "마지막 시술 후 8주", time: "2시간 전" },
  { tone: "primary", bold: "예정된 시술이 5일 남았어요", sub: "쥬베룩 스킨부스터 · 강남 피부과", time: "어제" },
  { tone: "violet", bold: "#리프팅 새로운 전문의 답변이 올라왔어요", sub: "Q. 울쎄라와 써마지, 어떤 차이가 있나요?", time: "3일 전" },
];
const NOTI_TONE: Record<string, { bg: string; fg: string }> = {
  amber: { bg: "#FBEFD9", fg: "#B6790F" },
  primary: { bg: "var(--primary-soft)", fg: "var(--primary-active)" },
  violet: { bg: "#EEE9FB", fg: "#6D54C7" },
};

function RecordNotis() {
  return (
    <div>
      <div className="mx-4 mt-3 mb-2 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">예시</span>
        <span className="text-xs text-gray-400">시술 후기를 남기면 내 기록이 표시됩니다</span>
      </div>
      <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)] bg-white">
        {RECORD_NOTIS.map((n, i) => {
          const t = NOTI_TONE[n.tone];
          return (
            <li key={i} className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: t.bg }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.fg }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-tight font-semibold text-[var(--text)]">{n.bold}</p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{n.sub}</p>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{n.time}</span>
            </li>
          );
        })}
      </ul>
      <a
        href="/review/new"
        className="mx-4 mt-2 mb-4 flex items-center justify-center gap-1 py-3 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium hover:opacity-80 transition-opacity"
      >
        첫 시술 후기 남기기
      </a>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (active
          ? "border-[var(--primary)] bg-[var(--primary)]/80 text-white"
          : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-soft)]")
      }
    >
      {label}
    </button>
  );
}

function PeriodChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors " +
        (active
          ? "border-[var(--text-secondary)] bg-[var(--text-secondary)] text-white"
          : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:bg-[var(--bg-soft)]")
      }
    >
      {label}
    </button>
  );
}

function NotificationRow({
  n,
  selectMode,
  selected,
  onToggleSelect,
  onDismiss,
}: {
  n: Notification;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDismiss: () => void;
}) {
  // 4-2 / 3a: 표시 모드 SSOT. actor=아바타+이름+라벨 / message=본문 그대로 / label=고정 문구.
  const mode =
    (KIND_DISPLAY_MODE as Record<string, "actor" | "message" | "label">)[n.kind] ??
    "label";
  const label = (KIND_LABEL as Record<string, string>)[n.kind] ?? "새 알림";
  // message 모드는 notifications.message 본문, 그 외(label/actor)는 라벨.
  const text = mode === "message" ? n.message ?? label : label;
  const icon = (KIND_ICON as Record<string, string>)[n.kind] ?? "•";
  const actorName = n.actor_display_name ?? "회원";
  const initial = actorName.slice(0, 1);
  const actorHref = n.actor_handle ? `/${n.actor_handle}` : null;
  const target = n.url ?? (n.card_id ? `/?_=${n.card_id}` : "/");
  const time = formatRelativeTime(n.created_at);
  const unread = !n.read_at;
  // actor 모드만 아바타·이름 노출 (기존 comment/reply/like 와 동일 — 무회귀).
  const showActorAvatar = mode === "actor";

  return (
    <li
      className={
        "group relative flex items-center gap-3 px-4 py-3 transition-colors " +
        (selectMode ? "" : "hover:bg-gray-50 ") +
        (unread ? "bg-[var(--primary-soft)]" : "")
      }
    >
      {/* stretched link — 행 전체를 클릭 가능하게 하되 cmd-click, 접근성 유지 */}
      {!selectMode && (
        <Link
          href={target}
          className="absolute inset-0 z-0"
          aria-label={`${showActorAvatar ? actorName + " " : ""}${text}${n.card_title ? " — " + n.card_title : ""}`}
        />
      )}
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="알림 선택"
          className="relative z-10 h-4 w-4 shrink-0 accent-[var(--primary)]"
        />
      )}
      {showActorAvatar && actorHref ? (
        <Link href={actorHref} className="relative z-10 shrink-0">
          <Avatar src={n.actor_avatar_url} initial={initial} />
        </Link>
      ) : showActorAvatar ? (
        <Avatar src={n.actor_avatar_url} initial={initial} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[18px]">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-tight text-[var(--text)]">
          {showActorAvatar && actorHref ? (
            <Link href={actorHref} className="relative z-10 whitespace-nowrap font-semibold hover:underline">
              {actorName}
            </Link>
          ) : showActorAvatar ? (
            <span className="whitespace-nowrap font-semibold">{actorName}</span>
          ) : null}
          {showActorAvatar && <span className="text-[var(--text-secondary)]"> {text}</span>}
          {!showActorAvatar && (
            <span className="font-semibold text-[var(--text)]">{text}</span>
          )}
        </div>
        {n.card_title && (
          <p className="mt-1 truncate text-[12.5px] text-[var(--text-muted)]">
            ↳ {n.card_title}
          </p>
        )}
        <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{time}</div>
      </div>
      {unread && !selectMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          aria-label="이 알림 읽음 처리"
          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] opacity-50 transition hover:bg-white hover:opacity-100"
        >
          ×
        </button>
      )}
    </li>
  );
}

function Avatar({
  src,
  initial,
}: {
  src: string | null;
  initial: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg-soft)] object-cover"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-[14px] font-semibold text-[var(--text-secondary)]">
      {initial}
    </span>
  );
}

