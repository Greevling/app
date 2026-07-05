import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Music, Clock, Trophy, Play, Check, Circle, RotateCcw } from "lucide-react";
import { fetchLevels } from "@/lib/api";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const formatDur = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export default function LevelSelect() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLevels().then((d) => { setLevels(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 grid-bg opacity-30" aria-hidden />
      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-12">
        <div className="flex items-center justify-between mb-10 animate-fadeInUp">
          <Link to="/" className="inline-flex items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-amber transition-colors" data-testid="back-menu-btn">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <button
            onClick={async () => {
              const ok = window.confirm(
                "Reset all progress?\n\nThis will remove every completion badge and best time across all five bodies. It cannot be undone."
              );
              if (!ok) return;
              try {
                const res = await fetch(`${API}/api/scores`, { method: "DELETE" });
                if (!res.ok) throw new Error("Reset failed");
                const data = await res.json();
                toast.success(`Progress reset (${data.deleted} scores wiped)`);
                // Re-fetch levels so checkmarks disappear immediately.
                const fresh = await fetchLevels();
                setLevels(fresh);
              } catch (e) {
                toast.error("Could not reset progress");
              }
            }}
            data-testid="reset-progress-btn"
            className="inline-flex items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-rose transition-colors border border-soul-ash hover:border-soul-rose px-3 py-2 pixel-corners"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Progress
          </button>
        </div>

        <header className="mb-12 animate-fadeInUp">
          <div className="font-body text-[11px] uppercase tracking-[0.4em] text-soul-mute mb-3">Chapter I · Five Bodies</div>
          <h1 className="font-heading text-5xl md:text-6xl uppercase tracking-tight soul-glow" data-testid="level-select-title">Select a Soul</h1>
          <p className="mt-4 font-body text-soul-mute max-w-2xl">
            Choose a body to inhabit. Each has one unfinished mission. You have exactly one song to help them complete it.
          </p>
        </header>

        {loading ? (
          <div className="font-mono text-soul-mute">Loading levels…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6" data-testid="levels-grid">
            {levels.map((lvl, i) => {
              const isHero = false;
              return (
                <Link
                  key={lvl.id}
                  to={`/play/${lvl.id}`}
                  data-testid={`level-card-${lvl.id}`}
                  className={`group relative flex flex-col p-6 lg:p-8 border backdrop-blur-md transition-all duration-500 hover:-translate-y-1 overflow-hidden cursor-pointer pixel-corners md:col-span-4 min-h-[260px] ${
                    lvl.best_score
                      ? "border-emerald-400/50 hover:border-emerald-300 bg-soul-surface/80"
                      : "border-soul-ash hover:border-soul-amber bg-soul-surface/80"
                  }`}
                  style={{
                    backgroundColor: "#10121C",
                    backgroundImage: `linear-gradient(135deg, ${lvl.palette.accent}33 0%, rgba(16,18,28,0) 55%)`,
                    ...(lvl.best_score && {
                      boxShadow: "inset 0 0 40px rgba(52,211,153,0.12)",
                    }),
                  }}
                >
                  {/* Soul aura */}
                  <div
                    className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-40 group-hover:opacity-70 transition-opacity animate-flicker"
                    style={{
                      background: `radial-gradient(circle, ${lvl.palette.accent}55, transparent 70%)`,
                    }}
                  />

                  <div className="relative z-10 flex-1 flex flex-col justify-between gap-6">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2" data-testid={`level-status-${lvl.id}`}>
                        <div className="font-mono text-xs text-soul-mute">BODY #{lvl.index.toString().padStart(2, "0")}</div>
                        {lvl.best_score ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-400/70 bg-emerald-500/15 text-emerald-300 font-mono text-[10px] uppercase tracking-[0.2em]"
                            style={{ boxShadow: "0 0 10px rgba(52,211,153,0.35)" }}
                            data-testid={`level-completed-${lvl.id}`}
                          >
                            <Check className="w-3 h-3" /> Completed
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 border border-soul-ash/60 text-soul-mute font-mono text-[10px] uppercase tracking-[0.2em]"
                            data-testid={`level-pending-${lvl.id}`}
                          >
                            <Circle className="w-2.5 h-2.5" /> Not yet
                          </span>
                        )}
                      </div>
                      <div className={`font-heading uppercase tracking-tight ${isHero ? "text-5xl md:text-6xl" : "text-3xl"} text-soul-ink`}>
                        {lvl.name}
                      </div>
                      <div className="font-body text-sm uppercase tracking-[0.2em] mt-1" style={{ color: lvl.palette.accent }}>
                        {lvl.role}
                      </div>
                      {isHero && (
                        <p className="mt-4 font-body text-soul-mute max-w-md leading-relaxed">
                          {lvl.story_intro}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="font-body text-[11px] uppercase tracking-[0.25em] text-soul-mute mb-3">
                        {lvl.life_theme}
                      </div>
                      <div className="flex flex-wrap gap-4 font-mono text-xs text-soul-ink">
                        <span className="inline-flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-soul-mute" />
                          {lvl.song ? lvl.song.original_name.slice(0, 22) : "no song yet"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-soul-mute" />
                          {formatDur(lvl.song?.duration_seconds || lvl.default_song_seconds)}
                        </span>
                        {lvl.best_score && (
                          <span className="inline-flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-soul-amber" />
                            {formatDur(lvl.best_score.completion_time_seconds)}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 inline-flex items-center gap-2 font-heading uppercase tracking-wider text-soul-amber group-hover:translate-x-1 transition-transform">
                        <Play className="w-4 h-4" /> Possess
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
