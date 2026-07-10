import type { Concept, VocabFile, VocabCategory } from './types';
import { loadVocabFiles, groupByCategory, getLabel, searchConcepts } from './data';
import { t } from './i18n';

// ── State ────────────────────────────────────────────────
let vocabFiles: VocabFile[] = [];
let categories: VocabCategory[] = [];
let activeFileIndex: number | null = null; // null means show dashboard by default
let viewMode: 'tree' | 'cards' | 'bubble' | 'search' = 'tree';
let lang: 'de' | 'en' = 'de';
let searchQuery = '';
let openGroupIds = new Set<string>();

// ── Bootstrap ────────────────────────────────────────────
function init() {
  vocabFiles = loadVocabFiles();
  categories = groupByCategory(vocabFiles);
  // Default to the first v12 vocabulary instead of the dashboard
  const defaultIdx = vocabFiles.findIndex(f => f.versionFolder === 'v12');
  activeFileIndex = defaultIdx !== -1 ? defaultIdx : null;
  renderApp();
}

// ── Root render ──────────────────────────────────────────
function renderApp() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.appendChild(buildHeader());
  app.appendChild(buildMain());
  app.appendChild(buildDetailPanel());
  app.appendChild(buildFooter());
}

// ── Header ───────────────────────────────────────────────
function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  const activeFile = activeFileIndex !== null ? vocabFiles[activeFileIndex] : null;
  const activeLabel = activeFile ? getLabel(activeFile.data.title, lang) : t('select_vocab', lang);

  const isTreeActive = activeFileIndex !== null && viewMode === 'tree';
  const isCardsActive = activeFileIndex !== null && viewMode === 'cards';
  const isBubbleActive = activeFileIndex !== null && viewMode === 'bubble';

  // Build three-level dropdown: category → subcategory → files
  const dropdownContent = categories.map((cat, catIdx) => {
    const subGroupsMap = new Map<string, { name: string, versionFolder: string, files: VocabFile[] }>();
    for (const f of cat.files) {
      const key = f.subcategoryName;
      if (!subGroupsMap.has(key)) {
        subGroupsMap.set(key, { name: f.subcategoryName, versionFolder: f.versionFolder, files: [] });
      }
      subGroupsMap.get(key)!.files.push(f);
    }

    const subcategoryContent = Array.from(subGroupsMap.values()).map((subGroup) => {
      const fileItems = subGroup.files.map((f) => {
        const globalIdx = vocabFiles.indexOf(f);
        const isActive = globalIdx === activeFileIndex;
        return `
          <button class="vocab-dropdown-file ${isActive ? 'active' : ''}" id="vocab-drop-${globalIdx}">
            <span class="vocab-dropdown-file-title">${f.shortTitle}</span>
            <span class="vocab-dropdown-file-version">${f.subVocabFolder}</span>
          </button>
        `;
      }).join('');

      return `
        <div class="vocab-dropdown-subcategory">
          <div class="vocab-dropdown-sub-header">
            <span class="vocab-dropdown-sub-name">${subGroup.name}</span>
            <span class="vocab-dropdown-sub-version">${subGroup.versionFolder}</span>
          </div>
          <div class="vocab-dropdown-sub-files">
            ${fileItems}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="vocab-dropdown-category" id="vocab-cat-${catIdx}">
        <button class="vocab-dropdown-cat-header" id="vocab-cat-btn-${catIdx}">
          <span class="vocab-dropdown-cat-name">${cat.name}</span>
          <span class="vocab-dropdown-cat-count">${cat.files.length}</span>
          <svg class="vocab-cat-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="vocab-dropdown-cat-files" id="vocab-cat-files-${catIdx}">
          ${subcategoryContent}
        </div>
      </div>
    `;
  }).join('');

  header.innerHTML = `
    <div class="header-logo-wrap">
      <button class="header-logo" id="logo-btn" title="${t('go_to_dashboard', lang)}">
        <img class="iqb-logo-img" src="${lang === 'de' ? 'https://www.iqb.hu-berlin.de/static/Img/Logo/iqb-logos/iqb-logo-red-name.fafaa6b5a6cb.svg' : 'https://www.iqb.hu-berlin.de/static/Img/Logo/iqb-logos/iqb-logo-red-name-en.d4d1e8c4550c.svg'}" alt="IQB Logo" />
      </button>
    </div>

    <div class="vocab-selector-wrap">
      <button class="vocab-selector-btn" id="vocab-selector-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="vocab-selector-text">${activeLabel}</span>
        <svg class="logo-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="vocab-dropdown" id="vocab-dropdown" role="menu">
        <div class="vocab-dropdown-label">${t('select_vocab', lang)}</div>
        ${dropdownContent}
      </div>
    </div>

    <div class="header-spacer"></div>

    <div class="view-toggle">
      <button id="btn-tree"  class="${isTreeActive ? 'active' : ''}" title="${t('tree_view', lang)}">
        ${iconTree()} ${t('tree', lang)}
      </button>
      <button id="btn-cards" class="${isCardsActive ? 'active' : ''}" title="${t('card_view', lang)}">
        ${iconCards()} ${t('cards', lang)}
      </button>
      <button id="btn-bubble" class="${isBubbleActive ? 'active' : ''}" title="${t('ontology_graph', lang)}">
        ${iconBubble()} ${t('graph', lang)}
      </button>
    </div>
    <div class="search-wrap">
      ${iconSearch()}
      <input id="global-search" type="search" placeholder="${t('search_concepts_placeholder', lang)}" value="${searchQuery}" />
    </div>

    <div class="lang-toggle">
      <button class="lang-btn ${lang === 'de' ? 'active' : ''}" id="btn-lang-de">DE</button>
      <button class="lang-btn ${lang === 'en' ? 'active' : ''}" id="btn-lang-en">EN</button>
    </div>
  `;

  // Logo button goes to Dashboard (null)
  const logoBtn = header.querySelector<HTMLButtonElement>('#logo-btn')!;
  logoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    activeFileIndex = null;
    viewMode = 'tree';
    searchQuery = '';
    openGroupIds.clear();
    rerender();
  });

  // Selector dropdown
  const vocabSelectorTrigger = header.querySelector<HTMLButtonElement>('#vocab-selector-trigger')!;
  const dropdown = header.querySelector<HTMLDivElement>('#vocab-dropdown')!;

  vocabSelectorTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    vocabSelectorTrigger.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  // Category expand/collapse inside dropdown
  categories.forEach((cat, catIdx) => {
    const catBtn = header.querySelector(`#vocab-cat-btn-${catIdx}`)!;
    const catFiles = header.querySelector<HTMLDivElement>(`#vocab-cat-files-${catIdx}`)!;
    const catEl = header.querySelector(`#vocab-cat-${catIdx}`)!;

    const containsActive = activeFileIndex !== null && cat.files.some((f) => vocabFiles.indexOf(f) === activeFileIndex);
    if (containsActive) {
      catFiles.classList.add('open');
      catEl.classList.add('expanded');
    }

    catBtn.addEventListener('click', () => {
      const isOpen = catFiles.classList.toggle('open');
      catEl.classList.toggle('expanded', isOpen);
    });

    cat.files.forEach((f) => {
      const globalIdx = vocabFiles.indexOf(f);
      header.querySelector(`#vocab-drop-${globalIdx}`)!.addEventListener('click', () => {
        activeFileIndex = globalIdx;
        if (viewMode === 'search') {
          viewMode = 'tree';
        }
        openGroupIds.clear();
        dropdown.classList.remove('open');
        rerender();
      });
    });
  });

  // Listeners for view toggle buttons
  header.querySelector('#btn-tree')!.addEventListener('click', () => {
    if (activeFileIndex === null && vocabFiles.length > 0) {
      activeFileIndex = 0;
    }
    setViewMode('tree');
  });
  header.querySelector('#btn-cards')!.addEventListener('click', () => {
    if (activeFileIndex === null && vocabFiles.length > 0) {
      activeFileIndex = 0;
    }
    setViewMode('cards');
  });
  header.querySelector('#btn-bubble')!.addEventListener('click', () => {
    if (activeFileIndex === null && vocabFiles.length > 0) {
      activeFileIndex = 0;
    }
    setViewMode('bubble');
  });


  const searchInput = header.querySelector<HTMLInputElement>('#global-search')!;
  searchInput.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    if (searchQuery.length > 0) {
      setViewMode('search');
    } else {
      if (activeFileIndex === null) {
        viewMode = 'tree';
      }
      rerender();
    }
  });

  header.querySelector('#btn-lang-de')!.addEventListener('click', () => { lang = 'de'; rerender(); });
  header.querySelector('#btn-lang-en')!.addEventListener('click', () => { lang = 'en'; rerender(); });

  return header;
}

