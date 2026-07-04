// Simple Canvas platformer engine for Soulbound
// Player auto-runs across a procedurally generated level tuned to song duration.
// Space/Up to jump. Left/Right to nudge speed.

const GRAVITY = 1500;      // px/s^2
const JUMP_VELOCITY = -620; // px/s
const BASE_SPEED = 220;     // px/s
const NUDGE = 90;
const GROUND_HEIGHT = 80;

// Deterministic pseudo random from seed
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLevel(level, duration, beatTimes) {
  const rand = mulberry32(level.seed);
  const speed = BASE_SPEED;
  const totalWidth = duration * speed;

  const obstacles = [];
  const collectibles = [];

  if (beatTimes && beatTimes.length > 0) {
    let lastX = 0;
    for (let i = 0; i < beatTimes.length; i++) {
      const t = beatTimes[i];
      if (t < 2) continue;
      const x = t * speed;
      if (x > totalWidth - 300) break;
      if (x - lastX < 140) continue;
      const r = rand();
      const kind = r < 0.2 ? "pit" : r < 0.55 ? "flyer" : "spike";
      if (kind === "pit") {
        const w = 55 + Math.floor(rand() * 45);
        obstacles.push({ type: "pit", x, w });
        const midY = 220;
        for (let j = 0; j < 3; j++) collectibles.push({ x: x + 10 + j * (w / 3), y: midY - Math.sin((j / 2) * Math.PI) * 40, taken: false });
        lastX = x + w;
      } else if (kind === "flyer") {
        // spawns from a toilet, arcs up and lands
        obstacles.push({ type: "flyer", x, w: 22, h: 22, spawnT: t });
        // draw a small stationary toilet ahead of the landing spot as the launch source
        obstacles.push({ type: "spike", x: x - 200, w: 30, h: 24, _launcher: true });
        collectibles.push({ x: x - 90, y: 200, taken: false });
        lastX = x + 60;
      } else {
        const w = 26 + Math.floor(rand() * 14);
        const h = 30 + Math.floor(rand() * 22);
        obstacles.push({ type: "spike", x, w, h });
        collectibles.push({ x: x - 70, y: 240, taken: false });
        lastX = x + w;
      }
    }
    return { obstacles, collectibles, totalWidth, speed };
  }

  let x = 500;
  while (x < totalWidth - 400) {
    const kind = rand() < 0.5 ? "pit" : "spike";
    if (kind === "pit") {
      const w = 60 + Math.floor(rand() * 60);
      obstacles.push({ type: "pit", x, w });
      // collectible arc over pit
      const midY = 260 - 40;
      for (let i = 0; i < 3; i++) {
        collectibles.push({ x: x + 10 + i * (w / 3), y: midY - Math.sin((i / 2) * Math.PI) * 40, taken: false });
      }
      x += w + 220 + rand() * 200;
    } else {
      const w = 26 + Math.floor(rand() * 18);
      const h = 30 + Math.floor(rand() * 26);
      obstacles.push({ type: "spike", x, w, h });
      collectibles.push({ x: x - 90, y: 240, taken: false });
      collectibles.push({ x: x + w + 90, y: 240, taken: false });
      x += w + 180 + rand() * 180;
    }
  }
  return { obstacles, collectibles, totalWidth, speed };
}

