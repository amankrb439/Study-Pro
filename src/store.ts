import { create } from "zustand";
import { Subject, Document, Chapter, Question, QuizSet, UserStats, AppSettings } from "./types";
import { getSubjects, getUserStats, initDB, saveSubject, updateUserStats, getQuestions, saveQuestions, clearAllQuestionsAndSets, clearQuestionsAndSetsForChapter, saveApiKey, getApiKey, DEFAULT_SUBJECTS, resetUserStreak, resetUserStats, setLocalItem, getQuizSets } from "./lib/db";
import { setSoundEnabled } from "./lib/audio";
import { areChaptersSimilar } from "./lib/similarity";

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: "large",
  autoAdvanceOnTimeout: true,
  autoNextOnAnswer: true,
  soundEnabled: true,
  vibrationEnabled: false,
  themeId: "midnight-obsidian",
};

interface AppState {
  isInitialized: boolean;
  apiKey: string | null;
  subjects: Subject[];
  userStats: UserStats | null;
  activeSubject: Subject | null;
  activeDocument: Document | null;
  activeChapter: Chapter | null;
  activeQuiz: QuizSet | null;
  settings: AppSettings;
  
  isUploading: boolean;
  uploadError: string;
  uploadQuotaNotice: string;
  uploadSuccess: string;
  
  initialize: () => Promise<void>;
  setApiKey: (key: string | null) => Promise<void>;
  setActiveSubject: (subject: Subject | null) => void;
  setActiveDocument: (doc: Document | null) => void;
  setActiveChapter: (chapter: Chapter | null) => void;
  setActiveQuiz: (quiz: QuizSet | null) => void;
  
  uploadDocument: (file: File, subjectId: string) => Promise<void>;
  addDocument: (subjectId: string, doc: Document) => Promise<void>;
  deleteDocument: (subjectId: string, docId: string) => Promise<void>;
  deleteChapter: (subjectId: string, docId: string, chapterId: string) => Promise<void>;
  addQuestions: (questions: Question[]) => Promise<void>;
  clearAllQuestionsAndSets: () => Promise<void>;
  clearQuestionsAndSetsForChapter: (chapterId: string) => Promise<void>;
  clearAllChaptersAndDocuments: () => Promise<void>;
  
