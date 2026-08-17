'use client';

const MICROSOFT_QUARANTINE_URL = 'https://security.microsoft.com/quarantine';

interface CodeDeliveryHelpProps {
  readonly disabled?: boolean;
  readonly sending: boolean;
  readonly onResend: () => void;
}

/** Delivery help shown after a verification code has been sent. */
export function CodeDeliveryHelp({
  disabled = false,
  sending,
  onResend,
}: CodeDeliveryHelpProps): React.JSX.Element {
  return (
    <aside className="auth-code-help" aria-labelledby="auth-code-help-title">
      <h3 id="auth-code-help-title">Code not arrived?</h3>
      <p>
        Check your junk or spam folder. University email systems may hold messages in quarantine.
      </p>
      <p>
        If your university uses Microsoft 365 or Outlook, open the{' '}
        <a href={MICROSOFT_QUARANTINE_URL} target="_blank" rel="noreferrer noopener">
          Microsoft quarantine page
        </a>
        . Find the ZetaLog email then select <strong>Release</strong>.
      </p>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={disabled || sending}
        onClick={onResend}
      >
        {sending ? 'Sending new code…' : 'Send a new code'}
      </button>
    </aside>
  );
}
