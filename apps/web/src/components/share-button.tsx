'use client';

import { useState } from 'react';

export function ShareButton({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // User cancelled or the share sheet failed — fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing more to do.
    }
  }

  return (
    <button type="button" className="button button-secondary" onClick={() => void handleShare()}>
      {copied ? copiedLabel : label}
    </button>
  );
}
