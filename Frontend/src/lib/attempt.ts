import { toast } from "sonner";
import { apiErrorMessage } from "./api-client";

/** Runs a server action; on failure shows the server's error message as a toast. */
export async function attempt<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    toast.error(apiErrorMessage(e));
    return { ok: false };
  }
}