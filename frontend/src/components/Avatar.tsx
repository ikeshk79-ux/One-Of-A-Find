import { cn } from "@/lib/utils";

// Roster/profile avatar: shows the uploaded photo if present, otherwise a coloured initial.
export default function Avatar({
  name,
  color,
  avatar,
  size = 48,
  className,
  testid,
}: {
  name: string;
  color: string;
  avatar?: string | null;
  size?: number;
  className?: string;
  testid?: string;
}) {
  const initial = (name || "?").slice(0, 1).toUpperCase();
  const dims = { width: size, height: size };

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        style={dims}
        data-testid={testid}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={{ ...dims, backgroundColor: color, color: "#0B0C0E", fontSize: Math.round(size * 0.42) }}
      data-testid={testid}
      className={cn("grid shrink-0 place-items-center rounded-full font-mono font-semibold", className)}
    >
      {initial}
    </span>
  );
}
