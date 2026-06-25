let appSoundEnabled = true;

// Pre-initialize soundEnabled state from localStorage on load
try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("examship_settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.soundEnabled === "boolean") {
        appSoundEnabled = parsed.soundEnabled;
      }
    }
  }
} catch (e) {
  console.warn("[Audio Engine] Could not load initial state from localStorage", e);
}

// Convert a Uint8Array buffer into a standard Base64 string safely
function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Generate a valid PCM 8-bit mono WAV File in memory and return as Data URI
function buildWav(sampleRate: number, duration: number, generator: (t: number) => number): string {
  const numSamples = Math.floor(sampleRate * duration);
  const headerByteLength = 44;
  const fileByteLength = headerByteLength + numSamples;
  const buffer = new Uint8Array(fileByteLength);

  // Write "RIFF"
  buffer[0] = 0x52; // R
  buffer[1] = 0x49; // I
  buffer[2] = 0x46; // F
  buffer[3] = 0x46; // F

  // File size - 8
  const size = fileByteLength - 8;
  buffer[4] = size & 0xff;
  buffer[5] = (size >> 8) & 0xff;
  buffer[6] = (size >> 16) & 0xff;
  buffer[7] = (size >> 24) & 0xff;

  // Write "WAVE"
  buffer[8] = 0x57;  // W
  buffer[9] = 0x41;  // A
  buffer[10] = 0x56; // V
  buffer[11] = 0x45; // E

  // Write "fmt "
  buffer[12] = 0x66; // f
  buffer[13] = 0x6d; // m
  buffer[14] = 0x74; // t
  buffer[15] = 0x20; //  

  // Subchunk1Size (16)
  buffer[16] = 16;
  buffer[17] = 0;
  buffer[18] = 0;
  buffer[19] = 0;

  // AudioFormat (1 = PCM)
  buffer[20] = 1;
  buffer[21] = 0;

  // NumChannels (1 = Mono)
  buffer[22] = 1;
  buffer[23] = 0;

  // SampleRate
  buffer[24] = sampleRate & 0xff;
  buffer[25] = (sampleRate >> 8) & 0xff;
  buffer[26] = (sampleRate >> 16) & 0xff;
  buffer[27] = (sampleRate >> 24) & 0xff;

  // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  const byteRate = sampleRate;
  buffer[28] = byteRate & 0xff;
  buffer[29] = (byteRate >> 8) & 0xff;
  buffer[30] = (byteRate >> 16) & 0xff;
  buffer[31] = (byteRate >> 24) & 0xff;

  // BlockAlign (NumChannels * BitsPerSample/8 = 1)
  buffer[32] = 1;
  buffer[33] = 0;

  // BitsPerSample (8-bit)
  buffer[34] = 8;
  buffer[35] = 0;

  // Write "data"
  buffer[36] = 0x64; // d
  buffer[37] = 0x61; // a
  buffer[38] = 0x74; // t
  buffer[39] = 0x61; // a

  // Subchunk2Size (NumSamples)
  buffer[40] = numSamples & 0xff;
  buffer[41] = (numSamples >> 8) & 0xff;
  buffer[42] = (numSamples >> 16) & 0xff;
  buffer[43] = (numSamples >> 24) & 0xff;

  // Write synthesized waveform sample values
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sampleVal = generator(t); // returns value from -1.0 to 1.0
    const byteVal = Math.max(0, Math.min(255, Math.floor((sampleVal + 1.0) * 127.5)));
    buffer[headerByteLength + i] = byteVal;
  }

  return "data:audio/wav;base64," + uint8ToBase64(buffer);
}

const audioCache: Record<string, string> = {};

