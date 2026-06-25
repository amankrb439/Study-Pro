import { useAppStore } from "../store";
import { playAppSound, playDashboardFanfare } from "../lib/audio";

export function useAudio() {
  const { settings, updateSettings } = useAppStore();
  const soundEnabled = settings.soundEnabled;

  const playSound = (
    type:
      | "correct"
      | "wrong"
      | "complete"
      | "tick"
      | "click"
      | "expand"
      | "reset",
  ) => {
    if (soundEnabled) {
      playAppSound(type);
    }
  };

  // Specific success 'dings' and fanfares
  const playSuccessDing = () => {
    playSound("correct");
  };

  const playChapterComplete = () => {
    playSound("complete");
  };

  const playTriviaComplete = () => {
    if (soundEnabled) {
      playDashboardFanfare();
    }
  };

  const toggleSound = () => {
    updateSettings({ soundEnabled: !soundEnabled });
  };

  return {
    soundEnabled,
    playSound,
    playSuccessDing,
    playChapterComplete,
    playTriviaComplete,
    toggleSound,
  };
}
