import { expect, powerOn, test } from './fixtures';

test.describe('ACIDLINE BL-1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('acid.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('power on starts the sequencer and the playhead moves', async ({ page }) => {
    await powerOn(page);
    await expect(page.locator('#play')).toHaveText(/STOP/);
    const status = page.locator('#status');
    const first = await status.textContent();
    await expect.poll(async () => status.textContent(), { timeout: 5000 }).not.toBe(first);
    await expect(status).toContainText('PAT A');
  });

  test('clicking a grid cell toggles a note', async ({ page }) => {
    await powerOn(page);
    await page.locator('#clear').click();
    await expect(page.locator('.note-cell.on')).toHaveCount(0);
    await page.locator('.note-cell').nth(5).click();
    await expect(page.locator('.note-cell.on')).toHaveCount(1);
    await page.locator('.note-cell').nth(5).click();
    await expect(page.locator('.note-cell.on')).toHaveCount(0);
  });

  test('post-effects chain has five stages with on/off switches', async ({ page }) => {
    await powerOn(page); // the power dialog blocks the panel until the engine starts
    await expect(page.locator('.fx-group')).toHaveCount(5);
    await expect(page.locator('.fx-group .group-label .toggle')).toHaveCount(4);
    const dist = page.locator('.fx-group', { hasText: 'DISTORTION' });
    await dist.locator('.switch').first().click(); // OVERDRIVE → TUBE
    await expect(dist.locator('.switch .lcd').first()).toHaveText('TUBE');
  });
});
