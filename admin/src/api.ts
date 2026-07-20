import type { LabChannel, LabData, LabMatchData, LabSourceMap } from "./types";

// Same-origin by default: served by apps/server at /lab locally, and proxied by Vercel
// (vercel.json rewrites /api/lab/* → Cloud Run) in production. `?api=` overrides for
// cross-origin dev against a remote server.
export const API = new URLSearchParams(location.search).get("api") || "";

/**
 * Write token for the mapping endpoints. /api/lab/* is publicly reachable and has no auth,
 * so writes are gated by a shared secret the server holds in LAB_WRITE_TOKEN. Kept in
 * localStorage so it's entered once per browser.
 */
const TOKEN_KEY = "stepd-lab-token";
export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t.trim());

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function writeInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-lab-token": getToken(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export const fetchLabData = () => req<LabData>("/api/lab/data");

export const fetchMatchChannels = () =>
  req<{ channels: LabChannel[] }>("/api/lab/match/channels").then((r) => r.channels);

export const fetchMatchData = (channelId: string) =>
  req<LabMatchData>(`/api/lab/match/videos/${encodeURIComponent(channelId)}`);

export const saveMatch = (m: {
  shortVideoId: string;
  channelId: string;
  longVideoId: string;
  segStart: number;
  segEnd: number;
  note?: string;
}) => req<{ ok: true; map: LabSourceMap }>("/api/lab/match", writeInit("POST", m));

export const deleteMatch = (shortVideoId: string) =>
  req<{ ok: true }>(`/api/lab/match/${encodeURIComponent(shortVideoId)}`, writeInit("DELETE"));

/** LEARN 입력 미리보기/내보내기 — 매칭된 쌍 + 채널 기준 상대 성과 티어. */
export const fetchMatchExport = (channelId: string) =>
  req<{ channelId: string; channelName: string; pairs: unknown[] }>(
    `/api/lab/match/export/${encodeURIComponent(channelId)}`,
  );
