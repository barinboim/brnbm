/* Админка OM Catering — пометка неудачных неймов к удалению.
 * Логика как у шортлиста, но «наоборот»: помечаешь к исключению + причина,
 * затем «Экспорт .txt» → отдаёшь список, и слова физически удаляются из data-файла.
 * Хранение пометок — localStorage (по проекту), ключ namer.admin.v1. */
(function () {
  const NAMER = window.NAMER || {};
  const KEY = "namer.admin.v1";
  const LANG_PRIORITY = ["en", "fr", "it", "es", "pt", "de", "ro", "fi", "tr", "lat", "el", "ja", "sa", "ru"];

  const state = {
    projectId: null,
    marks: {},        // projectId -> { cyr: note }
    query: "",
    langSet: null,    // Set включённых языков; null = все
    onlyMarked: false,
  };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function load() { try { state.marks = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { state.marks = {}; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state.marks)); } catch (e) {} }
  function project() { return NAMER.projects[state.projectId]; }
  function marks() { return (state.marks[state.projectId] = state.marks[state.projectId] || {}); }
  function isMarked(w) { return Object.prototype.hasOwnProperty.call(marks(), w.cyr); }
  function markedCount() { return Object.keys(marks()).length; }

  function projectLangs() {
    const c = {};
    project().words.forEach((w) => (c[w.lang] = (c[w.lang] || 0) + 1));
    return Object.keys(c)
      .sort((a, b) => {
        const pa = LANG_PRIORITY.indexOf(a), pb = LANG_PRIORITY.indexOf(b);
        return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.localeCompare(b);
      })
      .map((l) => ({ lang: l, count: c[l] }));
  }

  let nodes = {};

  function mount(root) {
    load();
    const order = NAMER.projectOrder || Object.keys(NAMER.projects);
    if (!order || !order.length) { root.innerHTML = '<div style="padding:40px;color:#888">Нет проектов.</div>'; return; }
    state.projectId = order[0];
    state.langSet = new Set(projectLangs().map((x) => x.lang));

    root.innerHTML = "";
    const shell = el("div", "adm-shell");

    // Шапка
    const header = el("header", "topbar");
    const brand = el("div", "brand");
    const mark = el("div", "brand-mark brand-mark-fallback");
    mark.textContent = "A";
    brand.appendChild(mark);
    const bt = el("div", "brand-text");
    bt.appendChild(el("div", "brand-name", "Админка"));
    bt.appendChild(el("div", "adm-sub", "пометь неудачные → экспорт .txt → удалю из исходника"));
    brand.appendChild(bt);
    header.appendChild(brand);

    // Селектор проекта (если их несколько)
    if (order.length > 1) {
      const wrap = el("label", "project-switch");
      wrap.appendChild(el("span", "project-switch-label", "Проект"));
      const sel = el("select", "project-select");
      order.forEach((id) => { const o = el("option"); o.value = id; o.textContent = NAMER.projects[id].name; sel.appendChild(o); });
      sel.value = state.projectId;
      sel.addEventListener("change", () => {
        state.projectId = sel.value;
        state.langSet = new Set(projectLangs().map((x) => x.lang));
        buildLangs(); render();
      });
      wrap.appendChild(sel);
      header.appendChild(wrap);
    }
    shell.appendChild(header);

    nodes.title = el("h1", "page-title", "Исключение неймов — " + (project().name || ""));
    shell.appendChild(nodes.title);

    // Контролы: поиск, счётчик, действия
    const controls = el("div", "adm-controls");
    nodes.search = el("input", "adm-search");
    nodes.search.type = "text";
    nodes.search.placeholder = "Поиск по нейму, латинице или переводу…";
    nodes.search.addEventListener("input", () => { state.query = nodes.search.value.trim().toLowerCase(); render(); });
    controls.appendChild(nodes.search);

    nodes.count = el("span", "adm-count", "");
    controls.appendChild(nodes.count);

    const onlyBtn = el("button", "ghost-btn", "Только помеченные");
    onlyBtn.addEventListener("click", () => {
      state.onlyMarked = !state.onlyMarked;
      onlyBtn.classList.toggle("ghost-btn-dim", !state.onlyMarked);
      onlyBtn.textContent = state.onlyMarked ? "Показать все" : "Только помеченные";
      render();
    });
    onlyBtn.classList.add("ghost-btn-dim");
    controls.appendChild(onlyBtn);

    const exportBtn = el("button", "ghost-btn", "Экспорт .txt");
    exportBtn.addEventListener("click", exportTxt);
    controls.appendChild(exportBtn);

    const copyBtn = el("button", "ghost-btn", "Копировать");
    copyBtn.addEventListener("click", copyTxt);
    controls.appendChild(copyBtn);

    const clearBtn = el("button", "ghost-btn ghost-btn-dim", "Снять все пометки");
    clearBtn.addEventListener("click", () => {
      if (!markedCount()) return;
      if (!window.confirm("Снять все пометки к удалению? (" + markedCount() + ")")) return;
      state.marks[state.projectId] = {}; save(); render();
    });
    controls.appendChild(clearBtn);

    shell.appendChild(controls);

    // Чипы языков
    nodes.langs = el("div", "adm-langs");
    shell.appendChild(nodes.langs);

    // Список
    nodes.list = el("div", "adm-list");
    shell.appendChild(nodes.list);

    root.appendChild(shell);
    buildLangs();
    render();
  }

  function buildLangs() {
    nodes.langs.innerHTML = "";
    projectLangs().forEach(({ lang, count }) => {
      const on = state.langSet.has(lang);
      const chip = el("button", "lang-chip" + (on ? " on" : ""));
      chip.appendChild(el("span", "lang-chip-code", lang.toUpperCase()));
      chip.appendChild(el("span", "lang-chip-count", String(count)));
      chip.addEventListener("click", () => {
        if (state.langSet.has(lang)) state.langSet.delete(lang); else state.langSet.add(lang);
        buildLangs(); render();
      });
      nodes.langs.appendChild(chip);
    });
    const all = el("button", "lang-chip lang-chip-act", "Все");
    all.addEventListener("click", () => { state.langSet = new Set(projectLangs().map((x) => x.lang)); buildLangs(); render(); });
    nodes.langs.appendChild(all);
  }

  function visibleWords() {
    const q = state.query;
    return project().words.filter((w) => {
      if (!state.langSet.has(w.lang)) return false;
      if (state.onlyMarked && !isMarked(w)) return false;
      if (q) {
        const hay = (w.cyr + " " + (w.lat || "") + " " + (w.gloss || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    const total = project().words.length;
    nodes.count.innerHTML = "к удалению: <b>" + markedCount() + "</b> из " + total;

    const words = visibleWords();
    nodes.list.innerHTML = "";
    if (!words.length) {
      nodes.list.appendChild(el("div", "adm-empty", "Ничего не найдено по фильтрам."));
      return;
    }
    const frag = document.createDocumentFragment();
    words.forEach((w) => {
      const marked = isMarked(w);
      const row = el("div", "adm-row" + (marked ? " marked" : ""));

      const mk = el("button", "adm-mark", marked ? "✕" : "○");
      mk.title = marked ? "Вернуть" : "Пометить к удалению";
      mk.addEventListener("click", () => toggle(w));
      row.appendChild(mk);

      const names = el("div", "adm-names");
      names.appendChild(el("span", "adm-cyr", w.cyr));
      names.appendChild(el("span", "adm-lat", w.lat || "—"));
      row.appendChild(names);

      row.appendChild(el("span", "lang-badge lang-" + w.lang, (w.lang || "").toUpperCase()));
      row.appendChild(el("span", "adm-gloss", w.gloss || ""));

      if (marked) {
        const note = el("input", "adm-note");
        note.type = "text";
        note.placeholder = "причина (необязательно)…";
        note.value = marks()[w.cyr] || "";
        note.addEventListener("input", () => { marks()[w.cyr] = note.value; save(); });
        row.appendChild(note);
      } else {
        row.appendChild(el("span"));
      }
      frag.appendChild(row);
    });
    nodes.list.appendChild(frag);
  }

  function toggle(w) {
    const m = marks();
    if (Object.prototype.hasOwnProperty.call(m, w.cyr)) delete m[w.cyr];
    else m[w.cyr] = "";
    save();
    render();
  }

  function buildText() {
    const p = project();
    const byCyr = {};
    p.words.forEach((w) => (byCyr[w.cyr] = w));
    const keys = Object.keys(marks());
    const lines = [];
    lines.push("ИСКЛЮЧИТЬ ИЗ БАЗЫ — " + (p.name || state.projectId));
    lines.push("Помечено: " + keys.length + " из " + p.words.length);
    lines.push("Дата: " + new Date().toISOString().slice(0, 10));
    lines.push("".padEnd(48, "—"));
    keys.forEach((cyr, i) => {
      const w = byCyr[cyr] || { cyr: cyr, lat: "", lang: "?" };
      lines.push(i + 1 + ". " + cyr + (w.lat ? "  /  " + w.lat : "") + "   [" + (w.lang || "?").toUpperCase() + "]" + (w.gloss ? "   — " + w.gloss : ""));
      const note = marks()[cyr];
      if (note) lines.push("   причина: " + note);
    });
    lines.push("");
    lines.push("[КЛЮЧИ cyr ДЛЯ УДАЛЕНИЯ]");
    keys.forEach((cyr) => lines.push(cyr));
    return lines.join("\n");
  }

  function exportTxt() {
    if (!markedCount()) { window.alert("Ничего не помечено к удалению."); return; }
    const blob = new Blob([buildText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exclude-" + state.projectId + ".txt";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyTxt() {
    if (!markedCount()) { window.alert("Ничего не помечено к удалению."); return; }
    const text = buildText();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function boot() {
    const root = document.getElementById("admin");
    if (!NAMER || !NAMER.projects || !root) { if (root) root.innerHTML = '<div style="padding:40px;color:#888">Данные не загружены.</div>'; return; }
    mount(root);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
