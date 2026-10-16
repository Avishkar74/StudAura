import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('landing page', () => {
  test('shows the pitch and leads to sign up and sign in', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /learning you actually finish/i }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Start learning free' }).first().click()
    await expect(page).toHaveURL(/\/signup$/)
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('the skip link and the FAQ work from the keyboard', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    const question = page.getByText('Is StudAura free?')
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Create an account with an email address/)).toBeVisible()
  })

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    )
    expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.length]))).toEqual([])
  })
})
