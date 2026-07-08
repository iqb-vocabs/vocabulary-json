import type { Concept, ConceptScheme, LocalizedString, VocabCategory, VocabFile } from './types';

// Vite glob import — picks up every index.json under docs/ at any depth
const jsonModules = import.meta.glob('../docs/**/index.json', { eager: true });

export function loadVocabFiles(): VocabFile[] {
  const files: VocabFile[] = [];

  for (const [path, mod] of Object.entries(jsonModules)) {
    // path looks like: ../docs/Bildungstandards/v51/im/index.json
    const segments = path.replace('../docs/', '').split('/');
    // segments: ["Bildungstandards", "v51", "im", "index.json"]

    if (segments.length < 3) continue; // need at least category + version + file

    const category = segments[0];
    const versionParts = segments.slice(1, -1); // everything between category and index.json
    const version = versionParts.join('/');      // e.g. "v51/im"
    const name = versionParts.join(' · ');       // e.g. "v51 · im"

    files.push({
      path: path.replace('../', ''),
      category,
      version,
      name,
      data: (mod as { default: ConceptScheme }).default,
    });
  }

  // Sort by category then version
  files.sort((a, b) =>
    a.category.localeCompare(b.category) || a.version.localeCompare(b.version)
  );

  return files;
}

/** Group files by category */
export function groupByCategory(files: VocabFile[]): VocabCategory[] {
  const map = new Map<string, VocabFile[]>();
  for (const f of files) {
    if (!map.has(f.category)) map.set(f.category, []);
    map.get(f.category)!.push(f);
  }
  return Array.from(map.entries()).map(([name, files]) => ({ name, files }));
}

export function getLabel(obj: LocalizedString | undefined, lang = 'de'): string {
  if (!obj) return '';
  return obj[lang] ?? obj['en'] ?? Object.values(obj)[0] ?? '';
}

export function searchConcepts(concepts: Concept[], query: string, lang = 'de'): Concept[] {
  const q = query.toLowerCase();
  const results: Concept[] = [];

  function walk(list: Concept[]) {
    for (const c of list) {
      const label = getLabel(c.prefLabel, lang).toLowerCase();
      const def = getLabel(c.definition, lang).toLowerCase();
      const notation = (c.notation ?? []).join(' ').toLowerCase();
      if (label.includes(q) || def.includes(q) || notation.includes(q)) {
        results.push(c);
      }
      if (c.narrower?.length) walk(c.narrower);
    }
  }

  walk(concepts);
  return results;
}
