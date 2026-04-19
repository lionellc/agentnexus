export type WebDavRunMode = "off" | "startup" | "interval";

export interface WebDavConfig {
  enabled: boolean;
  endpoint: string;
  username: string;
  password: string;
  autoMode: WebDavRunMode;
  startupDelaySec: number;
  intervalMin: number;
  lastSyncAt: string | null;
}

const WEBDAV_KEY = "agentnexus.webdav.config";

export function loadWebDavConfig(): WebDavConfig {
  const fallback: WebDavConfig = {
    enabled: false,
    endpoint: "",
    username: "",
    password: "",
    autoMode: "off",
    startupDelaySec: 10,
    intervalMin: 30,
    lastSyncAt: null,
  };

  const raw = window.localStorage.getItem(WEBDAV_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WebDavConfig>;
    return {
      ...fallback,
      ...parsed,
    };
  } catch {
    return fallback;
  }
}

export function saveWebDavConfig(next: WebDavConfig): void {
  window.localStorage.setItem(WEBDAV_KEY, JSON.stringify(next));
}
