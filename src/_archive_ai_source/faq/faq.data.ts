// src/ai/faq/faq.data.ts
export interface FAQItem {
  id: string
  question: string
  answer: string
  category: string
}

export const faqData: FAQItem[] = [
  {
    id: '1',
    question: 'What are your hours of operation?',
    answer: 'We are open Monday-Thursday 11am-10pm, Friday-Saturday 11am-11pm, and Sunday 10am-9pm.',
    category: 'General',
  },
  {
    id: '2',
    question: 'Do you offer delivery?',
    answer: 'Yes! We offer delivery through Uber Eats, DoorDash, and Grubhub.',
    category: 'Ordering',
  },
  {
    id: '3',
    question: 'Do you have vegetarian options?',
    answer: 'Absolutely! We have many vegetarian and vegan options clearly marked on our menu.',
    category: 'Menu',
  },
]