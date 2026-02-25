// src/pages/Gallery/Gallery.tsx
export default function Gallery() {
  return (
    <div className="py-12">
      <div className="container">
        <h1 className="text-4xl font-bold text-center mb-12">Gallery</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    </div>
  )
}
