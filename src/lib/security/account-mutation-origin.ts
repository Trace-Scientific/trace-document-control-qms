// Sensitive cookie-authenticated account changes must originate from the
// application's own origin. Missing/malformed Origin is rejected fail-closed.
export function isSameOriginAccountMutation(request: { headers: Pick<Headers, "get">; nextUrl: Pick<URL, "origin"> }): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    return supplied.origin === request.nextUrl.origin &&
      (supplied.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && supplied.protocol === "http:"));
  } catch {
    return false;
  }
}
