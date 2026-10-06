import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, RefreshCw, ShieldAlert, Trash2, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import AvatarPicker from "@/components/AvatarPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { sessionKey } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/types";
import type { SessionInfo, StaffMember } from "@/lib/types";

function apiErrorText(e: unknown): string {
  if (e instanceof ApiError && typeof (e.body as { detail?: unknown })?.detail === "string") {
    return String((e.body as { detail: string }).detail);
  }
  return "Something went wrong";
}

// A friendly 6-digit temporary PIN the master can read out to the volunteer.
function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Staff() {
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });

  const { data, isError } = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiGet<StaffMember[]>("/staff"),
    retry: false,
    enabled: session?.is_master === true,
  });

  // Edit (rename + colour/photo)
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>(AVATAR_COLORS[0]);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  // Reset PIN
  const [pinFor, setPinFor] = useState<StaffMember | null>(null);
  const [newPin, setNewPin] = useState("");
  // Remove
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  // Create
  const [creating, setCreating] = useState(false);
  const [cName, setCName] = useState("");
  const [cPin, setCPin] = useState("");
  const [cColor, setCColor] = useState<string>(AVATAR_COLORS[0]);
  const [cAvatar, setCAvatar] = useState<string | null>(null);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["staff"] });
    await qc.invalidateQueries({ queryKey: ["roster"] });
  };

  const saveEdit = useMutation({
    mutationFn: () =>
      apiPatch<StaffMember>(`/staff/${encodeURIComponent(editing!.username)}`, {
        new_username: editName.trim(),
        color: editColor,
        avatar: editAvatar,
      }),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      toast.success("Volunteer updated");
    },
    onError: (e) => toast.error(apiErrorText(e)),
  });

  const resetPin = useMutation({
    mutationFn: () =>
      apiPatch<StaffMember>(`/staff/${encodeURIComponent(pinFor!.username)}/pin`, {
        pin: newPin,
      }),
    onSuccess: () => {
      setPinFor(null);
      setNewPin("");
      toast.success("PIN reset");
    },
    onError: (e) => toast.error(apiErrorText(e)),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete<void>(`/staff/${encodeURIComponent(removing!.username)}`),
    onSuccess: async () => {
      await invalidate();
      setRemoving(null);
      toast.success("Volunteer removed");
    },
    onError: (e) => toast.error(apiErrorText(e)),
  });

  const openEdit = (m: StaffMember) => {
    setEditing(m);
    setEditName(m.username);
    setEditColor(m.color || AVATAR_COLORS[0]);
    setEditAvatar(m.avatar);
  };

  const create = useMutation({
    mutationFn: () =>
      apiPost<StaffMember>("/staff", {
        username: cName.trim(),
        pin: cPin,
        color: cColor,
        avatar: cAvatar,
      }),
    onSuccess: async () => {
      await invalidate();
      setCreating(false);
      toast.success("Volunteer added");
    },
    onError: (e) => toast.error(apiErrorText(e)),
  });

  const openCreate = () => {
    setCName("");
    setCPin(randomPin());
    setCColor(AVATAR_COLORS[0]);
    setCAvatar(null);
    setCreating(true);
  };

  if (session && !session.is_master) {
    return (
      <div
        className="mx-auto mt-10 max-w-md rounded-xl border border-hairline bg-charcoal p-8 text-center"
        data-testid="staff-forbidden"
      >
        <ShieldAlert className="mx-auto mb-3 size-6 text-gold/70" />
        <p className="text-sm text-muted-foreground">
          Staff management is only available to the master account.
        </p>
      </div>
    );
  }

  const members = isError ? [] : (data ?? []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Master only</p>
          <h1 className="display-title mt-3 text-2xl">Staff/Volunteers</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Rename, recolour, reset a PIN, or remove any volunteer account. Renaming updates their
            past activity too.
          </p>
        </div>
        <Button
          className="bg-gold text-gold-ink hover:bg-gold-dim"
          data-testid="staff-add-button"
          onClick={openCreate}
        >
          <UserPlus className="size-4" />
          Add Staff/Volunteer
        </Button>
      </div>

      <div className="mt-8 grid gap-3" data-testid="staff-list">
        {members.map((m) => (
          <div
            key={m.username}
            data-testid={`staff-row-${m.username}`}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-charcoal p-4"
          >
            <Avatar name={m.username} color={m.color} avatar={m.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.username}</p>
              {m.created_at && (
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(m.created_at).toLocaleDateString("en-GB")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid={`staff-edit-${m.username}`}
                onClick={() => openEdit(m)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid={`staff-pin-${m.username}`}
                onClick={() => {
                  setPinFor(m);
                  setNewPin("");
                }}
              >
                <KeyRound className="size-4" />
                Reset PIN
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                data-testid={`staff-remove-${m.username}`}
                onClick={() => setRemoving(m)}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {members.length === 0 && (
        <div
          className="mt-8 rounded-xl border border-hairline bg-charcoal p-10 text-center text-sm text-muted-foreground"
          data-testid="staff-empty"
        >
          <UserRound className="mx-auto mb-3 size-6 text-gold/70" />
          No volunteer accounts yet.
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="staff-create-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Add Staff/Volunteer</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Create an account for a volunteer — no shop password needed. Share their username and PIN.
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name" className="text-xs uppercase tracking-widest">
                Username
              </Label>
              <Input
                id="create-name"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="e.g. Sam"
                data-testid="staff-create-name"
                className="bg-obsidian"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-pin" className="text-xs uppercase tracking-widest">
                  Temporary PIN
                </Label>
                <button
                  type="button"
                  data-testid="staff-create-regenerate"
                  onClick={() => setCPin(randomPin())}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-gold"
                >
                  <RefreshCw className="size-3" />
                  Regenerate
                </button>
              </div>
              <Input
                id="create-pin"
                type="text"
                inputMode="numeric"
                value={cPin}
                onChange={(e) => setCPin(e.target.value)}
                placeholder="At least 6 characters"
                data-testid="staff-create-pin"
                className="bg-obsidian font-mono text-lg tracking-[0.3em]"
              />
              <p className="text-xs text-muted-foreground">
                Auto-generated — note it down and hand it to the volunteer now. You can reset it later.
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-obsidian p-4">
              <AvatarPicker
                name={cName || "?"}
                color={cColor}
                avatar={cAvatar}
                onChange={(v) => {
                  setCColor(v.color);
                  setCAvatar(v.avatar);
                }}
                testid="staff-create-picker"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gold text-gold-ink hover:bg-gold-dim"
              disabled={create.isPending || cName.trim().length < 2 || cPin.length < 6}
              data-testid="staff-create-save"
              onClick={() => create.mutate()}
            >
              <UserPlus className="size-4" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="staff-edit-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Edit volunteer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-name" className="text-xs uppercase tracking-widest">
                Username
              </Label>
              <Input
                id="staff-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="staff-edit-name"
                className="bg-obsidian"
              />
            </div>
            <div className="rounded-lg border border-hairline bg-obsidian p-4">
              <AvatarPicker
                name={editName || "?"}
                color={editColor}
                avatar={editAvatar}
                onChange={(v) => {
                  setEditColor(v.color);
                  setEditAvatar(v.avatar);
                }}
                testid="staff-picker"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              className="bg-gold text-gold-ink hover:bg-gold-dim"
              disabled={saveEdit.isPending || editName.trim().length < 2}
              data-testid="staff-edit-save"
              onClick={() => saveEdit.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN dialog */}
      <Dialog open={pinFor !== null} onOpenChange={(v) => !v && setPinFor(null)}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="staff-pin-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Reset PIN</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new PIN for <span className="font-medium text-foreground">{pinFor?.username}</span>.
            They&rsquo;ll use it next time they sign in.
          </p>
          <div className="space-y-2">
            <Label htmlFor="staff-new-pin" className="text-xs uppercase tracking-widest">
              New PIN
            </Label>
            <Input
              id="staff-new-pin"
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="At least 4 characters"
              data-testid="staff-pin-input"
              className="bg-obsidian font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPinFor(null)}>
              Cancel
            </Button>
            <Button
              className="bg-gold text-gold-ink hover:bg-gold-dim"
              disabled={resetPin.isPending || newPin.length < 6}
              data-testid="staff-pin-save"
              onClick={() => resetPin.mutate()}
            >
              <KeyRound className="size-4" />
              Reset PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={removing !== null} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="staff-remove-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Remove volunteer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" data-testid="staff-remove-text">
            This deletes <span className="font-medium text-foreground">{removing?.username}</span>
            &rsquo;s account and signs them out everywhere. Their past activity stays in the log. This
            cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              data-testid="staff-remove-confirm"
              onClick={() => remove.mutate()}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
