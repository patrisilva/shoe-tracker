"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findReviewsNow } from "@/app/actions";
import { ReviewCard, type ReviewLink } from "@/components/ReviewCard";

/**
 * The reviews column.
 *
 * When a shoe has never been searched, the lookup runs from here after first
 * paint instead of during the server render — four sites at up to 7s each
 * would otherwise be sitting in front of the whole page. The shoe's own
 * details are what someone came for; reviews filling in a moment later is a
 * fair trade.
 */
export function ReviewsSection({
  shoeId,
  reviews,
  needsLookup,
}: {
  shoeId: string;
  reviews: ReviewLink[];
  needsLookup: boolean;
}) {
  const [looking, setLooking] = useState(needsLookup);
  const router = useRouter();
  // Effects run twice in dev under StrictMode, and this one makes network
  // calls, so it is guarded rather than merely idempotent.
  const started = useRef(false);

  useEffect(() => {
    if (!needsLookup || started.current) return;
    started.current = true;

    findReviewsNow(shoeId)
      .then(() => router.refresh())
      .finally(() => setLooking(false));
  }, [needsLookup, shoeId, router]);

  if (reviews.length > 0) {
    return (
      <ul className="review-grid is-column">
        {reviews.map((link) => (
          <ReviewCard key={link.id} link={link} />
        ))}
      </ul>
    );
  }

  if (looking) {
    return (
      <ul className="review-grid is-column" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="review-card is-loading">
            <div className="review-shot review-shot-none" />
            <div className="review-body">
              <span className="skeleton-line short" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="empty">
      No reviews found for this pair yet. The sites are checked again each day.
    </p>
  );
}
