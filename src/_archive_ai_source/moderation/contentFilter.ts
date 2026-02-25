const PROFANITY_LIST = ['spam', 'offensive', 'inappropriate']

interface FilterResult {
  filtered: string
  hasProfanity: boolean
}

export function filterContent(text: string): FilterResult {
  let filtered = text
  let hasProfanity = false

  PROFANITY_LIST.forEach((word) => {
    const regex = new RegExp(word, 'gi')
    if (regex.test(filtered)) {
      hasProfanity = true
      filtered = filtered.replace(regex, '***')
    }
  })

  return { filtered, hasProfanity }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateReviewContent(content: string): ValidationResult {
  const errors: string[] = []

  if (content.length < 10) {
    errors.push('Review must be at least 10 characters')
  }

  if (content.length > 1000) {
    errors.push('Review must be less than 1000 characters')
  }

  const { hasProfanity } = filterContent(content)
  if (hasProfanity) {
    errors.push('Review contains inappropriate content')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}