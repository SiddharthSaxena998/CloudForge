import { Progress } from "@/components/ui/progress";
import { useUsage, type UsageItem } from "@/lib/usage";

function Meter({ label, item }: { label: string; item: UsageItem }) {
  const full = item.used >= item.max;
  const percent = item.max > 0 ? Math.min(100, Math.round((item.used / item.max) * 100)) : 100;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={full ? "font-medium text-destructive" : "tabular-nums"}>
          {item.used} / {item.max}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label}: ${item.used} of ${item.max} used`}
        className={full ? "mt-1.5 h-1.5 bg-destructive/20 [&>div]:bg-destructive" : "mt-1.5 h-1.5"}
      />
    </div>
  );
}

/** "How much of my quota is used" card on the dashboard. Hidden for admins (no limits). */
export function UsageCard() {
  const usage = useUsage();
  if (!usage || usage.unlimited) return null;

  return (
    <section className="mb-4 rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Your plan limits</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Meter label="Projects" item={usage.projects} />
        <Meter label="Running apps" item={usage.runningApps} />
        <Meter label="Deploys this hour" item={usage.deploysPerHour} />
      </div>
    </section>
  );
}
