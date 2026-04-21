"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
type ThemeToggleMode = "button" | "menu-item";

type ThemeToggleProps = {
  mode?: ThemeToggleMode;
  className?: string;
  initialTheme?: Theme;
  onToggle?: () => void;
};

const THEME_KEY = "portal-theme";
const THEME_COOKIE = "portal-theme";

function writeThemeCookie(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_KEY, theme);
  writeThemeCookie(theme);
}

export function ThemeToggle({
  mode = "button",
  className,
  initialTheme = "light",
  onToggle,
}: ThemeToggleProps = {}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
    onToggle?.();
  };

  if (mode === "menu-item") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle dark mode"
        title="Toggle dark mode"
        className={cn(
          "w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-muted",
          className,
        )}
      >
        {theme === "dark" ? "Light Theme" : "Dark Theme"}
      </button>
    );
  }

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
