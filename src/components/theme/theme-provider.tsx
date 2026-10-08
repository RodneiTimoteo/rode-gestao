"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ThemeContextValue = { theme: ThemePreference; setTheme: (theme: ThemePreference) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const saved = window.localStorage.getItem("rode-theme");
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

function applyTheme(theme: ThemePreference) {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => theme === "system" && applyTheme("system");
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, [theme]);

  function setTheme(value: ThemePreference) {
    window.localStorage.setItem("rode-theme", value);
    applyTheme(value);
    setThemeState(value);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme deve ser usado dentro de ThemeProvider.");
  return context;
}
