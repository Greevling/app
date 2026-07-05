import { Link } from "react-router-dom";
import { Play, List, Info, Volume2, VolumeX } from "lucide-react";
import { useVolume, DEFAULT_VOLUME } from "@/lib/volume";

export default function MainMenu() {
  const { volume, setVolume } = useVolume();

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1517328894681-0f5dfabd463c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwxfHxtZWxhbmNob2xpYyUyMG5pZ2h0JTIwY2l0eSUyMHJhaW58ZW58MHx8fHwxNzgzMTY0MjIyfDA&ixlib=rb-4.1.0&q=85)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.35) saturate(0.7)",
        }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-b from-soul-void/70 via-soul-void/50 to-soul-void" aria-hidden />
      <div className="absolute inset-0 grid-bg opacity-40" aria-hidden />

      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none">
        <div
          className="w-40 h-40 rounded-full animate-flicker"
          style={{
            background: "radial-gradient(circle, rgba(255,209,102,0.55), rgba(255,209,102,0) 70%)",
            filter: "blur(6px)",
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        <nav className="p-6 md:p-8 flex items-center justify-between">
          <div className="font-heading text-xl md:text-2xl text-soul-amber soul-glow tracking-wider" data-testid="brand-mark">
            SOULBOUND
          </div>
          <Link
            to="/about"
            data-testid="nav-about"
            className="font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-amber transition-colors"
          >
            About
          </Link>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-8 animate-fadeInUp">
          <div className="font-body text-[11px] uppercase tracking-[0.4em] text-soul-mute">
            A pixel platformer scored to your songs
          </div>
          <h1 className="font-heading text-6xl sm:text-7xl md:text-8xl tracking-tighter uppercase soul-glow leading-none">
            Soul<span className="text-soul-amber">bound</span>
          </h1>
          <p className="font-body text-base md:text-lg text-soul-mute max-w-xl leading-relaxed">
            Possess. Help. Transcend. Each level is a life. Each life is a song.
            Finish the mission before the last note fades.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-6">
            <Link
              to="/levels"
              data-testid="menu-play-btn"
              className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 pixel-corners bg-soul-amber text-soul-void font-heading text-xl uppercase tracking-wider shadow-[0_0_20px_rgba(255,209,102,0.5)] hover:shadow-[0_0_40px_rgba(255,209,102,0.9)] transition-all"
            >
              <Play className="w-5 h-5" /> Enter a Body
            </Link>
            <Link
              to="/levels"
              data-testid="menu-levels-btn"
              className="group inline-flex items-center justify-center gap-3 px-8 py-4 pixel-corners border-2 border-soul-ash text-soul-ink font-heading text-xl uppercase tracking-wider hover:border-soul-amber hover:text-soul-amber transition-colors"
            >
              <List className="w-5 h-5" /> Level Select
            </Link>
          </div>

          {/* Global volume adjuster */}
          <div
            className="mt-4 pixel-corners bg-soul-surface/85 border border-soul-ash px-4 py-3 backdrop-blur-md flex items-center gap-3"
            data-testid="menu-volume"
          >
            <button
              onClick={() => setVolume(volume > 0 ? 0 : DEFAULT_VOLUME)}
              className="text-soul-ink hover:text-soul-amber transition-colors"
              aria-label={volume > 0 ? "Mute" : "Unmute"}
              data-testid="menu-volume-toggle"
            >
              {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-40 accent-soul-amber"
              aria-label="Volume"
              data-testid="menu-volume-slider"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-soul-mute w-8 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        <footer className="p-6 md:p-8 flex items-center justify-between">
          <div className="font-mono text-xs text-soul-mute" data-testid="footer-tagline">
            v0.1 · pre-alpha · press ↵ to dream
          </div>
          <Link
            to="/about"
            className="font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-ink inline-flex items-center gap-2"
          >
            <Info className="w-3 h-3" /> How to Play
          </Link>
        </footer>
      </div>
    </div>
  );
}