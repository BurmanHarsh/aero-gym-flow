import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "aerogym-theme";

function applyTheme(t: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? "dark";
    setThemeState(stored);
    applyTheme(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const cur = (localStorage.getItem(KEY) as Theme | null) ?? "dark";
      if (cur === "system") applyTheme("system");
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
    applyTheme(t);
  };

  return { theme, setTheme };
}
