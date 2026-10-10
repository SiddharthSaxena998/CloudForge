'use strict';

/* ---------- Game engine (pure logic, no DOM) ---------- */
const Snake = (function () {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function create(cols, rows, rng) {
    rng = rng || Math.random;
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    const s = {
      cols, rows, rng,
      body: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
      dir: 'right', queue: [], food: null, score: 0, alive: true
    };
    s.food = placeFood(s);
    return s;
  }

  function placeFood(s) {
    const free = [];
    for (let y = 0; y < s.rows; y++)
      for (let x = 0; x < s.cols; x++)
        if (!s.body.some(p => p.x === x && p.y === y)) free.push({ x, y });
    return free.length ? free[Math.floor(s.rng() * free.length)] : null;
  }

  function turn(s, d) {
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    const a = DIRS[last], b = DIRS[d];
    if (!b || (a[0] + b[0] === 0 && a[1] + b[1] === 0) || d === last) return;
    if (s.queue.length < 2) s.queue.push(d);
  }

  function step(s) {
    if (!s.alive) return s;
    if (s.queue.length) s.dir = s.queue.shift();
    const [dx, dy] = DIRS[s.dir];
    const head = { x: s.body[0].x + dx, y: s.body[0].y + dy };
    const ate = s.food && head.x === s.food.x && head.y === s.food.y;
    const tail = ate ? s.body : s.body.slice(0, -1); // tail moves away unless growing
    if (head.x < 0 || head.y < 0 || head.x >= s.cols || head.y >= s.rows ||
        tail.some(p => p.x === head.x && p.y === head.y)) {
      s.alive = false;
      return s;
    }
    s.body.unshift(head);
    if (ate) { s.score++; s.food = placeFood(s); } else s.body.pop();
    return s;
  }

  return { create, turn, step, placeFood };
})();

/* ---------- UI (browser only) ---------- */
if (typeof document !== 'undefined') {
  const COLS = 20, ROWS = 20;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / COLS;
  const $ = id => document.getElementById(id);
  const overlay = $('overlay');

  $('host').textContent = location.host || 'local file';

  let best = 0;
  try { best = +localStorage.getItem('snake-best') || 0; } catch (e) {}
  $('best').textContent = best;

  let game = null, timer = null, paused = false, running = false;

  const levelOf = s => 1 + Math.floor(s.score / 5);
  const delayOf = s => Math.max(60, 150 - (levelOf(s) - 1) * 12);

  function show(title, text, btn) {
    $('ovTitle').textContent = title;
    $('ovText').textContent = text;
    $('startBtn').textContent = btn;
    overlay.classList.remove('hidden');
  }

  function start() {
    game = Snake.create(COLS, ROWS);
    paused = false; running = true;
    overlay.classList.add('hidden');
    hud(); draw(); schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, delayOf(game));
  }

  function tick() {
    if (!running || paused) return;
    Snake.step(game);
    hud(); draw();
    if (!game.alive) return gameOver();
    schedule();
  }

  function gameOver() {
    running = false;
    if (game.score > best) {
      best = game.score;
      try { localStorage.setItem('snake-best', best); } catch (e) {}
      $('best').textContent = best;
    }
    show('Game Over', 'Score: ' + game.score + (game.score === best && best > 0 ? '  (new best!)' : ''), 'Play again');
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) { clearTimeout(timer); show('Paused', 'Press Space to resume', 'Resume'); }
    else { overlay.classList.add('hidden'); schedule(); }
  }

  function hud() {
    $('score').textContent = game.score;
    $('level').textContent = levelOf(game);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // checker grid
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#0c1224' : '#0a0f1e';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    if (!game) return;
    // food
    const f = game.food;
    if (f) {
      ctx.save();
      ctx.shadowColor = '#ff5d7a'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#ff5d7a';
      ctx.beginPath();
      ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // snake (gradient head -> tail)
    const n = game.body.length;
    game.body.forEach((p, i) => {
      const t = i / Math.max(n - 1, 1);
      ctx.fillStyle = 'hsl(' + (160 - t * 30) + ',100%,' + (62 - t * 22) + '%)';
      if (i === 0) { ctx.save(); ctx.shadowColor = '#3dffb0'; ctx.shadowBlur = 14; }
      roundRect(p.x * CELL + 1.5, p.y * CELL + 1.5, CELL - 3, CELL - 3, 6);
      ctx.fill();
      if (i === 0) ctx.restore();
    });
    // eyes
    const h = game.body[0];
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[game.dir];
    const px = -d[1], py = d[0];
    ctx.fillStyle = '#04130c';
    [-1, 1].forEach(sd => {
      ctx.beginPath();
      ctx.arc(h.x * CELL + CELL / 2 + d[0] * 5 + px * sd * 5,
              h.y * CELL + CELL / 2 + d[1] * 5 + py * sd * 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /* input */
  const keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
  };
  document.addEventListener('keydown', e => {
    if (keyMap[e.key]) {
      e.preventDefault();
      if (!running) return;
      if (paused) togglePause();
      Snake.turn(game, keyMap[e.key]);
    } else if (e.key === ' ') {
      e.preventDefault();
      running ? togglePause() : start();
    } else if (e.key === 'Enter') {
      start();
    }
  });

  $('startBtn').addEventListener('click', () => (paused ? togglePause() : start()));
  document.querySelectorAll('.pad button').forEach(b =>
    b.addEventListener('click', () => running && !paused && Snake.turn(game, b.dataset.dir)));

  // swipe
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchend', e => {
    if (!running || paused) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    Snake.turn(game, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  draw();
}

if (typeof module !== 'undefined') module.exports = Snake;
