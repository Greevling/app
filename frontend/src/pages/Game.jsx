import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, ArrowRight, Home } from "lucide-react";
import HUD from "@/components/HUD";
import { createGame } from "@/game/engine";
import { fetchLevel, postScore, API } from "@/lib/api";
import { analyzeKickDrums } from "@/game/beats";
import { useVolume } from "@/lib/volume";

export default function Game() {
  
  const { levelId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const audioRef = useRef(null);

  const [level, setLevel] = useState(null);
  const [hud, setHud] = useState({ elapsed: 0, collected: 0, total: 0, soulHealth: 3, status: "loading" });
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [showIntro, setShowIntro] = useState(true);
  const [beatTimes, setBeatTimes] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { volume, setVolume } = useVolume();

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const duration = level?.song?.duration_seconds || level?.default_song_seconds || 90;

  // Load level metadata + analyze audio for kick beats
  useEffect(() => {
    let cancelled = false;
    fetchLevel(levelId)
      .then(async (d) => {
        if (cancelled) return;
        setLevel(d);
        if (d.song?.url) {
          setAnalyzing(true);
          const url = `${process.env.REACT_APP_BACKEND_URL}${d.song.url}`;
          const beats = await analyzeKickDrums(url);
          if (!cancelled) { setBeatTimes(beats); setAnalyzing(false); }
        }
      })
      .catch(() => toast.error("Level not found"));
    return () => { cancelled = true; };
  }, [levelId]);

  // Start engine after intro dismissed
  useEffect(() => {
    if (!level || showIntro) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 960;
    canvas.height = 400;

    const engine = createGame({
      canvas,
      level,
      duration,
      beatTimes: beatTimes || undefined,
      onStateChange: (status) => {
        setHud((h) => ({ ...h, status }));
        if (status === "playing" && audioRef.current && level.song?.url) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      },
      onCollect: () => {},
      onFinish: async ({ elapsed, collected, total, success, reachedFinish }) => {
        if (audioRef.current) audioRef.current.pause();
        setResult({ elapsed, collected, total, success, reachedFinish });
        try {
          await postScore({
            level_id: level.id,
            player_name: "Wanderer",
            completion_time_seconds: elapsed,
            song_duration_seconds: duration,
            items_collected: collected,
            completed: success,
          });
        } catch (e) { /* ignore */ }
      },
      onDeath: ({ elapsed, collected, total }) => {
        if (audioRef.current) audioRef.current.pause();
        setResult({ elapsed, collected, total, success: false, death: true });
      },
    });
    engineRef.current = engine;
    if (!engine) return () => {};

    const tick = setInterval(() => setHud((h) => ({ ...h, ...engine.getState() })), 100);

    const escHandler = (e) => {
      if (e.key === "Escape") togglePause();
    };
    window.addEventListener("keydown", escHandler);

    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", escHandler);
      engine?.destroy?.();
    };
  }, [level, showIntro, duration]);

  const togglePause = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    setPaused((p) => {
      const next = !p;
      if (next) { e.pause(); audioRef.current?.pause(); }
      else { e.resume(); if (audioRef.current && !result) audioRef.current.play().catch(() => {}); }
      return next;
    });
  }, [result]);

  const restart = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setResult(null);
    setPaused(false);
    setShowIntro(true);
  };

  if (!level) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-soul-mute" data-testid="game-loading">Awakening…</div>
      </div>
    );
  }

  const songUrl = level.song?.url ? `${process.env.REACT_APP_BACKEND_URL}${level.song.url}` : null;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      {/* Ambient background gradient tied to level palette */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, ${level.palette.sky} 0%, #050508 70%)`,
        }}
        aria-hidden
      />

      {/* Top navigation strip */}
      <div className="relative z-20 w-full max-w-5xl flex items-center justify-between mb-4">
        <Link to="/levels" data-testid="game-back-btn" className="font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-amber inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Level Select
        </Link>
        <div className="font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute">
          BODY #{level.index.toString().padStart(2, "0")} · {level.name}
        </div>
      </div>

      {/* Canvas frame */}
      <div className="relative z-10 w-full max-w-5xl">
        <div className="relative canvas-frame pixel-corners overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block w-full h-auto bg-soul-void"
            style={{ imageRendering: "pixelated", aspectRatio: "960 / 400" }}
            data-testid="game-canvas"
          />
          {!showIntro && (
            <HUD
              level={level}
              elapsed={hud.elapsed}
              duration={duration}
              collected={hud.collected}
              totalCollectibles={hud.total}
              soulHealth={hud.soulHealth}
              onPause={togglePause}
              status={hud.status}
              volume={volume}
              onVolumeChange={setVolume}
            />
          )}
        </div>
      </div>

      {songUrl && <audio ref={audioRef} src={songUrl} preload="auto" />}

      {/* Story intro overlay */}
      {showIntro && (
        <div className="fixed inset-0 z-40 bg-soul-void/95 backdrop-blur-md flex items-center justify-center p-6" data-testid="story-intro">
          <div className="max-w-2xl text-center animate-fadeInUp">
            <div className="font-body text-[11px] uppercase tracking-[0.4em] text-soul-mute mb-3">
              Chapter · Body #{level.index.toString().padStart(2, "0")}
            </div>
            <h2 className="font-heading text-4xl md:text-5xl uppercase tracking-tight text-soul-ink mb-2">
              {level.name}
            </h2>
            <div className="font-body text-sm uppercase tracking-[0.25em] mb-8" style={{ color: level.palette.accent }}>
              {level.role} · {level.life_theme}
            </div>
            <p className="font-body text-lg leading-relaxed text-soul-ink/90 mb-10">
              {level.story_intro}
            </p>
            {analyzing && (
              <div className="mb-4 inline-block px-4 py-2 border border-soul-amber/40 text-soul-amber font-mono text-xs" data-testid="analyzing-song">
                Analyzing kick drums…
              </div>
            )}
            {!level.song && (
              <div className="mb-6 inline-block px-4 py-2 border border-soul-ash text-soul-mute text-xs font-mono">
                No song uploaded. Using a {Math.round(duration)}s placeholder timer.
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate("/levels")}
                data-testid="story-back-btn"
                className="px-8 py-4 pixel-corners border-2 border-soul-ash text-soul-ink font-heading text-lg uppercase tracking-wider hover:border-soul-rose hover:text-soul-rose transition-colors inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Bodies
              </button>
              <button
                onClick={() => setShowIntro(false)}
                data-testid="story-begin-btn"
                className="px-10 py-4 pixel-corners bg-soul-amber text-soul-void font-heading text-xl uppercase tracking-wider shadow-[0_0_20px_rgba(255,209,102,0.5)] hover:shadow-[0_0_40px_rgba(255,209,102,0.9)] transition-all"
              >
                Possess {level.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause overlay */}
      {paused && !result && (
        <div className="fixed inset-0 z-40 bg-soul-void/85 backdrop-blur-xl flex items-center justify-center p-6" data-testid="pause-overlay">
          <div className="max-w-md w-full text-center flex flex-col gap-4 animate-fadeInUp">
            <h2 className="font-heading text-5xl uppercase text-soul-amber soul-glow mb-4">Paused</h2>
            <button onClick={togglePause} data-testid="resume-btn" className="pixel-corners bg-soul-amber text-soul-void font-heading text-xl uppercase tracking-wider py-4 hover:bg-white transition-colors">
              Resume
            </button>
            <button onClick={restart} data-testid="restart-btn" className="pixel-corners border-2 border-soul-ash text-soul-ink font-heading text-xl uppercase tracking-wider py-4 hover:border-soul-amber hover:text-soul-amber transition-colors inline-flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> Restart Level
            </button>
            <button onClick={() => navigate("/levels")} data-testid="quit-btn" className="pixel-corners border-2 border-soul-ash text-soul-mute font-heading text-lg uppercase tracking-wider py-3 hover:border-soul-rose hover:text-soul-rose transition-colors inline-flex items-center justify-center gap-2">
              <Home className="w-4 h-4" /> Abandon Body
            </button>
          </div>
        </div>
      )}

      {/* Result overlay */}
      {result && (
        <div className="fixed inset-0 z-40 bg-soul-void/95 backdrop-blur-xl flex items-center justify-center p-6" data-testid="result-overlay">
          <div className="max-w-xl w-full text-center animate-fadeInUp">
            <div className="font-body text-[11px] uppercase tracking-[0.4em] text-soul-mute mb-3">
              {result.success
                ? "Mission Complete"
                : result.death
                  ? "The Soul Faltered"
                  : result.reachedFinish
                    ? `${level.name}'s Needs Went Unmet`
                    : "The Song Ended First"}
            </div>
            <h2 className={`font-heading text-5xl md:text-6xl uppercase tracking-tight mb-6 ${result.success ? "text-soul-amber soul-glow" : "text-soul-rose soul-glow-rose"}`}>
              {result.success ? "Released" : "Bound"}
            </h2>
            {result.success && (
              <p className="font-body text-lg leading-relaxed text-soul-ink/90 mb-8 italic">
                {level.story_outro}
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="p-4 border border-soul-ash pixel-corners bg-soul-surface/80">
                <div className="font-body text-[10px] uppercase tracking-[0.25em] text-soul-mute">Time</div>
                <div className="font-heading text-2xl text-soul-ink mt-1">
                  {result.elapsed.toFixed(1)}s <span className="text-soul-mute text-base">/ {duration}s</span>
                </div>
              </div>
              <div className="p-4 border border-soul-ash pixel-corners bg-soul-surface/80">
                <div className="font-body text-[10px] uppercase tracking-[0.25em] text-soul-mute">
                  {level.collect_label}
                </div>
                <div className="font-heading text-2xl text-soul-ink mt-1">
                  {result.collected} <span className="text-soul-mute text-base">/ {result.total}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={restart} data-testid="result-restart-btn" className="pixel-corners border-2 border-soul-ash text-soul-ink font-heading text-lg uppercase tracking-wider px-6 py-3 hover:border-soul-amber hover:text-soul-amber transition-colors inline-flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> Retry
              </button>
              <button onClick={() => navigate("/levels")} data-testid="result-next-btn" className="pixel-corners bg-soul-amber text-soul-void font-heading text-lg uppercase tracking-wider px-6 py-3 hover:bg-white transition-colors inline-flex items-center justify-center gap-2">
                Choose Next Body <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
