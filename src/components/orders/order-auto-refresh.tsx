import { RouteAutoRefresh } from "@/components/shared/route-auto-refresh";

type OrderAutoRefreshProps = {
  enabled: boolean;
  intervalMs?: number;
};

export function OrderAutoRefresh({
  enabled,
  intervalMs = 15_000,
}: OrderAutoRefreshProps) {
  return <RouteAutoRefresh enabled={enabled} intervalMs={intervalMs} />;
}
