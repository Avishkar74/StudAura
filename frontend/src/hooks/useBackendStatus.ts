import { useEffect, useState } from 'react'
import { getHealth } from '@/api/health'

export type BackendStatus = 'checking' | 'online' | 'offline'

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then(() => !cancelled && setStatus('online'))
      .catch(() => !cancelled && setStatus('offline'))
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