// ── Main content ─────────────────────────────────────────
function buildMain(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'main-content';

  if (activeFileIndex === null) {
    if (viewMode === 'search' || searchQuery) {
      main.appendChild(buildSearchView());
      return main;
    }
    main.appendChild(buildDashboard());
    return main;
  }

  const activeFile = vocabFiles[activeFileIndex];

  // Scheme header
  const schemeHeader = document.createElement('div');
  schemeHeader.className = 'scheme-header animate-in';
  schemeHeader.innerHTML = `
    <div class="scheme-header-id">${activeFile.data.id}</div>
    <h1>${getLabel(activeFile.data.title, lang)}</h1>
    ${activeFile.data.description ? `<p class="scheme-header-desc">${getLabel(activeFile.data.description, lang)}</p>` : ''}
    <div class="scheme-header-meta">
      <span class="badge accent-1">SKOS ConceptScheme</span>
      <span class="badge accent-2">${activeFile.category} · ${activeFile.version}</span>
      <button class="scheme-download-btn" id="scheme-download-json" title="Download JSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download JSON
      </button>
    </div>
  `;
  
  const downloadBtn = schemeHeader.querySelector('#scheme-download-json')!;
  downloadBtn.addEventListener('click', () => {
    const jsonString = JSON.stringify(activeFile.data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `${activeFile.versionFolder}_${activeFile.subVocabFolder}.json`;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  });

  main.appendChild(schemeHeader);

  const content = document.createElement('div');
  content.className = 'animate-in';

  if (viewMode === 'tree') {
    content.appendChild(buildTreeView(activeFile.data.hasTopConcept));
  } else if (viewMode === 'cards') {
    content.appendChild(buildCardsView(activeFile.data.hasTopConcept));
  } else if (viewMode === 'bubble') {
    content.appendChild(buildBubbleView(activeFile.data.hasTopConcept));
  } else {
    content.appendChild(buildSearchView());
  }

  main.appendChild(content);
  return main;
}

// ── Tree view ─────────────────────────────────────────────
function buildTreeView(concepts: Concept[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tree-view';

  concepts.forEach((top, idx) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'tree-group';

    const isOpen = openGroupIds.has(top.id);
    const notation = top.notation?.[0] ?? String(idx + 1);
    const childCount = top.narrower?.length ?? 0;
    const depthClass = `depth-color-${idx % 4}`;

    const childrenEl = document.createElement('div');
    childrenEl.className = `tree-children ${isOpen ? 'open' : ''}`;

    const headerEl = document.createElement('div');
    headerEl.className = `tree-group-header ${isOpen ? 'expanded' : ''}`;
    headerEl.innerHTML = `
      <div class="tree-group-number ${depthClass}">${notation}</div>
      <div class="tree-group-label">${getLabel(top.prefLabel, lang)}</div>
      ${childCount ? `<span class="tree-group-count">${childCount} ${t('sub', lang)}</span>` : ''}
      ${childCount ? `<svg class="tree-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>` : ''}
    `;

    headerEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tree-group-label')) {
        e.stopPropagation();
        openDetail(top);
        return;
      }
      if (openGroupIds.has(top.id)) openGroupIds.delete(top.id);
      else openGroupIds.add(top.id);
      headerEl.classList.toggle('expanded');
      childrenEl.classList.toggle('open');
    });

    headerEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openDetail(top);
    });

    groupEl.appendChild(headerEl);

    if (childCount) {
      renderTreeItems(top.narrower!, childrenEl, 1);
      groupEl.appendChild(childrenEl);
    }

    wrap.appendChild(groupEl);
  });

  return wrap;
}

function renderTreeItems(concepts: Concept[], container: HTMLElement, depth: number) {
  for (const c of concepts) {
    const item = document.createElement('div');
    item.className = `tree-item depth-${Math.min(depth, 3)}`;
    item.innerHTML = `
      <span class="tree-item-notation">${c.notation?.[0] ?? ''}</span>
      <span class="tree-item-label">${getLabel(c.prefLabel, lang)}</span>
    `;
    item.addEventListener('click', () => openDetail(c));
    container.appendChild(item);

    if (c.narrower?.length) {
      renderTreeItems(c.narrower, container, depth + 1);
    }
  }
}

// ── Cards view ────────────────────────────────────────────
function buildCardsView(concepts: Concept[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cards-view';

  concepts.forEach((c, idx) => {
    const card = document.createElement('div');
    card.className = 'concept-card animate-in';
    (card as HTMLElement).style.animationDelay = `${idx * 40}ms`;

    const childCount = c.narrower?.length ?? 0;
    const notation = c.notation?.[0] ?? String(idx + 1);
    const def = getLabel(c.definition, lang);

    card.innerHTML = `
      <div class="concept-card-header">
        <h2 class="concept-card-title">${getLabel(c.prefLabel, lang)}</h2>
        <span class="concept-card-notation">${notation}</span>
      </div>
      ${def ? `<p class="concept-card-def">${def}</p>` : ''}
      <div class="concept-card-footer">
        <span class="concept-card-children">
          ${childCount ? `${iconChildren()} ${childCount} ${t('sub_concepts', lang)}` : ''}
        </span>
        <span class="badge accent-1">${t('view_details', lang)}</span>
      </div>
    `;

    card.addEventListener('click', () => openDetail(c));
    wrap.appendChild(card);
  });

  return wrap;
}

function buildSearchView(): HTMLElement {
  const wrap = document.createElement('div');

  if (activeFileIndex === null) {
    if (!searchQuery) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>${t('search_prompt', lang)}</p>
        </div>
      `;
      return wrap;
    }

    interface GlobalSearchResult {
      fileIdx: number;
      file: VocabFile;
      concepts: Concept[];
    }
    const allResults: GlobalSearchResult[] = [];
    let totalCount = 0;

    vocabFiles.forEach((f, idx) => {
      const res = searchConcepts(f.data.hasTopConcept, searchQuery, lang);
      if (res.length > 0) {
        allResults.push({
          fileIdx: idx,
          file: f,
          concepts: res
        });
        totalCount += res.length;
      }
    });

    const hdr = document.createElement('div');
    hdr.className = 'search-results-header';
    hdr.innerHTML = `
      <span>${t('results_for', lang)} <strong>"${escapeHtml(searchQuery)}"</strong></span>
      <span class="search-count">${totalCount}</span>
    `;
    wrap.appendChild(hdr);

    if (totalCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="empty-state-icon">😕</div><p>${t('no_results', lang)}</p>`;
      wrap.appendChild(empty);
      return wrap;
    }

    allResults.forEach((group, gIdx) => {
      const groupSec = document.createElement('div');
      groupSec.className = 'search-results-group';

      const groupTitle = document.createElement('h3');
      groupTitle.className = 'search-results-group-title';
      groupTitle.textContent = `${getLabel(group.file.data.title, lang)} (${group.file.category} · ${group.file.version})`;
      groupSec.appendChild(groupTitle);

      group.concepts.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'search-result-item animate-in';
        item.style.animationDelay = `${(gIdx * 2 + idx) * 20}ms`;

        const label = getLabel(c.prefLabel, lang);
        item.innerHTML = `
          ${c.notation?.[0] ? `<div class="search-result-notation">${c.notation[0]}</div>` : ''}
          <div class="search-result-body">
            <div class="search-result-label">${highlight(label, searchQuery)}</div>
            <div class="search-result-id">${c.id}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          activeFileIndex = group.fileIdx;
          viewMode = 'tree';
          rerender();
          openDetail(c);
        });
        groupSec.appendChild(item);
      });
      wrap.appendChild(groupSec);
    });

    return wrap;
  }

  const activeFile = vocabFiles[activeFileIndex];
  if (!activeFile) return wrap;
  const results = searchQuery
    ? searchConcepts(activeFile.data.hasTopConcept, searchQuery, lang)
    : [];

  if (!searchQuery) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>${t('search_prompt', lang)}</p>
      </div>
    `;
    return wrap;
  }

  const hdr = document.createElement('div');
  hdr.className = 'search-results-header';
  hdr.innerHTML = `
    <span>${t('results_for', lang)} <strong>"${escapeHtml(searchQuery)}"</strong></span>
    <span class="search-count">${results.length}</span>
  `;
  wrap.appendChild(hdr);

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-state-icon">😕</div><p>${t('no_results', lang)}</p>`;
    wrap.appendChild(empty);
    return wrap;
  }

  results.forEach((c, idx) => {
    const item = document.createElement('div');
    item.className = 'search-result-item animate-in';
    (item as HTMLElement).style.animationDelay = `${idx * 25}ms`;

    const label = getLabel(c.prefLabel, lang);
    item.innerHTML = `
      ${c.notation?.[0] ? `<div class="search-result-notation">${c.notation[0]}</div>` : ''}
      <div class="search-result-body">
        <div class="search-result-label">${highlight(label, searchQuery)}</div>
        <div class="search-result-id">${c.id}</div>
      </div>
    `;
    item.addEventListener('click', () => openDetail(c));
    wrap.appendChild(item);
  });

  return wrap;
}

