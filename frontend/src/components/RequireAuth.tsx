import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { sessionKey } from "@/lib/session";
import type { SessionInfo } from "@/lib/types";
import AppShell from "@/components/AppShell";
import Lock from "@/pages/Lock";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useQuery({
    queryKey: sessionKey,
    queryFn: () => apiGet<SessionInfo>("/auth/me"),
    retry: false,
  });

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-1 w-40 rounded-full bg-hairline animate-sweep" />
      </div>
    );
  }
  if (!data?.authenticated) return <Lock />;
  return <AppShell>{children}</AppShell>;
}
