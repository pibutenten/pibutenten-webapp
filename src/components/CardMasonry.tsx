"use client";

import Masonry from "react-masonry-css";
import Card, { type CardDataList } from "./Card";

/**
 * 정적 카드 리스트용 Masonry 래퍼.
 *
 * 메인 피드(Feed.tsx)는 무한스크롤·viewer state 등 무거운 상태를 가지지만,
 * tags / search 같은 단순 목록은 그것들이 필요 없음. 이 컴포넌트는 단순히
 * Card 배열을 받아 메인 피드와 동일한 2단/1단 masonry로 렌더한다.
 */
export default function CardMasonry({
  posts,
  doctorSlug,
}: {
  posts: CardDataList[];
  doctorSlug?: string | null;
}) {
  return (
    <Masonry
      breakpointCols={{ default: 2, 899: 1 }}
      className="feed-masonry"
      columnClassName="feed-masonry__col"
    >
      {posts.map((card) => (
        <Card key={card.id} card={card} boostDoctorSlug={doctorSlug ?? undefined} />
      ))}
    </Masonry>
  );
}
