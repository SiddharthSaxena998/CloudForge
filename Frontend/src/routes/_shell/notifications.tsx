
import { RemoteGate } from "@/components/remote-gate";
import { attempt } from "@/lib/attempt";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { api, formatDate } from "@/lib/api";
import { useStore, type NotificationKind } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — CloudForge" },
      {
        name: "description",
        content:
          "Deployment results and workspace activity for CloudForge.",
      },
      {
        property: "og:title",
        content: "Notifications — CloudForge",
      },
      {
        property: "og:description",
        content:
          "Deployment results and workspace activity for CloudForge.",
      },
    ],
  }),
  component: NotificationsPage,
});

const icons: Record<
  NotificationKind,
  { Icon: typeof Info; className: string }
> = {
  success: {
    Icon: CheckCircle2,
    className: "text-success",
  },
  failure: {
    Icon: XCircle,
    className: "text-destructive",
  },
  info: {
    Icon: Info,
    className: "text-primary",
  },
};

/** Safely handle unexpected notification kinds from the API. */
function getNotificationIcon(kind: unknown) {
  if (typeof kind === "string" && kind in icons) {
    return icons[kind as NotificationKind];
  }

  return icons.info;
}

function NotificationsPage() {
  const items = useStore((s) => s.notifications);
  const unread = items.filter((n) => !n.read).length;

  return (
    <PageShell
      title="Notifications"
      description={`${unread} unread`}
    >
      <RemoteGate resources={["notifications"]}>
        <div className="max-w-3xl rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Recent activity
            </span>

            <button
              type="button"
              disabled={unread === 0}
              onClick={() =>
                void attempt(api.markAllNotificationsRead())
              }
              className="text-sm text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
            >
              Mark all as read
            </button>
          </div>

          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          )}

          <ul className="divide-y divide-border">
            {items.map((n) => {
              const { Icon, className } = getNotificationIcon(
                n.kind
              );

              return (
                <li
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      className
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        !n.read && "font-semibold"
                      )}
                    >
                      {n.message}
                    </p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>

                  {!n.read && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </RemoteGate>
    </PageShell>
  );
}
