import { createContext } from 'react'
import type { UserContextValue } from '@/contexts/userTypes'

export const UserContext = createContext<UserContextValue | undefined>(undefined)
