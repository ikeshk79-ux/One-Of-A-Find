import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Delete, Gem, KeyRound, Loader2, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import ThemeToggle from "@/components/ThemeToggle";
import LocationSwitcher from "@/components/LocationSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiError } from "@/lib/api";
import { beginSession } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/types";
import type { Roster, RosterEntry, SessionInfo } from "@/lib/types";

type Mode = "unlock" | "roster" | "pin" | "signin" | "register";

type AuthVars =
  | { kind: "login"; username: string; pin: string }
  | {
      kind: "register";
      username: string;
      pin: string;
      shopPassword: string;
      color: string;
      avatar: string | null;
    };

const MIN_PIN = 4; // existing accounts (login) — must not break 4-digit PINs already in use
const MIN_NEW_PIN = 6; // new PINs chosen at registration

export default function Lock() {
  // Shop password is held in memory only (never persisted) — a fresh load re-shows the unlock step.
  const [mode, setMode] = useState<Mode>("unlock");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [unlockPw, setUnlockPw] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [shopPassword, setShopPassword] = useState("");
  const [regColor, setRegColor] = useState<string>(AVATAR_COLORS[0]);
  const [regAvatar, setRegAvatar] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(AVATAR_COLORS[0]);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const qc = useQueryClient();

  // The till roster is gated behind the shared shop password (no longer public). Unlocking once
  // per browser session reveals the tap-to-sign-in tiles; a wrong/stale password clears the cache.
  const unlock = useMutation({
    mutationFn: (pw: string) => apiPost<Roster>("/auth/roster", { shop_password: pw }),
    onSuccess: (data) => {
      setRoster(data);
      setMode("roster");
    },
    onError: (e) => {
      setMode("unlock");
      toast.error(
        e instanceof ApiError && typeof (e.body as { detail?: unknown })?.detail === "string"
          ? String((e.body as { detail: string }).detail)
          : "Couldn't unlock the till",
      );
    },
  });

  const auth = useMutation({
    mutationFn: (vars: AuthVars) =>
      vars.kind === "login"
        ? apiPost<SessionInfo>("/auth/login", { username: vars.username.trim(), pin: vars.pin })
        : apiPost<SessionInfo>("/auth/register", {
            shop_password: vars.shopPassword,
            username: vars.username.trim(),
            pin: vars.pin,
            color: vars.color,
            avatar: vars.avatar,
          }),
    onSuccess: async (_data, vars) => {
      await beginSession(qc);
      toast.success(vars.kind === "login" ? "Signed in" : "Account created");
    },
    onError: (e) => {
      setPin("");
      setShake(true); // rattle the keypad so a mistyped PIN is obvious at the till
      toast.error(
        e instanceof ApiError && typeof (e.body as { detail?: unknown })?.detail === "string"
          ? String((e.body as { detail: string }).detail)
          : "Could not continue",
      );
    },
  });

  const goRoster = () => {
    setMode(roster ? "roster" : "unlock");
    setSelectedUser("");
    setPin("");
    setUsername("");
    setShopPassword("");
    setRegColor(AVATAR_COLORS[0]);
    setRegAvatar(null);
  };

  const pickVolunteer = (entry: RosterEntry) => {
    setSelectedUser(entry.username);
    setSelectedColor(entry.color);
    setSelectedAvatar(entry.avatar);
    setPin("");
    setMode("pin");
  };

  const submitPin = () => {
    if (pin.length >= MIN_PIN) auth.mutate({ kind: "login", username: selectedUser, pin });
  };

  const pressDigit = (d: string) => setPin((p) => (p.length >= 12 ? p : p + d));
  const backspace = () => setPin((p) => p.slice(0, -1));

  const volunteers = roster?.volunteers ?? [];

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] glow-radial" />
      <ThemeToggle className="absolute right-4 top-4 z-20" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <div className="mb-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg border border-gold/30 bg-gold/10">
            <Gem className="size-5 text-gold" />
          </span>
          <div>
            <p className="display-title text-base text-foreground">
              One Of A <span className="text-gold">Find</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Charity shop appraisal terminal</p>
          </div>
        </div>

        <div className="mb-8 space-y-2" data-testid="lock-location">
          <Label htmlFor="lock-location-select" className="text-xs uppercase tracking-widest">
            Your shop branch
          </Label>
          <LocationSwitcher
            id="lock-location-select"
            triggerClassName="h-11 w-full bg-charcoal"
            testid="lock-location-switcher"
          />
          <p className="text-xs text-muted-foreground">
            Items you list this session are filed to this branch — editable per item.
          </p>
        </div>

        {/* UNLOCK — gate the roster behind the shared shop password */}
        {mode === "unlock" && (
          <div className="gold-ring rounded-xl border border-hairline bg-charcoal p-7" data-testid="unlock-panel">
            <h1 className="display-title text-sm text-gold">Unlock this till</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Enter the shared shop password to load the volunteer roster on this device.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (unlockPw.length > 0) unlock.mutate(unlockPw);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shop-unlock" className="text-xs uppercase tracking-widest">
                  Shop password
                </Label>
                <Input
                  id="shop-unlock"
                  type="password"
                  autoFocus
                  value={unlockPw}
                  onChange={(e) => setUnlockPw(e.target.value)}
                  placeholder="Shared shop password"
                  data-testid="shop-unlock-input"
                  className="h-11 bg-obsidian font-mono"
                />
              </div>
              <Button
                type="submit"
                disabled={unlock.isPending || unlockPw.length === 0}
                data-testid="shop-unlock-submit"
                className="h-11 w-full bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
              >
                {unlock.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Unlock till
              </Button>
            </form>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
              <button
                type="button"
                data-testid="unlock-manager-signin"
                onClick={() => {
                  setMode("signin");
                  setUsername("");
                  setPin("");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
              >
                <LogIn className="size-3.5" />
                Manager sign in
              </button>
              <button
                type="button"
                data-testid="unlock-go-register"
                onClick={() => {
                  setMode("register");
                  setUsername("");
                  setPin("");
                  setShopPassword("");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
              >
                <UserPlus className="size-3.5" />
                Create an account
              </button>
            </div>
          </div>
        )}

        {/* ROSTER — tap your name */}
        {mode === "roster" && (
          <div className="gold-ring rounded-xl border border-hairline bg-charcoal p-7" data-testid="roster-panel">
            <h1 className="display-title text-sm text-gold">Who&rsquo;s on shift?</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Tap your name to sign in with your PIN.
            </p>

            {unlock.isPending && !roster ? (
              <div className="mt-6 grid place-items-center py-10">
                <Loader2 className="size-6 animate-spin text-gold" />
              </div>
            ) : volunteers.length === 0 ? (
              <p className="mt-6 rounded-lg border border-hairline bg-obsidian p-5 text-sm text-muted-foreground" data-testid="roster-empty">
                No volunteer accounts yet. Create one to get started.
              </p>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="roster-list">
                {volunteers.map((v) => (
                  <button
                    key={v.username}
                    type="button"
                    data-testid={`roster-tile-${v.username}`}
                    onClick={() => pickVolunteer(v)}
                    className="group flex flex-col items-center gap-3 rounded-xl border border-hairline bg-obsidian p-5 text-center outline-none transition-colors duration-200 hover:border-gold/50 focus-visible:border-gold/70"
                  >
                    <Avatar
                      name={v.username}
                      color={v.color}
                      avatar={v.avatar}
                      size={52}
                      className="border border-white/10 transition-transform duration-200 group-hover:scale-105"
                      testid={`roster-avatar-${v.username}`}
                    />
                    <span className="w-full truncate text-sm font-medium">{v.username}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
              <button
                type="button"
                data-testid="signin-another-way"
                onClick={() => {
                  setMode("signin");
                  setUsername("");
                  setPin("");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
              >
                <KeyRound className="size-3.5" />
                Sign in another way
              </button>
              <button
                type="button"
                data-testid="go-register"
                onClick={() => {
                  setMode("register");
                  setUsername("");
                  setPin("");
                  setShopPassword("");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
              >
                <UserPlus className="size-3.5" />
                Create an account
              </button>
            </div>
          </div>
        )}

        {/* PIN KEYPAD — after tapping a name */}
        {mode === "pin" && (
          <div className="gold-ring rounded-xl border border-hairline bg-charcoal p-7" data-testid="pin-panel">
            <button
              type="button"
              data-testid="pin-back"
              onClick={goRoster}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              <ArrowLeft className="size-3.5" />
              Back to names
            </button>

            <div className="mt-4 flex items-center gap-3">
              <Avatar
                name={selectedUser}
                color={selectedColor}
                avatar={selectedAvatar}
                size={44}
                testid="pin-avatar"
              />
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Signing in as</p>
                <p className="display-title text-sm text-foreground" data-testid="pin-username">
                  {selectedUser}
                </p>
              </div>
            </div>

            {/* PIN dots */}
            <div className="mt-6 flex h-12 items-center justify-center gap-3 rounded-lg border border-hairline bg-obsidian" data-testid="pin-display">
              {pin.length === 0 ? (
                <span className="text-xs text-muted-foreground">Enter your PIN</span>
              ) : (
                Array.from({ length: pin.length }).map((_, i) => (
                  <span key={`pin-dot-${i}`} className="size-3 rounded-full bg-gold" />
                ))
              )}
            </div>

            <div
              className={`mt-6 grid grid-cols-3 gap-3 ${shake ? "animate-shake" : ""}`}
              data-testid="pin-keypad"
              onAnimationEnd={() => setShake(false)}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`keypad-${d}`}
                  onClick={() => pressDigit(d)}
                  className="h-20 rounded-xl border border-hairline bg-obsidian font-mono text-3xl text-foreground outline-none transition-colors duration-150 hover:border-gold/50 active:bg-gold/10 focus-visible:border-gold/70 sm:h-16 sm:text-2xl"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                data-testid="keypad-backspace"
                onClick={backspace}
                disabled={pin.length === 0}
                className="grid h-20 place-items-center rounded-xl border border-hairline bg-obsidian text-muted-foreground outline-none transition-colors duration-150 hover:border-gold/50 active:bg-gold/10 disabled:opacity-40 sm:h-16"
              >
                <Delete className="size-5" />
              </button>
              <button
                type="button"
                data-testid="keypad-0"
                onClick={() => pressDigit("0")}
                className="h-20 rounded-xl border border-hairline bg-obsidian font-mono text-3xl text-foreground outline-none transition-colors duration-150 hover:border-gold/50 active:bg-gold/10 focus-visible:border-gold/70 sm:h-16 sm:text-2xl"
              >
                0
              </button>
              <button
                type="button"
                data-testid="pin-submit-button"
                onClick={submitPin}
                disabled={auth.isPending || pin.length < MIN_PIN}
                className="grid h-20 place-items-center rounded-xl bg-gold text-gold-ink outline-none transition-transform duration-150 hover:bg-gold-dim active:scale-[0.98] disabled:opacity-40 sm:h-16"
              >
                {auth.isPending ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
              </button>
            </div>
          </div>
        )}

        {/* TYPED SIGN-IN — master / accounts not on this device */}
        {mode === "signin" && (
          <div className="gold-ring rounded-xl border border-hairline bg-charcoal p-7" data-testid="signin-panel">
            <button
              type="button"
              data-testid="signin-back"
              onClick={goRoster}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              <ArrowLeft className="size-3.5" />
              Back to names
            </button>
            <h1 className="display-title mt-4 text-sm text-gold">Sign in</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Enter your username and PIN — use this for the manager account or a name not shown on
              the roster.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (username.trim().length >= 2 && pin.length >= MIN_PIN)
                  auth.mutate({ kind: "login", username, pin });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs uppercase tracking-widest">
                  Username
                </Label>
                <Input
                  id="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. master"
                  data-testid="username-input"
                  className="h-11 bg-obsidian"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin" className="text-xs uppercase tracking-widest">
                  PIN
                </Label>
                <Input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="At least 4 characters"
                  data-testid="pin-input"
                  className="h-11 bg-obsidian font-mono"
                />
              </div>
              <Button
                type="submit"
                disabled={auth.isPending || username.trim().length < 2 || pin.length < MIN_PIN}
                data-testid="auth-submit-button"
                className="h-11 w-full bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
              >
                {auth.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                Sign in
              </Button>
            </form>
          </div>
        )}

        {/* REGISTER — new volunteer */}
        {mode === "register" && (
          <div className="gold-ring rounded-xl border border-hairline bg-charcoal p-7" data-testid="register-panel">
            <button
              type="button"
              data-testid="register-back"
              onClick={goRoster}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              <ArrowLeft className="size-3.5" />
              Back to names
            </button>
            <h1 className="display-title mt-4 text-sm text-gold">Create your account</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Enter the shop password, then pick a username and a PIN of your own.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (shopPassword.length > 0 && username.trim().length >= 2 && pin.length >= MIN_NEW_PIN)
                  auth.mutate({
                    kind: "register",
                    username,
                    pin,
                    shopPassword,
                    color: regColor,
                    avatar: regAvatar,
                  });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shop-password" className="text-xs uppercase tracking-widest">
                  Shop password
                </Label>
                <Input
                  id="shop-password"
                  type="password"
                  value={shopPassword}
                  onChange={(e) => setShopPassword(e.target.value)}
                  placeholder="Shared shop password"
                  data-testid="shop-password-input"
                  className="h-11 bg-obsidian font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-username" className="text-xs uppercase tracking-widest">
                  Username
                </Label>
                <Input
                  id="reg-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Sarah"
                  data-testid="username-input"
                  className="h-11 bg-obsidian"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-pin" className="text-xs uppercase tracking-widest">
                  PIN
                </Label>
                <Input
                  id="reg-pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="At least 6 characters"
                  data-testid="pin-input"
                  className="h-11 bg-obsidian font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest">Your tile</Label>
                <p className="text-xs text-muted-foreground">
                  Pick a colour and optionally a photo so your name is easy to spot at the till.
                </p>
                <div className="rounded-lg border border-hairline bg-obsidian p-4">
                  <AvatarPicker
                    name={username || "?"}
                    color={regColor}
                    avatar={regAvatar}
                    onChange={(v) => {
                      setRegColor(v.color);
                      setRegAvatar(v.avatar);
                    }}
                    testid="register-picker"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={
                  auth.isPending ||
                  shopPassword.length === 0 ||
                  username.trim().length < 2 ||
                  pin.length < MIN_NEW_PIN
                }
                data-testid="auth-submit-button"
                className="h-11 w-full bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
              >
                {auth.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Create account
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
