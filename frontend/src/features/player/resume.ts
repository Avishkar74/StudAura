/** Shortest saved position worth offering to resume from. */
export const MIN_RESUME_SECONDS = 10
/** Positions this close to the end are treated as "finished": there is nothing to resume. */
export const END_MARGIN_SECONDS = 10

/**
 * Whether to ask "Resume from 18:32?". A position near the start or the very end is not
 * meaningful, so the video simply opens from the beginning.
 */
export function shouldOfferResume(position: number, durationSeconds: number | null): boolean {
  if (!Number.isFinite(position) || position < MIN_RESUME_SECONDS) return false
  if (durationSeconds && position > durationSeconds - END_MARGIN_SECONDS) return false
  return true
}
