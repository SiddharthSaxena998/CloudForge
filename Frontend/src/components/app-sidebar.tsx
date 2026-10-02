import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Cloud,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { useStore } from "@/lib/store";

type NavItem = {
  to: "/" | "/deployments" | "/containers" | "/notifications" | "/admin";
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  badge?: number;
};

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/containers", label: "Containers", icon: Boxes },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/admin", label: "Admin", icon: ShieldCheck, adminOnly: true },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const { user, logout, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <Cloud className="h-5 w-5 shrink-0 text-sidebar-primary" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
            CloudForge
          </span>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto hidden rounded-sm p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:block"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.to === "/notifications" && unread > 0 ? (
                  <span className="ml-auto rounded-sm bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>

      {user && (
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.name)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                  {user.role}
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={logout}
            className={cn(
              "mt-3 flex w-full items-center gap-2 rounded-sm border border-sidebar-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center",
            )}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
