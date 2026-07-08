#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

export interface Concept {
  id: string;
  notation?: string[];
  prefLabel?: Record<string, string>;
  definition?: Record<string, string>;
  narrower?: Concept[];
}

export interface ConceptScheme {
  id: string;
  type: 'ConceptScheme';
  title?: Record<string, string>;
  description?: Record<string, string>;
  license?: { id: string };
  hasTopConcept: Concept[];
}

interface RDFObject {
  type: 'literal' | 'uri';
  value: string;
  lang?: string;
}

type RDFProperties = Record<string, RDFObject[]>;
type RDFGraph = Record<string, RDFProperties>;

export function convertTtlToJson(ttlPath: string): ConceptScheme {
  const ttlContent = readFileSync(ttlPath, 'utf8');

  // Parse prefix mappings
  const prefixes: Record<string, string> = {
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    dct: 'http://purl.org/dc/terms/',
    dc: 'http://purl.org/dc/elements/1.1/',
  };

  const prefixRegex = /@prefix\s+([a-zA-Z0-9_-]*:)\s+<([^>]+)>\s*\./g;
  let match;
  while ((match = prefixRegex.exec(ttlContent)) !== null) {
    prefixes[match[1].slice(0, -1)] = match[2];
  }

  function expand(val: string): string {
    val = val.trim();
    if (val === 'a') {
      return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    }
    if (val.startsWith('<') && val.endsWith('>')) {
      return val.slice(1, -1);
    }
    const colonIdx = val.indexOf(':');
    if (colonIdx !== -1) {
      const prefix = val.slice(0, colonIdx);
      if (prefixes[prefix] !== undefined) {
        return prefixes[prefix] + val.slice(colonIdx + 1);
      }
    }
    return val;
  }

  // Parse statements.
  // First, remove comments (lines starting with #) and prefix declarations.
  // Normalize triple-quoted strings (replace with JSON string representation to make parsing simple).
  const normalized = ttlContent.replace(/"""([\s\S]*?)"""/g, (_, content) => {
    return JSON.stringify(content);
  });

  const cleanedLines: string[] = [];
  for (let line of normalized.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('@prefix')) {
      continue;
    }
    cleanedLines.push(line);
  }
  const cleanContent = cleanedLines.join(' ');

  // Split by statements. A statement ends with a dot.
  // Let's split by '.' but respect quotes and URIs.
  const statements: string[] = [];
  let currentStatement = '';
  let inString = false;
  let stringChar = '';
  let inUri = false;
  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    const prev = i > 0 ? cleanContent[i - 1] : '';

    if (inString) {
      if (char === stringChar && prev !== '\\') {
        inString = false;
      }
      currentStatement += char;
    } else if (inUri) {
      if (char === '>') {
        inUri = false;
      }
      currentStatement += char;
    } else {
      if ((char === '"' || char === "'") && prev !== '\\') {
        inString = true;
        stringChar = char;
        currentStatement += char;
      } else if (char === '<') {
        inUri = true;
        currentStatement += char;
      } else if (char === '.' && (i === cleanContent.length - 1 || /\s/.test(cleanContent[i + 1]))) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      } else {
        currentStatement += char;
      }
    }
  }
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  // Build the graph of subjects
  const graph: RDFGraph = {};

  for (const stmt of statements) {
    if (!stmt) continue;

    // subject is the first word
    const firstSpace = stmt.search(/\s/);
    if (firstSpace === -1) continue;
    const subjectRaw = stmt.slice(0, firstSpace).trim();
    const subject = expand(subjectRaw);

    const body = stmt.slice(firstSpace).trim();

    // Split predicates by semicolon (respecting strings)
    const predicatesRaw: string[] = [];
    let currentPred = '';
    inString = false;
    stringChar = '';
    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      const prev = i > 0 ? body[i - 1] : '';
      if (inString) {
        if (char === stringChar && prev !== '\\') {
          inString = false;
        }
        currentPred += char;
      } else {
        if ((char === '"' || char === "'") && prev !== '\\') {
          inString = true;
          stringChar = char;
          currentPred += char;
        } else if (char === ';') {
          predicatesRaw.push(currentPred.trim());
          currentPred = '';
        } else {
          currentPred += char;
        }
      }
    }
    if (currentPred.trim()) {
      predicatesRaw.push(currentPred.trim());
    }

    const properties = graph[subject] || {};

    for (const predStmt of predicatesRaw) {
      if (!predStmt) continue;
      const firstSpacePred = predStmt.search(/\s/);
      if (firstSpacePred === -1) continue;
      const predRaw = predStmt.slice(0, firstSpacePred).trim();
      const pred = expand(predRaw);
      const objectsRaw = predStmt.slice(firstSpacePred).trim();

      // Split objects by comma (respecting strings)
      const objects: string[] = [];
      let currentObj = '';
      inString = false;
      stringChar = '';
      for (let i = 0; i < objectsRaw.length; i++) {
        const char = objectsRaw[i];
        const prev = i > 0 ? objectsRaw[i - 1] : '';
        if (inString) {
          if (char === stringChar && prev !== '\\') {
            inString = false;
          }
          currentObj += char;
        } else {
          if ((char === '"' || char === "'") && prev !== '\\') {
            inString = true;
            stringChar = char;
            currentObj += char;
          } else if (char === ',') {
            objects.push(currentObj.trim());
            currentObj = '';
          } else {
            currentObj += char;
          }
        }
      }
      if (currentObj.trim()) {
        objects.push(currentObj.trim());
      }

      const parsedObjects: RDFObject[] = objects.map(obj => {
        obj = obj.trim();
        if (obj.startsWith('"') || obj.startsWith("'")) {
          const endQuoteIdx = obj.lastIndexOf(obj[0]);
          let val = obj.slice(1, endQuoteIdx);
          // Unescape
          val = val.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          const rest = obj.slice(endQuoteIdx + 1);
          if (rest.startsWith('@')) {
            return { type: 'literal', value: val, lang: rest.slice(1) };
          }
          return { type: 'literal', value: val };
        }
        return { type: 'uri', value: expand(obj) };
      });

      if (!properties[pred]) {
        properties[pred] = [];
      }
      properties[pred].push(...parsedObjects);
    }

    graph[subject] = properties;
  }

  // Find the ConceptScheme subject
  let schemeUri: string | null = null;
  for (const [subj, props] of Object.entries(graph)) {
    const types = props['http://www.w3.org/1999/02/22-rdf-syntax-ns#type'] || [];
    if (types.some(t => t.value === 'http://www.w3.org/2004/02/skos/core#ConceptScheme')) {
      schemeUri = subj;
      break;
    }
  }

  if (!schemeUri) {
    throw new Error('No skos:ConceptScheme found in Turtle file.');
  }

  const schemeProps = graph[schemeUri];

  // Helper to extract multi-language literal dictionary
  function getLangDict(propUri: string): Record<string, string> | undefined {
    const list = schemeProps[propUri] || [];
    const dict: Record<string, string> = {};
    for (const item of list) {
      if (item.type === 'literal') {
        const lang = item.lang || 'de'; // default to 'de' if none
        dict[lang] = item.value;
      }
    }
    return Object.keys(dict).length > 0 ? dict : undefined;
  }

  // Helper to extract license object
  function getLicense(): { id: string } | undefined {
    const list = schemeProps['http://purl.org/dc/terms/license'] || [];
    if (list.length > 0 && list[0].type === 'uri') {
      return { id: list[0].value };
    }
    return undefined;
  }

  // Build recursive concepts
  const visited = new Set<string>();
  function buildConcept(uri: string): Concept {
    if (visited.has(uri)) {
      console.warn(`[warning] Circular dependency detected at URI: ${uri}. Current stack:`, Array.from(visited));
      return { id: uri };
    }
    visited.add(uri);

    const conceptProps = graph[uri];
    if (!conceptProps) {
      visited.delete(uri);
      return { id: uri };
    }

    const concept: Concept = {
      id: uri
    };

    // notation
    const notations = conceptProps['http://www.w3.org/2004/02/skos/core#notation'] || [];
    if (notations.length > 0) {
      concept.notation = notations.map(n => n.value);
    }

    // prefLabel
    const prefLabels = conceptProps['http://www.w3.org/2004/02/skos/core#prefLabel'] || [];
    if (prefLabels.length > 0) {
      concept.prefLabel = {};
      for (const item of prefLabels) {
        concept.prefLabel[item.lang || 'de'] = item.value;
      }
    }

    // definition
    const definitions = conceptProps['http://www.w3.org/2004/02/skos/core#definition'] || [];
    if (definitions.length > 0) {
      concept.definition = {};
      for (const item of definitions) {
        concept.definition[item.lang || 'de'] = item.value;
      }
    }

    // children/narrower: we collect them from skos:narrower or find any other subject with broader equal to this uri
    const narrowerUris = new Set<string>();
    const narrowers = conceptProps['http://www.w3.org/2004/02/skos/core#narrower'] || [];
    for (const item of narrowers) {
      if (item.type === 'uri') narrowerUris.add(item.value);
    }

    // find other concepts with broader pointing to this uri
    for (const [subj, props] of Object.entries(graph)) {
      const broaders = props['http://www.w3.org/2004/02/skos/core#broader'] || [];
      for (const item of broaders) {
        if (item.type === 'uri' && item.value === uri) {
          narrowerUris.add(subj);
        }
      }
    }

    if (narrowerUris.size > 0) {
      const children = Array.from(narrowerUris).map(childUri => buildConcept(childUri));
      children.sort((a, b) => {
        const notA = a.notation?.[0] || '';
        const notB = b.notation?.[0] || '';
        const partsA = notA.split('.').map(Number);
        const partsB = notB.split('.').map(Number);
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const aVal = isNaN(partsA[i]) ? 0 : partsA[i];
          const bVal = isNaN(partsB[i]) ? 0 : partsB[i];
          if (aVal !== bVal) {
            return aVal - bVal;
          }
        }
        return notA.localeCompare(notB);
      });
      concept.narrower = children;
    }

    visited.delete(uri);
    return concept;
  }

  // Get Top Concepts
  const topConceptUris = new Set<string>();
  const topConceptsList = schemeProps['http://www.w3.org/2004/02/skos/core#hasTopConcept'] || [];
  for (const item of topConceptsList) {
    if (item.type === 'uri') {
      topConceptUris.add(item.value);
    }
  }

  // Also scan all concepts to find if they are topConceptsOf this scheme
  for (const [subj, props] of Object.entries(graph)) {
    const topOfs = props['http://www.w3.org/2004/02/skos/core#topConceptOf'] || [];
    for (const item of topOfs) {
      if (item.type === 'uri' && item.value === schemeUri) {
        topConceptUris.add(subj);
      }
    }
  }

  const topConcepts = Array.from(topConceptUris).map(uri => buildConcept(uri));
  topConcepts.sort((a, b) => {
    const notA = a.notation?.[0] || '';
    const notB = b.notation?.[0] || '';
    const partsA = notA.split('.').map(Number);
    const partsB = notB.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const aVal = isNaN(partsA[i]) ? 0 : partsA[i];
      const bVal = isNaN(partsB[i]) ? 0 : partsB[i];
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }
    return notA.localeCompare(notB);
  });

  return {
    id: schemeUri,
    type: 'ConceptScheme',
    title: getLangDict('http://purl.org/dc/terms/title'),
    description: getLangDict('http://purl.org/dc/terms/description'),
    license: getLicense(),
    hasTopConcept: topConcepts
  };
}

// CLI entry point
if (process.argv[1] && (resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)) || process.argv[1].endsWith('ttl-to-json.ts') || process.argv[1].endsWith('ttl-to-json.js'))) {
  const ttlPath = process.argv[2];
  const jsonPath = process.argv[3];
  if (!ttlPath || !jsonPath) {
    console.error('Usage: npx tsx scripts/ttl-to-json.ts <ttlPath> <jsonPath>');
    process.exit(1);
  }
  try {
    const result = convertTtlToJson(ttlPath);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(`Successfully converted ${ttlPath} -> ${jsonPath}`);
  } catch (err: any) {
    console.error(`Error converting TTL to JSON:`, err);
    process.exit(1);
  }
}
