export type ApiResponsePayload = {
  error?: string;
  [key: string]: unknown;
};

export async function readApiResponse(response: Response): Promise<ApiResponsePayload> {
  const body = await response.text();
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ApiResponsePayload;
      }
    } catch {
      // Reverse proxies commonly return an HTML error page. Convert it into an
      // actionable message instead of leaking a JSON parser exception to users.
    }
  }

  if (response.status === 413) {
    return {
      error: "Upload rejected with HTTP 413 before PMP could process it. Increase the reverse proxy upload limit to at least the PMP file-upload limit, then retry.",
    };
  }
  if (response.status === 502 || response.status === 504) {
    return {
      error: `Upload failed with HTTP ${response.status}. The reverse proxy timed out or lost its connection to PMP; increase its upload timeouts and disable request buffering.`,
    };
  }
  return {
    error: `Server returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""} instead of a PMP API response. Check the reverse proxy and application logs.`,
  };
}
