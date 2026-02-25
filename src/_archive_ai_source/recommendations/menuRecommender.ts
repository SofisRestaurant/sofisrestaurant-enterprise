import { MenuItem } from '@/types/menu'

export function getRecommendations(
  items: MenuItem[],
  currentItem?: MenuItem
): MenuItem[] {
  // Simple recommendation based on category
  if (currentItem) {
    return items
      .filter((item) => item.category === currentItem.category && item.id !== currentItem.id)
      .slice(0, 3)
  }

  // Return popular items
  return items.slice(0, 6)
}

export function getPersonalizedRecommendations(
  items: MenuItem[],
  orderHistory: string[]
): MenuItem[] {
  // In production, this would use ML to analyze order patterns
  return items.filter((item) => !orderHistory.includes(item.id)).slice(0, 4)
}
