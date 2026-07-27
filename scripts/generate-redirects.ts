import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');
const DIST_DIR = join(ROOT, 'dist');

// ── Helpers ────────────────────────────────────────────────────────

/** Recursively find all directories containing index.json */
function getVocabDirs(dir: string): string[] {
  const results: string[] = [];
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results.push(...getVocabDirs(fullPath));
    } else if (file === 'index.json') {
      results.push(dir);
    }
  }
  return results;
}

/** Recursively collect every concept from a concept tree. */
function collectAllConcepts(concepts: any[]): any[] {
  const all: any[] = [];
  for (const c of concepts) {
    all.push(c);
    if (c.narrower?.length) {
      all.push(...collectAllConcepts(c.narrower));
    }
  }
  return all;
}

/** Generate an HTML redirect page that points to the SPA hash route. */
function makeRedirectHtml(hashPath: string): string {
  const segmentCount = hashPath.split('/').filter(Boolean).length;
  const backToRoot = '../'.repeat(segmentCount);
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IQB Vocabulary Explorer</title>
    <script>
      window.location.replace("${backToRoot}#${hashPath}");
    </script>
  </head>
  <body>
    <p>Redirecting to <a href="${backToRoot}#${hashPath}">Vocabulary Explorer</a>...</p>
  </body>
</html>
`;
}

/**
 * Build a JSON-LD document for a single SKOS Concept.
 * Includes full concept data plus back-references to its scheme.
 */
function makeConceptJsonLd(
  concept: any,
  schemeId: string,
  isTopConcept: boolean,
  context: any,
): Record<string, any> {
  const doc: Record<string, any> = {
    '@context': context,
    id: concept.id,
    type: 'Concept',
  };

  // Copy all concept properties (prefLabel, altLabel, definition, notation, etc.)
  for (const key of Object.keys(concept)) {
    if (key === 'id' || key === 'type') continue;
    doc[key] = concept[key];
  }

  // Add SKOS back-references
  doc.inScheme = [{ id: schemeId }];
  if (isTopConcept) {
    doc.topConceptOf = [{ id: schemeId }];
  }

  return doc;
}

// ── Main ───────────────────────────────────────────────────────────

function main() {
  const vocabDirs = getVocabDirs(DOCS_DIR);

  // ── Phase 1: Generate redirect index.html pages in docs/ ─────
  console.log('Phase 1: Generating redirect index.html files under docs/ ...');
  for (const dir of vocabDirs) {
    const relPath = relative(DOCS_DIR, dir);  // e.g. "v24/kh"
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, makeRedirectHtml(relPath), 'utf8');
    console.log(`  ✓ docs/${relPath}/index.html`);
  }

  // ── Phase 2: Copy scheme files + generate concept files in dist/ ──
  if (!statSync(DIST_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    console.log('\ndist/ not found — skipping deployment asset generation.');
    return;
  }

  console.log('\nPhase 2: Copying vocabulary scheme files to dist/ ...');
  for (const dir of vocabDirs) {
    const relPath = relative(DOCS_DIR, dir);
    const distVocabDir = join(DIST_DIR, relPath);
    mkdirSync(distVocabDir, { recursive: true });
    copyFileSync(join(dir, 'index.json'), join(distVocabDir, 'index.json'));
    copyFileSync(join(dir, 'index.html'), join(distVocabDir, 'index.html'));
    console.log(`  ✓ dist/${relPath}/  (index.json + index.html)`);
  }

  console.log('\nPhase 3: Generating individual concept files in dist/ ...');
  let conceptCount = 0;

  for (const dir of vocabDirs) {
    const relPath = relative(DOCS_DIR, dir);  // e.g. "v24/kh"
    const jsonPath = join(dir, 'index.json');
    const scheme = JSON.parse(readFileSync(jsonPath, 'utf8'));

    const schemeId: string = scheme.id;           // e.g. "https://w3id.org/iqb/v24/kh/"
    const context = scheme['@context'];
    const topConcepts: any[] = scheme.hasTopConcept ?? [];
    const topConceptIds = new Set(topConcepts.map((c: any) => c.id));
    const allConcepts = collectAllConcepts(topConcepts);

    for (const concept of allConcepts) {
      // Extract the suffix after the scheme URI  (e.g. "r5f" from ".../v24/kh/r5f")
      const suffix = concept.id.startsWith(schemeId)
        ? concept.id.slice(schemeId.length).replace(/\/+$/, '')
        : null;

      if (!suffix) {
        console.warn(`  ⚠ Could not extract suffix for ${concept.id} (scheme: ${schemeId})`);
        continue;
      }

      const conceptDistDir = join(DIST_DIR, relPath, suffix);
      mkdirSync(conceptDistDir, { recursive: true });

      // Write concept JSON-LD
      const conceptDoc = makeConceptJsonLd(
        concept,
        schemeId,
        topConceptIds.has(concept.id),
        context,
      );
      writeFileSync(
        join(conceptDistDir, 'index.json'),
        JSON.stringify(conceptDoc, null, 2) + '\n',
        'utf8',
      );

      // Write concept redirect HTML (for browser access)
      const hashPath = `${relPath}/${suffix}`;  // e.g. "v24/kh/r5f"
      writeFileSync(
        join(conceptDistDir, 'index.html'),
        makeRedirectHtml(hashPath),
        'utf8',
      );

      conceptCount++;
    }

    if (allConcepts.length > 0) {
      console.log(`  ✓ dist/${relPath}/  → ${allConcepts.length} concept(s)`);
    }
  }

  console.log(`\n✅ Done. ${vocabDirs.length} schemes, ${conceptCount} individual concepts.`);
}

try {
  main();
} catch (err: any) {
  console.error('Error preparing deployment assets:', err.message);
  process.exit(1);
}
