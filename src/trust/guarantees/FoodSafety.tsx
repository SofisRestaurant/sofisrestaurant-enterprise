// src/trust/guarantees/FoodSafety.tsx
export default function FoodSafety() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Food Safety Commitment</h2>
      <ul className="space-y-3">
        <li className="flex items-start gap-2">
          <svg className="w-6 h-6 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>ServSafe certified kitchen staff</span>
        </li>
        <li className="flex items-start gap-2">
          <svg className="w-6 h-6 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Daily health and safety inspections</span>
        </li>
        <li className="flex items-start gap-2">
          <svg className="w-6 h-6 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Fresh ingredients sourced daily</span>
        </li>
        <li className="flex items-start gap-2">
          <svg className="w-6 h-6 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Strict allergen protocols</span>
        </li>
      </ul>
    </div>
  )
}