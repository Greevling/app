import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, UploadCloud, Trash2, Play } from "lucide-react";
import { fetchLevels, uploadSong, deleteSong } from "@/lib/api";

const formatDur = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

// Determine audio duration client-side
function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration); };
    a.onerror = () => { URL.revokeObjectURL(url); reject(new Error("audio-error")); };
  });
}

export default function Upload() {
  const [levels, setLevels] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const audioRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null);

  const load = () => fetchLevels().then(setLevels);
  useEffect(() => { load(); }, []);

  const handleFile = async (levelId, file) => {
    if (!file) return;
    setBusyId(levelId);
    try {
      const dur = await getAudioDuration(file);
      await uploadSong({ levelId, durationSeconds: dur, file });
      toast.success(`Song bound to level (${formatDur(dur)})`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (levelId) => {
    setBusyId(levelId);
    try { await deleteSong(levelId); toast.success("Song removed"); await load(); }
    catch { toast.error("Failed to remove"); }
    finally { setBusyId(null); }
  };

  const handlePlay = (lvl) => {
    if (!lvl.song) return;
    const url = `${process.env.REACT_APP_BACKEND_URL}${lvl.song.url}`;
    if (!audioRef.current) return;
    if (nowPlaying === lvl.id) {
      audioRef.current.pause(); setNowPlaying(null); return;
    }
    audioRef.current.src = url;
    audioRef.current.play().then(() => setNowPlaying(lvl.id)).catch(() => {});
  };

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 grid-bg opacity-20" aria-hidden />
      <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-12">
        <Link to="/" data-testid="upload-back-btn" className="inline-flex items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-amber transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <header className="mb-10 animate-fadeInUp">
          <div className="font-body text-[11px] uppercase tracking-[0.4em] text-soul-mute mb-3">Control Room · Audio Binding</div>
          <h1 className="font-heading text-5xl md:text-6xl uppercase tracking-tight soul-glow" data-testid="upload-title">Bind Songs to Bodies</h1>
          <p className="mt-4 font-body text-soul-mute max-w-2xl">
            Each level&apos;s runtime becomes the length of the song you upload. Use .mp3, .wav, .ogg or .m4a.
          </p>
        </header>

        <div className="grid gap-4" data-testid="upload-list">
          {levels.map((lvl) => (
            <div key={lvl.id} className="border border-soul-ash pixel-corners bg-soul-surface/70 backdrop-blur-md p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4" data-testid={`upload-row-${lvl.id}`}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 border border-soul-ash flex items-center justify-center bg-soul-void">
                  <div className="w-6 h-6 rounded-full animate-flicker" style={{ background: `radial-gradient(circle, ${lvl.palette.accent}, transparent)`, boxShadow: `0 0 12px ${lvl.palette.accent}` }} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-soul-mute">BODY #{lvl.index.toString().padStart(2, "0")}</div>
                  <div className="font-heading text-2xl text-soul-ink truncate">{lvl.name} · <span className="text-soul-mute text-base">{lvl.role}</span></div>
                  <div className="font-body text-xs text-soul-mute mt-0.5 truncate">
                    {lvl.song ? (
                      <>Bound: <span className="text-soul-ink">{lvl.song.original_name}</span> · {formatDur(lvl.song.duration_seconds)}</>
                    ) : (
                      <>No song bound · default timer {formatDur(lvl.default_song_seconds)}</>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lvl.song && (
                  <button
                    onClick={() => handlePlay(lvl)}
                    data-testid={`upload-preview-${lvl.id}`}
                    className="pixel-corners border border-soul-ash px-3 py-2 text-soul-ink hover:border-soul-amber hover:text-soul-amber inline-flex items-center gap-2 font-body text-xs uppercase tracking-[0.2em]"
                  >
                    <Play className="w-3.5 h-3.5" /> {nowPlaying === lvl.id ? "Stop" : "Preview"}
                  </button>
                )}
                {lvl.song && (
                  <button
                    onClick={() => handleDelete(lvl.id)}
                    disabled={busyId === lvl.id}
                    data-testid={`upload-delete-${lvl.id}`}
                    className="pixel-corners border border-soul-ash px-3 py-2 text-soul-mute hover:border-soul-rose hover:text-soul-rose inline-flex items-center gap-2 font-body text-xs uppercase tracking-[0.2em]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
                <label
                  className={`pixel-corners bg-soul-amber text-soul-void px-4 py-2 font-heading uppercase text-sm tracking-wider inline-flex items-center gap-2 cursor-pointer hover:bg-white transition-colors ${busyId === lvl.id ? "opacity-60 pointer-events-none" : ""}`}
                  data-testid={`upload-btn-${lvl.id}`}
                >
                  <UploadCloud className="w-4 h-4" /> {lvl.song ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"
                    className="hidden"
                    onChange={(e) => handleFile(lvl.id, e.target.files?.[0])}
                    data-testid={`upload-input-${lvl.id}`}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <audio ref={audioRef} onEnded={() => setNowPlaying(null)} className="hidden" />
      </div>
    </div>
  );
}
