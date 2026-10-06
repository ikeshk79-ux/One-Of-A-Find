import { useState } from "react";
import { Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme, type ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Lightweight cycle button for the top bar: forest-light → forest-dark → obsidian → sunroom → forest-light.
// The More screen offers an explicit picker; this is the one-tap convenience version.
const ORDER: readonly ThemeName[] = ["forest-light", "forest-dark", "obsidian", "sunroom"] as const;

const META: Record<ThemeName, { label: string; next: ThemeName; Icon: typeof Sun }> = {
  "forest-light": { label: "Light", next: "forest-dark", Icon: Sun },
  "forest-dark": { label: "Dark", next: "obsidian", Icon: Moon },
  obsidian: { label: "Obsidian", next: "sunroom", Icon: Palette },
  sunroom: { label: "Sunroom", next: "forest-light", Icon: Palette },
};

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<ThemeName>(getTheme());
  const meta = META[theme] ?? META["forest-light"];
  const toggle = () => {
    const next = ORDER.includes(theme) ? meta.next : ORDER[0];
    setTheme(next);
    setThemeState(next);
  };
  const Icon = meta.Icon;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      data-testid="theme-toggle"
      title={`Theme: ${meta.label} (tap to change)`}
      aria-label={`Theme: ${meta.label}. Tap to change.`}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      <Icon className="size-4" />
      <span className="hidden sm:inline" data-testid="theme-toggle-label">
        {meta.label}
      </span>
    </Button>
  );
}
