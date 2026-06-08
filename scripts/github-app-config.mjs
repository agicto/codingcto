#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiEnvPath = resolve(root, 'api/.env');
const webEnvPath = resolve(root, 'web/.env');
const keyPath = resolve(root, 'api/.local/github-app.private-key.pem');

function usage() {
  console.log(`Usage:
  node scripts/github-app-config.mjs manifest --owner <user-or-org> [--name "CodingCTO Local"]
  node scripts/github-app-config.mjs convert --code <manifest-code>
  node scripts/github-app-config.mjs existing --app-id <id> --private-key-path <path> --slug <app-slug> [--webhook-secret <secret>]

The manifest command creates a local HTML form for GitHub's App Manifest flow.
The convert command exchanges GitHub's temporary manifest code with gh api, stores
the PEM under api/.local, and updates api/.env + web/.env.`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    result[key] = value;
  }
  return result;
}

function escapeEnvValue(value) {
  const stringValue = String(value ?? '');
  if (/^[A-Za-z0-9_./:@-]*$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function updateEnvFile(filePath, updates) {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const keys = new Set(Object.keys(updates));
  const seen = new Set();
  const lines = existing.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !keys.has(match[1])) {
      return line;
    }
    seen.add(match[1]);
    return `${match[1]}=${escapeEnvValue(updates[match[1]])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${escapeEnvValue(value)}`);
    }
  }
  writeFileSync(filePath, lines.join('\n').replace(/\n*$/, '\n'));
}

function requireValue(args, key) {
  const value = args[key];
  if (!value || value === 'true') {
    throw new Error(`Missing --${key}`);
  }
  return value;
}

function createManifest(args) {
  const owner = requireValue(args, 'owner');
  const name = args.name || 'CodingCTO Local';
  const action =
    owner === 'user'
      ? 'https://github.com/settings/apps/new'
      : `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`;
  const redirectParams = new URLSearchParams();
  for (const key of ['repository-url', 'repository-id', 'return-to', 'repo']) {
    if (args[key] && args[key] !== 'true') {
      redirectParams.set(key.replaceAll('-', '_'), args[key]);
    }
  }
  const redirectQuery = redirectParams.toString();
  const redirectURL = `http://localhost:2020/console/settings/github-app-manifest${redirectQuery ? `?${redirectQuery}` : ''}`;
  const manifest = {
    name,
    url: 'http://localhost:2020',
    hook_attributes: {
      url: 'http://localhost:2010/v1/github/webhook',
      active: false,
    },
    redirect_url: redirectURL,
    callback_urls: ['http://localhost:2020/console/settings'],
    setup_url: 'http://localhost:2020/console/settings',
    description: 'Local CodingCTO GitHub integration for repository analysis and pull request workflows.',
    public: false,
    default_permissions: {
      metadata: 'read',
      contents: 'write',
      pull_requests: 'write',
      issues: 'write',
      actions: 'read',
      statuses: 'read',
    },
    default_events: ['installation', 'installation_repositories', 'push', 'pull_request'],
  };
  const state = `codingcto-${Date.now()}`;
  const htmlPath = resolve(root, '.codex/tmp/github-app-manifest.html');
  mkdirSync(dirname(htmlPath), { recursive: true });
  const html = `<!doctype html>
<meta charset="utf-8">
<title>CodingCTO GitHub App Manifest</title>
<form id="form" action="${action}?state=${state}" method="post">
  <textarea name="manifest" style="width: 100%; height: 320px;">${JSON.stringify(manifest)}</textarea>
  <button type="submit">Create GitHub App</button>
</form>
<script>document.getElementById('form').submit();</script>
`;
  writeFileSync(htmlPath, html);
  console.log(`Manifest form written: ${htmlPath}`);
  console.log('Open it in a browser, finish GitHub creation, copy the code from the redirect URL, then run:');
  console.log('  node scripts/github-app-config.mjs convert --code <code>');
}

function convertManifest(args) {
  const code = requireValue(args, 'code');
  const raw = execFileSync('gh', [
    'api',
    '-X',
    'POST',
    `/app-manifests/${code}/conversions`,
    '--jq',
    '.',
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const app = JSON.parse(raw);
  if (!app.id || !app.pem || !app.slug) {
    throw new Error('GitHub manifest conversion did not return id, pem, and slug.');
  }

  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, app.pem, { mode: 0o600 });
  chmodSync(keyPath, 0o600);

  writeConfig({
    appId: app.id,
    privateKeyPath: keyPath,
    slug: app.slug,
    webhookSecret: app.webhook_secret || '',
  });
  console.log(`Configured GitHub App ${app.slug} (${app.id}).`);
  console.log(`Private key stored at ${keyPath}`);
}

function configureExisting(args) {
  writeConfig({
    appId: requireValue(args, 'app-id'),
    privateKeyPath: resolve(root, requireValue(args, 'private-key-path')),
    slug: requireValue(args, 'slug'),
    webhookSecret: args['webhook-secret'] || '',
  });
  console.log(`Configured existing GitHub App ${args.slug}.`);
}

function writeConfig({ appId, privateKeyPath, slug, webhookSecret }) {
  updateEnvFile(apiEnvPath, {
    GITHUB_APP_ID: appId,
    GITHUB_APP_PRIVATE_KEY: '',
    GITHUB_APP_PRIVATE_KEY_PATH: privateKeyPath,
    GITHUB_API_BASE_URL: 'https://api.github.com',
    GITHUB_WEBHOOK_SECRET: webhookSecret,
  });
  updateEnvFile(webEnvPath, {
    NEXT_PUBLIC_GITHUB_APP_SLUG: slug,
    NEXT_PUBLIC_GITHUB_APP_INSTALL_URL: `https://github.com/apps/${slug}/installations/new`,
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === 'manifest') {
    createManifest(args);
  } else if (command === 'convert') {
    convertManifest(args);
  } else if (command === 'existing') {
    configureExisting(args);
  } else {
    usage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
