import { getMissingReportFields } from './report-form-validation';

describe('getMissingReportFields', () => {
  it('lists every unmet requirement', () => {
    expect(getMissingReportFields({ hasEntity: false, title: '', body: '', consent: false })).toEqual([
      'entity',
      'title',
      'body',
      'consent',
    ]);
  });

  it('treats whitespace-only title/body as missing', () => {
    expect(
      getMissingReportFields({ hasEntity: true, title: '   ', body: '\n\t', consent: true }),
    ).toEqual(['title', 'body']);
  });

  it('is empty once every requirement is met', () => {
    expect(
      getMissingReportFields({ hasEntity: true, title: 'a title', body: 'a body', consent: true }),
    ).toEqual([]);
  });

  it('reports only the fields that are actually missing', () => {
    expect(
      getMissingReportFields({ hasEntity: true, title: 'ok', body: '', consent: false }),
    ).toEqual(['body', 'consent']);
  });
});
