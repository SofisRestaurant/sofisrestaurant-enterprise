// src/pages/Reviews/Reviews.tsx

const REVIEW_IDS = ['review-1', 'review-2', 'review-3'] as const;
const STAR_IDS = ['star-1', 'star-2', 'star-3', 'star-4', 'star-5'] as const;

export default function Reviews() {
  return (
    <div className="py-12">
      <div className="container max-w-4xl">
        <h1 className="mb-8 text-4xl font-bold">Customer Reviews</h1>

        <div className="space-y-6">
          {REVIEW_IDS.map((reviewId, reviewIndex) => (
            <div key={reviewId} className="rounded-lg bg-white p-6 shadow">
              <div className="mb-2 flex items-center gap-2" aria-label="5 out of 5 stars">
                {STAR_IDS.map((starId) => (
                  <span
                    key={`${reviewId}-${starId}`}
                    className="text-yellow-400"
                    aria-hidden="true"
                  >
                    ★
                  </span>
                ))}
              </div>

              <p className="mb-2 text-gray-700">
                Amazing food and excellent service! Highly recommended.
              </p>

              <p className="text-sm text-gray-500">- Customer {reviewIndex + 1}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}