// src/pages/Reviews/Reviews.tsx
export default function Reviews() {
  return (
    <div className="py-12">
      <div className="container max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Customer Reviews</h1>
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center gap-2 mb-2">
                {[...Array(5)].map((_, j) => (
                  <span key={j} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-700 mb-2">Amazing food and excellent service! Highly recommended.</p>
              <p className="text-sm text-gray-500">- Customer {i}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}