import { createContext, useContext } from 'react'

export interface ShellActions {
  openCreatePath: () => void
  openAddVideo: (defaultPathId?: string) => void
  openImportPlaylist: (defaultPathId?: string) => void
}

export const ShellContext = createContext<ShellActions | null>(null)

/** Actions that open the app-level dialogs (create path, add video) from anywhere in the shell. */
export function useShell(): ShellActions {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside <AppShell>')
  return ctx
}
