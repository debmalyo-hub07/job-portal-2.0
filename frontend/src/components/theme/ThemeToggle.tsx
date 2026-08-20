import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, theme, setTheme } = useTheme();
  // next-themes resolves the theme only on the client; render a placeholder
  // until mounted so the icon can't disagree with the applied class.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Button variant="ghost" size="icon" className={className} aria-hidden />;

  const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
  const label = next === "system" ? "system preference" : `${next} theme`;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(className)}
      aria-label={`Switch to ${label}`}
      title={`Switch to ${label}`}
      onClick={() => setTheme(next)}
    >
      {theme === "system" ? (
        <Monitor aria-hidden="true" />
      ) : resolvedTheme === "dark" ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
    </Button>
  );
}
