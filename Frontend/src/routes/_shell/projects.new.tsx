import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/lib/api";
import type { SourceType } from "@/lib/store";

export const Route = createFileRoute("/_shell/projects/new")({
  head: () => ({
    meta: [
      { title: "New Project — CloudForge" },
      { name: "description", content: "Create a CloudForge project from a GitHub repository or an uploaded archive." },
      { property: "og:title", content: "New Project — CloudForge" },
      { property: "og:description", content: "Create a CloudForge project from a GitHub repository or an uploaded archive." },
    ],
  }),
  component: NewProjectPage,
});

type Errors = Partial<Record<"name" | "repo" | "branch" | "archive", string>>;

function NewProjectPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("github");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [archive, setArchive] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(name))
      next.name = "Use 2-39 lowercase letters, numbers or hyphens.";
    if (sourceType === "github") {
      if (!/^(https?:\/\/)?github\.com\/[\w.-]+\/[\w.-]+/.test(repo))
        next.repo = "Enter a GitHub URL, e.g. https://github.com/org/repo";
      if (!branch.trim()) next.branch = "Branch is required.";
    } else if (!archive) next.archive = "Select a .zip or .tar.gz archive.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    const project = await api.createProject({
      name,
      description,
      sourceType,
      repo,
      branch: branch.trim(),
      archiveName: archive?.name ?? "",
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  }

  return (
    <PageShell title="New Project" description="Configure the source for a new deployment">
      <form
        onSubmit={onSubmit}
        className="max-w-2xl rounded-md border border-border bg-card"
        noValidate
      >
        <div className="space-y-5 p-5">
          <Field id="name" label="Project name" error={errors.name}>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service"
              className="font-mono"
            />
          </Field>
          <Field id="description" label="Description">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this project do?"
              rows={3}
            />
          </Field>

          <div className="space-y-2">
            <Label>Source type</Label>
            <RadioGroup
              value={sourceType}
              onValueChange={(v) => setSourceType(v as SourceType)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  ["github", "Connect GitHub", "Deploy from a repository branch"],
                  ["archive", "Upload Archive", "Deploy from a .zip or .tar.gz file"],
                ] as const
              ).map(([value, title, hint]) => (
                <Label
                  key={value}
                  htmlFor={`src-${value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 font-normal transition-colors hover:bg-surface has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`src-${value}`} value={value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {sourceType === "github" ? (
            <div className="grid gap-4 rounded-md bg-surface p-4 sm:grid-cols-[1fr_160px]">
              <Field id="repo" label="Repository URL" error={errors.repo}>
                <Input
                  id="repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="bg-card font-mono"
                />
              </Field>
              <Field id="branch" label="Branch" error={errors.branch}>
                <Input
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="bg-card font-mono"
                />
              </Field>
            </div>
          ) : (
            <div className="rounded-md bg-surface p-4">
              <Field id="archive" label="Archive file" error={errors.archive}>
                <Input
                  id="archive"
                  type="file"
                  accept=".zip,.tar.gz,.tgz"
                  onChange={(e) => setArchive(e.target.files?.[0] ?? null)}
                  className="bg-card"
                />
              </Field>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-3">
          <Button type="button" variant="outline" asChild>
            <Link to="/">Cancel</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <LoadingSpinner />}
            Create Project
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
