import type { ReportStatus } from '../lib/api-models';
import type { Dictionary } from '../dictionaries/types';

// Every status uses the same neutral badge styling on purpose — color
// coding "bad" (red) vs. "good" (green) would itself be an accusatory
// signal this product explicitly avoids.
export function StatusBadge({ status, dictionary }: { status: ReportStatus; dictionary: Dictionary }) {
  return <span className="badge">{dictionary.statuses[status]}</span>;
}
