#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'EXTENSION_OAUTH_REDIRECT_URIS',
  'NEXT_PUBLIC_CHROME_WEB_STORE_URL',
];

/** Validate production configuration without ever printing a secret value. */
export function releaseEnvErrors(env) {
  const errors = [];
  for (const name of REQUIRED) {
    if (typeof env[name] !== 'string' || env[name].trim().length === 0) {
      errors.push(`${name} is missing`);
    }
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof supabaseUrl === 'string' && supabaseUrl.length > 0) {
    try {
      const url = new URL(supabaseUrl);
      if (
        url.protocol !== 'https:' ||
        !/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname) ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== ''
      ) {
        errors.push('NEXT_PUBLIC_SUPABASE_URL must be an exact HTTPS project root URL');
      }
    } catch {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid URL');
    }
  }

  if (
    typeof env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    errors.push('public and service-role Supabase keys must be different');
  }

  const redirects = env.EXTENSION_OAUTH_REDIRECT_URIS;
  const redirectIds = [];
  let redirectsValid = typeof redirects === 'string' && redirects.length > 0;
  if (typeof redirects === 'string' && redirects.length > 0) {
    const values = redirects.split(',').map((value) => value.trim());
    if (values.some((value) => value.length === 0)) {
      errors.push('EXTENSION_OAUTH_REDIRECT_URIS contains an empty entry');
    }
    if (new Set(values).size !== values.length) {
      redirectsValid = false;
      errors.push('EXTENSION_OAUTH_REDIRECT_URIS contains a duplicate entry');
    }
    for (const value of values.filter(Boolean)) {
      try {
        const url = new URL(value);
        const extensionId = url.hostname.split('.')[0];
        if (
          url.protocol !== 'https:' ||
          !/^[a-p]{32}\.chromiumapp\.org$/u.test(url.hostname) ||
          url.port !== '' ||
          url.username !== '' ||
          url.password !== '' ||
          url.pathname !== '/zetalog-link' ||
          url.search !== '' ||
          url.hash !== '' ||
          value.includes('*')
        ) {
          redirectsValid = false;
          errors.push('each extension redirect must be one exact Chrome Identity callback URL');
        } else if (extensionId !== undefined) {
          redirectIds.push(extensionId);
        }
      } catch {
        redirectsValid = false;
        errors.push('EXTENSION_OAUTH_REDIRECT_URIS contains an invalid URL');
      }
    }
  }

  const storeValue = env.NEXT_PUBLIC_CHROME_WEB_STORE_URL;
  if (typeof storeValue === 'string' && storeValue.length > 0) {
    try {
      const url = new URL(storeValue);
      const segments = url.pathname.split('/').filter(Boolean);
      const storeId = segments.at(-1);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'chromewebstore.google.com' ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== '' ||
        segments[0] !== 'detail' ||
        (segments.length !== 2 && segments.length !== 3) ||
        storeId === undefined ||
        !/^[a-p]{32}$/u.test(storeId)
      ) {
        errors.push('NEXT_PUBLIC_CHROME_WEB_STORE_URL must be the exact final Store listing URL');
      } else if (redirectsValid && !redirectIds.includes(storeId)) {
        errors.push('the Store item ID must match an allowed Chrome Identity callback');
      }
    } catch {
      errors.push('NEXT_PUBLIC_CHROME_WEB_STORE_URL must be a valid URL');
    }
  }

  const emailFrom = env.EMAIL_FROM;
  if (
    typeof emailFrom === 'string' &&
    !/<[^<>\s]+@[^<>\s]+>$|^[^<>\s]+@[^<>\s]+$/u.test(emailFrom)
  ) {
    errors.push('EMAIL_FROM must contain a valid sender address');
  }
  return [...new Set(errors)];
}

function main() {
  const errors = releaseEnvErrors(process.env);
  if (errors.length > 0) {
    process.stderr.write('Release environment check failed:\n');
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Release environment check passed; no secret values were printed.\n');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
