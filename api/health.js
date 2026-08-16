export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({error: "method_not_allowed"});
    return;
  }

  const configured = [
    "SUBSTACK_PUBLICATION_URL",
    "SUBSTACK_SESSION_TOKEN",
    "SUBSTACK_USER_ID",
    "SUBSTACK_MCP_BEARER_TOKEN",
  ].every((name) => Boolean(process.env[name]));

  response.status(configured ? 200 : 503).json({
    service: "Substack Intelligence",
    mode: "read-only",
    configured,
  });
}
