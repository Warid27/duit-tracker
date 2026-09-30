// Global client state: session user + toasts. No auth tokens in localStorage (httpOnly cookie only).
import { createContext, useContext } from 'react'
import type { SessionUser } from './types'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

export interface AppContextValue {
  user: SessionUser | null
  setUser: (u: SessionUser | null) => void
  toasts: Toast[]
  pushToast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void
}

export const AppContext = createContext<AppContextValue>({
  user: null,
  setUser: () => {},
  toasts: [],
  pushToast: () => {},
  dismissToast: () => {},
})

export function useApp(): AppContextValue {
  return useContext(AppContext)
}
