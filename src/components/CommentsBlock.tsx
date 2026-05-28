/**
 * 2026-05-28: 본 파일은 폴더 분해 후 호환성 re-export 만 남김.
 *
 * 옛 단일 파일 (863줄) 을 src/components/comments/ 하위 3개 파일로 분리:
 *   - comments/CommentForm.tsx  (입력 폼, 148줄)
 *   - comments/CommentItem.tsx  (댓글 1개, 365줄)
 *   - comments/CommentsBlock.tsx (root, 320줄)
 *
 * 도메인 타입은 src/lib/types/comment.ts (SSOT).
 *
 * 외부 호출자가 `@/components/CommentsBlock` 으로 import 하던 경로 호환성 유지.
 * 신규 코드는 가능한 `@/components/comments/CommentsBlock` 직접 사용 권장.
 */

export { default } from "./comments/CommentsBlock";
