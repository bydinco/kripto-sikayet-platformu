import type { Dictionary } from '../dictionaries/types';

export function SiteFooter({ dictionary }: { dictionary: Dictionary }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <p>{dictionary.footer.riskNote}</p>
      </div>
    </footer>
  );
}
