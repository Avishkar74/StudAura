import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toastContext'

function Trigger({ message, kind }: { message: string; kind?: 'success' | 'error' | 'info' }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(message, kind)}>
      show {message}
    </button>
  )
}

function renderToasts(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('announces a message politely and then goes away by itself', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderToasts(<Trigger message="Saved" />)
    await user.click(screen.getByRole('button', { name: 'show Saved' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    )
    act(() => void vi.advanceTimersByTime(4500))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('keeps an error on screen longer and announces it as an alert', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderToasts(<Trigger message="Failed" kind="error" />)
    await user.click(screen.getByRole('button', { name: 'show Failed' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    act(() => void vi.advanceTimersByTime(4500))
    expect(screen.getByText('Failed')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(3000))
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })

  it('can be dismissed with its button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderToasts(<Trigger message="Closable" />)
    await user.click(screen.getByRole('button', { name: 'show Closable' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Closable')).not.toBeInTheDocument()
  })

  it('shows only the latest few at a time', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderToasts(
      <>
        {['one', 'two', 'three', 'four', 'five'].map((m) => (
          <Trigger key={m} message={m} />
        ))}
      </>,
    )
    for (const m of ['one', 'two', 'three', 'four', 'five']) {
      await user.click(screen.getByRole('button', { name: `show ${m}` }))
    }
    expect(screen.queryByText('one')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(4)
  })

  it('does nothing when there is no provider', async () => {
    const user = userEvent.setup()
    render(<Trigger message="Quiet" />)
    await user.click(screen.getByRole('button', { name: 'show Quiet' }))
    expect(screen.queryByText('Quiet')).not.toBeInTheDocument()
  })
})
