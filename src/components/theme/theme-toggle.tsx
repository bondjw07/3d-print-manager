"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const THEME_KEY = "portal-theme";
const THEME_COOKIE = "portal-theme";

function writeThemeCookie(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_KEY, theme);
  writeThemeCookie(theme);
}

export function ThemeToggle() {
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") {
        if (stored !== readTheme()) {
          applyTheme(stored);
        } else {
          writeThemeCookie(stored);
        }
        return;
      }
    } catch {
      // Ignore localStorage access failures.
    }

    writeThemeCookie(readTheme());
  }, []);

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
