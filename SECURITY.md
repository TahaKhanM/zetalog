# Security policy

Please do not disclose a suspected vulnerability in a public issue. Use the
repository's **Security → Report a vulnerability** form so the maintainer can
investigate privately.

Include the affected website URL or extension version, a minimal reproduction,
the expected impact, and whether you accessed any data that was not your own.
Do not test against other users, run denial-of-service tests, or retain personal
data. The maintainer will acknowledge a complete report within five working
days and coordinate a fix and disclosure timeline according to severity.

Only the current website deployment and the latest Chrome Web Store extension
release are supported. A Supabase publishable/anonymous key found in a client
bundle is not a secret; service-role keys, extension credentials, and user
session tokens are.