// ── Detail panel ──────────────────────────────────────────
function buildDetailPanel(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  overlay.id = 'detail-overlay';
  overlay.addEventListener('click', closeDetail);

  const panel = document.createElement('div');
  panel.className = 'detail-panel';
  panel.id = 'detail-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  panel.innerHTML = `
    <div class="detail-panel-header">
      <div class="detail-panel-title" id="detail-panel-title">${t('concept_detail', lang)}</div>
      <button class="detail-close-btn" id="detail-close-btn" title="${t('close', lang)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="detail-panel-body" id="detail-panel-body"></div>
  `;

  panel.querySelector('#detail-close-btn')!.addEventListener('click', closeDetail);
  overlay.appendChild(panel);
  return overlay;
}

function openDetail(concept: Concept) {
  const overlay = document.getElementById('detail-overlay')!;
  const panel = document.getElementById('detail-panel')!;
  const body = document.getElementById('detail-panel-body')!;
  const titleEl = document.getElementById('detail-panel-title')!;

  const label = getLabel(concept.prefLabel, lang);
  titleEl.textContent = label;
  body.innerHTML = '';

  // ID
  const idSection = document.createElement('div');
  idSection.innerHTML = `
    <div class="detail-section-title">${t('identifier', lang)}</div>
    <div class="detail-id">${concept.id}</div>
  `;
  body.appendChild(idSection);

  // Label + notation
  const labelSection = document.createElement('div');
  labelSection.innerHTML = `
    <div class="detail-section-title">${t('label', lang)}</div>
    ${concept.notation?.length ? `<div style="margin-bottom:8px"><span class="detail-notation">${concept.notation.join(', ')}</span></div>` : ''}
    <div class="detail-label">${label}</div>
  `;
  body.appendChild(labelSection);

  // Definition
  const def = getLabel(concept.definition, lang);
  if (def) {
    const defSection = document.createElement('div');
    defSection.innerHTML = `
      <div class="detail-section-title">${t('definition', lang)}</div>
      <div class="detail-definition">${def}</div>
    `;
    body.appendChild(defSection);
  }

  // Children
  if (concept.narrower?.length) {
    const childSection = document.createElement('div');
    childSection.innerHTML = `<div class="detail-section-title">${t('sub_concepts', lang)} (${concept.narrower.length})</div>`;
    const list = document.createElement('div');
    list.className = 'detail-children-list';

    concept.narrower.forEach((child) => {
      const item = document.createElement('div');
      item.className = 'detail-child-item';
      item.innerHTML = `
        <span class="detail-child-notation">${child.notation?.[0] ?? ''}</span>
        <span class="detail-child-label">${getLabel(child.prefLabel, lang)}</span>
      `;
      item.addEventListener('click', () => openDetail(child));
      list.appendChild(item);
    });

    childSection.appendChild(list);
    body.appendChild(childSection);
  }



  requestAnimationFrame(() => {
    overlay.classList.add('open');
    panel.classList.add('open');
  });
}

function closeDetail() {
  const overlay = document.getElementById('detail-overlay')!;
  const panel = document.getElementById('detail-panel')!;
  overlay.classList.remove('open');
  panel.classList.remove('open');
}

// ── Helpers ───────────────────────────────────────────────
function setViewMode(mode: 'tree' | 'cards' | 'bubble' | 'search') {
  viewMode = mode;
  rerender();
}

function resolveColorWithOpacity(colorStr: string, opacity: number): string {
  let actualColor = colorStr;
  if (colorStr.startsWith('var(')) {
    const varName = colorStr.slice(4, -1).trim();
    actualColor = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  if (!actualColor) {
    actualColor = '#b40036';
  }

  if (actualColor.startsWith('#')) {
    const hex = actualColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  if (actualColor.startsWith('hsl')) {
    if (actualColor.startsWith('hsl(')) {
      return actualColor.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
    }
  }

  return actualColor;
}

function rerender() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.appendChild(buildHeader());
  app.appendChild(buildMain());
  app.appendChild(buildDetailPanel());
  app.appendChild(buildFooter());

  if (viewMode === 'search' || searchQuery) {
    const input = document.querySelector<HTMLInputElement>('#global-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}



function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlight(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

// ── Dashboard View ────────────────────────────────────────
function countConceptsTotal(concepts: Concept[]): number {
  let n = 0;
  function walk(list: Concept[]) {
    n += list.length;
    for (const c of list) {
      if (c.narrower?.length) walk(c.narrower);
    }
  }
  walk(concepts);
  return n;
}

function buildDashboard(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'dashboard animate-in';

  const hero = document.createElement('div');
  hero.className = 'dashboard-hero';
  hero.innerHTML = `
    <h1>${t('vocab_explorer', lang)}</h1>
    <p>${t('hero_subtitle', lang)}</p>
  `;
  container.appendChild(hero);

  categories.forEach((cat) => {
    const catSection = document.createElement('section');
    catSection.className = 'dashboard-cat-section collapsed';

    const catHeader = document.createElement('div');
    catHeader.className = 'dashboard-cat-header';
    catHeader.innerHTML = `
      <svg class="dashboard-cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <h2>${cat.name}</h2>
      <span class="badge accent-2">${cat.files.length} ${cat.files.length > 1 ? t('schemes', lang) : t('scheme', lang)}</span>
    `;

    catHeader.addEventListener('click', () => {
      const isCollapsed = catSection.classList.toggle('collapsed');
      if (isCollapsed) {
        catSection.classList.remove('expanded');
      } else {
        catSection.classList.add('expanded');
      }
    });

    catSection.appendChild(catHeader);

    const grid = document.createElement('div');
    grid.className = 'dashboard-vocab-grid';

    // Group files in this category by subcategoryName
    const subGroupsMap = new Map<string, { name: string, versionFolder: string, files: VocabFile[] }>();
    for (const f of cat.files) {
      const key = f.subcategoryName;
      if (!subGroupsMap.has(key)) {
        subGroupsMap.set(key, { name: f.subcategoryName, versionFolder: f.versionFolder, files: [] });
      }
      subGroupsMap.get(key)!.files.push(f);
    }

    Array.from(subGroupsMap.values()).forEach((subGroup) => {
      const card = document.createElement('div');
      card.className = 'dashboard-subcategory-card';

      const subVocabsListHTML = subGroup.files.map((f) => {
        const globalIdx = vocabFiles.indexOf(f);
        const topConcepts = f.data.hasTopConcept || [];
        const count = countConceptsTotal(topConcepts);
        return `
          <button class="dashboard-subvocab-row" data-file-index="${globalIdx}" title="${t('explore_scheme', lang)}">
            <div class="subvocab-row-left">
              <span class="subvocab-row-badge">${f.subVocabFolder}</span>
              <span class="subvocab-row-title">${f.shortTitle}</span>
            </div>
            <div class="subvocab-row-right">
              <span class="subvocab-row-count">${count} ${count === 1 ? t('concept', lang) : t('concepts', lang)}</span>
              <svg class="subvocab-row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        `;
      }).join('');

      card.innerHTML = `
        <div class="subcategory-card-header">
          <div class="subcategory-card-meta">
            <span class="subcategory-card-version">${subGroup.versionFolder}</span>
          </div>
          <h3>${subGroup.name}</h3>
        </div>
        <div class="subcategory-card-body">
          <div class="subvocab-rows-list">
            ${subVocabsListHTML}
          </div>
        </div>
      `;

      card.querySelectorAll('.dashboard-subvocab-row').forEach((row) => {
        row.addEventListener('click', () => {
          const fileIdxStr = row.getAttribute('data-file-index')!;
          activeFileIndex = parseInt(fileIdxStr, 10);
          if (viewMode === 'search') {
            viewMode = 'tree';
          }
          rerender();
        });
      });

      grid.appendChild(card);
    });

    catSection.appendChild(grid);
    container.appendChild(catSection);
  });

  return container;
}

