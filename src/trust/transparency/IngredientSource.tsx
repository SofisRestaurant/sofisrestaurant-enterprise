// src/trust/transparency/IngredientSource.tsx
export default function IngredientSource() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Our Ingredients</h2>
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Local Partners</h3>
          <p className="text-gray-700">
            We source from local farms and suppliers whenever possible to ensure freshness
            and support our community.
          </p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Quality Standards</h3>
          <p className="text-gray-700">
            All ingredients meet our strict quality standards. We use organic produce when
            available and never use artificial preservatives.
          </p>
        </div>
      </div>
    </div>
  )
}