/* Глобальный реестр проектов Namer (копия движка под OM Catering).
 * Каждый файл данных регистрирует свой проект через NAMER.register(project).
 * Чтобы добавить новый проект — создайте data/<id>.js по образцу om-catering.js
 * и подключите его <script> в index.html. Движок сам подхватит его в переключателе. */
(function () {
  const NAMER = (window.NAMER = window.NAMER || {});
  NAMER.projects = NAMER.projects || {};
  NAMER.projectOrder = NAMER.projectOrder || [];

  NAMER.register = function (project) {
    if (!project || !project.id) {
      console.warn("NAMER.register: проект без id пропущен", project);
      return;
    }
    if (!NAMER.projects[project.id]) NAMER.projectOrder.push(project.id);
    NAMER.projects[project.id] = project;
  };

  // Таксономия OM Catering: 8 тегов-полюсов по двум осям-направлениям.
  //   «Передаём счастье»: Сытость↔Счастье (X) и Копить↔Дальше (Y).
  //   «Мы в ответе»:      Причина↔Эффект (X) и Слово↔Дело (Y).
  NAMER.tagLabels = {
    // — Передаём счастье —
    fill: "сытость",    // насыщение, тепло, материальное благо
    joy: "счастье",     // радость, свет, лёгкость
    gather: "копить",   // удерживать, беречь, множить в себе
    spread: "дальше",   // отдавать, делиться, передавать дальше
    // — Мы в ответе —
    craft: "мастерство", // причина: опыт, команда, экспертиза
    good: "добро",       // эффект: внимание, настроение, благо для людей
    word: "слово",       // обещание, данное слово, надёжность
    deed: "дело",        // поступок, действие, владение задачей
  };
})();
