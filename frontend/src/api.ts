const BASE = import.meta.env.VITE_API_URL as string;

if (!BASE) {
  throw new Error("Missing VITE_API_URL. Set it in frontend/.env");
}

export type AskExtra = Record<string, unknown>;

export interface AskResponse {
  error?: string;
  [key: string]: unknown;
}

export interface ModeInfo {
  name: string;
  description: string;
}

export async function fetchModes(): Promise<ModeInfo[]> {
  const res = await fetch(`${BASE}/modes`);
  if (!res.ok) {
    throw new Error("Could not load modes from Flask");
  }
  return res.json();
}

export async function ask(
  mode: string,
  code: string,
  extra: AskExtra = {}
): Promise<AskResponse> {
  const res = await fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, code, extra }),
  });

  const data = (await res.json()) as AskResponse;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
