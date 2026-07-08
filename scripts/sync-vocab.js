#!/usr/bin/env node
/**
 * sync-vocab.js
 *
 * Fetches updated index.json files from a given iqb-vocabs/v* repository
 * via the GitHub REST API and writes them into the local docs/ folder.
 *
 * Usage (called by sync.yml workflow):
 *   node scripts/sync-vocab.js <repoName>
 *   e.g.: node scripts/sync-vocab.js v05
 *
 * Environment variables:
 *   GITHUB_TOKEN  — GitHub token with repo read access (provided by Actions)
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Args ──────────────────────────────────────────────────
const repoName = process.argv[2];
if (!repoName) {
  console.error('Usage: node scripts/sync-vocab.js <repoName>  (e.g. v05)');
  process.exit(1);
}

// ── Registry ──────────────────────────────────────────────
const registry = JSON.parse(readFileSync(join(ROOT, 'vocab-registry.json'), 'utf8'));
const entry = registry[repoName];
if (!entry) {
  console.error(`Repository "${repoName}" not found in vocab-registry.json`);
  process.exit(1);
}

const { category, subVocabs } = entry;
const token = process.env.GITHUB_TOKEN;
const org = 'iqb-vocabs';

// ── GitHub API helper ─────────────────────────────────────
async function fetchJson(url) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetches the raw content of a file from a GitHub repo.
 * Returns the parsed JSON or null if not found.
 */
async function fetchRepoFile(repo, filePath) {
  const url = `https://api.github.com/repos/${org}/${repo}/contents/${filePath}`;
  try {
    const data = await fetchJson(url);
    // Content is base64-encoded
    const raw = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.message.includes('404')) {
      console.warn(`  [skip] ${filePath} not found in ${repo}`);
      return null;
    }
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────
console.log(`\nSyncing ${org}/${repoName} → docs/${category}/${repoName}/`);
console.log(`  Sub-vocabs: ${subVocabs.join(', ')}\n`);

let synced = 0;
let skipped = 0;

for (const sub of subVocabs) {
  const remotePath = `${sub}/index.json`;
  const localDir   = join(ROOT, 'docs', category, repoName, sub);
  const localFile  = join(localDir, 'index.json');

  process.stdout.write(`  Fetching ${remotePath} … `);

  const json = await fetchRepoFile(repoName, remotePath);
  if (!json) {
    skipped++;
    continue;
  }

  mkdirSync(localDir, { recursive: true });
  writeFileSync(localFile, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`✓  written to docs/${category}/${repoName}/${sub}/index.json`);
  synced++;
}

console.log(`\nDone. Synced: ${synced}, Skipped: ${skipped}`);
