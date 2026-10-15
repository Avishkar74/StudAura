import { Bookmark, BookmarkCheck } from 'lucide-react'
import { Button } from '@/components/Button'
import { useSetSaved, useVideoSaved } from './queries'

/** Bookmark the video from the workspace (PRD 6.9). Saving is separate from path membership. */
export function SaveToggle({ videoId }: { videoId: string }) {
  const state = useVideoSaved(videoId)
  const set = useSetSaved(videoId)
  const saved = state.data?.saved ?? false
  const Icon = saved ? BookmarkCheck : Bookmark

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        aria-pressed={saved}
        disabled={state.isPending || set.isPending}
        onClick={() => set.mutate(!saved)}
      >
        <Icon className={`mr-2 size-4 ${saved ? 'text-accent' : ''}`} aria-hidden />
        {saved ? 'Saved' : 'Save'}
      </Button>
      {set.isError && (
        <p role="alert" className="text-sm text-warning">
          Couldn&apos;t update your saved videos. Try again.
        </p>
      )}
    </div>
  )
}
