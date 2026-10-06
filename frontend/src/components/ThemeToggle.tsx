import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme, type ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

// One-tap switch between the Obsidian (dark) and Sunroom (cream/sage/mustard) colour schemes.
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<ThemeName>(getTheme());

  const toggle = () => {
    const next: ThemeName = theme === "sunroom" ? "obsidian" : "sunroom";
    setTheme(next);
    setThemeState(next);
  };

  const sunroom = theme === "sunroom";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      data-testid="theme-toggle"
      title={`Switch to ${sunroom ? "Obsidian" : "Sunroom"} theme`}
      aria-label={`Switch to ${sunroom ? "Obsidian" : "Sunroom"} theme`}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      {sunroom ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="hidden sm:inline" data-testid="theme-toggle-label">
        {sunroom ? "Sunroom" : "Obsidian"}
      </span>
    </Button>
  );
}
