import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, Check, Info, MapPin, Sparkles, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ThemeToggle from "@/components/ThemeToggle";
import { gbp, LOCATIONS } from "@/lib/types";

// Interactive PREVIEW of "pick a location at sign-on → every listing inherits it for the session".
// Ungated, self-contained mock — the live login and inventory flows are untouched.
type MockItem = { title: string; brand: string; price: number };

const MOCK_ITEMS: MockItem[] = [
  { title: "Barbour waxed jacket", brand: "Barbour", price: 103.5 },
  { title: "Le Creuset casserole", brand: "Le Creuset", price: 58.0 },
  { title: "Levi's 501 jeans", brand: "Levi's", price: 40.25 },
];

export default function SessionLocationDemo() {
  const [step, setStep] = useState<"signon" | "app">("signon");
  const [sessionLocation, setSessionLocation] = useState<string>("");
  // In the mock, new appraisals default to the session location but stay editable per item.
  const [newItemLocation, setNewItemLocation] = useState<string>("");
  // One inventory row is editable to demonstrate the per-item override rule.
  const [editedRowLocation, setEditedRowLocation] = useState<string>("");

  const enterApp = () => {
    setNewItemLocation(sessionLocation);
    setEditedRowLocation(sessionLocation);
    setStep("app");
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground" data-testid="session-location-demo">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] glow-radial" />
      <ThemeToggle className="absolute right-4 top-4 z-20" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center gap-3">
          <Badge className="border border-gold/30 bg-gold/10 text-gold" data-testid="demo-badge">
            Demo preview
          </Badge>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="demo-back-link"
          >
            <ArrowLeft className="size-3.5" /> Back to app
          </Link>
        </div>
        <h1 className="display-title mt-4 text-2xl">Location at sign-on</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          A volunteer picks their shop branch when they sign in; every item they list that session is
          filed to that branch automatically — still editable on any individual item.
        </p>

        {/* ── STEP 1: sign-on with a location picker ─────────────────────────── */}
        {step === "signon" && (
          <div className="mt-8 flex justify-center">
            <div
              className="gold-ring w-full max-w-md rounded-xl border border-hairline bg-charcoal p-7"
              data-testid="demo-signon-panel"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-lg border border-gold/30 bg-gold/10">
                  <Store className="size-5 text-gold" />
                </span>
                <div>
                  <p className="display-title text-sm text-foreground">Sign in</p>
                  <p className="mt-1 text-xs text-muted-foreground">Choose today&rsquo;s branch</p>
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <Label htmlFor="demo-location" className="text-xs uppercase tracking-widest">
                  Shop location
                </Label>
                <Select value={sessionLocation} onValueChange={setSessionLocation}>
                  <SelectTrigger
                    id="demo-location"
                    className="h-11 bg-obsidian"
                    data-testid="demo-location-select"
                  >
                    <SelectValue placeholder="Select your branch…">{(v) => v as string}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l} data-testid={`demo-location-${l}`}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Applied to every listing you create this session.
                </p>
              </div>

              <Button
                className="mt-6 h-11 w-full bg-gold text-gold-ink transition-transform duration-200 hover:bg-gold-dim active:scale-[0.99]"
                disabled={!sessionLocation}
                data-testid="demo-signin-button"
                onClick={enterApp}
              >
                <Check className="size-4" />
                Sign in to {sessionLocation || "…"}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: app with the session location applied ──────────────────── */}
        {step === "app" && (
          <div className="mt-8 space-y-6" data-testid="demo-app">
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] p-4"
              data-testid="session-location-banner"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full border border-gold/30 bg-gold/10">
                  <MapPin className="size-4 text-gold" />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Session location
                  </p>
                  <p className="display-title text-sm text-gold" data-testid="session-location-value">
                    {sessionLocation}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-testid="demo-change-location"
                onClick={() => setStep("signon")}
              >
                Change location
              </Button>
            </div>

            {/* New appraisal — location pre-filled from the session, still editable */}
            <div className="rounded-xl border border-hairline bg-charcoal p-6" data-testid="demo-new-listing">
              <p className="text-[11px] uppercase tracking-[0.3em] text-gold">New listing</p>
              <h2 className="display-title mt-2 text-lg">Vintage silk scarf</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase tracking-[0.18em]">Charity price</Label>
                  <div className="rounded-lg border border-hairline bg-obsidian p-3 font-mono text-gold">
                    {gbp(12.5)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-new-loc" className="text-[10px] uppercase tracking-[0.18em]">
                    Shop location
                  </Label>
                  <Select value={newItemLocation} onValueChange={setNewItemLocation}>
                    <SelectTrigger id="demo-new-loc" className="bg-obsidian" data-testid="demo-new-listing-location">
                      <SelectValue>{(v) => v as string}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATIONS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="size-3.5 text-gold/70" />
                Defaulted from your session location — change it here if this item belongs elsewhere.
              </p>
              <Button className="mt-4 bg-gold text-gold-ink hover:bg-gold-dim" data-testid="demo-save">
                <Camera className="size-4" />
                Save &amp; make tag
              </Button>
            </div>

            {/* Inventory — every listing inherits the session location */}
            <div className="rounded-xl border border-hairline bg-charcoal p-6">
              <div className="flex items-center justify-between">
                <h2 className="display-title text-sm text-gold">This session&rsquo;s listings</h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-gold/70" /> all filed to {sessionLocation}
                </span>
              </div>
              <div className="mt-4 space-y-3" data-testid="demo-inventory-list">
                {MOCK_ITEMS.map((it, i) => {
                  const rowLoc = i === 0 ? editedRowLocation : sessionLocation;
                  return (
                    <div
                      key={it.title}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-obsidian/60 p-4"
                      data-testid={`demo-item-${i}`}
                    >
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">{it.brand}</p>
                        <p className="text-sm font-semibold">{it.title}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-gold">{gbp(it.price)}</span>
                        {i === 0 ? (
                          <Select value={editedRowLocation} onValueChange={setEditedRowLocation}>
                            <SelectTrigger
                              className="h-8 w-[190px] bg-obsidian text-xs"
                              data-testid="demo-item-0-location"
                            >
                              <SelectValue>{(v) => v as string}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {LOCATIONS.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 text-[11px]"
                            data-testid={`demo-item-${i}-location`}
                          >
                            <MapPin className="size-3" />
                            {rowLoc}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                The first row shows the per-item override — change it and only that item moves branch.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
