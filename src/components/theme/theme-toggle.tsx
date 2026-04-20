"use client";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const THEME_KEY = "portal-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  window.localStorage.setItem(THEME_KEY, theme);
}

export function ThemeToggle() {
  const toggleTheme = () => {
    const theme = readTheme();
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      Theme
    </Button>
  );
}
