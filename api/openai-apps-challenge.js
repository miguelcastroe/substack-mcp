function textResponse(response, status, body, extraHeaders = {}) {
  response.status(status);
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(String(body));
}

/**
 * OpenAI verifies ownership of an MCP host at the root well-known challenge path during plugin
 * submission. Vercel routes that public path here via vercel.json.
 *
 * The token is deliberately optional until the submission portal issues one. If it is absent, this
 * endpoint returns 404 rather than leaking configuration details or serving a placeholder that could
 * be mistaken for a successful verification response.
 */
export default async function handler(request, response) {
  if (request.method !== "GET") {
    textResponse(response, 405, "Method Not Allowed", {Allow: "GET"});
    return;
  }

  const token = process.env.OPENAI_PLUGIN_DOMAIN_VERIFICATION_TOKEN;
  if (!token) {
    textResponse(response, 404, "Not Found");
    return;
  }

  // The verifier expects the exact token as plain text: no JSON wrapper and no added newline.
  textResponse(response, 200, token);
}
