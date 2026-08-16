import type { Metadata } from 'next';

import { LinkHandoff } from '@/app/_components/LinkHandoff';

export const metadata: Metadata = { title: 'Link the extension' };

/**
 * `/link` — the extension opens this explicit user-gesture page. The extension
 * owns every OAuth/PKCE value and starts the authorization flow only after the
 * trusted click exposed by LinkHandoff.
 */
export default function LinkPage(): React.JSX.Element {
  return (
    <div className="auth-page">
      <div className="card card--pad auth-card">
        <h1 className="display auth-card__title">Link extension</h1>
        <LinkHandoff />
      </div>
    </div>
  );
}
