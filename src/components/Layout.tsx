import { ReactNode, useState, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { ThemeId } from "../types";
import { Trophy, Flame, ChevronLeft, ChevronRight, Settings, Key, CheckCircle, XCircle, AlertCircle, Type, Volume2, Zap, Play, Clock, RotateCcw, Fingerprint, Sparkles, Compass, Loader2 } from "lucide-react";
import { APP_THEMES, getTheme, applyThemeVariables } from "../lib/themes";
import { playAppSound } from "../lib/audio";

import { SettingsModal } from "./SettingsModal";

export function Layout({ children }: { children: ReactNode }) {
  const { 
    apiKey, 
    setApiKey, 
    userStats, 
    activeSubject, 
    activeDocument, 
    activeChapter, 
    activeQuiz,
    setActiveSubject, 
    setActiveDocument, 
    setActiveChapter, 
    setActiveQuiz,
    settings, 
    updateSettings, 
    resetSettings,
    isUploading,
    uploadError,
    uploadSuccess
  } = useAppStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, msg: string} | null>(null);

  // Synchronize dynamic theme CSS custom properties on mount and settings updates
  useEffect(() => {
    if (settings?.themeId) {
      const activeTheme = getTheme(settings.themeId);
      applyThemeVariables(activeTheme);
    }
  }, [settings?.themeId]);

  // Forward Navigation History Stack
  const [forwardStack, setForwardStack] = useState<any[]>([]);
  const [prevSubject, setPrevSubject] = useState<any>(null);
  const [prevDocument, setPrevDocument] = useState<any>(null);
  const [prevChapter, setPrevChapter] = useState<any>(null);
  const [prevQuiz, setPrevQuiz] = useState<any>(null);

  const isDeepView = !!activeSubject || !!activeQuiz;
  const isNavigatingFromHistory = useRef(false);

  // 1. Hardware Back Button & Native System Gesture Support (History API Sync)
  // This ensures that Android's physical back button or iOS's native edge-swipe
  // perfectly syncs with our internal view state.
  useEffect(() => {
    const currentDepth = (activeSubject ? 1 : 0) + (activeDocument ? 1 : 0) + (activeChapter ? 1 : 0) + (activeQuiz ? 1 : 0);
    
    if (isNavigatingFromHistory.current) {
      // If the navigation was triggered by browser history (popstate), do not push a new state.
      // However, we reset the flag so subsequent manual clicks push state.
      isNavigatingFromHistory.current = false;
    } else if (currentDepth > 0) {
      window.history.pushState({ depth: currentDepth }, "");
    }
  }, [activeSubject, activeDocument, activeChapter, activeQuiz]);

  useEffect(() => {
    // Reset history state on mount to prevent sync issues from page reloads
    window.history.replaceState({ depth: 0 }, "");
    
    const handlePopState = (e: PopStateEvent) => {
      const newDepth = e.state?.depth || 0;
      const currentDepth = (actionsRef.current.activeSubject ? 1 : 0) + 
                           (actionsRef.current.activeDocument ? 1 : 0) + 
                           (actionsRef.current.activeChapter ? 1 : 0) + 
                           (actionsRef.current.activeQuiz ? 1 : 0);
                           
      isNavigatingFromHistory.current = true;

      if (newDepth === 0 && currentDepth > 0) {
        actionsRef.current.handleHome();
      } else if (newDepth < currentDepth) {
        // If the user swiped back multiple times rapidly, we might need to go back multiple times
        const timesToGoBack = currentDepth - newDepth;
        actionsRef.current.handleBack(timesToGoBack);
      } else if (newDepth > currentDepth) {
        const timesToGoForward = newDepth - currentDepth;
        actionsRef.current.handleForward(timesToGoForward);
      }
    };
    
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    // If the state changed but we were NOT back/forward gesturing, clear forwardStack!
    if (!isNavigatingFromHistory.current) {
      const wentForwardManually = 
        (activeSubject && !prevSubject) ||
        (activeDocument && !prevDocument) ||
        (activeChapter && !prevChapter) ||
        (activeQuiz && !prevQuiz);
        
      if (wentForwardManually) {
        setForwardStack([]);
      }
    }
    
    setPrevSubject(activeSubject);
    setPrevDocument(activeDocument);
    setPrevChapter(activeChapter);
    setPrevQuiz(activeQuiz);
  }, [activeSubject, activeDocument, activeChapter, activeQuiz]);

  const handleBack = (steps = 1) => {
    playAppSound("click");
    
    // We determine the current state sequentially to allow multiple steps back
    let hasQuiz = !!activeQuiz;
    let hasChapter = !!activeChapter;
    let hasDoc = !!activeDocument;
    let hasSubject = !!activeSubject;
    
    const newForwardItems = [];
    
    for (let i = 0; i < steps; i++) {
      if (hasQuiz) {
        newForwardItems.push({ type: "quiz", val: activeQuiz });
        hasQuiz = false;
        setActiveQuiz(null);
      } else if (hasChapter) {
        newForwardItems.push({ type: "chapter", val: activeChapter });
        hasChapter = false;
        setActiveChapter(null);
      } else if (hasDoc) {
        newForwardItems.push({ type: "document", val: activeDocument });
        hasDoc = false;
        setActiveDocument(null);
      } else if (hasSubject) {
        newForwardItems.push({ type: "subject", val: activeSubject });
        hasSubject = false;
        setActiveSubject(null);
      }
    }
    
    if (newForwardItems.length > 0) {
      setForwardStack(prev => [...prev, ...newForwardItems]);
    }
  };

  const handleForward = (steps = 1) => {
    if (forwardStack.length === 0) return;
    playAppSound("click");
    
    let itemsPopped = 0;
    const itemsToApply = [];
    
    for (let i = 0; i < steps; i++) {
      if (forwardStack.length - 1 - itemsPopped >= 0) {
        itemsToApply.push(forwardStack[forwardStack.length - 1 - itemsPopped]);
        itemsPopped++;
      }
    }
    
    if (itemsPopped > 0) {
      setForwardStack(prev => prev.slice(0, prev.length - itemsPopped));
      
      itemsToApply.forEach(nextItem => {
        if (nextItem.type === "subject") {
          setActiveSubject(nextItem.val);
        } else if (nextItem.type === "document") {
          setActiveDocument(nextItem.val);
        } else if (nextItem.type === "chapter") {
          setActiveChapter(nextItem.val);
        } else if (nextItem.type === "quiz") {
          setActiveQuiz(nextItem.val);
        }
      });
    }
  };

  const handleHome = () => {
    playAppSound("click");
    
    const itemsToPush = [];
    if (activeSubject) itemsToPush.push({ type: "subject", val: activeSubject });
    if (activeDocument) itemsToPush.push({ type: "document", val: activeDocument });
    if (activeChapter) itemsToPush.push({ type: "chapter", val: activeChapter });
    if (activeQuiz) itemsToPush.push({ type: "quiz", val: activeQuiz });
    
    if (itemsToPush.length > 0) {
      setForwardStack(itemsToPush);
    }
    
    setActiveQuiz(null);
    setActiveChapter(null);
    setActiveDocument(null);
    setActiveSubject(null);
  };

  const handleUIBack = () => {
    if (window.history.state && window.history.state.depth !== undefined) {
      window.history.back();
    } else {
      isNavigatingFromHistory.current = true;
      handleBack();
    }
  };

  const handleUIForward = () => {
    if (forwardStack.length > 0) {
      if (window.history.state && window.history.state.depth !== undefined) {
        window.history.forward();
      } else {
        isNavigatingFromHistory.current = true;
        handleForward();
      }
    }
  };

  const handleUIHome = () => {
    isNavigatingFromHistory.current = false;
    handleHome();
    window.history.pushState({ depth: 0 }, "");
  };

  // Keep the latest functions in refs to use inside the event listeners without adding to dependencies
  const actionsRef = useRef({ handleBack, handleForward, handleHome, isDeepView, forwardStackLength: forwardStack.length, activeSubject, activeDocument, activeChapter, activeQuiz });
  useEffect(() => {
    actionsRef.current = { handleBack, handleForward, handleHome, isDeepView, forwardStackLength: forwardStack.length, activeSubject, activeDocument, activeChapter, activeQuiz };
  }, [handleBack, handleForward, handleHome, isDeepView, forwardStack.length, activeSubject, activeDocument, activeChapter, activeQuiz]);

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

  const openSettings = () => {
    playAppSound("expand");
    setTempKey(apiKey || "");
    setTestResult(null);
    setIsSettingsOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans container max-w-5xl mx-auto px-4 md:px-6 relative">
      <div className="mesh-gradient"></div>
      <div className="mesh-gradient-2"></div>
      <header className="flex items-center justify-between py-4 sm:py-6 w-full sticky top-0 bg-background/80 backdrop-blur-lg z-50 gap-2">
        <div className="flex items-center gap-1 sm:gap-3 shrink min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {isDeepView && (
              <button 
                onClick={handleUIBack}
                className="p-1 sm:p-1.5 rounded-full hover:bg-surface border border-zinc-200 dark:border-white/5 transition-all cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                title="Go Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {forwardStack.length > 0 && (
              <button 
                onClick={handleUIForward}
                className="p-1 sm:p-1.5 rounded-full hover:bg-surface border border-zinc-200 dark:border-white/5 transition-all cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                title="Go Forward"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <button 
            onClick={handleUIHome}
            className="flex items-center gap-2 sm:gap-3.5 text-left focus:outline-none hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer group shrink min-w-0"
            title="Go to Home Dashboard"
          >
            <div className="relative group/logo flex items-center justify-center shrink-0">
              {/* Animated glowing backdrop */}
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-brand-500 via-indigo-500 to-pink-500 opacity-30 blur-sm group-hover/logo:opacity-75 transition duration-300 group-hover:scale-105 animate-pulse" />
              
              {/* Glassmorphic border ring */}
              <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl p-[1.5px] bg-gradient-to-tr from-brand-500 via-purple-500 to-pink-500 shadow-xl transition-all duration-300 group-hover:rotate-3 group-hover:scale-105">
                <div className="w-full h-full rounded-[9px] bg-zinc-950 flex items-center justify-center font-black text-lg sm:text-xl text-white tracking-tighter">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-brand-400 drop-shadow-[0_2px_8px_rgba(99,102,241,0.5)]">
                    Q
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col shrink min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl font-black font-display tracking-tight text-zinc-900 dark:text-white flex items-center truncate">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-800 to-zinc-950 dark:from-zinc-100 dark:to-zinc-300">
                    QUIZ
                  </span>
                  <span className="ml-1 sm:ml-1.5 bg-clip-text text-transparent bg-gradient-to-r from-brand-500 via-indigo-500 to-pink-500 drop-shadow-[0_2px_10px_rgba(99,102,241,0.2)]">
                    ELITE
                  </span>
                </h1>
                
                {/* Micro premium badge */}
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-400/20 to-orange-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/20 shadow-sm shrink-0">
                  PRO
                </span>
              </div>
              {isDeepView ? (
                <p className="text-[9px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-bold tracking-wide mt-0.5 truncate flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse shrink-0"></span>
                  <span className="truncate">{activeChapter ? activeChapter.title : activeSubject?.name}</span>
                </p>
              ) : (
                <p className="text-[8px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold tracking-wider uppercase mt-0.5 truncate">
                  AI STUDY WORKSPACE
                </p>
              )}
            </div>
          </button>
        </div>
        
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3.5 justify-end shrink-0">
          {userStats && (
            <>
              <div className="stat-pill text-blue-500 dark:text-blue-400 text-xs py-1 sm:py-1.5 px-1.5 sm:px-3 whitespace-nowrap hidden min-[360px]:flex">
                <span className="text-sm">✨</span> <span className="hidden sm:inline ml-1">{userStats.xp} XP</span><span className="sm:hidden ml-0.5">{userStats.xp}</span>
              </div>
              
              <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-300 shadow-sm flex items-center gap-1 whitespace-nowrap">
                <span className="text-zinc-400 dark:text-zinc-500 font-medium text-[9px] sm:text-[10px] uppercase tracking-wider hidden sm:inline">Rank:</span>
                <span className="truncate max-w-[50px] sm:max-w-none">{userStats.level}</span>
              </div>
            </>
          )}

          <button 
            onClick={openSettings} 
            className="p-1.5 sm:p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 transition-all text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer shrink-0" 
            title="Settings / API Key"
          >
            <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </header>
      
      {/* Global Background Upload Indicator */}
      {isUploading && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-zinc-900 border border-brand-500/30 shadow-2xl shadow-brand-500/20 rounded-2xl p-4 w-72 flex flex-col gap-2 animate-fade-in pointer-events-auto">
           <div className="flex items-center gap-3">
             <div className="p-2 rounded-full bg-brand-500/10">
               <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
             </div>
             <div>
               <p className="text-sm font-bold text-zinc-900 dark:text-white">Uploading Document</p>
               <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Processing and extracting chapters...</p>
             </div>
           </div>
           <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full mt-1 overflow-hidden">
             <div className="h-full bg-brand-500 rounded-full animate-[pulse_1.5s_infinite]" style={{ width: '100%' }}></div>
           </div>
        </div>
      )}

      {/* Global Upload Error Toast */}
      {uploadError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-50 dark:bg-red-950/40 border border-red-500/30 shadow-2xl shadow-red-500/10 rounded-2xl p-4 w-80 flex flex-col gap-2 animate-fade-in pointer-events-auto">
           <div className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-red-500/10 mt-0.5 shrink-0">
               <XCircle className="w-4 h-4 text-red-500" />
             </div>
             <div>
               <p className="text-xs font-bold text-red-700 dark:text-red-400">Upload Failed</p>
               <p className="text-[10px] text-red-600/80 dark:text-red-400/80 leading-relaxed mt-0.5">
                 {uploadError}
               </p>
             </div>
           </div>
           <button onClick={() => useAppStore.setState({ uploadError: "" })} className="absolute top-2 right-2 p-1 text-red-500 hover:bg-red-500/10 rounded-md">
             <XCircle className="w-3.5 h-3.5" />
           </button>
        </div>
      )}

      {/* Global Upload Success Toast */}
      {uploadSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 shadow-2xl shadow-emerald-500/10 rounded-2xl p-4 w-80 flex flex-col gap-2 animate-fade-in pointer-events-auto">
           <div className="flex items-start gap-3">
             <div className="p-1 rounded-full bg-emerald-500/10 mt-0.5 shrink-0">
               <CheckCircle className="w-4 h-4 text-emerald-500" />
             </div>
             <div className="flex-1">
               <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Upload Successful</p>
               <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 leading-relaxed mt-0.5">
                 {uploadSuccess}
               </p>
             </div>
           </div>
           <button onClick={() => useAppStore.setState({ uploadSuccess: "" })} className="absolute top-2 right-2 p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-md cursor-pointer">
             <XCircle className="w-3.5 h-3.5" />
           </button>
        </div>
      )}

        <main className="flex-1 w-full pb-24 relative z-10">
        {children}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
}
