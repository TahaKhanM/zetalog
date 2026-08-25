#!/usr/bin/env node

/**
 * Deterministic, offline release gate for the Chrome Web Store ZIP.
 *
 * Node has no built-in ZIP reader. This script deliberately invokes the
 * platform's standard `unzip` binary without a shell, rather than adding a
 * package that would itself become part of the release toolchain.
 *
 * Usage:
 *   node scripts/inspect-extension-zip.mjs path/to/zetalogextension-1.0.0-chrome.zip
 */

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const RELEASE_VERSION = '1.0.0';

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 100;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REQUIRED_ICON_SIZES = [16, 32, 48, 96, 128];
const EXPECTED_PERMISSIONS = ['alarms', 'identity', 'storage', 'unlimitedStorage'];
const EXPECTED_MANIFEST_FIELDS = [
  'action',
  'background',
  'content_scripts',
  'description',
  'icons',
  'manifest_version',
  'minimum_chrome_version',
  'name',
  'permissions',
  'version',
];
const EXPECTED_CONTENT_SCRIPT_MATCHES = [
  'https://arithmetic.zetamac.com/*',
  'https://www.zetalog.co.uk/link*',
];
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs']);
const FORBIDDEN_PATH =
  /(?:^|\/)(?:\.env(?:\.|$)|node_modules(?:\/|$)|test(?:s)?(?:\/|$)|__tests__(?:\/|$)|coverage(?:\/|$)|\.git(?:\/|$))|\.(?:map|ts|tsx|mts|cts)$/iu;
const DEVELOPMENT_TEXT =
  /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b|(?:webpack|vite|wxt)[-_:/]?(?:dev|hmr|client)/iu;
