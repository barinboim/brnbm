/* Сортировщик — игровой цикл. Vanilla JS, без сборки. Работает на localhost. */
(function () {
  "use strict";

  // ── языки ──────────────────────────────────────────────────────────────
  var LANGS = [
    { code: "ru",  label: "RU",  name: "Русский" },
    { code: "en",  label: "EN",  name: "English" },
    { code: "fr",  label: "FR",  name: "Français" },
    { code: "it",  label: "IT",  name: "Italiano" },
    { code: "la",  label: "LA",  name: "Латынь" },
    { code: "grc", label: "GRC", name: "Древнегреческий" },
    { code: "el",  label: "EL",  name: "Новогреческий" },
    { code: "sa",  label: "SA",  name: "Санскрит" }
  ];
  var LABEL = {}; LANGS.forEach(function (L) { LABEL[L.code] = L.label; });
  var TR_LANGS = { grc: 1, el: 1, sa: 1 };     // крупный токен = транслит
  var ROUND_SIZE = 100;

  // крупный токен карточки = транслит для grc/el/sa, иначе само слово
  function bigToken(w) { return (TR_LANGS[w.lang] && w.tr) ? w.tr : w.w; }
  // число букв видимого слова: снимаем комбинирующие знаки, считаем \p{L}
  function letterCount(s) {
    var d = (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
    var m = d.match(/\p{L}/gu);
    return m ? m.length : 0;
  }
  // фильтр кандидата: только однословные + попадание в диапазон длины
  function passes(w) {
    if (w.w.indexOf(" ") !== -1) return false;
    var n = letterCount(bigToken(w));
    return n >= settings.lenMin && n <= settings.lenMax;
  }

  // ── фонетические признаки (для адаптивного подбора, рычаг 1) ─────────────
  var VOWELS = "aeiouyаеёиоуыэюя";
  function baseForm(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-zа-яё]/g, "");
  }
  function isVowel(ch) { return !!ch && VOWELS.indexOf(ch) >= 0; }
  function initClass(ch) {
    if (!ch) return "x";
    if (isVowel(ch)) return "vowel";
    if ("pbtdkgкгтдпб".indexOf(ch) >= 0) return "plosive";
    if ("fvszхцчщ".indexOf(ch) >= 0) return "fricative";
    if ("lrлр".indexOf(ch) >= 0) return "liquid";
    if ("mnмн".indexOf(ch) >= 0) return "nasal";
    if ("jwyйшж".indexOf(ch) >= 0) return "glide";
    return "other";
  }
  function syllables(b) {
    var n = 0, prev = false;
    for (var i = 0; i < b.length; i++) { var v = isVowel(b[i]); if (v && !prev) n++; prev = v; }
    return n || 1;
  }
  // признаки: язык, часть речи, длина, слоги, начальный звук, окончание, дубль
  function featuresOf(word) {
    var b = baseForm(bigToken(word)) || "x", L = b.length;
    return [
      "lang:" + (word.lang || "coined"),
      "pos:" + (word.pos || "?"),
      L <= 4 ? "len:s" : (L <= 7 ? "len:m" : "len:l"),
      "syl:" + Math.min(syllables(b), 5),
      "init:" + initClass(b.charAt(0)),
      isVowel(b.charAt(b.length - 1)) ? "end:v" : "end:c",
      /(.)\1/.test(b) ? "dbl:1" : "dbl:0"
    ];
  }

  // ── localStorage ───────────────────────────────────────────────────────
  var K_PLAYED = "sorter.played.v1",
      K_SET    = "sorter.settings.v1",
      K_RND    = "sorter.roundno.v1",
      K_LAST   = "sorter.lastround.v1",
      K_TASTE  = "sorter.taste.v1",
      K_GOOD   = "sorter.goodcorpus.v1";

  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ── состояние ──────────────────────────────────────────────────────────
  var poolByLang = {};                 // code -> [words]
  var played = new Set(load(K_PLAYED, []));
  var settings = load(K_SET, null) || { langs: {}, speed: 4 };
  if (!settings.langs || typeof settings.langs !== "object") settings.langs = {};
  LANGS.forEach(function (L) { if (!(L.code in settings.langs)) settings.langs[L.code] = true; });
  if (settings.lenMin == null) settings.lenMin = 2;
  if (settings.lenMax == null) settings.lenMax = 18;
  if (settings.roundSize == null) settings.roundSize = 100;
  if (settings.adaptive == null) settings.adaptive = true;
  if (settings.focus == null) settings.focus = 5;

  // модель вкуса (наивный байес на признаках) — обучается на good/bad, рычаг 1
  var taste = load(K_TASTE, null) || { good: {}, bad: {}, ng: 0, nb: 0 };
  // корпус одобренных слов — ингредиенты для ковки (рычаг 2)
  var goodCorpus = load(K_GOOD, []);

  var round = null;
  var startMode = "discover";   // режим, выбранный на старт-экране: discover | forge   // {cards:[], cursor, good:[], bad:[], target, active, locked}

  // ── DOM ────────────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var playfield = $("playfield"),
      basketGood = $("basketGood"), basketBad = $("basketBad"),
      skiphint = document.querySelector(".skiphint");

  // ── загрузка пулов ─────────────────────────────────────────────────────
  function parseJsonl(txt) {
    var out = [];
    var lines = txt.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      try {
        var o = JSON.parse(s);
        if (o && o.w && o.g && o.lang) out.push(o);
      } catch (e) {}
    }
    return out;
  }

  function loadPools() {
    return Promise.all(LANGS.map(function (L) {
      return fetch("data/pool_" + L.code + ".jsonl", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { if (t) poolByLang[L.code] = parseJsonl(t); })
        .catch(function () {});
    })).then(function () {
      var total = 0;
      LANGS.forEach(function (L) { total += (poolByLang[L.code] || []).length; });
      if (total > 0) return total;
      // фолбэк: сид-набор, если пулы ещё не собраны
      return fetch("data/sample.jsonl").then(function (r) { return r.text(); })
        .then(function (t) {
          parseJsonl(t).forEach(function (w) { (poolByLang[w.lang] = poolByLang[w.lang] || []).push(w); });
          var s = 0; LANGS.forEach(function (L) { s += (poolByLang[L.code] || []).length; });
          return s;
        }).catch(function () { return 0; });
    });
  }

  // ── вспомогательное ────────────────────────────────────────────────────
  function key(w) { return w.lang + "|" + w.w; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function candidates() {
    var out = [];
    LANGS.forEach(function (L) {
      if (!settings.langs[L.code]) return;
      var arr = poolByLang[L.code] || [];
      for (var i = 0; i < arr.length; i++) {
        if (!played.has(key(arr[i])) && passes(arr[i])) out.push(arr[i]);
      }
    });
    return out;
  }
  function availableCount() {
    var n = 0;
    LANGS.forEach(function (L) {
      if (!settings.langs[L.code]) return;
      var arr = poolByLang[L.code] || [];
      for (var i = 0; i < arr.length; i++) if (!played.has(key(arr[i])) && passes(arr[i])) n++;
    });
    return n;
  }

  // ── модель вкуса / адаптивный подбор (рычаг 1) ─────────────────────────
  var WARMUP = 10;
  function tasteTemp() {
    var s = Math.max(1, Math.min(10, settings.focus || 5));
    return 1.25 - (s - 1) / 9 * 1.05;   // 1.25 (разведка) .. 0.20 (фокус)
  }
  function adaptiveOn() { return settings.adaptive && (taste.ng + taste.nb) >= WARMUP; }
  function tasteUpdate(word, good) {
    var f = featuresOf(word), t = good ? taste.good : taste.bad;
    for (var i = 0; i < f.length; i++) t[f[i]] = (t[f[i]] || 0) + 1;
    if (good) taste.ng++; else taste.nb++;
    save(K_TASTE, taste);
  }
  function tasteScore(word) {
    var f = featuresOf(word), s = 0;
    for (var i = 0; i < f.length; i++) s += Math.log(((taste.good[f[i]] || 0) + 1) / ((taste.bad[f[i]] || 0) + 1));
    return s;
  }
  // следующее слово из remaining: адаптивно (Больцман по случайному окну) или равномерно
  function drawNext(pool) {
    if (!pool.length) return null;
    if (!adaptiveOn()) return pool.splice((Math.random() * pool.length) | 0, 1)[0];
    var S = Math.min(pool.length, 500), idx = [], seen = {}, tries = 0, i;
    while (idx.length < S && tries < S * 3) { var r = (Math.random() * pool.length) | 0; if (!seen[r]) { seen[r] = 1; idx.push(r); } tries++; }
    var T = tasteTemp(), sc = [], mx = -Infinity;
    for (i = 0; i < idx.length; i++) { var v = tasteScore(pool[idx[i]]); sc.push(v); if (v > mx) mx = v; }
    var tot = 0, w = [];
    for (i = 0; i < idx.length; i++) { var e = Math.exp((sc[i] - mx) / T); w.push(e); tot += e; }
    var rr = Math.random() * tot, acc = 0, pick = 0;
    for (i = 0; i < idx.length; i++) { acc += w[i]; if (rr <= acc) { pick = i; break; } }
    return pool.splice(idx[pick], 1)[0];
  }

  // ── ковка коинов (рычаг 2) ─────────────────────────────────────────────
  var _CYR = { "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya" };
  function latinize(s) { s = (s || "").toLowerCase(); var o = ""; for (var i = 0; i < s.length; i++) { var c = s[i]; o += (c in _CYR) ? _CYR[c] : c; } return o; }
  function cleanCoin(c) { return latinize(c).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, ""); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function cap(c) { return c ? c.charAt(0).toUpperCase() + c.slice(1) : c; }
  function isV(ch) { return "aeiou".indexOf(ch) >= 0; }
  function firstV(s) { for (var i = 0; i < s.length; i++) if (isV(s[i])) return i; return -1; }
  function lastV(s) { for (var i = s.length - 1; i >= 0; i--) if (isV(s[i])) return i; return -1; }
  function head(s) { var v = firstV(s); if (v < 0) return s.slice(0, Math.min(3, s.length)); var i = v + 1; while (i < s.length && isV(s[i])) i++; if (i < s.length && !isV(s[i])) i++; return s.slice(0, Math.max(2, i)); }
  function tail(s) { var v = lastV(s); if (v < 0) return s.slice(-Math.min(3, s.length)); var i = v; if (i > 0 && !isV(s[i - 1])) i--; return s.slice(i); }
  function trunc(s) { var t = 3 + ((Math.random() * 3) | 0); return s.length <= t ? s : s.slice(0, t); }
  var _SUF = ["o","a","ia","ix","ex","on","um","us","io","en","ar","is","os","eo","ova","ico","ane","ora","el"];
  var _PRE = ["e","ne","vi","za","ex","neo","de","re"];
  function gen(a, b, kind) {
    if (kind === 0) { var h = head(a), t = tail(b); if (h && t && h.charAt(h.length - 1) === t.charAt(0)) t = t.slice(1); return h + t; }
    if (kind === 1) { if (Math.random() < 0.72) { var s = pick(_SUF), x = a; if (isV(x.charAt(x.length - 1)) && isV(s.charAt(0))) x = x.slice(0, -1); return x + s; } return pick(_PRE) + a; }
    if (kind === 2) { return trunc(a); }
    if (kind === 3) { return trunc(a) + tail(b); }
    var m = (Math.random() * 4) | 0;
    if (m === 0) return a.replace(/c/g, "k").replace(/ph/g, "f");
    if (m === 1) { var i = firstV(a); return i < 0 ? a : a.slice(0, i) + "aeiou".charAt((("aeiou".indexOf(a[i]) + 2) % 5)) + a.slice(i + 1); }
    if (m === 2) { var j = 1 + ((Math.random() * Math.max(1, a.length - 1)) | 0); return a.slice(0, j) + a.charAt(j) + a.slice(j); }
    return isV(a.charAt(a.length - 1)) ? a : a + "a";
  }
  function sayable(c) {
    if (c.length < 3 || c.length > 11) return false;
    if (!/[aeiou]/.test(c)) return false;
    if (/[^aeiou]{4,}/.test(c)) return false;
    if (/(.)\1\1/.test(c)) return false;
    return true;
  }
  var KIND_RU = ["бленд", "аффикс", "усечение", "компаунд", "мутация"];
  function buildIngredients() {
    var ing = [], seen = {};
    for (var i = 0; i < goodCorpus.length; i++) { var t = cleanCoin(goodCorpus[i].w); if (t.length >= 3 && !seen[t]) { seen[t] = 1; ing.push(t); } }
    if (ing.length < 24) {
      var dict = [];
      LANGS.forEach(function (L) { var a = poolByLang[L.code] || []; for (var k = 0; k < a.length; k++) dict.push(a[k]); });
      var sample = [];
      for (var s = 0; s < 500 && dict.length; s++) sample.push(dict[(Math.random() * dict.length) | 0]);
      sample.sort(function (x, y) { return tasteScore(y) - tasteScore(x); });
      for (var m = 0; m < sample.length && ing.length < 40; m++) { var c = cleanCoin(bigToken(sample[m])); if (c.length >= 3 && !seen[c]) { seen[c] = 1; ing.push(c); } }
    }
    return ing.slice(0, 60);
  }
  function generateCoins(target) {
    var ing = buildIngredients();
    if (ing.length < 2) return [];
    var out = [], seen = {}, tries = 0, max = target * 40;
    while (out.length < target && tries < max) {
      tries++;
      var kind = (Math.random() * 5) | 0, a = pick(ing), b = pick(ing);
      var c = cleanCoin(gen(a, b, kind));
      if (!sayable(c) || seen[c]) continue;
      var w = cap(c);
      if (played.has("coined|" + w)) continue;
      seen[c] = 1;
      out.push({ w: w, g: KIND_RU[kind] + " · " + a + (kind === 0 || kind === 3 ? " + " + b : ""), tr: null, lang: "coined", pos: "", forged: true });
    }
    return out;
  }
  function addGoodCorpus(word) {
    goodCorpus.push({ w: bigToken(word), lang: word.lang });
    if (goodCorpus.length > 500) goodCorpus = goodCorpus.slice(-500);
    save(K_GOOD, goodCorpus);
  }

  // ── раунд ──────────────────────────────────────────────────────────────
  function startRound(forge) {
    var pool = forge ? generateCoins(Math.max(settings.roundSize || ROUND_SIZE, 80) * 2) : candidates();
    if (!pool.length) {
      alert(forge ? "Не удалось наковать коинов — насортируй сначала good-слов в режиме «Поиск»."
                  : "Под фильтры не попало ни одного слова. Ослабь длину/языки или сбрось историю в меню.");
      return;
    }
    round = { remaining: pool, good: [], bad: [], target: Math.min(settings.roundSize || ROUND_SIZE, pool.length),
              active: null, locked: false, streakDir: null, streakN: 0, forge: !!forge };
    hide($("startOverlay")); hide($("results")); show($("game"));
    resetStreak();
    updateCounters();
    spawnNext();
  }

  function restartRound() {
    if (round && (round.good.length + round.bad.length) > 0 &&
        !confirm("Начать раунд заново? Прогресс текущего раунда сбросится (сыгранные слова останутся в истории).")) return;
    startRound(round ? round.forge : startMode === "forge");
  }

  // досрочно завершить раунд и уйти к комментированию (итоги)
  function finishRound() {
    if (!round || !isGameVisible()) return;   // только во время игры, не на экране итогов
    if (round.good.length + round.bad.length === 0) {
      alert("Пока нет рассортированных слов — раскидай хотя бы одно.");
      return;
    }
    endRound();
  }

  function spawnNext() {
    if (!round) return;
    round.active = null;
    var sorted = round.good.length + round.bad.length;
    if (sorted >= round.target || round.remaining.length === 0) { endRound(); return; }
    var word = drawNext(round.remaining);
    if (!word) { endRound(); return; }
    var el = buildCard(word);
    playfield.appendChild(el);
    round.active = { word: word, el: el };
    round.locked = false;
    // мягкое появление по центру, без падения (через reflow, чтобы transition сработал)
    void el.offsetWidth;
    el.classList.add("in");
    enableDrag(el);
  }

  // свайп карточки (тач + мышь): ← BAD, → GOOD, ↑ SKIP — мобильное управление
  function enableDrag(el) {
    var sx = 0, sy = 0, dx = 0, dy = 0, on = false, pid = null;
    el.addEventListener("pointerdown", function (e) {
      if (!round || !round.active || round.locked || round.active.el !== el) return;
      on = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      el.style.transition = "none";
      try { el.setPointerCapture(pid); } catch (_) {}
    });
    el.addEventListener("pointermove", function (e) {
      if (!on) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) rotate(" + (dx * 0.05) + "deg)";
      var horiz = Math.abs(dx) >= Math.abs(dy);
      el.classList.toggle("drag-good", horiz && dx > 30);
      el.classList.toggle("drag-bad", horiz && dx < -30);
      basketGood.classList.toggle("lit", horiz && dx > 30);
      basketBad.classList.toggle("lit", horiz && dx < -30);
      skiphint.classList.toggle("lit", !horiz && -dy > 30);
    });
    function end(e) {
      if (!on) return; on = false;
      try { el.releasePointerCapture(pid); } catch (_) {}
      basketGood.classList.remove("lit"); basketBad.classList.remove("lit"); skiphint.classList.remove("lit");
      var THx = Math.max(64, window.innerWidth * 0.16), THy = Math.max(64, window.innerHeight * 0.13);
      if (Math.abs(dx) > THx && Math.abs(dx) >= Math.abs(dy)) {
        var good = dx > 0;
        resolve(good ? "good" : "bad",
          "translate(" + (good ? 120 : -120) + "vw, calc(-50% + " + dy + "px)) rotate(" + (good ? 16 : -16) + "deg)");
      } else if (-dy > THy && Math.abs(dy) > Math.abs(dx)) {
        resolve("skip", "translate(calc(-50% + " + dx + "px), -120vh) scale(.7)");
      } else {
        el.classList.remove("drag-good", "drag-bad");
        el.style.transition = "transform .2s ease";
        el.style.transform = "translate(-50%,-50%)";
      }
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // Spritz ORP — точка оптимального распознавания (чуть левее центра),
  // её закрепляем ровно по центру карточки, чтобы взгляд не бегал.
  function orpIndex(len) {
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  }
  // кегль под длину слова, чтобы длинные влезали без переноса
  function fontForLen(len) {
    if (len <= 8) return "min(3.1rem, 12vw)";
    if (len <= 12) return "min(2.5rem, 9.5vw)";
    if (len <= 15) return "min(2.05rem, 8vw)";
    return "min(1.7rem, 6.8vw)";
  }
  /* падение убрано — слово появляется по центру (метод Spritz) */
  function buildCard(word) {
    var el = document.createElement("div");
    el.className = "card";
    var forged = !!word.forged;
    var isTr = !!(TR_LANGS[word.lang] && word.tr);
    var origHtml = isTr ? '<div class="orig">' + esc(word.w) + "</div>" : "";
    var chars = Array.from((bigToken(word) || "").normalize("NFC"));
    var i = orpIndex(chars.length);
    var pre = esc(chars.slice(0, i).join(""));
    var orp = esc(chars[i] || "");
    var post = esc(chars.slice(i + 1).join(""));
    el.innerHTML =
      '<span class="pos">' + esc(forged ? "коин" : (word.pos || "")) + "</span>" +
      '<span class="lang-badge' + (forged ? " coin" : "") + '">' + (forged ? "✦" : (LABEL[word.lang] || word.lang.toUpperCase())) + "</span>" +
      origHtml +
      '<div class="reader">' +
        '<span class="tick top"></span>' +
        '<div class="w" style="font-size:' + fontForLen(chars.length) + '">' +
          '<span class="pre">' + pre + '</span>' +
          '<span class="orp">' + orp + '</span>' +
          '<span class="post">' + post + '</span>' +
        '</div>' +
        '<span class="tick bot"></span>' +
      '</div>' +
      '<div class="g' + (forged ? " prov" : "") + '">' + esc(word.g) + "</div>";
    return el;
  }

  // ── ввод ───────────────────────────────────────────────────────────────
  function resolve(action, fling) {
    if (!round || !round.active || round.locked) return;
    round.locked = true;
    var a = round.active, el = a.el, word = a.word;
    el.classList.remove("parked", "drag-good", "drag-bad");
    // выход: класс fly-* (клавиши) или инлайн-флинг от текущей позиции (свайп)
    function exit(cls) {
      if (fling) { el.style.transition = "transform .32s ease-out, opacity .32s"; el.style.transform = fling; el.style.opacity = "0"; }
      else el.classList.add(cls);
    }

    if (action === "skip") {
      flashHint(skiphint);
      exit("fly-skip");
      after(el, function () { spawnNext(); });
      return;
    }
    var good = action === "good";
    flashBasket(good ? basketGood : basketBad);
    exit(good ? "fly-good" : "fly-bad");
    (good ? round.good : round.bad).push({ w: word.w, g: word.g, tr: word.tr || null, lang: word.lang, pos: word.pos || "", comment: "" });
    tasteUpdate(word, good);   // обучаем модель вкуса
    if (good && !round.forge) addGoodCorpus(word);   // словарные good → ингредиенты ковки
    var dir = good ? "good" : "bad";
    if (round.streakDir === dir) round.streakN++; else { round.streakDir = dir; round.streakN = 1; }
    updateStreak();
    played.add(key(word));
    save(K_PLAYED, Array.from(played));
    updateCounters();
    after(el, function () { spawnNext(); });
  }
  function after(el, cb) {
    var done = false;
    function go() { if (done) return; done = true; if (el.parentNode) el.parentNode.removeChild(el); cb(); }
    el.addEventListener("transitionend", go);
    setTimeout(go, 360); // страховка
  }

  document.addEventListener("keydown", function (e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;   // без авто-повтора
    if (!$("menuOverlay").classList.contains("hidden")) return;   // меню открыто
    // старт-экран: Enter / Space начинают раунд (вместо клика по кнопке)
    if (!$("startOverlay").classList.contains("hidden")) {
      if ((e.key === "Enter" || e.code === "Space") && !$("btnStart").disabled) {
        e.preventDefault(); startRound(startMode === "forge");
      }
      return;
    }
    if (!isGameVisible()) return;   // экран итогов и пр. — клавиши игры не ловим
    // стрелки/Enter — по e.key; WASD/Space — по e.code (физ. клавиша, любая раскладка)
    // BAD: ← / A / Space · GOOD: → / D / Enter (вкл. numpad) · SKIP: ↑ / W
    var k = e.key, c = e.code;
    if (k === "ArrowLeft" || c === "KeyA" || c === "Space") { e.preventDefault(); resolve("bad"); }
    else if (k === "ArrowRight" || c === "KeyD" || k === "Enter") { e.preventDefault(); resolve("good"); }
    else if (k === "ArrowUp" || c === "KeyW") { e.preventDefault(); resolve("skip"); }
  });

  function flashBasket(b) { b.classList.add("lit"); setTimeout(function () { b.classList.remove("lit"); }, 220); }
  function flashHint(h) { if (!h) return; h.classList.add("lit"); setTimeout(function () { h.classList.remove("lit"); }, 220); }

  // ── счётчики ───────────────────────────────────────────────────────────
  function updateCounters() {
    var g = round ? round.good.length : 0, b = round ? round.bad.length : 0;
    var target = round ? round.target : (settings.roundSize || ROUND_SIZE);
    setCount($("goodCount"), g);
    setCount($("badCount"), b);
    $("cPlayed").textContent = g + b;
    $("cLeft").textContent = Math.max(0, target - g - b);
    $("progressBar").style.width = (target ? (g + b) / target * 100 : 0) + "%";
  }
  function setCount(el, val) {
    if (!el || el.textContent === String(val)) return;
    el.textContent = val;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }

  // ── серии (streak) ─────────────────────────────────────────────────────
  function updateStreak() {
    var el = $("streak");
    if (round && round.streakN >= 3) {
      el.className = "streak show " + round.streakDir;
      el.innerHTML = (round.streakDir === "good" ? "GOOD" : "BAD") + " STREAK <b>×" + round.streakN + "</b>";
      void el.offsetWidth; el.classList.add("pop");
    } else {
      resetStreak();
    }
  }
  function resetStreak() { var el = $("streak"); el.className = "streak"; el.innerHTML = ""; }

  // ── итоги ──────────────────────────────────────────────────────────────
  function endRound() {
    var no = (load(K_RND, 0) | 0) + 1;
    save(K_RND, no);
    round.no = no;
    round.date = isoDate();
    show($("results")); hide($("game"));
    rerenderResults();
  }

  function renderResList(host, arr, withComments) {
    host.innerHTML = "";
    arr.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "resrow" + (withComments ? "" : " solo");
      var isTr = !!TR_LANGS[item.lang] && item.tr;
      var big = isTr ? item.tr : item.w;
      var meta = (LABEL[item.lang] || item.lang) + " · " + item.g + (isTr ? " · " + item.w : "");
      var html = '<div class="word"><div class="rw">' + esc(big) + '</div>' +
                 '<div class="rmeta">' + esc(meta) + "</div></div>";
      if (withComments) html += '<input type="text" placeholder="комментарий…" value="' + esc(item.comment || "") + '">';
      html += '<button class="movebtn" title="' + (withComments ? "Переместить в BAD" : "Переместить в GOOD") +
              '">' + (withComments ? "→ BAD" : "← GOOD") + "</button>";
      row.innerHTML = html;
      if (withComments) {
        var input = row.querySelector("input");
        input.addEventListener("input", function () { item.comment = input.value; saveBackup(); });
      }
      row.querySelector(".movebtn").addEventListener("click", function () { moveItem(item, !withComments); });
      host.appendChild(row);
    });
  }

  // перенос слова между колонками на экране итогов (исправить ошибку сортировки)
  function moveItem(item, toGood) {
    if (!round) return;
    var from = toGood ? round.bad : round.good;
    var to = toGood ? round.good : round.bad;
    var i = from.indexOf(item);
    if (i < 0) return;
    from.splice(i, 1);
    to.push(item);
    rerenderResults();
  }
  function rerenderResults() {
    if (!round) return;
    $("resTitle").textContent = "Раунд " + round.no + " · сыграно " + (round.good.length + round.bad.length) +
      " · good " + round.good.length + " · bad " + round.bad.length;
    $("resGoodCount").textContent = round.good.length;
    $("resBadCount").textContent = round.bad.length;
    renderResList($("resGood"), round.good, true);
    renderResList($("resBad"), round.bad, false);
    saveBackup();
  }

  function saveBackup() {
    if (!round) return;
    save(K_LAST, { no: round.no, date: round.date, good: round.good, bad: round.bad });
  }

  // ── экспорт .txt ───────────────────────────────────────────────────────
  function exportTxt() {
    if (!round) return;
    var g = round.good, b = round.bad;
    var L = [];
    L.push("# раунд " + round.no + " · " + round.date + " · сыграно " + (g.length + b.length) +
           " · good " + g.length + " · bad " + b.length);
    L.push("# колонки: слово \\t язык \\t глосс \\t комментарий");
    L.push("## GOOD");
    g.forEach(function (it) { L.push(rowTxt(it)); });
    // плохие слова в экспорт не идут — только хорошие
    var blob = new Blob([L.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "round_" + pad2(round.no) + "_" + round.date + ".txt";
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function rowTxt(it) {
    var word = it.w + (it.tr && TR_LANGS[it.lang] ? " (" + it.tr + ")" : "");
    var c = (it.comment || "").trim() || "—";
    return [word, it.lang, it.g, c].join("\t");
  }

  // ── меню ───────────────────────────────────────────────────────────────
  function buildMenu() {
    var host = $("langToggles");
    host.innerHTML = "";
    LANGS.forEach(function (Lg) {
      var n = (poolByLang[Lg.code] || []).length;
      var el = document.createElement("button");
      el.className = "lang" + (settings.langs[Lg.code] ? " on" : "") + (n === 0 ? " empty" : "");
      el.innerHTML = '<span class="tag">' + Lg.label + '</span>' + Lg.name +
                     ' <span class="cnt">' + n + "</span>";
      el.addEventListener("click", function () {
        if (n === 0) return;
        settings.langs[Lg.code] = !settings.langs[Lg.code];
        el.classList.toggle("on", settings.langs[Lg.code]);
        save(K_SET, settings); menuInfo();
      });
      host.appendChild(el);
    });

    var lmin = $("lenMin"), lmax = $("lenMax");
    lmin.value = settings.lenMin; lmax.value = settings.lenMax;
    lenLabel();
    lmin.oninput = function () {
      settings.lenMin = Math.min(+lmin.value, +lmax.value); lmin.value = settings.lenMin;
      lenLabel(); save(K_SET, settings); menuInfo();
    };
    lmax.oninput = function () {
      settings.lenMax = Math.max(+lmax.value, +lmin.value); lmax.value = settings.lenMax;
      lenLabel(); save(K_SET, settings); menuInfo();
    };

    var rs = $("roundSize");
    rs.value = settings.roundSize;
    roundLabel();
    rs.oninput = function () {
      settings.roundSize = +rs.value;
      roundLabel(); save(K_SET, settings);
    };

    var at = $("adaptToggle");
    at.classList.toggle("on", !!settings.adaptive);
    at.onclick = function () { settings.adaptive = !settings.adaptive; at.classList.toggle("on", settings.adaptive); save(K_SET, settings); tasteInfoUpdate(); };
    var fo = $("focus");
    fo.value = settings.focus;
    fo.oninput = function () { settings.focus = +fo.value; save(K_SET, settings); };
    $("btnResetTaste").onclick = function () {
      if (!confirm("Сбросить выученный вкус (модель good/bad)? Языки и история не тронутся.")) return;
      taste = { good: {}, bad: {}, ng: 0, nb: 0 }; save(K_TASTE, taste); tasteInfoUpdate();
    };
    tasteInfoUpdate();

    menuInfo();
  }
  function lenLabel() { $("lenVal").textContent = settings.lenMin + "–" + settings.lenMax + " букв"; }
  function roundLabel() { $("roundVal").textContent = settings.roundSize + " слов"; }
  function tasteInfoUpdate() {
    $("adaptInfo").textContent = settings.adaptive ? "вкл" : "выкл";
    $("tasteInfo").textContent = "выучено: " + taste.ng + " good · " + taste.nb + " bad" +
      (settings.adaptive && (taste.ng + taste.nb) < WARMUP ? " · нужно ≥" + WARMUP : "");
  }
  function menuInfo() { $("playedInfo").textContent = played.size + " сыграно · " + availableCount() + " под фильтрами"; }

  // ── утилиты ────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate() { var d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function isGameVisible() { return !$("game").classList.contains("hidden") && $("startOverlay").classList.contains("hidden"); }

  // ── кнопки ─────────────────────────────────────────────────────────────
  $("btnStart").addEventListener("click", function () { startRound(startMode === "forge"); });
  $("btnForgeRound").addEventListener("click", function () { startRound(true); });
  $("modeDiscover").addEventListener("click", function () { setMode("discover"); });
  $("modeForge").addEventListener("click", function () { setMode("forge"); });
  $("btnRestart").addEventListener("click", restartRound);
  $("btnFinish").addEventListener("click", finishRound);
  function setMode(m) {
    startMode = m;
    $("modeDiscover").classList.toggle("on", m === "discover");
    $("modeForge").classList.toggle("on", m === "forge");
    refreshStart();
  }
  $("btnNewRound").addEventListener("click", function () { hide($("results")); show($("startOverlay")); refreshStart(); });
  $("btnExport").addEventListener("click", exportTxt);
  $("btnMenu").addEventListener("click", function () { buildMenu(); show($("menuOverlay")); });
  $("btnCloseMenu").addEventListener("click", closeMenu);
  $("btnCloseMenu2").addEventListener("click", closeMenu);
  function closeMenu() {
    hide($("menuOverlay"));
    if (round && (round.good.length + round.bad.length) < round.target && round.active == null && isGameVisible()) {
      // если стоим без активной карточки (например, меню открыли на паузе) — продолжим
      spawnNext();
    }
    refreshStart();
  }
  $("btnResetHistory").addEventListener("click", function () {
    if (!confirm("Сбросить историю сыгранных слов? Они снова смогут выпадать.")) return;
    played = new Set(); save(K_PLAYED, []);
    buildMenu(); refreshStart();
  });

  function refreshStart() {
    var lr = $("ledeRound"); if (lr) lr.textContent = settings.roundSize + " слов";
    var avail = availableCount();
    var btn = $("btnStart");
    var anyPool = false, parts = [];
    LANGS.forEach(function (L) { var n = (poolByLang[L.code] || []).length; if (n) { anyPool = true; parts.push(L.label + " " + n); } });
    if (startMode === "forge") {
      btn.disabled = !anyPool;
      btn.textContent = !anyPool ? "Словари не найдены" :
        "Старт · ковка ✦" + (goodCorpus.length ? " · ингредиентов " + goodCorpus.length : " · из словаря");
    } else {
      btn.disabled = avail === 0;
      btn.textContent = avail === 0 ? "Нет слов — включи языки/сбрось историю" : "Старт · раунд " + ((load(K_RND, 0) | 0) + 1);
    }
    $("poolInfo").innerHTML = "в пуле: " + (parts.join(" · ") || "—") +
      "<br>доступно: " + avail + " · сыграно: " + played.size + " · твоих good-слов: " + goodCorpus.length;
  }

  // ── старт ──────────────────────────────────────────────────────────────
  $("poolInfo").textContent = "Загрузка словарей…";
  loadPools().then(function () {
    refreshStart();
    var usingSample = (function () { // подсказка, если играем на сид-наборе
      var real = 0; LANGS.forEach(function (L) { real += (poolByLang[L.code] || []).length; });
      return real;
    })();
    if (!usingSample) { $("btnStart").disabled = true; $("btnStart").textContent = "Словари не найдены"; }
  });

})();
