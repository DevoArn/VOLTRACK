import { expect, powerOn, test } from './fixtures';

test.describe('VOLTRACK Eurorack modular', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('modular.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('loads the default patch into the case', async ({ page }) => {
    await powerOn(page);
    await expect(page.locator('.module')).toHaveCount(13);
    await expect(page.locator('svg.cables g.cable')).toHaveCount(18);
    await expect(page.locator('.case-row')).toHaveCount(3);
  });

  test('every panel fits inside its 3U height', async ({ page }) => {
    await powerOn(page);
    // rack one of every module type
    const buttons = page.locator('.mod-btn');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) await buttons.nth(i).click();
    await expect(page.locator('.module')).toHaveCount(13 + n);
    const overflowing = await page.$$eval('.module', (mods) =>
      mods
        .filter((m) => {
          const b = m.querySelector('.module-body') as HTMLElement;
          return b.scrollHeight > b.clientHeight || b.scrollWidth > b.clientWidth;
        })
        .map((m) => (m as HTMLElement).dataset.type),
    );
    expect(overflowing).toEqual([]);
  });

  test('switching presets rebuilds the rack', async ({ page }) => {
    await powerOn(page);
    await page.locator('#preset').selectOption({ label: 'Dual-VCO Keys' });
    await expect(page.locator('.module')).toHaveCount(12);
    await expect(page.locator('svg.cables g.cable')).toHaveCount(16);
  });

  test('right-clicking a jack unplugs its cables', async ({ page }) => {
    await powerOn(page);
    const jack = page.locator('.module[data-type="vco"] .jack[data-port="saw"]');
    await jack.click({ button: 'right' });
    await expect(page.locator('svg.cables g.cable')).toHaveCount(17);
  });

  test('tooltips appear after hovering for one second', async ({ page }) => {
    await powerOn(page);
    await page.locator('.module[data-type="vcf"] .knob').first().hover();
    await page.waitForTimeout(400);
    await expect(page.locator('.tooltip')).toBeHidden();
    await expect(page.locator('.tooltip')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.tooltip .tip-head')).toContainText('CUTOFF');
  });
});
