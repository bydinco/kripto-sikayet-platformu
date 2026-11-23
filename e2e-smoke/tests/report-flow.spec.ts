import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test, expect, watchPage } from '../fixtures';
import { tr } from '../../apps/web/src/dictionaries/tr';

const API_ORIGIN = 'http://localhost:3001';
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

const jpgBuffer = readFileSync(resolve(fixturesDir, 'photo.jpg'));
const jpegBuffer = readFileSync(resolve(fixturesDir, 'photo.jpeg'));
const pngBuffer = readFileSync(resolve(fixturesDir, 'photo.png'));

test('full report lifecycle: submit with evidence (incl. .jpg/.jpeg/.JPG/.png) -> moderator publishes -> public view -> unapproved file 404s', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const authorEmail = `smoke-report-${unique}@example.com`;
  const reportTitle = `Smoke test report ${unique}`;

  await test.step('register a fresh author and submit a report with text + image evidence', async () => {
    await page.goto('/tr/register');
    await page.getByLabel(tr.auth.handleLabel).fill(`smoke_rep_${unique.replace(/[^a-z0-9]/gi, '')}`);
    await page.getByLabel(tr.auth.emailLabel).fill(authorEmail);
    await page.getByLabel(tr.auth.passwordLabel).fill('SmokePass123!');
    await page.getByRole('button', { name: tr.auth.submitRegister }).click();
    await expect(page).toHaveURL(/\/tr\/?$/);

    await page.goto('/tr/reports/new');

    // Varlık ara → seç.
    await page.getByLabel(tr.reportForm.entityLabel).fill('Demo');
    await page.getByRole('button', { name: /Demo Coin A/ }).click();
    await expect(page.getByLabel(tr.reportForm.entityLabel)).toHaveValue('Demo Coin A');

    await page.getByLabel(tr.reportForm.titleLabel).fill(reportTitle);
    await page.getByLabel(tr.reportForm.bodyLabel).fill('Smoke test tarafından otomatik oluşturulan şikayet açıklaması.');

    // Kanıt ekle (metin/link kanıtı).
    await page.getByRole('button', { name: tr.reportForm.addEvidence }).click();
    await page.getByPlaceholder(tr.reportForm.evidenceValueLabel).fill('https://example.com/smoke-evidence');

    // Dosya kanıtı: .jpg, .jpeg, .JPG (büyük harf), .png — bir seferde.
    await page.locator('#evidence-files').setInputFiles([
      { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpgBuffer },
      { name: 'photo.jpeg', mimeType: 'image/jpeg', buffer: jpegBuffer },
      { name: 'PHOTO.JPG', mimeType: 'image/jpeg', buffer: jpgBuffer },
      { name: 'photo.png', mimeType: 'image/png', buffer: pngBuffer },
    ]);
    await expect(page.getByText('photo.jpg', { exact: true })).toBeVisible();
    await expect(page.getByText('photo.jpeg', { exact: true })).toBeVisible();
    await expect(page.getByText('PHOTO.JPG', { exact: true })).toBeVisible();
    await expect(page.getByText('photo.png', { exact: true })).toBeVisible();

    await page.getByLabel(tr.reportForm.consentLabel).check();
    await page.getByRole('button', { name: tr.reportForm.submit }).click();

    await expect(page.getByText(tr.reportForm.success)).toBeVisible();
    // No per-file retry button means every upload actually succeeded —
    // a file error wouldn't fail report creation, so this is the real check.
    await expect(page.getByRole('button', { name: tr.reportForm.fileRetry })).toHaveCount(0);
  });

  // The success view swaps in client-side (no router.push), so page.url()
  // is still "/tr/reports/new" here — the report id only ever comes from
  // the "view report" link's own href, e.g. "/tr/reports/<id>".
  const reportHref = await page.getByRole('link', { name: tr.reportForm.viewReport }).getAttribute('href');
  if (!reportHref) throw new Error('Could not resolve the created report URL from the success screen.');
  const reportId = reportHref.split('/').filter(Boolean).pop()!;
  expect(reportId).toBeTruthy();

  await test.step('moderator reviews and publishes the report, then rejects one file evidence', async () => {
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    const assertModClean = watchPage(modPage);
    try {
      await modPage.goto('/tr/login');
      await modPage.getByLabel(tr.auth.emailLabel).fill('demo-moderator@example.com');
      await modPage.getByLabel(tr.auth.passwordLabel).fill('DemoPass123!');
      await modPage.getByRole('button', { name: tr.auth.submitLogin }).click();
      await expect(modPage.getByRole('link', { name: tr.admin.nav.reports })).toBeVisible();

      await modPage.goto(`/tr/admin/reports/${reportId}`);
      await expect(modPage.getByRole('heading', { name: reportTitle })).toBeVisible();

      await modPage.locator('select').selectOption({ label: tr.statuses.PUBLISHED });
      await modPage.locator('#reason').fill('Smoke test onayı');
      await modPage.getByRole('button', { name: tr.admin.reportDetail.submitTransition }).click();
      await expect(modPage.getByText(tr.statuses.PUBLISHED).first()).toBeVisible();

      // Reject exactly one of the uploaded screenshots — the only real way
      // to get an unapproved SCREENSHOT evidence in this app (file evidence
      // can't be added post-publication at all, so it's always approved at
      // creation; only a moderator un-approving it afterwards produces this
      // state). This is what "onaysız dosya 404" is checked against below.
      // The PATCH response itself is the real confirmation — not a
      // post-reload DOM check, since the evidence list has no stable
      // ordering guarantee across the reload that follows.
      const fileRow = modPage.locator('.card.row', { has: modPage.locator('img') }).first();
      await expect(fileRow).toBeVisible();
      const [patchResponse] = await Promise.all([
        modPage.waitForResponse((res) => /\/evidence\/[^/]+$/.test(res.url()) && res.request().method() === 'PATCH'),
        fileRow.getByRole('button', { name: tr.admin.reportDetail.rejectButton }).click(),
      ]);
      expect(patchResponse.ok()).toBeTruthy();
    } finally {
      assertModClean();
      await modContext.close();
    }
  });

  let unapprovedFileEvidenceId = '';
  await test.step('confirm exactly one SCREENSHOT evidence is now unapproved (via the API, for the 404 check below)', async () => {
    const loginRes = await request.post(`${API_ORIGIN}/auth/login`, {
      data: { email: 'demo-moderator@example.com', password: 'DemoPass123!' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const { accessToken } = (await loginRes.json()) as { accessToken: string };

    const evidenceRes = await request.get(`${API_ORIGIN}/evidence?reportId=${reportId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(evidenceRes.ok()).toBeTruthy();
    const evidence = (await evidenceRes.json()) as Array<{ id: string; type: string; approved: boolean }>;
    const screenshots = evidence.filter((e) => e.type === 'SCREENSHOT');
    expect(screenshots).toHaveLength(4);
    const unapproved = screenshots.filter((e) => !e.approved);
    expect(unapproved).toHaveLength(1);
    unapprovedFileEvidenceId = unapproved[0].id;
  });

  await test.step('anonymous visitor sees the published report with its approved image(s)', async () => {
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const assertAnonClean = watchPage(anonPage);
    try {
      await anonPage.goto(`/tr/reports/${reportId}`);
      await expect(anonPage.getByRole('heading', { name: reportTitle })).toBeVisible();
      await expect(anonPage.getByAltText(tr.reportDetail.fileAlt).first()).toBeVisible();
    } finally {
      assertAnonClean();
      await anonContext.close();
    }
  });

  await test.step('anonymous request for the rejected (unapproved) file gets 404, not 403 — existence not leaked', async () => {
    const fileRes = await request.get(`${API_ORIGIN}/evidence/${unapprovedFileEvidenceId}/file`);
    expect(fileRes.status()).toBe(404);
  });
});
