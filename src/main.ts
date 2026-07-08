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
  renderApp();
}

// ── Root render ──────────────────────────────────────────
function renderApp() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.appendChild(buildHeader());
  app.appendChild(buildMain());
  app.appendChild(buildDetailPanel());
}

// ── Header ───────────────────────────────────────────────
function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  const activeFile = activeFileIndex !== null ? vocabFiles[activeFileIndex] : null;
  const activeLabel = activeFile ? getLabel(activeFile.data.title, lang) : t('select_vocab', lang);
  const showControls = activeFileIndex !== null;

  // Build two-level dropdown: category → files
  const dropdownContent = categories.map((cat, catIdx) => {
    const fileItems = cat.files.map((f) => {
      const globalIdx = vocabFiles.indexOf(f);
      const isActive = globalIdx === activeFileIndex;
      return `
        <button class="vocab-dropdown-file ${isActive ? 'active' : ''}" id="vocab-drop-${globalIdx}">
          <span class="vocab-dropdown-file-title">${getLabel(f.data.title, lang)}</span>
          <span class="vocab-dropdown-file-version">${f.version}</span>
        </button>
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
          ${fileItems}
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

    ${showControls ? `
    <div class="view-toggle">
      <button id="btn-tree"  class="${viewMode === 'tree'   ? 'active' : ''}" title="${t('tree_view', lang)}">
        ${iconTree()} ${t('tree', lang)}
      </button>
      <button id="btn-cards" class="${viewMode === 'cards'  ? 'active' : ''}" title="${t('card_view', lang)}">
        ${iconCards()} ${t('cards', lang)}
      </button>
      <button id="btn-bubble" class="${viewMode === 'bubble' ? 'active' : ''}" title="${t('ontology_graph', lang)}">
        ${iconBubble()} ${t('graph', lang)}
      </button>
      <button id="btn-search" class="${viewMode === 'search' ? 'active' : ''}" title="${t('search', lang)}">
        ${iconSearch()} ${t('search', lang)}
      </button>
    </div>
    <div class="search-wrap">
      ${iconSearch()}
      <input id="global-search" type="search" placeholder="${t('search_concepts_placeholder', lang)}" value="${searchQuery}" />
    </div>
    ` : ''}

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
        viewMode = 'tree';
        openGroupIds.clear();
        dropdown.classList.remove('open');
        rerender();
      });
    });
  });

  // Listeners if control elements exist
  if (showControls) {
    header.querySelector('#btn-tree')!.addEventListener('click', () => setViewMode('tree'));
    header.querySelector('#btn-cards')!.addEventListener('click', () => setViewMode('cards'));
    header.querySelector('#btn-bubble')!.addEventListener('click', () => setViewMode('bubble'));
    header.querySelector('#btn-search')!.addEventListener('click', () => setViewMode('search'));

    const searchInput = header.querySelector<HTMLInputElement>('#global-search')!;
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      if (searchQuery.length > 0) setViewMode('search');
      else rerender();
    });
  }

  header.querySelector('#btn-lang-de')!.addEventListener('click', () => { lang = 'de'; rerender(); });
  header.querySelector('#btn-lang-en')!.addEventListener('click', () => { lang = 'en'; rerender(); });

  return header;
}

// ── Main content ─────────────────────────────────────────
function buildMain(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'main-content';

  if (activeFileIndex === null) {
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
    </div>
  `;
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

    headerEl.addEventListener('click', () => {
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
  const activeFile = activeFileIndex !== null ? vocabFiles[activeFileIndex] : null;
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
      <div class="search-result-notation">${c.notation?.[0] ?? '?'}</div>
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

    cat.files.forEach((f) => {
      const globalIdx = vocabFiles.indexOf(f);
      const card = document.createElement('div');
      card.className = 'dashboard-vocab-card';

      const topConcepts = f.data.hasTopConcept || [];
      const subConceptsHTML = topConcepts.map((c, cIdx) => `
        <button class="dashboard-subconcept-pill" data-concept-id="${c.id}" title="${t('click_to_view_in_tree', lang)}">
          <span class="subconcept-notation">${c.notation?.[0] ?? (cIdx + 1)}</span>
          <span class="subconcept-label">${getLabel(c.prefLabel, lang)}</span>
        </button>
      `).join('');

      card.innerHTML = `
        <div class="vocab-card-header">
          <div class="vocab-card-meta">
            <span class="vocab-card-version">${f.version}</span>
            <span class="vocab-card-category">${f.category}</span>
          </div>
          <h3>${getLabel(f.data.title, lang)}</h3>
        </div>
        ${f.data.description ? `<p class="vocab-card-description">${getLabel(f.data.description, lang)}</p>` : ''}
        
        ${topConcepts.length ? `
        <div class="vocab-card-subconcepts">
          <div class="subconcepts-title">${t('top_concepts', lang)} (${topConcepts.length})</div>
          <div class="subconcepts-list">
            ${subConceptsHTML}
          </div>
        </div>
        ` : ''}

        <div class="vocab-card-footer">
          <span class="vocab-card-count">
            ${t('total_concepts', lang)}: <strong>${countConceptsTotal(topConcepts)}</strong>
          </span>
          <span class="badge accent-1">${t('explore_scheme', lang)}</span>
        </div>
      `;

      // Navigate to Tree mode on card click
      card.addEventListener('click', () => {
        activeFileIndex = globalIdx;
        viewMode = 'tree';
        rerender();
      });

      // Bind click handler to subconcept pills
      card.querySelectorAll('.dashboard-subconcept-pill').forEach((pill, idx) => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          activeFileIndex = globalIdx;
          viewMode = 'tree';
          openGroupIds.add(topConcepts[idx].id);
          rerender();
          openDetail(topConcepts[idx]);
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

  function getConceptColor(notation: string | undefined): string {
    const brandColors = [
      'hsl(342, 85%, 45%)',  // IQB Red
      'hsl(185, 80%, 35%)',  // IQB Teal
      'hsl(38,  90%, 44%)',  // Warm Orange
      'hsl(262, 70%, 50%)',  // Purple
      'hsl(327, 75%, 48%)',  // Pink
    ];
    if (!notation) return brandColors[0];
    let sum = 0;
    for (let i = 0; i < notation.length; i++) sum += notation.charCodeAt(i);
    return brandColors[sum % brandColors.length];
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

    function traverse(concept: Concept, parentId: string) {
      const conceptId = concept.id;
      const prev = prevMap.get(conceptId);

      const childCount = concept.narrower?.length ?? 0;
      const radius = Math.max(35, Math.min(65, 35 + childCount * 3));
      const notation = concept.notation?.[0] ?? '';
      const color = getConceptColor(notation);
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
        concept.narrower.forEach(child => traverse(child, conceptId));
      }
    }

    topConcepts.forEach(c => traverse(c, rootId));

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
