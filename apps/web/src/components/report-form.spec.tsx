import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportForm } from './report-form';
import { tr } from '../dictionaries/tr';
import type { ApiEntity } from '../lib/api-models';

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({ status: 'authenticated', accessToken: 'test-token', user: null }),
}));

// Matches the REAL GET /entities (list) response shape exactly as curled
// from the running API: a bare array of Entity rows. stats/links/coin are
// NOT present on this endpoint (only GET /entities/:id includes them) —
// ReportForm never reads those fields, so this is deliberately omitted
// here too, same as what the browser actually receives.
const DEMO_ENTITY = {
  id: 'ent-1',
  type: 'COIN',
  status: 'ACTIVE',
  slug: 'demo-coin-a',
  name: 'Demo Coin A',
  summary: 'Tamamen kurgusal örnek coin (seed verisi).',
  logoUrl: null,
  country: null,
  foundedAt: null,
  tags: [],
  verified: false,
  verifiedAt: null,
  ownerId: null,
  mergedIntoId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as ApiEntity;

function mockEntitiesFetch(entities: ApiEntity[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL) => {
      const href = String(url);
      if (href.includes('/entities')) {
        return Promise.resolve(new Response(JSON.stringify(entities), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${href}`));
    }),
  );
}

describe('ReportForm — entity selection', () => {
  it('shows search results and selecting one fills the input and clears the list', async () => {
    mockEntitiesFetch([DEMO_ENTITY]);
    const user = userEvent.setup();
    render(<ReportForm locale="tr" dictionary={tr} />);

    const searchInput = screen.getByLabelText(tr.reportForm.entityLabel);
    await user.type(searchInput, 'demo');

    const option = await screen.findByRole('button', { name: /Demo Coin A/ });
    await user.click(option);

    expect(searchInput).toHaveValue('Demo Coin A');
    expect(screen.queryByRole('button', { name: /Demo Coin A/ })).toBeNull();
  });

  it('clears the "missing: entity" hint once an entity is selected', async () => {
    mockEntitiesFetch([DEMO_ENTITY]);
    const user = userEvent.setup();
    render(<ReportForm locale="tr" dictionary={tr} />);

    expect(screen.getByText(tr.reportForm.missingEntity, { exact: false })).toBeInTheDocument();

    await user.type(screen.getByLabelText(tr.reportForm.entityLabel), 'demo');
    await user.click(await screen.findByRole('button', { name: /Demo Coin A/ }));

    await waitFor(() => {
      expect(screen.queryByText(tr.reportForm.missingEntity, { exact: false })).toBeNull();
    });
  });

  it('shows an explicit empty state when the search returns no entities', async () => {
    mockEntitiesFetch([]);
    const user = userEvent.setup();
    render(<ReportForm locale="tr" dictionary={tr} />);

    await user.type(screen.getByLabelText(tr.reportForm.entityLabel), 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText(tr.reportForm.noEntityResults)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Demo Coin A/ })).toBeNull();
  });

  it('enables the submit button only once every required field is filled, matching the missing-fields hint', async () => {
    mockEntitiesFetch([DEMO_ENTITY]);
    const user = userEvent.setup();
    render(<ReportForm locale="tr" dictionary={tr} />);

    const submit = screen.getByRole('button', { name: tr.reportForm.submit });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(tr.reportForm.entityLabel), 'demo');
    await user.click(await screen.findByRole('button', { name: /Demo Coin A/ }));
    await user.type(screen.getByLabelText(tr.reportForm.titleLabel), 'Başlık');
    await user.type(screen.getByLabelText(tr.reportForm.bodyLabel), 'Açıklama metni');
    expect(submit).toBeDisabled();

    await user.click(screen.getByLabelText(tr.reportForm.consentLabel));

    await waitFor(() => expect(submit).toBeEnabled());
  });
});
