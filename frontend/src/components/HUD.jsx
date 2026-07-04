import { Pause } from "lucide-react";

const formatTime = (s) => {
  const m = Math.floor(s / 60).toString().padStart(1, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export default function HUD({
  level,
  elapsed,
  duration,
  collected,
  totalCollectibles,
  soulHealth,
  onPause,
  status,
}) {
  const progress = Math.min(100, (elapsed / duration) * 100);
  const remaining = Math.max(0, duration - elapsed);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Top bar */}
      <div className="flex items-start justify-between p-4 md:p-6 gap-4">
        {/* Left: Character */}
        <div className="pointer-events-auto pixel-corners bg-soul-surface/85 border border-soul-ash px-4 py-3 backdrop-blur-md flex items-center gap-3 min-w-[180px]">
          <div className="relative w-10 h-10 border border-soul-ash bg-soul-void flex items-center justify-center">
            <div
              className="w-6 h-6 rounded-full animate-flicker"
              style={{
                background: `radial-gradient(circle, ${level.palette.accent}, rgba(0,0,0,0))`,
                boxShadow: `0 0 12px ${level.palette.accent}`,
              }}
              data-testid="hud-soul-orb"
            />
          </div>
          <div className="leading-tight">
            <div className="font-heading text-lg text-soul-ink" data-testid="hud-character-name">
              {level.name}
            </div>
            <div className="font-body text-[10px] uppercase tracking-[0.2em] text-soul-mute">
              {level.role}
            </div>
          </div>
        </div>

        {/* Center: Song progress */}
        <div className="pointer-events-auto flex-1 max-w-md mx-auto">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="font-mono text-sm text-soul-mute" data-testid="hud-elapsed">
              {formatTime(elapsed)}
            </span>
            <span className="font-body text-[10px] uppercase tracking-[0.2em] text-soul-amber soul-glow">
              {level.life_theme}
            </span>
            <span className="font-mono text-sm text-soul-mute" data-testid="hud-remaining">
              -{formatTime(remaining)}
            </span>
          </div>
          <div className="w-full h-3 bg-soul-surface border border-soul-ash relative overflow-hidden pixel-corners">
            <div
              className="song-progress-fill h-full transition-[width] duration-100 ease-linear"
              style={{ width: `${progress}%` }}
              data-testid="hud-song-progress"
            />
          </div>
        </div>

        {/* Right: Collectibles + Pause */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="pixel-corners bg-soul-surface/85 border border-soul-ash px-4 py-3 backdrop-blur-md flex items-center gap-2">
            <span className="text-xl leading-none" aria-hidden>{level.collect_icon}</span>
            <span className="font-heading text-lg text-soul-amber soul-glow" data-testid="hud-collected">
              {collected}
              <span className="text-soul-mute text-sm">/{totalCollectibles}</span>
            </span>
          </div>
          <button
            onClick={onPause}
            data-testid="hud-pause-btn"
            className="pixel-corners bg-soul-surface/85 border border-soul-ash p-3 hover:border-soul-amber hover:text-soul-amber transition-colors"
            aria-label="Pause"
          >
            <Pause className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom status band */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
        {status === "ready" && (
          <div className="font-heading text-2xl text-soul-amber soul-glow animate-flicker" data-testid="hud-status">
            PRESS SPACE TO BEGIN
          </div>
        )}
        {status === "playing" && (
          <div className="font-body text-xs uppercase tracking-[0.3em] text-soul-mute">
            ← → move · space / ↑ jump · esc pause
          </div>
        )}
      </div>

      {/* Soul health pip */}
      <div className="absolute bottom-4 left-4 flex gap-1" data-testid="hud-health">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 border ${i < soulHealth ? "bg-soul-rose border-soul-rose" : "border-soul-ash bg-transparent"}`}
            style={i < soulHealth ? { boxShadow: "0 0 8px #EF476F" } : {}}
          />
        ))}
      </div>
    </div>
  );
}