  updateStats: (updates: Partial<UserStats>) => Promise<void>;
  resetStreak: () => Promise<void>;
  resetStats: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  apiKey: null,
  subjects: [],
  userStats: null,
  activeSubject: null,
  activeDocument: null,
  activeChapter: null,
  activeQuiz: null,
  isUploading: false,
  uploadError: "",
  uploadQuotaNotice: "",
  uploadSuccess: "",
  settings: (() => {
    try {
      // Enforce the new default settings from your screenshot as a clean update
      const migrationKey = "examship_settings_v3_migrated";
      const hasMigrated = localStorage.getItem(migrationKey);
      
      if (!hasMigrated) {
        localStorage.setItem("examship_settings", JSON.stringify(DEFAULT_SETTINGS));
        localStorage.setItem(migrationKey, "true");
        return DEFAULT_SETTINGS;
      }

      const saved = localStorage.getItem("examship_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.fontSize === "small" || parsed.fontSize === ("small" as any))) {
          parsed.fontSize = "medium";
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.warn("Could not load settings from localStorage", e);
    }
    return DEFAULT_SETTINGS;
  })(),

  initialize: async () => {
    try {
      await initDB().catch(e => console.warn("initDB hit an error:", e));
      let subjects = await getSubjects().catch(e => {
          console.warn("getSubjects failed, using default:", e);
          return null;
      });
      let userStats = await getUserStats().catch(e => {
          console.warn("getUserStats failed:", e);
          return { level: "Beginner" as const, xp: 0, streak: 0, totalCorrect: 0, totalWrong: 0, lastActive: Date.now(), attempts: [] };
      });
      const apiKey = await getApiKey();

      // Ensure subjects exist.
      if (!subjects || subjects.length === 0) {
          // If firestore read blocked us, use local defaults so UI doesn't break
          subjects = DEFAULT_SUBJECTS.map(s => ({
              ...s,
              id: "subj-" + s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              createdAt: Date.now(),
              documents: []
          }));
      }

      // Sort as requested
      const orderMap = new Map(DEFAULT_SUBJECTS.map((s, idx) => [s.name, idx]));
      subjects.sort((a, b) => {
          const idxA = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
          const idxB = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
          return idxA - idxB;
      });

      let subjectsUpdated = false;

      // 1. Auto-recover any orphaned physical uploads on the server!
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) {
          headers['x-gemini-api-key'] = apiKey;
        }

        const recoveryRes = await fetch("/api/recover-uploads", {
          method: "POST",
          headers,
          body: JSON.stringify({ subjects })
        });

        if (recoveryRes.ok) {
          const recoveryData = await recoveryRes.json();
          if (recoveryData && Array.isArray(recoveryData.recovered) && recoveryData.recovered.length > 0) {
            console.log(`[Recovery] Successfully retrieved ${recoveryData.recovered.length} recovered files from server!`);
            
            for (const doc of recoveryData.recovered) {
              const sub = subjects.find(s => s.id === doc.subjectId);
              if (sub) {
                if (!sub.documents) sub.documents = [];
                const exists = sub.documents.some(d => d.localPath === doc.localPath);
                if (!exists) {
                  sub.documents.push(doc);
                  subjectsUpdated = true;
                  console.log(`[Recovery] Restored document "${doc.name}" into subject "${sub.name}"!`);
                }
              }
            }
          }
        }
      } catch (recoveryErr) {
        console.warn("[Recovery] Failed to auto-recover physical files:", recoveryErr);
      }

      // SMART DATABASE SELF-HEALING / RECOVERY MIGRATION
      try {
        const allQuestions = await getQuestions().catch(() => [] as Question[]);
        const allQuizSets = await getQuizSets().catch(() => [] as QuizSet[]);

        let questionsUpdated = false;
        let quizSetsUpdated = false;

        // 1. Create a map of all currently existing active and deleted chapter IDs
        const activeChapterIds = new Set<string>();
        const activeChaptersByTitle = new Map<string, { ch: Chapter; doc: Document; sub: Subject }>();
        const chapterIdToSubjectMap = new Map<string, Subject>();

        subjects.forEach(sub => {
          if (sub.documents) {
            sub.documents.forEach(doc => {
              if (doc.chapters) {
                doc.chapters.forEach(ch => {
                  activeChapterIds.add(ch.id);
                  const cleanTitle = ch.title.toLowerCase().trim();
                  // Prefer active documents for mapping
                  if (!activeChaptersByTitle.has(cleanTitle) || !doc.isDeleted) {
                    activeChaptersByTitle.set(cleanTitle, { ch, doc, sub });
                  }
                  chapterIdToSubjectMap.set(ch.id, sub);
                });
              }
            });
          }
        });

        // 2. Map of old/orphaned chapterId to new active chapterId (for questions & quiz sets)
        const oldToNewChapterIdMap = new Map<string, string>();

        // Collect all unique chapterIds from questions, quiz sets, and attempts
        const questionChapterIds = new Set(allQuestions.map(q => q.chapterId));
        const quizSetChapterIds = new Set(allQuizSets.map(s => s.chapterId));
        const attemptChapterIds = new Set(userStats?.attempts?.map(a => a.chapterId) || []);

        const allUsedChapterIds = new Set([...questionChapterIds, ...quizSetChapterIds, ...attemptChapterIds]);

        // For each used chapterId, if it's NOT in activeChapterIds, it's orphaned!
        for (const orphanedId of allUsedChapterIds) {
          if (!orphanedId || activeChapterIds.has(orphanedId)) continue;

          console.log(`[Self-Healing] Detected orphaned chapter ID: ${orphanedId}`);

          // Try to find the title of this orphaned chapter
          let inferredTitle: string | null = null;
          let inferredSubjectName: string | null = null;

          // A. Check userStats attempts
          const attempt = userStats?.attempts?.find(a => a.chapterId === orphanedId);
          if (attempt && attempt.chapterTitle) {
            inferredTitle = attempt.chapterTitle;
          }

          // B. Check if any questions for this chapter have a topic tag
          const sampleQs = allQuestions.filter(q => q.chapterId === orphanedId);
          if (!inferredTitle && sampleQs.length > 0) {
            const tag = sampleQs.find(q => q.topicTag)?.topicTag;
            if (tag) {
              inferredTitle = tag;
            }
          }

          if (!inferredTitle) {
            inferredTitle = "Restored Chapter";
          }

          // Guess the subject of this orphaned chapter
          if (sampleQs.length > 0) {
            const qText = sampleQs.map(q => q.question + " " + q.explanation + " " + (q.topicTag || "")).join(" ").toLowerCase();
            if (qText.includes("physics") || qText.includes("velocity") || qText.includes("force") || qText.includes("motion") || qText.includes("gravity") || qText.includes("energy") || qText.includes("optics") || qText.includes("lens") || qText.includes("refraction") || qText.includes("newton")) {
              inferredSubjectName = "Physics";
            } else if (qText.includes("chemistry") || qText.includes("reaction") || qText.includes("acid") || qText.includes("periodic") || qText.includes("element") || qText.includes("atom") || qText.includes("molecule") || qText.includes("bonding") || qText.includes("gas")) {
              inferredSubjectName = "Chemistry";
            } else if (qText.includes("biology") || qText.includes("cell") || qText.includes("dna") || qText.includes("gene") || qText.includes("anatomy") || qText.includes("plant") || qText.includes("animal") || qText.includes("blood") || qText.includes("heart")) {
              inferredSubjectName = "Biology";
            } else if (qText.includes("english") || qText.includes("tense") || qText.includes("pronoun") || qText.includes("grammar") || qText.includes("verb") || qText.includes("adjective") || qText.includes("preposition") || qText.includes("comprehension")) {
              inferredSubjectName = "English";
            } else if (qText.includes("hindi") || qText.includes("व्याकरण") || qText.includes("संधि") || qText.includes("समास")) {
              inferredSubjectName = "Hindi";
            } else if (qText.includes("history") || qText.includes("ancient") || qText.includes("medieval") || qText.includes("battle") || qText.includes("king") || qText.includes("empire") || qText.includes("dynasty")) {
              inferredSubjectName = "Ancient History";
            }
          }

          if (!inferredSubjectName) {
            inferredSubjectName = "Physics";
          }

          let shouldDeleteOrphanedData = true;
          let isExplicitlyDeleted = false;

          try {
            const deletedIds = JSON.parse(localStorage.getItem('deleted_chapter_ids') || '[]');
            if (deletedIds.includes(orphanedId)) {
              isExplicitlyDeleted = true;
            }
          } catch(e) {}

          let belongsToDeletedDoc = false;
          subjects.forEach(sub => {
            sub.documents?.forEach(doc => {
              if (doc.isDeleted && doc.chapters?.some(c => c.id === orphanedId)) {
                belongsToDeletedDoc = true;
              }
            });
          });

          if (isExplicitlyDeleted || belongsToDeletedDoc) {
             shouldDeleteOrphanedData = true;
          } else {
            // Now, find if there is an ACTIVE chapter with a similar title in the database
            const cleanInferredTitle = inferredTitle.toLowerCase().trim();
            let matchingActive = activeChaptersByTitle.get(cleanInferredTitle);

            if (!matchingActive) {
              const matchingEntry = Array.from(activeChaptersByTitle.values()).find(entry => 
                areChaptersSimilar(entry.ch.title, inferredTitle!)
              );
              if (matchingEntry) {
                matchingActive = matchingEntry;
              }
            }

            if (matchingActive && !matchingActive.doc.isDeleted) {
              console.log(`[Self-Healing] Mapping orphaned ID ${orphanedId} to active chapter "${matchingActive.ch.title}" (ID: ${matchingActive.ch.id})`);
              oldToNewChapterIdMap.set(orphanedId, matchingActive.ch.id);
              shouldDeleteOrphanedData = false;
            }
          }

          if (shouldDeleteOrphanedData) {
            console.log(`[Self-Healing] Cleaning up orphaned data for deleted chapter ID: ${orphanedId}`);
            // Let the cleanup code below handle deletion by mapping it to a special "DELETE" token
            oldToNewChapterIdMap.set(orphanedId, "__DELETE__");
            
            // Also attempt to delete them permanently from Firestore / LocalStorage via the dedicated function
            try {
              clearQuestionsAndSetsForChapter(orphanedId).catch(() => {});
            } catch (err) {}
          }
        }

        // 3. Apply the oldToNewChapterIdMap to all questions
        let nextQuestions = allQuestions;
        if (oldToNewChapterIdMap.size > 0) {
          nextQuestions = allQuestions.filter(q => {
            const mappedId = oldToNewChapterIdMap.get(q.chapterId);
            return mappedId !== "__DELETE__";
          }).map(q => {
            const mappedId = oldToNewChapterIdMap.get(q.chapterId);
            if (mappedId && q.chapterId !== mappedId) {
              questionsUpdated = true;
              return { ...q, chapterId: mappedId };
            }
            return q;
          });
          if (nextQuestions.length !== allQuestions.length) questionsUpdated = true;
        }

        // 4. Apply the oldToNewChapterIdMap to all quiz sets
        let nextQuizSets = allQuizSets;
        if (oldToNewChapterIdMap.size > 0) {
          nextQuizSets = allQuizSets.filter(set => {
            const mappedId = oldToNewChapterIdMap.get(set.chapterId);
            return mappedId !== "__DELETE__";
          }).map(set => {
            const mappedId = oldToNewChapterIdMap.get(set.chapterId);
            if (mappedId && set.chapterId !== mappedId) {
              quizSetsUpdated = true;
              return { ...set, chapterId: mappedId };
            }
            return set;
          });
          if (nextQuizSets.length !== allQuizSets.length) quizSetsUpdated = true;
        }

        // 5. Apply to attempts
        if (userStats && userStats.attempts && oldToNewChapterIdMap.size > 0) {
          let attemptsUpdated = false;
          const nextAttempts = userStats.attempts.filter(att => {
            const mappedId = oldToNewChapterIdMap.get(att.chapterId);
            return mappedId !== "__DELETE__";
          }).map(att => {
            const mappedId = oldToNewChapterIdMap.get(att.chapterId);
            if (mappedId && att.chapterId !== mappedId) {
              attemptsUpdated = true;
              return { ...att, chapterId: mappedId };
            }
            return att;
          });
          if (nextAttempts.length !== userStats.attempts.length) attemptsUpdated = true;
          
          if (attemptsUpdated) {
            userStats.attempts = nextAttempts;
            await updateUserStats(userStats).catch(console.error);
          }
        }

        // 6. Save updates back to database
        if (subjectsUpdated) {
          await setLocalItem("examship_subjects", subjects).catch(console.error);
        }
        if (questionsUpdated) {
          await setLocalItem("examship_questions", nextQuestions).catch(console.error);
        }
        if (quizSetsUpdated) {
          await setLocalItem("examship_quiz_sets", nextQuizSets).catch(console.error);
        }
      } catch (err) {
        console.warn("Self-healing failed:", err);
      }

      setSoundEnabled(get().settings.soundEnabled);
      set({ subjects, userStats, apiKey, isInitialized: true });
    } catch (e) {
      console.error("Storage Error:", e);
      set({ isInitialized: true });
    }
  },

  setApiKey: async (key: string | null) => {
    await saveApiKey(key);
    set({ apiKey: key });
  },

  setActiveSubject: (subject) => set({ activeSubject: subject, activeDocument: null, activeChapter: null, activeQuiz: null }),
  setActiveDocument: (doc) => set({ activeDocument: doc, activeChapter: null, activeQuiz: null }),
  setActiveChapter: (chapter) => set({ activeChapter: chapter, activeQuiz: null }),
  setActiveQuiz: (quiz) => set({ activeQuiz: quiz }),

  uploadDocument: async (file: File, subjectId: string) => {
    try {
      set({ isUploading: true, uploadError: "", uploadQuotaNotice: "" });
      
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("File is too large. Please upload a PDF smaller than 100MB.");
      }

      const headers: Record<string, string> = {};
      const apiKey = get().apiKey;
      if (apiKey) {
        headers['x-gemini-api-key'] = apiKey;
      }

      let response;
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
      
      if (file.size > CHUNK_SIZE) {
        // Chunked upload
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const fileId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          
          const chunkFormData = new FormData();
          chunkFormData.append("chunk", chunk, file.name);
          chunkFormData.append("fileId", fileId);
          chunkFormData.append("chunkIndex", i.toString());
          
          const chunkResponse = await fetch("/api/upload-chunk", {
            method: "POST",
            body: chunkFormData
          });
          
          if (!chunkResponse.ok) {
            throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks}`);
          }
        }
        
        const subject = get().subjects.find(s => s.id === subjectId);
        const subjectName = subject ? subject.name : "";

        // Assemble and analyze
        response = await fetch("/api/analyze-pdf-chunked", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            fileId,
            totalChunks,
            originalname: file.name,
            mimetype: file.type,
            targetExams: "HSSC CET Group C, Group D, HSSC Constable, NCERT",
            subjectName
          })
        });

      } else {
        // Normal upload for small files
        const subject = get().subjects.find(s => s.id === subjectId);
        const subjectName = subject ? subject.name : "";

        const formData = new FormData();
        formData.append("file", file);
        formData.append("targetExams", "HSSC CET Group C, Group D, HSSC Constable, NCERT");
        formData.append("subjectName", subjectName);

        response = await fetch("/api/analyze-pdf", {
          method: "POST",
          headers,
          body: formData,
        });
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error("Non-JSON Response received:", responseText.substring(0, 200));
        if (response.status === 413) {
          throw new Error("File too large. Please upload a smaller PDF document.");
        } else if (response.status >= 500) {
          throw new Error(`Server timeout or proxy error (${response.status}). The document might be too large or complex for the current connection. Please try again with a smaller file.`);
        }
        throw new Error(response.ok 
          ? "Received invalid data from server (possibly HTML/Error page)." 
          : `Server returned ${response.status} with invalid format.`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error: ${response.status}`);
      }

      if (data.isQuotaFallback) {
        set({ uploadQuotaNotice: data.quotaNotice || data.message });
      }
      
      if (!data.analysis?.chapters || data.analysis.chapters.length === 0) {
        throw new Error("No chapters could be extracted from the document. The document might not have a clear structure or table of contents, or it might be unsupported for this subject.");
      }

      const newDoc = {
        id: "doc-" + Date.now() + Math.random().toString(36).substring(2, 9),
        subjectId: subjectId,
        name: file.name,
        size: file.size,
        uploadedAt: Date.now(),
        totalEstimatedQuestions: data.analysis.totalEstimatedQuestions || 0,
        fileUri: data.fileUri,
        mimeType: data.mimeType,
        localPath: data.localPath,
        chapters: data.analysis.chapters.map((c: any) => ({
           id: "ch-" + Date.now() + Math.random().toString(36).substring(2, 9),
           documentId: "", // Will be set next
           title: c.title,
           description: c.description,
           topics: c.topics,
           importantConcepts: c.importantConcepts || [],
           estimatedQuestions: c.estimatedQuestions || 20
        }))
      };
      
      newDoc.chapters.forEach((c: any) => c.documentId = newDoc.id);

      await get().addDocument(subjectId, newDoc as any);
      
      set({ uploadSuccess: `Successfully uploaded and structured "${file.name}"!` });
      setTimeout(() => {
        if (get().uploadSuccess === `Successfully uploaded and structured "${file.name}"!`) {
          set({ uploadSuccess: "" });
        }
      }, 5000);
      
    } catch (err: any) {
      set({ uploadError: err.message || "An error occurred during upload." });
    } finally {
      set({ isUploading: false });
    }
  },

  addDocument: async (subjectId, doc) => {
    try {
      const subjects = get().subjects;
      const subject = subjects.find(s => s.id === subjectId);
      if (!subject) return;

      const existingActiveDoc = subject.documents.find(d => d.name === doc.name && !d.isDeleted);
      if (existingActiveDoc) {
        throw new Error(`A document named "${doc.name}" has already been uploaded.`);
      }

      // Collect existing active chapters to check for similarity
      const existingChapters: Chapter[] = [];
      subject.documents.forEach(d => {
        if (!d.isDeleted && d.chapters) {
          existingChapters.push(...d.chapters);
        }
      });

      // Reuse existing chapter IDs if they are semantically similar!
      if (doc.chapters) {
        doc.chapters = doc.chapters.map(c => {
          const similar = existingChapters.find(existing => areChaptersSimilar(existing.title, c.title));
          if (similar) {
            return {
              ...c,
              id: similar.id
            };
          }
          return c;
        });
      }

      let newSubject;
      const existingDeletedDoc = subject.documents.find(d => d.name === doc.name && d.isDeleted);
      
      if (existingDeletedDoc) {
        // Revive it, updating the physical file info. If the existing document had no chapters,
        // or if the newly extracted chapters are non-empty, we use the newly extracted chapters.
        const useNewChapters = !existingDeletedDoc.chapters || existingDeletedDoc.chapters.length === 0 || (doc.chapters && doc.chapters.length > 0);
        const newDocs = subject.documents.map(d => 
          d.id === existingDeletedDoc.id ? { 
            ...d, 
            isDeleted: false, 
            fileUri: doc.fileUri, 
            localPath: doc.localPath, 
            size: doc.size, 
            mimeType: doc.mimeType,
            chapters: useNewChapters ? doc.chapters : d.chapters,
            totalEstimatedQuestions: useNewChapters ? doc.totalEstimatedQuestions : d.totalEstimatedQuestions
          } : d
        );
        newSubject = { ...subject, documents: newDocs };
      } else {
        newSubject = { ...subject, documents: [...subject.documents, doc] };
      }

      await saveSubject(newSubject);
      
      // refresh subjects
      const updated = await getSubjects();
      set({ subjects: updated });
      
      // update active if needed
      if (get().activeSubject?.id === subjectId) {
        set({ activeSubject: updated.find(s => s.id === subjectId) });
      }
    } catch (e) {
      console.warn("addDocument failed:", e);
    }
  },

  deleteDocument: async (subjectId, docId) => {
    try {
      const subjects = get().subjects;
      const subject = subjects.find(s => s.id === subjectId);
      if (!subject) return;

      const docToModify = subject.documents.find(d => d.id === docId);
      if (!docToModify) return;

      // Contact backend server to delete the physical source file permanently
      if (docToModify.localPath) {
        try {
          await fetch("/api/files/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: docToModify.localPath }),
          });
        } catch (e) {
          console.warn("[State Sync] Could not erase file from server:", e);
        }
      }

      // DO NOT delete the document object. Just remove the physical file refs so chapters are kept.
      const newDocuments = subject.documents.map(d => 
        d.id === docId ? { ...d, localPath: undefined, fileUri: undefined, size: 0, isDeleted: true } : d
      );
      const newSubject = { ...subject, documents: newDocuments };
      await saveSubject(newSubject);

      // refresh subjects
      const updated = await getSubjects();
      set({ subjects: updated });

      // update active if needed
      if (get().activeSubject?.id === subjectId) {
        const updatedSub = updated.find(s => s.id === subjectId) || null;
        set({ 
          activeSubject: updatedSub,
          // Do not nullify activeDocument or activeChapter since they are still preserved!
        });
      }
    } catch (e) {
      console.warn("deleteDocument failed:", e);
    }
  },

  deleteChapter: async (subjectId, docId, chapterId) => {
    try {
      const subjects = get().subjects;
      const subject = subjects.find(s => s.id === subjectId);
      if (!subject) return;

      const doc = subject.documents.find(d => d.id === docId);
      if (!doc) return;

      // 1. Remove the chapter from the document's chapters list
      const updatedChapters = (doc.chapters || []).filter(c => c.id !== chapterId);
      const updatedDocs = subject.documents.map(d =>
        d.id === docId ? { ...d, chapters: updatedChapters } : d
      );
      const updatedSubject = { ...subject, documents: updatedDocs };
      
      try {
        const deletedIds = JSON.parse(localStorage.getItem('deleted_chapter_ids') || '[]');
        if (!deletedIds.includes(chapterId)) {
          deletedIds.push(chapterId);
          localStorage.setItem('deleted_chapter_ids', JSON.stringify(deletedIds));
        }
      } catch(e) {}

      // 2. Save the updated subject to Firestore & local storage
      await saveSubject(updatedSubject);

      // 3. Delete questions and quiz sets permanently from local storage & Firestore
      await clearQuestionsAndSetsForChapter(chapterId).catch(err => {
        console.warn("Could not clear questions/quizsets for chapter:", err);
      });

      // 4. Clean up user statistics (attempts) for this chapter
      const userStats = get().userStats;
      if (userStats && userStats.attempts) {
        const filteredAttempts = userStats.attempts.filter(a => a.chapterId !== chapterId);
        const nextStats = {
          ...userStats,
          attempts: filteredAttempts
        };
        await setLocalItem("examship_user_stats", nextStats).catch(console.error);
        set({ userStats: nextStats });
      }

      // 5. Refresh subjects list from the database
      const updated = await getSubjects();
      set({ subjects: updated });

      // 6. Reset active state if the active chapter was the deleted one
      if (get().activeChapter?.id === chapterId) {
        set({ activeChapter: null });
      }

      // 7. Update active document and active subject to reflect the updated chapter list
      if (get().activeSubject?.id === subjectId) {
        const updatedSub = updated.find(s => s.id === subjectId) || null;
        set({
          activeSubject: updatedSub,
          activeDocument: updatedSub?.documents.find(d => d.id === docId) || null
        });
      }

      console.log(`[Store] Successfully deleted chapter ${chapterId} permanently.`);
    } catch (e) {
      console.warn("deleteChapter failed:", e);
    }
  },

  addQuestions: async (questions) => {
    try {
      await saveQuestions(questions);
    } catch (e) {
      console.warn("addQuestions failed:", e);
    }
  },

  clearAllQuestionsAndSets: async () => {
    try {
      await clearAllQuestionsAndSets();
    } catch (e) {
      console.warn("clearAllQuestionsAndSets failed:", e);
    }
  },

  clearQuestionsAndSetsForChapter: async (chapterId) => {
    try {
      await clearQuestionsAndSetsForChapter(chapterId);
    } catch (e) {
      console.warn("clearQuestionsAndSetsForChapter failed:", e);
    }
  },

  clearAllChaptersAndDocuments: async () => {
    try {
      console.log("[Wipe] Manual permanent wipe initiated...");
      
      // 1. Reset subjects to default subjects (which have empty documents)
      const freshSubjects = DEFAULT_SUBJECTS.map(s => ({
        ...s,
        id: "subj-" + s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        createdAt: Date.now(),
        documents: []
      }));
      await setLocalItem("examship_subjects", freshSubjects);
      
      // 2. Clear all questions and quiz sets permanently
      await clearAllQuestionsAndSets();

      // 3. Mark wipe completed
      localStorage.setItem("examship_chapters_wipe_v4_completed", "true");
      
      // 4. Update state
      set({
        subjects: freshSubjects,
        activeSubject: null,
        activeDocument: null,
        activeChapter: null,
        activeQuiz: null
      });
      
      console.log("[Wipe] Manual permanent wipe completed successfully.");
    } catch (e) {
      console.warn("clearAllChaptersAndDocuments failed:", e);
    }
  },

  updateStats: async (updates) => {
    try {
      await updateUserStats(updates);
      const updated = await getUserStats();
      set({ userStats: updated });
    } catch (e) {
      console.warn("updateStats failed:", e);
    }
  },

  resetStreak: async () => {
    try {
      const updated = await resetUserStreak();
      set({ userStats: updated });
    } catch (e) {
      console.warn("resetStreak failed:", e);
    }
  },

  resetStats: async () => {
    try {
      const updated = await resetUserStats();
      set({ userStats: updated });
    } catch (e) {
      console.warn("resetStats failed:", e);
    }
  },

  updateSettings: (updates) => {
    const newSettings = { ...get().settings, ...updates };
    set({ settings: newSettings });
    if (typeof updates.soundEnabled === "boolean") {
      setSoundEnabled(updates.soundEnabled);
    }
    try {
      localStorage.setItem("examship_settings", JSON.stringify(newSettings));
    } catch (e) {
      console.warn("Could not save settings to localStorage", e);
    }
  },

  resetSettings: () => {
    set({ settings: DEFAULT_SETTINGS });
    setSoundEnabled(DEFAULT_SETTINGS.soundEnabled);
    try {
      localStorage.setItem("examship_settings", JSON.stringify(DEFAULT_SETTINGS));
    } catch (e) {
      console.warn("Could not reset settings in localStorage", e);
    }
  }
}));