function getSoundDataUri(
  type:
    | "correct"
    | "wrong"
    | "complete"
    | "tick"
    | "click"
    | "expand"
    | "reset",
): string {
  if (audioCache[type]) return audioCache[type];

  let dataUri = "";
  const sampleRate = 11025;

  if (type === "click") {
    dataUri = buildWav(sampleRate, 0.08, (t) => {
      const decay = Math.exp(-60 * t);
      return Math.sin(2 * Math.PI * 800 * t) * decay * 0.5;
    });
  } else if (type === "tick") {
    dataUri = buildWav(sampleRate, 0.05, (t) => {
      const decay = Math.exp(-120 * t);
      return Math.sin(2 * Math.PI * 1400 * t) * decay * 0.4;
    });
  } else if (type === "correct") {
    dataUri = buildWav(sampleRate, 0.5, (t) => {
      const decay = Math.exp(-8 * t);
      const sound1 = Math.sin(2 * Math.PI * 523.25 * t); // C5
      const sound2 = Math.sin(2 * Math.PI * 659.25 * t) * 0.7; // E5
      const sound3 = Math.sin(2 * Math.PI * 783.99 * t) * 0.5; // G5
      const sound4 = Math.sin(2 * Math.PI * 1046.50 * t) * 0.3; // C6
      return (sound1 + sound2 + sound3 + sound4) * decay * 0.35;
    });
  } else if (type === "wrong") {
    dataUri = buildWav(sampleRate, 0.3, (t) => {
      const decay = Math.exp(-15 * t);
      const sound1 = Math.sin(2 * Math.PI * 135 * t);
      const sound2 = Math.sin(2 * Math.PI * 180 * t) * 0.6;
      return (sound1 + sound2) * decay * 0.5;
    });
  } else if (type === "complete") {
    dataUri = buildWav(sampleRate, 0.8, (t) => {
      let total = 0;
      if (t >= 0) {
        const d = Math.exp(-6 * t);
        total += Math.sin(2 * Math.PI * 523.25 * t) * d * 0.4;
      }
      if (t >= 0.1) {
        const d = Math.exp(-6 * (t - 0.1));
        total += Math.sin(2 * Math.PI * 659.25 * (t - 0.1)) * d * 0.35;
      }
      if (t >= 0.2) {
        const d = Math.exp(-6 * (t - 0.2));
        total += Math.sin(2 * Math.PI * 783.99 * (t - 0.2)) * d * 0.3;
      }
      if (t >= 0.3) {
        const d = Math.exp(-6 * (t - 0.3));
        total += Math.sin(2 * Math.PI * 1046.50 * (t - 0.3)) * d * 0.25;
      }
      return total * 0.6;
    });
  } else if (type === "reset") {
    dataUri = buildWav(sampleRate, 0.25, (t) => {
      let total = 0;
      if (t >= 0) {
        const d = Math.exp(-12 * t);
        total += Math.sin(2 * Math.PI * 720 * t) * d * 0.4;
      }
      if (t >= 0.08) {
        const d = Math.exp(-12 * (t - 0.08));
        total += Math.sin(2 * Math.PI * 540 * (t - 0.08)) * d * 0.35;
      }
      return total;
    });
  } else if (type === "expand") {
    dataUri = buildWav(sampleRate, 0.2, (t) => {
      const decay = Math.exp(-4 * t);
      const freq = 300 + 1250 * t;
      return Math.sin(2 * Math.PI * freq * t) * decay * 0.35;
    });
  }

  audioCache[type] = dataUri;
  return dataUri;
}

export function setSoundEnabled(enabled: boolean) {
  appSoundEnabled = enabled;
  console.log(`[Audio Engine] Sound enabled set to: ${enabled}`);
  if (enabled) {
    unlockAudio();
  }
}

function isSoundEnabled(): boolean {
  return appSoundEnabled;
}

// Warm up / unlock standard HTML5 Audio capability on user gesture
export function unlockAudio() {
  try {
    if (typeof window === "undefined") return;
    const silentUri = buildWav(8000, 0.01, () => 0);
    const audio = new Audio(silentUri);
    audio.volume = 0.01;
    audio.play().catch(() => {});
  } catch (e) {}
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const handler = () => {
    unlockAudio();
  };
  ["click", "touchstart", "mousedown"].forEach((evt) => {
    document.addEventListener(evt, handler, { capture: true, passive: true });
  });
}

// Master sound effect player using standard, fully-supported HTML5 Audio objects
export function playAppSound(
  type:
    | "correct"
    | "wrong"
    | "complete"
    | "tick"
    | "click"
    | "expand"
    | "reset",
) {
  if (!isSoundEnabled()) return;
  try {
    const dataUri = getSoundDataUri(type);
    if (!dataUri) return;
    const audio = new Audio(dataUri);
    audio.volume = 0.5; // clear and noticeable, but pleasant
    audio.play().catch((err) => {
      console.warn("[Audio Engine] Autoplay policy or gesture required to play sound:", err);
    });
  } catch (err) {
    console.error("[Audio Engine] Sound playback failed:", err);
  }
}

// Epic celebration fanfare for level completions or general success milestones
export function playDashboardFanfare() {
  if (!isSoundEnabled()) return;
  try {
    const sampleRate = 11025;
    const dataUri = buildWav(sampleRate, 1.2, (t) => {
      // Fanfare: A4, C#5, E5, A5
      let total = 0;
      if (t >= 0) {
        const d = Math.exp(-4 * t);
        total += Math.sin(2 * Math.PI * 440 * t) * d * 0.35;
      }
      if (t >= 0.08) {
        const d = Math.exp(-4 * (t - 0.08));
        total += Math.sin(2 * Math.PI * 554.37 * (t - 0.08)) * d * 0.32;
      }
      if (t >= 0.16) {
        const d = Math.exp(-4 * (t - 0.16));
        total += Math.sin(2 * Math.PI * 659.25 * (t - 0.16)) * d * 0.28;
      }
      if (t >= 0.24) {
        const d = Math.exp(-3 * (t - 0.24));
        total += Math.sin(2 * Math.PI * 880 * (t - 0.24)) * d * 0.25;
      }
      if (t >= 0.3) {
        const d = Math.exp(-2 * (t - 0.3));
        total += Math.sin(2 * Math.PI * 1108.73 * (t - 0.3)) * d * 0.15;
      }
      return total * 0.75;
    });

    const audio = new Audio(dataUri);
    audio.volume = 0.55;
    audio.play().catch((e) => console.warn("[Audio Engine] Fanfare blocked:", e));
  } catch (err) {
    console.error("[Audio Engine] Fanfare playback failed:", err);
  }
}
