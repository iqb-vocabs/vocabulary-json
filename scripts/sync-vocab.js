#!/usr/bin/env node
/**
 * sync-vocab.js
 *
 * Fetches updated Turtle (.ttl) files from a given iqb-vocabs/v* repository
 * via the GitHub REST API, writes them to the local ttl/ folder, converts
 * them to JSON, and writes the JSON files into the local docs/ folder.
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
import { convertTtlToJson } from './ttl-to-json.js';

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

// ── GitHub API helpers ────────────────────────────────────
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
 * Fetches the contents of the root of the repository.
 */
async function fetchRepoContents(repo) {
  const url = `https://api.github.com/repos/${org}/${repo}/contents/`;
  try {
    return await fetchJson(url);
  } catch (err) {
    if (err.message.includes('404')) {
      console.warn(`  [skip] Root contents not found in ${repo}`);
      return null;
    }
    throw err;
  }
}

/**
 * Fetches the raw content of a file from a GitHub repo.
 * Returns the raw text or null if not found.
 */
async function fetchRepoFileContent(repo, filePath) {
  const url = `https://api.github.com/repos/${org}/${repo}/contents/${filePath}`;
  try {
    const data = await fetchJson(url);
    if (!data.content) {
      throw new Error(`No content returned for ${filePath}`);
    }
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.message.includes('404')) {
      console.warn(`  [skip] ${filePath} not found in ${repo}`);
      return null;
    }
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────
console.log(`\nSyncing ${org}/${repoName} → ttl/${repoName}/ & docs/${category}/${repoName}/`);
console.log(`  Sub-vocabs in registry: ${subVocabs.join(', ')}\n`);

const contents = await fetchRepoContents(repoName);
if (!contents || !Array.isArray(contents)) {
  console.error(`Could not read contents of repository "${repoName}"`);
  process.exit(1);
}

const ttlFiles = contents.filter(file => file.type === 'file' && file.name.endsWith('.ttl'));
console.log(`Found ${ttlFiles.length} TTL file(s) in remote root: ${ttlFiles.map(f => f.name).join(', ')}\n`);

let synced = 0;
let skipped = 0;

const ttlDir = join(ROOT, 'ttl', repoName);
mkdirSync(ttlDir, { recursive: true });

for (const file of ttlFiles) {
  const remotePath = file.path;
  const localTtlFile = join(ttlDir, file.name);

  process.stdout.write(`  Fetching ${remotePath} … `);
  const ttlContent = await fetchRepoFileContent(repoName, remotePath);
  if (!ttlContent) {
    console.log(`Failed to fetch content.`);
    skipped++;
    continue;
  }

  writeFileSync(localTtlFile, ttlContent, 'utf8');
  console.log(`✓ written to ttl/${repoName}/${file.name}`);

  // Find matching subVocab
  const baseName = file.name.slice(0, -4);
  let matchedSub = null;
  for (const sub of subVocabs) {
    if (baseName === sub || baseName.startsWith(sub + '_')) {
      matchedSub = sub;
      break;
    }
  }

  if (matchedSub) {
    console.log(`  Matching sub-vocab found: "${matchedSub}". Generating JSON...`);
    try {
      const jsonResult = convertTtlToJson(localTtlFile);
      const localJsonDir = join(ROOT, 'docs', category, repoName, matchedSub);
      const localJsonFile = join(localJsonDir, 'index.json');
      mkdirSync(localJsonDir, { recursive: true });
      writeFileSync(localJsonFile, JSON.stringify(jsonResult, null, 2) + '\n', 'utf8');
      console.log(`  ✓ written JSON to docs/${category}/${repoName}/${matchedSub}/index.json`);
      synced++;
    } catch (err) {
      console.error(`  ✗ Error converting TTL to JSON for ${file.name}:`, err.message);
      skipped++;
    }
  } else {
    console.warn(`  [warning] No matching subVocab in registry for ${file.name}`);
    skipped++;
  }
}

console.log(`\nDone. Synced: ${synced}, Skipped: ${skipped}`);
