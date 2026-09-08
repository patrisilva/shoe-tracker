import { sourceName } from "@/lib/links";
import { formatDate } from "@/lib/shoe";

function NoShotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L3 19" />
    </svg>
  );
}

export type ReviewLink = {
  id: string;
  title: string;
  source: string;
  url: string;
  imageUrl: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
};

/**
 * One review, as a card.
 *
 * Everything below the source line is optional: until an article has been
 * matched for the shoe, the link still points at the site's own search and
 * there is no image or excerpt to show. The card is built so that state reads
 * as "not found yet" rather than as a broken image frame.
 */
export function ReviewCard({ link }: { link: ReviewLink }) {
  const hasArticle = Boolean(link.excerpt || link.imageUrl);

  return (
    <li className="review-card">
      <div className={`review-shot${link.imageUrl ? "" : " review-shot-none"}`}>
        {link.imageUrl ? (
          /* Remote editorial images from many hosts, so plain <img> rather
             than next/image — no loader config can cover them all. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.imageUrl} alt="" loading="lazy" />
        ) : (
          <NoShotIcon />
        )}
      </div>

      <div className="review-body">
        <span className="review-source">
          {sourceName(link.source)}
          {link.publishedAt && ` · ${formatDate(link.publishedAt)}`}
        </span>

        <span className="review-title">{link.title}</span>

        {link.excerpt && <p className="review-excerpt">{link.excerpt}</p>}

        <a
          className="review-more"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {hasArticle ? "Read the review" : "Search this site"}
        </a>
      </div>
    </li>
  );
}
