import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('signed out', () => {
  test('a private page sends you to the sign-in form', async ({ page }) => {
    await page.goto('/goals')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('the sign-in form can be filled and reached by keyboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').focus()
    await page.keyboard.type('someone@example.test')
    await page.keyboard.press('Tab')
    await page.keyboard.type('not-a-real-password')
    const submit = page.getByRole('button', { name: 'Sign in' })
    await expect(submit).toBeEnabled()
    await page.keyboard.press('Tab')
    await expect(submit).toBeFocused()
  })

  test('the sign-in and sign-up pages link to each other', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL(/\/signup$/)
  })

  for (const path of ['/login', '/signup']) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path)
      await page.getByRole('heading').first().waitFor()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      )
      expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.length]))).toEqual([])
    })
  }
})

test('the API answers its probes through the same origin', async ({ request }) => {
  test.skip(
    !process.env.E2E_DEPLOYED,
    'needs a deployed stack (a static preview has no /health and no API)',
  )
  expect((await request.get('/health')).status()).toBe(200)
  // Auth is enforced: no token, no data.
  expect((await request.get('/api/v1/me')).status()).toBe(401)
})
