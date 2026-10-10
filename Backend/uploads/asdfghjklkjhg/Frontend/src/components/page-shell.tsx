import { createContext, useContext, type ReactNode } from "react";
import { TopBar } from "@/components/top-bar";

export const ShellMenuContext = createContext<() => void>(() => {});

export function PageShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  children: ReactNode;
}) {
  const openMenu = useContext(ShellMenuContext);

  return (
    <>
      <TopBar
        title={title}
        description={description}
        action={action}
        onOpenMenu={openMenu}
      />
      <main className="fade-in-page flex-1 p-4 lg:p-6">{children}</main>
    </>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
