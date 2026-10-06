import { Link, useLocation } from "react-router-dom";
import { Camera, Compass, Home, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  testid: string;
  matches?: readonly string[];
};

// Four-tab mobile bottom nav with a floating Scan button in the centre.
// Scan is the primary action; the other three are plain tabs.
const NAV: readonly NavItem[] = [
  { to: "/", label: "Home", icon: Home, testid: "tab-home", matches: ["/", "/home"] },
  { to: "/finds", label: "Finds", icon: Compass, testid: "tab-finds", matches: ["/finds", "/inventory"] },
  { to: "/more", label: "More", icon: Menu, testid: "tab-more", matches: ["/more", "/activity", "/volunteers"] },
] as const;

function isActive(item: NavItem, path: string): boolean {
  if (item.matches) return item.matches.some((m) => (m === "/" ? path === "/" : path.startsWith(m)));
  return path === item.to;
}

export default function BottomNavigation() {
  const { pathname } = useLocation();
  const scanActive = pathname.startsWith("/scan");

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-xl sm:hidden"
      data-testid="bottom-navigation"
      aria-label="Primary navigation"
    >
      <div className="relative mx-auto grid max-w-md grid-cols-4 items-end px-2 pb-[max(env(safe-area-inset-bottom,0px),8px)] pt-2">
        <NavTab item={NAV[0]} active={isActive(NAV[0], pathname)} />
        {/* Spacer for the centred Scan button */}
        <div className="relative">
          <Link
            to="/scan"
            data-testid="tab-scan"
            aria-label="Scan an item"
            className={cn(
              "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6 touch-target",
              "grid size-14 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg",
              "transition-transform duration-200 active:scale-95",
              scanActive && "ring-4 ring-primary/30",
            )}
          >
            <Camera className="size-6" />
          </Link>
          <span
            className={cn(
              "mt-10 block text-center text-[10px] font-semibold tracking-wide",
              scanActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            Scan
          </span>
        </div>
        <NavTab item={NAV[1]} active={isActive(NAV[1], pathname)} />
        <NavTab item={NAV[2]} active={isActive(NAV[2], pathname)} />
      </div>
    </nav>
  );
}

function NavTab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      data-testid={item.testid}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex touch-target flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold tracking-wide transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  );
}
