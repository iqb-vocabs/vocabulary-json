export interface LocalizedString {
  [lang: string]: string;
}

export interface Concept {
  id: string;
  notation?: string[];
  prefLabel?: LocalizedString;
  altLabel?: LocalizedString | LocalizedString[];
  definition?: LocalizedString;
  note?: LocalizedString | LocalizedString[];
  narrower?: Concept[];
  related?: { id: string }[];
  deprecated?: boolean;
  isReplacedBy?: { id: string }[];
}

export interface ConceptScheme {
  id: string;
  type: string;
  title: LocalizedString;
  description?: LocalizedString;
  license?: { id: string };
  hasTopConcept: Concept[];
  '@context'?: Record<string, unknown>;
}

export interface VocabFile {
  path: string;   // full path e.g. docs/Bildungstandards/v51/im/index.json
  category: string; // e.g. "Bildungstandards"
  version: string;  // e.g. "v51/im"
  name: string;     // e.g. "v51 · im"
  data: ConceptScheme;
  versionFolder: string;
  subVocabFolder: string;
  subcategoryName: string;
  shortTitle: string;
}

/** A category groups one or more VocabFiles */
export interface VocabCategory {
  name: string;
  files: VocabFile[];
}

export type ViewMode = 'tree' | 'cards' | 'search';
export type Lang = 'de' | 'en';
