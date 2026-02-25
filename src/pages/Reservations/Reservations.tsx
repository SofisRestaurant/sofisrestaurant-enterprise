// src/pages/Reservations/Reservations.tsx
export default function Reservations() {
  return (
    <div className="py-12">
      <div className="container max-w-2xl">
        <h1 className="text-4xl font-bold mb-8">Make a Reservation</h1>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <form className="space-y-4">
            <input type="text" placeholder="Name" className="w-full px-4 py-2 border rounded-lg" />
            <input type="email" placeholder="Email" className="w-full px-4 py-2 border rounded-lg" />
            <input type="tel" placeholder="Phone" className="w-full px-4 py-2 border rounded-lg" />
            <input type="date" className="w-full px-4 py-2 border rounded-lg" />
            <input type="time" className="w-full px-4 py-2 border rounded-lg" />
            <select className="w-full px-4 py-2 border rounded-lg">
              <option>2 guests</option>
              <option>4 guests</option>
              <option>6 guests</option>
              <option>8+ guests</option>
            </select>
            <button type="submit" className="btn btn-primary w-full">Reserve Table</button>
          </form>
        </div>
      </div>
    </div>
  )
}