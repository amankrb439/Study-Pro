export interface Subject {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide class or identifier
  color: string;
  documents: Document[];
  createdAt: number;
}

export interface Document {
  id: string;
  subjectId: string;
  name: string;
  size: number;
  uploadedAt: number;
  totalEstimatedQuestions: number;
  chapters: Chapter[];
  fileUri?: string;
  mimeType?: string;
  localPath?: string;
  isDeleted?: boolean;
}

export interface Chapter {
  id: string;
  documentId: string;
  title: string;
  description: string;
  topics: string[];
  importantConcepts: string[];
  estimatedQuestions: number;
  part?: string;
}

export interface Question {
  id: string;
  chapterId: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  topicTag: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  sourceReference: string;
  createdAt: number;
}

export interface QuizSet {
  id: string;
  chapterId: string;
  name: string;
  questionIds: string[];
  createdAt: number;
  bestScore?: number;
  bestCorrectCount?: number;
  bestTotalCount?: number;
  lastPlayedAt?: number;
}

export interface QuizAttempt {
  id: string;
  chapterId: string;
  chapterTitle: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  playedAt: number;
}

export interface UserStats {
  level: "Beginner" | "Scholar" | "Expert" | "Master" | "Legend";
  xp: number;
  streak: number;
  totalCorrect: number;
  totalWrong: number;
  lastActive: number;
  attempts?: QuizAttempt[];
  streakResetAt?: number;
}

export type FontSizeOption = "medium" | "large" | "xl";

export type ThemeId = 
  | "ivory-scholastic" 
  | "emerald-garden" 
  | "sunset-rose" 
  | "midnight-obsidian" 
  | "cosmic-ocean" 
  | "solar-storm";

export interface AppTheme {
  id: ThemeId;
  name: string;
  mode: "day" | "night";
  description: string;
  colors: {
    background: string;
    surface: string;
    surfaceHover: string;
    border: string;
    brand500: string;
    brand600: string;
    textPrimary: string;
    textSecondary: string;
    glassBg: string;
    glassBorder: string;
    mesh1: string;
    mesh2: string;
    colorScheme: "light" | "dark";
    accentColor: string;
    badgeBg: string;
  };
}

export interface AppSettings {
  fontSize: FontSizeOption;
  autoAdvanceOnTimeout: boolean;
  autoNextOnAnswer: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  themeId: ThemeId;
}

