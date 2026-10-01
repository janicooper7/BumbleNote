// The little branded page behind the unsubscribe links in our emails
// (src/app/api/waitlist/unsubscribe, src/app/api/email/unsubscribe).

export function unsubscribePage(body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>BumbleNote</title>
<style>
  body { margin: 0; background: #fbf8f1; color: #412e28; font: 17px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 440px; margin: 12vh auto 0; padding: 32px 28px; background: #fff; border-radius: 14px; }
  img { display: block; width: 112px; height: 64px; margin-bottom: 20px; }
  h1 { font: 400 28px/1.2 Georgia, "Times New Roman", serif; margin: 0 0 10px; }
  p { margin: 0 0 20px; color: #6b5245; }
  button { font: 700 15px/1 inherit; background: #412e28; color: #fff0b5; border: 0; border-radius: 999px; padding: 14px 26px; cursor: pointer; }
</style></head>
<body><main><img src="/logo-lockup.png" alt="BumbleNote">${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
