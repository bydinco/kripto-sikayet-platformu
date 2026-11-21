import { redirect } from 'next/navigation';

// Placeholder root redirect. Real IP/cookie-based locale detection is a later step.
export default function RootPage() {
  redirect('/en');
}
