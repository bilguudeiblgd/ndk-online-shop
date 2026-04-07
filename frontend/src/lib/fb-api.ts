const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface FBLiveVideo {
  id: string;
  title: string;
  status: string;
  description: string;
}

export interface FBStatus {
  connected: boolean;
  polling: boolean;
  activeVideoId: string;
}

export async function getFBStatus(): Promise<FBStatus> {
  const res = await fetch(`${API}/fb/status`);
  return res.json();
}

export async function setFBToken(token: string) {
  const res = await fetch(`${API}/fb/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getFBLiveVideos(pageId: string): Promise<FBLiveVideo[]> {
  const res = await fetch(`${API}/fb/live-videos?page_id=${pageId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startFBPolling(videoId: string) {
  const res = await fetch(`${API}/fb/poll/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopFBPolling() {
  const res = await fetch(`${API}/fb/poll/stop`, { method: "POST" });
  return res.json();
}
