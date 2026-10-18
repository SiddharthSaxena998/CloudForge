import { RemoteGate } from "@/components/remote-gate";
import { attempt } from "@/lib/attempt";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/auth";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { LimitOverrides, Role, User } from "@/lib/types";

export const Route = createFileRoute("/_shell/admin")({
  head: () => ({
    meta: [
      { title: "Admin — CloudForge" },
      { name: "description", content: "User and role administration for the CloudForge platform." },
      { property: "og:title", content: "Admin — CloudForge" },
      { property: "og:description", content: "User and role administration for the CloudForge platform." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin } = useAuth();
  const users = useStore((s) => s.users);

  if (!isAdmin) {
    return (
      <PageShell title="Admin" description="User and role administration">
        <EmptyState title="Access denied" message="Your account does not have administrator permissions." />
      </PageShell>
    );
  }

  return (
    <PageShell title="Admin" description={`${users.length} users in this workspace`}>
      <RemoteGate resources={["users"]}>
      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface hover:bg-surface">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </RemoteGate>
    </PageShell>
  );
}

function UserRow({ user }: { user: User }) {
  const { user: me } = useAuth();
  const isSelf = me?.email === user.email;
  const blocked = user.status === "blocked";

  const [role, setRole] = useState<Role>(user.role);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState(false);
  const dirty = role !== user.role;

  const toggleBlock = async () => {
    const message = blocked
      ? `Unblock ${user.name}?`
      : `Block ${user.name}? They will be logged out and all their running apps will be stopped.`;
    if (!window.confirm(message)) return;

    setBusy(true);
    const res = await attempt(api.updateUser(user.id, { status: blocked ? "active" : "blocked" }));
    setBusy(false);
    if (res.ok && !blocked) {
      toast.success(`Blocked. ${res.value.stoppedApps} running app(s) stopped.`);
    }
  };

  return (
    <TableRow>
      <TableCell className="text-sm font-medium">{user.name}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          value={role}
          disabled={isSelf}
          onValueChange={(v) => {
            setRole(v as Role);
            setState("idle");
          }}
        >
          <SelectTrigger className="h-8 w-28" aria-label={`Role for ${user.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-sm">
        <span className={blocked ? "font-medium text-destructive" : "text-success"}>
          {blocked ? "Blocked" : "Active"}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {user.usage
          ? `${user.usage.projects} project${user.usage.projects === 1 ? "" : "s"} · ${user.usage.runningApps} running`
          : "—"}
      </TableCell>
      <TableCell className="text-sm">
        {new Date(user.joinedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {state === "saved" && <span className="text-xs text-success">Saved</span>}
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || state === "saving"}
            onClick={async () => {
              setState("saving");
              const res = await attempt(api.updateUser(user.id, { role }));
              setState(res.ok ? "saved" : "idle");
            }}
          >
            {state === "saving" ? "Saving" : "Save"}
          </Button>
          <LimitsDialog user={user} />
          {!isSelf && (
            <Button
              size="sm"
              variant={blocked ? "outline" : "destructive"}
              disabled={busy}
              onClick={toggleBlock}
            >
              {busy ? "Working" : blocked ? "Unblock" : "Block"}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

const LIMIT_FIELDS: { key: keyof LimitOverrides; label: string }[] = [
  { key: "maxProjects", label: "Max projects" },
  { key: "maxRunningContainers", label: "Max running apps" },
  { key: "maxDeploysPerHour", label: "Max deploys per hour" },
];

const limitText = (value: number | null | undefined) => (value == null ? "" : String(value));

/** Edit one user's quota exceptions. Empty field = platform default (from Backend/.env). */
function LimitsDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<keyof LimitOverrides, string>>({
    maxProjects: limitText(user.limitOverrides?.maxProjects),
    maxRunningContainers: limitText(user.limitOverrides?.maxRunningContainers),
    maxDeploysPerHour: limitText(user.limitOverrides?.maxDeploysPerHour),
  });

  const save = async () => {
    const payload: Partial<LimitOverrides> = {};
    for (const field of LIMIT_FIELDS) {
      const raw = values[field.key].trim();
      if (raw !== "" && !/^\d+$/.test(raw)) {
        toast.error(`${field.label}: use a whole number, or leave empty for the default.`);
        return;
      }
      payload[field.key] = raw === "" ? null : Number(raw);
    }

    setSaving(true);
    const res = await attempt(api.updateUser(user.id, { limitOverrides: payload }));
    setSaving(false);
    if (res.ok) {
      toast.success("Limits saved.");
      setOpen(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Limits
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limits for {user.name}</DialogTitle>
            <DialogDescription>
              Leave a field empty to use the platform default. Admins have no limits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {LIMIT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`${user.id}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`${user.id}-${field.key}`}
                  inputMode="numeric"
                  placeholder="default"
                  value={values[field.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving" : "Save limits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
