import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — CloudForge" },
      {
        name: "description",
        content: "Sign in to the CloudForge deployment console to manage projects and containers.",
      },
      { property: "og:title", content: "Sign in — CloudForge" },
      {
        property: "og:description",
        content: "Sign in to the CloudForge deployment console to manage projects and containers.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "register";

type FormErrors = { name?: string; email?: string; password?: string; form?: string };

function AuthPage() {
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/", replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const validate = () => {
    const next: FormErrors = {};
    if (mode === "register" && name.trim().length < 2) {
      next.name = "Enter your full name.";
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (password.length < 6) {
      next.password = "Password must be at least 6 characters.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate({ to: "/", replace: true });
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
  };

  return (
    <div className="fade-in-page flex min-h-screen flex-col bg-background">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-5 flex items-center justify-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold tracking-tight">CloudForge</span>
          </div>

          <div className="rounded-md border border-border bg-card p-6">
            <div className="mb-5 grid grid-cols-2 rounded-sm border border-border p-0.5">
              {(["login", "register"] as Mode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => switchMode(value)}
                  className={
                    mode === value
                      ? "rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
                      : "rounded-sm px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {value === "login" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>

            <h2 className="text-sm font-semibold">
              {mode === "login" ? "Sign in to your account" : "Create an account"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "login"
                ? "Sign in with your CloudForge account."
                : "New accounts are created with the standard user role."}
            </p>

            <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Priya Nair"
                    autoComplete="name"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>

              {errors.form && (
                <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errors.form}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <LoadingSpinner label={mode === "login" ? "Signing in" : "Creating account"} />
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            CloudForge internal console · v0.9.2
          </p>
        </div>
      </div>
    </div>
  );
}