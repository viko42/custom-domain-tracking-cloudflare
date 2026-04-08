export function handleHealth(): Response {
  return new Response("OK", { status: 200 });
}
