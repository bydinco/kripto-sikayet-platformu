// Purely presentational — no client-side state, works as a server component.
const SEGMENT_COUNT = 20;

function colorForScore(score: number): string {
  if (score >= 75) return 'var(--cor)';
  if (score >= 40) return 'var(--amb)';
  return 'var(--grn)';
}

export function RiskMeter({ score, sm = false }: { score: number | null; sm?: boolean }) {
  // Never draw a meter for a number we don't have — INSUFFICIENT_DATA
  // shows a text empty-state instead, at the call site.
  if (score === null) return null;

  const filled = Math.round(score / 5);
  const color = colorForScore(score);

  return (
    <div className="risk-meter" style={{ height: sm ? 8 : 14 }} role="img" aria-label={`Risk meter ${score} of 100`}>
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
        <span
          key={index}
          className="risk-meter-segment"
          style={index < filled ? { background: color } : undefined}
        />
      ))}
    </div>
  );
}
