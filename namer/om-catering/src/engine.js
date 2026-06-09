/* Движок Namer — ранжирование слов по позиции точки на матрице.
 *
 * Модель: точка (x, y) ∈ [-1, 1]². Каждая ось линейно интерполирует между
 * двумя полюсами. Вес полюса = насколько точка к нему придвинута.
 *   wXneg = (1 - x)/2   wXpos = (1 + x)/2   (сумма = 1)
 *   wYneg = (1 - y)/2   wYpos = (1 + y)/2
 * Скор слова = сумма (вес полюса × аффинити слова к тегу этого полюса).
 * Так каждая матрица всплывает свой релевантный срез базы, а движение
 * точки плавно перетасовывает выдачу. */
(function () {
  const NAMER = (window.NAMER = window.NAMER || {});
  const Engine = (NAMER.Engine = {});

  // Степень контраста: >1 делает углы матрицы резче, центр — мягче.
  const CONTRAST = 1.35;

  function poleWeights(x, y) {
    const sharpen = (w) => Math.pow(w, CONTRAST);
    return {
      xneg: sharpen((1 - x) / 2),
      xpos: sharpen((1 + x) / 2),
      yneg: sharpen((1 - y) / 2),
      ypos: sharpen((1 + y) / 2),
    };
  }

  Engine.scoreWord = function (word, matrix, x, y) {
    const aff = word.aff || {};
    const w = poleWeights(x, y);
    const g = (tag) => (tag && aff[tag] ? aff[tag] : 0);
    return (
      w.xneg * g(matrix.x.neg.tag) +
      w.xpos * g(matrix.x.pos.tag) +
      w.yneg * g(matrix.y.neg.tag) +
      w.ypos * g(matrix.y.pos.tag)
    );
  };

  // Доминирующий тег слова — для контекстного чипа в выдаче.
  Engine.dominantTag = function (word) {
    const aff = word.aff || {};
    let best = null;
    let bestVal = -1;
    for (const tag in aff) {
      if (aff[tag] > bestVal) {
        bestVal = aff[tag];
        best = tag;
      }
    }
    return best;
  };

  Engine.rank = function (project, matrix, x, y, limit) {
    const scored = project.words.map((word) => ({
      word: word,
      score: Engine.scoreWord(word, matrix, x, y),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 16);
  };

  // Все матрицы работают одновременно: скор слова = сумма по всем матрицам.
  // points — массив { x, y } той же длины, что project.matrices.
  Engine.rankCombined = function (project, points, limit) {
    const matrices = project.matrices;
    const scored = project.words.map((word) => {
      let s = 0;
      for (let i = 0; i < matrices.length; i++) {
        const p = points[i] || { x: 0, y: 0 };
        s += Engine.scoreWord(word, matrices[i], p.x, p.y);
      }
      return { word: word, score: s };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 16);
  };
})();
