import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import { getQuestions, saveQuizSet, getQuizSets } from "../lib/db";
import { Question, QuizSet } from "../types";
import {
  Zap,
  Play,
  Loader2,
  GitCommit,
  ScrollText,
  AlertTriangle,
  Sparkles,
  Award,
  Trophy,
  Compass,
  Flame,
  BookOpen,
} from "lucide-react";
import { LiveQuiz, isOptionCorrect } from "./LiveQuiz";
import { RichText } from "./RichText";
import { generateId } from "../lib/id";
import { playAppSound } from "../lib/audio";

const REVISION_THEMES = [
  {
    gradientBg: "bg-gradient-to-br from-indigo-500/8 dark:from-indigo-500/15 via-zinc-50/50 dark:via-indigo-950/5 to-white dark:to-surface/10",
    borderColor: "border-indigo-200 dark:border-indigo-500/20 hover:border-indigo-500/40 dark:hover:border-indigo-500/50",
    glowColor: "bg-indigo-500/5 dark:bg-indigo-500/10 group-hover:bg-indigo-500/15",
    iconBg: "bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-100 dark:border-indigo-500/20",
    iconColor: "text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-800 dark:group-hover:text-indigo-300",
    titleColor: "text-indigo-950 dark:text-indigo-100 group-hover:text-indigo-700 dark:group-hover:text-white",
    badgeBg: "bg-indigo-50 dark:bg-indigo-400/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-indigo-500/5",
    accentGlow: "from-indigo-500/20 to-transparent",
    Icon: Sparkles,
  },
  {
    gradientBg: "bg-gradient-to-br from-emerald-500/8 dark:from-emerald-500/15 via-zinc-50/50 dark:via-teal-950/5 to-white dark:to-surface/10",
    borderColor: "border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-500/40 dark:hover:border-emerald-500/50",
    glowColor: "bg-emerald-500/5 dark:bg-emerald-500/10 group-hover:bg-emerald-500/15",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/20",
    iconColor: "text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-800 dark:group-hover:text-emerald-300",
    titleColor: "text-emerald-950 dark:text-emerald-100 group-hover:text-emerald-700 dark:group-hover:text-white",
    badgeBg: "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-emerald-500/5",
    accentGlow: "from-emerald-500/20 to-transparent",
    Icon: Award,
  },
  {
    gradientBg: "bg-gradient-to-br from-amber-500/8 dark:from-amber-500/15 via-zinc-50/50 dark:via-orange-950/5 to-white dark:to-surface/10",
    borderColor: "border-amber-200 dark:border-amber-500/20 hover:border-amber-500/40 dark:hover:border-amber-500/50",
    glowColor: "bg-amber-500/5 dark:bg-amber-500/10 group-hover:bg-amber-500/15",
    iconBg: "bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300",
    titleColor: "text-amber-950 dark:text-amber-100 group-hover:text-amber-700 dark:group-hover:text-white",
    badgeBg: "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-amber-500/5",
    accentGlow: "from-amber-500/20 to-transparent",
    Icon: Trophy,
  },
  {
    gradientBg: "bg-gradient-to-br from-rose-500/8 dark:from-rose-500/15 via-zinc-50/50 dark:via-pink-950/5 to-white dark:to-surface/10",
    borderColor: "border-rose-200 dark:border-rose-500/20 hover:border-rose-500/40 dark:hover:border-rose-500/50",
    glowColor: "bg-rose-500/5 dark:bg-rose-500/10 group-hover:bg-rose-500/15",
    iconBg: "bg-rose-50 dark:bg-rose-500/15 border border-rose-100 dark:border-rose-500/20",
    iconColor: "text-rose-600 dark:text-rose-400 group-hover:text-rose-800 dark:group-hover:text-rose-300",
    titleColor: "text-rose-950 dark:text-rose-100 group-hover:text-rose-700 dark:group-hover:text-white",
    badgeBg: "bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-rose-500/5",
    accentGlow: "from-rose-500/20 to-transparent",
    Icon: Zap,
  },
  {
    gradientBg: "bg-gradient-to-br from-cyan-500/8 dark:from-cyan-500/15 via-zinc-50/50 dark:via-sky-950/5 to-white dark:to-surface/10",
    borderColor: "border-cyan-200 dark:border-cyan-500/20 hover:border-cyan-500/40 dark:hover:border-cyan-500/50",
    glowColor: "bg-cyan-500/5 dark:bg-cyan-500/10 group-hover:bg-cyan-500/15",
    iconBg: "bg-cyan-50 dark:bg-cyan-500/15 border border-cyan-100 dark:border-cyan-500/20",
    iconColor: "text-cyan-600 dark:text-cyan-400 group-hover:text-cyan-800 dark:group-hover:text-cyan-300",
    titleColor: "text-cyan-950 dark:text-cyan-100 group-hover:text-cyan-700 dark:group-hover:text-white",
    badgeBg: "bg-cyan-50 dark:bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-cyan-500/5",
    accentGlow: "from-cyan-500/20 to-transparent",
    Icon: Compass,
  },
  {
    gradientBg: "bg-gradient-to-br from-violet-500/8 dark:from-violet-500/15 via-zinc-50/50 dark:via-purple-950/5 to-white dark:to-surface/10",
    borderColor: "border-violet-200 dark:border-violet-500/20 hover:border-violet-500/40 dark:hover:border-violet-500/50",
    glowColor: "bg-violet-500/5 dark:bg-violet-500/10 group-hover:bg-violet-500/15",
    iconBg: "bg-violet-50 dark:bg-violet-500/15 border border-violet-100 dark:border-violet-500/20",
    iconColor: "text-violet-600 dark:text-violet-400 group-hover:text-violet-800 dark:group-hover:text-violet-300",
    titleColor: "text-violet-950 dark:text-violet-100 group-hover:text-violet-700 dark:group-hover:text-white",
    badgeBg: "bg-violet-50 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-500/20",
    shadow: "hover:shadow-lg dark:hover:shadow-violet-500/5",
    accentGlow: "from-violet-500/20 to-transparent",
    Icon: Flame,
  }
];

