import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveRoad } from "@/lib/app.functions";

export type LiveStatus = "off" | "connecting" | "live" | "failed";

/**
 * Live table state for the panel. The server opens the table socket (the casino refuses
 * browser connections from this site), so the panel just polls it.
 */
export function useLiveRoad() {
  const fn = useServerFn(getLiveRoad);
  const q = useQuery({ queryKey: ["live-road"], queryFn: () => fn(), refetchInterval: 15_000, retry: false });
  const d = q.data;
  const status: LiveStatus = !d ? (q.isError ? "failed" : "connecting") : d.status === "off" ? "off" : d.status === "live" ? "live" : "failed";
  return { status, stats: d?.status === "live" ? d.stats : undefined };
}
