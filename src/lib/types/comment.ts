/**
 * 댓글 도메인 공유 타입 SSOT (2026-05-28 신설).
 *
 * 옛: src/components/CommentsBlock.tsx + src/app/api/comments/route.ts 가
 *     같은 모양의 Author / CommentRow 타입을 각자 재정의 (드리프트 위험).
 * 현재: 본 모듈을 단일 출처로. 두 곳 모두 여기서 import.
 *
 * 변경 시 주의:
 *   - DB profiles.role CHECK 와 1:1 정합 (admin/doctor/user)
 *   - DB comments.status CHECK 와 1:1 정합 (visible/hidden/deleted)
 *   - DB profiles.doctor_id 가 SSOT (doctor_accounts 매핑 직접 조회 금지 — ADR 0012)
 */

export type CommentStatus = "visible" | "hidden" | "deleted";

export type CommentAuthor = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle?: string | null;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
};

export type CommentRow = {
  id: number;
  card_id: number;
  author_id: string | null;
  parent_id: number | null;
  body: string;
  status: CommentStatus;
  like_count: number;
  created_at: string;
  updated_at: string;
  /** v4 — viewer 가 이 댓글에 좋아요 표시했는지 (server prefetch). */
  viewer_liked?: boolean;
  author: CommentAuthor | null;
};

export type CommentWithReplies = CommentRow & {
  replies: CommentRow[];
};

/**
 * 현재 로그인 사용자(viewer) 의 댓글 권한 판정용 컴팩트 정보.
 *
 *   id        — active profile.id (cookie 'pibutenten:identity', UUID)
 *   role      — active profile 자체의 role (묶음 최고 권한 X — ADR 0012)
 *   doctor_id — active profile 의 의사 매핑 (SSOT: profiles.doctor_id)
 *
 * 댓글 본인 인식 (isAuthor) 도 active == author 일 때만.
 */
export type CommentViewer = {
  id: string;
  role: "admin" | "doctor" | "user";
  doctor_id: string | null;
} | null;
