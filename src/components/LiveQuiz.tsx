import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Question, QuizSet, ThemeId } from "../types";
import { useAppStore } from "../store";
import { saveQuizSet } from "../lib/db";
import { useAudio } from "../hooks/useAudio";
import { playAppSound, playDashboardFanfare } from "../lib/audio";
import { ChevronLeft, Volume2, VolumeX, Sparkles, Check, X, Trophy, Play, TrendingUp, TrendingDown, AlertTriangle, Target, BookOpen, Lightbulb, BarChart2, Award, Settings, Clock } from "lucide-react";
import { cn } from "../lib/utils";
import { generateId } from "../lib/id";
import { RichText } from "./RichText";
import { SettingsModal } from "./SettingsModal";

export function isOptionCorrect(
  opt: string | undefined,
  correct: string | undefined,
  options?: string[],
  optionIndex?: number
): boolean {
  if (!opt || !correct) return false;
  
  const clean = (s: string) => {
    return s
      .trim()
      // Normalize common superscript numbers and super/subscript minus signs to standard ones
      .replace(/⁻/g, "-")
      .replace(/¹/g, "1")
      .replace(/²/g, "2")
      .replace(/³/g, "3")
      .replace(/⁴/g, "4")
      .replace(/⁵/g, "5")
      .replace(/⁰/g, "0")
      .replace(/⁶/g, "6")
      .replace(/⁷/g, "7")
      .replace(/⁸/g, "8")
      .replace(/⁹/g, "9")
      // Subscripts
      .replace(/₀/g, "0")
      .replace(/₁/g, "1")
      .replace(/₂/g, "2")
      .replace(/₃/g, "3")
      .replace(/₄/g, "4")
      .replace(/₅/g, "5")
      .replace(/₆/g, "6")
      .replace(/₇/g, "7")
      .replace(/₈/g, "8")
      .replace(/₉/g, "9")
      // Normalize real minus sign \u2212 and other dashes
      .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
      // Remove enclosing brackets or braces/quotes for fuzzy matching
      .replace(/^[\[\'\"\({\s\-\>]+|[\]\'\"\)}\s]+$/g, "")
      // Replace multi-spaces
      .replace(/\s+/g, "")
      .toLowerCase();
  };
  
  const cleanOpt = clean(opt);
  const cleanCorrect = clean(correct);
  
  // 1. Direct exact match
  if (cleanOpt === cleanCorrect) return true;
  
  // 2. Strict exact match check within options list.
  // If one of the options matches the correct text EXACTLY (when cleaned), 
  // then that option (and ONLY that option) is correct.
  if (options && options.length > 0) {
    const cleanedOptions = options.map(o => clean(o));
    const exactMatchIdx = cleanedOptions.indexOf(cleanCorrect);
    if (exactMatchIdx !== -1) {
      return optionIndex === exactMatchIdx;
    }
  }
  
  // 3. Prefix checking: e.g. "A. Option Text" or "1) Option Text"
  if (optionIndex !== undefined) {
    const letters = ["a", "b", "c", "d"];
    const targetLetter = letters[optionIndex];
    const prefixes = [
      `${targetLetter}.`, `${targetLetter})`, `${targetLetter}-`,
      `${optionIndex.toString()}.`, `${optionIndex.toString()})`,
      `${(optionIndex + 1).toString()}.`, `${(optionIndex + 1).toString()})`
    ];
    for (const prefix of prefixes) {
      if (cleanCorrect.startsWith(prefix) && cleanCorrect.substring(prefix.length) === cleanOpt) {
        return true;
      }
    }
  }
  
  // 4. Match single character letter or index fallbacks only if cleanCorrect is extremely short (length 1)
  if (cleanCorrect.length === 1 && optionIndex !== undefined) {
    const letters = ["a", "b", "c", "d"];
    if (cleanCorrect === letters[optionIndex]) return true;
    if (cleanCorrect === optionIndex.toString()) return true;
    if (cleanCorrect === (optionIndex + 1).toString()) return true;
  }
  
  // 5. Fuzzy ending check (as a last resort, when no exact options matched)
  if (cleanCorrect.includes(cleanOpt) || cleanOpt.includes(cleanCorrect)) {
    if (cleanOpt.length > 3 && cleanCorrect.length > 3) {
      return true;
    }
  }
  
  return false;
}

const getThemeGradients = (themeId: ThemeId) => {
  switch (themeId) {
    case "midnight-obsidian":
      return {
        primary: "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:via-indigo-400 hover:to-purple-500 text-white shadow-indigo-500/15 border-indigo-500/10",
        secondary: "bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border-purple-500/20 hover:border-purple-500/40 text-purple-600 dark:text-purple-300 hover:bg-purple-500/15"
      };
    case "cosmic-ocean":
      return {
        primary: "bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500 hover:from-sky-500 hover:via-cyan-400 hover:to-emerald-400 text-white shadow-cyan-500/15 border-cyan-500/10",
        secondary: "bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border-cyan-500/20 hover:border-cyan-500/40 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/15"
      };
    case "solar-storm":
      return {
        primary: "bg-gradient-to-r from-amber-600 via-amber-500 to-rose-600 hover:from-amber-500 hover:via-amber-400 hover:to-rose-500 text-white shadow-amber-500/15 border-amber-500/10",
        secondary: "bg-gradient-to-r from-amber-500/10 to-rose-500/10 border-amber-500/20 hover:border-amber-500/40 text-amber-600 dark:text-amber-350 hover:bg-amber-500/15"
      };
    case "ivory-scholastic":
      return {
        primary: "bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 hover:from-blue-600 hover:via-blue-500 hover:to-indigo-600 text-white shadow-blue-700/15 border-blue-700/10",
        secondary: "bg-gradient-to-r from-blue-500/8 to-indigo-500/8 border-blue-500/20 hover:border-blue-500/35 text-blue-700 dark:text-blue-300 hover:bg-blue-500/12"
      };
    case "emerald-garden":
      return {
        primary: "bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 hover:from-emerald-600 hover:via-emerald-500 hover:to-teal-600 text-white shadow-emerald-700/15 border-emerald-700/10",
        secondary: "bg-gradient-to-r from-emerald-500/8 to-teal-500/8 border-emerald-500/20 hover:border-emerald-500/35 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/12"
      };
    case "sunset-rose":
      return {
        primary: "bg-gradient-to-r from-rose-700 via-rose-600 to-pink-700 hover:from-rose-600 hover:via-rose-500 hover:to-pink-600 text-white shadow-rose-700/15 border-rose-700/10",
        secondary: "bg-gradient-to-r from-rose-500/8 to-pink-500/8 border-rose-500/20 hover:border-rose-500/35 text-rose-700 dark:text-rose-300 hover:bg-rose-500/12"
      };
    default:
      return {
        primary: "bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:via-indigo-400 hover:to-purple-500 text-white shadow-indigo-500/15 border-indigo-500/10",
        secondary: "bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border-purple-500/20 hover:border-purple-500/40 text-purple-600 dark:text-purple-300 hover:bg-purple-500/15"
      };
  }
};

interface LiveQuizProps {
  quizSet: QuizSet;
  questions: Question[];
  onComplete: () => void;
  onHome?: () => void;
  onNextTest?: () => void;
}

export function LiveQuiz({ quizSet, questions, onComplete, onHome, onNextTest }: LiveQuizProps) {
  const { updateStats, settings, userStats, updateSettings } = useAppStore();
  const themeId = settings?.themeId || "midnight-obsidian";
  const gradients = getThemeGradients(themeId);
  const { soundEnabled, playSound: hookPlaySound, playTriviaComplete, toggleSound } = useAudio();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [missedCount, setMissedCount] = useState(0);
  
  const isMuted = !soundEnabled;
  const setIsMuted = (muted: boolean) => {
    toggleSound();
  };

  const [timeLeft, setTimeLeft] = useState(30);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [showFirstAttemptToast, setShowFirstAttemptToast] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<{ [id: string]: boolean }>({});
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [restartCount, setRestartCount] = useState(0);

  // Lifeline assistance states
  const [fiftyFiftyCount, setFiftyFiftyCount] = useState(3);
  const [hintCount, setHintCount] = useState(3);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [showHintDialog, setShowHintDialog] = useState(false);

  // Helper function to shuffle an array
  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const questionsKey = (questions || []).map((q) => q.id).join(",") + "_" + restartCount;

  const shuffledQuestions = useMemo(() => {
    return (questions || []).map((q) => {
      const options = q.options || [];
      if (options.length === 0) return q;

      // Identify correct answer text before shuffling
      let correctText = String(q.correctAnswer || "").trim();
      const letters = ["a", "b", "c", "d"];
      const cleanCorrect = correctText.toLowerCase();

      let correctIndex = -1;

      if (cleanCorrect.length === 1) {
        if (letters.includes(cleanCorrect)) {
          correctIndex = letters.indexOf(cleanCorrect);
        } else {
          const num = parseInt(cleanCorrect, 10);
          if (!isNaN(num)) {
            if (num >= 0 && num < options.length) {
              correctIndex = num;
            } else if (num >= 1 && num <= options.length) {
              correctIndex = num - 1;
            }
          }
        }
      }

      if (correctIndex >= 0 && correctIndex < options.length) {
        correctText = options[correctIndex];
      } else {
        // Try to find exact match in options
        const exactIdx = options.findIndex((opt) => opt.toLowerCase() === cleanCorrect);
        if (exactIdx !== -1) {
          correctText = options[exactIdx];
        } else {
          // Try fuzzy match in options
          const fuzzyIdx = options.findIndex((opt) => {
            const oClean = opt.toLowerCase().replace(/\s+/g, "");
            const cClean = cleanCorrect.replace(/\s+/g, "");
            return oClean.includes(cClean) || cClean.includes(oClean);
          });
          if (fuzzyIdx !== -1) {
            correctText = options[fuzzyIdx];
          }
        }
      }

      // Now shuffle options using Fisher-Yates
      const shuffled = shuffleArray(options);

      return {
        ...q,
        options: shuffled,
        correctAnswer: correctText, // Always set correctAnswer to the safe text-based option
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsKey]);

  const handleRestartQuiz = () => {
    setIsCompleted(false);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsRevealed(false);
    setCorrectCount(0);
    setMissedCount(0);
    setTimeLeft(30);
    setShowAnalysis(false);
    setShowCelebrationModal(false);
    setAnsweredQuestions({});
    setShowBreakdownModal(false);
    setFiftyFiftyCount(3);
    setHintCount(3);
    setEliminatedOptions([]);
    setShowHintDialog(false);
    setRestartCount((prev) => prev + 1);
  };
  
  useEffect(() => {
    const chapterId = quizSet.chapterId;
    const alreadyAttempted = userStats?.attempts?.some((a) => a.chapterId === chapterId) || quizSet.bestScore !== undefined;
    if (!alreadyAttempted) {
      setShowFirstAttemptToast(true);
      const timer = setTimeout(() => {
        setShowFirstAttemptToast(false);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [quizSet.id]);
  
  const autoNextTimerRef = useRef<any>(null);

  if (!questions || questions.length === 0) {
    return (
      <div className="p-8 text-center glass-card max-w-md mx-auto my-12">
        <p className="text-slate-400 font-medium mb-4">No questions available for this chapter.</p>
        <button onClick={onComplete} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all cursor-pointer font-semibold">
          Back to Chapter
        </button>
      </div>
    );
  }

  const question = shuffledQuestions[currentIndex];

  // Font size classes generator
  const fontClass = {
    medium: {
      question: "text-sm md:text-base",
      option: "text-[13px] md:text-sm",
      explanation: "text-xs md:text-sm"
    },
    large: {
      question: "text-base md:text-lg",
      option: "text-sm md:text-base",
      explanation: "text-sm md:text-base"
    },
    xl: {
      question: "text-lg md:text-xl",
      option: "text-base md:text-lg",
      explanation: "text-base md:text-lg"
    }
  }[settings?.fontSize || "medium"];

  const clearAutoNextTimer = () => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  };

  const scheduleAutoNext = () => {
    clearAutoNextTimer();
    autoNextTimerRef.current = setTimeout(() => {
      handleNext();
    }, 2000);
  };

  // Sound function delegated to game-like centralized audio engine, respecting local mute
  const playSound = (type: 'correct' | 'wrong' | 'complete' | 'tick' | 'click' | 'expand' | 'reset') => {
    hookPlaySound(type);
  };

  const playFanfare = () => {
    playTriviaComplete();
  };

  const fireConfetti = () => {
    // Confetti removed
  };

  const fireFanfareConfetti = () => {
    // Confetti removed
    setTimeout(() => {
      // Confetti removed
    }, 450);
    setTimeout(() => {
      // Confetti removed
    }, 900);
  };

  const triggerVibration = () => {
    if (settings.vibrationEnabled && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(200);
      } catch (e) {
        console.warn("Vibration failed, probably blocked by sandbox iframe constraints", e);
      }
    }
  };

  // Timer countdown cycle (respecting auto-advance when completes)
  useEffect(() => {
    if (isRevealed || !question) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Timeout triggers auto-missed reveal state
          setSelectedOption("");
          setIsRevealed(true);
          setAnsweredQuestions(prev => ({ ...prev, [question.id]: false }));
          setMissedCount(m => m + 1);
          playSound('wrong');
          triggerVibration();
          
          if (settings.autoAdvanceOnTimeout) {
            scheduleAutoNext();
          }
          return 0;
        }
        if (prev <= 6) {
          playSound('tick');
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentIndex, isRevealed, question]);

  // Clean timers on exit or change
  useEffect(() => {
    return () => clearAutoNextTimer();
  }, [currentIndex]);

  const handleSelect = (opt: string) => {
    if (isRevealed) return;
    setSelectedOption(opt);
    setIsRevealed(true);
    
    const isCorrect = isOptionCorrect(opt, question.correctAnswer, question.options, question.options.indexOf(opt));
    setAnsweredQuestions(prev => ({ ...prev, [question.id]: isCorrect }));
    if (isCorrect) {
      setCorrectCount(c => c + 1);
      playSound('correct');
    } else {
      setMissedCount(m => m + 1);
      playSound('wrong');
      triggerVibration();
    }

    if (settings.autoNextOnAnswer) {
      scheduleAutoNext();
    }
  };

  const handleFiftyFifty = () => {
    if (fiftyFiftyCount <= 0 || isRevealed) return;
    playSound('click');
    const incorrectOptions = question.options.filter(
      (opt, idx) => !isOptionCorrect(opt, question.correctAnswer, question.options, idx)
    );
    // Pick 2 random incorrect options to eliminate
    const toEliminate: string[] = [];
    const shuffledIncorrect = [...incorrectOptions].sort(() => 0.5 - Math.random());
    if (shuffledIncorrect[0]) toEliminate.push(shuffledIncorrect[0]);
    if (shuffledIncorrect[1]) toEliminate.push(shuffledIncorrect[1]);
    
    setEliminatedOptions(toEliminate);
    setFiftyFiftyCount((prev) => prev - 1);
  };

  const handleHint = () => {
    if (hintCount <= 0 || isRevealed) return;
    playSound('click');
    setHintCount((prev) => prev - 1);
    setShowHintDialog(true);
  };

  const finalizeQuiz = async () => {
    const score = Math.round((correctCount / questions.length) * 100);
    
    // Save stats to DB
    if (!quizSet.bestScore || score > quizSet.bestScore) {
       await saveQuizSet({ 
         ...quizSet, 
         bestScore: score, 
         bestCorrectCount: correctCount, 
         bestTotalCount: questions.length, 
         lastPlayedAt: Date.now() 
       });
    }

    const newAttempt = {
      id: generateId(),
      chapterId: quizSet.chapterId,
      chapterTitle: quizSet.name,
      score: score,
      correctCount: correctCount,
      totalQuestions: questions.length,
      playedAt: Date.now()
    };
    
    await updateStats({
       xp: correctCount * 15,
       totalCorrect: correctCount,
       totalWrong: missedCount,
       lastActive: Date.now(),
       attempts: [newAttempt]
    });
    
    setIsCompleted(true);
  };

  const handleNext = async () => {
    clearAutoNextTimer();
    setShowAnalysis(false);
    setEliminatedOptions([]);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(c => c + 1);
      setSelectedOption(null);
      setIsRevealed(false);
      setTimeLeft(30); // reset clock
    } else {
      playSound('complete');
      
      // Elite celebration triggered when score is 70% or more of the questions (rough estimate)
      // Example: 3 out of 5 is floor(5 * 0.7) = 3, which is 60%, but qualifies as a celebration!
      const meetsCeleb = correctCount >= Math.floor(questions.length * 0.7);
      
      if (meetsCeleb) {
        setShowCelebrationModal(true);
        playFanfare();
        fireFanfareConfetti();
      } else {
        await finalizeQuiz();
      }
    }
  };

  // Trigger high-quality celebration confetti when results page finishes loading for score 70% or more
  useEffect(() => {
    if (isCompleted) {
      const score = Math.round((correctCount / questions.length) * 100);
      if (score >= 70) {
        const timer = setTimeout(() => {
          fireFanfareConfetti();
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [isCompleted, correctCount, questions.length]);

  if (isCompleted) {
    const score = Math.round((correctCount / questions.length) * 100);
    const getTopicBreakdown = () => {
      const topicsMap: { [topic: string]: { total: number; correct: number } } = {};
      
      questions.forEach((q) => {
        const tag = q.topicTag?.trim() || "General Study";
        if (!topicsMap[tag]) {
          topicsMap[tag] = { total: 0, correct: 0 };
        }
        topicsMap[tag].total += 1;
        if (answeredQuestions[q.id] === true) {
          topicsMap[tag].correct += 1;
        }
      });

      const breakdownList = Object.keys(topicsMap).map((tag) => {
        const data = topicsMap[tag];
        const accuracy = data.total > 0 ? (data.correct / data.total) * 100 : 0;
        const isStrength = accuracy >= 70;
        return {
          topic: tag,
          total: data.total,
          correct: data.correct,
          accuracy: Math.round(accuracy),
          isStrength,
        };
      });

      breakdownList.sort((a, b) => {
        if (a.isStrength && !b.isStrength) return -1;
        if (!a.isStrength && b.isStrength) return 1;
        return b.accuracy - a.accuracy;
      });
      return breakdownList;
    };

    let message = "Keep Trying";
    let submessage = "Don't give up! Practice makes perfect!";
    let feedbackColorClass = "text-rose-500";
    if (score >= 90) {
      message = "Masterful!";
      submessage = "Outstanding! You are mastering this category!";
      feedbackColorClass = "text-emerald-500";
    } else if (score >= 70) {
      message = "Superb!";
      submessage = "Beautiful job! You've successfully cleared the 70% mastery threshold!";
      feedbackColorClass = "text-amber-400";
    } else if (score >= 50) {
      message = "Excellent!";
      submessage = "Amazing score! Keep up the brilliant work!";
      feedbackColorClass = "text-brand-500";
    }
    
    const activeSubjectName = useAppStore.getState().activeSubject?.name || "General GK";

    return createPortal(
      <div className="fixed inset-0 z-[999] bg-[var(--color-background)] h-[100dvh] w-full overflow-y-auto flex flex-col items-center justify-between p-4 md:p-6 selection:bg-brand-500/30 select-none text-[var(--text-primary)]">
        
        {/* Soft, rich ambient cosmic lights */}
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[60%] rounded-full bg-gradient-to-br from-brand-500/10 via-purple-500/5 to-transparent blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[80%] h-[60%] rounded-full bg-gradient-to-tr from-cyan-500/10 via-indigo-500/5 to-transparent blur-[120px] pointer-events-none" />

        <div className="w-full max-w-xl my-auto flex flex-col items-center gap-5.5 animate-fade-in text-center relative z-10 py-6">
          
          <div>
            <p className="text-[var(--text-secondary)] text-[10px] font-mono font-black tracking-[0.25em] uppercase mb-1.5">WELL COMPLETED</p>
            <h1 className="text-2.5xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight font-display">Performance Report</h1>
          </div>

          {/* Central Premium Card */}
          <div className="bg-[var(--color-surface)] backdrop-blur-md border border-[var(--color-border)] p-6 md:p-8 rounded-[2.25rem] w-full flex flex-col items-center gap-5.5 shadow-2xl relative overflow-hidden">
            {/* Soft inner glow reflection */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-30" />
            
            <div className="text-3.5xl animate-bounce">🎉</div>

            {/* Giant Circular Ring Progress */}
            <div className="relative flex items-center justify-center w-38 h-38">
              <div className="absolute -inset-1 rounded-full bg-indigo-500/10 blur-md opacity-40 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-[var(--color-border)]" />
              
              {/* Spinning or glowing progress indicator ring */}
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle
                  cx="76"
                  cy="76"
                  r="71"
                  className={cn(
                    "transition-all duration-1000",
                    score >= 70 ? "stroke-emerald-500" : score >= 50 ? "stroke-brand-500" : "stroke-rose-500"
                  )}
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 71}`}
                  strokeDashoffset={`${((100 - score) / 100) * (2 * Math.PI * 71)}`}
                />
              </svg>

              <div className="w-32 h-32 rounded-full bg-gradient-to-b from-[var(--color-surface-hover)] to-[var(--color-surface)] shadow-inner flex flex-col items-center justify-center border border-[var(--color-border)] scale-100 transition-transform duration-300 hover:scale-105 group/ring">
                <span className="text-3.5xl font-black font-mono tracking-tighter leading-none text-[var(--text-primary)]">
                  {score}%
                </span>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-widest mt-2 px-2.5 py-0.5 rounded-full",
                  score >= 70 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : score >= 50 ? "bg-brand-500/10 text-brand-600 dark:text-brand-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-450"
                )}>
                  {message}
                </span>
              </div>
            </div>

            {/* Results Title Area inside Card */}
            <h2 className="text-[10px] font-black text-[var(--text-secondary)] tracking-widest uppercase font-mono mt-0.5">SCORE DETAILS</h2>

            {/* Horizontal Block Grid of 3 */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {/* Total Card */}
              <div id="result-total-card" className="bg-[var(--color-surface)] border border-[var(--color-border)] p-4 rounded-2.5xl flex flex-col items-center gap-1.5 transition-all hover:bg-[var(--color-surface-hover)]">
                <div className="w-7.5 h-7.5 rounded-xl bg-sky-500/10 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                </div>
                <span className="text-xl font-black font-mono leading-none tracking-tight text-[var(--text-primary)] mt-1">
                  {questions.length}
                </span>
                <span className="text-[8.5px] font-black font-mono text-[var(--text-secondary)] uppercase tracking-widest">
                  Total
                </span>
              </div>

              {/* Correct Card */}
              <div id="result-correct-card" className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2.5xl flex flex-col items-center gap-1.5 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/20">
                <div className="w-7.5 h-7.5 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 stroke-[3]" />
                </div>
                <span className="text-xl font-black font-mono leading-none tracking-tight text-emerald-600 dark:text-emerald-400 mt-1">
                  {correctCount}
                </span>
                <span className="text-[8.5px] font-black font-mono text-emerald-600 dark:text-emerald-500/80 uppercase tracking-widest">
                  Correct
                </span>
              </div>

              {/* Wrong Card */}
              <div id="result-wrong-card" className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-2.5xl flex flex-col items-center gap-1.5 transition-all hover:bg-rose-500/10 hover:border-rose-500/20">
                <div className="w-7.5 h-7.5 rounded-xl bg-rose-500/10 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 stroke-[3]" />
                </div>
                <span className="text-xl font-black font-mono leading-none tracking-tight text-rose-600 dark:text-rose-400 mt-1">
                  {missedCount}
                </span>
                <span className="text-[8.5px] font-black font-mono text-rose-600 dark:text-rose-500/85 uppercase tracking-widest">
                  Wrong
                </span>
              </div>
            </div>

            {/* Categories Tested Group */}
            <div id="result-categories-container" className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] py-3.5 px-4 rounded-2.5xl flex flex-col gap-2 items-center text-center">
              <span className="text-[9px] font-mono font-black tracking-[0.2em] text-[var(--text-secondary)] uppercase flex items-center gap-1.5">
                📂 SUBJECT CATEGORY
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                <span className="text-xs font-extrabold text-brand-600 dark:text-indigo-300 bg-[var(--badge-bg)] px-4 py-1.5 rounded-full border border-[var(--color-border)] shadow-sm max-w-[280px] truncate">
                  {activeSubjectName}
                </span>
              </div>
            </div>

            {/* Motivational Alert Banner Callout */}
            <div id="result-quote-banner" className="w-full bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 rounded-2xl py-3 px-4 flex items-center justify-center gap-2.5 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold leading-relaxed shadow-inner">
              <span className="text-sm">📚</span>
              <span>{submessage}</span>
            </div>

          </div>

          {/* Analysis Breakdown Option */}
          <button
            id="result-breakdown-btn"
            onClick={() => {
              playSound("expand");
              setShowBreakdownModal(true);
            }}
            className="w-full bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--text-primary)] font-extrabold tracking-wider uppercase text-xs rounded-2xl py-4 flex items-center justify-center gap-2.5 border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 shadow-lg active:scale-97 transition-all cursor-pointer mt-1"
          >
            <BarChart2 className="w-4.5 h-4.5 text-[var(--color-brand-500)]" />
            <span>View Topic Breakdown Analysis</span>
          </button>

          {/* Action CTAs at bottom */}
          <div className="flex gap-4.5 w-full mt-0.5">
            <button
              id="result-home-btn"
              onClick={onHome || onComplete}
              className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-extrabold tracking-wider uppercase text-xs rounded-2.5xl py-4.5 flex items-center justify-center gap-2 flex-grow border border-[var(--color-border)] shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <span>🏠 Home</span>
            </button>
            <button
              id="result-retry-btn"
              onClick={() => {
                if (onNextTest) {
                  onNextTest();
                } else {
                  handleRestartQuiz();
                }
              }}
              className={cn(
                "text-white font-black tracking-wider uppercase text-xs rounded-2.5xl py-4.5 flex items-center justify-center gap-2 flex-grow shadow-xl active:scale-95 transition-all cursor-pointer border",
                gradients.primary
              )}
            >
              <span>{onNextTest ? "⏭️ Next Test" : "🔄 Retry Test"}</span>
            </button>
          </div>

        </div>

        {/* Topic Breakdown Modal */}
        {showBreakdownModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in text-left select-none">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[2rem] p-6 md:p-8 w-full max-w-lg shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden backdrop-blur-md">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <BarChart2 className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-[var(--text-primary)] leading-tight font-display">Performance Analysis</h2>
                    <p className="text-[var(--text-secondary)] text-xs mt-0.5">Topic-by-topic strength & weakness assessment</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    playSound("click");
                    setShowBreakdownModal(false);
                  }}
                  className="w-8 h-8 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable list of topics */}
              <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 md:pr-2 scrollbar-thin">
                
                {/* Strengths Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-mono font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    ✨ Your Strengths (70%+ Mastery)
                  </h3>
                  
                  {getTopicBreakdown().filter(t => t.isStrength).length === 0 ? (
                    <div className="text-xs text-[var(--text-secondary)] bg-[var(--color-surface-hover)]/20 border border-dashed border-[var(--color-border)] rounded-xl p-4 text-center">
                      No topics met the 70% proficiency gate yet. Keep practice tests flowing!
                    </div>
                  ) : (
                    <div className="grid gap-2.5">
                      {getTopicBreakdown().filter(t => t.isStrength).map((item, idx) => (
                        <div key={idx} className="bg-emerald-500/10 border border-emerald-500/15 rounded-xl p-3.5 space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 leading-tight block">{item.topic}</span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium tracking-wide mt-1 block">
                                Proficient • {item.correct} of {item.total} correct
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{item.accuracy}%</span>
                              <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-500/80 uppercase">MASTERED</span>
                            </div>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-emerald-500/15 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${item.accuracy}%` }} />
                          </div>
                          <p className="text-[10px] text-[var(--text-secondary)] italic">
                            Outstanding grasp of this topic! Keep reinforcing this knowledge with new questions.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weaknesses Section */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-mono font-extrabold tracking-wider text-amber-600 dark:text-amber-500 uppercase flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    ⚠️ Focus Areas (&lt;70% Mastery)
                  </h3>

                  {getTopicBreakdown().filter(t => !t.isStrength).length === 0 ? (
                    <div className="text-xs text-[var(--text-secondary)] bg-[var(--color-surface-hover)]/20 border border-dashed border-[var(--color-border)] rounded-xl p-4 text-center">
                      Exceptional job! You scored 70% or higher across all tested topics.
                    </div>
                  ) : (
                    <div className="grid gap-2.5">
                      {getTopicBreakdown().filter(t => !t.isStrength).map((item, idx) => (
                        <div key={idx} className="bg-amber-500/10 border border-amber-500/15 rounded-xl p-3.5 space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-tight block">{item.topic}</span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-500 font-medium tracking-wide mt-1 block">
                                Needs Review • {item.correct} of {item.total} correct
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-extrabold font-mono text-amber-600 dark:text-amber-400">{item.accuracy}%</span>
                              <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-500/80 uppercase">PRACTICE</span>
                            </div>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-amber-500/15 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${item.accuracy}%` }} />
                          </div>
                          <p className="text-[10px] text-[var(--text-secondary)] italic">
                            Reviewing study cards and course documentation for this chapter is highly recommended.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Footer CTA */}
              <div className="border-t border-[var(--color-border)] pt-4 shrink-0 flex gap-3">
                <button
                  onClick={() => {
                    playSound("click");
                    setShowBreakdownModal(false);
                  }}
                  className="flex-1 py-3 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] text-[var(--text-primary)] border border-[var(--color-border)] font-extrabold uppercase tracking-wider text-xs rounded-xl transition-all cursor-pointer text-center"
                >
                  Close Analysis
                </button>
              </div>

            </div>
          </div>
        )}

      </div>,
      document.body
    );
  }

  if (!question) return null;

  // Render option letter prefix (A, B, C, D)
  const getLetter = (idx: number) => ["A", "B", "C", "D"][idx] || String.fromCharCode(65 + idx);

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-[var(--color-background)] h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-between p-4 sm:p-4.5 select-none text-[var(--text-primary)]">
      
      {/* Immersive ambient cosmic glow orbs */}
      <div className="absolute -top-[15%] -left-[20%] w-[75%] h-[55%] rounded-full bg-gradient-to-br from-indigo-500/10 via-brand-500/5 to-transparent blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-[15%] -right-[20%] w-[75%] h-[55%] rounded-full bg-gradient-to-tr from-cyan-500/10 via-purple-500/5 to-transparent blur-[110px] pointer-events-none" />
      
      <div className="w-full max-w-2xl h-full flex flex-col justify-between gap-3 overflow-hidden relative z-10">
        
        {/* Header Block with micro progress, score, missed and timer */}
        <header className="flex-shrink-0 flex flex-col gap-3.5 w-full">
          <div className="flex items-center justify-between gap-2.5 mt-0.5">
            <button 
              onClick={onComplete} 
              className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] active:scale-95 rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 transition-all duration-300 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex flex-col items-center text-center max-w-[60%]">
              <span className="text-sm font-black text-[var(--text-primary)] tracking-tight truncate w-full font-display">
                {(() => {
                  if (!quizSet.name) return "Set";
                  const cleanName = quizSet.name.replace(/Challenge\s+Set/gi, "").replace(/Challenge/gi, "").replace(/\s*\([^)]*\)/g, "").trim();
                  if (/^\d+$/.test(cleanName)) {
                    return `Set ${cleanName}`;
                  }
                  return cleanName || "Set";
                })()}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mt-0.5">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettings(true);
                }} 
                className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] active:scale-95 rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 transition-all duration-300 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const targetMute = !isMuted;
                  setIsMuted(targetMute);
                  if (!targetMute) {
                    setTimeout(() => {
                      playSound("click");
                    }, 50);
                  }
                }} 
                className="w-10 h-10 flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] active:scale-95 rounded-2xl border border-[var(--color-border)] hover:border-[var(--color-brand-500)]/30 transition-all duration-300 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {isMuted ? (
                  <VolumeX className="w-4.5 h-4.5 text-[var(--text-secondary)] opacity-60" />
                ) : (
                  <Volume2 className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400" />
                )}
              </button>
            </div>
          </div>
 
          {/* Glowing Micro Progress Bar */}
          <div className="w-full h-1 bg-[var(--color-surface-hover)] rounded-full overflow-hidden p-[1px] border border-[var(--color-border)]">
            <div 
              className="h-full bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--accent-color)] transition-all duration-300 rounded-full shadow-md" 
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
 
          {/* Premium Score/Missed & Center Countdown Timer block */}
          <div className="flex items-center justify-between gap-3.5">
            
            {/* Score box */}
            <div className="flex-grow flex-1 bg-gradient-to-br from-emerald-500/5 to-[var(--color-surface)] rounded-2xl border border-emerald-500/15 py-1.5 px-3.5 flex items-center gap-2.5 shadow-lg">
              <div className="w-7.5 h-7.5 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Check className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-[8px] text-[var(--text-secondary)] tracking-widest uppercase font-black font-mono leading-none">SCORE</p>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">{correctCount}</p>
              </div>
            </div>
 
            {/* Simple & Premium countdown timer ring */}
            <div className="w-11 h-11 relative flex items-center justify-center flex-shrink-0 group/timer">
              <svg viewBox="0 0 44 44" className="w-full h-full transform -rotate-90 relative z-10">
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className="stroke-[var(--color-border)]"
                  strokeWidth="2.5"
                  fill="transparent"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  className="transition-all duration-1000"
                  style={{
                    stroke: timeLeft <= 6 ? "#ef4444" : "var(--color-brand-500)"
                  }}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${((30 - timeLeft) / 30) * (2 * Math.PI * 18)}`}
                />
              </svg>
              <span 
                className={cn(
                  "absolute z-20 font-mono text-xs font-bold leading-none flex items-center justify-center inset-0",
                  timeLeft <= 6 ? "text-rose-500" : "text-[var(--text-primary)]"
                )}
                style={timeLeft <= 6 ? {} : { color: "var(--color-brand-500)" }}
              >
                {timeLeft}
              </span>
            </div>
 
            {/* Missed box */}
            <div className="flex-grow flex-1 bg-gradient-to-br from-rose-500/5 to-[var(--color-surface)] rounded-2xl border border-rose-500/15 py-1.5 px-3.5 flex items-center gap-2.5 shadow-lg">
              <div className="w-7.5 h-7.5 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <X className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-[8px] text-[var(--text-secondary)] tracking-widest uppercase font-black font-mono leading-none">MISSED</p>
                <p className="text-sm font-black text-rose-600 dark:text-rose-400 leading-none mt-1">{missedCount}</p>
              </div>
            </div>
 
          </div>
        </header>
 
        {/* Scrollable Content Area (Toasts, Questions, Options) */}
        <div className="flex-1 min-h-0 flex flex-col gap-0 overflow-y-auto pr-0.5 py-1">
          {/* First Attempt Notification Toast */}
          {showFirstAttemptToast && (
            <div className="mx-0.5 p-3.5 bg-gradient-to-r from-[var(--color-surface)] to-[var(--color-surface-hover)] border border-[var(--color-brand-500)]/20 rounded-2xl flex items-center justify-between gap-3.5 animate-fade-in text-[var(--text-primary)] shadow-xl relative overflow-hidden shrink-0 z-50 mb-4">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--color-brand-500)] to-[var(--accent-color)]" />
              <div className="flex items-center gap-3 z-10 pl-1.5">
                <span className="text-base">✨</span>
                <div>
                  <p className="text-[10px] font-extrabold tracking-wider uppercase text-brand-300 leading-none">First Attempt</p>
                  <p className="text-[10px] text-zinc-400 mt-1.5 leading-normal">
                    This is your very first attempt at this chapter's revision questions. Best of luck!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFirstAttemptToast(false)}
                className="text-zinc-400 hover:text-white text-[9px] font-black px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer z-10 shrink-0 border border-white/5 uppercase tracking-wider font-mono"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Lifelines / Assistance Aids Bar */}
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-1 mt-3 mb-1 animate-scale-in">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              💡 Lifelines:
            </span>
            <div className="flex items-center gap-2">
              {/* Fifty Fifty Button */}
              <button
                disabled={fiftyFiftyCount <= 0 || isRevealed}
                onClick={handleFiftyFifty}
                className={cn(
                  "px-3 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95",
                  fiftyFiftyCount <= 0
                    ? "bg-zinc-500/5 text-zinc-500 border-zinc-500/10 cursor-not-allowed opacity-50"
                    : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--text-primary)] border-[var(--color-border)] hover:border-[var(--color-brand-500)]/40"
                )}
                title="Eliminate two incorrect choices"
              >
                <span>✂️</span>
                <span>50:50</span>
              </button>

              {/* AI Hint Button */}
              <button
                disabled={hintCount <= 0 || isRevealed}
                onClick={handleHint}
                className={cn(
                  "px-3 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95",
                  hintCount <= 0
                    ? "bg-zinc-500/5 text-zinc-500 border-zinc-500/10 cursor-not-allowed opacity-50"
                    : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-amber-500 border-[var(--color-border)] hover:border-amber-500/40"
                )}
                title="Get a helpful clue"
              >
                <Lightbulb className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Hint</span>
              </button>
            </div>
          </div>

          {/* Question Panel */}
          <div className="flex-shrink-0 relative mt-4 mb-9">
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-brand-500)]/5 to-[var(--accent-color)]/5 rounded-[2rem] blur-xl opacity-30 pointer-events-none" />
            <div className="bg-[var(--color-surface)] backdrop-blur-md p-5 md:p-6 rounded-[2rem] border border-[var(--color-border)] relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-30" />
              
              <h2 className={cn("text-[var(--text-primary)] font-black tracking-tight leading-relaxed font-display text-base md:text-lg", fontClass.question)}>
                <RichText text={question.question
                  .trim()
                  .replace(/^(Q|q)uestion\s*\d+[\s\.\:\-]*|^(Q|q)uestion\s*[\s\.\:\-]+\s*|^[Qq]\d+[\s\.\:\-]*|^[Qq][\.\:\-]+\s*|^\d+[\s\.\)\:\-]+\s*/g, "")
                  .trim()} />
              </h2>
            </div>
          </div>
  
          {/* Options Stack */}
          <div className="flex flex-col gap-2.5 w-full mb-6">
            {question.options.map((opt, optIdx) => {
              const isSelected = selectedOption === opt;
              const isCorrect = isOptionCorrect(opt, question.correctAnswer, question.options, optIdx);
              const showCorrect = isRevealed && isCorrect;
              const showWrong = isRevealed && isSelected && !isCorrect;
              const isEliminated = eliminatedOptions.includes(opt);
              const letter = getLetter(optIdx);
  
              return (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  disabled={isRevealed || isEliminated}
                  className={cn(
                    "w-full text-left p-3.5 rounded-2xl border transition-all duration-300 font-semibold text-xs md:text-sm flex items-center justify-between select-none group/opt",
                    isEliminated
                      ? "border-dashed border-zinc-500/10 bg-[var(--color-surface)]/20 opacity-20 cursor-not-allowed line-through text-zinc-500"
                      : !isRevealed 
                        ? "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-brand-500)]/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-[1px] active:scale-99 cursor-pointer" 
                        : showCorrect 
                          ? "border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-emerald-500/10 text-emerald-850 dark:text-emerald-100 shadow-lg cursor-default" 
                          : showWrong 
                            ? "border-rose-500/40 bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-rose-500/10 text-rose-850 dark:text-rose-100 shadow-lg cursor-default" 
                            : "border-transparent bg-[var(--color-surface)] opacity-40 text-[var(--text-secondary)] cursor-default"
                  )}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs border transition-all duration-300 flex-shrink-0",
                      isEliminated
                        ? "bg-zinc-500/5 text-zinc-500/40 border-zinc-500/10"
                        : !isRevealed 
                          ? "bg-[var(--color-surface-hover)] text-[var(--text-secondary)] border-[var(--color-border)] group-hover/opt:border-[var(--color-brand-500)]/25 group-hover/opt:text-[var(--color-brand-500)] group-hover/opt:bg-[var(--color-brand-500)]/10" 
                          : showCorrect 
                            ? "bg-emerald-500 text-white border-emerald-400 shadow-md" 
                            : showWrong 
                              ? "bg-rose-500 text-white border-rose-400 shadow-md" 
                              : "bg-[var(--color-surface)] text-[var(--text-secondary)] opacity-50 border-[var(--color-border)]"
                    )}>
                      {letter}
                    </div>
                    <span className={cn(
                      "font-semibold leading-snug flex-1 min-w-0 transition-colors", 
                      isEliminated ? "text-zinc-500/40 line-through" : "text-[var(--text-primary)]",
                      fontClass.option
                    )}>
                      <RichText text={opt} />
                    </span>
                  </div>
                  
                  {/* Visual result emblems inside option cards */}
                  {showCorrect && (
                    <div className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center flex-shrink-0 animate-scale-in ml-2 shadow-md">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                  {showWrong && (
                    <div className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center flex-shrink-0 animate-scale-in ml-2 shadow-md">
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
  
        {/* Action button container at the bottom */}
        {isRevealed && (
          <div className="mt-2 mb-1.5 flex gap-3 w-full flex-shrink-0 animate-scale-in">
            <button
              onClick={() => setShowAnalysis(true)}
              className={cn(
                "flex-1 py-3.5 px-4 rounded-2xl font-extrabold text-[10px] md:text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-97 border",
                gradients.secondary
              )}
            >
              <Sparkles className="w-4 h-4 text-current" />
              <span>AI Analysis</span>
            </button>
 
            <button
              onClick={handleNext}
              className={cn(
                "py-3.5 rounded-2xl text-white font-black tracking-wider uppercase text-xs md:text-sm flex items-center justify-center gap-2 transition-all hover:opacity-95 active:scale-97 shadow-xl cursor-pointer flex-[1.6] border",
                gradients.primary
              )}
            >
              <span>{currentIndex === questions.length - 1 ? "Complete Quiz" : "Next"}</span>
              <span className="text-sm">➔</span>
            </button>
          </div>
        )}
  
      </div>
 
      {/* Pop-up AI Analysis Modal when requested */}
      {showAnalysis && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in text-left">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-5 w-full max-w-lg shadow-2xl relative max-h-[82vh] flex flex-col justify-between backdrop-blur-md">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5 mb-3.5">
              <div className="flex items-center gap-2 text-purple-500 dark:text-purple-400">
                <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                <span className="text-xs font-extrabold font-mono uppercase tracking-wider">AI Analysis & Explanation</span>
              </div>
              <button 
                onClick={() => setShowAnalysis(false)}
                className="w-7 h-7 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:text-[var(--text-primary)] text-[var(--text-secondary)] flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
 
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 text-[var(--text-primary)]">
              <div className="bg-[var(--color-background)] p-3.5 rounded-xl border border-[var(--color-border)]">
                <p className="text-[10px] uppercase text-[var(--text-secondary)] tracking-wider font-bold mb-1">Question:</p>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  <RichText text={question.question} />
                </p>
              </div>
 
              <div className="bg-emerald-500/5 p-3.5 rounded-xl border border-emerald-500/10">
                <p className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 tracking-wider font-bold mb-1">Correct Answer:</p>
                <p className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                  <RichText text={question.correctAnswer} />
                </p>
              </div>
 
              <div>
                <p className="text-[10px] uppercase text-purple-600 dark:text-purple-400 tracking-wider font-bold mb-1">Explanation:</p>
                <p className={`font-medium text-[var(--text-primary)] leading-relaxed bg-[var(--color-surface-hover)] p-3.5 rounded-xl border border-[var(--color-border)] ${fontClass.explanation}`}>
                  <RichText text={question.explanation} />
                </p>
              </div>
              
              {question.sourceReference && (
                <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5 bg-[var(--color-surface-hover)] px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] w-fit">
                  <span className="font-bold text-[#3BE4D3]">EVIDENCE:</span> {question.sourceReference}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-4 pt-2.5 border-t border-[var(--color-border)] flex justify-end">
              <button
                onClick={() => setShowAnalysis(false)}
                className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Pop-up Celebration Modal when requested (Answers 10 or more correctly out of 15 / score >= 10 correct overall) */}
      {showCelebrationModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in text-left select-none">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[2rem] p-6 md:p-10 w-full max-w-sm shadow-2xl relative flex flex-col items-center gap-5 overflow-hidden backdrop-blur-md">
            {/* Ambient golden aura background */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl animate-pulse"></div>

            {/* Glowing Medal Icon Badge */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-300 via-amber-500 to-orange-600 p-0.5 shadow-lg shadow-amber-500/20">
              <div className="w-full h-full rounded-full bg-[var(--color-background)] flex items-center justify-center">
                <Trophy className="w-10 h-10 text-yellow-400 animate-bounce" />
              </div>
            </div>

            {/* Custom typography matched with dynamic layouts */}
            <div className="space-y-2 mt-2">
              <p className="text-[10px] font-mono font-extrabold tracking-[0.3em] text-[#FFD700] uppercase">SUPER SCHOLAR</p>
              <h2 className="text-2xl font-extrabold text-[var(--text-primary)] leading-tight font-display">Incredible Score!</h2>
              <p className="text-[var(--text-secondary)] text-xs leading-relaxed max-w-xs mx-auto">
                Amazing dedication! You answered {correctCount} questions correctly out of {questions.length} ({Math.round((correctCount / questions.length) * 100)}%). Your academic depth is remarkable!
              </p>
            </div>

            {/* Score display card */}
            <div className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] py-4 px-6 rounded-2xl w-full grid grid-cols-2 divide-x divide-[var(--color-border)] mt-2">
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-extrabold">Correct</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{correctCount} / {questions.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-extrabold">XP Gained</p>
                <p className="text-lg font-mono font-bold text-amber-400 mt-1">+{correctCount * 15} XP</p>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={async () => {
                setShowCelebrationModal(false);
                await finalizeQuiz();
              }}
              className="w-full py-3.5 mt-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white font-extrabold uppercase tracking-wider text-xs rounded-xl shadow-lg hover:shadow-amber-500/10 transition-all cursor-pointer active-glow hover:scale-[1.01]"
            >
              Claim Rewards & Finish ➔
            </button>
          </div>
        </div>
      )}

      {/* Clue/Hint Dialog */}
      {showHintDialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in text-left">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-5 w-full max-w-sm shadow-2xl relative flex flex-col justify-between backdrop-blur-md">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5 mb-3.5">
              <div className="flex items-center gap-2 text-amber-500">
                <Lightbulb className="w-5 h-5 text-amber-500 animate-pulse" />
                <span className="text-xs font-extrabold font-mono uppercase tracking-wider">AI Clue / Hint</span>
              </div>
              <button 
                onClick={() => setShowHintDialog(false)}
                className="w-7 h-7 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:text-[var(--text-primary)] text-[var(--text-secondary)] flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3.5 text-[var(--text-primary)]">
              <div className="bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10 text-xs leading-relaxed text-[var(--text-secondary)]">
                <p className="font-bold text-amber-500 mb-2">Here's a gentle clue to point you in the right direction:</p>
                <p className="italic text-[var(--text-primary)] font-medium">
                  "{(() => {
                    const exp = question.explanation || "";
                    // Get first sentence or first 120 chars
                    const sentenceEnd = exp.indexOf('.');
                    if (sentenceEnd > 15 && sentenceEnd < 150) {
                      return exp.substring(0, sentenceEnd + 1);
                    }
                    return exp.length > 120 ? exp.substring(0, 120) + "..." : exp;
                  })()}"
                </p>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono text-center">
                (Use your intuition and the clues provided to choose the best option!)
              </p>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-2.5 border-t border-[var(--color-border)] flex justify-end">
              <button
                onClick={() => setShowHintDialog(false)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-extrabold text-[10px] uppercase tracking-wider transition-colors cursor-pointer shadow-md"
              >
                Got it
              </button>
            </div>

          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>,
    document.body
  );
}
