import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { ThemeId } from "../types";
import { Settings, CheckCircle, XCircle, AlertCircle, Type, Volume2, Zap, Play, Clock, RotateCcw, Flame, TrendingUp, Fingerprint } from "lucide-react";
import { APP_THEMES, getTheme } from "../lib/themes";
import { playAppSound } from "../lib/audio";
import { cn } from "../lib/utils";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { apiKey, setApiKey, settings, updateSettings, resetSettings, resetStreak, resetStats, clearAllChaptersAndDocuments } = useAppStore();
  const [tempKey, setTempKey] = useState(apiKey || "");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, msg: string} | null>(null);
  
  const [confirmResetStreak, setConfirmResetStreak] = useState(false);
  const [confirmResetStats, setConfirmResetStats] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Auto-reset confirmation timer after 4 seconds
  useEffect(() => {
    if (confirmResetStreak) {
      const t = setTimeout(() => setConfirmResetStreak(false), 4000);
      return () => clearTimeout(t);
    }
  }, [confirmResetStreak]);

  useEffect(() => {
    if (confirmResetStats) {
      const t = setTimeout(() => setConfirmResetStats(false), 4000);
      return () => clearTimeout(t);
    }
  }, [confirmResetStats]);

  useEffect(() => {
    if (confirmWipe) {
      const t = setTimeout(() => setConfirmWipe(false), 4000);
      return () => clearTimeout(t);
    }
  }, [confirmWipe]);

  const handleTestKey = async () => {
    if (!tempKey.trim()) return;
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/verify-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": tempKey.trim()
        },
        body: JSON.stringify({ apiKey: tempKey.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, msg: data.message || "API Key verified successfully!" });
        setApiKey(tempKey.trim());
      } else {
        setTestResult({ success: false, msg: data.error || "Failed to verify key." });
      }
    } catch (e: any) {
      setTestResult({ success: false, msg: "Network error occurred." });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleClearKey = () => {
    setApiKey(null);
    setTempKey("");
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-left">
      <div className="glass-card relative w-full max-w-lg shadow-2xl p-6 md:p-8 flex flex-col max-h-[90vh] overflow-hidden" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors cursor-pointer"
        >
          <XCircle className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 shrink-0 mt-1">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
            <Settings className="w-5 h-5 animate-spin-slow text-brand-500" />
          </div>
          <h2 className="text-xl font-bold font-display text-zinc-900 dark:text-white">Elite Quiz Settings</h2>
        </div>

        {/* Custom Settings Container - Scrollable! */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6">

          {/* SECTION 1: Quiz Execution Preferences */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Quiz Customization</h3>
            
            {/* Font Size Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
                  <Type className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Q&A Font Size</h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">For question statements & answers</p>
                </div>
              </div>
              <div className="flex bg-black/[0.04] dark:bg-white/[0.04] p-1 rounded-xl border border-black/5 dark:border-white/5 shrink-0 self-end sm:self-auto">
                {(["medium", "large", "xl"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      playAppSound("click");
                      updateSettings({ fontSize: size });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                      settings.fontSize === size
                        ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Sound On/Off Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Sound Effects</h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Enable chime and warning audio clips</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  const mode = !settings.soundEnabled;
                  updateSettings({ soundEnabled: mode });
                  if (mode) {
                    setTimeout(() => {
                      playAppSound("correct");
                    }, 60);
                  }
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none shrink-0 border border-black/5 dark:border-white/5 ${settings.soundEnabled ? 'bg-brand-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${settings.soundEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Vibration On/Off Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Incorrect Vibration</h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Vibrate screen on incorrect answer choices</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  playAppSound("click");
                  updateSettings({ vibrationEnabled: !settings.vibrationEnabled });
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none shrink-0 border border-black/5 dark:border-white/5 ${settings.vibrationEnabled ? 'bg-brand-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${settings.vibrationEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Auto next on select Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-400/10 flex items-center justify-center text-purple-500 dark:text-purple-400 shrink-0">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Auto-Next Faceout</h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Automatically advance after choosing an answer</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  playAppSound("click");
                  updateSettings({ autoNextOnAnswer: !settings.autoNextOnAnswer });
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none shrink-0 border border-black/5 dark:border-white/5 ${settings.autoNextOnAnswer ? 'bg-brand-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${settings.autoNextOnAnswer ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Auto advance on timer completion */}
            <div className="flex items-center justify-between p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 dark:bg-pink-400/10 flex items-center justify-center text-pink-500 dark:text-pink-400 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Auto-Next on Timeout</h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Automatically advance when the timer hits zero</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  playAppSound("click");
                  updateSettings({ autoAdvanceOnTimeout: !settings.autoAdvanceOnTimeout });
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none shrink-0 border border-black/5 dark:border-white/5 ${settings.autoAdvanceOnTimeout ? 'bg-brand-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${settings.autoAdvanceOnTimeout ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* SECTION: App Theme & Colors */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">App Theme & Visual Colors</h3>
            
            <div className="p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 shadow-sm space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="theme-select" className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1">
                  Choose Visual Aura
                </label>
                <div className="relative">
                  <select
                    id="theme-select"
                    value={settings.themeId}
                    onChange={(e) => updateSettings({ themeId: e.target.value as ThemeId })}
                    className="w-full bg-slate-50 dark:bg-zinc-950 border border-black/10 dark:border-white/10 rounded-xl pl-4 pr-10 py-3 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-sans text-xs cursor-pointer appearance-none shadow-sm"
                  >
                    <optgroup label="☀️ Day Themes (Light Mode)" className="bg-white dark:bg-[#111827] text-zinc-800 dark:text-zinc-200">
                      {APP_THEMES.filter(t => t.mode === "day").map((theme) => (
                        <option key={theme.id} value={theme.id} className="py-2">
                          {theme.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🌙 Night Themes (Dark Mode)" className="bg-white dark:bg-[#111827] text-zinc-800 dark:text-zinc-200">
                      {APP_THEMES.filter(t => t.mode === "night").map((theme) => (
                        <option key={theme.id} value={theme.id} className="py-2">
                          {theme.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-400 dark:text-zinc-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Selected Theme Details & Color Swatches */}
              {(() => {
                const currentTheme = getTheme(settings.themeId);
                return (
                  <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-500 dark:text-brand-400 flex items-center gap-1">
                          {currentTheme.mode === "day" ? "☀️ Day Aura" : "🌙 Night Aura"}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        {currentTheme.description}
                      </p>
                    </div>
                    {/* Dynamic Quick Preview Swatches */}
                    <div className="flex items-center gap-1.5 shrink-0 bg-black/5 dark:bg-black/40 p-2 rounded-lg border border-black/5 dark:border-white/5 shadow-inner">
                      <span className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/10 shrink-0" style={{ backgroundColor: currentTheme.colors.background }} title="Background Accent" />
                      <span className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/10 shrink-0" style={{ backgroundColor: currentTheme.colors.surface }} title="Surface Color" />
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: currentTheme.colors.brand500 }} title="Action Color" />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* SECTION 2: API Keys */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Gemini API Key</h3>
            
            <div className="p-4 bg-white/[0.02] dark:bg-black/20 rounded-2xl border border-white/5 shadow-sm space-y-4">
              <p className="text-[11.5px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Enter your personal <strong className="text-zinc-800 dark:text-zinc-200">Gemini API Key</strong> to bypass daily quota limits and generate custom questions uninterrupted. Your key is stored securely in your browser's local database.
              </p>
              
              <div className="space-y-2">
                <input 
                  type="password" 
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-50 dark:bg-[#111827]/80 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono text-xs shadow-inner"
                />
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 max-h-40 overflow-y-auto break-words ${testResult.success ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20' : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'}`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="leading-relaxed font-semibold break-words w-full text-[11px]">{testResult.msg}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  onClick={handleTestKey}
                  disabled={isTestingKey || !tempKey.trim()}
                  className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-black font-bold py-2.5 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
                >
                  {isTestingKey ? "Testing..." : "Verify & Save"}
                </button>
                {apiKey && (
                  <button 
                    onClick={handleClearKey}
                    className="px-3 py-2.5 bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20 font-bold text-xs rounded-xl transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: System Reset & Data Management */}
          <div className="pt-2 shrink-0 space-y-2.5">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider text-left">Data & System Management</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Reset Streak Button */}
              <button
                onClick={async () => {
                  playAppSound("click");
                  if (confirmResetStreak) {
                    await resetStreak();
                    setConfirmResetStreak(false);
                    playAppSound("reset");
                  } else {
                    setConfirmResetStreak(true);
                  }
                }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-semibold transition-all duration-300 border",
                  confirmResetStreak
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 animate-pulse"
                    : "bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white border-transparent dark:border-white/5"
                )}
              >
                <Flame className={cn("w-3.5 h-3.5", confirmResetStreak ? "fill-amber-500 animate-bounce" : "")} />
                <span>{confirmResetStreak ? "Confirm Reset Streak?" : "Reset Study Streak"}</span>
              </button>

              {/* Reset Stats / Insights Button */}
              <button
                onClick={async () => {
                  playAppSound("click");
                  if (confirmResetStats) {
                    await resetStats();
                    setConfirmResetStats(false);
                    playAppSound("reset");
                  } else {
                    setConfirmResetStats(true);
                  }
                }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-semibold transition-all duration-300 border",
                  confirmResetStats
                    ? "bg-red-500/10 border-red-500/40 text-red-600 dark:text-red-400 animate-pulse"
                    : "bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white border-transparent dark:border-white/5"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{confirmResetStats ? "Confirm Clear All Stats?" : "Reset Performance Stats"}</span>
              </button>
            </div>

            {/* Clear All Chapters & Documents (Factory Reset) */}
            <button
              onClick={async () => {
                playAppSound("click");
                if (confirmWipe) {
                  await clearAllChaptersAndDocuments();
                  setConfirmWipe(false);
                  playAppSound("reset");
                } else {
                  setConfirmWipe(true);
                }
              }}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold transition-all duration-300 border shadow-sm",
                confirmWipe
                  ? "bg-red-600 text-white border-red-500 animate-pulse font-extrabold"
                  : "bg-red-500/10 dark:bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white hover:border-red-600"
              )}
            >
              <XCircle className="w-4 h-4" />
              <span>{confirmWipe ? "⚠️ CONFIRM: PERMANENTLY ERASE ALL CHAPTERS & SYLLABUSES?" : "Permanently Wipe All Chapters & PDFs"}</span>
            </button>

            <button 
              onClick={() => {
                resetSettings();
                playAppSound("click");
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white border border-transparent dark:border-white/5 dark:hover:border-white/10 rounded-2xl text-xs font-semibold transition-all active-glow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Settings to Defaults
            </button>
          </div>

        </div>
        
      </div>
    </div>
  );
}
