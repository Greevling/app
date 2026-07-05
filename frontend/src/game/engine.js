// Simple Canvas platformer engine for Soulbound
// Player auto-runs across a procedurally generated level tuned to song duration.
// Space/Up to jump. Left/Right to nudge speed.
console.log("[soulbound] engine.js loaded", new Date().toISOString());


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

// Distance thresholds. `hasCollectibleNear` checks x AND y so ground burgers
// and platform burgers can coexist on the same screen without visually piling.
const COLLECT_MIN_DX = 70;
const COLLECT_MIN_DY = 40;
// Ground obstacle spacing: minimum gap between the RIGHT edge of one obstacle
// and the LEFT edge of the next. Increase for a breezier level, decrease for
// a denser one.
const OBSTACLE_MIN_GAP = 240;

function buildLevel(level, duration /*, beatTimes (ignored) */) {
  const rand = mulberry32(level.seed);
  const speed = BASE_SPEED;
  const totalWidth = duration * speed;

  const obstacles = [];
  const collectibles = [];
  const platforms = [];

  // Helper: is this proposed collectible position too close to something we've
  // already placed? Prevents burgers from stacking or clustering weirdly.
  const hasCollectibleNear = (cx, cy) => {
    for (const c of collectibles) {
      if (Math.abs(c.x - cx) < COLLECT_MIN_DX && Math.abs(c.y - cy) < COLLECT_MIN_DY) {
        return true;
      }
    }
    const flyerCount = obstacles.filter(o => o.type === "flyer").length;
const flyerTimes = obstacles.filter(o => o.type === "flyer").map(o => o.spawnT.toFixed(1));
console.log(
  "[soulbound] buildLevel:",
  { flyers: flyerCount, duration: duration.toFixed(1), spawnTs: flyerTimes }
);
    return false;
  };

  const tryPushCollectible = (cx, cy) => {
    if (!hasCollectibleNear(cx, cy)) {
      collectibles.push({ x: cx, y: cy, taken: false });
    }
  };

  // Right edge of the most recently placed ground obstacle (or -Infinity).
  const rightEdgeOf = (o) => {
    if (o.type === "pit") return o.x + o.w;
    if (o.type === "spike") return o.x + o.w;
    return o.x + (o.w || 0);
  };

  // ---- Pass 1: Floating platforms + platform-top collectibles ----
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
        if (rand() < 0.85) {
          const cy = py - 20;
          if (pw >= 120) {
            tryPushCollectible(px + pw * 0.28, cy);
            tryPushCollectible(px + pw * 0.72, cy);
          } else {
            tryPushCollectible(px + pw / 2, cy);
          }
        }
        px += pw + 210 + rand() * 180;
      } else {
        px += 260 + rand() * 220;
      }
    }
  }

  // ---- Pass 2: Ground obstacles (purely procedural, sequential) ----
  // A single left-to-right cursor `x` advances past each obstacle by its own
  // width plus a gap. This makes overlaps structurally impossible.
  let x = 520; // first obstacle starts well past the player's spawn
  while (x < totalWidth - 500) {
    const roll = rand();
    let kind;
    if (roll < 0.20) kind = "pit";
    else if (roll < 0.60) kind = "flyer";
    else kind = "spike";
    // Flyer is a bathroom-only mechanic (poop from toilets). Everywhere else
    // it becomes another spike obstacle themed by the scene.
    if (kind === "flyer" && level.scene !== "bathroom") kind = "spike";                  // 40% plain toilets

    if (kind === "pit") {
      const w = 60 + Math.floor(rand() * 45);
      obstacles.push({ type: "pit", x, w });
      // Arc of collectibles across the pit
      const midY = 220;
      for (let i = 0; i < 3; i++) {
        const cx = x + 10 + i * (w / 3);
        const cy = midY - Math.sin((i / 2) * Math.PI) * 40;
        tryPushCollectible(cx, cy);
      }
      x += w + OBSTACLE_MIN_GAP + rand() * 160;

    } else if (kind === "flyer") {
      // Toilet + poop combo. Poop launches straight up from the bowl and lands
      // back in it. Launcher sprite is 40 wide, centered on x + 11 (poop launch).
      // spawnT = the game-clock moment when the player will be AT this toilet.
      // Player starts at x=120, so subtract that offset. Now the poop's arc
      // (dt in [-1.0, 0)) unfolds IN FRONT of the player and lands exactly
      // when the player arrives — forcing them to jump.
      const flyer = { type: "flyer", x, w: 22, h: 22, spawnT: (x - 120) / speed };
      obstacles.push(flyer);
      obstacles.push({
        type: "spike",
        x: x - 9,
        w: 40,
        h: 44,
        _launcher: true,
        _flyer: flyer,
      });
      // Bait burger placed BEFORE the toilet so player runs into the danger zone.
      tryPushCollectible(x - 140, 240);
      // Advance past the launcher toilet's footprint (40 wide) + full gap.
      x += 40 + OBSTACLE_MIN_GAP + rand() * 160;

    } else {
      // Plain toilet spike (no poop).
      const w = 42 + Math.floor(rand() * 14);
      const h = 44 + Math.floor(rand() * 18);
      obstacles.push({ type: "spike", x, w, h });
      // Reward burger before the toilet
      tryPushCollectible(x - 90, 240);
      // Reward burger after the toilet (if space allows)
      tryPushCollectible(x + w + 90, 240);
      x += w + OBSTACLE_MIN_GAP + rand() * 160;
    }
  }

  return { obstacles, collectibles, platforms, totalWidth, speed };
}

