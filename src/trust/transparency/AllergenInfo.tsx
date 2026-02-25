// src/trust/transparency/AllergenInfo.tsx
export default function AllergenInfo() {
  const allergens = [
    'Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soybeans'
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Allergen Information</h2>
      <p className="text-gray-700 mb-4">
        We take food allergies seriously. All menu items are clearly labeled with allergen information.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {allergens.map((allergen) => (
          <div key={allergen} className="text-center p-3 bg-gray-50 rounded">
            <span className="text-sm font-medium">{allergen}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-600 mt-4">
        Please inform your server of any allergies. While we take precautions,
        cross-contamination may occur.
      </p>
    </div>
  )
}