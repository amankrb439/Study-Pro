import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import * as Icons from "lucide-react";
import { getQuestions, getQuizSets, saveQuizSet } from "../lib/db";
import { Chapter } from "../types";
import { cn } from "../lib/utils";

export function DocumentView() {
  const { activeDocument, setActiveChapter, activeSubject, deleteChapter } = useAppStore();
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [quizSets, setQuizSets] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<string>("all");
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
  
  // Long press state and refs
  const [pressingChapterId, setPressingChapterId] = useState<string | null>(null);
  const [pressingProgress, setPressingProgress] = useState<number>(0);
  const [revealedDeleteChapterId, setRevealedDeleteChapterId] = useState<string | null>(null);
  const pressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const didLongPressRef = useRef<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent, chapterId: string) => {
    if (e.button !== 0) return; // Only trigger for primary click/tap
    
    // Clear any existing timer
    if (pressIntervalRef.current) {
      clearInterval(pressIntervalRef.current);
    }
    
    didLongPressRef.current = false;
    setPressingChapterId(chapterId);
    setPressingProgress(0);
    
    let currentProgress = 0;
    // 3 seconds total duration. Interval tick is 30ms -> 100 ticks = 3000ms
    pressIntervalRef.current = setInterval(() => {
      currentProgress += 1;
      if (currentProgress >= 100) {
        if (pressIntervalRef.current) {
          clearInterval(pressIntervalRef.current);
          pressIntervalRef.current = null;
        }
        didLongPressRef.current = true;
        setPressingChapterId(null);
        setPressingProgress(0);
        setRevealedDeleteChapterId(chapterId); // Show delete option
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      } else {
        setPressingProgress(currentProgress);
      }
    }, 30);
  };

  const handlePointerUp = () => {
    if (pressIntervalRef.current) {
      clearInterval(pressIntervalRef.current);
      pressIntervalRef.current = null;
    }
    setPressingChapterId(null);
    setPressingProgress(0);
  };

  const handlePointerLeave = () => {
    if (pressIntervalRef.current) {
      clearInterval(pressIntervalRef.current);
      pressIntervalRef.current = null;
    }
    setPressingChapterId(null);
    setPressingProgress(0);
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!activeSubject || !activeDocument) return;
    await deleteChapter(activeSubject.id, activeDocument.id, chapterId);
    setDeletingChapterId(null);
    setRevealedDeleteChapterId(null);
  };

  useEffect(() => {
    async function loadCounts() {
      try {
        const all = await getQuestions();
        const counts: Record<string, number> = {};
        all.forEach((q) => {
          if (q.chapterId) {
            counts[q.chapterId] = (counts[q.chapterId] || 0) + 1;
          }
        });
        setQuestionCounts(counts);

        const allSets = await getQuizSets();
        const setsMap: Record<string, any> = {};
        allSets.forEach((s) => {
          if (s.chapterId) {
            if (!setsMap[s.chapterId] || (s.bestScore || 0) > (setsMap[s.chapterId].bestScore || 0)) {
              setsMap[s.chapterId] = s;
            }
          }
        });
        setQuizSets(setsMap);
      } catch (err) {
        console.error("Failed to load counts:", err);
      }
    }
    loadCounts();
  }, [activeDocument]);

  if (!activeDocument) return null;

  const getChapterPart = (chapter: Chapter) => {
    if (chapter.part) return chapter.part;
    if (!activeSubject) return "General";
    
    const titleLower = chapter.title.toLowerCase();
    const descLower = chapter.description.toLowerCase();
    const subjName = activeSubject.name.toLowerCase();
    
    if (subjName === "history") {
      if (titleLower.includes("ancient") || descLower.includes("ancient") || titleLower.includes("harappan") || titleLower.includes("indus") || titleLower.includes("vedic") || titleLower.includes("maurya") || titleLower.includes("gupta") || titleLower.includes("stone age")) {
        return "Ancient";
      }
      if (titleLower.includes("medieval") || descLower.includes("medieval") || titleLower.includes("delhi sultanate") || titleLower.includes("mughal") || titleLower.includes("maratha") || titleLower.includes("rajput") || titleLower.includes("vijayanagara")) {
        return "Medieval";
      }
      if (titleLower.includes("modern") || descLower.includes("modern") || titleLower.includes("british") || titleLower.includes("gandhi") || titleLower.includes("freedom struggle") || titleLower.includes("independence") || titleLower.includes("revolt of 1857")) {
        return "Modern";
      }
      if (chapter.id.includes("ch-1")) return "Ancient";
      if (chapter.id.includes("ch-2")) return "Medieval";
      if (chapter.id.includes("ch-3")) return "Modern";
      return "Ancient";
    }
    
    if (subjName === "science") {
      if (titleLower.includes("physics") || titleLower.includes("motion") || titleLower.includes("force") || titleLower.includes("gravity") || titleLower.includes("thermodynamics") || titleLower.includes("optics") || titleLower.includes("electricity") || titleLower.includes("wave") || titleLower.includes("light") || titleLower.includes("eye") || titleLower.includes("magnet") || titleLower.includes("energy") || titleLower.includes("reflection") || titleLower.includes("refraction") || titleLower.includes("भौतिकी") || titleLower.includes("गति") || titleLower.includes("बल") || titleLower.includes("गुरुत्वाकर्षण") || titleLower.includes("ऊष्मागतिकी") || titleLower.includes("प्रकाश") || titleLower.includes("विद्युत") || titleLower.includes("चुंबक") || titleLower.includes("ऊर्जा") || titleLower.includes("नेत्र") || titleLower.includes("अपवर्तन") || titleLower.includes("परावर्तन") || titleLower.includes("तरंग") || titleLower.includes("मानव नेत्र")) {
        return "Physics";
      }
      if (titleLower.includes("chemistry") || titleLower.includes("bonding") || titleLower.includes("reaction") || titleLower.includes("atom") || titleLower.includes("periodic table") || titleLower.includes("acid") || titleLower.includes("base") || titleLower.includes("salt") || titleLower.includes("metal") || titleLower.includes("carbon") || titleLower.includes("matter") || titleLower.includes("chemical") || titleLower.includes("रसायन") || titleLower.includes("परमाणु") || titleLower.includes("अम्ल") || titleLower.includes("क्षारक") || titleLower.includes("लवण") || titleLower.includes("धातु") || titleLower.includes("कार्बन") || titleLower.includes("तत्व") || titleLower.includes("अभिक्रिया") || titleLower.includes("रासायनिक") || titleLower.includes("पदार्थ") || titleLower.includes("अधातु")) {
        return "Chemistry";
      }
      if (titleLower.includes("biology") || titleLower.includes("cell") || titleLower.includes("organism") || titleLower.includes("human body") || titleLower.includes("disease") || titleLower.includes("blood") || titleLower.includes("evolution") || titleLower.includes("reproduc") || titleLower.includes("heredity") || titleLower.includes("environment") || titleLower.includes("life processes") || titleLower.includes("control and coordination") || titleLower.includes("tissue") || titleLower.includes("nutrition") || titleLower.includes("जीव") || titleLower.includes("कोशिका") || titleLower.includes("रोग") || titleLower.includes("रक्त") || titleLower.includes("विकास") || titleLower.includes("आनुवंशिकता") || titleLower.includes("प्रजनन") || titleLower.includes("पर्यावरण") || titleLower.includes("प्रक्रम") || titleLower.includes("नियंत्रण") || titleLower.includes("समन्वय") || titleLower.includes("ऊतक") || titleLower.includes("पोषण") || titleLower.includes("अनुवांशिकता")) {
        return "Biology";
      }
      if (chapter.id.includes("ch-1")) return "Physics";
      if (chapter.id.includes("ch-2")) return "Chemistry";
      if (chapter.id.includes("ch-3")) return "Biology";
      return "Physics";
    }
    
    return "General";
  };

  const getSubmenuTabs = () => {
    if (!activeSubject) return null;
    const subjName = activeSubject.name.toLowerCase();
    if (subjName === "history") {
      return [
        { id: "all", name: "All Chapters" },
        { id: "Ancient", name: "Ancient History" },
        { id: "Medieval", name: "Medieval History" },
        { id: "Modern", name: "Modern History" }
      ];
    }
    if (subjName === "science") {
      return [
        { id: "all", name: "All Chapters" },
        { id: "Physics", name: "Physics" },
        { id: "Chemistry", name: "Chemistry" },
        { id: "Biology", name: "Biology" }
      ];
    }
    return null;
  };

  const getIconComponent = (iconName: string, className = "w-4 h-4 text-white") => {
    const IconComponent = (Icons as any)[iconName] || Icons.BookOpen;
    return <IconComponent className={className} />;
  };

  const handleResetSet = async (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    const setRecord = quizSets[chapterId];
    if (!setRecord) return;
    
    const updatedSet = {
      ...setRecord,
      bestScore: undefined,
      bestCorrectCount: undefined,
      bestTotalCount: undefined,
      lastPlayedAt: undefined,
    };
    
    await saveQuizSet(updatedSet);
    
    setQuizSets((prev) => ({
      ...prev,
      [chapterId]: updatedSet,
    }));
  };

  const getChapterTheme = (part: string, subj: string) => {
    const partLower = part.toLowerCase();
    const subjLower = subj.toLowerCase();
    
    // Return premium theme styles:
    // gradientBg, borderColor, glowColor, iconBg, badgeBg, textColor, shadow, icon
    if (subjLower.includes("physics") || partLower.includes("physics")) {
      return {
        gradientBg: "bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-surface/20",
        borderColor: "border-cyan-500/15 hover:border-cyan-500/40",
        glowColor: "bg-cyan-500/15 group-hover:bg-cyan-500/25",
        iconBg: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25",
        badgeBg: "bg-cyan-400/10 text-cyan-300 border border-cyan-500/20",
        textColor: "text-cyan-100 group-hover:text-white",
        shadow: "hover:shadow-cyan-500/5",
        icon: "Atom"
      };
    }
    if (subjLower.includes("chemistry") || partLower.includes("chemistry")) {
      return {
        gradientBg: "bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-surface/20",
        borderColor: "border-fuchsia-500/15 hover:border-fuchsia-500/40",
        glowColor: "bg-fuchsia-500/15 group-hover:bg-fuchsia-500/25",
        iconBg: "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/25",
        badgeBg: "bg-fuchsia-400/10 text-fuchsia-300 border border-fuchsia-500/20",
        textColor: "text-fuchsia-100 group-hover:text-white",
        shadow: "hover:shadow-fuchsia-500/5",
        icon: "FlaskConical"
      };
    }
    if (subjLower.includes("biology") || partLower.includes("biology") || subjLower.includes("life")) {
      return {
        gradientBg: "bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-surface/20",
        borderColor: "border-teal-500/15 hover:border-teal-500/40",
        glowColor: "bg-teal-500/15 group-hover:bg-teal-500/25",
        iconBg: "bg-teal-500/15 text-teal-400 border border-teal-500/25",
        badgeBg: "bg-teal-400/10 text-teal-300 border border-teal-500/20",
        textColor: "text-teal-100 group-hover:text-white",
        shadow: "hover:shadow-teal-500/5",
        icon: "Dna"
      };
    }
    if (subjLower.includes("ancient") || partLower.includes("ancient")) {
      return {
        gradientBg: "bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-surface/20",
        borderColor: "border-pink-500/15 hover:border-pink-500/40",
        glowColor: "bg-pink-500/15 group-hover:bg-pink-500/25",
        iconBg: "bg-pink-500/15 text-pink-400 border border-pink-500/25",
        badgeBg: "bg-pink-400/10 text-pink-300 border border-pink-500/20",
        textColor: "text-pink-100 group-hover:text-white",
        shadow: "hover:shadow-pink-500/5",
        icon: "Landmark"
      };
    }
    if (subjLower.includes("medieval") || partLower.includes("medieval")) {
      return {
        gradientBg: "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-surface/20",
        borderColor: "border-amber-500/15 hover:border-amber-500/40",
        glowColor: "bg-amber-500/15 group-hover:bg-amber-500/25",
        iconBg: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
        badgeBg: "bg-amber-400/10 text-amber-300 border border-amber-500/20",
        textColor: "text-amber-100 group-hover:text-white",
        shadow: "hover:shadow-amber-500/5",
        icon: "Shield"
      };
    }
    if (subjLower.includes("modern") || partLower.includes("modern")) {
      return {
        gradientBg: "bg-gradient-to-br from-rose-500/10 via-red-500/5 to-surface/20",
        borderColor: "border-rose-500/15 hover:border-rose-500/40",
        glowColor: "bg-rose-500/15 group-hover:bg-rose-500/25",
        iconBg: "bg-rose-500/15 text-rose-400 border border-rose-500/25",
        badgeBg: "bg-rose-400/10 text-rose-300 border border-rose-500/20",
        textColor: "text-rose-100 group-hover:text-white",
        shadow: "hover:shadow-rose-500/5",
        icon: "Flame"
      };
    }
    if (subjLower.includes("geography")) {
      return {
        gradientBg: "bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-surface/20",
        borderColor: "border-emerald-500/15 hover:border-emerald-500/40",
        glowColor: "bg-emerald-500/15 group-hover:bg-emerald-500/25",
        iconBg: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
        badgeBg: "bg-emerald-400/10 text-emerald-300 border border-emerald-500/20",
        textColor: "text-emerald-100 group-hover:text-white",
        shadow: "hover:shadow-emerald-500/5",
        icon: "Globe"
      };
    }
    if (subjLower.includes("economics")) {
      return {
        gradientBg: "bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-surface/20",
        borderColor: "border-violet-500/15 hover:border-violet-500/40",
        glowColor: "bg-violet-500/15 group-hover:bg-violet-500/25",
        iconBg: "bg-violet-500/15 text-violet-400 border border-violet-500/25",
        badgeBg: "bg-violet-400/10 text-violet-300 border border-violet-500/20",
        textColor: "text-violet-100 group-hover:text-white",
        shadow: "hover:shadow-violet-500/5",
        icon: "TrendingUp"
      };
    }
    if (subjLower.includes("computer") || subjLower.includes("tech")) {
      return {
        gradientBg: "bg-gradient-to-br from-slate-400/10 via-zinc-500/5 to-surface/20",
        borderColor: "border-slate-500/15 hover:border-slate-500/40",
        glowColor: "bg-slate-500/15 group-hover:bg-slate-500/25",
        iconBg: "bg-slate-500/15 text-slate-300 border border-slate-500/25",
        badgeBg: "bg-slate-400/10 text-slate-300 border border-slate-500/20",
        textColor: "text-slate-100 group-hover:text-white",
        shadow: "hover:shadow-slate-500/5",
        icon: "Cpu"
      };
    }
    if (subjLower.includes("hindi") || subjLower.includes("english") || subjLower.includes("haryana") || subjLower.includes("gk") || subjLower.includes("general")) {
      return {
        gradientBg: "bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-surface/20",
        borderColor: "border-sky-500/15 hover:border-sky-500/40",
        glowColor: "bg-sky-500/15 group-hover:bg-sky-500/25",
        iconBg: "bg-sky-500/15 text-sky-400 border border-sky-500/25",
        badgeBg: "bg-sky-400/10 text-sky-300 border border-sky-500/20",
        textColor: "text-sky-100 group-hover:text-white",
        shadow: "hover:shadow-sky-500/5",
        icon: "BookOpen"
      };
    }

    // Fallback
    return {
      gradientBg: "bg-gradient-to-br from-brand-500/10 via-zinc-500/5 to-surface/20",
      borderColor: "border-brand-500/15 hover:border-brand-500/40",
      glowColor: "bg-brand-500/15 group-hover:bg-brand-500/25",
      iconBg: "bg-brand-500/15 text-brand-300 border border-brand-500/25",
      badgeBg: "bg-brand-400/10 text-brand-300 border border-brand-500/20",
      textColor: "text-brand-100 group-hover:text-white",
      shadow: "hover:shadow-brand-500/5",
      icon: "BookOpen"
    };
  };

  const tabs = getSubmenuTabs();
  const filteredChapters = activeDocument.chapters.filter(chapter => {
    if (activeTab === "all") return true;
    return getChapterPart(chapter) === activeTab;
  });

  return (
    <div className="space-y-8 animate-fade-in">
       {!activeDocument.isDeleted && (
         <div className="glass-card p-6 md:p-8 rounded-3xl relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl"></div>
            <div className="flex items-center gap-4 mb-4 relative z-10">
              <div className="bg-brand-500/20 text-brand-400 p-3 rounded-xl">
                 <Icons.Layers className="w-6 h-6" />
              </div>
              <div>
                 <h2 className="text-2xl font-bold font-display text-zinc-800 dark:text-white">{activeDocument.name}</h2>
                 <div className="text-zinc-500 text-sm mt-1">{activeDocument.chapters.length} Extracted Chapters</div>
              </div>
            </div>
         </div>
       )}

       {/* Category Submenu Filters in Document view if available */}
       {tabs && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold font-display transition-all cursor-pointer",
                  activeTab === tab.id
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/15 scale-105"
                    : "bg-surface text-zinc-400 hover:text-white border border-white/5 hover:border-white/10"
                )}
              >
                {tab.name}
              </button>
            ))}
          </div>
       )}

       <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-xl text-zinc-200">
              {activeTab === "all" ? "Chapter Analysis" : `${activeTab} Chapters`}
            </h3>
            <span className="text-xs font-mono text-zinc-500 bg-surface px-2 py-1 rounded border border-white/5">
              Showing {filteredChapters.length} of {activeDocument.chapters.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredChapters.map((chapter, idx) => {
              const part = getChapterPart(chapter);
              const qCount = questionCounts[chapter.id] || 0;
              const setRecord = quizSets[chapter.id];
              const hasPlayed = !!setRecord && setRecord.bestScore !== undefined;
              const bestCorrect = setRecord?.bestCorrectCount || 0;
              const bestTotal = setRecord?.bestTotalCount || 0;
              const score = setRecord?.bestScore || 0;
              
              const theme = getChapterTheme(part, activeSubject?.name || "General");

              return (
                <div
                  key={chapter.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => handlePointerDown(e, chapter.id)}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  onClick={(e) => {
                    if (didLongPressRef.current) {
                      didLongPressRef.current = false;
                      return;
                    }
                    if (revealedDeleteChapterId === chapter.id || deletingChapterId === chapter.id) {
                      return;
                    }
                    setActiveChapter(chapter);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (revealedDeleteChapterId === chapter.id || deletingChapterId === chapter.id) {
                        return;
                      }
                      setActiveChapter(chapter);
                    }
                  }}
                  className={cn(
                    "relative group text-left rounded-3xl border overflow-hidden cursor-pointer h-[180px] flex flex-col justify-between transition-all duration-300 p-4 bg-white dark:bg-[#0e1628]/60 backdrop-blur-md hover:scale-[1.02] active:scale-98 w-full select-none shadow-sm hover:shadow-md border-zinc-200 dark:border-white/5",
                  )}
                >
                  {/* Radiant glow background halo */}
                  <div className={cn(
                    "absolute -right-12 -top-12 w-28 h-28 rounded-full blur-2xl opacity-10 dark:opacity-15 transition-all duration-500 pointer-events-none",
                    theme.glowColor
                  )} />

                  {/* Top Header of Category Card */}
                  <div className="flex items-center justify-between w-full relative z-10">
                    <span className={cn(
                      "text-[10px] font-black font-mono uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm",
                      theme.badgeBg
                    )}>
                      {qCount} {qCount === 1 ? 'Question' : 'Questions'}
                    </span>
                    
                    <div className="flex items-center gap-1.5">
                      {hasPlayed ? (
                        <>
                          <span className="text-[10px] font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            {score}% Best
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetSet(e, chapter.id);
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-white/5 text-[8px] font-extrabold tracking-wider uppercase transition-all cursor-pointer"
                            title="Reset stats"
                          >
                            <Icons.RotateCcw className="w-2.5 h-2.5" />
                            <span>Reset</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-[9px] font-bold font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/15">
                          Unattempted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Centered Large Centerpiece Icon & Title */}
                  <div className="flex items-center gap-3.5 my-auto w-full relative z-10">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center shadow-md transition-all duration-300 group-hover:scale-105 flex-shrink-0",
                      theme.iconBg
                    )}>
                      {getIconComponent(theme.icon, "w-5 h-5")}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h5 className="font-extrabold text-sm font-display text-zinc-800 dark:text-white tracking-tight leading-snug truncate group-hover:text-brand-600 dark:group-hover:text-amber-100 transition-colors">
                        {chapter.title}
                      </h5>
                      {chapter.description && (
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5 font-sans tracking-wide">
                          {chapter.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Detailed Metrics Overlay Footer */}
                  <div className="w-full bg-zinc-100/80 dark:bg-[#0a101e]/80 backdrop-blur-md border border-zinc-200/50 dark:border-white/5 rounded-2xl py-2 px-3 flex items-center justify-around text-center gap-1 mt-auto relative z-10 shadow-inner">
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Correct
                      </span>
                      <span className="text-[11.5px] font-extrabold font-mono text-emerald-600 dark:text-emerald-400 leading-none">
                        {hasPlayed ? bestCorrect : 0}
                      </span>
                    </div>
                    <div className="h-5 w-px bg-zinc-200 dark:bg-white/5" />
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                        Wrong
                      </span>
                      <span className="text-[11.5px] font-extrabold font-mono text-rose-600 dark:text-rose-400 leading-none">
                        {hasPlayed ? Math.max(0, bestTotal - bestCorrect) : 0}
                      </span>
                    </div>
                    <div className="h-5 w-px bg-zinc-200 dark:bg-white/5" />
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                        Unplayed
                      </span>
                      <span className="text-[11.5px] font-extrabold font-mono text-amber-600 dark:text-amber-400 leading-none">
                        {(() => {
                          const corr = hasPlayed ? bestCorrect : 0;
                          const wr = hasPlayed ? Math.max(0, bestTotal - bestCorrect) : 0;
                          return Math.max(0, qCount - corr - wr);
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* 1. Long Pressing Feedback Progress Overlay */}
                  {pressingChapterId === chapter.id && pressingProgress >= 15 && (
                    <div 
                      className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-[1px] z-30 flex flex-col items-center justify-center text-white pointer-events-none animate-fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Icons.Trash2 className="w-6 h-6 text-rose-400 animate-pulse" />
                        <span className="text-[11px] font-extrabold font-mono tracking-wider uppercase text-rose-200">Hold to delete...</span>
                        <div className="w-32 h-2 bg-white/20 rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-gradient-to-r from-amber-400 to-rose-500 rounded-full transition-all duration-75"
                            style={{ width: `${Math.round(((pressingProgress - 15) / 85) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Revealed Delete Option Overlay */}
                  {revealedDeleteChapterId === chapter.id && (
                    <div 
                      className="absolute inset-0 bg-rose-950/90 dark:bg-rose-950/95 backdrop-blur-sm z-20 p-4.5 flex flex-col justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm">
                          <Icons.AlertTriangle className="w-4 h-4" />
                          <span>Delete Option</span>
                        </div>
                        <p className="text-[10px] text-zinc-300 leading-snug">
                          Would you like to delete this chapter permanently?
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 justify-end mt-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRevealedDeleteChapterId(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-300 bg-white/10 hover:bg-white/15 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingChapterId(chapter.id);
                            setRevealedDeleteChapterId(null);
                          }}
                          className="px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-sm animate-pulse"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. Confirmation Dialog Overlay: "Do you want to delete this? Yes or No." */}
                  {deletingChapterId === chapter.id && (
                    <div 
                      className="absolute inset-0 bg-white dark:bg-[#0c1222] p-4.5 flex flex-col justify-between z-20 animate-fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1.5 my-auto text-center">
                        <div className="flex justify-center text-rose-500 mb-1">
                          <Icons.AlertCircle className="w-8 h-8 animate-bounce" />
                        </div>
                        <p className="text-xs text-zinc-800 dark:text-zinc-200 font-black leading-snug">
                          Do you want to delete this?
                        </p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 px-2 truncate">
                          "{chapter.title}"
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingChapterId(null);
                          }}
                          className="py-2 rounded-lg text-[11px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 transition-all cursor-pointer border border-zinc-200 dark:border-white/5"
                        >
                          No
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleDeleteChapter(chapter.id);
                          }}
                          className="py-2 rounded-lg text-[11px] font-bold text-white bg-rose-500 hover:bg-rose-600 transition-all cursor-pointer shadow-sm"
                        >
                          Yes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
       </div>
    </div>
  );
}
