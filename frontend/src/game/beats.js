export async function analyzeKickDrums(url, { sensitivity = 1.4, minGapMs = 180 } = {}) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const arrayBuf = await res.arrayBuffer();
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return [];
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuf = await tmp.decodeAudioData(arrayBuf.slice(0));
    tmp.close();
    const offline = new AC(1, audioBuf.length, audioBuf.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = audioBuf;
    const lp = offline.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 150; lp.Q.value = 1;
    src.connect(lp).connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);
    const sr = rendered.sampleRate;
    const winSize = Math.floor(sr * 0.02);
    const energies = [];
    for (let i = 0; i < data.length; i += winSize) {
      let sum = 0;
      const end = Math.min(i + winSize, data.length);
      for (let j = i; j < end; j++) sum += data[j] * data[j];
      energies.push(sum / (end - i));
    }
    const beats = [];
    const historySize = 43;
    let lastBeatIdx = -Infinity;
    const minGapWindows = Math.floor(minGapMs / 20);
    for (let i = historySize; i < energies.length; i++) {
      let mean = 0;
      for (let k = i - historySize; k < i; k++) mean += energies[k];
      mean /= historySize;
      if (energies[i] > mean * sensitivity && energies[i] > 0.0008 && i - lastBeatIdx >= minGapWindows) {
        beats.push((i * winSize) / sr);
        lastBeatIdx = i;
      }
    }
    return beats;
  } catch (e) { console.warn("analyzeKickDrums failed:", e); return []; }
}