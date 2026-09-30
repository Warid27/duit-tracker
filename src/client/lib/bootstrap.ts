// Shared bootstrap query (spec 8.1): one call returns wallets, categories, tags, totals & recent txs.
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BootstrapData } from '@/lib/types'

export function useBootstrap() {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => api.get<BootstrapData>('/bootstrap'),
    staleTime: 30_000,
  })
}
