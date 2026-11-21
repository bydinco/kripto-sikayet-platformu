import type { Dictionary } from '../dictionaries/types';

export function SiteFooter({ dictionary }: { dictionary: Dictionary }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <p className="muted">{dictionary.footer.disclaimer}</p>
      </div>
    </footer>
  );
}
