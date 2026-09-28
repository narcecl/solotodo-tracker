import type { BrowseEntry, Params, TrackedUrlStatus } from "./types";

const ALLOWED_HOSTS = new Set(["www.solotodo.cl", "solotodo.cl"]);
const IGNORED_KEYS = new Set(["ordering", "page", "page_size"]);
const FLIGHT_CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const USER_AGENT = "Mozilla/5.0 (compatible; solotodo-tracker)";

export class InvalidUrlError extends Error {}

export interface LandingConfig {
  categoryId: number;
  implicitParams: string;
}

export interface ResolvedUrl {
  url: string;
  categoryId: number | null;
  params: Params;
  status: TrackedUrlStatus;
}

export interface ResolveDeps {
  fetchHtml(url: string): Promise<string>;
  browse(categoryId: number, params: Params): Promise<BrowseEntry[]>;
}

export function parseSolotodoUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidUrlError("La URL no es válida");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidUrlError("La URL debe empezar con https://");
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new InvalidUrlError("La URL debe ser de solotodo.cl");
  }
  if (url.pathname.startsWith("/products/")) {
    throw new InvalidUrlError("Solo se pueden seguir listados, no fichas de producto");
  }
  return url;
}

function decodeFlightData(html: string): string {
  let text = "";
  for (const match of html.matchAll(FLIGHT_CHUNK)) {
    try {
      text += JSON.parse(`"${match[1]}"`) as string;
    } catch {
      // chunk no decodificable: se ignora
    }
  }
  return text;
}

export function extractLandingConfig(html: string): LandingConfig | null {
  const text = decodeFlightData(html);
  const subIndex = text.indexOf('"subCategory":');
  if (subIndex === -1) return null;

  const categoryMatches = [...text.slice(0, subIndex).matchAll(/"category":\{"id":(\d+)/g)];
  const lastCategory = categoryMatches.at(-1);
  if (!lastCategory) return null;

  let categoryId = Number(lastCategory[1]);
  let implicitParams = "";
  const sub = text.slice(subIndex).match(/^"subCategory":(\{[^{}]*\})/);
  if (sub) {
    try {
      const parsed = JSON.parse(sub[1]) as { category?: unknown; params?: unknown };
      if (typeof parsed.category === "number") categoryId = parsed.category;
      if (typeof parsed.params === "string") implicitParams = parsed.params;
    } catch {
      // subCategory ilegible: se usa solo la categoría de la página
    }
  }
  return { categoryId, implicitParams };
}

function toParams(source: URLSearchParams): Params {
  const params: Params = {};
  for (const [key, value] of source) {
    if (IGNORED_KEYS.has(key) || value === "") continue;
    (params[key] ??= []).push(value);
  }
  return params;
}

export function mergeParams(implicitParams: string, query: URLSearchParams): Params {
  return { ...toParams(new URLSearchParams(implicitParams)), ...toParams(query) };
}

export async function fetchPageHtml(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const response = await fetchFn(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GET ${url} respondió ${response.status}`);
  return response.text();
}

export async function resolveUrl(raw: string, deps: ResolveDeps): Promise<ResolvedUrl> {
  const url = parseSolotodoUrl(raw);
  const normalized = url.toString();

  let config: LandingConfig | null = null;
  try {
    config = extractLandingConfig(await deps.fetchHtml(normalized));
  } catch {
    config = null;
  }

  const params = mergeParams(config?.implicitParams ?? "", url.searchParams);
  if (!config) return { url: normalized, categoryId: null, params, status: "needs_review" };

  try {
    const entries = await deps.browse(config.categoryId, params);
    return {
      url: normalized,
      categoryId: config.categoryId,
      params,
      status: entries.length > 0 ? "ok" : "needs_review",
    };
  } catch {
    return { url: normalized, categoryId: config.categoryId, params, status: "needs_review" };
  }
}
