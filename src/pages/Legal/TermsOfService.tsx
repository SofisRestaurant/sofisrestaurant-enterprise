// src/pages/Legal/TermsOfService.tsx
export default function TermsOfService() {
  return (
    <div className="py-12">
      <div className="container max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="prose max-w-none">
          <p>Last updated: {new Date().toLocaleDateString()}</p>
          <h2 className="text-2xl font-bold mt-6 mb-4">Acceptance of Terms</h2>
          <p className="text-gray-700">By using our services, you agree to these terms.</p>
        </div>
      </div>
    </div>
  )
}