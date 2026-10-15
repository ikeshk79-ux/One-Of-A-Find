import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CircleDollarSign,
  ClipboardList,
  HelpCircle,
  Info,
  LogOut,
  MapPin,
  Monitor,
  Moon,
  Palette,
  Printer,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  User as UserIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import LocationSwitcher from "@/components/LocationSwitcher";
import MissionCard from "@/components/common/MissionCard";
import SectionHeader from "@/components/common/SectionHeader";
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
import { getTheme, setTheme, type ThemeName } from "@/lib/theme";
import type { SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: readonly { id: ThemeName; label: string; description: string; Icon: typeof Sun }[] =
  [
    {
      id: "system",
      label: "System",
      description: "Follow the device's light/dark preference",
      Icon: Monitor,
    },
    {
      id: "forest-light",
      label: "Forest · Light",
      description: "Cream & sage — the default",
      Icon: Sun,
    },
    {
      id: "forest-dark",
      label: "Forest · Dark",
      description: "Deep forest at low light",
      Icon: Moon,
    },
    {
      id: "obsidian",
      label: "Obsidian",
      description: "Legacy black & gold cinematic",
      Icon: Palette,
    },
    { id: "sunroom", label: "Sunroom", description: "Cream & mustard warm", Icon: Palette },
  ] as const;

export default function More() {
  const qc = useQueryClient();
  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });
  const isMaster = session?.is_master === true;

  const [theme, setThemeState] = useState<ThemeName>(getTheme);
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

  const chooseTheme = (next: ThemeName) => {
    setTheme(next);
    setThemeState(next);
    toast.success("Theme updated");
  };

  return (
    <div className="animate-rise space-y-8 pb-6">
      <SectionHeader
        eyebrow="You"
        title="Shop & settings"
        description="Signed in as a volunteer at One Of A Find. Manage your profile, branch and preferences."
        testid="more-header"
      />

      {/* Profile card */}
      <section
        className="card-elevated flex items-center gap-4 rounded-2xl p-4"
        data-testid="more-profile-card"
      >
        <Avatar
          name={session?.username ?? "?"}
          color={session?.color || AVATAR_COLORS[0]}
          avatar={session?.avatar ?? null}
          size={56}
          testid="more-profile-avatar"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            {session?.username ?? "Unknown"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isMaster ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <ShieldCheck className="size-3" /> Master account
              </span>
            ) : (
              "Volunteer · One Of A Find"
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={openProfile}
          data-testid="more-edit-profile"
          className="touch-target"
        >
          <UserIcon className="size-4" />
          Edit
        </Button>
      </section>

      {/* Branch */}
      <SettingsBlock
        title="Shop branch"
        description="The branch you're volunteering at today. Shown on price tags and used for inventory filters."
        testid="more-branch"
      >
        <LocationSwitcher
          triggerClassName="h-11 w-full justify-start"
          testid="more-location-switcher"
        />
      </SettingsBlock>

      {/* Theme */}
      <SettingsBlock
        title="Theme"
        description="Pick a visual scheme. Forest Thrift Vision is the default; the legacy themes are kept for anyone used to them."
        testid="more-theme"
      >
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="more-theme-options">
          {THEME_OPTIONS.map((t) => {
            const active = theme === t.id;
            const Icon = t.Icon;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => chooseTheme(t.id)}
                  data-testid={`more-theme-${t.id}`}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-lg",
                      active ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SettingsBlock>

      {/* Shortcuts */}
      <SettingsBlock
        title="Shortcuts"
        description="Jump straight into tagging, bulk printing and (for the master account) staff + activity."
        testid="more-shortcuts"
      >
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="more-shortcuts-list">
          <li>
            <ShortcutLink to="/scan" label="Scan a new item" description="Open the camera" Icon={Camera} testid="more-shortcut-scan" />
          </li>
          <li>
            <ShortcutLink
              to="/finds"
              label="Browse finds"
              description="Grid of every appraised item"
              Icon={Sparkles}
              testid="more-shortcut-finds"
            />
          </li>
          <li>
            <ShortcutLink
              to="/inventory"
              label="Full inventory"
              description="Bulk print, mark sold, filter"
              Icon={ClipboardList}
              testid="more-shortcut-inventory"
            />
          </li>
          <li>
            <ShortcutLink
              to="/inventory"
              label="Print price tags"
              description="Pick items from inventory"
              Icon={Printer}
              testid="more-shortcut-print"
            />
          </li>
          {isMaster && (
            <>
              <li>
                <ShortcutLink
                  to="/activity"
                  label="Activity log"
                  description="Master-only audit trail"
                  Icon={ClipboardList}
                  testid="more-shortcut-activity"
                  accent
                />
              </li>
              <li>
                <ShortcutLink
                  to="/volunteers"
                  label="Staff & volunteers"
                  description="Master-only management"
                  Icon={Users}
                  testid="more-shortcut-staff"
                  accent
                />
              </li>
              <li>
                <ShortcutLink
                  to="/admin"
                  label="Shops & pricing"
                  description="Branches, TfL zones and zone-adjustment rules"
                  Icon={Store}
                  testid="more-shortcut-admin"
                  accent
                />
              </li>
            </>
          )}
        </ul>
      </SettingsBlock>

      {/* Help */}
      <SettingsBlock
        title="Help"
        description="A few tips to get the sharpest appraisals and fastest tagging."
        testid="more-help"
      >
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-3 rounded-xl border border-border bg-card/60 p-3">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Good lighting helps us identify the item.</strong>{" "}
              Daylight, no shadows, clear background.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-border bg-card/60 p-3">
            <CircleDollarSign className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Condition changes the price.</strong> Pick the
              grade honestly — the price auto-adjusts and rounds to 50p.
            </span>
          </li>
          <li className="flex gap-3 rounded-xl border border-border bg-card/60 p-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Set your branch</strong> at the start of the shift
              — new finds are tagged with it automatically.
            </span>
          </li>
        </ul>
      </SettingsBlock>

      {/* About */}
      <SettingsBlock
        title="About"
        description="Who built this and why."
        testid="more-about"
      >
        <div className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <Info className="size-4 text-primary" /> One Of A Find
          </p>
          <p className="mt-2">
            A charity-shop appraisal tool — AI vision identifies donated items, finds their peak
            retail price, and recommends a tidy second-hand price to maximise fundraising.
          </p>
        </div>
      </SettingsBlock>

      {/* Charity mission */}
      <MissionCard testid="more-mission" />

      {/* Sign out */}
      <section className="pt-2">
        <Button
          variant="outline"
          className="w-full justify-center text-destructive touch-target"
          onClick={() => endSession(qc)}
          data-testid="more-signout"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </section>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent data-testid="more-profile-dialog">
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
            testid="more-profile-picker"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
              data-testid="more-profile-save"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsBlock({
  title,
  description,
  children,
  testid,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <section className="space-y-3" data-testid={testid}>
      <div>
        <h3 className="heading-title text-base text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ShortcutLink({
  to,
  label,
  description,
  Icon,
  testid,
  accent = false,
}: {
  to: string;
  label: string;
  description: string;
  Icon: typeof Camera;
  testid: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className={cn(
        "group flex touch-target items-center gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5",
        accent
          ? "border-primary/30 bg-primary/5 text-foreground"
          : "border-border bg-card text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-lg",
          accent ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </Link>
  );
}
