/* Точка входа: дождаться DOM и смонтировать интерфейс. */
(function () {
  function boot() {
    const NAMER = window.NAMER;
    const root = document.getElementById("app");
    if (!NAMER || !NAMER.UI || !root) {
      console.error("Namer: не загружены движок или данные");
      return;
    }
    if (!NAMER.projectOrder || !NAMER.projectOrder.length) {
      root.innerHTML = '<div style="padding:40px;color:#888">Нет проектов. Добавьте файл данных в data/ и подключите его в index.html.</div>';
      return;
    }
    NAMER.UI.mount(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
