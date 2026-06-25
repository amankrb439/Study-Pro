import { AppTheme, ThemeId } from "../types";

export const APP_THEMES: AppTheme[] = [
  // NIGHT THEMES (3)
  {
    id: "midnight-obsidian",
    name: "Midnight Obsidian",
    mode: "night",
    description: "Deep obsidian black with electric indigo highlights and cosmic violet auras.",
    colors: {
      background: "#050811",
      surface: "rgba(255, 255, 255, 0.03)",
      surfaceHover: "rgba(255, 255, 255, 0.06)",
      border: "rgba(255, 255, 255, 0.08)",
      brand500: "#6366f1",
      brand600: "#4f46e5",
      textPrimary: "#ffffff",
      textSecondary: "#94a3b8",
      glassBg: "rgba(255, 255, 255, 0.03)",
      glassBorder: "rgba(255, 255, 255, 0.08)",
      mesh1: "rgba(99, 102, 241, 0.15)",
      mesh2: "rgba(168, 85, 247, 0.1)",
      colorScheme: "dark",
      accentColor: "#a855f7",
      badgeBg: "rgba(255, 255, 255, 0.05)"
    }
  },
  {
    id: "cosmic-ocean",
    name: "Cosmic Ocean",
    mode: "night",
    description: "Abyssal marine blue paired with bright cyan and glowing lagoon green splashes.",
    colors: {
      background: "#030f1e",
      surface: "rgba(14, 165, 233, 0.04)",
      surfaceHover: "rgba(14, 165, 233, 0.08)",
      border: "rgba(14, 165, 233, 0.12)",
      brand500: "#0ea5e9",
      brand600: "#0284c7",
      textPrimary: "#f8fafc",
      textSecondary: "#38bdf8",
      glassBg: "rgba(3, 15, 30, 0.7)",
      glassBorder: "rgba(14, 165, 233, 0.15)",
      mesh1: "rgba(14, 165, 233, 0.2)",
      mesh2: "rgba(16, 185, 129, 0.15)",
      colorScheme: "dark",
      accentColor: "#10b981",
      badgeBg: "rgba(14, 165, 233, 0.08)"
    }
  },
  {
    id: "solar-storm",
    name: "Solar Storm",
    mode: "night",
    description: "Volcanic eclipse charcoal with crackling magnetic neon gold and amber embers.",
    colors: {
      background: "#0d0b07",
      surface: "rgba(245, 158, 11, 0.04)",
      surfaceHover: "rgba(245, 158, 11, 0.08)",
      border: "rgba(245, 158, 11, 0.12)",
      brand500: "#f59e0b",
      brand600: "#d97706",
      textPrimary: "#fffbeb",
      textSecondary: "#fbbf24",
      glassBg: "rgba(13, 11, 7, 0.8)",
      glassBorder: "rgba(245, 158, 11, 0.15)",
      mesh1: "rgba(245, 158, 11, 0.18)",
      mesh2: "rgba(239, 68, 68, 0.12)",
      colorScheme: "dark",
      accentColor: "#ef4444",
      badgeBg: "rgba(245, 158, 11, 0.08)"
    }
  },
  // DAY THEMES (3)
  {
    id: "ivory-scholastic",
    name: "Ivory Scholastic",
    mode: "day",
    description: "A premium academic aesthetic. Alabaster warm cream paper background, pure bone-white surfaces with fine cashmere borders and rich royal sapphire ink highlights.",
    colors: {
      background: "#FAF8F5",
      surface: "#FFFFFF",
      surfaceHover: "#F5F2EC",
      border: "#EBE7E0",
      brand500: "#1E3A8A",
      brand600: "#172554",
      textPrimary: "#0F172A",
      textSecondary: "#475569",
      glassBg: "rgba(255, 255, 255, 0.88)",
      glassBorder: "rgba(30, 58, 138, 0.09)",
      mesh1: "rgba(30, 58, 138, 0.06)",
      mesh2: "rgba(99, 102, 241, 0.04)",
      colorScheme: "light",
      accentColor: "#3B82F6",
      badgeBg: "rgba(30, 58, 138, 0.05)"
    }
  },
  {
    id: "emerald-garden",
    name: "Emerald Garden",
    mode: "day",
    description: "A serene, clean botanical theme. Fresh sage mint background, pure snow-white card surfaces, paired with deep rejuvenating pine forest green highlights.",
    colors: {
      background: "#F1F6F4",
      surface: "#FFFFFF",
      surfaceHover: "#E5EFEA",
      border: "#D1E0D9",
      brand500: "#064E3B",
      brand600: "#022C22",
      textPrimary: "#0B130E",
      textSecondary: "#405C50",
      glassBg: "rgba(255, 255, 255, 0.88)",
      glassBorder: "rgba(6, 78, 59, 0.09)",
      mesh1: "rgba(6, 78, 59, 0.05)",
      mesh2: "rgba(16, 185, 129, 0.04)",
      colorScheme: "light",
      accentColor: "#10B981",
      badgeBg: "rgba(6, 78, 59, 0.05)"
    }
  },
  {
    id: "sunset-rose",
    name: "Sunset Rose",
    mode: "day",
    description: "A luxurious champagne-rose luxury brand feel. Delicate warm rosewater champagne background, pure card surfaces, paired with gorgeous burgundy & raspberry accents.",
    colors: {
      background: "#FAF5F4",
      surface: "#FFFFFF",
      surfaceHover: "#F5ECE9",
      border: "#EFE0DD",
      brand500: "#881337",
      brand600: "#4C0519",
      textPrimary: "#1E1B4B",
      textSecondary: "#6E5A58",
      glassBg: "rgba(255, 255, 255, 0.88)",
      glassBorder: "rgba(136, 19, 55, 0.09)",
      mesh1: "rgba(244, 63, 94, 0.06)",
      mesh2: "rgba(245, 158, 11, 0.04)",
      colorScheme: "light",
      accentColor: "#F43F5E",
      badgeBg: "rgba(136, 19, 55, 0.05)"
    }
  }
];

export function getTheme(id: ThemeId): AppTheme {
  return APP_THEMES.find(t => t.id === id) || APP_THEMES[0];
}

export function applyThemeVariables(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  
  // Set fundamental colors
  root.style.setProperty("--color-background", theme.colors.background);
  root.style.setProperty("--color-surface", theme.colors.surface);
  root.style.setProperty("--color-surface-hover", theme.colors.surfaceHover);
  root.style.setProperty("--color-border", theme.colors.border);
  root.style.setProperty("--color-brand-500", theme.colors.brand500);
  root.style.setProperty("--color-brand-600", theme.colors.brand600);
  root.style.setProperty("--text-primary", theme.colors.textPrimary);
  root.style.setProperty("--text-secondary", theme.colors.textSecondary);
  
  // Apply glass and mesh backgrounds dynamically
  root.style.setProperty("--glass-bg", theme.colors.glassBg);
  root.style.setProperty("--glass-border", theme.colors.glassBorder);
  root.style.setProperty("--mesh-1", theme.colors.mesh1);
  root.style.setProperty("--mesh-2", theme.colors.mesh2);
  root.style.setProperty("--accent-color", theme.colors.accentColor);
  root.style.setProperty("--badge-bg", theme.colors.badgeBg);
  
  // Update HTML-level properties
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-mode", theme.mode);
  root.style.colorScheme = theme.colors.colorScheme;
  if (theme.mode === "night") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
