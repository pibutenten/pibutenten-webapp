/**
 * 외부 링크 공유 카드 — Threads/Twitter 스타일.
 *
 * 사용처:
 *  - 의사·회원이 외부 URL 공유 시 자동 카드 생성 (qa.type='link')
 *  - Card 안에 임베드되어 사용
 *
 * SEO:
 *  - 외부 링크는 rel="noopener noreferrer ugc" (사용자 공유 콘텐츠 표시)
 *  - 회원 공유 카드 페이지는 noindex
 */
type Props = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export default function ExternalLinkCard({
  url,
  title,
  description,
  image,
  siteName,
}: Props) {
  let host = siteName ?? "";
  try {
    if (!host) host = new URL(url).hostname;
  } catch {
    /* ignore — siteName 없을 수도 */
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer ugc"
      className="block overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-white transition-colors hover:border-[var(--primary)]"
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={title ?? "외부 링크 미리보기"}
          loading="lazy"
          className="block h-[180px] w-full object-cover"
        />
      )}
      <div className="px-4 py-3">
        {title && (
          <h3 className="mb-1 line-clamp-2 text-[14.5px] font-semibold leading-[1.4] text-[var(--text)]">
            {title}
          </h3>
        )}
        {description && (
          <p className="mb-2 line-clamp-2 text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
          <span>🔗</span>
          <span className="truncate">{host}</span>
        </div>
      </div>
    </a>
  );
}
