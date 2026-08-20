import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

function ThemeColourSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    document.querySelectorAll<HTMLMetaElement>('meta[data-theme-color]').forEach((meta) => {
      if (meta.dataset.themeColor === resolvedTheme) meta.removeAttribute("media");
      else meta.setAttribute("media", "not all");
    });
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeColourSync />
      {children}
    </NextThemesProvider>
  );
}
