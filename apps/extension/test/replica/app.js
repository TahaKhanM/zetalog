// Deterministic, dependency-free reimplementation of the Zetamac game engine for
// the extension e2e (test/replica/game.html). It reproduces the real page's
// observable behaviour — problems, running score, input-clear on accept, the
// countdown, and disabling the input at game over — from a FIXED SEED so runs
// are reproducible. It is intentionally not wired to any network/log endpoint.

/** mulberry32 — a small deterministic PRNG so the problem stream is fixed. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function init(options) {
  const rng = makeRng(0x5eed);
  const rand = (n) => Math.floor(rng() * n);
  const randGen = (min, max) => () => min + rand(max - min + 1);

  const game = document.getElementById('game');
  const timerEl = game.querySelector('span.left');
  const scoreEl = game.querySelector('span.correct');
  const problemEl = game.querySelector('.problem');
  const answerEl = game.querySelector('input.answer');
  const startEl = game.querySelector('.banner .start');
  const endEl = game.querySelector('.banner .end');
  const endScoreEl = endEl.querySelector('.correct');

  const gens = {
    add_left: randGen(options.add_left_min, options.add_left_max),
    add_right: randGen(options.add_right_min, options.add_right_max),
    mul_left: randGen(options.mul_left_min, options.mul_left_max),
    mul_right: randGen(options.mul_right_min, options.mul_right_max),
  };

  function pgAdd() {
    const l = gens.add_left();
    const r = gens.add_right();
    return { pretty: `${l} + ${r}`, answer: l + r };
  }
  function pgSub() {
    const first = gens.add_left();
    const second = gens.add_right();
    return { pretty: `${first + second} – ${first}`, answer: second };
  }
  function pgMul() {
    const l = gens.mul_left();
    const r = gens.mul_right();
    return { pretty: `${l} × ${r}`, answer: l * r };
  }
  function pgDiv() {
    const first = gens.mul_left();
    const second = gens.mul_right();
    return { pretty: `${first * second} ÷ ${first}`, answer: second };
  }

  const pgs = [];
  if (options.add) pgs.push(pgAdd);
  if (options.sub) pgs.push(pgSub);
  if (options.mul) pgs.push(pgMul);
  if (options.div) pgs.push(pgDiv);

  let current = null;
  function nextProblem() {
    current = pgs[rand(pgs.length)]();
    problemEl.textContent = current.pretty;
    answerEl.value = '';
  }

  let score = 0;
  const startTime = Date.now();

  answerEl.addEventListener('input', () => {
    if (current !== null && answerEl.value.trim() === String(current.answer)) {
      score += 1;
      scoreEl.textContent = `Score: ${score}`;
      nextProblem();
    }
  });

  nextProblem();
  answerEl.focus();

  const duration = options.duration || 120;
  timerEl.textContent = `Seconds left: ${duration}`;
  const timer = setInterval(() => {
    const left = duration - Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = `Seconds left: ${left}`;
    if (left <= 0) {
      clearInterval(timer);
      answerEl.disabled = true;
      endScoreEl.textContent = `Score: ${score}`;
      startEl.style.display = 'none';
      endEl.style.display = '';
    }
  }, 250);
}
