import { useState, useRef } from "react";
import { useAppStore } from "../store";
import { useAudio } from "../hooks/useAudio";
import * as Icons from "lucide-react";
import { cn } from "../lib/utils";
import { generateId } from "../lib/id";
import { areChaptersSimilar } from "../lib/similarity";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceLine,
  LineChart,
  Line
} from "recharts";

export function Dashboard() {
  const { subjects, setActiveSubject, userStats, addDocument, updateStats, uploadDocument, isUploading, uploadError, uploadQuotaNotice } = useAppStore();
  const { playSound, playSuccessDing } = useAudio();
  const playAppSound = (type: "correct" | "wrong" | "complete" | "tick" | "click" | "expand" | "reset") => {
    playSound(type);
  };
  const [chartMode, setChartMode] = useState<"score" | "xp">("score");
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [insightsTab, setInsightsTab] = useState<"subjects" | "7day" | "overall">("subjects");
  const [boostedSubjects, setBoostedSubjects] = useState<string[]>([]);
  const [boostNotification, setBoostNotification] = useState<{message: string; subjectId: string} | null>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    playAppSound("click");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const targetSubjectId = selectedSubjectId || subjects[0]?.id;
    if (!targetSubjectId) {
      alert("No category selected.");
      return;
    }
    
    // Start background upload via the store
    uploadDocument(file, targetSubjectId).catch((err) => console.error(err));
    
    // Clear input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getIcon = (name: string) => {
    const Icon = (Icons as any)[name] || Icons.Book;
    return <Icon className="w-6 h-6" />;
  };

  // Extract attempts or fallback to empty array
  const attempts = userStats?.attempts || [];

  const getLast7DaysPractice = () => {
    const getLocalDateString = (timestamp: number): string => {
      const date = new Date(timestamp);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const practicedDates = new Set(attempts.map(att => getLocalDateString(att.playedAt)));
    const result = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d.getTime());
      const isToday = i === 0;
      const isPracticed = practicedDates.has(dateStr);
      
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }); // e.g. "Mon"
      const dayLetter = dayLabel.charAt(0);

      result.push({
        dateStr,
        dayLabel,
        dayLetter,
        isToday,
        isPracticed
      });
    }
    return result;
  };

  // Sort attempts sequentially by timestamp to draw logical progress pathways
  const sortedAttempts = [...attempts].sort((a, b) => a.playedAt - b.playedAt);

  // Parse stats
  const averageScore = attempts.length > 0 
    ? Math.round(attempts.reduce((acc, curr) => acc + curr.score, 0) / attempts.length)
    : 0;
  
  const bestScore = attempts.length > 0 
    ? Math.max(...attempts.map(a => a.score))
    : 0;

  const totalXPSeeded = attempts.length * 15; // or matching current correct counts

  // Formatting date for graph labels
  const formatXAxisDate = (playedAt: number) => {
    const date = new Date(playedAt);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Custom polished Tooltip Component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 p-3 w-56 rounded-2xl shadow-xl space-y-1 text-zinc-800 dark:text-zinc-100">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {new Date(data.playedAt).toLocaleDateString(undefined, { 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </p>
          <p className="font-bold text-xs line-clamp-1 leading-normal text-zinc-900 dark:text-zinc-100">
            {data.chapterTitle || "Quick Assessment"}
          </p>
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/50 mt-1.5 flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Score achieved:</span>
            <span className="font-mono font-bold text-emerald-500">{data.score}%</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>Correct Answers:</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-200">
              {data.correctCount} / {data.totalQuestions}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>XP earned:</span>
            <span className="font-bold text-brand-500">
              +{data.correctCount * 15} XP
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const get7DayAccuracyTrend = () => {
    const getLocalDateString = (timestamp: number): string => {
      const date = new Date(timestamp);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    // Group attempts by date string
    const dailyScores: { [date: string]: number[] } = {};
    attempts.forEach((att) => {
      const dateStr = getLocalDateString(att.playedAt);
      if (!dailyScores[dateStr]) {
        dailyScores[dateStr] = [];
      }
      dailyScores[dateStr].push(att.score);
    });

    const result = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const dateStr = getLocalDateString(targetDate.getTime());
      
      const scores = dailyScores[dateStr] || [];
      const accuracy = scores.length > 0
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0;
        
      const dayLabel = targetDate.toLocaleDateString("en-US", { weekday: "short" });
      const dateLabel = targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      result.push({
        dayName: `${dayLabel} (${dateLabel})`,
        dayLabel,
        dateLabel,
        accuracy,
        hasActivity: scores.length > 0,
        quizzesTaken: scores.length
      });
    }
    return result;
  };

  const TrendTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 p-3 w-52 rounded-2xl shadow-xl space-y-1.5 text-zinc-800 dark:text-zinc-100">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/20 pb-1.5 mb-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {data.dayName}
            </span>
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded-full font-sans uppercase",
              data.hasActivity 
                ? "bg-amber-500/10 text-amber-400" 
                : "bg-zinc-800 text-zinc-500"
            )}>
              {data.hasActivity ? "Active" : "Idle"}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-xs font-sans">
            <span className="text-zinc-500 dark:text-zinc-400">Day's Average:</span>
            <span className="font-mono font-bold text-amber-500">
              {data.hasActivity ? `${data.accuracy}%` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Quizzes completed:</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {data.quizzesTaken}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      
      {/* Gamification Header */}
      <section className="glass-card rounded-3xl p-6 md:p-8 flex flex-col lg:flex-row items-stretch gap-6 justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        
        {/* Left Column: Rank */}
        <div className="flex items-center gap-6 z-10 w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-white/5 pb-4 lg:pb-0 lg:pr-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shrink-0">
            <div className="w-full h-full bg-background rounded-[14px] flex items-center justify-center p-2">
              <Icons.Shield className="w-full h-full text-indigo-400" />
            </div>
          </div>
          <div>
            <h2 className="text-zinc-400 font-medium tracking-wide uppercase text-xs mb-1">Current Rank</h2>
            <div className="text-3xl font-bold font-display premium-gradient">{userStats?.level || "Beginner"}</div>
            <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{userStats?.totalCorrect || 0} Questions Mastered</span>
            </div>
          </div>
        </div>

        {/* Middle Column: Daily Study Streak Tracker */}
        <div className="flex flex-col justify-center gap-2.5 z-10 w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-white/5 pb-4 lg:pb-0 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-md animate-pulse"></div>
              <Icons.Flame className="w-8 h-8 text-amber-500 fill-amber-500 relative z-10 animate-bounce" />
            </div>
            <div>
              <h2 className="text-zinc-400 font-medium tracking-wide uppercase text-xs mb-0.5">Study Streak</h2>
              <div className="text-2xl font-extrabold text-zinc-900 dark:text-white font-mono flex items-baseline gap-1.5">
                {userStats?.streak || 0} 
                <span className="text-xs font-sans font-semibold text-zinc-500 dark:text-zinc-400">consecutive days</span>
              </div>
            </div>
          </div>
          
          {/* Last 7 Days Mini Calendar Tracker */}
          <div className="flex items-center justify-between gap-1 mt-1 bg-zinc-50/50 dark:bg-white/[0.02] border border-zinc-200/50 dark:border-white/5 rounded-xl p-2 md:p-2.5">
            {getLast7DaysPractice().map((day, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[9px] font-mono font-medium text-zinc-500 uppercase">{day.dayLabel.substring(0, 2)}</span>
                <div 
                  className={cn(
                    "w-6.5 h-6.5 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono transition-all relative select-none",
                    day.isPracticed 
                      ? "bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]" 
                      : day.isToday 
                        ? "border border-dashed border-brand-500/40 text-brand-500 dark:text-brand-400 animate-pulse" 
                        : "bg-zinc-100 dark:bg-zinc-800/40 text-zinc-450 dark:text-zinc-500 border border-zinc-200/50 dark:border-transparent"
                  )}
                  title={day.isPracticed ? `Practiced on ${day.dayLabel}` : `No practice on ${day.dayLabel}`}
                >
                  {day.isPracticed ? (
                    <Icons.Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  ) : (
                    day.dayLabel.substring(0, 1)
                  )}
                  {day.isToday && !day.isPracticed && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-500 animate-ping" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Level Progress */}
        <div className="flex flex-col justify-center z-10 w-full lg:w-1/3 lg:pl-6 mt-4 lg:mt-0">
          {(() => {
            const xp = userStats?.xp || 0;
            let currentLevelMin = 0;
            let nextLevelXp = 300;
            if (xp >= 5000) {
              currentLevelMin = 5000;
              nextLevelXp = 5000; // Max level
            } else if (xp >= 2500) {
              currentLevelMin = 2500;
              nextLevelXp = 5000;
            } else if (xp >= 1000) {
              currentLevelMin = 1000;
              nextLevelXp = 2500;
            } else if (xp >= 300) {
              currentLevelMin = 300;
              nextLevelXp = 1000;
            }

            const isMaxLevel = xp >= 5000;
            const progressRange = isMaxLevel ? 1 : nextLevelXp - currentLevelMin;
            const currentProgress = isMaxLevel ? 1 : xp - currentLevelMin;
            const progressPercent = Math.min(100, Math.max(0, (currentProgress / progressRange) * 100));

            return (
              <>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {isMaxLevel ? "Max Rank" : "Next Rank"}
                  </span>
                  <span className="text-brand-500 font-bold">
                    {isMaxLevel ? "MAX" : `${nextLevelXp} XP`}
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 rounded-full transition-all duration-1000"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-500 mt-2">
                  <span>Level Progress</span>
                  <span>
                    {isMaxLevel ? `${xp} XP` : `${xp} / ${nextLevelXp} XP`}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* Analytics & Statistical Trend Visualizations */}
      {subjects.length > 0 && (
        <section className="glass-card rounded-3xl overflow-hidden relative transition-all text-left">
          <button 
            type="button"
            onClick={() => {
              playAppSound('expand');
              setIsInsightsOpen(!isInsightsOpen);
            }}
            className="w-full text-left p-5 md:p-6 flex items-center justify-between hover:bg-black/[0.01] dark:hover:bg-white/[0.02] active:bg-black/[0.02] dark:active:bg-white/[0.04] transition-all cursor-pointer focus:outline-none relative z-10"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-500/10 dark:bg-brand-500/15 text-brand-500 dark:text-brand-400 rounded-xl border border-brand-500/10 dark:border-brand-500/25">
                <Icons.TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-white flex items-center gap-2">
                  Performance Insights
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Visualizing scores, subject mastery metrics, and active curriculum trends.
                </p>
              </div>
            </div>
            
            <div className="p-2 bg-zinc-100 dark:bg-surface/60 rounded-full border border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all">
              {isInsightsOpen ? (
                <Icons.ChevronUp className="w-4 h-4" />
              ) : (
                <Icons.ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {isInsightsOpen && (
            <div className="p-5 md:p-6 border-t border-border bg-surface-hover/30 dark:bg-surface/10 space-y-6 relative z-10 animate-fade-in">
              
              {/* Boost notification banner inside card */}
              {boostNotification && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-3 rounded-2xl flex items-center gap-2.5 animate-bounce">
                  <Icons.Sparkles className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                  <p className="font-semibold leading-normal">{boostNotification.message}</p>
                </div>
              )}

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {insightsTab === "subjects" && "Syllabus subject-wise mastery analysis, course completions, and XP towers."}
                  {insightsTab === "7day" && "Tracking daily average scoring proficiency across all topics over the last 7 days."}
                  {insightsTab === "overall" && "Sequential logs plotting correctness percentages and progress increments details."}
                </p>

                {/* Segment Toggles */}
                <div className="flex p-0.5 bg-zinc-150 dark:bg-zinc-950 rounded-2xl border border-zinc-250/30 dark:border-white/5 shrink-0 self-stretch sm:self-auto overflow-x-auto hide-scrollbar">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playAppSound("click");
                      setInsightsTab("subjects");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      insightsTab === "subjects"
                        ? "bg-brand-500 text-white shadow-md font-extrabold"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-205"
                    )}
                  >
                    <Icons.BookOpen className="w-3.5 h-3.5 shrink-0" />
                    Subject Mastery
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playAppSound("click");
                      setInsightsTab("7day");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      insightsTab === "7day"
                        ? "bg-brand-500 text-white shadow-md font-extrabold"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-205"
                    )}
                  >
                    <Icons.Calendar className="w-3.5 h-3.5 shrink-0" />
                    7-Day Trend
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playAppSound("click");
                      setInsightsTab("overall");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      insightsTab === "overall"
                        ? "bg-brand-500 text-white shadow-md font-extrabold"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-205"
                    )}
                  >
                    <Icons.LineChart className="w-3.5 h-3.5 shrink-0" />
                    Overall Logs
                  </button>
                </div>
              </div>

              {/* Content Tab 1: Subject-Wise Progress & Interactive XP Towers */}
              {insightsTab === "subjects" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
                  {subjects.map((subject) => {
                    // Filter quiz attempts mapping safely onto this subject
                    const getSubjectForAttempt = (att: any) => {
                      for (const sub of subjects) {
                        for (const doc of sub.documents) {
                          if (doc.chapters.some((ch) => ch.id === att.chapterId)) {
                             return sub;
                          }
                        }
                      }
                      const titleLower = (att.chapterTitle || "").toLowerCase();
                      const subNameLower = subject.name.toLowerCase();
                      if (subNameLower.split(" ").some((w) => w.length > 3 && titleLower.includes(w))) {
                        return subject;
                      }
                      return subjects[0] || null;
                    };

                    const attemptsForSubject = attempts.filter(att => getSubjectForAttempt(att)?.id === subject.id);
                    
                    // 4 Metric points
                    const avgScore = attemptsForSubject.length > 0
                      ? Math.round(attemptsForSubject.reduce((acc, curr) => acc + curr.score, 0) / attemptsForSubject.length)
                      : 0;
                    
                    const acidScore = attemptsForSubject.length > 0
                      ? Math.round((attemptsForSubject.filter(a => a.score >= 90).length / attemptsForSubject.length) * 100)
                      : 0;
                    
                    const totalQuizzes = attemptsForSubject.length;
                    
                    let performStatus = "Unassessed";
                    let performColor = "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
                    if (totalQuizzes > 0) {
                      if (avgScore >= 90) {
                        performStatus = "Elite (90%+)";
                        performColor = "text-amber-500 bg-amber-500/10 border-amber-500/20";
                      } else if (avgScore >= 70) {
                        performStatus = "Proficient";
                        performColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
                      } else if (avgScore >= 45) {
                        performStatus = "Developing";
                        performColor = "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
                      } else {
                        performStatus = "Needs Review";
                        performColor = "text-red-400 bg-red-400/10 border-red-500/20";
                      }
                    }

                    // Show progress
                    let totalChapters = 0;
                    if (subject.documents) {
                      const uniqueChaps: string[] = [];
                      subject.documents.forEach(d => {
                        d.chapters?.forEach(c => {
                          const exists = uniqueChaps.some(existing => areChaptersSimilar(existing, c.title));
                          if (!exists) {
                            uniqueChaps.push(c.title);
                          }
                        });
                      });
                      totalChapters = uniqueChaps.length;
                    }
                    const testedChapters = new Set(attemptsForSubject.map(a => a.chapterId)).size;
                    const progressPercent = totalChapters > 0 ? Math.round((testedChapters / totalChapters) * 100) : 0;

                    // Separate tower variables for XP increment
                    const subjectXp = attemptsForSubject.reduce((sum, a) => sum + (a.correctCount * 15), 0);
                    const isBoosted = boostedSubjects.includes(subject.id);

                    // Subject styled theme circles
                    const getSubjectIconBg = (name: string) => {
                      const n = name.toLowerCase();
                      if (n.includes("haryana") || n.includes("gk") || n.includes("cet")) return "bg-sky-500/10 text-sky-400 border-sky-500/20";
                      if (n.includes("geography")) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                      if (n.includes("history")) return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
                      if (n.includes("economics")) return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
                      return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
                    };

                    return (
                      <div 
                        key={subject.id}
                        className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-white/5 rounded-3xl p-5 flex flex-col md:flex-row gap-5 items-stretch justify-between relative overflow-hidden text-left"
                      >
                        {/* Subtle card status background accent */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

                        {/* Left section: Detail & Progress meters */}
                        <div className="flex-1 flex flex-col justify-between space-y-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", getSubjectIconBg(subject.name))}>
                                {getIcon(subject.icon)}
                              </div>
                              <div>
                                <h4 className="font-extrabold text-zinc-900 dark:text-[#F3F4F6] text-sm leading-tight tracking-tight">{subject.name}</h4>
                                <span className={cn("text-[8.5px] uppercase tracking-wider font-bold block mt-1 px-2 py-0.5 rounded-full border w-fit leading-none font-mono", performColor)}>
                                  {performStatus}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-400 line-clamp-1">{subject.description || "Course study modules & practice materials."}</p>
                          </div>

                          {/* Show progress slider */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                              <span>Subject Progress:</span>
                              <span className="font-bold text-zinc-650 dark:text-zinc-300">
                                {testedChapters}/{totalChapters} Chapters ({progressPercent}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-200/60 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-100 dark:border-white/[0.03]">
                              <div 
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500" 
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Detailed analytical parameters */}
                          <div className="grid grid-cols-2 gap-2.5 bg-zinc-100/50 dark:bg-black/20 p-3 rounded-2xl border border-zinc-200/30 dark:border-white/[0.02]">
                            <div>
                              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block font-mono">Average</span>
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 font-mono mt-0.5 block">
                                {totalQuizzes > 0 ? `${avgScore}%` : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block font-mono">Acid (Peak)</span>
                              <span className="text-xs font-bold text-[#f59e0b] font-mono mt-0.5 block">
                                {totalQuizzes > 0 ? `${acidScore}%` : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block font-mono">Total Taken</span>
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 font-mono mt-0.5 block">
                                {totalQuizzes} / {totalChapters * 2}+ Quizzes
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block font-mono">Perform Gate</span>
                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 font-mono mt-0.5 block">
                                {totalQuizzes > 0 ? (avgScore >= 70 ? "MASTERED" : "PRACTICE") : "IDLE"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right section: Elegant XP Tower Column */}
                        <div className="flex flex-col items-center justify-center shrink-0 border-t md:border-t-0 md:border-l border-zinc-150 dark:border-white/5 pt-4 md:pt-0 md:pl-5 space-y-2.5 min-w-[100px]">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-bold tracking-widest text-[#9ca3af] uppercase font-mono mb-1">XP TOWER</span>
                            
                            {/* Pillar cylinder */}
                            <div className="w-12 h-24 bg-zinc-100 dark:bg-zinc-950/85 rounded-2xl border border-zinc-200/50 dark:border-white/10 p-1 flex flex-col justify-end overflow-hidden shadow-inner relative">
                              {/* Filled charging cell */}
                              <div 
                                className="w-full rounded-xl bg-gradient-to-t from-violet-600 via-indigo-500 to-brand-500 transition-all duration-750 ease-out"
                                style={{ height: `${Math.min((subjectXp / 500) * 100 || 5, 100)}%` }}
                              />
                              
                              {/* Abs text center overlay overlay */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none select-none">
                                <span className="text-xs font-mono font-black text-zinc-900 dark:text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)]">
                                  {subjectXp}
                                </span>
                                <span className="text-[7px] font-mono tracking-wider font-extrabold text-zinc-500 dark:text-white/85 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.85)] uppercase">
                                  XP
                                </span>
                              </div>
                            </div>
                            <span className="text-[8px] font-mono text-zinc-400 dark:text-zinc-500 mt-1">Goal: 500</span>
                          </div>

                          {/* Interactive fast track booster selector */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (isBoosted) return;
                              playSuccessDing();
                              setBoostedSubjects([...boostedSubjects, subject.id]);
                              const base = userStats?.xp || 0;
                              await updateStats({ xp: base + 50 });
                              setBoostNotification({
                                message: `🚀 XP Boost Successful! Earned +50 XP on your ${subject.name} curriculum.`,
                                subjectId: subject.id
                              });
                              setTimeout(() => {
                                setBoostNotification(null);
                              }, 4500);
                            }}
                            disabled={isBoosted}
                            className={cn(
                              "w-full text-[9px] font-bold font-mono py-1.5 px-2.5 rounded-xl border transition-all duration-150 uppercase tracking-wider cursor-pointer",
                              isBoosted 
                                ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-505/20 cursor-default"
                                : "bg-brand-500/15 text-brand-505 dark:text-brand-400 border-brand-500/20 hover:bg-brand-500/30 active:scale-95 shadow-md"
                            )}
                          >
                            {isBoosted ? "Claimed" : "Boost +50 XP"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Content Tab 2: Last 7 Days Accuracy Trend */}
              {insightsTab === "7day" && (
                <div className="space-y-4 animate-fade-in text-left">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-950/25 p-4 rounded-3xl border border-zinc-250/30 dark:border-white/5">
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 font-display">7-Day Scoring Performance</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">Continuous evaluation gate assessing your overall curriculum readiness indexes.</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                      <span className="text-[10px] font-mono uppercase text-[#9ca3af]">Streak: </span>
                      <span className="text-xs font-black font-mono text-amber-500">
                        {userStats?.streak || 0} Days
                      </span>
                    </div>
                  </div>

                  {/* Accuracy Trend Recharts container */}
                  <div className="h-60 w-full text-zinc-400 select-none pb-1 relative z-10 bg-zinc-50 dark:bg-zinc-950/15 border border-zinc-200 dark:border-white/[0.02] p-4 rounded-3xl">
                    <ResponsiveContainer width="99%" height="100%">
                      <AreaChart
                        data={get7DayAccuracyTrend()}
                        margin={{ top: 10, right: 10, left: -24, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorMerged7D" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.24}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 120, 120, 0.07)" vertical={false} />
                        <XAxis 
                          dataKey="dayLabel" 
                          stroke="rgba(120, 120, 120, 0.4)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          dy={8}
                          fontFamily="Fira Code, monospace"
                        />
                        <YAxis 
                          stroke="rgba(120, 120, 120, 0.4)" 
                          fontSize={10}
                          tickFormatter={(v) => `${v}%`}
                          domain={[0, 100]}
                          tickLine={false}
                          axisLine={false}
                          dx={-4}
                          fontFamily="Fira Code, monospace"
                        />
                        <Tooltip content={<TrendTooltip />} />
                        <ReferenceLine y={70} stroke="rgba(245, 158, 11, 0.15)" strokeDasharray="3 3" label={{ value: "Gate (70%)", fill: "rgba(245, 158, 11, 0.4)", fontSize: 8, position: "insideBottomRight", dy: -4 }} />
                        <Area 
                          type="monotone" 
                          dataKey="accuracy" 
                          stroke="#f59e0b" 
                          strokeWidth={2.5}
                          fillOpacity={1} 
                          fill="url(#colorMerged7D)"
                          activeDot={{ r: 6, strokeWidth: 0, fill: "#f59e0b" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>

                    {/* Fallback empty view overlay */}
                    {attempts.length === 0 && (
                      <div className="absolute inset-0 bg-zinc-50/80 dark:bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-3xl p-4 text-center select-none">
                        <Icons.Calendar className="w-10 h-10 text-zinc-500 mb-2" />
                        <h4 className="text-zinc-900 dark:text-zinc-205 font-bold text-sm">No activity recorded this week</h4>
                        <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
                          Your daily average performance will render dynamically here once you trigger study cards or practice quizzes!
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Tab 3: Detailed Chronological Logs */}
              {insightsTab === "overall" && (
                <div className="space-y-4 animate-fade-in text-left font-sans">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100 font-display">Chronological Pathway</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">Tracking chronological score progress across all subjects over your lifetime activity logs.</p>
                    </div>
                    {/* Segment Controls */}
                    <div className="flex p-0.5 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-250/30 dark:border-white/5 self-end sm:self-auto shrink-0 leading-none">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playAppSound("click");
                          setChartMode("score");
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer",
                          chartMode === "score"
                            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm font-semibold"
                            : "text-zinc-400 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                        )}
                      >
                        Accuracy (%)
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playAppSound("click");
                          setChartMode("xp");
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer",
                          chartMode === "xp"
                            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm font-semibold"
                            : "text-zinc-400 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300"
                        )}
                      >
                        XP Increments
                      </button>
                    </div>
                  </div>

                  {/* Quick Overview Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-zinc-50 dark:bg-white/[0.015] border border-zinc-150 dark:border-white/5 p-3 rounded-2xl flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Averages</span>
                      <span className="text-lg font-bold text-zinc-850 dark:text-zinc-100 mt-1 font-mono">{averageScore}%</span>
                      <span className="text-[9px] text-zinc-500 mt-0.5">Average Accuracy</span>
                    </div>
                    
                    <div className="bg-zinc-50 dark:bg-white/[0.015] border border-zinc-150 dark:border-white/5 p-3 rounded-2xl flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Apex Perform</span>
                      <span className="text-lg font-bold text-emerald-500 mt-1 font-mono">{bestScore}%</span>
                      <span className="text-[9px] text-zinc-500 mt-0.5 font-sans">Highest Score</span>
                    </div>

                    <div className="bg-zinc-50 dark:bg-white/[0.015] border border-zinc-150 dark:border-white/5 p-3 rounded-2xl flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Assessed</span>
                      <span className="text-lg font-bold text-zinc-850 dark:text-zinc-100 mt-1 font-mono">{attempts.length}</span>
                      <span className="text-[9px] text-zinc-500 mt-0.5 font-sans">Total attempts</span>
                    </div>

                    <div className="bg-zinc-50 dark:bg-white/[0.015] border border-zinc-150 dark:border-white/5 p-3 rounded-2xl flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Total XP</span>
                      <span className="text-lg font-bold text-brand-500 mt-1 font-mono">{userStats?.xp || 0}</span>
                      <span className="text-[9px] text-zinc-500 mt-0.5 font-sans">Life overall</span>
                    </div>
                  </div>

                  {/* Core Recharts Canvas */}
                  <div className="h-64 w-full text-zinc-400 select-none pb-1 relative z-10 bg-zinc-50 dark:bg-zinc-950/15 p-4 border border-zinc-150 dark:border-white/[0.02] rounded-3xl">
                    <ResponsiveContainer width="99%" height="100%">
                      {chartMode === "score" ? (
                         <AreaChart
                           data={sortedAttempts}
                           margin={{ top: 10, right: 10, left: -24, bottom: 0 }}
                         >
                           <defs>
                             <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                               <stop offset="5%" stopColor="var(--color-brand-500)" stopOpacity={0.24}/>
                               <stop offset="95%" stopColor="var(--color-brand-500)" stopOpacity={0.0}/>
                             </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 120, 120, 0.07)" vertical={false} />
                           <XAxis 
                             dataKey="playedAt" 
                             tickFormatter={formatXAxisDate}
                             stroke="rgba(120, 120, 120, 0.4)"
                             fontSize={9}
                             tickLine={false}
                             axisLine={false}
                             dy={8}
                             fontFamily="Fira Code, monospace"
                           />
                           <YAxis 
                             stroke="rgba(120, 120, 120, 0.4)" 
                             fontSize={9}
                             tickFormatter={(v) => `${v}%`}
                             domain={[0, 100]}
                             tickLine={false}
                             axisLine={false}
                             dx={-4}
                             fontFamily="Fira Code, monospace"
                           />
                           <Tooltip content={<CustomTooltip />} />
                           <ReferenceLine y={80} stroke="rgba(16, 185, 129, 0.2)" strokeDasharray="3 3" />
                           <Area 
                             type="monotone" 
                             dataKey="score" 
                             stroke="var(--color-brand-500)" 
                             strokeWidth={2.5}
                             fillOpacity={1} 
                             fill="url(#colorScore)"
                             activeDot={{ r: 6, strokeWidth: 0, fill: "var(--color-brand-500)" }}
                           />
                         </AreaChart>
                      ) : (
                         <BarChart
                           data={sortedAttempts}
                           margin={{ top: 10, right: 10, left: -24, bottom: 0 }}
                           barSize={18}
                         >
                           <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 120, 120, 0.07)" vertical={false} />
                           <XAxis 
                             dataKey="playedAt" 
                             tickFormatter={formatXAxisDate}
                             stroke="rgba(120, 120, 120, 0.4)"
                             fontSize={9}
                             tickLine={false}
                             axisLine={false}
                             dy={8}
                             fontFamily="Fira Code, monospace"
                           />
                           <YAxis 
                             stroke="rgba(120, 120, 120, 0.4)" 
                             fontSize={9}
                             tickFormatter={(v) => `+${v}`}
                             tickLine={false}
                             axisLine={false}
                             dx={-4}
                             fontFamily="Fira Code, monospace"
                           />
                           <Tooltip content={<CustomTooltip />} />
                           <Bar 
                             dataKey={(raw) => raw.correctCount * 15} 
                             fill="var(--accent-color, #a855f7)" 
                             radius={[4, 4, 0, 0]}
                           />
                         </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          )}
        </section>
      )}

      {/* Universal Upload Section */}
      <section className="glass-card p-6 md:p-8 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/5 rounded-full blur-2xl z-0 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl space-y-2 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-500/15 text-brand-400 rounded-xl border border-brand-500/20">
                <Icons.UploadCloud className="w-5 h-5 text-brand-400" />
              </div>
              <h3 className="text-xl font-bold font-display text-zinc-900 dark:text-white">Upload Subject Materials</h3>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex flex-col gap-1 w-full sm:w-auto text-left">
              <label htmlFor="subject-upload-select" className="text-xs text-zinc-500 font-semibold font-mono">TARGET SUBJECT</label>
              <select
                id="subject-upload-select"
                value={selectedSubjectId || (subjects && subjects[0]?.id) || ""}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 rounded-xl px-4 py-2.5 outline-none focus:border-brand-500 font-sans text-sm w-full md:w-64 cursor-pointer"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id} className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1 w-full sm:w-auto mt-auto">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                id="global-subject-file-input"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
              />
              <button 
                id="global-upload-button"
                onClick={handleUploadClick}
                disabled={isUploading}
                className="bg-brand-500 hover:bg-brand-600 text-white font-bold h-[42px] px-6 rounded-xl active:scale-95 transition-all text-sm shadow-lg shadow-brand-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {isUploading ? (
                  <Icons.Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icons.Sparkles className="w-4 h-4" />
                )}
                {isUploading ? "Structuring Subject..." : "Upload Reference PDF"}
              </button>
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-4 py-2 rounded-xl border border-red-500/10 text-left">
            <Icons.AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadQuotaNotice && (
          <div className="mt-4 flex items-start gap-2.5 text-amber-300 text-xs bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-2xl leading-relaxed text-left">
            <Icons.Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
            <div>
              <p className="font-semibold text-amber-200">System Fallback Mode</p>
              <p className="mt-0.5 text-zinc-300">{uploadQuotaNotice}</p>
            </div>
          </div>
        )}
      </section>

      {/* Subjects Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
           <h3 className="text-xl font-bold font-display text-zinc-900 dark:text-white">Core Subjects</h3>
        </div>
        <div id="subjects-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
          {subjects.map((subject) => {
            const getSubjectTheme = (name: string) => {
              const n = name.toLowerCase();
              if (n.includes("haryana") || n.includes("gk")) {
                return {
                  gradientBg: "bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-surface/20",
                  borderColor: "border-sky-500/15 dark:border-sky-500/15 hover:border-sky-500/45",
                  glowColor: "bg-sky-500/15 group-hover:bg-sky-500/25",
                  iconBg: "bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/25",
                  badgeBg: "bg-sky-50 dark:bg-sky-400/10 text-sky-700 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20",
                  textColor: "text-sky-950 dark:text-sky-100 group-hover:text-sky-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-sky-500/5",
                };
              }
              if (n.includes("geography")) {
                return {
                  gradientBg: "bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-surface/20",
                  borderColor: "border-emerald-500/15 dark:border-emerald-500/15 hover:border-emerald-500/45",
                  glowColor: "bg-emerald-500/15 group-hover:bg-emerald-500/25",
                  iconBg: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/25",
                  badgeBg: "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/20",
                  textColor: "text-emerald-950 dark:text-emerald-100 group-hover:text-emerald-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-emerald-500/5",
                };
              }
              if (n.includes("ancient history")) {
                return {
                  gradientBg: "bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-surface/20",
                  borderColor: "border-pink-500/15 dark:border-pink-500/15 hover:border-pink-500/45",
                  glowColor: "bg-pink-500/15 group-hover:bg-pink-500/25",
                  iconBg: "bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-500/25",
                  badgeBg: "bg-pink-50 dark:bg-pink-400/10 text-pink-700 dark:text-pink-300 border border-pink-100 dark:border-pink-500/20",
                  textColor: "text-pink-950 dark:text-pink-100 group-hover:text-pink-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-pink-500/5",
                };
              }
              if (n.includes("medieval history")) {
                return {
                  gradientBg: "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-surface/20",
                  borderColor: "border-amber-500/15 dark:border-amber-500/15 hover:border-amber-500/45",
                  glowColor: "bg-amber-500/15 group-hover:bg-amber-500/25",
                  iconBg: "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/25",
                  badgeBg: "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-500/20",
                  textColor: "text-amber-950 dark:text-amber-100 group-hover:text-amber-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-amber-500/5",
                };
              }
              if (n.includes("modern history")) {
                return {
                  gradientBg: "bg-gradient-to-br from-rose-500/10 via-red-500/5 to-surface/20",
                  borderColor: "border-rose-500/15 dark:border-rose-500/15 hover:border-rose-500/45",
                  glowColor: "bg-rose-500/15 group-hover:bg-rose-500/25",
                  iconBg: "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/25",
                  badgeBg: "bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-500/20",
                  textColor: "text-rose-950 dark:text-rose-100 group-hover:text-rose-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-rose-500/5",
                };
              }
              if (n.includes("economics")) {
                return {
                  gradientBg: "bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-surface/20",
                  borderColor: "border-violet-500/15 dark:border-violet-500/15 hover:border-violet-500/45",
                  glowColor: "bg-violet-500/15 group-hover:bg-violet-500/25",
                  iconBg: "bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-500/25",
                  badgeBg: "bg-violet-50 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-500/20",
                  textColor: "text-violet-950 dark:text-violet-100 group-hover:text-violet-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-violet-500/5",
                };
              }
              if (n.includes("physics")) {
                return {
                  gradientBg: "bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-surface/20",
                  borderColor: "border-cyan-500/15 dark:border-cyan-500/15 hover:border-cyan-500/45",
                  glowColor: "bg-cyan-500/15 group-hover:bg-cyan-500/25",
                  iconBg: "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-500/25",
                  badgeBg: "bg-cyan-50 dark:bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-500/20",
                  textColor: "text-cyan-950 dark:text-cyan-100 group-hover:text-cyan-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-cyan-500/5",
                };
              }
              if (n.includes("chemistry")) {
                return {
                  gradientBg: "bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-surface/20",
                  borderColor: "border-fuchsia-500/15 dark:border-fuchsia-500/15 hover:border-fuchsia-500/45",
                  glowColor: "bg-fuchsia-500/15 group-hover:bg-fuchsia-500/25",
                  iconBg: "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-100 dark:border-fuchsia-500/25",
                  badgeBg: "bg-fuchsia-50 dark:bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-100 dark:border-fuchsia-500/20",
                  textColor: "text-fuchsia-950 dark:text-fuchsia-100 group-hover:text-fuchsia-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-fuchsia-500/5",
                };
              }
              if (n.includes("biology")) {
                return {
                  gradientBg: "bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-surface/20",
                  borderColor: "border-teal-500/15 dark:border-teal-500/15 hover:border-teal-500/45",
                  glowColor: "bg-teal-500/15 group-hover:bg-teal-500/25",
                  iconBg: "bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-500/25",
                  badgeBg: "bg-teal-50 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-500/20",
                  textColor: "text-teal-950 dark:text-teal-100 group-hover:text-teal-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-teal-500/5",
                };
              }
              if (n.includes("computer") || n.includes("tech")) {
                return {
                  gradientBg: "bg-gradient-to-br from-slate-400/10 via-zinc-500/5 to-surface/20",
                  borderColor: "border-slate-500/15 dark:border-slate-500/15 hover:border-slate-500/45",
                  glowColor: "bg-slate-500/15 group-hover:bg-slate-500/25",
                  iconBg: "bg-slate-50 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-500/25",
                  badgeBg: "bg-slate-50 dark:bg-slate-400/10 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-500/20",
                  textColor: "text-slate-950 dark:text-slate-100 group-hover:text-slate-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-slate-500/5",
                };
              }
              if (n.includes("hindi")) {
                return {
                  gradientBg: "bg-gradient-to-br from-orange-500/10 via-red-500/5 to-surface/20",
                  borderColor: "border-orange-500/15 dark:border-orange-500/15 hover:border-orange-500/45",
                  glowColor: "bg-orange-500/15 group-hover:bg-orange-500/25",
                  iconBg: "bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-500/25",
                  badgeBg: "bg-orange-50 dark:bg-orange-400/10 text-orange-700 dark:text-orange-300 border border-orange-100 dark:border-orange-500/20",
                  textColor: "text-orange-950 dark:text-orange-100 group-hover:text-orange-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-orange-500/5",
                };
              }
              if (n.includes("english")) {
                return {
                  gradientBg: "bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-surface/20",
                  borderColor: "border-indigo-500/15 dark:border-indigo-500/15 hover:border-indigo-500/45",
                  glowColor: "bg-indigo-500/15 group-hover:bg-indigo-500/25",
                  iconBg: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/25",
                  badgeBg: "bg-indigo-50 dark:bg-indigo-400/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20",
                  textColor: "text-indigo-950 dark:text-indigo-100 group-hover:text-indigo-800 dark:group-hover:text-white",
                  shadow: "hover:shadow-indigo-500/5",
                };
              }
              return {
                gradientBg: "bg-gradient-to-br from-brand-500/10 via-zinc-500/5 to-surface/20",
                borderColor: "border-brand-500/15 dark:border-brand-500/15 hover:border-brand-500/45",
                glowColor: "bg-brand-500/15 group-hover:bg-brand-500/25",
                iconBg: "bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/25",
                badgeBg: "bg-brand-50 dark:bg-brand-400/10 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-500/20",
                textColor: "text-brand-950 dark:text-brand-100 group-hover:text-brand-800 dark:group-hover:text-white",
                shadow: "hover:shadow-brand-500/5",
              };
            };

            const theme = getSubjectTheme(subject.name);

            return (
              <button
                key={subject.id}
                id={`subject-card-${subject.id}`}
                onClick={() => {
                  playAppSound("expand");
                  setActiveSubject(subject);
                }}
                className={cn(
                  "group relative flex flex-col items-center justify-between text-center w-full rounded-2xl p-4 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 active:scale-98 select-none overflow-hidden h-[150px] md:h-[165px] border cursor-pointer bg-[var(--color-surface)] dark:bg-zinc-950/45 border-[var(--color-border)] dark:border-zinc-800/40 backdrop-blur-md",
                  theme.borderColor,
                  theme.shadow
                )}
              >
                {/* Glowing Blur Circles in Corners */}
                <div className={cn("absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-2xl transition-all duration-300 opacity-40 group-hover:opacity-85", theme.glowColor)}></div>
                <div className={cn("absolute -left-6 -top-6 w-20 h-20 rounded-full blur-2xl transition-all duration-300 opacity-20 group-hover:opacity-40", theme.glowColor)}></div>

                {/* Micro Document/Resource Pill in Top Right Corner */}
                <span className={cn(
                  "absolute top-2.5 right-2.5 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md transition-all duration-300 z-10",
                  theme.badgeBg
                )}>
                  {subject.documents.filter(d => !d.isDeleted).length} Docs
                </span>

                {/* Icon Container with Custom Glowing border on hover */}
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shadow-inner transition-all duration-300 group-hover:scale-108 group-hover:rotate-2 z-10 mt-1",
                  theme.iconBg
                )}>
                  {getIcon(subject.icon)}
                </div>

                {/* Subject Title & Explore Study Action text */}
                <div className="z-10 flex flex-col items-center gap-0.5 w-full mt-2">
                  <h4 className={cn(
                    "font-extrabold text-[13px] md:text-[15px] font-display tracking-tight leading-snug line-clamp-2 px-1 text-center select-none transition-colors duration-300",
                    theme.textColor
                  )}>
                    {subject.name}
                  </h4>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors duration-300">
                    Explore Study
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
