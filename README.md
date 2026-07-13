# IQB Vocabulary Explorer

An interactive web application for browsing, searching, and visualizing [SKOS](https://www.w3.org/TR/skos-reference/) concept schemes published by the [IQB (Institut zur Qualitätsentwicklung im Bildungswesen)](https://www.iqb.hu-berlin.de/). Vocabularies are stored as JSON-LD and automatically synchronized from their upstream Turtle (`.ttl`) source repositories.

---

## Features

- **Dashboard** — categorized overview of all available vocabulary schemes with concept counts
- **Tree view** — hierarchical browsing of concepts and sub-concepts
- **Card view** — compact grid layout for quick scanning
- **Ontology graph** — interactive force-directed bubble diagram showing concept hierarchy
- **Full-text search** — search across labels, definitions, and notations
- **Concept detail panel** — view `prefLabel`, `altLabel`, `definition`, `notation`, and raw JSON
- **Multilingual UI** — German and English interface (DE / EN toggle)
- **JSON download** — one-click download of the active concept scheme as JSON-LD
- **Deep links** — concept schemes and individual concepts are bookmarkable via URL hash

---

## Vocabulary Categories

Vocabularies are organized into four categories, each sourced from dedicated `iqb-vocabs/v*` GitHub repositories:

| Category | Description |
|---|---|
| **Aufgaben und Items** | Task and item classification vocabularies |
| **Bildungsstandards** | Educational standards and competency frameworks |
| **Skalen** | Rating scales and measurement instruments |
| **Forschungsdaten** | Research data vocabularies |

---

## Project Structure

```
vocabulary-json/
├── docs/                   # Generated JSON-LD files (one per sub-vocabulary)
│   └── v{xx}/{sub}/index.json
├── ttl/                    # Raw Turtle source files (downloaded from upstream)
│   └── v{xx}/{sub}.ttl
├── scripts/
│   ├── sync-vocab.ts       # Fetches TTL files from GitHub API & converts them to JSON
│   └── ttl-to-json.ts      # Core TTL → JSON-LD converter
├── src/
│   ├── main.ts             # Application entry point & all UI rendering logic
│   ├── data.ts             # Vocab file loader, grouping, and search utilities
│   ├── types.ts            # TypeScript interfaces (Concept, ConceptScheme, VocabFile, …)
│   ├── i18n.ts             # German / English translation strings
│   └── style.css           # Global styles (IQB design system)
├── vocab-registry.json     # Maps each v{xx} repo → category + sub-vocabulary list
├── index.html              # App shell
├── vite.config.ts          # Vite build configuration
└── .github/workflows/
    └── sync.yml            # CI/CD: auto-sync + rebuild on upstream vocab changes
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- npm ≥ 9

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

The app is served at `http://localhost:5173` by default.

### Build for production

```bash
npm run build
```

The production bundle is written to `dist/`.

---

## Vocabulary Synchronization

The `docs/` folder is populated by the synchronization pipeline. You can run it manually or let GitHub Actions handle it automatically.

### Manual sync (single vocabulary)

```bash
npm run sync-vocab -- v06
```

This will:
1. Read the entry for `v06` from `vocab-registry.json`
2. Fetch all `.ttl` files from `https://github.com/iqb-vocabs/v06` via the GitHub API
3. Write the raw TTL to `ttl/v06/`
4. Convert each file to JSON-LD and write it to `docs/v06/{sub}/index.json`

Set the `GITHUB_TOKEN` environment variable to avoid GitHub API rate limits:

```bash
GITHUB_TOKEN=ghp_… npm run sync-vocab -- v06
```

### Manual TTL → JSON conversion (without network)

If you already have TTL files locally:

```bash
npm run ttl-to-json
```

---

## Automated CI/CD Pipeline

The workflow in `.github/workflows/sync.yml` runs automatically when an upstream vocabulary repository sends a `repository_dispatch` event of type `vocab-updated`.

**Pipeline steps:**

1. Checkout this repository (using a PAT for push permissions)
2. Run `sync-vocab.ts` to fetch & convert the updated vocabulary
3. Commit any changes to `docs/` and `ttl/` back to the repo
4. Rebuild the Vite app
5. Deploy the updated `dist/` to **GitHub Pages**

The workflow can also be triggered manually via `workflow_dispatch` from the GitHub Actions UI, specifying the target repo name (e.g. `v05`).

> **Required secrets:**
> - `VOCAB_JSON_TOKEN` — a GitHub Personal Access Token with `repo` write scope (needed to commit and push back)

---

## Adding or Updating a Vocabulary

### 1. Register the vocabulary

Add an entry to `vocab-registry.json`:

```json
"v99": {
  "category": "Bildungsstandards",
  "subVocabs": ["a1", "k1"]
}
```

The `subVocabs` list must match the base filenames of the `.ttl` files in `iqb-vocabs/v99` (without the `.ttl` extensio
### 2. Sync the vocabulary

```bash
npm run sync-vocab -- v99
```

This creates `docs/v99/a1/index.json` and `docs/v99/k1/index.json` (and the corresponding TTL copies under `ttl/`).

### 3. Verify in the app

Start the dev server (`npm run dev`) and navigate to the new vocabulary in the dashboard.

---

## Data Format

Each vocabulary file (`docs/v{xx}/{sub}/index.json`) is a JSON-LD document following the [SKOS](https://www.w3.org/TR/skos-reference/) vocabulary:

```json
{
  "@context": { ... },
  "id": "https://w3id.org/iqb/v06/t1/",
  "type": "skos:ConceptScheme",
  "title": { "de": "Aufgabenformat", "en": "Task Format" },
  "description": { "de": "..." },
  "license": { "id": "https://creativecommons.org/licenses/by/4.0/" },
  "hasTopConcept": [
    {
      "id": "https://w3id.org/iqb/v06/t1/a",
      "prefLabel": { "de": "Auswahlformat", "en": "Selection Format" },
      "notation": ["a"],
      "narrower": [ ... ]
    }
  ]
}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | Vanilla TypeScript + HTML |
| Build tool | [Vite](https://vitejs.dev/) 8 |
| Language | TypeScript 6 |
| Script runner | [tsx](https://github.com/privatenumber/tsx) |
| Styling | Vanilla CSS (Source Sans 3 / Source Code Pro) |
| Data format | JSON-LD / SKOS |
| Deployment | GitHub Pages |

---

## License

Vocabularies are published by the [IQB](https://www.iqb.hu-berlin.de/) under the [Creative Commons Zero v1.0 Universal (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/) license — effectively placing them in the public domain. See individual concept schemes for any exceptions.
