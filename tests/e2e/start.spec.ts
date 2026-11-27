import { expect, test } from './fixtures';

test.describe('start page', () => {
  test('lists all three machines', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveTitle(/VOLTRACK/);
    const machines = page.locator('td.machine h2 a');
    await expect(machines).toHaveCount(3);
    await expect(machines).toHaveText([/VOLTRACK Eurorack Modular/, /ACIDLINE BL-1/, /HALCYON VA-8/]);
  });

  test('keyboard shortcuts open a machine', async ({ page }) => {
    await page.goto('./');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/va(\.html)?$/);
    await expect(page.locator('#va-app')).toBeVisible();
  });

  test('shows the build it was deployed from', async ({ page, request }) => {
    const info = await (await request.get('version.json')).json();
    expect(info).toMatchObject({ name: 'voltrack', version: expect.any(String), commit: expect.any(String) });
    await page.goto('./');
    await expect(page.locator('.build')).toContainText(`v${info.version}`);
    await expect(page.locator('.build')).toContainText(String(info.commit).slice(0, 7));
  });
});

test.describe('production server', () => {
  test.skip(!process.env.E2E_EXPECT_HEADERS, 'only meaningful against the nginx image');

  test('sends security headers and sane caching', async ({ request, page }) => {
    const home = await request.get('./');
    expect(home.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(home.headers()['x-content-type-options']).toBe('nosniff');
    expect(home.headers()['x-frame-options']).toBe('DENY');
    expect(home.headers()['cache-control']).toBe('no-cache');
    expect(home.headers()['server']).toBe('nginx'); // no version leak

    await page.goto('./');
    const asset = await page.locator('script[type=module]').first().getAttribute('src');
    const res = await request.get(asset!);
    expect(res.headers()['cache-control']).toContain('immutable');
    expect(res.headers()['content-security-policy']).toBeTruthy();

    expect((await request.get('healthz')).status()).toBe(200);
    expect((await request.get('does-not-exist')).status()).toBe(404);
  });
});
