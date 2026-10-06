import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Gem, LogOut, PackageSearch, ScanLine, Users } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import ThemeToggle from "@/components/ThemeToggle";
import LocationSwitcher from "@/components/LocationSwitcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPatch } from "@/lib/api";
import { endSession, sessionKey } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/types";
import type { SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Appraise", icon: ScanLine, testid: "nav-appraise", master: false },
  { to: "/inventory", label: "Inventory", icon: PackageSearch, testid: "nav-inventory", master: false },
  { to: "/volunteers", label: "Staff/Volunteers", icon: Users, testid: "nav-staff", master: true },
  { to: "/activity", label: "Activity", icon: ClipboardList, testid: "nav-activity", master: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });
  const isMaster = session?.is_master === true;
  const nav = NAV.filter((n) => !n.master || isMaster);

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
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] glow-radial" />
      <header className="no-print relative z-10 border-b border-hairline/80 bg-charcoal/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-6 sm:px-5 sm:py-4">
          <Link to="/" className="order-1 flex shrink-0 items-center gap-3" data-testid="brand-home-link">
            <span className="grid size-9 place-items-center rounded-md border border-gold/30 bg-gold/10">
              <Gem className="size-4 text-gold" />
            </span>
            <span className="display-title text-[13px] leading-none text-foreground">
              One Of A <span className="text-gold">Find</span>
            </span>
          </Link>
          <nav className="order-3 hidden w-full items-center gap-1 overflow-x-auto pb-1 sm:order-2 sm:ml-auto sm:flex sm:w-auto sm:overflow-visible sm:pb-0">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                data-testid={n.testid}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200",
                  pathname === n.to
                    ? "bg-gold/12 text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="order-2 ml-auto flex items-center gap-1 sm:order-3 sm:ml-0">
            <LocationSwitcher
              triggerClassName="h-9 w-[132px] bg-charcoal text-xs sm:w-[168px]"
              testid="header-location-switcher"
            />
            <ThemeToggle />
            {session?.username && (
              <button
                type="button"
                onClick={openProfile}
                data-testid="profile-button"
                className="ml-2 flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:border-gold/40 hover:text-foreground"
              >
                <Avatar
                  name={session.username}
                  color={session.color || AVATAR_COLORS[0]}
                  avatar={session.avatar ?? null}
                  size={22}
                  testid="current-user-avatar"
                />
                <span className="hidden sm:inline" data-testid="current-user">
                  {isMaster && <span className="text-gold">Master · </span>}
                  {session.username}
                </span>
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 text-muted-foreground hover:text-foreground"
              data-testid="logout-button"
              onClick={() => endSession(qc)}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-5 sm:pt-10">{children}</main>

      {/* Mobile bottom tab bar — one-handed section switching on phones */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline/80 bg-charcoal/95 backdrop-blur-xl sm:hidden"
        data-testid="mobile-tabbar"
      >
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            data-testid={`tab-${n.testid}`}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-200",
              pathname === n.to ? "text-gold" : "text-muted-foreground",
            )}
          >
            <n.icon className="size-5" />
            <span className="max-w-full truncate px-1">{n.label}</span>
          </Link>
        ))}
      </nav>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="profile-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Your tile</DialogTitle>
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
              className="bg-gold text-gold-ink hover:bg-gold-dim"
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
