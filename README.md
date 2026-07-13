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


## License

Vocabularies are published by the [IQB](https://www.iqb.hu-berlin.de/) under the [Creative Commons Zero v1.0 Universal (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/) license — effectively placing them in the public domain. See individual concept schemes for any exceptions.
