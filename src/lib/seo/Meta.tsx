// src/lib/seo/Meta.tsx
import { useEffect } from 'react'

interface MetaProps {
  title?: string
  description?: string
  image?: string
  url?: string
}

export default function Meta({
  title = "Sofi's Restaurant - Authentic Cuisine",
  description = 'Enjoy delicious, authentic cuisine made with fresh ingredients',
  image = '/og-image.jpg',
  url = 'https://sofisrestaurant.com',
}: MetaProps) {
  const fullTitle = title.includes("Sofi's")
    ? title
    : `${title} | Sofi's Restaurant`

  useEffect(() => {
    document.title = fullTitle

    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name'
      let tag = document.querySelector(`meta[${attr}="${name}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attr, name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }

    setMeta('description', description)
    setMeta('og:title', fullTitle, true)
    setMeta('og:description', description, true)
    setMeta('og:image', image, true)
    setMeta('og:url', url, true)
    setMeta('og:type', 'website', true)

    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', fullTitle)
    setMeta('twitter:description', description)
    setMeta('twitter:image', image)
  }, [fullTitle, description, image, url])

  return null
}