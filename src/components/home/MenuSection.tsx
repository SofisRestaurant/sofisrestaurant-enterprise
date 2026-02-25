// src/components/home/MenuSection.tsx
import { Link } from 'react-router-dom'
import Button from '@/components/ui/Button'

export default function MenuSection() {
  const featuredItems = [
    {
      id: '1',
      name: 'Signature Pizza',
      description: 'Our most popular pizza with fresh ingredients',
      price: 14.99,
      image: null,
    },
    {
      id: '2',
      name: 'Classic Pasta',
      description: 'Homemade pasta with authentic Italian sauce',
      price: 12.99,
      image: null,
    },
    {
      id: '3',
      name: 'Fresh Salad',
      description: 'Garden fresh vegetables with house dressing',
      price: 8.99,
      image: null,
    },
  ]

  return (
    <section className="py-16 bg-gray-50">
      <div className="container">
        <h2 className="text-3xl font-bold text-center mb-12">Featured Menu Items</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {featuredItems.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="h-48 bg-gray-200 flex items-center justify-center">
                <span className="text-gray-400">Menu Item</span>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-2">{item.name}</h3>
                <p className="text-gray-600 mb-4">{item.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-primary-600 font-bold text-xl">
                    ${item.price.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/menu">
            <Button size="lg">View Full Menu</Button>
          </Link>
        </div>
      </div>
    </section>
  )
}