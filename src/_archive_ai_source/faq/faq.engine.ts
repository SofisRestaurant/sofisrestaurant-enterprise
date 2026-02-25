import { faqData, FAQItem } from './faq.data'

export function searchFAQ(query: string): FAQItem[] {
  const lowerQuery = query.toLowerCase()
  return faqData.filter(
    (item) =>
      item.question.toLowerCase().includes(lowerQuery) ||
      item.answer.toLowerCase().includes(lowerQuery)
  )
}

export function getFAQByCategory(category: string): FAQItem[] {
  return faqData.filter((item) => item.category === category)
}

export function getAllCategories(): string[] {
  const categories = new Set(faqData.map((item) => item.category))
  return Array.from(categories)
}
