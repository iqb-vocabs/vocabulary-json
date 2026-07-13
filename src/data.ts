import type { Concept, ConceptScheme, LocalizedString, VocabCategory, VocabFile } from './types';

// Vite glob import — picks up every index.json under docs/ at any depth
const jsonModules = import.meta.glob('../docs/**/index.json', { eager: true });

// vocab-registry.json — maps vxx → { category, subVocabs }
import registryRaw from '../vocab-registry.json';
const registry = registryRaw as Record<string, { category: string; subVocabs: string[] }>;

export function loadVocabFiles(): VocabFile[] {
  const files: VocabFile[] = [];

  for (const [path, mod] of Object.entries(jsonModules)) {
    // path looks like: ../docs/v51/im/index.json
    const segments = path.replace('../docs/', '').split('/');
    // segments: ["v51", "im", "index.json"]

    if (segments.length < 3) continue; // need at least vxx + sub + index.json

    const versionFolder = segments[0];          // e.g. "v51"
    const subVocabFolder = segments[segments.length - 2]; // e.g. "im"
    const versionParts = segments.slice(0, -1); // everything except index.json
    const version = versionParts.join('/');     // e.g. "v51/im"
    const name = versionParts.join(' · ');      // e.g. "v51 · im"

    // Resolve category from registry; fall back to versionFolder if unknown
    const category = registry[versionFolder]?.category ?? versionFolder;

    const data = (mod as { default: ConceptScheme }).default;
    const deTitle = data.title?.['de'] || data.title?.['en'] || Object.values(data.title || {})[0] || '';

    let subcategoryName = versionFolder;
    let shortTitle = deTitle;

    const dashIdx = deTitle.indexOf(' - ');
    if (dashIdx !== -1) {
      subcategoryName = deTitle.substring(0, dashIdx).trim();
      shortTitle = deTitle.substring(dashIdx + 3).trim();
    } else {
      const dashIdx2 = deTitle.indexOf(' – ');
      if (dashIdx2 !== -1) {
        subcategoryName = deTitle.substring(0, dashIdx2).trim();
        shortTitle = deTitle.substring(dashIdx2 + 3).trim();
      }
    }

    files.push({
      path: path.replace('../', ''),
      category,
      version,
      name,
      data,
      versionFolder,
      subVocabFolder,
      subcategoryName,
      shortTitle,
    });
  }

  // Ensure all files in the same versionFolder have the exact same subcategoryName
  const subcategoryMap = new Map<string, string>();
  for (const f of files) {
    const key = `${f.category}/${f.versionFolder}`;
    const currentVal = subcategoryMap.get(key) || '';
    if (f.subcategoryName !== f.versionFolder && f.subcategoryName.length > currentVal.length) {
      subcategoryMap.set(key, f.subcategoryName);
    }
  }

  for (const f of files) {
    const key = `${f.category}/${f.versionFolder}`;
    const alignedSubcategory = subcategoryMap.get(key);
    if (alignedSubcategory) {
      f.subcategoryName = alignedSubcategory;
    }
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
