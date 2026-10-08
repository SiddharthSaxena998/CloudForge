import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ShellMenuContext } from "@/components/page-shell";
import { PageLoader } from "@/components/loading-spinner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/context/auth";
import { loadResource } from "@/lib/remote";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Unread badge in the sidebar: load notifications once signed in (errors are shown on the page itself).
  useEffect(() => {
    if (isAuthenticated) loadResource("notifications").catch(() => {});
  }, [isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return <PageLoader label="Checking session" />;
  }

  return (
    <ShellMenuContext.Provider value={() => setMobileOpen(true)}>
      <div className="flex min-h-screen bg-background">
        <aside
          className="hidden shrink-0 lg:block"
          style={{ width: collapsed ? 64 : 220 }}
        >
          <div
            className="fixed inset-y-0 left-0"
            style={{ width: collapsed ? 64 : 220 }}
          >
            <AppSidebar
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed((c) => !c)}
            />
          </div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[240px] p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </ShellMenuContext.Provider>
  );
}