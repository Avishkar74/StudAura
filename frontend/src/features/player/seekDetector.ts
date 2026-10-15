/** A jump bigger than this in one check is a seek, not playback (PRD 7.3). */
export const SEEK_THRESHOLD_SECONDS = 2

/**
 * Tells normal playback from seeking, so a seek to the end can never count as watching the
 * video (CLAUDE.md rule 6; TRD 9.1). Time is passed in so the logic is easy to test.
 *
 * While playing, each reading should be about `elapsed wall time × playback rate` ahead of the
 * last one. While paused or buffering the position should not move at all. Anything further off
 * than the threshold marks the session as seeked. A false alarm only blocks auto-completion; the
 * student can still mark the video completed themselves.
 */
export class SeekDetector {
  private last: { time: number; at: number } | null = null
  private parkedAt: number | null

  /** Whether any seek was seen since the last `reset`. */
  seeked = false

  /** `startTime` is where the video begins before anything has played. */
  constructor(startTime = 0) {
    this.parkedAt = startTime
  }

  /** Playback is not running (paused, buffering, cued). Remember where it stopped. */
  park(time: number) {
    this.last = null
    this.parkedAt = time
  }

  /** The student moved the playhead on purpose through our own UI (Resume, Start over). */
  moveTo(time: number) {
    if (this.last) this.last = { time, at: this.last.at }
    else this.parkedAt = time
  }

  /** Playback is running at `time`. */
  play(time: number, now: number) {
    if (this.parkedAt !== null && Math.abs(time - this.parkedAt) > SEEK_THRESHOLD_SECONDS) {
      this.seeked = true
    }
    this.parkedAt = null
    this.last = { time, at: now }
  }

  /** A periodic reading while playing. */
  observe(time: number, now: number, rate = 1) {
    if (this.last) {
      const expected = ((now - this.last.at) / 1000) * rate
      if (Math.abs(time - this.last.time - expected) > SEEK_THRESHOLD_SECONDS) this.seeked = true
    }
    this.last = { time, at: now }
  }

  /** Start a new viewing session from `time` (after the video ended). */
  reset(time = 0) {
    this.seeked = false
    this.last = null
    this.parkedAt = time
  }
}
