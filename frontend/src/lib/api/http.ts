export type HttpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error?: string; data?: unknown };

export async function getJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<HttpResult<T>> {
  const response = await fetch(input, init);
  let payload: unknown = undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (response.ok) {
    return { ok: true, status: response.status, data: payload as T };
  }

  const error =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
      ? ((payload as { error: string }).error as string)
      : undefined;
  return { ok: false, status: response.status, error, data: payload };
}
