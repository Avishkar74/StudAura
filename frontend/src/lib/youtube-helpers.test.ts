import { describe, expect, it } from 'vitest'
import type { PathVideo } from '@/api/types'
import { pickContinueTarget } from '@/features/learning-paths/continue'
import { shouldOfferResume } from '@/features/player/resume'
import { formatTimestamp } from './time'

function video(over: Partial<PathVideo> & { id: string }): PathVideo {
  const { id, ...rest } = over
  return {
    position: 1,
    video: {
      id,
      youtube_video_id: id,
      title: id,
      channel_title: null,
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    learning_status: 'NOT_STARTED',
    last_position_seconds: 0,
    playback_pct: 0,
    ever_completed_at: null,
    last_watched_at: null,
    ...rest,
  }
}

describe('formatTimestamp', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [750, '12:30'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725.9, '1:02:05'],
    [-3, '0:00'],
  ])('%s -> %s', (seconds, expected) => {
    expect(formatTimestamp(seconds)).toBe(expected)
  })
})

describe('shouldOfferResume', () => {
  it.each([
    [0, 600, false],
    [9.9, 600, false],
    [10, 600, true],
    [300, 600, true],
    [590, 600, true],
    [591, 600, false], // within ten seconds of the end
    [600, 600, false],
    [300, null, true], // unknown duration: only the start check applies
    [Number.NaN, 600, false],
  ])('position %s of %s -> %s', (position, duration, expected) => {
    expect(shouldOfferResume(position, duration)).toBe(expected)
  })
})

describe('pickContinueTarget', () => {
  const DONE = {
    learning_status: 'COMPLETED',
    ever_completed_at: '2026-10-01T00:00:00Z',
  } as const

  it('is null for an empty path', () => {
    expect(pickContinueTarget([])).toBeNull()
  })

  it('prefers the most recently watched in-progress video', () => {
    const target = pickContinueTarget([
      video({
        id: 'a',
        learning_status: 'IN_PROGRESS',
        last_watched_at: '2026-10-10T10:00:00Z',
      }),
      video({
        id: 'b',
        learning_status: 'IN_PROGRESS',
        last_watched_at: '2026-10-14T10:00:00Z',
      }),
      video({ id: 'c' }),
    ])
    expect(target).toMatchObject({
      label: 'Continue Learning',
      video: { video: { id: 'b' } },
    })
  })

  it('otherwise opens the first video that is not completed, in path order', () => {
    const target = pickContinueTarget([
      video({ id: 'a', ...DONE }),
      video({ id: 'b' }),
      video({ id: 'c' }),
    ])
    expect(target).toMatchObject({
      label: 'Continue Learning',
      video: { video: { id: 'b' } },
    })
  })

  it('treats a video flagged for revision as already completed once', () => {
    const target = pickContinueTarget([
      video({
        id: 'a',
        learning_status: 'NEEDS_REVISION',
        ever_completed_at: '2026-10-01T00:00:00Z',
      }),
      video({ id: 'b' }),
    ])
    expect(target?.video.video.id).toBe('b')
  })

  it('offers a review of the first video when everything is completed', () => {
    const target = pickContinueTarget([video({ id: 'a', ...DONE }), video({ id: 'b', ...DONE })])
    expect(target).toMatchObject({
      label: 'Review Completed Videos',
      video: { video: { id: 'a' } },
    })
  })
})
