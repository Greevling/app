// Simple Canvas platformer engine for Soulbound
// Player auto-runs across a procedurally generated level tuned to song duration.
// Space/Up to jump. Left/Right to nudge speed.

const GRAVITY = 1500;         // px/s^2
const JUMP_VELOCITY = -620;   // px/s (first jump - from ground/platform)
const JUMP_VELOCITY_2 = -470; // px/s (second jump - slightly weaker)
const BASE_SPEED = 220;       // px/s
const NUDGE = 90;
const GROUND_HEIGHT = 80;
const MAX_JUMPS = 2;          // double jump


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
  const platforms = [];

  // ---- Procedural floating platforms (independent of beat map) ----
  // Placed so top surface is reachable (max jump apex ~128px above stand height)
  // Ground stand y ~= 238. Player h=82. Max reachable top y ~ 130.
  // Platform top y range: 150..215 (safely reachable, safely above head when standing).
  const P_MIN_Y = 150;
  const P_MAX_Y = 215;
  const P_H = 14;
  {
    let px = 700;
    while (px < totalWidth - 500) {
      if (rand() < 0.72) {
        const pw = 80 + Math.floor(rand() * 80);
        const py = P_MIN_Y + Math.floor(rand() * (P_MAX_Y - P_MIN_Y));
        platforms.push({ x: px, y: py, w: pw, h: P_H });
        // Reward: 85% chance to place collectible(s) above the platform.
        // Wide platforms get two, spaced across the top; narrow ones get one centered.
        if (rand() < 0.85) {
          const cy = py - 20;
          if (pw >= 120) {
            collectibles.push({ x: px + pw * 0.28, y: cy, taken: false });
            collectibles.push({ x: px + pw * 0.72, y: cy, taken: false });
          } else {
            collectibles.push({ x: px + pw / 2, y: cy, taken: false });
          }
        }
        px += pw + 210 + rand() * 180;
      } else {
        px += 260 + rand() * 220;
      }
    }
  }

  if (beatTimes && beatTimes.length > 0) {
    let lastX = 0;
    const MIN_GAP = 340;   // was 140 — much breathier pacing
    for (let i = 0; i < beatTimes.length; i++) {
      const t = beatTimes[i];
      if (t < 2) continue;
      const x = t * speed;
      if (x > totalWidth - 300) break;
      if (x - lastX < MIN_GAP) continue;
      const r = rand();
      const kind = r < 0.2 ? "pit" : r < 0.55 ? "flyer" : "spike";
      if (kind === "pit") {
        const w = 55 + Math.floor(rand() * 45);
        obstacles.push({ type: "pit", x, w });
        const midY = 220;
        for (let j = 0; j < 3; j++) collectibles.push({ x: x + 10 + j * (w / 3), y: midY - Math.sin((j / 2) * Math.PI) * 40, taken: false });
        lastX = x + w;
      } else if (kind === "flyer") {
        // Toilet flushes: poop erupts straight up from the bowl and falls back onto it.
        const flyer = { type: "flyer", x, w: 22, h: 22, spawnT: t };
        obstacles.push(flyer);
        // Launcher toilet sits at the SAME x as the poop and knows which flyer it belongs to.
        obstacles.push({ type: "spike", x: x - 4, w: 30, h: 24, _launcher: true, _flyer: flyer });
        // Burger placed BEFORE the toilet so player is baited into the danger zone.
        collectibles.push({ x: x - 110, y: 240, taken: false });
        lastX = x + 80;
      } else {
        const w = 26 + Math.floor(rand() * 14);
        const h = 30 + Math.floor(rand() * 22);
        obstacles.push({ type: "spike", x, w, h });
        collectibles.push({ x: x - 70, y: 240, taken: false });
        lastX = x + w + 40;          // spike branch — bit of extra tail
      }
    }
    return { obstacles, collectibles, platforms, totalWidth, speed };
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
      x += w + 320 + rand() * 240;  // pit
    } else {
      const w = 26 + Math.floor(rand() * 18);
      const h = 30 + Math.floor(rand() * 26);
      obstacles.push({ type: "spike", x, w, h });
      collectibles.push({ x: x - 90, y: 240, taken: false });
      collectibles.push({ x: x + w + 90, y: 240, taken: false });
      x += w + 280 + rand() * 220;  // spike
    }
  }
  return { obstacles, collectibles, platforms, totalWidth, speed };
}