const REMOTE_CODE_TEXT = [
  /\bimport\s*\(\s*["']https?:\/\//iu,
  /\bimportScripts\s*\(\s*["']https?:\/\//iu,
  /\b(?:new\s+)?Worker\s*\(\s*["']https?:\/\//iu,
  /\bimport\s+(?:[^;"']+?\s+from\s+)?["']https?:\/\//iu,
  /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//iu,
];
const SECRET_TEXT = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u,
  /\b(?:AKIA[0-9A-Z]{16}|gh[pous]_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,})\b/u,
  /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"']{16,}["']/u,
];

function command(commandName, args) {
  const result = spawnSync(commandName, args, {
    encoding: 'buffer',
    maxBuffer: MAX_UNCOMPRESSED_BYTES + 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`could not run ${commandName}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8').trim();
    throw new Error(`${commandName} failed${stderr.length > 0 ? `: ${stderr}` : ''}`);
  }
  return result.stdout;
}

function archiveEntry(zipPath, entry) {
  return command('unzip', ['-p', zipPath, entry]);
}

function fileEntries(zipPath) {
  return command('unzip', ['-Z1', zipPath])
    .toString('utf8')
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.endsWith('/'));
}

function archiveSize(zipPath) {
  const summary = command('unzip', ['-Z', '-t', zipPath]).toString('utf8');
  const match = /\d+ files?, (\d+) bytes uncompressed, (\d+) bytes compressed/u.exec(summary);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error('could not read ZIP size summary');
  }
  return {
    uncompressedBytes: Number(match[1]),
    compressedBytes: Number(match[2]),
  };
}

function isSafeEntryName(entry) {
  return !entry.startsWith('/') && !entry.includes('\\') && !entry.split('/').includes('..');
}

function expectedIconEntries() {
  return REQUIRED_ICON_SIZES.map((size) => `icon-${String(size)}.png`);
}

function isExactSet(actual, expected) {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

/** Exported for the focused Node test and for future release tooling. */
export function validateManifest(manifest, entries) {
  const errors = [];

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest.json must contain an object'];
  }
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  if (manifest.version !== RELEASE_VERSION) {
    errors.push(`manifest version must be ${RELEASE_VERSION}, got ${String(manifest.version)}`);
  }
  if (manifest.name !== 'ZetaLog') errors.push('manifest name must be ZetaLog');
  if (manifest.minimum_chrome_version !== '116') {
    errors.push('minimum_chrome_version must be 116');
  }
  const manifestFields = Object.keys(manifest).sort();
  if (!isExactSet(manifestFields, EXPECTED_MANIFEST_FIELDS)) {
    errors.push(`unexpected manifest fields: ${manifestFields.join(', ')}`);
  }
  if (manifest.background?.service_worker !== 'background.js') {
    errors.push('background service worker must be background.js');
  }
  if (manifest.action?.default_popup !== 'popup.html') {
    errors.push('action default popup must be popup.html');
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push('manifest permissions must be an array');
  } else {
    const permissions = [...manifest.permissions].sort();
    if (!isExactSet(permissions, EXPECTED_PERMISSIONS)) {
      errors.push(`unexpected permissions: ${permissions.join(', ') || '(none)'}`);
    }
  }
  if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0) {
    errors.push(`unexpected host permissions: ${manifest.host_permissions.join(', ')}`);
  }
  if (manifest.externally_connectable !== undefined) {
    errors.push('externally_connectable must not be declared');
  }

  const matches = (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []).sort();
  if (!isExactSet(matches, EXPECTED_CONTENT_SCRIPT_MATCHES)) {
    errors.push(`unexpected content-script matches: ${matches.join(', ') || '(none)'}`);
  }

  const required = ['manifest.json', 'background.js', 'popup.html', ...expectedIconEntries()];
  for (const entry of required) {
    if (!entries.has(entry)) errors.push(`required archive entry is missing: ${entry}`);
  }

  const iconValues = manifest.icons;
  if (iconValues === null || typeof iconValues !== 'object' || Array.isArray(iconValues)) {
    errors.push('manifest icons must be an object');
  } else {
    for (const size of REQUIRED_ICON_SIZES) {
      const expected = `/icon-${String(size)}.png`;
      if (iconValues[String(size)] !== expected) {
        errors.push(`manifest icon ${String(size)} must be ${expected}`);
      }
    }
  }

  for (const script of manifest.content_scripts ?? []) {
    if (!Array.isArray(script.js) || script.js.length === 0) {
      errors.push('each content script needs at least one JavaScript entry');
      continue;
    }
    for (const scriptPath of script.js) {
      if (!entries.has(scriptPath)) errors.push(`content-script file is missing: ${scriptPath}`);
    }
  }

  return errors;
}

/** Exported for focused tests; it intentionally scans only text assets. */
export function textViolations(entry, text) {
  const violations = [];
  if (DEVELOPMENT_TEXT.test(text)) violations.push(`${entry}: development URL or runtime marker`);
  if (REMOTE_CODE_TEXT.some((pattern) => pattern.test(text))) {
    violations.push(`${entry}: remotely hosted executable code`);
  }
  if (SECRET_TEXT.some((pattern) => pattern.test(text))) {
    violations.push(`${entry}: private credential signature`);
  }
  return violations;
}

export function inspectExtensionZip(inputPath) {
  const zipPath = resolve(inputPath);
  const errors = [];

  if (extname(zipPath).toLowerCase() !== '.zip') {
    return { errors: ['input must be a .zip file'] };
  }
  if (!existsSync(zipPath)) return { errors: [`file does not exist: ${zipPath}`] };
  const stat = statSync(zipPath);
  if (!stat.isFile()) return { errors: [`not a regular file: ${zipPath}`] };
  if (stat.size > MAX_ARCHIVE_BYTES) {
    errors.push(`archive is ${String(stat.size)} bytes; limit is ${String(MAX_ARCHIVE_BYTES)}`);
  }

  try {
    command('unzip', ['-tqq', zipPath]);
    const entries = fileEntries(zipPath);
    const entriesSet = new Set(entries);
    const sizes = archiveSize(zipPath);

    if (entries.length > MAX_ENTRIES) {
      errors.push(
        `archive contains ${String(entries.length)} files; limit is ${String(MAX_ENTRIES)}`,
      );
    }
    if (entriesSet.size !== entries.length) errors.push('archive has duplicate file paths');
    if (sizes.uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      errors.push(
        `archive expands to ${String(sizes.uncompressedBytes)} bytes; limit is ${String(MAX_UNCOMPRESSED_BYTES)}`,
      );
    }
    for (const entry of entries) {
      if (!isSafeEntryName(entry)) errors.push(`unsafe archive path: ${entry}`);
      if (FORBIDDEN_PATH.test(entry)) errors.push(`forbidden development/source entry: ${entry}`);
    }

    let manifest;
    try {
      manifest = JSON.parse(archiveEntry(zipPath, 'manifest.json').toString('utf8'));
    } catch (error) {
      errors.push(
        `invalid manifest.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (manifest !== undefined) errors.push(...validateManifest(manifest, entriesSet));

    for (const icon of expectedIconEntries()) {
      if (!entriesSet.has(icon)) continue;
      const bytes = archiveEntry(zipPath, icon);
      if (
        bytes.length < PNG_SIGNATURE.length ||
        !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
      ) {
        errors.push(`${icon} is not a PNG file`);
      }
    }

    for (const entry of entries) {
      if (!TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) continue;
      const bytes = archiveEntry(zipPath, entry);
      if (bytes.length > MAX_UNCOMPRESSED_BYTES) {
        errors.push(`${entry} exceeds the text scan limit`);
        continue;
      }
      errors.push(...textViolations(entry, bytes.toString('utf8')));
    }

    return {
      archiveBytes: stat.size,
      compressedBytes: sizes.compressedBytes,
      entries: entries.length,
      errors,
      sha256: createHash('sha256').update(readFileSync(zipPath)).digest('hex'),
      uncompressedBytes: sizes.uncompressedBytes,
      zipPath,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, zipPath };
  }
}

function main() {
  const inputPath = process.argv[2];
  if (inputPath === undefined || process.argv.length !== 3) {
    process.stderr.write('Usage: node scripts/inspect-extension-zip.mjs <extension.zip>\n');
    process.exitCode = 2;
    return;
  }

  const result = inspectExtensionZip(inputPath);
  if (result.errors.length > 0) {
    process.stderr.write(`Release artifact inspection failed: ${basename(inputPath)}\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Release artifact inspection passed: ${basename(result.zipPath)}\n`);
  process.stdout.write(`- files: ${String(result.entries)}\n`);
  process.stdout.write(`- compressed: ${String(result.compressedBytes)} bytes\n`);
  process.stdout.write(`- uncompressed: ${String(result.uncompressedBytes)} bytes\n`);
  process.stdout.write(`- SHA-256: ${result.sha256}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
