"use client";

import { useTheme, type ThemePreference } from "@/components/theme/theme-provider";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return <label className="relative"><span className="sr-only">Tema da interface</span><select value={theme} onChange={(event) => setTheme(event.target.value as ThemePreference)} className="h-10 max-w-28 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-muted outline-none hover:bg-soft focus:border-brand" aria-label="Tema da interface"><option value="light">Claro</option><option value="dark">Escuro</option><option value="system">Automático</option></select></label>;
}