// ── Bubble View ───────────────────────────────────────────
function buildBubbleView(topConcepts: Concept[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'bubble-view-container';

  // Navigation path / help bar
  const navBar = document.createElement('div');
  navBar.className = 'bubble-nav-bar';
  navBar.innerHTML = `
    <span class="bubble-path-text">
      <strong>${t('ontology_graph', lang)}</strong> — ${t('ontology_instructions', lang)}
    </span>
  `;
  container.appendChild(navBar);

  const canvas = document.createElement('canvas');
  canvas.className = 'bubble-canvas';
  container.appendChild(canvas);

  // Floating tooltip for truncated labels
  const tooltip = document.createElement('div');
  tooltip.className = 'bubble-tooltip';
  tooltip.style.display = 'none';
  container.appendChild(tooltip);

  const activeFile = activeFileIndex !== null ? vocabFiles[activeFileIndex] : null;
  const schemeTitle = activeFile ? getLabel(activeFile.data.title, lang) : t('vocabulary', lang);

  interface GraphNode {
    id: string;
    label: string;
    notation: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    isRoot: boolean;
    isExpanded: boolean;
    concept: Concept;
    color: string;
    dragged?: boolean;
  }

  interface GraphLink {
    sourceId: string;
    targetId: string;
  }

  const expandedNodes = new Set<string>();
  // Expand all top concepts by default so they see the interconnected graph on load
  topConcepts.forEach(c => expandedNodes.add(c.id));

  let nodes: GraphNode[] = [];
  let links: GraphLink[] = [];
  const nodesMap = new Map<string, GraphNode>();

  const ctx = canvas.getContext('2d')!;
  let animationId = 0;
  let mouseX = -1000;
  let mouseY = -1000;
  let draggedNode: GraphNode | null = null;
  let isDragging = false;

  interface HslColor { h: number; s: number; l: number; }

  function getTopConceptColor(index: number): HslColor {
    const palette: HslColor[] = [
      { h: 342, s: 85, l: 45 },  // IQB Red
      { h: 185, s: 80, l: 35 },  // IQB Teal
      { h: 38,  s: 90, l: 44 },  // Warm Orange
      { h: 262, s: 70, l: 50 },  // Purple
      { h: 327, s: 75, l: 48 },  // Pink
    ];
    return palette[index % palette.length];
  }

  function colorForDepth(base: HslColor, depth: number): string {
    // depth 0 = top concept (full saturation/darkness)
    // each level gets lighter (+12 L) and slightly less saturated (–8 S)
    const l = Math.min(base.l + depth * 12, 72);
    const s = Math.max(base.s - depth * 8,  40);
    return `hsl(${base.h}, ${s}%, ${l}%)`;
  }

  function rebuildGraph() {
    const prevMap = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    nodes.forEach(n => {
      prevMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
    });

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr || 800;
    const height = 500;

    nodes = [];
    links = [];

    // Root node representing the scheme
    const rootId = 'scheme-root';
    const prevRoot = prevMap.get(rootId);
    nodes.push({
      id: rootId,
      label: schemeTitle,
      notation: '',
      x: prevRoot ? prevRoot.x : width / 2,
      y: prevRoot ? prevRoot.y : height / 2,
      vx: prevRoot ? prevRoot.vx : 0,
      vy: prevRoot ? prevRoot.vy : 0,
      radius: 60,
      isRoot: true,
      isExpanded: true,
      concept: null as any,
      color: 'var(--accent-1)'
    });

    function traverse(concept: Concept, parentId: string, baseColor: HslColor, depth: number) {
      const conceptId = concept.id;
      const prev = prevMap.get(conceptId);

      const childCount = concept.narrower?.length ?? 0;
      const radius = Math.max(35, Math.min(65, 35 + childCount * 3));
      const notation = concept.notation?.[0] ?? '';
      const color = colorForDepth(baseColor, depth);
      const isExpanded = expandedNodes.has(conceptId);

      const node: GraphNode = {
        id: conceptId,
        label: getLabel(concept.prefLabel, lang),
        notation,
        x: prev ? prev.x : width / 2 + (Math.random() - 0.5) * 200,
        y: prev ? prev.y : height / 2 + (Math.random() - 0.5) * 200,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
        radius,
        isRoot: false,
        isExpanded,
        concept,
        color
      };

      nodes.push(node);
      links.push({ sourceId: parentId, targetId: conceptId });

      if (isExpanded && concept.narrower?.length) {
        concept.narrower.forEach(child => traverse(child, conceptId, baseColor, depth + 1));
      }
    }

    topConcepts.forEach((c, idx) => {
      const baseColor = getTopConceptColor(idx);
      traverse(c, rootId, baseColor, 0);
    });

    nodesMap.clear();
    nodes.forEach(n => nodesMap.set(n.id, n));
  }

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 800;
    const height = 500;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    rebuildGraph();
  }

  function animate() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = n1.radius + n2.radius + 35;

        if (dist < minDist) {
          const force = (minDist - dist) * 0.12;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.dragged) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.dragged) { n2.vx += fx; n2.vy += fy; }
        } else {
          const force = 120 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!n1.dragged) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.dragged) { n2.vx += fx; n2.vy += fy; }
        }
      }
    }

    // Link Springs
    links.forEach(link => {
      const source = nodesMap.get(link.sourceId);
      const target = nodesMap.get(link.targetId);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;

      const targetLen = source.isRoot ? 110 : 85;
      const strength = 0.05;
      const diff = dist - targetLen;
      const fx = (dx / dist) * diff * strength;
      const fy = (dy / dist) * diff * strength;

      if (!source.dragged) { source.vx += fx; source.vy += fy; }
      if (!target.dragged) { target.vx -= fx; target.vy -= fy; }
    });

    // Pull to center
    nodes.forEach(n => {
      if (n.dragged) return;
      const cx = width / 2;
      const cy = height / 2;
      n.vx += (cx - n.x) * 0.005;
      n.vy += (cy - n.y) * 0.005;
    });

    // Update positions
    nodes.forEach(n => {
      if (n.dragged) {
        n.x = mouseX;
        n.y = mouseY;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;

        const margin = n.radius + 10;
        if (n.x < margin) { n.x = margin; n.vx = 0; }
        if (n.x > width - margin) { n.x = width - margin; n.vx = 0; }
        if (n.y < margin) { n.y = margin; n.vy = 0; }
        if (n.y > height - margin) { n.y = height - margin; n.vy = 0; }
      }
    });

    ctx.clearRect(0, 0, width, height);

    // Render links
    ctx.lineWidth = 2.5;
    links.forEach(link => {
      const source = nodesMap.get(link.sourceId);
      const target = nodesMap.get(link.targetId);
      if (!source || !target) return;

      const grad = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
      grad.addColorStop(0, resolveColorWithOpacity(source.color, 0.35));
      grad.addColorStop(1, resolveColorWithOpacity(target.color, 0.35));

      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    });

    // Render nodes
    nodes.forEach(n => {
      const distToMouse = Math.hypot(mouseX - n.x, mouseY - n.y);
      const hovered = distToMouse < n.radius;

      ctx.save();

      ctx.shadowColor = hovered ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.05)';
      ctx.shadowBlur = hovered ? 18 : 8;
      ctx.shadowOffsetY = hovered ? 6 : 3;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      if (n.isRoot) {
        ctx.fillStyle = hovered ? 'hsl(342, 100%, 98%)' : 'white';
      } else {
        ctx.fillStyle = hovered ? resolveColorWithOpacity(n.color, 0.08) : 'white';
      }
      ctx.fill();

      ctx.lineWidth = (hovered || n.dragged) ? 3 : 1.5;
      ctx.strokeStyle = n.color;
      ctx.stroke();

      ctx.shadowColor = 'transparent';

      if (n.isRoot) {
        ctx.font = 'bold 13px var(--font-sans)';
        ctx.fillStyle = 'var(--accent-1)';
        ctx.textAlign = 'center';
        wrapText(ctx, n.label, n.x, n.y + 4, n.radius * 1.5, 16);
      } else {
        ctx.font = 'bold 11px var(--font-mono)';
        ctx.fillStyle = n.color;
        ctx.textAlign = 'center';
        ctx.fillText(n.notation, n.x, n.y - n.radius * 0.22);

        ctx.font = '600 12px var(--font-sans)';
        ctx.fillStyle = 'var(--text-primary)';
        wrapText(ctx, n.label, n.x, n.y + 5, n.radius * 1.6, 15);

        const childCount = n.concept.narrower?.length ?? 0;
        if (childCount > 0) {
          const badgeX = n.x + n.radius * 0.7;
          const badgeY = n.y + n.radius * 0.7;

          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 9, 0, Math.PI * 2);
          ctx.fillStyle = n.color;
          ctx.fill();

          ctx.font = 'bold 10px var(--font-sans)';
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.isExpanded ? '−' : '+', badgeX, badgeY);
        }
      }

      ctx.restore();
    });

    animationId = requestAnimationFrame(animate);
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);

    const maxRenderLines = Math.min(2, lines.length);
    const startY = y - ((maxRenderLines - 1) * lineHeight) / 2;
    for (let j = 0; j < maxRenderLines; j++) {
      let l = lines[j];
      if (j === 1 && lines.length > 2) l += '...';
      ctx.fillText(l, x, startY + j * lineHeight);
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    const hit = nodes.find(n => Math.hypot(mouseX - n.x, mouseY - n.y) < n.radius);
    if (hit) {
      draggedNode = hit;
      hit.dragged = true;
      isDragging = false;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (draggedNode) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    } else {
      const hover = nodes.some(n => Math.hypot(mouseX - n.x, mouseY - n.y) < n.radius);
      canvas.style.cursor = hover ? 'pointer' : 'default';
    }

    // Tooltip: show full label when hovered node's text is truncated
    const hoveredNode = nodes.find(n => Math.hypot(mouseX - n.x, mouseY - n.y) < n.radius);
    if (hoveredNode && !hoveredNode.isRoot) {
      const maxWidth = hoveredNode.radius * 1.6;
      // Measure whether the label fits in ≤2 lines at the rendered font size
      ctx.save();
      ctx.font = '600 12px var(--font-sans)';
      const words = hoveredNode.label.split(' ');
      let lineCount = 1;
      let currentLine = words[0];
      for (let i = 1; i < words.length; i++) {
        if (ctx.measureText(currentLine + ' ' + words[i]).width < maxWidth) {
          currentLine += ' ' + words[i];
        } else {
          lineCount++;
          currentLine = words[i];
        }
      }
      ctx.restore();

      const isTruncated = lineCount > 2;
      if (isTruncated) {
        const parts = [hoveredNode.notation, hoveredNode.label].filter(Boolean);
        tooltip.textContent = parts.join('  ·  ');
        const containerRect = container.getBoundingClientRect();
        // Position relative to container
        const tx = (e.clientX - containerRect.left) + 14;
        const ty = (e.clientY - containerRect.top) - 36;
        tooltip.style.left = `${tx}px`;
        tooltip.style.top  = `${ty}px`;
        tooltip.style.display = 'block';
      } else {
        tooltip.style.display = 'none';
      }
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (draggedNode) {
      draggedNode.dragged = false;

      if (!isDragging) {
        if (!draggedNode.isRoot) {
          openDetail(draggedNode.concept);
          if (draggedNode.concept.narrower?.length) {
            if (expandedNodes.has(draggedNode.id)) {
              expandedNodes.delete(draggedNode.id);
            } else {
              expandedNodes.add(draggedNode.id);
            }
            rebuildGraph();
          }
        }
      }
      draggedNode = null;
    }
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('mouseleave', () => {
    if (draggedNode) {
      draggedNode.dragged = false;
      draggedNode = null;
    }
    mouseX = -1000;
    mouseY = -1000;
    canvas.style.cursor = 'default';
    tooltip.style.display = 'none';
  });

  setTimeout(resizeCanvas, 0);
  window.addEventListener('resize', resizeCanvas);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  animate();

  return container;
}

// ── Footer ───────────────────────────────────────────────
function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <a href="https://www.iqb.hu-berlin.de/" target="_blank" rel="noopener" class="footer-logo-link" aria-label="IQB Homepage">
            <img
              src="https://www.iqb.hu-berlin.de/static/Img/Logo/iqb-logos/iqb-logo-red-name.fafaa6b5a6cb.svg"
              alt="IQB – Institut zur Qualitätsentwicklung im Bildungswesen"
              class="footer-logo-img"
            />
          </a>
          <p class="footer-tagline">Institut zur Qualitätsentwicklung im Bildungswesen</p>
        </div>

        <div class="footer-cols">
          <div class="footer-col">
            <h4 class="footer-col-title">Über das IQB</h4>
            <ul class="footer-links">
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/ueber-uns/" target="_blank" rel="noopener">Über uns</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/ueber-uns/institutsstruktur/" target="_blank" rel="noopener">Institutsstruktur</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/ueber-uns/personen/" target="_blank" rel="noopener">Personen</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/news/" target="_blank" rel="noopener">Aktuelles</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Arbeiten am IQB</h4>
            <ul class="footer-links">
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/arbeitenamiqb/" target="_blank" rel="noopener">Karriere</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/arbeitenamiqb/stellenanzeigen/" target="_blank" rel="noopener">Stellenanzeigen</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/presse-medienecho/" target="_blank" rel="noopener">Presse &amp; Medienecho</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4 class="footer-col-title">Services</h4>
            <ul class="footer-links">
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/service/portal/" target="_blank" rel="noopener">Portal</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/service/it-und-software/" target="_blank" rel="noopener">IT und Software</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/institut/service/kontakt/" target="_blank" rel="noopener">Kontakt</a></li>
              <li><a href="https://www.iqb.hu-berlin.de/de/das-iqb-in-leichter-sprache/" target="_blank" rel="noopener">Leichte Sprache</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="footer-legal">
          <a href="http://www.iqb.hu-berlin.de/de/impressum/" target="_blank" rel="noopener">Impressum</a>
          <a href="http://www.iqb.hu-berlin.de/de/datenschutz/" target="_blank" rel="noopener">Datenschutz</a>
          <a href="http://www.iqb.hu-berlin.de/de/erkl%C3%A4rung-zur-barrierefreiheit/" target="_blank" rel="noopener">Barrierefreiheit</a>
          <a href="http://www.iqb.hu-berlin.de/de/standorte/" target="_blank" rel="noopener">Standorte</a>
          <a href="https://www.iqb.hu-berlin.de/sitemap.xml" target="_blank" rel="noopener">Sitemap</a>
        </div>
        <div class="footer-social">
          <a href="https://eduresearch.social/@IQB_media" target="_blank" rel="noopener" class="footer-social-btn" aria-label="Mastodon">
            <!-- Mastodon icon -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.268 5.313c-.35-2.409-2.726-4.21-5.517-4.573C17.325.636 15.325.5 12.015.5h-.03c-3.31 0-5.307.136-5.737.24C3.482 1.105 1.017 2.807.619 5.267.447 6.35.425 7.557.456 8.645c.044 1.59.054 3.178.166 4.763.082 1.169.232 2.33.45 3.477.37 1.893 1.868 3.468 3.725 4.094 2.023.678 4.214.792 6.31.334.178-.04.355-.085.53-.134.697-.2 1.462-.447 2.017-.924a.05.05 0 0 1 .082.026l.108.875c.012.095.093.165.192.165h3.628c.11 0 .198-.09.198-.199l-.002-13.41c0-.11-.089-.199-.198-.199h-3.628c-.099 0-.18.07-.193.165l-.095.762c-.013.095-.095.164-.193.164s-.18-.069-.193-.164c-.435-2.885-3.085-4.953-6.228-4.953a6.36 6.36 0 0 0-4.426 1.741c-.073.067-.074.183-.003.252l2.607 2.607a.198.198 0 0 0 .266.009 2.754 2.754 0 0 1 1.79-.66c1.518 0 2.756 1.23 2.756 2.754v.004c0 .11.089.199.198.199h3.628c.11 0 .198-.09.198-.199v-.004c0-4.033-3.256-7.308-7.262-7.308Z"/>
            </svg>
          </a>
          <a href="https://bsky.app/profile/iqbmedia.bsky.social" target="_blank" rel="noopener" class="footer-social-btn" aria-label="Bluesky">
            <!-- Bluesky butterfly icon -->
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>
            </svg>
          </a>
          <a href="https://www.linkedin.com/company/iqb-berlin/" target="_blank" rel="noopener" class="footer-social-btn" aria-label="LinkedIn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
          <a href="https://www.youtube.com/channel/UCF6TtVNPomWyIk0BMfbyWqg" target="_blank" rel="noopener" class="footer-social-btn" aria-label="YouTube">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </a>
          <a href="https://github.com/iqb-vocabs" target="_blank" rel="noopener" class="footer-social-btn" aria-label="GitHub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
          </a>
        </div>
        <p class="footer-copyright">&copy; ${new Date().getFullYear()} IQB – Institut zur Qualitätsentwicklung im Bildungswesen, Humboldt-Universität zu Berlin</p>
      </div>
    </div>
  `;
  return footer;
}

// ── Icons ─────────────────────────────────────────────────
function iconTree() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
}
function iconCards() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
}
function iconBubble() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
}
function iconSearch() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
}
function iconChildren() {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
}

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    document.querySelector<HTMLInputElement>('#global-search')?.focus();
  }
});

// ── Start ─────────────────────────────────────────────────
init();
