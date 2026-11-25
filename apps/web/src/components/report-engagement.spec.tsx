import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportEngagement } from './report-engagement';
import { useAuth } from '../lib/auth-context';
import { tr } from '../dictionaries/tr';
import type { ApiComment, ApiEngagement } from '../lib/api-models';

vi.mock('../lib/auth-context', () => ({ useAuth: vi.fn() }));

const REPORT_ID = 'r1';
const AUTHOR_ID = 'author-1';

const EMPTY_SUMMARY: ApiEngagement = { helpfulCount: 0, meTooCount: 0, commentCount: 0, myHelpful: false, myMeToo: false };

function mockAuth(partial: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    status: 'anonymous',
    accessToken: null,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...partial,
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit) => Promise.resolve(handler(String(url), init))));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('ReportEngagement — anonymous viewer', () => {
  it('shows counts as plain text and a login link instead of interactive buttons', () => {
    mockAuth({ status: 'anonymous' });
    stubFetch(() => jsonResponse(EMPTY_SUMMARY));
    render(
      <ReportEngagement
        reportId={REPORT_ID}
        reportAuthorId={AUTHOR_ID}
        locale="tr"
        dictionary={tr}
        initialSummary={{ ...EMPTY_SUMMARY, helpfulCount: 3, meTooCount: 2 }}
        initialComments={[]}
      />,
    );

    expect(screen.queryByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) })).toBeNull();
    expect(screen.getByText(/3/).textContent).toContain('3');
    const loginLinks = screen.getAllByRole('link', { name: tr.reportForm.goToLogin });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) {
      expect(link).toHaveAttribute('href', `/tr/login?next=/tr/reports/${REPORT_ID}`);
    }
  });
});

describe('ReportEngagement — authenticated, own report', () => {
  it('shows the "own report" notice instead of the helpful/me-too buttons', () => {
    mockAuth({ status: 'authenticated', accessToken: 'tok', user: { id: AUTHOR_ID, handle: 'me' } as never });
    stubFetch(() => jsonResponse(EMPTY_SUMMARY));
    render(
      <ReportEngagement
        reportId={REPORT_ID}
        reportAuthorId={AUTHOR_ID}
        locale="tr"
        dictionary={tr}
        initialSummary={EMPTY_SUMMARY}
        initialComments={[]}
      />,
    );

    expect(screen.getByText(tr.reportDetail.ownReportNotice)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) })).toBeNull();
  });
});

describe('ReportEngagement — authenticated, someone else’s report', () => {
  it('optimistically marks helpful, then reverts and shows an error on failure', async () => {
    mockAuth({ status: 'authenticated', accessToken: 'tok', user: { id: 'voter-1', handle: 'voter' } as never });
    stubFetch((url, init) => {
      if (url.includes('/engagement')) return jsonResponse(EMPTY_SUMMARY);
      if (url.includes('/votes') && init?.method === 'POST') {
        return jsonResponse({ message: 'Hata oluştu.' }, 500);
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();
    render(
      <ReportEngagement
        reportId={REPORT_ID}
        reportAuthorId={AUTHOR_ID}
        locale="tr"
        dictionary={tr}
        initialSummary={EMPTY_SUMMARY}
        initialComments={[]}
      />,
    );

    const helpfulButton = await screen.findByRole('button', { name: new RegExp(tr.reportDetail.helpfulButton) });
    await user.click(helpfulButton);

    // Optimistic bump, then reverted once the failing request resolves.
    await waitFor(() => expect(helpfulButton).toHaveTextContent(`${tr.reportDetail.helpfulButton} · 0`));
    expect(await screen.findByText('Hata oluştu.')).toBeInTheDocument();
  });

  it('disables the comment submit button until the body is long enough, then posts and appends it', async () => {
    const postedComment: ApiComment = {
      id: 'c1',
      body: 'merhaba herkese',
      isMeToo: false,
      createdAt: new Date().toISOString(),
      author: { handle: 'voter' },
      isReportAuthor: false,
    };
    mockAuth({ status: 'authenticated', accessToken: 'tok', user: { id: 'voter-1', handle: 'voter' } as never });
    stubFetch((url, init) => {
      if (url.includes('/engagement')) return jsonResponse(EMPTY_SUMMARY);
      if (url.endsWith('/comments') && init?.method === 'POST') return jsonResponse(postedComment, 201);
      return jsonResponse({});
    });
    const user = userEvent.setup();
    render(
      <ReportEngagement
        reportId={REPORT_ID}
        reportAuthorId={AUTHOR_ID}
        locale="tr"
        dictionary={tr}
        initialSummary={EMPTY_SUMMARY}
        initialComments={[]}
      />,
    );

    const textarea = screen.getByPlaceholderText(tr.reportDetail.commentPlaceholder);
    const submit = screen.getByRole('button', { name: tr.reportDetail.commentSubmit });
    expect(submit).toBeDisabled();

    await user.type(textarea, 'a');
    expect(submit).toBeDisabled();

    await user.type(textarea, 'merhaba herkese');
    await waitFor(() => expect(submit).toBeEnabled());

    await user.click(submit);
    await waitFor(() => expect(screen.getByText('merhaba herkese')).toBeInTheDocument());
    expect(textarea).toHaveValue('');
  });
});
