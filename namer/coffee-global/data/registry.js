/* Глобальный реестр проектов Namer.
 * Каждый файл данных регистрирует свой проект через NAMER.register(project).
 * Чтобы добавить новый проект — создайте data/<id>.js по образцу coffee-global.js
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

  // Русские подписи для тегов-полюсов (используются в чипах результатов).
  NAMER.tagLabels = {
    masculine: "мужской",
    unisex: "унисекс",
    balance: "баланс",
    energy: "энергия",
    emotion: "эмоция",
    expertise: "экспертиза",
    craft: "крафт",
    premium: "премиум",
    ritual: "ритуал",
    travel: "путешествие",
    soft: "мягкий",
    bold: "дерзкий",
  };
})();
