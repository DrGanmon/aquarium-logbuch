import { session, language } from "./state";
export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}
export async function api<T>(
  path: string,
  { method = "GET", body, signal }: RequestOptions = {},
): Promise<T> {
  const response = await fetch("api" + path, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      "X-Language": language.value,
    },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (response.status === 401 && !["/login", "/register", "/me"].includes(path))
    session.user = null;
  if (!response.ok)
    throw new Error(
      typeof data === "object" && data && "error" in data
        ? String(data.error)
        : `HTTP ${response.status}`,
    );
  return data as T;
}
export async function refreshSession() {
  session.user = await api<import("./types").User>("/me");
  if (session.user.language) language.value = session.user.language;
  session.config = await api<import("./types").AppConfig>("/config");
}
