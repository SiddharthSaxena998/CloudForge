import { RemoteGate } from "@/components/remote-gate";
import { attempt } from "@/lib/attempt";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
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
import type { Role, User } from "@/lib/types";

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
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
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
  const [role, setRole] = useState<Role>(user.role);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = role !== user.role;

  return (
    <TableRow>
      <TableCell className="text-sm font-medium">{user.name}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          value={role}
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
        {new Date(user.joinedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {state === "saved" && <span className="text-xs text-success">Saved</span>}
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || state === "saving"}
            onClick={async () => {
              setState("saving");
              const res = await attempt(api.updateUserRole(user.id, role));
              setState(res.ok ? "saved" : "idle");
            }}
          >
            {state === "saving" ? "Saving" : "Save"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}