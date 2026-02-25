export function predictConversion(
  timeOnSite: number,
  pagesViewed: number,
  cartValue: number
): number {
  // Simple conversion prediction model
  let score = 0

  // Time factor
  if (timeOnSite > 120) score += 0.3
  else if (timeOnSite > 60) score += 0.2
  else score += 0.1

  // Pages viewed factor
  if (pagesViewed > 5) score += 0.3
  else if (pagesViewed > 2) score += 0.2
  else score += 0.1

  // Cart value factor
  if (cartValue > 50) score += 0.4
  else if (cartValue > 20) score += 0.3
  else if (cartValue > 0) score += 0.2

  return Math.min(score, 1.0)
}

export function getConversionOptimizationSuggestions(
  score: number
): string[] {
  const suggestions: string[] = []

  if (score < 0.3) {
    suggestions.push('Consider adding a special offer banner')
    suggestions.push('Highlight popular items')
  } else if (score < 0.6) {
    suggestions.push('Show customer reviews')
    suggestions.push('Add free delivery threshold')
  } else {
    suggestions.push('Display limited-time offers')
    suggestions.push('Show related items')
  }

  return suggestions
}