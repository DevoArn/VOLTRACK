import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test fails if the page logs a console error or throws — this also catches
 * Content-Security-Policy violations when running against the nginx container.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Click POWER ON and wait for the audio engine to be running. */
export async function powerOn(page: Page): Promise<void> {
  await page.locator('#btn-power-big').click();
  await expect(page.locator('#power-overlay')).toBeHidden();
  await expect(page.locator('#btn-power')).toHaveClass(/on/);
}
