import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Compass, Home as HomeIcon, Leaf, Menu, Settings2 } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import BottomNavigation from "@/components/common/BottomNavigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPatch } from "@/lib/api";
import { sessionKey } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/types";
import type { SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavDef = { to: string; label: string; icon: typeof HomeIcon; testid: string; matches?: readonly string[] };

const DESKTOP_NAV: readonly NavDef[] = [
  { to: "/", label: "Home", icon: HomeIcon, testid: "nav-home", matches: ["/", "/home"] },
  { to: "/scan", label: "Scan", icon: Camera, testid: "nav-scan", matches: ["/scan"] },
  { to: "/finds", label: "Finds", icon: Compass, testid: "nav-finds", matches: ["/finds", "/inventory"] },
  { to: "/more", label: "More", icon: Menu, testid: "nav-more", matches: ["/more", "/activity", "/volunteers"] },
] as const;

function isActive(item: NavDef, pathname: string): boolean {
  if (!item.matches) return pathname === item.to;
  return item.matches.some((m) => (m === "/" ? pathname === "/" : pathname.startsWith(m)));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const [pColor, setPColor] = useState<string>(AVATAR_COLORS[0]);
  const [pAvatar, setPAvatar] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: () => apiPatch<SessionInfo>("/auth/profile", { color: pColor, avatar: pAvatar }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: sessionKey });
      await qc.invalidateQueries({ queryKey: ["roster"] });
      setProfileOpen(false);
      toast.success("Profile updated");
    },
    onError: () => toast.error("Could not update profile"),
  });

  const openProfile = () => {
    setPColor(session?.color || AVATAR_COLORS[0]);
    setPAvatar(session?.avatar ?? null);
    setProfileOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] glow-radial" aria-hidden="true" />
      <header className="no-print relative z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="flex shrink-0 items-center gap-2" data-testid="brand-home-link">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Leaf className="size-5" />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="heading-title text-sm text-foreground">
                One Of A <span className="text-primary">Find</span>
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Thrift Vision
              </span>
            </span>
          </Link>

          <nav
            className="ml-6 hidden items-center gap-1 sm:flex"
            aria-label="Primary navigation"
            data-testid="desktop-nav"
          >
            {DESKTOP_NAV.map((n) => {
              const Icon = n.icon;
              const active = isActive(n, pathname);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  data-testid={n.testid}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "touch-target flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {session?.username && (
              <button
                type="button"
                onClick={openProfile}
                data-testid="profile-button"
                className="flex touch-target items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                aria-label="Open profile"
              >
                <Avatar
                  name={session.username}
                  color={session.color || AVATAR_COLORS[0]}
                  avatar={session.avatar ?? null}
                  size={28}
                  testid="current-user-avatar"
                />
                <span className="hidden sm:inline" data-testid="current-user">
                  {session.is_master && <span className="text-primary">Master · </span>}
                  {session.username}
                </span>
              </button>
            )}
            <Link
              to="/more"
              aria-label="Open settings"
              data-testid="header-more"
              className="grid touch-target size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:hidden"
            >
              <Settings2 className="size-5" />
            </Link>
          </div>
        </div>
      </header>

      <main
        className="relative z-10 mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-10"
        data-testid="app-main"
      >
        {children}
      </main>

      <BottomNavigation />

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent data-testid="profile-dialog">
          <DialogHeader>
            <DialogTitle className="heading-title text-base">Your tile</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Pick a colour and optionally a photo so your name is easy to spot on the till roster.
          </p>
          <AvatarPicker
            name={session?.username ?? "?"}
            color={pColor}
            avatar={pAvatar}
            onChange={(v) => {
              setPColor(v.color);
              setPAvatar(v.avatar);
            }}
            testid="profile-picker"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saveProfile.isPending}
              data-testid="profile-save"
              onClick={() => saveProfile.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
