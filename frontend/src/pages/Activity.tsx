import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { sessionKey } from "@/lib/session";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActivityEntry, SessionInfo } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  logged_in: "Signed in",
  created: "Saved",
  edited: "Edited",
  marked_sold: "Marked sold",
  returned_to_floor: "Returned to floor",
  pat_tested: "PAT tested",
  deleted: "Deleted",
};

const RANGE_LABELS: Record<string, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  month: "This month",
};

function summariseChanges(entry: ActivityEntry): string {
  const changes = (entry.details?.changes ?? null) as Record<
    string,
    { from: unknown; to: unknown }
  > | null;
  if (changes) {
    return Object.entries(changes)
      .map(([field, { from, to }]) => `${field}: "${from ?? "—"}" → "${to ?? "—"}"`)
      .join("; ");
  }
  if (entry.action === "marked_sold" && entry.details) {
    const price = entry.details.sold_price as number | undefined;
    const ga = entry.details.giftaid_ref as string | null | undefined;
    return `Sold${price != null ? ` for £${price}` : ""}${ga ? ` · Gift Aid ${ga}` : ""}`;
  }
  if (entry.action === "pat_tested" && entry.details) {
    return entry.details.pat_passed ? "Marked PAT test passed" : "Cleared PAT test status";
  }
  return "—";
}

// Inclusive lower bound (ms) for a range key, or null for "all time".
function rangeCutoff(range: string): number | null {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === "7d") return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return null;
}

export default function Activity() {
  const { data: session } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });

  const { data, isError } = useQuery({
    queryKey: ["activity"],
    queryFn: () => apiGet<ActivityEntry[]>("/activity"),
    retry: false,
    enabled: session?.is_master === true,
  });

  const qc = useQueryClient();
  const [who, setWho] = useState("all");
  const [act, setAct] = useState("all");
  const [range, setRange] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const removeSelected = useMutation({
    mutationFn: (ids: string[]) => apiPost<{ deleted: number }>("/activity/delete", { ids }),
    onSuccess: (res) => {
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast.success(`Deleted ${res.deleted} ${res.deleted === 1 ? "entry" : "entries"}`);
    },
    onError: () => toast.error("Could not delete the selected entries"),
  });

  if (session && !session.is_master) {
    return (
      <div
        className="mx-auto mt-10 max-w-md rounded-xl border border-hairline bg-charcoal p-8 text-center"
        data-testid="activity-forbidden"
      >
        <ShieldAlert className="mx-auto mb-3 size-6 text-gold/70" />
        <p className="text-sm text-muted-foreground">
          The activity log is only visible to the master account.
        </p>
      </div>
    );
  }

  const entries = isError ? [] : (data ?? []);
  const volunteers = [...new Set(entries.map((e) => e.username))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const cutoff = rangeCutoff(range);
  const filtered = entries.filter(
    (e) =>
      (who === "all" || e.username === who) &&
      (act === "all" || e.action === act) &&
      (cutoff === null || new Date(e.timestamp).getTime() >= cutoff),
  );

  const filteredIds = filtered.map((e) => e.id);
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const filtersActive = who !== "all" || act !== "all" || range !== "all";

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.3em] text-gold">Master only</p>
      <h1 className="display-title mt-3 text-2xl">Activity log</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every change made across the shop, with who made it. Visible only to the master account.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="activity-filters">
        <Select value={who} onValueChange={setWho}>
          <SelectTrigger className="w-full bg-charcoal sm:w-48" data-testid="activity-filter-who">
            <SelectValue>{(v) => (v === "all" ? "All volunteers" : (v as string))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="activity-who-all">
              All volunteers
            </SelectItem>
            {volunteers.map((u) => (
              <SelectItem key={u} value={u} data-testid={`activity-who-${u}`}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={act} onValueChange={setAct}>
          <SelectTrigger className="w-full bg-charcoal sm:w-48" data-testid="activity-filter-action">
            <SelectValue>
              {(v) => (v === "all" ? "All actions" : (ACTION_LABELS[v as string] ?? (v as string)))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="activity-action-all">
              All actions
            </SelectItem>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value} data-testid={`activity-action-${value}`}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-full bg-charcoal sm:w-44" data-testid="activity-filter-range">
            <SelectValue>{(v) => RANGE_LABELS[v as string] ?? "All time"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value} data-testid={`activity-range-${value}`}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <button
            type="button"
            data-testid="activity-filter-clear"
            onClick={() => {
              setWho("all");
              setAct("all");
              setRange("all");
            }}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-gold hover:underline"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground" data-testid="activity-count">
          {filtered.length} of {entries.length}
        </span>
      </div>

      {selected.size > 0 && (
        <div
          className="mt-4 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/5 px-4 py-2.5"
          data-testid="activity-selection-bar"
        >
          <span className="text-sm text-foreground" data-testid="activity-selected-count">
            {selected.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            data-testid="activity-delete-selected"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            Delete selected
          </Button>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-hairline bg-charcoal" data-testid="activity-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  data-testid="activity-select-all"
                  className="size-4 accent-gold"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </TableHead>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} data-testid={`activity-row-${e.id}`}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select entry ${e.id}`}
                    data-testid={`activity-select-${e.id}`}
                    className="size-4 accent-gold"
                    checked={selected.has(e.id)}
                    onChange={() => toggleOne(e.id)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(e.timestamp).toLocaleString("en-GB")}
                </TableCell>
                <TableCell className="font-medium">{e.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {e.item_title ?? "—"}
                  {e.item_sku && (
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {e.item_sku}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">
                  {summariseChanges(e)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground" data-testid="activity-empty">
            {entries.length === 0 ? "No activity recorded yet." : "No activity matches these filters."}
          </p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(v) => !v && setConfirmOpen(false)}>
        <DialogContent className="border-hairline bg-charcoal" data-testid="activity-delete-dialog">
          <DialogHeader>
            <DialogTitle className="display-title text-sm text-gold">Delete activity entries?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This permanently removes {selected.size} selected{" "}
            {selected.size === 1 ? "entry" : "entries"} from the audit log. This can&rsquo;t be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="activity-delete-cancel"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="activity-delete-confirm"
              disabled={removeSelected.isPending}
              onClick={() => removeSelected.mutate([...selected])}
            >
              <Trash2 className="size-4" />
              Delete {selected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
