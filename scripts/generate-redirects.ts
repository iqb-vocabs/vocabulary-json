import { readdirSync, statSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_DIR = join(ROOT, 'docs');
const DIST_DIR = join(ROOT, 'dist');

// Recursive helper to find all directories containing index.json
function getVocabDirs(dir: string): string[] {
  const results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
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

// Generate the HTML redirect page content
function getRedirectHtml(relativePath: string): string {
  const segmentCount = relativePath.split(/[/\\]/).filter(Boolean).length;
  const backToRoot = '../'.repeat(segmentCount);
  const hashTarget = `${backToRoot}#${relativePath.replace(/\\/g, '/')}`;

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>IQB Vocabulary Explorer</title>
    <script>
      // Redirect to the main explorer page with the appropriate hash route
      window.location.replace("${hashTarget}");
    </script>
  </head>
  <body>
    <p>Redirecting to <a href="${hashTarget}">Vocabulary Explorer</a>...</p>
  </body>
</html>
`;
}

// Main execution
function main() {
  console.log('Generating redirect index.html files under docs/ ...');
  const vocabDirs = getVocabDirs(DOCS_DIR);

  for (const dir of vocabDirs) {
    const relPath = relative(DOCS_DIR, dir);
    const htmlContent = getRedirectHtml(relPath);
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`  Generated redirect for: docs/${relPath}/index.html`);
  }

  // If dist/ folder exists (runs post-build), copy all docs/ subdirectories to dist/
  if (statSync(DIST_DIR).isDirectory()) {
    console.log('\nCopying docs/ folders to dist/ ...');
    for (const dir of vocabDirs) {
      const relPath = relative(DOCS_DIR, dir);
      const distVocabDir = join(DIST_DIR, relPath);
      mkdirSync(distVocabDir, { recursive: true });

      // Copy index.json
      copyFileSync(join(dir, 'index.json'), join(distVocabDir, 'index.json'));
      // Copy index.html
      copyFileSync(join(dir, 'index.html'), join(distVocabDir, 'index.html'));
      console.log(`  Copied docs/${relPath}/ -> dist/${relPath}/`);
    }
    console.log('\nDeployment assets prepared successfully in dist/.');
  }
}

try {
  main();
} catch (err: any) {
  console.error('Error preparing redirects & build assets:', err.message);
  process.exit(1);
}
