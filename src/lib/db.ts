import { Subject, Document, Chapter, Question, QuizSet, UserStats } from "../types";
import { db, auth } from "./firebase";
import { 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  collection, 
  query, 
  where, 
  writeBatch,
  disableNetwork
} from "firebase/firestore";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const DEFAULT_SUBJECTS: Omit<Subject, 'id' | 'createdAt'>[] = [
  { name: "Ancient History", description: "Ancient Indian History & Archaeological Heritage", icon: "Landmark", color: "bg-amber-500", documents: [] },
  { name: "Medieval History", description: "Medieval Indian Dynasties, Art & Architecture", icon: "Shield", color: "bg-amber-600", documents: [] },
  { name: "Modern History", description: "Modern Indian Freedom Struggle & National Movement", icon: "Compass", color: "bg-amber-700", documents: [] },
  { name: "Physics", description: "Newtonian Mechanics, Gravitation & Physical Laws", icon: "Atom", color: "bg-sky-500", documents: [] },
  { name: "Chemistry", description: "Periodic trends, Chemical Bonding & Reactions", icon: "FlaskConical", color: "bg-teal-500", documents: [] },
  { name: "Biology", description: "Cell biology, genetics, human anatomy and life processes", icon: "Dna", color: "bg-emerald-500", documents: [] },
  { name: "Geography", description: "Indian and World Geography", icon: "Globe", color: "bg-emerald-500", documents: [] },
  { name: "Economics", description: "Indian and Global Economy", icon: "TrendingUp", color: "bg-green-600", documents: [] },
  { name: "Haryana GK", description: "General Knowledge of Haryana State", icon: "Map", color: "bg-orange-500", documents: [] },
  { name: "Computer", description: "Computer Knowledge and IT Essentials", icon: "Monitor", color: "bg-slate-500", documents: [] },
  { name: "Hindi", description: "Hindi Grammar and Literature", icon: "Type", color: "bg-red-500", documents: [] },
  { name: "English", description: "English Grammar & Comprehension", icon: "Languages", color: "bg-indigo-500", documents: [] }
];

let dbCache: Record<string, any> = {};

function _readFromLocal<T>(key: string, defaultValue: T): T {
  try {
    const localVal = localStorage.getItem(key);
    if (localVal !== null) {
      const parsed = JSON.parse(localVal);
      dbCache[key] = parsed;
      return parsed;
    }
  } catch (e) {
    console.error(`Failed to read fallback ${key} from localStorage:`, e);
    try {
      localStorage.removeItem(key);
      console.log(`[Self-Healing] Removed corrupted localStorage key: ${key}`);
    } catch (clearErr) {}
  }
  return defaultValue;
}

// Helper to run any promise with a timeout
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage = "Operation timed out"): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

// Helper to get raw data from Firestore with high-fidelity localStorage fallback
export async function getLocalItem<T>(key: string, defaultValue: T): Promise<T> {
  if (dbCache[key] !== undefined) {
    return dbCache[key];
  }

  if (firestoreQuotaExceeded) {
    return _readFromLocal(key, defaultValue);
  }

  // 1. Try to read from Firestore (with a 3-second timeout so we don't hang if offline/poor connection)
  try {
    let firestoreValue: any = null;
    let found = false;

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Firestore timeout (3s)")), 3000)
    );

    if (key === "examship_subjects") {
      const getPromise = getDocs(collection(db, "subjects"));
      const snapshot = await Promise.race([getPromise, timeoutPromise]);
      const subjects: Subject[] = [];
      snapshot.forEach(doc => {
        subjects.push(doc.data() as Subject);
      });
      if (subjects.length > 0) {
        firestoreValue = subjects;
        found = true;
      }
    } else if (key === "examship_quiz_sets") {
      const getPromise = getDocs(collection(db, "quiz_sets"));
      const snapshot = await Promise.race([getPromise, timeoutPromise]);
      const quizSets: QuizSet[] = [];
      snapshot.forEach(doc => {
        quizSets.push(doc.data() as QuizSet);
      });
      if (quizSets.length > 0) {
        firestoreValue = quizSets;
        found = true;
      }
    } else if (key === "examship_questions") {
      const getPromise = getDocs(collection(db, "questions"));
      const snapshot = await Promise.race([getPromise, timeoutPromise]);
      const questions: Question[] = [];
      snapshot.forEach(doc => {
        questions.push(doc.data() as Question);
      });
      if (questions.length > 0) {
        firestoreValue = questions;
        found = true;
      }
    } else if (key === "examship_user_stats") {
      const getPromise = getDoc(doc(db, "global_stats", "public_stats"));
      const snap = await Promise.race([getPromise, timeoutPromise]);
      if (snap.exists()) {
        firestoreValue = snap.data();
        found = true;
      }
    } else {
      const getPromise = getDoc(doc(db, "appData", key));
      const docSnap = await Promise.race([getPromise, timeoutPromise]);
      if (docSnap.exists()) {
        firestoreValue = docSnap.data().value;
        found = true;
      }
    }

    if (found) {
      dbCache[key] = firestoreValue;
      // Sync to localStorage as a local backup
      try {
        localStorage.setItem(key, JSON.stringify(firestoreValue));
      } catch (err) {}
      return firestoreValue as T;
    }
  } catch (e) {
    console.warn(`Failed to fetch ${key} from Firestore. Falling back to localStorage. Error:`, e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource-exhausted")) {
      handleQuotaExceeded();
    } else if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("insufficient")) {
      handleFirestoreError(e, OperationType.GET, key);
    }
  }

  // 2. Fall back to local storage replica
  return _readFromLocal(key, defaultValue);
}

