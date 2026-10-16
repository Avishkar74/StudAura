import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Needs a test account in the Supabase project the target build uses. Without credentials the
// whole file is skipped (CI never holds a real user's password).
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD for a test account')

async function signIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email ?? '')
  await page.getByLabel('Password').fill(password ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

test('signing in lands on the dashboard', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('navigation').first()).toBeVisible()
})

for (const path of ['/', '/learning-paths', '/goals', '/revision', '/notes', '/library']) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await signIn(page)
    await page.goto(path)
    await page.getByRole('main').waitFor()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    )
    expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.length]))).toEqual([])
  })
}
