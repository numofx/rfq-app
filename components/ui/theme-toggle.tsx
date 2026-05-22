"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-border/70 bg-panel-2/70 text-text ring-1 ring-white/10 hover:bg-panel-2"
      aria-label="Toggle theme"
    >
      <Sun className="h-[20px] w-[20px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[20px] w-[20px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}
