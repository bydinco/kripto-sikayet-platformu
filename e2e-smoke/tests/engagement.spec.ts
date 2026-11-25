import type { Page } from '@playwright/test';
import { test, expect, watchPage } from '../fixtures';
import { tr } from '../../apps/web/src/dictionaries/tr';

const MODERATOR_EMAIL = 'demo-moderator@example.com';
const MODERATOR_PASSWORD = 'DemoPass123!';
const API_ORIGIN = 'http://localhost:3001';

async function registerFreshUser(page: Page, unique: string) {
  const email = `smoke-engage-${unique}@example.com`;
  await page.goto('/tr/register');
  await page.getByLabel(tr.auth.handleLabel).fill(`smoke_eng_${unique.replace(/[^a-z0-9]/gi, '')}`);
  await page.getByLabel(tr.auth.emailLabel).fill(email);
  await page.getByLabel(tr.auth.passwordLabel).fill('SmokePass123!');
  await page.getByRole('button', { name: tr.auth.submitRegister }).click();
  await expect(page).toHaveURL(/\/tr\/?$/);
  return email;
}

test('me-too / helpful / comments: user interacts, counts update, moderator hides a comment, mobile has no overflow', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const reportTitle = `Engagement smoke report ${unique}`;
  let reportId = '';

  await test.step('author A submits and a moderator publishes a report', async () => {
    await registerFreshUser(page, `a-${unique}`);
    await page.goto('/tr/reports/new');
    await page.getByLabel(tr.reportForm.entityLabel).fill('Demo');
    await page.getByRole('button', { name: /Demo Coin A/ }).click();
    await page.getByLabel(tr.reportForm.titleLabel).fill(reportTitle);
    await page.getByLabel(tr.reportForm.bodyLabel).fill('Engagement duman testi için otomatik açıklama.');
    await page.getByRole('button', { name: tr.reportForm.addEvidence }).click();
    await page.getByPlaceholder(tr.reportForm.evidenceValueLabel).fill('https://example.com/engagement-evidence');
    await page.getByLabel(tr.reportForm.consentLabel).check();
    await page.getByRole('button', { name: tr.reportForm.submit }).click();
    await expect(page.getByText(tr.reportForm.success)).toBeVisible();

    const reportHref = await page.getByRole('link', { name: tr.reportForm.viewReport }).getAttribute('href');
    if (!reportHref) throw new Error('Could not resolve the created report URL.');
    reportId = reportHref.split('/').filter(Boolean).pop()!;

    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    const assertModClean = watchPage(modPage);
    try {
      await modPage.goto('/tr/login');
      await modPage.getByLabel(tr.auth.emailLabel).fill(MODERATOR_EMAIL);
      await modPage.getByLabel(tr.auth.passwordLabel).fill(MODERATOR_PASSWORD);
      await modPage.getByRole('button', { name: tr.auth.submitLogin }).click();
      await expect(modPage.getByRole('link', { name: tr.admin.nav.reports })).toBeVisible();

      await modPage.goto(`/tr/admin/reports/${reportId}`);
      await expect(modPage.getByRole('heading', { name: reportTitle })).toBeVisible();
      await modPage.locator('select').selectOption({ label: tr.statuses.PUBLISHED });
      await modPage.locator('#reason').fill('Smoke test onayı');
      await modPage.getByRole('button', { name: tr.admin.reportDetail.submitTransition }).click();
      await expect(modPage.getByText(tr.statuses.PUBLISHED).first()).toBeVisible();
    } finally {
      assertModClean();
      await modContext.close();
    }
  });

  const userBContext = await browser.newContext();
  const userBPage = await userBContext.newPage();
  const assertUserBClean = watchPage(userBPage);
  const commentText = `Smoke yorum ${unique}`;

  await test.step('user B marks helpful, says "me too", and posts a comment; counts update', async () => {
    await registerFreshUser(userBPage, `b-${unique}`);
    await userBPage.goto(`/tr/reports/${reportId}`);

    const helpfulButton = userBPage.getByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) });
    await helpfulButton.click();
    await expect(helpfulButton).toHaveText(`${tr.reportDetail.helpfulButton} · 1`);

    const meTooButton = userBPage.getByRole('button', { name: new RegExp(tr.reportDetail.meTooButton) });
    await meTooButton.click();
    await expect(meTooButton).toHaveText(`${tr.reportDetail.meTooButton} · 1`);

    const commentTextarea = userBPage.getByPlaceholder(tr.reportDetail.commentPlaceholder);
    await commentTextarea.fill(commentText);
    // "Gönder" also matches ReportNoticeForm's longer button by substring —
    // scope to the comment form itself (identified by its own textarea).
    const commentForm = userBPage.locator('form').filter({ has: commentTextarea });
    await commentForm.getByRole('button', { name: tr.reportDetail.commentSubmit, exact: true }).click();
    await expect(userBPage.getByText(commentText)).toBeVisible();
  });
  assertUserBClean();
  await userBContext.close();

  await test.step('an anonymous API caller sees the comment and the counts', async () => {
    // Checked directly against the API, not the Next.js page: the public
    // report page is ISR-cached (next: { revalidate: 300, tags: [...] }),
    // and REVALIDATE_SECRET is deliberately unset in this env (see
    // CLAUDE.md "On-demand revalidation"), so a page already rendered
    // once (by user B, just above) would otherwise show stale data for up
    // to 300s — a staleness artifact of this test env, not a real bug.
    const commentsRes = await request.get(`${API_ORIGIN}/reports/${reportId}/comments`);
    expect(commentsRes.ok()).toBeTruthy();
    const comments = (await commentsRes.json()) as Array<{ body: string }>;
    expect(comments.some((c) => c.body === commentText)).toBe(true);

    const engagementRes = await request.get(`${API_ORIGIN}/reports/${reportId}/engagement`);
    expect(engagementRes.ok()).toBeTruthy();
    const engagement = await engagementRes.json();
    expect(engagement).toMatchObject({ helpfulCount: 1, meTooCount: 1, commentCount: 1 });
  });

  await test.step('an anonymous page visitor sees no interactive buttons and is sent to login', async () => {
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const assertAnonClean = watchPage(anonPage);
    try {
      await anonPage.goto(`/tr/reports/${reportId}`);
      await expect(anonPage.getByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) })).toHaveCount(0);
      const loginLink = anonPage.getByRole('link', { name: tr.reportForm.goToLogin }).first();
      await expect(loginLink).toHaveAttribute('href', `/tr/login?next=/tr/reports/${reportId}`);
    } finally {
      assertAnonClean();
      await anonContext.close();
    }
  });

  await test.step('the report author cannot vote/me-too on their own report (notice shown, no buttons)', async () => {
    await page.goto(`/tr/reports/${reportId}`);
    await expect(page.getByText(tr.reportDetail.ownReportNotice)).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) })).toHaveCount(0);
  });

  await test.step('a moderator hides the comment with a reason, and it disappears from the anonymous API view and count', async () => {
    const modContext = await browser.newContext();
    const modPage = await modContext.newPage();
    const assertModClean = watchPage(modPage);
    try {
      await modPage.goto('/tr/login');
      await modPage.getByLabel(tr.auth.emailLabel).fill(MODERATOR_EMAIL);
      await modPage.getByLabel(tr.auth.passwordLabel).fill(MODERATOR_PASSWORD);
      await modPage.getByRole('button', { name: tr.auth.submitLogin }).click();
      await expect(modPage.getByRole('link', { name: tr.admin.nav.reports })).toBeVisible();

      await modPage.goto(`/tr/admin/reports/${reportId}`);
      // Scope to the specific comment's card — the me-too row (empty body)
      // is also listed with its own "Gizle" button, so a page-wide
      // getByRole here would be ambiguous.
      const commentCard = modPage.locator('.card', { hasText: commentText });
      await expect(commentCard).toBeVisible();
      await commentCard.getByRole('button', { name: tr.admin.reportDetail.hideButton }).click();
      await commentCard.locator('textarea').fill('Smoke test gizleme');
      const [patchResponse] = await Promise.all([
        modPage.waitForResponse(
          (res) => /\/reports\/[^/]+\/comments\/[^/]+$/.test(res.url()) && res.request().method() === 'DELETE',
        ),
        commentCard.getByRole('button', { name: tr.admin.reportDetail.hideSubmit }).click(),
      ]);
      expect(patchResponse.ok()).toBeTruthy();
      await expect(modPage.getByText(commentText)).toHaveCount(0);
    } finally {
      assertModClean();
      await modContext.close();
    }

    const commentsRes = await request.get(`${API_ORIGIN}/reports/${reportId}/comments`);
    const comments = (await commentsRes.json()) as Array<{ body: string }>;
    expect(comments.some((c) => c.body === commentText)).toBe(false);

    const engagementRes = await request.get(`${API_ORIGIN}/reports/${reportId}/engagement`);
    const engagement = await engagementRes.json();
    expect(engagement).toMatchObject({ commentCount: 0 });
  });

  await test.step('the report page has no horizontal overflow at 390px wide', async () => {
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    const assertMobileClean = watchPage(mobilePage);
    try {
      await mobilePage.goto(`/tr/reports/${reportId}`);
      await expect(mobilePage.getByRole('heading', { name: reportTitle })).toBeVisible();
      const hasOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(hasOverflow).toBe(false);
    } finally {
      assertMobileClean();
      await mobileContext.close();
    }
  });
});