let firestoreQuotaExceeded = false;
try {
  const quotaFlag = localStorage.getItem('firestore_quota_exceeded');
  if (quotaFlag && Date.now() < parseInt(quotaFlag)) {
    firestoreQuotaExceeded = true;
  } else {
    localStorage.removeItem('firestore_quota_exceeded');
  }
} catch (e) {}

function handleQuotaExceeded() {
  if (!firestoreQuotaExceeded) {
    console.warn("Firestore quota exceeded. Disabling cloud sync. Data will be saved locally.");
    firestoreQuotaExceeded = true;
    try {
      localStorage.setItem('firestore_quota_exceeded', (Date.now() + 12 * 3600 * 1000).toString());
      disableNetwork(db).catch(err => console.warn("Failed to disable network:", err));
    } catch (e) {}
  }
}

// Helper to set item in Firestore with local backup
export async function setLocalItem<T>(key: string, value: T) {
  dbCache[key] = value;
  
  // 1. Always store a backup in localStorage immediately for maximum offline resilience
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not save backup copy of ${key} to localStorage:`, e);
  }

  if (firestoreQuotaExceeded) {
    return;
  }

  // 2. Update Firestore and await the write to guarantee permanent saving
  try {
    if (key === "examship_subjects" && Array.isArray(value)) {
      const batch = writeBatch(db);
      value.forEach((sub: any) => {
        const docRef = doc(db, "subjects", sub.id);
        batch.set(docRef, JSON.parse(JSON.stringify(sub)));
      });
      await withTimeout(batch.commit(), 15000, "Firestore subjects batch commit timeout");
    } else if (key === "examship_quiz_sets" && Array.isArray(value)) {
      const batch = writeBatch(db);
      value.forEach((qs: any) => {
        const docRef = doc(db, "quiz_sets", qs.id);
        batch.set(docRef, JSON.parse(JSON.stringify(qs)));
      });
      await withTimeout(batch.commit(), 15000, "Firestore quiz sets batch commit timeout");
    } else if (key === "examship_questions" && Array.isArray(value)) {
      const batchSize = 400;
      for (let i = 0; i < value.length; i += batchSize) {
        const chunk = value.slice(i, i + batchSize);
        const subBatch = writeBatch(db);
        chunk.forEach((q: any) => {
          const docRef = doc(db, "questions", q.id);
          subBatch.set(docRef, JSON.parse(JSON.stringify(q)));
        });
        await withTimeout(subBatch.commit(), 15000, "Firestore questions subbatch commit timeout");
      }
    } else if (key === "examship_user_stats") {
      const docRef = doc(db, "global_stats", "public_stats");
      await withTimeout(setDoc(docRef, JSON.parse(JSON.stringify(value))), 10000, "Firestore user stats setDoc timeout");
    } else {
      const docRef = doc(db, "appData", key);
      const sanitizedValue = value !== undefined ? JSON.parse(JSON.stringify(value)) : null;
      await withTimeout(setDoc(docRef, { value: sanitizedValue }), 10000, "Firestore general setDoc timeout");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isExpectedNetworkIssue = msg.toLowerCase().includes("quota") || 
                                   msg.toLowerCase().includes("resource-exhausted") || 
                                   msg.toLowerCase().includes("timeout");
    
    if (isExpectedNetworkIssue) {
      console.warn(`Firestore offline fallback triggered for ${key}:`, msg);
      handleQuotaExceeded();
    } else {
      console.error(`Firestore write failed for ${key}:`, e);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("insufficient")) {
        handleFirestoreError(e, OperationType.WRITE, key);
      }
    }
  }
}

export async function initDB() {
  const subjects = await getSubjects();
  if (subjects.length === 0) {
    const freshSubjects: Subject[] = DEFAULT_SUBJECTS.map((s) => ({
      ...s,
      id: "subj-" + s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      createdAt: Date.now(),
      documents: [],
    }));
    await setLocalItem("examship_subjects", freshSubjects);
  }
}

export async function getSubjects(): Promise<Subject[]> {
  return await getLocalItem<Subject[]>("examship_subjects", []);
}

export async function saveSubject(subject: Subject) {
  const subjects = await getSubjects();
  const index = subjects.findIndex((s) => s.id === subject.id);
  if (index !== -1) {
    subjects[index] = subject;
  } else {
    subjects.push(subject);
  }
  await setLocalItem("examship_subjects", subjects);
}

export async function getQuestions(chapterId?: string): Promise<Question[]> {
  const all = await getLocalItem<Question[]>("examship_questions", []);
  if (chapterId) {
    return all.filter((q) => q.chapterId === chapterId);
  }
  return all;
}

export async function saveQuestions(newQuestions: Question[]) {
  if (newQuestions.length === 0) return;
  const existing = await getQuestions();
  
  const existingMap = new Set(existing.map((q) => `${q.chapterId}_${q.question}`));
  const uniqueNew = newQuestions.filter((q) => !existingMap.has(`${q.chapterId}_${q.question}`));
  
  const updated = [...existing, ...uniqueNew];
  await setLocalItem("examship_questions", updated);
}

export async function clearAllQuestionsAndSets() {
  await setLocalItem("examship_questions", []);
  await setLocalItem("examship_quiz_sets", []);
}

export async function clearQuestionsAndSetsForChapter(chapterId: string) {
  const existingQuestions = await getQuestions();
  const questionsToDelete = existingQuestions.filter((q) => q.chapterId === chapterId);
  const filteredQuestions = existingQuestions.filter((q) => q.chapterId !== chapterId);
  await setLocalItem("examship_questions", filteredQuestions);

  const existingSets = await getQuizSets();
  const setsToDelete = existingSets.filter((s) => s.chapterId === chapterId);
  const filteredSets = existingSets.filter((s) => s.chapterId !== chapterId);
  await setLocalItem("examship_quiz_sets", filteredSets);

  if (firestoreQuotaExceeded) {
    return;
  }

  // Permanently delete the specific filtered-out questions and sets from Firestore
  try {
    const batch = writeBatch(db);
    questionsToDelete.forEach((q) => {
      const docRef = doc(db, "questions", q.id);
      batch.delete(docRef);
    });
    setsToDelete.forEach((s) => {
      const docRef = doc(db, "quiz_sets", s.id);
      batch.delete(docRef);
    });
    await withTimeout(batch.commit(), 15000, "Firestore clear batch commit timeout");
    console.log(`[Firestore] Permanently deleted ${questionsToDelete.length} questions and ${setsToDelete.length} quiz sets for chapter: ${chapterId}`);
  } catch (err: any) {
    console.warn("[Firestore] Failed to batch delete chapter records:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("resource-exhausted") || msg.toLowerCase().includes("timeout")) {
      handleQuotaExceeded();
    }
  }
}

export async function getQuizSets(chapterId?: string): Promise<QuizSet[]> {
  const all = await getLocalItem<QuizSet[]>("examship_quiz_sets", []);
  if (chapterId) {
    return all.filter((s) => s.chapterId === chapterId);
  }
  return all;
}

export async function saveQuizSet(set: QuizSet) {
  const existing = await getQuizSets();
  const index = existing.findIndex((s) => s.id === set.id);
  if (index !== -1) {
    existing[index] = set;
  } else {
    existing.push(set);
  }
  await setLocalItem("examship_quiz_sets", existing);
}

export function calculateStreakFromAttempts(attempts: { playedAt: number }[], streakResetAt?: number): number {
  if (!attempts || attempts.length === 0) return 0;
  
  const validAttempts = streakResetAt
    ? attempts.filter(att => att.playedAt > streakResetAt)
    : attempts;

  if (validAttempts.length === 0) return 0;
  
  const getLocalDateString = (timestamp: number): string => {
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const dates = validAttempts.map((att) => getLocalDateString(att.playedAt));
  const uniqueDates = Array.from(new Set(dates));
  uniqueDates.sort((a, b) => b.localeCompare(a));

  const todayStr = getLocalDateString(Date.now());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday.getTime());

  if (!uniqueDates.includes(todayStr) && !uniqueDates.includes(yesterdayStr)) {
    return 0;
  }

  let currentCheck = new Date();
  if (!uniqueDates.includes(todayStr)) {
    currentCheck.setDate(currentCheck.getDate() - 1);
  }

  let streakCount = 0;
  while (true) {
    const checkStr = getLocalDateString(currentCheck.getTime());
    if (uniqueDates.includes(checkStr)) {
      streakCount++;
      currentCheck.setDate(currentCheck.getDate() - 1);
    } else {
      break;
    }
  }

  return streakCount;
}

export async function getUserStats(): Promise<UserStats> {
  const initialStats: UserStats = { level: "Beginner", xp: 0, streak: 0, totalCorrect: 0, totalWrong: 0, lastActive: Date.now(), attempts: [] };
  const stats = await getLocalItem<UserStats>("examship_user_stats", initialStats);
  
  const calculatedStreak = calculateStreakFromAttempts(stats.attempts || [], stats.streakResetAt);
  if (stats.streak !== calculatedStreak) {
    stats.streak = calculatedStreak;
    await setLocalItem("examship_user_stats", stats);
  }
  return stats;
}

export async function updateUserStats(updates: Partial<UserStats>) {
  const stats = await getUserStats();
  
  let nextAttempts = stats.attempts || [];
  if (updates.attempts) {
    nextAttempts = [...nextAttempts, ...updates.attempts];
  }

  let newXp = (stats.xp || 0) + (updates.xp || 0);
  let newLevel: UserStats["level"] = "Beginner";
  if (newXp >= 5000) newLevel = "Legend";
  else if (newXp >= 2500) newLevel = "Master";
  else if (newXp >= 1000) newLevel = "Expert";
  else if (newXp >= 300) newLevel = "Scholar";
  
  const mergedUpdates = { ...updates };
  delete mergedUpdates.attempts;

  const calculatedStreak = calculateStreakFromAttempts(nextAttempts, stats.streakResetAt);

  const nextStats = { 
    ...stats, 
    ...mergedUpdates, 
    xp: newXp, 
    level: newLevel,
    streak: calculatedStreak,
    attempts: nextAttempts
  };
  
  await setLocalItem("examship_user_stats", nextStats);
}

export async function resetUserStreak(): Promise<UserStats> {
  const stats = await getUserStats();
  const nextStats: UserStats = {
    ...stats,
    streak: 0,
    streakResetAt: Date.now()
  };
  await setLocalItem("examship_user_stats", nextStats);
  return nextStats;
}

export async function resetUserStats(): Promise<UserStats> {
  const initialStats: UserStats = { 
    level: "Beginner", 
    xp: 0, 
    streak: 0, 
    totalCorrect: 0, 
    totalWrong: 0, 
    lastActive: Date.now(), 
    attempts: [],
    streakResetAt: undefined
  };
  await setLocalItem("examship_user_stats", initialStats);
  return initialStats;
}

// Global API Key fallback
export async function getApiKey(): Promise<string | null> {
  try {
    return localStorage.getItem("gemini_api_key");
  } catch (e) {
    console.warn("Could not read gemini_api_key from localStorage", e);
    return null;
  }
}

export async function saveApiKey(key: string | null) {
  try {
    if (key) {
      localStorage.setItem("gemini_api_key", key);
    } else {
      localStorage.removeItem("gemini_api_key");
    }
  } catch (e) {
    console.warn("Could not write gemini_api_key to localStorage", e);
  }
}

