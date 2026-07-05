import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useVolume } from "@/lib/volume";

// Global title-screen theme. Mounted once inside <App /> so it survives route
// changes across menu / level-select / about. Pauses on /play/:levelId (the
// body's own song takes over) and restarts from the beginning whenever the
// player returns to a menu route from a game.
export default function MenuMusic() {
  const audioRef = useRef(null);
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const { volume } = useVolume();

  // Keep volume in sync.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Autoplay + browser-autoplay-unlock (first click/keypress).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.loop = true;
    let unlocked = false;
    const tryPlay = () => {
      if (audio.paused && !location.pathname.startsWith("/play/")) {
        audio.play().catch(() => {});
      }
    };
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      tryPlay();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    tryPlay();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle route transitions:
  //  - Entering a game route  -> pause the menu theme (body's song will play).
  //  - Leaving a game route   -> restart from 0 and play.
  //  - Menu <-> menu route    -> keep playing uninterrupted.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const prevPath = prevPathRef.current;
    const curPath = location.pathname;
    const wasInGame = prevPath.startsWith("/play/");
    const isInGame = curPath.startsWith("/play/");

    if (isInGame) {
      audio.pause();
    } else if (wasInGame) {
      // Coming back out of a level — restart the menu theme fresh.
      try { audio.currentTime = 0; } catch (_) { /* ignore */ }
      audio.play().catch(() => {});
    } else {
      // Menu-route → menu-route: just make sure it's playing.
      audio.play().catch(() => {});
    }

    prevPathRef.current = curPath;
  }, [location.pathname]);

  return <audio ref={audioRef} src="/audio/menu-theme.mp3" preload="auto" loop />;
}