export function createGame({ canvas, level, duration, beatTimes, onStateChange, onFinish, onDeath, onCollect }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const world = buildLevel(level, duration, beatTimes);
  const sprites = { frames: [], toilet: null, toiletOpen: null, patient: null, bed: null };
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
   // ---- Hospital scene sprites ----
  const patientImg = new Image();
  patientImg.onload = () => { sprites.patient = patientImg; };
  patientImg.onerror = () => console.warn("[soulbound] patient sprite missing at", patientImg.src);
  patientImg.src = "/art/props/patient.png?v=" + Date.now();

  const bedImg = new Image();
  bedImg.onload = () => { sprites.bed = bedImg; };
  bedImg.onerror = () => console.warn("[soulbound] bed sprite missing at", bedImg.src);
  bedImg.src = "/art/props/bed.png?v=" + Date.now();
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
    soulHealth: 1,
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
    state.soulHealth = 1;
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
        baseAlpha: 0.78, // was 0.5 — chunkier smear, still fades over time
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
// Flicker state (hospital scene only). Populated on first hospital frame.
  const flicker = { nextAt: 5 + Math.random() * 6, active: false, until: 0 };

  function drawHospitalScene(camX) {
    // --- Walls (bright off-white) ---
    ctx.fillStyle = "#eef2f5";
    ctx.fillRect(0, 0, W, H - GROUND_HEIGHT);

    // Subtle horizontal tile lines on wall
    ctx.strokeStyle = "rgba(180,190,195,0.55)";
    ctx.lineWidth = 1;
    for (let y = 40; y < H - GROUND_HEIGHT; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Vertical tile grid, parallax with camera
    const tileW = 90;
    const offX = -Math.floor(camX * 0.6) % tileW;
    for (let x = offX - tileW; x < W + tileW; x += tileW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H - GROUND_HEIGHT);
      ctx.stroke();
    }

    // --- Ceiling shadow strip ---
    const ceilingGrad = ctx.createLinearGradient(0, 0, 0, 60);
    ceilingGrad.addColorStop(0, "rgba(80,90,100,0.55)");
    ceilingGrad.addColorStop(1, "rgba(80,90,100,0)");
    ctx.fillStyle = ceilingGrad;
    ctx.fillRect(0, 0, W, 60);

    // --- Fluorescent ceiling lights (parallax w/ camera) ---
    const lightSpacing = 180;
    const lightOffX = -Math.floor(camX * 0.75) % lightSpacing;
    for (let x = lightOffX - lightSpacing; x < W + lightSpacing; x += lightSpacing) {
      // mount bracket
      ctx.fillStyle = "#78848d";
      ctx.fillRect(x + 44, 0, 4, 14);
      // tube fixture
      ctx.fillStyle = "#c8ced3";
      ctx.fillRect(x + 10, 14, 72, 8);
      // glowing tube (dimmer during flicker)
      ctx.save();
      const on = !flicker.active;
      ctx.globalAlpha = on ? 1 : 0.25;
      ctx.fillStyle = "#fff8d8";
      ctx.fillRect(x + 12, 16, 68, 4);
      // downward glow cone
      const cone = ctx.createLinearGradient(x + 46, 20, x + 46, 220);
      cone.addColorStop(0, on ? "rgba(255,247,210,0.45)" : "rgba(255,247,210,0.08)");
      cone.addColorStop(1, "rgba(255,247,210,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(x + 8, 20);
      ctx.lineTo(x + 84, 20);
      ctx.lineTo(x + 116, 220);
      ctx.lineTo(x - 24, 220);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- Wall props: doors, "no-exit" signs, wall clock (very sparse) ---
    const propEvery = 640;
    const propStart = Math.floor(camX / propEvery) * propEvery - propEvery;
    for (let px = propStart; px < camX + W + propEvery; px += propEvery) {
      const sx = px - camX;
      // hospital door
      ctx.fillStyle = "#a8b3b8";
      ctx.fillRect(sx, H - GROUND_HEIGHT - 130, 50, 130);
      ctx.fillStyle = "#eef2f5";
      ctx.fillRect(sx + 4, H - GROUND_HEIGHT - 126, 42, 60);   // top window
      ctx.fillStyle = "#5a6570";
      ctx.fillRect(sx + 4, H - GROUND_HEIGHT - 60, 42, 3);      // divider
      ctx.fillStyle = "#7a848c";
      ctx.fillRect(sx + 40, H - GROUND_HEIGHT - 78, 4, 6);      // handle
      // biohazard-ish red trim
      ctx.fillStyle = "#EF476F";
      ctx.fillRect(sx, H - GROUND_HEIGHT - 130, 50, 3);
    }
  }

  function drawBg() {
    if (level.scene === "bathroom") { drawBathroomScene(); return; }
    if (level.scene === "hospital") { drawHospitalScene(state.cameraX); return; }
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
    } else if (level.scene === "hospital") {
      // Sickly light-green clinical linoleum
      ctx.fillStyle = "#c8d4d0";
      ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);
      // large square tile grid
      ctx.strokeStyle = "rgba(90,110,105,0.35)";
      ctx.lineWidth = 1;
      const tileSize = 70;
      const offX = -Math.floor(camX) % tileSize;
      for (let x = offX - tileSize; x < W + tileSize; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, H - GROUND_HEIGHT); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, H - GROUND_HEIGHT + tileSize / 2);
      ctx.lineTo(W, H - GROUND_HEIGHT + tileSize / 2);
      ctx.stroke();
      // scuff marks
      ctx.fillStyle = "rgba(80,95,90,0.15)";
      for (let i = 0; i < 8; i++) {
        const sx = ((i * 231 - camX * 0.9) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.fillRect(sx, H - GROUND_HEIGHT + 20 + (i % 3) * 15, 30, 2);
      }
      // dark top edge
      ctx.fillStyle = "#5a6570";
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
          const drawW = 64;      // rendered width  in world pixels (was 48)
          const drawH = 64;      // rendered height in world pixels (was 48)
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
      } else if (level.scene === "hospital") {
        if (sprites.patient) {
          const drawW = 48;
          const drawH = 72;
          const dx = sx + o.w / 2 - drawW / 2;
          const dy = H - GROUND_HEIGHT - drawH;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprites.patient, dx, dy, drawW, drawH);
        } else {
          // Fallback stick-figure so gameplay works before sprite is dropped in
          const px = sx + o.w / 2;
          const py = H - GROUND_HEIGHT;
          ctx.fillStyle = "#e8e2d5";                  // gown
          ctx.fillRect(px - 14, py - 46, 28, 40);
          ctx.fillStyle = "#c8b8a0";                  // face
          ctx.fillRect(px - 10, py - 62, 20, 18);
          ctx.fillStyle = "#EF476F";                  // wild eye
          ctx.fillRect(px - 6, py - 54, 3, 3);
          ctx.fillRect(px + 2, py - 54, 3, 3);
          ctx.fillStyle = "#0b0d16";                  // stringy hair
          ctx.fillRect(px - 12, py - 66, 24, 6);
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
      } else if (level.scene === "hospital") {
        // 8-bit music note
        ctx.shadowColor = level.palette.accent;
        ctx.shadowBlur = 14;
        ctx.fillStyle = level.palette.accent;
        // stem
        ctx.fillRect(2, -10, 3, 14);
        // note head (angled ellipse feel)
        ctx.fillRect(-6, 2, 10, 6);
        ctx.fillRect(-5, 1, 10, 8);
        // flag
        ctx.fillRect(5, -10, 6, 3);
        ctx.fillRect(5, -6, 4, 3);
        // highlight
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillRect(-4, 3, 3, 2);
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

    // collectibles — AABB against a generous 28x28 pickup box centered on c.x/c.y.
    // Player is 54x82, so a full box-vs-box check is much more forgiving than
    // the old 26-px radius (which missed items at head-height).
    const PICK_W = 28;
    const PICK_H = 28;
    for (const c of world.collectibles) {
      if (c.taken) continue;
      const cx0 = c.x - PICK_W / 2;
      const cx1 = c.x + PICK_W / 2;
      const cy0 = c.y - PICK_H / 2;
      const cy1 = c.y + PICK_H / 2;
      if (
        player.x + player.w > cx0 &&
        player.x < cx1 &&
        player.y + player.h > cy0 &&
        player.y < cy1
      ) {
        c.taken = true;
        state.collected++;
        onCollect?.(state.collected);
      }
    }

    // camera
    state.cameraX = Math.max(0, player.x - W * 0.3);

    // Success requires reaching the finish line AND collecting >= 80% of items.
    // If total is 0 (no collectibles at all), any finish-line touch counts.
     const enoughCollected = state.total === 0
      ? true
      : state.collected / state.total >= 0.9;

    // finish
    if (player.x >= world.totalWidth - 20) {
      state.finished = true;
      onFinish?.({
        elapsed: state.elapsed,
        collected: state.collected,
        total: state.total,
        success: enoughCollected,
        reachedFinish: true,
      });
    }
    // Hospital lights: occasional short flicker → temporary darkness overlay.
    if (level.scene === "hospital") {
      if (!flicker.active && state.elapsed >= flicker.nextAt) {
        flicker.active = true;
        flicker.until = state.elapsed + 0.14 + Math.random() * 0.12; // 0.14-0.26s
      }
      if (flicker.active && state.elapsed >= flicker.until) {
        flicker.active = false;
        flicker.nextAt = state.elapsed + 5 + Math.random() * 8;      // 5-13s
      }
    }
    // time out (song ended)
    if (state.elapsed >= duration) {
      state.finished = true;
      const reachedFinish = player.x >= world.totalWidth - 20;
      onFinish?.({
        elapsed: state.elapsed,
        collected: state.collected,
        total: state.total,
        success: reachedFinish && enoughCollected,
        reachedFinish,
      });
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
    const hospital = level.scene === "hospital";
    for (const p of world.platforms) {
      const sx = p.x - camX;
      if (sx + p.w < -20 || sx > W + 20) continue;
      if (bathroom) {
        // marble slabb matching the bathroom floor
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
      } else if (hospital) {
        if (sprites.bed) {
          const drawH = 36;
          // The sprite's TOP must line up with p.y (that's the collision surface).
          // Bed sprite is wider than collision box for visual overhang; center it.
          const drawW = Math.max(p.w + 32, 96);
          const dx = sx + p.w / 2 - drawW / 2;
          const dy = p.y - (drawH - p.h);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(sprites.bed, dx, dy, drawW, drawH);
        } else {
          // Fallback bed drawing (white mattress + metal frame)
          ctx.fillStyle = "#f5f7f8";                          // sheet
          ctx.fillRect(sx, p.y, p.w, p.h);
          ctx.fillStyle = "#78848d";                          // metal frame top rail
          ctx.fillRect(sx - 4, p.y - 2, p.w + 8, 3);
          ctx.fillStyle = "#5a6570";                          // legs
          ctx.fillRect(sx, p.y + p.h, 3, 22);
          ctx.fillRect(sx + p.w - 3, p.y + p.h, 3, 22);
          ctx.fillStyle = "#c8ced3";                          // pillow
          ctx.fillRect(sx + 4, p.y - 6, 22, 8);
          // subtle red stain
          ctx.fillStyle = "rgba(239,71,111,0.35)";
          ctx.fillRect(sx + p.w * 0.45, p.y + 2, 12, 4);
        }
      } else {
        // pixel block themed to level palette (unchanged) ...
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
      if (Math.floor(performance.now() / 60) % 2 === 0) drawPlayer();
    }
    drawSplatters();

    // Flicker overlay — very short bursts of near-darkness. Not opaque, so
    // silhouettes remain visible enough to keep dodging obstacles.
    if (level.scene === "hospital" && flicker.active) {
      ctx.save();
      ctx.fillStyle = "rgba(5,8,12,0.78)";
      ctx.fillRect(0, 0, W, H);
      // Small residual glow so the player isn't 100% blind
      const px = player.x - state.cameraX + player.w / 2;
      const py = player.y + player.h / 2;
      const grad = ctx.createRadialGradient(px, py, 20, px, py, 140);
      grad.addColorStop(0, "rgba(255,247,210,0.35)");
      grad.addColorStop(1, "rgba(255,247,210,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
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
