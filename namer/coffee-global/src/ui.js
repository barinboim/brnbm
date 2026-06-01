/* Интерфейс Namer 1.0: три матрицы работают одновременно → общая выдача,
 * показанная в двух таблицах (латиница, затем кириллица) с локапом «Кофе»,
 * шкалой совместимости, шортлистом с комментариями и экспортом в текст. */
(function () {
  const NAMER = (window.NAMER = window.NAMER || {});
  const Engine = NAMER.Engine;
  const UI = (NAMER.UI = {});

  const RESULT_LIMIT = 20;

  const state = {
    projectId: null,
    tab: "names", // 'names' | 'shortlist'
    points: [], // [{x,y}] по одной на матрицу
    coffeePos: "after", // 'after' | 'before'
    shortlist: {}, // projectId -> [ cyr, ... ]
    comments: {}, // projectId -> { cyr: text }
  };

  // ——— Хранилище ———
  const SHORT_KEY = "namer.shortlist.v1";
  const COMMENT_KEY = "namer.comments.v1";
  function load() {
    try { state.shortlist = JSON.parse(localStorage.getItem(SHORT_KEY)) || {}; } catch (e) { state.shortlist = {}; }
    try { state.comments = JSON.parse(localStorage.getItem(COMMENT_KEY)) || {}; } catch (e) { state.comments = {}; }
  }
  function saveShortlist() { try { localStorage.setItem(SHORT_KEY, JSON.stringify(state.shortlist)); } catch (e) {} }
  function saveComments() { try { localStorage.setItem(COMMENT_KEY, JSON.stringify(state.comments)); } catch (e) {} }
  function projectShortlist() { return (state.shortlist[state.projectId] = state.shortlist[state.projectId] || []); }
  function projectComments() { return (state.comments[state.projectId] = state.comments[state.projectId] || {}); }
  function isShortlisted(word) { return projectShortlist().indexOf(word.cyr) !== -1; }
  function toggleShortlist(word) {
    const list = projectShortlist();
    const i = list.indexOf(word.cyr);
    if (i === -1) list.push(word.cyr);
    else list.splice(i, 1);
    saveShortlist();
    renderResults();
    renderShortlist();
    updateTabCount();
  }

  // ——— Помощники ———
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function currentProject() { return NAMER.projects[state.projectId]; }
  function anchorOf() { return currentProject().anchor || { cyr: "Кофе", lat: "Coffee" }; }
  function langBadge(word) {
    if (word.lang === "en") return "EN";
    if (word.lang === "other") return "✦";
    return "RU";
  }
  function initPoints() { state.points = currentProject().matrices.map(() => ({ x: 0, y: 0 })); }

  let nodes = {};
  let padRefs = [];

  // ——— Каркас ———
  UI.mount = function (root) {
    load();
    const order = NAMER.projectOrder || Object.keys(NAMER.projects);
    state.projectId = order[0];
    initPoints();

    root.innerHTML = "";
    const shell = el("div", "shell");

    // Шапка
    const header = el("header", "topbar");
    const brand = el("div", "brand");
    const mark = el("div", "brand-mark");
    const logo = document.createElement("img");
    logo.className = "brand-logo";
    logo.src = "assets/logo.png";
    logo.alt = "Namer";
    logo.addEventListener("error", () => {
      mark.removeChild(logo);
      mark.textContent = "N";
      mark.classList.add("brand-mark-fallback");
    });
    mark.appendChild(logo);
    brand.appendChild(mark);
    const brandText = el("div", "brand-text");
    brandText.appendChild(el("div", "brand-name", "Namer <span class='brand-ver'>1.0</span>"));
    brandText.appendChild(el("div", "brand-sub", "интерактивный нейминг по матрицам смыслов"));
    brand.appendChild(brandText);
    header.appendChild(brand);

    const projWrap = el("label", "project-switch");
    projWrap.appendChild(el("span", "project-switch-label", "Проект"));
    const select = el("select", "project-select");
    order.forEach((id) => {
      const o = el("option");
      o.value = id;
      o.textContent = NAMER.projects[id].name;
      select.appendChild(o);
    });
    select.value = state.projectId;
    select.addEventListener("change", () => {
      state.projectId = select.value;
      initPoints();
      nodes.tagline.textContent = currentProject().tagline || "";
      updateOrderControl();
      buildPads();
      renderResults();
      renderShortlist();
      updateTabCount();
    });
    projWrap.appendChild(select);
    header.appendChild(projWrap);
    shell.appendChild(header);

    nodes.tagline = el("h1", "page-title", currentProject().tagline || "");
    shell.appendChild(nodes.tagline);

    // Рабочая область: матрицы слева, список имён справа
    const work = el("div", "work");
    const left = el("div", "work-left");
    const right = el("div", "work-right");

    const padsHead = el("div", "section-head");
    padsHead.appendChild(el("span", "section-title", "Матрицы смыслов"));
    padsHead.appendChild(el("span", "section-meta", "Все три влияют на выборку"));
    left.appendChild(padsHead);
    nodes.pads = el("div", "pads");
    left.appendChild(nodes.pads);

    work.appendChild(left);
    work.appendChild(right);
    shell.appendChild(work);

    // Вкладки: подобранные неймы / шортлист
    const tabBar = el("div", "tab-bar");
    nodes.tabNames = el("button", "tab active", "Подобранные неймы");
    nodes.tabShort = el("button", "tab", "Шортлист");
    nodes.tabShortCount = el("span", "tab-count", "0");
    nodes.tabShort.appendChild(nodes.tabShortCount);
    nodes.tabNames.addEventListener("click", () => setTab("names"));
    nodes.tabShort.addEventListener("click", () => setTab("shortlist"));
    tabBar.appendChild(nodes.tabNames);
    tabBar.appendChild(nodes.tabShort);
    right.appendChild(tabBar);

    // —— Вкладка «Подобранные неймы» ——
    nodes.namesView = el("div", "tab-view");

    const orderRow = el("div", "order-row");
    const orderCtl = el("div", "order-ctl");
    orderCtl.appendChild(el("span", "order-label", "Порядок слов"));
    nodes.orderSwitch = el("button", "switch");
    nodes.orderSwitch.setAttribute("role", "switch");
    nodes.orderSwitch.appendChild(el("span", "switch-knob"));
    nodes.orderSwitch.addEventListener("click", () => {
      state.coffeePos = state.coffeePos === "after" ? "before" : "after";
      updateOrderControl();
      renderResults();
      renderShortlist();
    });
    orderCtl.appendChild(nodes.orderSwitch);
    nodes.orderState = el("span", "order-state", "");
    orderCtl.appendChild(nodes.orderState);
    orderRow.appendChild(orderCtl);
    nodes.resultCount = el("span", "section-meta", "");
    orderRow.appendChild(nodes.resultCount);
    nodes.namesView.appendChild(orderRow);

    const colHead = el("div", "result-top col-head");
    colHead.appendChild(el("span", "col-label", "Латиница"));
    colHead.appendChild(el("span", "col-label", "Кириллица"));
    colHead.appendChild(el("span", "col-label", ""));
    nodes.namesView.appendChild(colHead);

    nodes.results = el("div", "results");
    nodes.namesView.appendChild(nodes.results);
    right.appendChild(nodes.namesView);

    // —— Вкладка «Шортлист» ——
    nodes.shortView = el("div", "tab-view hidden");
    const actions = el("div", "shortlist-actions");
    const copyBtn = el("button", "ghost-btn", "Копировать");
    copyBtn.addEventListener("click", copyShortlist);
    const exportBtn = el("button", "ghost-btn", "Экспорт .txt");
    exportBtn.addEventListener("click", exportShortlist);
    const clearBtn = el("button", "ghost-btn ghost-btn-dim", "Очистить");
    clearBtn.addEventListener("click", () => {
      state.shortlist[state.projectId] = [];
      saveShortlist();
      renderResults();
      renderShortlist();
      updateTabCount();
    });
    actions.appendChild(copyBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(clearBtn);
    nodes.shortView.appendChild(actions);

    nodes.shortlist = el("div", "shortlist");
    nodes.shortView.appendChild(nodes.shortlist);
    right.appendChild(nodes.shortView);

    root.appendChild(shell);

    updateOrderControl();
    setTab("names");
    buildPads();
    renderResults();
    renderShortlist();
    updateTabCount();
  };

  function updateOrderControl() {
    const before = state.coffeePos === "before";
    nodes.orderSwitch.classList.toggle("on", before);
    nodes.orderSwitch.setAttribute("aria-checked", before ? "true" : "false");
    const word = anchorOf().cyr;
    nodes.orderState.textContent = before ? word + " спереди" : word + " сзади";
  }

  function setTab(t) {
    state.tab = t;
    const names = t === "names";
    nodes.tabNames.classList.toggle("active", names);
    nodes.tabShort.classList.toggle("active", !names);
    nodes.namesView.classList.toggle("hidden", !names);
    nodes.shortView.classList.toggle("hidden", names);
    if (!names) renderShortlist();
  }

  function updateTabCount() {
    nodes.tabShortCount.textContent = projectShortlist().length;
  }

  // ——— Пэды ———
  function buildPads() {
    nodes.pads.innerHTML = "";
    padRefs = [];
    currentProject().matrices.forEach((m, idx) => {
      const card = el("div", "pad-card");
      const head = el("div", "pad-card-head");
      head.appendChild(el("div", "pad-card-title", m.title));
      if (m.hint) head.appendChild(el("div", "pad-card-hint", m.hint));
      card.appendChild(head);
      const refs = buildPad(idx, m);
      card.appendChild(refs.pad);
      nodes.pads.appendChild(card);
      padRefs[idx] = refs;
      updateKnob(idx);
    });
  }

  function buildPad(idx, m) {
    const pad = el("div", "pad");
    const grid = el("div", "pad-grid");
    const glow = el("div", "pad-glow");
    const knob = el("div", "pad-knob");
    pad.appendChild(grid);
    pad.appendChild(glow);
    pad.appendChild(el("div", "axis-label axis-top", m.y.pos.label));
    pad.appendChild(el("div", "axis-label axis-bottom", m.y.neg.label));
    pad.appendChild(el("div", "axis-label axis-left", m.x.neg.label));
    pad.appendChild(el("div", "axis-label axis-right", m.x.pos.label));
    pad.appendChild(knob);

    const refs = { pad, glow, knob };
    let dragging = false;
    let rafPending = false;

    function setFromEvent(ev) {
      const rect = pad.getBoundingClientRect();
      const px = (ev.clientX - rect.left) / rect.width;
      const py = (ev.clientY - rect.top) / rect.height;
      state.points[idx].x = Math.max(-1, Math.min(1, px * 2 - 1));
      state.points[idx].y = Math.max(-1, Math.min(1, 1 - py * 2));
      updateKnob(idx);
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; renderResults(); });
      }
    }
    pad.addEventListener("pointerdown", (ev) => {
      dragging = true;
      pad.setPointerCapture(ev.pointerId);
      pad.classList.add("dragging");
      setFromEvent(ev);
    });
    pad.addEventListener("pointermove", (ev) => { if (dragging) setFromEvent(ev); });
    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      pad.classList.remove("dragging");
      try { pad.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    pad.addEventListener("pointerup", endDrag);
    pad.addEventListener("pointercancel", endDrag);
    return refs;
  }

  function updateKnob(idx) {
    const refs = padRefs[idx];
    if (!refs) return;
    const p = state.points[idx];
    const left = ((p.x + 1) / 2) * 100;
    const top = ((1 - p.y) / 2) * 100;
    refs.knob.style.left = left + "%";
    refs.knob.style.top = top + "%";
    refs.glow.style.left = left + "%";
    refs.glow.style.top = top + "%";
  }

  // ——— Локап «Кофе» (якорь того же размера, что и бренд-слово) ———
  function lockup(brand, anchorWord) {
    const wrap = el("span", "lockup");
    const brandEl = el("span", "lock-brand", brand);
    const anchorEl = el("span", "lock-anchor", anchorWord);
    if (state.coffeePos === "before") {
      wrap.appendChild(anchorEl);
      wrap.appendChild(brandEl);
    } else {
      wrap.appendChild(brandEl);
      wrap.appendChild(anchorEl);
    }
    return wrap;
  }

  function compatMap() {
    const project = currentProject();
    const all = Engine.rankCombined(project, state.points, 99999);
    const max = all.length ? Math.max(0.0001, all[0].score) : 1;
    const map = {};
    all.forEach((r) => (map[r.word.cyr] = Math.round((r.score / max) * 100)));
    return map;
  }

  // ——— Выдача ———
  function renderResults() {
    const project = currentProject();
    const anchor = anchorOf();
    const ranked = Engine.rankCombined(project, state.points, RESULT_LIMIT);
    const max = ranked.length ? Math.max(0.0001, ranked[0].score) : 1;

    nodes.resultCount.textContent = project.words.length + " слов в базе";

    const frag = document.createDocumentFragment();
    ranked.forEach((r) => {
      const word = r.word;
      const pct = Math.round((r.score / max) * 100);
      const card = el("div", "result");

      const top = el("div", "result-top");
      const latCell = el("div", "name-cell lat-cell");
      latCell.appendChild(lockup(word.lat, anchor.lat));
      top.appendChild(latCell);

      const cyrCell = el("div", "name-cell cyr-cell");
      cyrCell.appendChild(lockup(word.cyr, anchor.cyr));
      const meta = el("div", "name-meta");
      meta.appendChild(el("span", "lang-badge lang-" + word.lang, langBadge(word)));
      const domTag = Engine.dominantTag(word);
      if (domTag) meta.appendChild(el("span", "tag-chip", NAMER.tagLabels[domTag] || domTag));
      cyrCell.appendChild(meta);
      top.appendChild(cyrCell);

      const heart = el("button", "heart" + (isShortlisted(word) ? " active" : ""), isShortlisted(word) ? "♥" : "♡");
      heart.title = "В шортлист";
      heart.addEventListener("click", () => toggleShortlist(word));
      top.appendChild(heart);
      card.appendChild(top);

      // Шкала совместимости
      const compat = el("div", "compat");
      const bar = el("div", "compat-bar");
      const fill = el("div", "compat-fill");
      fill.style.width = pct + "%";
      bar.appendChild(fill);
      compat.appendChild(bar);
      compat.appendChild(el("span", "compat-pct", pct + "%"));
      card.appendChild(compat);

      frag.appendChild(card);
    });
    nodes.results.innerHTML = "";
    nodes.results.appendChild(frag);
  }

  // ——— Шортлист с комментариями ———
  function renderShortlist() {
    const list = projectShortlist();
    const comments = projectComments();
    const anchor = anchorOf();
    nodes.shortlist.innerHTML = "";
    if (!list.length) {
      nodes.shortlist.appendChild(el("div", "empty", "Пусто. Жми ♡ у понравившихся неймов."));
      return;
    }
    const byCyr = {};
    currentProject().words.forEach((w) => (byCyr[w.cyr] = w));
    list.forEach((cyr) => {
      const word = byCyr[cyr] || { cyr: cyr, lat: cyr };
      const latPart = state.coffeePos === "before" ? anchor.lat + " " + word.lat : word.lat + " " + anchor.lat;
      const cyrPart = state.coffeePos === "before" ? anchor.cyr + " " + word.cyr : word.cyr + " " + anchor.cyr;

      const row = el("div", "short-row");
      const names = el("div", "short-names");
      names.appendChild(el("span", "short-lat", latPart));
      names.appendChild(el("span", "short-cyr", cyrPart));
      row.appendChild(names);

      const input = el("input", "short-comment");
      input.type = "text";
      input.placeholder = "комментарий…";
      input.value = comments[cyr] || "";
      input.addEventListener("input", () => {
        const c = projectComments();
        if (input.value) c[cyr] = input.value;
        else delete c[cyr];
        saveComments();
      });
      row.appendChild(input);

      const x = el("button", "short-remove", "×");
      x.title = "Убрать";
      x.addEventListener("click", () => {
        const i = list.indexOf(cyr);
        if (i !== -1) list.splice(i, 1);
        saveShortlist();
        renderResults();
        renderShortlist();
        updateTabCount();
      });
      row.appendChild(x);
      nodes.shortlist.appendChild(row);
    });
  }

  // ——— Экспорт ———
  function buildExportText() {
    const project = currentProject();
    const anchor = anchorOf();
    const list = projectShortlist();
    const comments = projectComments();
    const compat = compatMap();
    const byCyr = {};
    project.words.forEach((w) => (byCyr[w.cyr] = w));

    const lines = [];
    lines.push("ШОРТЛИСТ — " + project.name);
    if (project.tagline) lines.push(project.tagline);
    lines.push("Локап: «" + anchor.cyr + "» " + (state.coffeePos === "after" ? "сзади" : "спереди"));
    lines.push("Всего: " + list.length);
    lines.push("");
    list.forEach((cyr, i) => {
      const w = byCyr[cyr] || { cyr: cyr, lat: cyr };
      const latPart = state.coffeePos === "before" ? anchor.lat + " " + w.lat : w.lat + " " + anchor.lat;
      const cyrPart = state.coffeePos === "before" ? anchor.cyr + " " + w.cyr : w.cyr + " " + anchor.cyr;
      lines.push(i + 1 + ". " + latPart + "  /  " + cyrPart);
      if (compat[cyr] != null) lines.push("   совместимость: " + compat[cyr] + "%");
      if (comments[cyr]) lines.push("   комментарий: " + comments[cyr]);
      lines.push("");
    });
    return lines.join("\n");
  }

  function exportShortlist() {
    if (!projectShortlist().length) return;
    const text = buildExportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shortlist-" + state.projectId + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyShortlist() {
    if (!projectShortlist().length) return;
    const text = buildExportText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }
})();
