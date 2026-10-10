import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar({
  title,
  description,
  action,
  onOpenMenu,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  onOpenMenu?: (() => void) | undefined;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {action}
        <ThemeToggle />
      </div>
    </header>
  );
}
