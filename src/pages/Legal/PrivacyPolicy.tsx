// src/pages/Legal/PrivacyPolicy.tsx
export default function PrivacyPolicy() {
  return (
    <div className="py-12">
      <div className="container max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose max-w-none">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-2xl font-bold mt-6 mb-4">Information We Collect</h2>
          <p className="text-gray-700">We collect information necessary to process your orders and improve our services.</p>
        </div>
      </div>
    </div>
  )
}