export function createGame({ canvas, level, duration, beatTimes, onStateChange, onFinish, onDeath, onCollect }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const world = buildLevel(level, duration, beatTimes);
  const player = {
    x: 120,
    y: H - GROUND_HEIGHT - 40,
    vy: 0,
    w: 26,
    h: 40,
    onGround: true,
    dead: false,
  };

  const state = {
    running: false,
    paused: false,
    finished: false,
    elapsed: 0,
    lastT: 0,
    cameraX: 0,
    collected: 0,
    total: world.collectibles.length,
    soulHealth: 3,
    keys: { left: false, right: false, jump: false },
    world,
  };

  function reset() {
    player.x = 120; player.y = H - GROUND_HEIGHT - 40; player.vy = 0;
    player.onGround = true; player.dead = false;
    state.elapsed = 0; state.cameraX = 0; state.collected = 0;
    world.collectibles.forEach(c => (c.taken = false));
    state.soulHealth = 3;
    state.finished = false;
  }

  function keyDown(e) {
    if (["ArrowLeft", "KeyA"].includes(e.code)) state.keys.left = true;
    if (["ArrowRight", "KeyD"].includes(e.code)) state.keys.right = true;
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
      state.keys.jump = true;
      if (!state.running && !state.finished) { state.running = true; onStateChange?.("playing"); }
      if (player.onGround && state.running && !state.paused) {
        player.vy = JUMP_VELOCITY;
        player.onGround = false;
      }
      e.preventDefault();
    }
  }
  function keyUp(e) {
    if (["ArrowLeft", "KeyA"].includes(e.code)) state.keys.left = false;
    if (["ArrowRight", "KeyD"].includes(e.code)) state.keys.right = false;
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) state.keys.jump = false;
  }

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);

  function inPit(x) {
    for (const o of world.obstacles) {
      if (o.type === "pit" && x >= o.x && x <= o.x + o.w) return o;
    }
    return null;
  }

    function hitSpike(px, py, pw, ph) {
    for (const o of world.obstacles) {
      if (o.type === "spike") {
        const sy = H - GROUND_HEIGHT - o.h;
        if (px + pw > o.x && px < o.x + o.w && py + ph > sy) return o;
      } else if (o.type === "flyer" && o._px !== undefined) {
        const dt = state.elapsed - o.spawnT;
        if (dt < -1.0 || dt > 0.5) continue;
        // Flyer is visible; check AABB using stored screen pos + camera
        const wx = o._px + state.cameraX;
        const wy = o._py;
        if (px + pw > wx && px < wx + 22 && py + ph > wy && py < wy + 22) return o;
      }
    }
    return null;
  }

  function drawBathroomScene() {
    ctx.fillStyle = "#2a3540";
    ctx.fillRect(0, 0, W, H - GROUND_HEIGHT);
    const tileW = 40, tileH = 30;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    const offX = -Math.floor(state.cameraX * 0.5) % tileW;
    for (let y = 0; y < H - GROUND_HEIGHT; y += tileH) {
      const rowOff = (y / tileH) % 2 === 0 ? 0 : tileW / 2;
      for (let x = offX - tileW; x < W + tileW; x += tileW) {
        ctx.strokeRect(x + rowOff, y, tileW, tileH);
        if ((x + rowOff + y) % 80 === 0) {
          ctx.fillStyle = "#33404c";
          ctx.fillRect(x + rowOff + 1, y + 1, tileW - 2, tileH - 2);
        }
      }
    }
    const props = [
      { type: "sink", every: 900, y: H - GROUND_HEIGHT - 90 },
      { type: "mirror", every: 900, offset: 40, y: 60 },
      { type: "toilet", every: 1400, offset: 500, y: H - GROUND_HEIGHT - 70 },
    ];
    const camX = state.cameraX * 0.7;
    for (const p of props) {
      const startX = Math.floor((camX - W) / p.every) * p.every + (p.offset || 0);
      for (let x = startX; x < camX + W + p.every; x += p.every) {
        const sx = x - camX;
        if (p.type === "sink") {
          ctx.fillStyle = "#d8dde3"; ctx.fillRect(sx, p.y, 90, 30);
          ctx.fillStyle = "#0b0d16"; ctx.fillRect(sx + 12, p.y + 6, 66, 14);
          ctx.fillStyle = "#8a95a3"; ctx.fillRect(sx + 40, p.y - 18, 10, 20);
        } else if (p.type === "mirror") {
          ctx.fillStyle = "#0b0d16"; ctx.fillRect(sx, p.y, 100, 70);
          ctx.fillStyle = "#1a2233"; ctx.fillRect(sx + 3, p.y + 3, 94, 64);
          ctx.fillStyle = "#d8dde3"; ctx.fillRect(sx, p.y, 100, 4);
        } else if (p.type === "toilet") {
          ctx.fillStyle = "#d8dde3"; ctx.fillRect(sx, p.y, 46, 40); ctx.fillRect(sx + 4, p.y - 28, 38, 30);
          ctx.fillStyle = "#8a95a3"; ctx.fillRect(sx + 8, p.y - 22, 30, 20);
        }
      }
    }
    const g2 = ctx.createLinearGradient(0, 0, 0, H - GROUND_HEIGHT);
    g2.addColorStop(0, "rgba(255,255,255,0.06)");
    g2.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H - GROUND_HEIGHT);
  }

  function drawBg() {
    if (level.scene === "bathroom") { drawBathroomScene(); return; }
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, level.palette.sky);
    g.addColorStop(1, "#050508");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // distant stars (parallax by cameraX)
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 - state.cameraX * 0.15) % W + W) % W;
      const sy = (i * 53) % (H - 200);
      ctx.fillRect(sx, sy, 2, 2);
    }
    // mid mountains
    ctx.fillStyle = level.palette.ground;
    const midOffset = -state.cameraX * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, H - GROUND_HEIGHT);
    for (let i = 0; i < W + 200; i += 60) {
      const yBump = 40 + Math.sin((i + midOffset) * 0.02) * 25 + Math.cos((i + midOffset) * 0.05) * 12;
      ctx.lineTo(i, H - GROUND_HEIGHT - yBump);
    }
    ctx.lineTo(W, H - GROUND_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround(camX) {
    if (level.scene === "bathroom") {
      // white marble floor
      ctx.fillStyle = "#e8e6e1";
      ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);
      // veining
      ctx.strokeStyle = "rgba(140,140,150,0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const vx = ((i * 137 - camX * 0.9) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(vx, H - GROUND_HEIGHT + 10);
        ctx.bezierCurveTo(vx + 30, H - GROUND_HEIGHT + 25, vx + 60, H - GROUND_HEIGHT + 15, vx + 100, H - GROUND_HEIGHT + 40);
        ctx.stroke();
      }
      // grout lines (tile grid on floor)
      ctx.strokeStyle = "rgba(120,120,130,0.4)";
      const tileSize = 60;
      const offX = -Math.floor(camX) % tileSize;
      for (let x = offX - tileSize; x < W + tileSize; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, H - GROUND_HEIGHT); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, H - GROUND_HEIGHT + tileSize/2); ctx.lineTo(W, H - GROUND_HEIGHT + tileSize/2); ctx.stroke();
      // top edge
      ctx.fillStyle = "#8a95a3";
      ctx.fillRect(0, H - GROUND_HEIGHT, W, 2);
    } else {
      ctx.fillStyle = "#0b0d16";
      ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);
      ctx.fillStyle = level.palette.accent;
      ctx.fillRect(0, H - GROUND_HEIGHT, W, 2);
    }

    // Render pits as gaps by overdrawing void
    for (const o of world.obstacles) {
      if (o.type === "pit") {
        const sx = o.x - camX;
        if (sx + o.w < -20 || sx > W + 20) continue;
        ctx.fillStyle = "#050508";
        ctx.fillRect(sx, H - GROUND_HEIGHT, o.w, GROUND_HEIGHT);
      }
    }
  }

  function drawObstacles(camX) {
    const bathroom = level.scene === "bathroom";
    for (const o of world.obstacles) {
      if (o.type !== "spike") continue;
      const sx = o.x - camX;
      if (sx + o.w < -20 || sx > W + 20) continue;
      const sy = H - GROUND_HEIGHT - o.h;
      if (bathroom) {
        // Toilet: bowl + tank + seat + water
        const bx = sx - 8;
        const bw = o.w + 16;
        const bh = o.h;
        // bowl (rounded rectangle-ish)
        ctx.fillStyle = "#f4f2ee";
        ctx.fillRect(bx, H - GROUND_HEIGHT - bh * 0.55, bw, bh * 0.55);
        ctx.fillRect(bx + 4, H - GROUND_HEIGHT - bh * 0.6, bw - 8, 6);
        // tank
        const tankH = bh * 0.5;
        ctx.fillRect(bx + bw * 0.15, H - GROUND_HEIGHT - bh, bw * 0.7, tankH);
        // water
        ctx.fillStyle = "#7cc7f0";
        ctx.fillRect(bx + 6, H - GROUND_HEIGHT - bh * 0.5, bw - 12, 6);
        // shadow line
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(bx, H - GROUND_HEIGHT - 2, bw, 2);
        // seat highlight
        ctx.fillStyle = "#d8d5cf";
        ctx.fillRect(bx, H - GROUND_HEIGHT - bh * 0.6, bw, 2);
      } else {
        ctx.fillStyle = "#EF476F";
        ctx.beginPath();
        ctx.moveTo(sx, H - GROUND_HEIGHT);
        ctx.lineTo(sx + o.w / 2, sy);
        ctx.lineTo(sx + o.w, H - GROUND_HEIGHT);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(sx, sy + o.h - 2, o.w, 2);
      }
    }
    // Flyers (poop / piranha-plant style)
    for (const o of world.obstacles) {
      if (o.type !== "flyer") continue;
      const sx = o.x - camX;
      if (sx + 40 < 0 || sx > W + 40) continue;
      // arc trajectory: appears 0.4s before beat time, peaks at beat, lands 0.4s after
      const dt = state.elapsed - o.spawnT;
      const life = 0.8; // total visible time
      // Visible 1.5s: 1s ascending from a toilet ahead, 0.5s descending onto player
      if (dt < -1.0 || dt > 0.5) continue;
      const p = (dt + 1.0) / life; // 0..1
      const arcY = -110 * Math.sin(p * Math.PI);
      // shift start position: launch from a "toilet" 200px ahead of landing point
      const launchOffset = -200 * (1 - p);
      const cx = sx + 11 + launchOffset;
      const cy = H - GROUND_HEIGHT - 20 + arcY;
      // poop: brown swirls
      ctx.fillStyle = "#6b3a1e";
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a2610";
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b5a3e";
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 2, 4, 0, Math.PI * 2);
      ctx.fill();
      // stink lines
      ctx.strokeStyle = "rgba(120,180,60,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 14); ctx.lineTo(cx - 4, cy - 20);
      ctx.moveTo(cx + 2, cy - 14); ctx.lineTo(cx + 4, cy - 20);
      ctx.stroke();
      // update collision box on the object (so hitSpike-style check works)
      o._px = sx; o._py = cy - 11;
    }
  }

  function drawCollectibles(camX) {
    const bathroom = level.scene === "bathroom";
    for (const c of world.collectibles) {
      if (c.taken) continue;
      const sx = c.x - camX;
      if (sx < -30 || sx > W + 30) continue;
      const wob = Math.sin((state.elapsed + c.x * 0.01) * 4) * 3;
      ctx.save();
      ctx.translate(sx, c.y + wob);
      if (bathroom) {
        ctx.shadowColor = "#FFD166"; ctx.shadowBlur = 12;
        // top bun
        ctx.fillStyle = "#e8a76a";
        ctx.fillRect(-10, -10, 20, 3);
        ctx.fillRect(-12, -7, 24, 4);
        // sesame seeds
        ctx.fillStyle = "#fff6d5";
        ctx.fillRect(-7, -9, 2, 2); ctx.fillRect(0, -9, 2, 2); ctx.fillRect(6, -9, 2, 2);
        // lettuce
        ctx.fillStyle = "#7cc06a"; ctx.fillRect(-12, -3, 24, 2);
        // cheese
        ctx.fillStyle = "#ffd54a"; ctx.fillRect(-11, -1, 22, 2);
        // patty
        ctx.fillStyle = "#6b3a1e"; ctx.fillRect(-11, 1, 22, 4);
        // bottom bun
        ctx.fillStyle = "#c98a4f"; ctx.fillRect(-12, 5, 24, 4); ctx.fillRect(-10, 9, 20, 2);
      } else {
        ctx.fillStyle = level.palette.accent;
        ctx.shadowColor = level.palette.accent;
        ctx.shadowBlur = 14;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(-2, -6, 2, 12);
      }
      ctx.restore();
    }
  }

  function drawPlayer() {
    const px = player.x - state.cameraX;
    const py = player.y;
    // soul aura
    ctx.save();
    ctx.shadowColor = level.palette.accent;
    ctx.shadowBlur = 22;
    // body (possessed silhouette)
    ctx.fillStyle = "#1A1D2B";
    ctx.fillRect(px, py, player.w, player.h);
    ctx.fillStyle = "#E0E2EB";
    ctx.fillRect(px + 4, py + 6, player.w - 8, 4);   // eyes band
    ctx.fillStyle = level.palette.accent;
    ctx.fillRect(px + 6, py + 6, 4, 4);              // glowing eye 1
    ctx.fillRect(px + player.w - 10, py + 6, 4, 4);  // glowing eye 2
    // legs
    ctx.fillStyle = "#0b0d16";
    ctx.fillRect(px + 4, py + player.h - 6, 6, 6);
    ctx.fillRect(px + player.w - 10, py + player.h - 6, 6, 6);
    ctx.restore();

    // soul flame above head
    const fh = 6 + Math.sin(state.elapsed * 10) * 2;
    ctx.fillStyle = level.palette.accent;
    ctx.shadowColor = level.palette.accent;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(px + player.w / 2, py - 6 - fh, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawFinishLine(camX) {
    const fx = world.totalWidth - camX;
    if (fx < -50 || fx > W + 50) return;
    ctx.fillStyle = "#FFD166";
    ctx.fillRect(fx, 0, 4, H - GROUND_HEIGHT);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#FFD166" : "#050508";
      ctx.fillRect(fx - 20, i * 18, 20, 18);
    }
  }

  function update(dt) {
    if (state.paused || state.finished) return;
    if (!state.running) return;
    state.elapsed += dt;

    // horizontal speed with nudge
    let vx = world.speed;
    if (state.keys.left) vx -= NUDGE;
    if (state.keys.right) vx += NUDGE;
    player.x += vx * dt;

    // gravity
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    const floorY = H - GROUND_HEIGHT - player.h;
    // detect pit
    const centerX = player.x + player.w / 2;
    const overPit = inPit(centerX);
    if (!overPit && player.y >= floorY) {
      player.y = floorY;
      player.vy = 0;
      player.onGround = true;
    } else if (overPit) {
      // no floor
      player.onGround = false;
      if (player.y > H + 40) {
        loseHealth();
      }
    }

    // spike
    if (hitSpike(player.x, player.y, player.w, player.h)) {
      loseHealth();
    }

    // collectibles
    for (const c of world.collectibles) {
      if (c.taken) continue;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      if (dx * dx + dy * dy < 26 * 26) {
        c.taken = true;
        state.collected++;
        onCollect?.(state.collected);
      }
    }

    // camera
    state.cameraX = Math.max(0, player.x - W * 0.3);

    // finish
    if (player.x >= world.totalWidth - 20) {
      state.finished = true;
      onFinish?.({ elapsed: state.elapsed, collected: state.collected, total: state.total, success: true });
    }

    // time out (song ended)
    if (state.elapsed >= duration) {
      state.finished = true;
      onFinish?.({ elapsed: state.elapsed, collected: state.collected, total: state.total, success: player.x >= world.totalWidth - 20 });
    }
  }

  function loseHealth() {
    if (player.dead) return;
    player.dead = true;
    state.soulHealth--;
    if (state.soulHealth <= 0) {
      state.finished = true;
      onDeath?.({ elapsed: state.elapsed, collected: state.collected, total: state.total });
      return;
    }
    // respawn at safe spot behind
    setTimeout(() => {
      player.x = Math.max(60, player.x - 220);
      player.y = H - GROUND_HEIGHT - player.h;
      player.vy = 0;
      player.dead = false;
    }, 250);
  }

  function render() {
    drawBg();
    drawGround(state.cameraX);
    drawObstacles(state.cameraX);
    drawCollectibles(state.cameraX);
    drawFinishLine(state.cameraX);
    if (!player.dead) drawPlayer();
    else {
      // flash
      if (Math.floor(performance.now() / 60) % 2 === 0) drawPlayer();
    }
  }

  let rafId = 0;
  function loop(t) {
    if (!state.lastT) state.lastT = t;
    const dt = Math.min(0.033, (t - state.lastT) / 1000);
    state.lastT = t;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  return {
    pause() { state.paused = true; },
    resume() { state.paused = false; state.lastT = 0; },
    reset,
    getState: () => ({
      elapsed: state.elapsed,
      collected: state.collected,
      total: state.total,
      soulHealth: state.soulHealth,
      status: state.finished ? "finished" : state.running ? "playing" : "ready",
      finished: state.finished,
    }),
    destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    },
  };
}
