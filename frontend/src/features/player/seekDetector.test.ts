import { describe, expect, it } from 'vitest'
import { SeekDetector } from './seekDetector'

const S = 1000 // ms

describe('SeekDetector', () => {
  it('sees nothing wrong with ordinary playback', () => {
    const d = new SeekDetector()
    d.play(0, 0)
    for (let i = 1; i <= 60; i++) d.observe(i, i * S)
    expect(d.seeked).toBe(false)
  })

  it('allows for playback speed', () => {
    const d = new SeekDetector()
    d.play(0, 0)
    for (let i = 1; i <= 30; i++) d.observe(i * 2, i * S, 2)
    expect(d.seeked).toBe(false)
  })

  it('allows for a throttled timer (a background tab) when the video kept playing', () => {
    const d = new SeekDetector()
    d.play(0, 0)
    d.observe(30, 30 * S) // the timer was asleep for 30 s but playback carried on
    expect(d.seeked).toBe(false)
  })

  it.each([
    ['forward', 120],
    ['backward', 5],
  ])('catches a seek %s while playing', (_name, to) => {
    const d = new SeekDetector(60)
    d.play(60, 0)
    d.observe(61, S)
    d.observe(to, 2 * S)
    expect(d.seeked).toBe(true)
  })

  it('catches a seek made while paused', () => {
    const d = new SeekDetector(10)
    d.play(10, 0)
    d.park(11)
    d.play(500, 60 * S)
    expect(d.seeked).toBe(true)
  })

  it('does not mistake a pause or a long buffering stall for a seek', () => {
    const d = new SeekDetector(10)
    d.play(10, 0)
    d.park(11)
    d.play(11.2, 90 * S)
    d.observe(12.2, 91 * S)
    expect(d.seeked).toBe(false)
  })

  it('catches a seek made before the first play', () => {
    const d = new SeekDetector()
    d.play(580, 0) // dragged the bar to near the end, then pressed play
    expect(d.seeked).toBe(true)
  })

  it('does not count Resume or Start over as a seek', () => {
    const d = new SeekDetector()
    d.moveTo(1500) // Resume from 25:00
    d.play(1500, 0)
    d.observe(1501, S)
    expect(d.seeked).toBe(false)
  })

  it('catches a jump to the end reported only by the ENDED event', () => {
    const d = new SeekDetector()
    d.play(1, 0)
    d.observe(600, 500)
    expect(d.seeked).toBe(true)
  })

  it('starts clean after a reset', () => {
    const d = new SeekDetector()
    d.play(0, 0)
    d.observe(300, S)
    d.reset()
    d.play(0, 10 * S)
    d.observe(1, 11 * S)
    expect(d.seeked).toBe(false)
  })
})
