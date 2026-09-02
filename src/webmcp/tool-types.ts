export const EMPTY_OBJECT_SCHEMA = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

export interface ToolRequestInit {
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  signal?: AbortSignal;
}

export type ToolRequest = <T>(
  path: string,
  init?: ToolRequestInit,
) => Promise<T>;

export interface CampaignToolDependencies {
  request: ToolRequest;
  scheduleStateRefresh: () => void;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return typeof payload === "string" && payload.length > 0 ? payload : fallback;
}

export async function requestJson<T>(
  path: string,
  init: ToolRequestInit = {},
  fetcher: Fetcher = fetch,
): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;

  try {
    response = await fetcher(path, {
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      method,
      signal: init.signal,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${method} ${path} failed before response: Unable to reach the RightsOps server. Check the connection and retry. Cause: ${cause}`,
    );
  }
  const text = await response.text();
  let payload: unknown = null;

  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = getErrorMessage(payload, response.statusText || "Request failed");
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }

  return payload as T;
}
