export async function validateCsrf(request: Request): Promise<void> {
  const method = request.method.toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return;
  }

  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;

  if (!origin || origin !== requestOrigin) {
    throw new Response("Forbidden", { status: 403 });
  }
}