export function createGame({ canvas, level, duration, beatTimes, onStateChange, onFinish, onDeath, onCollect }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const world = buildLevel(level, duration, beatTimes);
  const sprites = { frames: [], toilet: null, toiletOpen: null };
  const load = (n) => { const i = new Image(); i.onload = () => { sprites.frames[n] = i; }; i.src = `/art/${level.id}-${n + 1}.png`; };
  load(0); load(1)
  // Optional prop sprite for bathroom toilets. Falls back to canvas drawing if missing.
  const toiletImg = new Image();
  toiletImg.onload = () => {
    sprites.toilet = toiletImg;
    window.__sb_toilet = { status: "loaded", w: toiletImg.naturalWidth, h: toiletImg.naturalHeight, src: toiletImg.src };
    console.log("%c[soulbound] toilet sprite LOADED", "color:#7cc06a", window.__sb_toilet);
  };
  toiletImg.onerror = (e) => {
    window.__sb_toilet = { status: "error", src: toiletImg.src };
    console.warn("%c[soulbound] toilet sprite FAILED", "color:#EF476F", window.__sb_toilet, e);
  };
  toiletImg.src = "/art/props/toilet.png?v=" + Date.now();

  const toiletOpenImg = new Image();
  toiletOpenImg.onload = () => { sprites.toiletOpen = toiletOpenImg; };
  toiletOpenImg.onerror = () => { console.warn("[soulbound] toilet-open sprite missing at", toiletOpenImg.src); };
  toiletOpenImg.src = "/art/props/toilet-open.png?v=" + Date.now();
  const player = {
    x: 120,
    y: H - GROUND_HEIGHT - 82,
    vy: 0,
    w: 54,
    h: 82,
    onGround: true,
    jumpsLeft: MAX_JUMPS,
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
    splatters: [], // brown blobs stuck to the screen from poop hits
    world,
  };

  function reset() {
    player.x = 120; player.y = H - GROUND_HEIGHT - 40; player.vy = 0;
    player.onGround = true; player.dead = false;
    player.jumpsLeft = MAX_JUMPS;
    state.elapsed = 0; state.cameraX = 0; state.collected = 0;
    world.collectibles.forEach(c => (c.taken = false));
    state.soulHealth = 3;
    state.finished = false;
    state.splatters = [];
  }

  function keyDown(e) {
    if (["ArrowLeft", "KeyA"].includes(e.code)) state.keys.left = true;
    if (["ArrowRight", "KeyD"].includes(e.code)) state.keys.right = true;
    if (["ArrowUp", "Space", "KeyW"].includes(e.code)) {
      state.keys.jump = true;
      if (!state.running && !state.finished) { state.running = true; onStateChange?.("playing"); }
      // Only trigger on the actual press (not OS key-repeat) so double-jump doesn't burn both jumps.
      if (!e.repeat && state.running && !state.paused && !player.dead && player.jumpsLeft > 0) {
        player.vy = player.onGround ? JUMP_VELOCITY : JUMP_VELOCITY_2;
        player.onGround = false;
        player.jumpsLeft--;
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
      if (o.type !== "spike") continue;
      const sy = H - GROUND_HEIGHT - o.h;
      if (px + pw > o.x && px < o.x + o.w && py + ph > sy) return o;
    }
    return null;
  }

  function hitFlyer(px, py, pw, ph) {
    for (const o of world.obstacles) {
      if (o.type !== "flyer" || o._px === undefined || o._splashed) continue;
      const dt = state.elapsed - o.spawnT;
      if (dt < -1.0 || dt > 0) continue;
      const wx = o._px + state.cameraX;
      const wy = o._py;
      if (px + pw > wx && px < wx + 22 && py + ph > wy && py < wy + 22) return o;
    }
    return null;
  }

  function spawnSplatters(count) {
    const now = performance.now();
    const MAX = 14;
    while (state.splatters.length + count > MAX && state.splatters.length > 0) {
      state.splatters.shift(); // evict oldest
    }
    const browns = ["#4a2610", "#6b3a1e", "#5a2f16", "#3a1d0c"];
    for (let i = 0; i < count; i++) {
      const cx = 60 + Math.random() * (W - 120);
      const cy = 40 + Math.random() * (H - 120);
      const size = 26 + Math.random() * 42;
      const drops = [];
      const nd = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < nd; j++) {
        drops.push({
          dx: (Math.random() - 0.5) * size * 1.8,
          dy: (Math.random() - 0.5) * size * 1.8,
          r: 3 + Math.random() * 9,
        });
      }
      state.splatters.push({
        x: cx, y: cy,
        rx: size, ry: size * (0.55 + Math.random() * 0.5),
        rot: Math.random() * Math.PI * 2,
        color: browns[Math.floor(Math.random() * browns.length)],
        baseAlpha: 0.5, // capped so the screen never becomes impossible to see through
        t0: now,
        life: 6.5,
        drops,
      });
    }
  }

  function drawSplatters() {
    if (state.splatters.length === 0) return;
    const now = performance.now();
    for (let i = state.splatters.length - 1; i >= 0; i--) {
      const s = state.splatters[i];
      const age = (now - s.t0) / 1000;
      if (age >= s.life) { state.splatters.splice(i, 1); continue; }
      const fade = 1 - age / s.life;
      ctx.save();
      ctx.globalAlpha = s.baseAlpha * fade;
      ctx.fillStyle = s.color;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-s.rot);
      for (const d of s.drops) {
        ctx.beginPath();
        ctx.arc(d.dx, d.dy, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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
        // Decide which frame to draw: seat-open while THIS toilet's poop is airborne, closed otherwise.
        let toiletFrame = sprites.toilet;
        if (o._launcher && o._flyer && sprites.toiletOpen) {
          const fdt = state.elapsed - o._flyer.spawnT;
          if (fdt >= -1.0 && fdt < 0) toiletFrame = sprites.toiletOpen;
        }
        // Use custom sprite if loaded, otherwise fall back to programmatic drawing.
        if (toiletFrame) {
          const drawW = 48;      // rendered width  in world pixels
          const drawH = 48;      // rendered height in world pixels
          const dx = sx + o.w / 2 - drawW / 2;
          const dy = H - GROUND_HEIGHT - drawH;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(toiletFrame, dx, dy, drawW, drawH);
        } else {
          // ---- fallback: original canvas-drawn toilet ----
          const bx = sx - 8;
          const bw = o.w + 16;
          const bh = o.h;
          ctx.fillStyle = "#f4f2ee";
          ctx.fillRect(bx, H - GROUND_HEIGHT - bh * 0.55, bw, bh * 0.55);
          ctx.fillRect(bx + 4, H - GROUND_HEIGHT - bh * 0.6, bw - 8, 6);
          const tankH = bh * 0.5;
          ctx.fillRect(bx + bw * 0.15, H - GROUND_HEIGHT - bh, bw * 0.7, tankH);
          ctx.fillStyle = "#7cc7f0";
          ctx.fillRect(bx + 6, H - GROUND_HEIGHT - bh * 0.5, bw - 12, 6);
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.fillRect(bx, H - GROUND_HEIGHT - 2, bw, 2);
          ctx.fillStyle = "#d8d5cf";
          ctx.fillRect(bx, H - GROUND_HEIGHT - bh * 0.6, bw, 2);
        }
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
      // Poop erupts straight up from the toilet, peaks, and lands back in the bowl at dt=0.
      // Clipped so it never goes past the ground line.
      const life = 1.0;
      if (dt < -1.0 || dt > 0) continue;
      const p = (dt + 1.0) / life; // 0..1
      if (p >= 1) continue; // landed — hide it
      const arcY = -110 * Math.sin(p * Math.PI);
      const cx = sx + 11;
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
    if (sprites.frames[0] && sprites.frames[1]) {
      const px = player.x - state.cameraX;
      const py = player.y;
      const frame = Math.floor(state.elapsed * 8) % 2;
      const im = sprites.frames[frame];
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(im, px, py, player.w, player.h);
      const fh = 6 + Math.sin(state.elapsed * 10) * 2;
      ctx.fillStyle = level.palette.accent;
      ctx.shadowColor = level.palette.accent;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(px + player.w / 2, py - 6 - fh, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }
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
    const prevY = player.y;
    player.y += player.vy * dt;

    // Platform collisions — one-way: only collide when landing on top.
    // Head-bumps from below pass straight through with no damage.
    let landedOnPlatform = false;
    for (const p of world.platforms) {
      // Horizontal overlap
      if (player.x + player.w <= p.x || player.x >= p.x + p.w) continue;
      // Land on top: was above previous frame, now crossing/at top surface, moving down
      if (player.vy >= 0 && prevY + player.h <= p.y && player.y + player.h >= p.y) {
        player.y = p.y - player.h;
        player.vy = 0;
        landedOnPlatform = true;
        break;
      }
    }

    const floorY = H - GROUND_HEIGHT - player.h;
    // detect pit
    const centerX = player.x + player.w / 2;
    const overPit = inPit(centerX);
    let landedOnGround = false;
    if (!landedOnPlatform) {
      if (!overPit && player.y >= floorY) {
        player.y = floorY;
        player.vy = 0;
        landedOnGround = true;
      } else if (overPit) {
        // no floor
        if (player.y > H + 40) {
          loseHealth();
        }
      }
    }

    // Update grounded / jump refill
    const grounded = landedOnPlatform || landedOnGround;
    if (grounded) {
      if (!player.onGround) player.jumpsLeft = MAX_JUMPS;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // spike (toilet) — still a life-losing obstacle
    if (hitSpike(player.x, player.y, player.w, player.h)) {
      loseHealth();
    }
    // poop hit — no damage, just brown splatter across the screen
    const flyer = hitFlyer(player.x, player.y, player.w, player.h);
    if (flyer) {
      flyer._splashed = true;
      spawnSplatters(6);
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
      player.onGround = true;
      player.jumpsLeft = MAX_JUMPS;
      player.dead = false;
    }, 250);
  }

  function drawPlatforms(camX) {
    const bathroom = level.scene === "bathroom";
    for (const p of world.platforms) {
      const sx = p.x - camX;
      if (sx + p.w < -20 || sx > W + 20) continue;
      if (bathroom) {
        // marble slab matching the bathroom floor
        ctx.fillStyle = "#e8e6e1";
        ctx.fillRect(sx, p.y, p.w, p.h);
        // top polished edge
        ctx.fillStyle = "#8a95a3";
        ctx.fillRect(sx, p.y, p.w, 2);
        // bottom shadow
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(sx, p.y + p.h - 2, p.w, 2);
        // subtle veining
        ctx.strokeStyle = "rgba(140,140,150,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 6, p.y + Math.floor(p.h / 2));
        ctx.lineTo(sx + p.w - 8, p.y + Math.floor(p.h / 2) + 1);
        ctx.stroke();
      } else {
        // pixel block themed to level palette
        ctx.fillStyle = level.palette.ground;
        ctx.fillRect(sx, p.y, p.w, p.h);
        // accent-glowing top rim
        ctx.fillStyle = level.palette.accent;
        ctx.fillRect(sx, p.y, p.w, 2);
        // side highlight
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(sx, p.y + 2, 2, p.h - 4);
        // bottom shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(sx, p.y + p.h - 2, p.w, 2);
        // faint glow above rim
        ctx.save();
        ctx.shadowColor = level.palette.accent;
        ctx.shadowBlur = 8;
        ctx.fillStyle = level.palette.accent;
        ctx.fillRect(sx, p.y, p.w, 1);
        ctx.restore();
      }
    }
  }

  function render() {
    drawBg();
    drawGround(state.cameraX);
    drawPlatforms(state.cameraX);
    drawObstacles(state.cameraX);
    drawCollectibles(state.cameraX);
    drawFinishLine(state.cameraX);
    if (!player.dead) drawPlayer();
    else {
      // flash
      if (Math.floor(performance.now() / 60) % 2 === 0) drawPlayer();
    }
    drawSplatters();
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
