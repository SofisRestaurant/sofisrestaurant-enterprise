export interface SafetyCheck {
  isSafe: boolean
  confidence: number
  reasons: string[]
}

export function checkReviewSafety(text: string): SafetyCheck {
  const reasons: string[] = []
  let confidence = 1.0

  // Check for suspicious patterns
  if (text.includes('http') || text.includes('www.')) {
    reasons.push('Contains external links')
    confidence -= 0.3
  }

  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length
  if (capsRatio > 0.5) {
    reasons.push('Excessive capitalization')
    confidence -= 0.2
  }

  // Check for repeated characters
  if (/(.)\1{4,}/.test(text)) {
    reasons.push('Repeated characters')
    confidence -= 0.2
  }

  return {
    isSafe: confidence > 0.5,
    confidence,
    reasons,
  }
}