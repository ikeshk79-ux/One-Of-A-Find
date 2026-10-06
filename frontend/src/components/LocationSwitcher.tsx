import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LOCATIONS } from "@/lib/types";
import { setSessionLocation, useSessionLocation } from "@/lib/sessionLocation";
import { cn } from "@/lib/utils";

// Branch picker bound to the session-location store. Used on the sign-on screen and in the header
// (Quick Switch) — changing it re-files new listings to the chosen branch for the rest of the session.
export default function LocationSwitcher({
  id,
  triggerClassName,
  testid = "location-switcher",
}: {
  id?: string;
  triggerClassName?: string;
  testid?: string;
}) {
  const location = useSessionLocation();
  return (
    <Select value={location} onValueChange={setSessionLocation}>
      <SelectTrigger id={id} data-testid={testid} className={cn("gap-2", triggerClassName)}>
        <MapPin className="size-4 shrink-0 text-gold" />
        <SelectValue>{(v) => v as string}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LOCATIONS.map((l) => (
          <SelectItem key={l} value={l} data-testid={`location-option-${l}`}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