export function ChapterView() {
  const {
    activeSubject,
    activeDocument,
    activeChapter,
    activeQuiz,
    setActiveSubject,
    setActiveDocument,
    setActiveChapter,
    setActiveQuiz,
    addQuestions,
    clearQuestionsAndSetsForChapter,
  } = useAppStore();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizSets, setQuizSets] = useState<QuizSet[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [targetCount, setTargetCount] = useState<number>(30);
  const [isAutoCount, setIsAutoCount] = useState<boolean>(true);

  useEffect(() => {
    if (activeChapter) {
      if (!activeQuiz) {
        loadData();
      }
      // Default to suggested questions from chapter if analyzed, otherwise 30
      if (activeChapter.estimatedQuestions) {
        setTargetCount(activeChapter.estimatedQuestions);
      } else {
        setTargetCount(30);
      }
    }
  }, [activeChapter, activeQuiz]);

  const loadData = async () => {
    if (!activeChapter) return;
    try {
      const qs = await getQuestions(activeChapter.id);
      const sets = await getQuizSets(activeChapter.id);
      
      sets.sort((a, b) => {
        const matchA = a.name.match(/Set\s+(\d+)/i);
        const matchB = b.name.match(/Set\s+(\d+)/i);
        if (matchA && matchB) {
            return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
        }
        return a.createdAt - b.createdAt;
      });

      setQuestions(qs);
      setQuizSets(sets);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  };

  const handleGenerate = async () => {
    if (!activeChapter || !activeDocument) return;
    setError(null);
    setQuotaNotice(null);
    if (!activeDocument.fileUri && !activeDocument.localPath) {
      setError(
        "This document needs to be analyzed again using the updated database schemas. Please go back, select a new document or re-upload this document to register its file link correctly.",
      );
      return;
    }
    try {
      setIsGenerating(true);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const apiKey = useAppStore.getState().apiKey;
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      // Let backend process text
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileUri: activeDocument.fileUri,
          localPath: activeDocument.localPath,
          mimeType: activeDocument.mimeType || "application/pdf",
          chapterTitle: activeChapter.title,
          topics: activeChapter.topics,
          importantConcepts: activeChapter.importantConcepts || [],
          targetExams: "HSSC CET Group C, Group D, HSSC Constable, NCERT guidelines",
          targetCount: isAutoCount ? "auto" : targetCount,
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        if (response.status >= 500) {
          throw new Error(`Server timeout or proxy error (${response.status}). The operation took too long. Please try again later.`);
        }
        throw new Error(
          response.ok
            ? "Received invalid data from server (possibly HTML/Error page)."
            : `Server returned ${response.status} with invalid format.`,
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error: ${response.status}`);
      }

      if (data.isQuotaFallback) {
        setQuotaNotice(data.message);
      }

      const generatedQs = data.questions.map((q: any) => ({
        ...q,
        id: generateId(),
        chapterId: activeChapter.id,
        createdAt: Date.now(),
      }));

      // Add the new master exam-oriented questions
      await addQuestions(generatedQs);

      // Auto-create sets of EXACTLY 15 questions each
      const setSize = 15;
      const existingSets = await getQuizSets(activeChapter.id);
      let setNumber = existingSets.length + 1;
      for (let i = 0; i < generatedQs.length; i += setSize) {
        const chunk = generatedQs.slice(i, i + setSize);
        if (chunk.length > 0) {
          const newSet: QuizSet = {
            id: generateId(),
            chapterId: activeChapter.id,
            name: `Set ${setNumber}`,
            questionIds: chunk.map((q: Question) => q.id),
            createdAt: Date.now(),
          };
          await saveQuizSet(newSet);
          setNumber++;
        }
      }

      await loadData();
    } catch (e: any) {
      console.error(e);
      setError("Error generating questions. " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      return;
    }
    setError(null);
    await clearQuestionsAndSetsForChapter(activeChapter.id);
    await loadData();
    setShowClearConfirm(false);
  };

  if (!activeChapter) return null;

  if (activeQuiz) {
    const quizQuestions = questions.filter((q) =>
      activeQuiz.questionIds.includes(q.id),
    );
    
    const currentQuizIndex = quizSets.findIndex(q => q.id === activeQuiz.id);
    const nextQuiz = currentQuizIndex !== -1 && currentQuizIndex < quizSets.length - 1 ? quizSets[currentQuizIndex + 1] : undefined;

    return (
      <LiveQuiz
        quizSet={activeQuiz}
        questions={quizQuestions}
        onComplete={() => {
          if (window.history.state && window.history.state.depth > 0) {
            window.history.back();
          } else {
            setActiveQuiz(null);
          }
        }}
        onHome={() => {
          setActiveSubject(null);
          setActiveDocument(null);
          setActiveChapter(null);
          setActiveQuiz(null);
          window.history.pushState({ depth: 0 }, "");
        }}
        onNextTest={nextQuiz ? () => setActiveQuiz(nextQuiz) : undefined}
      />
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {error && (
        <div className="glass-card p-5 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-200 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-300">
              Generation Issue Detected
            </p>
            <p className="text-zinc-300 mt-1">{error}</p>
          </div>
        </div>
      )}
      {quotaNotice && (
        <div className="glass-card p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-200 text-sm flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <p className="font-semibold text-amber-300">
              API Quota Fallback Activated
            </p>
            <p className="text-zinc-300 mt-1">{quotaNotice}</p>
          </div>
        </div>
      )}
      {/* Gamified Header */}
      {!activeDocument?.isDeleted && (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="glass-card p-6 md:p-8 rounded-3xl flex-1 relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <h2 className="text-2xl font-bold font-display relative z-10 m-0">
              {activeChapter.title}
            </h2>
            <div className="flex items-center gap-2 mt-4 relative z-10">
              <span className="text-sm font-semibold text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-xl border border-brand-500/20 flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-brand-400" />
                {questions.length} Questions Generated
              </span>
            </div>
          </div>

          <div className="glass-card p-6 rounded-3xl flex-shrink-0 flex flex-col items-stretch justify-center gap-4 border border-brand-500/20 bg-brand-500/5 min-w-[270px]">
            <div className="flex flex-col gap-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                  Target Q-Count
                </label>
                
                <button
                  type="button"
                  onClick={() => setIsAutoCount(!isAutoCount)}
                  disabled={isGenerating}
                  className={`text-[10px] font-bold font-sans uppercase px-2 py-1 rounded-full border transition-all flex items-center gap-1 cursor-pointer select-none leading-none ${
                    isAutoCount 
                      ? "bg-brand-500/15 text-brand-400 border-brand-500/25 shadow-[0_0_10px_rgba(37,99,235,0.15)]"
                      : "bg-zinc-800/55 text-zinc-400 border-zinc-700/60 hover:border-zinc-600"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isAutoCount ? "bg-brand-400 animate-pulse" : "bg-zinc-500"}`}></span>
                  {isAutoCount ? "Auto (स्वचालित)" : "Manual"}
                </button>
              </div>

              {isAutoCount ? (
                <div className="w-full bg-brand-500/5 border border-brand-500/10 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                  <span className="text-xs font-bold text-brand-300 flex items-center gap-1">
                    ✨ Auto-Optimized Mode
                  </span>
                  <span className="text-[11px] text-zinc-400 leading-normal">
                    Our examiner bot dynamically analyzes chapter content and chooses the ideal count of high-yield questions for you.
                  </span>
                </div>
              ) : (
                <select
                  value={targetCount}
                  onChange={(e) => setTargetCount(parseInt(e.target.value))}
                  disabled={isGenerating}
                  className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none focus:border-brand-500 transition-all font-semibold disabled:opacity-50"
                >
                  <option value={20}>20 – Concise (संक्षिप्त - 20 Qs)</option>
                  <option value={25}>25 – Standard (साधारण - 25 Qs)</option>
                  <option value={30}>30 – Intermediate (विस्तृत - 30 Qs)</option>
                  <option value={35}>35 – High Yield (महत्वपूर्ण - 35 Qs)</option>
                  <option value={40}>40 – Masterclass (विशेषज्ञ - 40 Qs)</option>
                  <option value={45}>45 – Pro Level (अति विशिष्ट - 45 Qs)</option>
                  <option value={50}>50 – Complete (पूर्ण विवरण - 50 Qs)</option>
                </select>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold px-6 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-brand-500/20 cursor-pointer text-center"
            >
              {isGenerating ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Zap className="w-6 h-6" />
              )}
              {isGenerating ? "Synthesizing Source..." : "Generate Q-Bank"}
            </button>

            {questions.length > 0 && (
              <button
                onClick={handleClear}
                disabled={isGenerating}
                className={`w-full text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  showClearConfirm 
                    ? "text-white bg-red-600 hover:bg-red-500 border-red-500 shadow-md"
                    : "text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border-red-500/20"
                }`}
              >
                {showClearConfirm ? "Click Again to Confirm Clear" : "Clear Generated Q-Bank"}
              </button>
            )}

            <p className="text-xs text-zinc-500 mt-2 text-center max-w-[200px]">
              Strictly grounded to source material. Zero hallucination.
            </p>
          </div>
        </div>
      )}

      {/* Quiz Sets */}
      <div className="space-y-4">
        <h3 className="font-display font-semibold text-xl text-zinc-800 dark:text-zinc-200">
          Revision Sets
        </h3>
        {quizSets.length === 0 ? (
            <div className="text-center py-10 bg-surface/20 border border-border/50 rounded-2xl text-zinc-500 text-sm">
              No quiz sets generated yet. Generate questions to auto-create sets.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {quizSets.map((set, idx) => {
                const theme = REVISION_THEMES[idx % REVISION_THEMES.length];
                const SetIcon = theme.Icon;
                return (
                  <button
                    key={set.id}
                    onClick={() => {
                      const settings = useAppStore.getState().settings;
                      if (settings.soundEnabled) playAppSound("click");
                      setActiveQuiz(set);
                    }}
                    className={`relative overflow-hidden group rounded-xl p-3.5 border text-left transition-all duration-300 hover:-translate-y-0.5 shadow-sm ${theme.borderColor} ${theme.gradientBg} ${theme.shadow} flex flex-col gap-3.5 cursor-pointer`}
                  >
                    {/* Glowing Blur Circle in Corner */}
                    <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-xl transition-all duration-300 opacity-60 group-hover:opacity-90 ${theme.glowColor}`}></div>
                    
                    <div className="flex justify-between items-center z-10 w-full">
                      <div className={`p-2 rounded-lg transition-all duration-300 group-hover:scale-105 ${theme.iconBg} flex items-center justify-center`}>
                        <SetIcon className={`w-4 h-4 ${theme.iconColor}`} />
                      </div>
                      {set.bestScore !== undefined ? (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-sm ${theme.badgeBg}`}>
                          <Trophy className="w-3 h-3 text-yellow-400 animate-pulse" />
                          Best: {set.bestScore}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/30 px-2 py-0.5 rounded-md">
                          Unattempted
                        </span>
                      )}
                    </div>

                    <div className="z-10">
                      <h4 className={`font-bold font-display text-base tracking-tight transition-colors duration-200 ${theme.titleColor}`}>
                        {(() => {
                          const cleanName = set.name.replace(/Challenge\s+Set/gi, "").replace(/Challenge/gi, "").replace(/\s*\([^)]*\)/g, "").trim();
                          if (/^\d+$/.test(cleanName)) {
                            return `Set ${cleanName}`;
                          }
                          return cleanName || "Set";
                        })()}
                      </h4>
                      
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                        <p className="text-xs font-mono text-zinc-600 dark:text-zinc-300 font-semibold">
                          {set.questionIds.length} Questions
                        </p>
                      </div>
                    </div>

                    {/* Play Action / Start Challenge Bar */}
                    <div className="mt-1 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between z-10 w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                        Start Quiz
                      </span>
                      <div className={`w-6 h-6 rounded-md ${theme.iconBg} flex items-center justify-center group-hover:translate-x-0.5 transition-all duration-300`}>
                        <Play className={`w-3 h-3 ${theme.iconColor} ml-0.5`} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      {/* Permanent Question Bank */}
      {questions.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border/50">
          <h3 className="font-display font-semibold text-xl text-zinc-800 dark:text-zinc-200">
            Permanent Question Bank
          </h3>
          <div className="space-y-3">
            {questions.map((q, i) => {
              // Client-side sanitization of numbering prefixes, labels or duplicated Q prefixes
              const cleanQText = q.question
                .trim()
                .replace(/^(Q|q)uestion\s*\d+[\s\.\:\-]*|^(Q|q)uestion\s*[\s\.\:\-]+\s*|^[Qq]\d+[\s\.\:\-]*|^[Qq][\.\:\-]+\s*|^\d+[\s\.\)\:\-]+\s*/g, "")
                .trim();
                
              return (
                <div
                  key={q.id}
                  className="glass-card p-5 rounded-xl text-sm border-l-4 border-l-brand-500"
                >
                  <div className="flex items-start gap-4 w-full">
                    <div className="bg-brand-500/15 text-brand-700 dark:text-brand-300 font-mono text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 mt-0.5 min-w-[32px] text-center">
                      Q{i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-2 leading-relaxed text-base">
                        <RichText text={cleanQText} />
                      </p>
                      <ul className="space-y-1 text-zinc-500 dark:text-zinc-400 list-disc ml-4">
                        {q.options.map((opt, optIdx) => (
                          <li
                            key={opt}
                            className={
                              isOptionCorrect(opt, q.correctAnswer, q.options, optIdx)
                                ? "text-green-400 font-medium list-none -ml-4 flex items-center gap-2"
                                : ""
                            }
                          >
                            {isOptionCorrect(opt, q.correctAnswer, q.options, optIdx) && (
                              <GitCommit className="w-3 h-3 text-green-500 inline" />
                            )}
                            <RichText text={opt} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
