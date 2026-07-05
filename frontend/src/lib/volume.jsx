import { createContext, useContext, useEffect, useState } from "react";

const KEY = "sb_volume";
const DEFAULT_VOLUME = 0.15;

const VolumeContext = createContext({
  volume: DEFAULT_VOLUME,
  setVolume: () => {},
});

export function VolumeProvider({ children }) {
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_VOLUME;
    const v = window.localStorage.getItem(KEY);
    return v !== null ? Number(v) : DEFAULT_VOLUME;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, String(volume));
    }
  }, [volume]);

  return (
    <VolumeContext.Provider value={{ volume, setVolume }}>
      {children}
    </VolumeContext.Provider>
  );
}

export const useVolume = () => useContext(VolumeContext);
export { DEFAULT_VOLUME };