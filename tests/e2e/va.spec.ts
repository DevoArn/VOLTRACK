import { expect, powerOn, test } from './fixtures';

test.describe('HALCYON VA-8', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('va.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('plays a three-note chord polyphonically', async ({ page }) => {
    await powerOn(page);
    await page.locator('#lcd-1').click(); // focus the page, not the program menu
    for (const key of ['a', 'd', 'g']) await page.keyboard.down(key);
    await expect(page.locator('#lcd-3')).toContainText('VOICES 3/8', { timeout: 5000 });
    for (const key of ['a', 'd', 'g']) await page.keyboard.up(key);
  });

  test('ships eight programs and loads them', async ({ page }) => {
    await powerOn(page);
    await expect(page.locator('#program option')).toHaveCount(8);
    await page.locator('#program').selectOption('3');
    await expect(page.locator('#lcd-1')).toHaveText('04 Neon Pluck Arp');
    await expect(page.locator('#lcd-2')).toHaveText('PROGRAM LOADED');
  });

  test('editing a knob updates the display', async ({ page }) => {
    await powerOn(page);
    const cutoff = page.locator('.fx-group', { hasText: 'FILTER 1' }).locator('.knob').first();
    await cutoff.dblclick(); // reset to default
    await expect(page.locator('#lcd-2')).toHaveText(/^CUTOFF = /);
  });
});
