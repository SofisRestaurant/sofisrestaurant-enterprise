// src/pages/Catering/Catering.tsx
export default function Catering() {
  return (
    <div className="py-12">
      <div className="container max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Catering Services</h1>
        <p className="text-lg mb-6">Let us make your next event unforgettable with our professional catering services.</p>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2">Corporate Events</h3>
            <p className="text-gray-600">Professional catering for business meetings and conferences</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2">Weddings</h3>
            <p className="text-gray-600">Make your special day even more memorable</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2">Private Parties</h3>
            <p className="text-gray-600">Celebrate with friends and family in style</p>
          </div>
        </div>
      </div>
    </div>
  )
}