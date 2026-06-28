import React, { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { useAudio } from "../hooks/useAudio";
import * as Icons from "lucide-react";
import { Document, Chapter, Question } from "../types";
import { getQuestions, getQuizSets, saveQuizSet } from "../lib/db";
import { cn } from "../lib/utils";
import { generateId } from "../lib/id";
import { areChaptersSimilar } from "../lib/similarity";

export function SubjectView() {
  const { activeSubject, addDocument, setActiveDocument, deleteDocument, setActiveChapter, addQuestions, deleteChapter } = useAppStore();
  const { playSound, playChapterComplete } = useAudio();
  const playAppSound = (type: "correct" | "wrong" | "complete" | "tick" | "click" | "expand" | "reset") => {
    playSound(type);
  };
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(() => {
    const nameLower = activeSubject.name.toLowerCase();
    const hasSubmenus = nameLower === "history" || nameLower === "science";
    if (hasSubmenus) return null;
    return "all";
  });
  const [browseMode, setBrowseMode] = useState<"documents" | "submenus">(
    activeSubject.name.toLowerCase() === "history" || activeSubject.name.toLowerCase() === "science"
      ? "submenus"
      : "documents"
  );
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [quizSets, setQuizSets] = useState<Record<string, any>>({});
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  // States for viewing questions
  const [questionSearch, setQuestionSearch] = useState("");
  const [selectedChapterFilter, setSelectedChapterFilter] = useState("all");
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);

  // Long press state and refs
  const [pressingChapterId, setPressingChapterId] = useState<string | null>(null);
  const [pressingProgress, setPressingProgress] = useState<number>(0);
  const [revealedDeleteChapterId, setRevealedDeleteChapterId] = useState<string | null>(null);
  const pressIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const didLongPressRef = React.useRef<boolean>(false);

  const handlePointerDown = (e: React.PointerEvent, chapterId: string) => {
    if (e.button !== 0) return; // Only trigger for primary click/tap
    
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

  const handleDeleteChapter = async (docId: string, chapterId: string) => {
    if (!activeSubject) return;
    playAppSound("click");
    await deleteChapter(activeSubject.id, docId, chapterId);
    setDeletingChapterId(null);
    setRevealedDeleteChapterId(null);
    await loadStats();
  };

  const loadStats = async () => {
    try {
      const allQs = await getQuestions();
      setAllQuestions(allQs);

      const counts: Record<string, number> = {};
      allQs.forEach((q) => {
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
      console.error("Failed to load stats:", err);
    }
  };

  useEffect(() => {
    if (!activeSubject) return;
    loadStats();
    
    // Reset submenu and browse mode when active subject changes
    const nameLower = activeSubject.name.toLowerCase();
    const hasSubmenus = nameLower === "history" || nameLower === "science";
    setActiveSubmenu(hasSubmenus ? null : "all");
    setBrowseMode(hasSubmenus ? "submenus" : "documents");
    
    // Reset search, filters and error states
    setQuestionSearch("");
    setSelectedChapterFilter("all");
    setDeletingChapterId(null);
    setConfirmDeleteId(null);
    setIsBulkGenerating(false);
    setBulkProgress("");
    setBulkError(null);
  }, [activeSubject]);

  const getTargetChaptersForGeneration = () => {
    const allChapters = getAllChaptersWithDocs();
    const validChapters = allChapters.filter(entry => !entry.doc.isDeleted);
    if (activeSubmenu && activeSubmenu !== "all") {
      return validChapters.filter(entry => getChapterPart(entry.chapter) === activeSubmenu);
    }
    return validChapters;
  };

  const handleGenerateAllChapters = async () => {
    const targets = getTargetChaptersForGeneration();
    if (targets.length === 0) return;
    setIsBulkGenerating(true);
    setBulkError(null);
    playAppSound("click");

    try {
      const apiKey = useAppStore.getState().apiKey;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      let processedCount = 0;
      for (const entry of targets) {
        const { chapter, doc } = entry;
        processedCount++;
        setBulkProgress(`Generating chapter ${processedCount}/${targets.length}: ${chapter.title}...`);

        try {
          const response = await fetch("/api/generate-questions", {
            method: "POST",
            headers,
            body: JSON.stringify({
              fileUri: doc?.fileUri || null,
              localPath: doc?.localPath || null,
              mimeType: doc?.mimeType || "application/pdf",
              chapterTitle: chapter.title,
              topics: chapter.topics,
              importantConcepts: chapter.importantConcepts || [],
              targetExams: "HSSC CET Group C, Group D, HSSC Constable, NCERT guidelines",
              targetCount: "auto",
            }),
          });

          if (!response.ok) {
            console.error(`Failed for chapter ${chapter.title}: status ${response.status}`);
            continue;
          }

          const responseText = await response.text();
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            console.error("Invalid JSON response:", responseText);
            continue;
          }

          if (data && data.questions && Array.isArray(data.questions)) {
            const generatedQs = data.questions.map((q: any) => ({
              ...q,
              id: generateId(),
              chapterId: chapter.id,
              createdAt: Date.now(),
            }));

            // Add questions
            await addQuestions(generatedQs);

            // Auto-create sets of EXACTLY 15 questions each
            const setSize = 15;
            const existingSets = await getQuizSets(chapter.id);
            let setNumber = existingSets.length + 1;
            for (let i = 0; i < generatedQs.length; i += setSize) {
              const chunk = generatedQs.slice(i, i + setSize);
              if (chunk.length > 0) {
                const newSet = {
                  id: generateId(),
                  chapterId: chapter.id,
                  name: `Set ${setNumber}`,
                  questionIds: chunk.map((q: any) => q.id),
                  createdAt: Date.now(),
                };
                await saveQuizSet(newSet);
                setNumber++;
              }
            }
          }
        } catch (chapterErr) {
          console.error(`Error generating questions for ${chapter.title}:`, chapterErr);
        }
      }

      setBulkProgress("Successfully completed!");
      playChapterComplete();
      await loadStats();
    } catch (err: any) {
      console.error(err);
      setBulkError(err.message || "Bulk generation failed.");
    } finally {
      setIsBulkGenerating(false);
      setBulkProgress("");
    }
  };

  const getSubjectSubmenus = () => {
    const nameLower = activeSubject.name.toLowerCase();
    if (nameLower === "history") {
      return [
        { id: "Ancient", name: "Ancient History", icon: "Landmark", color: "bg-emerald-500" },
        { id: "Medieval", name: "Medieval History", icon: "Castle", color: "bg-purple-500" },
        { id: "Modern", name: "Modern History", icon: "Flame", color: "bg-red-500" }
      ];
    }
    if (nameLower === "science") {
      return [
        { id: "Physics", name: "Physics", icon: "Atom", color: "bg-indigo-500" },
        { id: "Chemistry", name: "Chemistry", icon: "Sparkles", color: "bg-pink-500" },
        { id: "Biology", name: "Biology", icon: "Dna", color: "bg-emerald-500" }
      ];
    }
    return null;
  };

  const getIconComponent = (iconName: string, className = "w-4 h-4 text-white") => {
    const IconComponent = (Icons as any)[iconName] || Icons.BookOpen;
    return <IconComponent className={className} />;
  };

  const getAllChaptersWithDocs = () => {
    const chapters: { chapter: Chapter; doc: Document }[] = [];
    activeSubject.documents.forEach((doc) => {
      doc.chapters.forEach((chapter) => {
        chapters.push({ chapter, doc });
      });
    });

    // Deduplicate by chapter title using smart semantic similarity
    const uniqueEntries: { chapter: Chapter; doc: Document }[] = [];
    
    chapters.forEach(entry => {
      const similarIndex = uniqueEntries.findIndex(existing => 
        areChaptersSimilar(existing.chapter.title, entry.chapter.title) || 
        existing.chapter.id === entry.chapter.id
      );
      
      if (similarIndex === -1) {
        uniqueEntries.push(entry);
      } else {
        const existing = uniqueEntries[similarIndex];
        const qCount = questionCounts[entry.chapter.id] || 0;
        const existingQCount = questionCounts[existing.chapter.id] || 0;
        
        // Keep the one with the higher question count
        if (qCount > existingQCount) {
          uniqueEntries[similarIndex] = entry;
        }
      }
    });

    return uniqueEntries;
  };

  const handleResetSet = async (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    playAppSound("reset");
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
        borderColor: "border-cyan-500/15 dark:border-cyan-500/15 hover:border-cyan-500/40",
        glowColor: "bg-cyan-500/15 group-hover:bg-cyan-500/25",
        iconBg: "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-500/25",
        badgeBg: "bg-cyan-50 dark:bg-cyan-400/10 text-cyan-700 dark:text-cyan-300 border border-cyan-100 dark:border-cyan-500/20",
        textColor: "text-cyan-950 dark:text-cyan-100 group-hover:text-cyan-800 dark:group-hover:text-white",
        shadow: "hover:shadow-cyan-500/5",
        icon: "Atom"
      };
    }
    if (subjLower.includes("chemistry") || partLower.includes("chemistry")) {
      return {
        gradientBg: "bg-gradient-to-br from-fuchsia-500/10 via-pink-500/5 to-surface/20",
        borderColor: "border-fuchsia-500/15 dark:border-fuchsia-500/15 hover:border-fuchsia-500/40",
        glowColor: "bg-fuchsia-500/15 group-hover:bg-fuchsia-500/25",
        iconBg: "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-100 dark:border-fuchsia-500/25",
        badgeBg: "bg-fuchsia-50 dark:bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-100 dark:border-fuchsia-500/20",
        textColor: "text-fuchsia-950 dark:text-fuchsia-100 group-hover:text-fuchsia-800 dark:group-hover:text-white",
        shadow: "hover:shadow-fuchsia-500/5",
        icon: "FlaskConical"
      };
    }
    if (subjLower.includes("biology") || partLower.includes("biology") || subjLower.includes("life")) {
      return {
        gradientBg: "bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-surface/20",
        borderColor: "border-teal-500/15 dark:border-teal-500/15 hover:border-teal-500/40",
        glowColor: "bg-teal-500/15 group-hover:bg-teal-500/25",
        iconBg: "bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-500/25",
        badgeBg: "bg-teal-50 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-500/20",
        textColor: "text-teal-950 dark:text-teal-100 group-hover:text-teal-800 dark:group-hover:text-white",
        shadow: "hover:shadow-teal-500/5",
        icon: "Dna"
      };
    }
    if (subjLower.includes("ancient") || partLower.includes("ancient")) {
      return {
        gradientBg: "bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-surface/20",
        borderColor: "border-pink-500/15 dark:border-pink-500/15 hover:border-pink-500/40",
        glowColor: "bg-pink-500/15 group-hover:bg-pink-500/25",
        iconBg: "bg-pink-50 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-500/25",
        badgeBg: "bg-pink-50 dark:bg-pink-400/10 text-pink-700 dark:text-pink-300 border border-pink-100 dark:border-pink-500/20",
        textColor: "text-pink-950 dark:text-pink-100 group-hover:text-pink-800 dark:group-hover:text-white",
        shadow: "hover:shadow-pink-500/5",
        icon: "Landmark"
      };
    }
    if (subjLower.includes("medieval") || partLower.includes("medieval")) {
      return {
        gradientBg: "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-surface/20",
        borderColor: "border-amber-500/15 dark:border-amber-500/15 hover:border-amber-500/40",
        glowColor: "bg-amber-500/15 group-hover:bg-amber-500/25",
        iconBg: "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-500/25",
        badgeBg: "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-500/20",
        textColor: "text-amber-950 dark:text-amber-100 group-hover:text-amber-800 dark:group-hover:text-white",
        shadow: "hover:shadow-amber-500/5",
        icon: "Shield"
      };
    }
    if (subjLower.includes("modern") || partLower.includes("modern")) {
      return {
        gradientBg: "bg-gradient-to-br from-rose-500/10 via-red-500/5 to-surface/20",
        borderColor: "border-rose-500/15 dark:border-rose-500/15 hover:border-rose-500/40",
        glowColor: "bg-rose-500/15 group-hover:bg-rose-500/25",
        iconBg: "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/25",
        badgeBg: "bg-rose-50 dark:bg-rose-400/10 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-500/20",
        textColor: "text-rose-950 dark:text-rose-100 group-hover:text-rose-800 dark:group-hover:text-white",
        shadow: "hover:shadow-rose-500/5",
        icon: "Flame"
      };
    }
    if (subjLower.includes("geography")) {
      return {
        gradientBg: "bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-surface/20",
        borderColor: "border-emerald-500/15 dark:border-emerald-500/15 hover:border-emerald-500/40",
        glowColor: "bg-emerald-500/15 group-hover:bg-emerald-500/25",
        iconBg: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/25",
        badgeBg: "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/20",
        textColor: "text-emerald-950 dark:text-emerald-100 group-hover:text-emerald-800 dark:group-hover:text-white",
        shadow: "hover:shadow-emerald-500/5",
        icon: "Globe"
      };
    }
    if (subjLower.includes("economics")) {
      return {
        gradientBg: "bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-surface/20",
        borderColor: "border-violet-500/15 dark:border-violet-500/15 hover:border-violet-500/40",
        glowColor: "bg-violet-500/15 group-hover:bg-violet-500/25",
        iconBg: "bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-500/25",
        badgeBg: "bg-violet-50 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-500/20",
        textColor: "text-violet-950 dark:text-violet-100 group-hover:text-violet-800 dark:group-hover:text-white",
        shadow: "hover:shadow-violet-500/5",
        icon: "TrendingUp"
      };
    }
    if (subjLower.includes("computer") || subjLower.includes("tech")) {
      return {
        gradientBg: "bg-gradient-to-br from-slate-400/10 via-zinc-500/5 to-surface/20",
        borderColor: "border-slate-500/15 dark:border-slate-500/15 hover:border-slate-500/40",
        glowColor: "bg-slate-500/15 group-hover:bg-slate-500/25",
        iconBg: "bg-slate-50 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-500/25",
        badgeBg: "bg-slate-50 dark:bg-slate-400/10 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-500/20",
        textColor: "text-slate-950 dark:text-slate-100 group-hover:text-slate-800 dark:group-hover:text-white",
        shadow: "hover:shadow-slate-500/5",
        icon: "Cpu"
      };
    }
    if (subjLower.includes("hindi") || subjLower.includes("english") || subjLower.includes("haryana") || subjLower.includes("gk") || subjLower.includes("general")) {
      return {
        gradientBg: "bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-surface/20",
        borderColor: "border-sky-500/15 dark:border-sky-500/15 hover:border-sky-500/40",
        glowColor: "bg-sky-500/15 group-hover:bg-sky-500/25",
        iconBg: "bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-500/25",
        badgeBg: "bg-sky-50 dark:bg-sky-400/10 text-sky-700 dark:text-sky-300 border border-sky-100 dark:border-sky-500/20",
        textColor: "text-sky-950 dark:text-sky-100 group-hover:text-sky-800 dark:group-hover:text-white",
        shadow: "hover:shadow-sky-500/5",
        icon: "BookOpen"
      };
    }

    // Fallback
    return {
      gradientBg: "bg-gradient-to-br from-brand-500/10 via-zinc-500/5 to-surface/20",
      borderColor: "border-brand-500/15 dark:border-brand-500/15 hover:border-brand-500/40",
      glowColor: "bg-brand-500/15 group-hover:bg-brand-500/25",
      iconBg: "bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/25",
      badgeBg: "bg-brand-50 dark:bg-brand-400/10 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-500/20",
      textColor: "text-brand-950 dark:text-brand-100 group-hover:text-brand-800 dark:group-hover:text-white",
      shadow: "hover:shadow-brand-500/5",
      icon: "BookOpen"
    };
  };

  const getChapterPart = (chapter: Chapter) => {
    if (chapter.part) return chapter.part;
    
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

  if (!activeSubject) return null;

  const submenus = getSubjectSubmenus();
  const allChapterEntries = getAllChaptersWithDocs();
  const filteredChapters = allChapterEntries.filter((entry) => {
    if (activeSubmenu === null) return false;
    if (activeSubmenu === "all") return true;
    return getChapterPart(entry.chapter) === activeSubmenu;
  });

  const totalChaptersCount = allChapterEntries.length;
  const completedChaptersCount = allChapterEntries.filter(({ chapter }) => {
    const setRecord = quizSets[chapter.id];
    return !!setRecord && setRecord.bestScore !== undefined;
  }).length;
  const progressPercentage = totalChaptersCount > 0 ? Math.round((completedChaptersCount / totalChaptersCount) * 100) : 0;
  const strokeDasharray = 283; // 2 * pi * 45
  const strokeDashoffset = strokeDasharray - (strokeDasharray * progressPercentage) / 100;

  const renderChapterCard = (chapter: Chapter, doc: Document) => {
    const qCount = questionCounts[chapter.id] || 0;
    const setRecord = quizSets[chapter.id];
    const hasPlayed = !!setRecord && setRecord.bestScore !== undefined;
    const bestCorrect = setRecord?.bestCorrectCount || 0;
    const bestTotal = setRecord?.bestTotalCount || 0;
    const score = setRecord?.bestScore || 0;
    const part = getChapterPart(chapter);

    // Compute dynamic premium styling properties
    const theme = getChapterTheme(part, activeSubject.name);

    return (
      <div
        key={chapter.id}
        role="button"
        tabIndex={0}
        onPointerDown={(e) => handlePointerDown(e, chapter.id)}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerUp}
        onClick={(e) => {
          if (didLongPressRef.current) {
            didLongPressRef.current = false;
            return;
          }
          if (revealedDeleteChapterId === chapter.id || deletingChapterId === chapter.id) {
            return;
          }
          playAppSound("expand");
          setActiveDocument(doc);
          setActiveChapter(chapter);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (revealedDeleteChapterId === chapter.id || deletingChapterId === chapter.id) {
              return;
            }
            playAppSound("expand");
            setActiveDocument(doc);
            setActiveChapter(chapter);
          }
        }}
        className={cn(
          "relative group text-left rounded-3xl border overflow-hidden cursor-pointer h-[180px] flex flex-col justify-between transition-all duration-300 p-4.5 bg-white dark:bg-[#0e1628]/60 backdrop-blur-md hover:scale-[1.02] active:scale-98 w-full select-none shadow-sm hover:shadow-md border-zinc-200 dark:border-white/5",
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
                  title="Reset high score stats"
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
            <span className="text-[13px] font-extrabold font-mono text-emerald-600 dark:text-emerald-400 leading-none">
              {hasPlayed ? bestCorrect : 0}
            </span>
          </div>
          <div className="h-5 w-px bg-zinc-200 dark:bg-white/5" />
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
              Wrong
            </span>
            <span className="text-[13px] font-extrabold font-mono text-rose-500 dark:text-rose-400 leading-none">
              {hasPlayed ? Math.max(0, bestTotal - bestCorrect) : 0}
            </span>
          </div>
          <div className="h-5 w-px bg-zinc-200 dark:bg-white/5" />
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Unplayed
            </span>
            <span className="text-[13px] font-extrabold font-mono text-amber-600 dark:text-amber-300 leading-none">
              {(() => {
                const corr = hasPlayed ? bestCorrect : 0;
                const wr = hasPlayed ? Math.max(0, bestTotal - bestCorrect) : 0;
                return Math.max(0, qCount - corr - wr);
              })()}
            </span>
          </div>
        </div>

        {/* 1. Long Pressing Feedback Progress Overlay */}
        {pressingChapterId === chapter.id && pressingProgress >= 25 && (
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
                  style={{ width: `${Math.round(((pressingProgress - 25) / 75) * 100)}%` }}
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
                  await handleDeleteChapter(doc.id, chapter.id);
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
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Global Subject Progress Tracker */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-6 rounded-2xl bg-[var(--color-surface)] dark:bg-surface border border-zinc-200 dark:border-white/5 shadow-sm gap-4 mb-2">
        <div className="flex flex-col flex-1">
          <h3 className="font-display font-semibold text-xl text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Icons.TrendingUp className="w-5 h-5 text-brand-500" />
            Subject Progress Pipeline
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            Track your overall mastery in {activeSubject.name}. Complete chapters by attempting quizzes to fill the ring.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Total Chapters</span>
              <span className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-200">{totalChaptersCount}</span>
            </div>
            <div className="w-px h-8 bg-black/10 dark:bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Completed</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{completedChaptersCount}</span>
            </div>
            <div className="w-px h-8 bg-black/10 dark:bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-500">Generated Qs</span>
              <span className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
                {allChapterEntries.reduce((sum, entry) => sum + (questionCounts[entry.chapter.id] || 0), 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Circular Progress Bar */}
        <div className="relative shrink-0 flex items-center justify-center w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Ring */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              strokeWidth="8"
              className="stroke-zinc-200 dark:stroke-zinc-800"
            />
            {/* Progress Ring */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              strokeWidth="8"
              strokeLinecap="round"
              className="stroke-brand-500 transition-all duration-1000 ease-out"
              style={{ strokeDasharray, strokeDashoffset }}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center inset-0">
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">{progressPercentage}%</span>
            <span className="text-[8px] uppercase tracking-wider font-bold text-zinc-500">Mastery</span>
          </div>
        </div>
      </div>

      {submenus && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex rounded-xl bg-zinc-100 dark:bg-surface p-1 border border-zinc-200 dark:border-white/5">
            <button
              onClick={() => {
                playAppSound("click");
                setBrowseMode("submenus");
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer",
                browseMode === "submenus"
                  ? "bg-brand-500 text-white shadow-lg"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              )}
            >
              <Icons.Layers className="w-4 h-4" />
              Syllabus Submenus
            </button>
            <button
              onClick={() => {
                playAppSound("click");
                setBrowseMode("documents");
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer",
                browseMode === "documents"
                  ? "bg-brand-500 text-white shadow-lg"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              )}
            >
              <Icons.FolderOpen className="w-4 h-4" />
              Source Library ({activeSubject.documents.filter(d => !d.isDeleted).length})
            </button>
          </div>
          
          <div className="text-sm font-mono text-zinc-500 font-semibold">
            {activeSubject.name} Structure
          </div>
        </div>
      )}

      {/* Submenus Mode */}
      {submenus && browseMode === "submenus" && (
        <div className="space-y-6">
          {activeSubmenu === null ? (
            /* Submenu Selection Page */
            <div className="space-y-6 animate-fade-in">
              <div className="text-zinc-400 text-sm">
                Choose a sub-subject below to explore chapters and practice questions.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {submenus.map((menu) => {
                  return (
                    <button
                      key={menu.id}
                      onClick={() => {
                        playAppSound("expand");
                        setActiveSubmenu(menu.id);
                      }}
                      className={cn(
                        "relative flex flex-col items-center justify-center p-8 rounded-2xl border transition-all text-center group overflow-hidden cursor-pointer",
                        "border-zinc-200 dark:border-white/5 bg-[var(--color-surface)] dark:bg-surface hover:bg-zinc-50 dark:hover:bg-surface-hover hover:border-brand-500/30 hover:scale-[1.02] shadow-lg animate-fade-in"
                      )}
                    >
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all bg-zinc-100 dark:bg-white/5 group-hover:bg-brand-500/20 text-zinc-500 dark:text-zinc-400 group-hover:text-brand-300"
                      )}>
                        {getIconComponent(menu.icon, "w-6 h-6 text-zinc-700 dark:text-white")}
                      </div>
                      <span className="text-base font-bold font-display text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white">
                        {menu.name}
                      </span>
                      <p className="text-xs text-zinc-500 mt-2 font-medium">
                        Click to open chapters and practice exams
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Dedicated Sub-Subject Chapters Page */
            <div className="space-y-6 animate-fade-in">
              {/* Back button and page title */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
                <button
                  onClick={() => {
                    playAppSound("click");
                    setActiveSubmenu(null);
                  }}
                  className="flex items-center gap-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white group cursor-pointer w-fit"
                >
                  <Icons.ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span>Back to {activeSubject.name} Structure</span>
                </button>
                <div className="flex items-center gap-4">
                  <h4 className="font-display font-semibold text-xl text-zinc-800 dark:text-zinc-200 flex items-center gap-2.5">
                    <span className="p-1.5 bg-brand-500/15 text-brand-400 rounded-lg border border-brand-500/25">
                      {getIconComponent(submenus.find(m => m.id === activeSubmenu)?.icon || "BookOpen")}
                    </span>
                    {activeSubmenu} Syllabus Chapters
                  </h4>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-surface px-2.5 py-1 rounded border border-zinc-200 dark:border-white/5 font-semibold">
                    {filteredChapters.length} Chapters Found
                  </span>
                </div>
              </div>
 
              {/* Dynamic Bulk Generation Actions & Stats Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-zinc-50 dark:bg-surface/10 p-5 rounded-2xl border border-zinc-200 dark:border-white/5">
                {/* Metric Card: Total Questions Generated for this Submenu/Subject */}
                <div className="bg-white dark:bg-[#0f172a]/55 border border-zinc-200 dark:border-cyan-500/15 rounded-2xl p-5 flex items-center justify-between gap-4 shadow-lg shadow-cyan-500/5">
                  <div className="space-y-1 text-left">
                    <span className="text-[10px] font-black font-mono uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                      {activeSubmenu || activeSubject.name} Subject Number
                    </span>
                    <h4 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 font-display">Total Questions Generated</h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Successfully compiled exam-ready questions across all chapters.</p>
                  </div>
                  <div className="px-5 py-3 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-xl text-center shrink-0">
                    <span className="text-3xl font-black font-mono text-cyan-600 dark:text-cyan-400 leading-none">
                      {(() => {
                        const targets = getTargetChaptersForGeneration();
                        return targets.reduce((sum, entry) => sum + (questionCounts[entry.chapter.id] || 0), 0);
                      })()}
                    </span>
                    <span className="block text-[8px] uppercase font-bold tracking-widest text-cyan-700 dark:text-cyan-300 mt-1">Questions</span>
                  </div>
                </div>

                {/* Bulk Action Card */}
                {getTargetChaptersForGeneration().length > 0 && (
                  <div className="flex flex-col justify-center items-start p-5 bg-white dark:bg-[#0f172a]/55 border border-zinc-200 dark:border-white/5 rounded-2xl text-left gap-3">
                    <div>
                      <h5 className="font-bold text-zinc-800 dark:text-zinc-100 text-sm">Bulk Question Generator</h5>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Automate and generate structured questions for all chapters under this subject at once.</p>
                    </div>
                    
                    {isBulkGenerating ? (
                      <div className="w-full space-y-2">
                        <div className="flex items-center gap-2 text-xs font-mono text-brand-400 animate-pulse font-medium">
                          <Icons.Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                          <span>{bulkProgress}</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-850/60 border border-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500 animate-[pulse_1.5s_infinite] rounded-full" style={{ width: "100%" }} />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateAllChapters}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-cyan-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Icons.Sparkles className="w-3.5 h-3.5 text-white" />
                        <span>Generate Questions for All {activeSubmenu || activeSubject.name} Chapters</span>
                      </button>
                    )}
                    {bulkError && (
                      <span className="text-xs text-red-400 mt-1">{bulkError}</span>
                    )}
                  </div>
                )}
              </div>

              {filteredChapters.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 border border-white/5 rounded-2xl bg-surface/20">
                  No chapters are currently uploaded or configured under this submenu.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                  {filteredChapters.map(({ chapter, doc }) => {
                    return renderChapterCard(chapter, doc);
                  })}
                </div>
              )}

              {/* Question Library Viewer for this Submenu */}
              {(() => {
                const submenuChapterIds = new Set(filteredChapters.map(fc => fc.chapter.id));
                const currentSubmenuQuestions = allQuestions.filter(q => q.chapterId && submenuChapterIds.has(q.chapterId));
                
                if (currentSubmenuQuestions.length === 0) return null;

                // Apply searches and filters
                const searchedQuestions = currentSubmenuQuestions.filter(q => {
                  const matchSearch = q.question.toLowerCase().includes(questionSearch.toLowerCase()) || 
                                      q.explanation.toLowerCase().includes(questionSearch.toLowerCase());
                  const matchChapter = selectedChapterFilter === "all" || q.chapterId === selectedChapterFilter;
                  return matchSearch && matchChapter;
                });

                return (
                  <div className="mt-10 border-t border-zinc-200 dark:border-white/5 pt-8 space-y-6 text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-display font-semibold text-lg text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                          <Icons.BookOpenCheck className="w-5 h-5 text-cyan-500" />
                          Generated Question Bank ({currentSubmenuQuestions.length} Questions)
                        </h4>
                        <p className="text-xs text-zinc-500 mt-0.5">Explore, search, and study all questions generated under {activeSubmenu}.</p>
                      </div>
                    </div>

                    {/* Filter controls */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Icons.Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Search questions or explanations..."
                          value={questionSearch}
                          onChange={(e) => setQuestionSearch(e.target.value)}
                          className="w-full bg-white dark:bg-[#0a101e]/60 border border-zinc-200 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/10 focus:border-cyan-500/50 rounded-xl pl-10 pr-4 py-2.5 outline-none text-sm text-zinc-800 dark:text-zinc-200 transition-all font-sans"
                        />
                      </div>
                      <select
                        value={selectedChapterFilter}
                        onChange={(e) => setSelectedChapterFilter(e.target.value)}
                        className="bg-white dark:bg-[#0a101e]/60 border border-zinc-200 dark:border-white/5 text-zinc-800 dark:text-zinc-300 rounded-xl px-4 py-2.5 outline-none focus:border-cyan-500 text-sm font-sans cursor-pointer max-w-xs"
                      >
                        <option value="all" className="bg-white dark:bg-[#0e1628] text-zinc-800 dark:text-zinc-100">All Chapters</option>
                        {filteredChapters.map(({ chapter }) => (
                          <option key={chapter.id} value={chapter.id} className="bg-white dark:bg-[#0e1628] text-zinc-800 dark:text-zinc-100">
                            {chapter.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Questions Cards List */}
                    {searchedQuestions.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50 dark:bg-surface/5">
                        No matching questions found for current filters.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {searchedQuestions.map((q, qIdx) => {
                          const chapterTitle = filteredChapters.find(fc => fc.chapter.id === q.chapterId)?.chapter.title || "Subject Chapter";
                          return (
                            <div key={q.id} className="p-5 rounded-2xl border border-zinc-200 dark:border-white/5 bg-white dark:bg-[#0e1628]/40 hover:bg-zinc-50 dark:hover:bg-[#0e1628]/60 transition-all space-y-3.5 animate-fade-in">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-150 dark:border-white/5 pb-2.5">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-md border border-cyan-500/15">
                                  {chapterTitle}
                                </span>
                                {q.topicTag && (
                                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                                    #{q.topicTag}
                                  </span>
                                )}
                              </div>
                              
                              <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-100 font-sans leading-relaxed">
                                <span className="text-cyan-500 font-mono mr-1.5">{qIdx + 1}.</span> {q.question}
                              </p>

                              {/* Options */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                {q.options.map((opt, oIdx) => {
                                  const isCorrect = opt === q.correctAnswer;
                                  return (
                                    <div
                                      key={oIdx}
                                      className={cn(
                                        "px-4 py-2.5 rounded-xl border text-xs font-sans font-medium transition-all flex items-center justify-between gap-2 select-none",
                                        isCorrect
                                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold"
                                          : "bg-zinc-50 dark:bg-white/[0.01] border-zinc-150 dark:border-white/5 text-zinc-500 dark:text-zinc-400"
                                      )}
                                    >
                                      <span>{opt}</span>
                                      {isCorrect && (
                                        <Icons.CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Explanation */}
                              {q.explanation && (
                                <div className="mt-3 p-3.5 bg-cyan-500/5 border border-cyan-500/10 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
                                  <span className="font-extrabold text-cyan-600 dark:text-cyan-400 block mb-1">Explanation:</span>
                                  {q.explanation}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Chapter Analysis directly in Subject View instead of Source Library */}
      {(!submenus || browseMode === "documents") && (
        <div className="space-y-4 text-left mt-8">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-semibold text-xl text-zinc-800 dark:text-zinc-200">Chapter Analysis</h4>
            <span className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-surface px-2 py-1 rounded border border-zinc-200 dark:border-white/5">
              Showing {filteredChapters.length} Chapters
            </span>
          </div>
          
          {filteredChapters.length === 0 ? (
             <div className="text-center py-12 text-zinc-500 border border-zinc-200 dark:border-border/50 rounded-2xl bg-zinc-50 dark:bg-surface/20">
               No chapters available. Upload a document to extract chapters.
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredChapters.map(entry => renderChapterCard(entry.chapter, entry.doc))}
            </div>
          )}

          {/* Hidden Document Management for deletion */}
          {activeSubject.documents.some(doc => !doc.isDeleted) && (
            <div className="pt-8 flex justify-end">
              <div className="text-xs text-zinc-500 flex items-center gap-2">
                <span>Manage Sources:</span>
                {activeSubject.documents.map(doc => !doc.isDeleted && (
                  <button
                    key={doc.id}
                    onClick={() => setConfirmDeleteId(doc.id)}
                    className="underline hover:text-red-500 cursor-pointer"
                  >
                    Delete {doc.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Document Deletion */}
      {confirmDeleteId && (() => {
        const docToDelete = activeSubject.documents.find(doc => doc.id === confirmDeleteId);
        if (!docToDelete) return null;
        return (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in text-left">
            <div 
              className="relative w-full max-w-md shadow-2xl p-6 rounded-2xl flex flex-col border" 
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              {/* Header / Icon */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                  <Icons.Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-zinc-900 dark:text-white">
                    Delete Source File?
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Are you sure you want to delete <span className="font-semibold text-zinc-800 dark:text-zinc-200">{docToDelete.name}</span>? This action cannot be undone and will permanently remove the physical file.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 mt-2">
                <button
                  onClick={() => {
                    playAppSound("click");
                    setConfirmDeleteId(null);
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-zinc-150 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  No, Cancel
                </button>
                <button
                  onClick={async () => {
                    playAppSound("click");
                    setConfirmDeleteId(null);
                    await deleteDocument(activeSubject.id, docToDelete.id);
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-colors cursor-pointer"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
