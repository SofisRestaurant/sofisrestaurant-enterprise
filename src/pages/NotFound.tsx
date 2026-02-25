// src/pages/NotFound.tsx
export default function NotFound() {
  return (
    <div className="py-12">
      <div className="container max-w-2xl text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-700 mb-6">Page not found</p>
        <a href="/" className="btn btn-primary">Go Home</a>
      </div>
    </div>
  )
}