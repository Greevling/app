import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const rows = [
  { keys: "← / →", text: "Nudge speed. You always drift right." },
  { keys: "SPACE / ↑", text: "Jump over pits and spikes. Tap to begin." },
  { keys: "ESC", text: "Pause. Reflect. Continue." },
];

export default function About() {
  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 grid-bg opacity-20" aria-hidden />
      <div className="relative z-10 max-w-3xl mx-auto p-6 md:p-12">
        <Link to="/" data-testid="about-back-btn" className="inline-flex items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-soul-mute hover:text-soul-amber transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <h1 className="font-heading text-5xl uppercase soul-glow mb-4">The Soul & The Song</h1>
        <p className="font-body text-lg text-soul-mute leading-relaxed mb-8">
          You are a wandering soul. You slip inside people at the pivotal moment of their lives —
          the moment they need help finishing something. Each mission plays out over exactly one
          song. When the last note fades, so does the chance.
        </p>

        <div className="border border-soul-ash pixel-corners p-6 mb-10 bg-soul-surface/70 backdrop-blur">
          <div className="font-body text-[11px] uppercase tracking-[0.3em] text-soul-amber mb-4">Controls</div>
          <div className="grid gap-3">
            {rows.map((r) => (
              <div key={r.keys} className="flex items-center gap-4">
                <div className="font-heading text-lg text-soul-ink min-w-[120px]">{r.keys}</div>
                <div className="font-body text-soul-mute">{r.text}</div>
              </div>
            ))}
          </div>
        </div>

        <h2 className="font-heading text-3xl uppercase text-soul-ink mb-4">Your Own Soundtrack</h2>
         <p className="font-body text-soul-mute leading-relaxed mb-6">
          Each level runs for exactly the length of its song. When the last note fades, the mission is over — for better or worse.
        </p>
      </div>
    </div>
  );
}
