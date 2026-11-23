/**
 * =============================================================================
 * CLOUDFLARE WORKER: VAX CORS PROXY & AI PLUGIN CONVERTER SERVER
 * Deploy miễn phí lên Cloudflare Workers để dùng cho App iOS (IPA) & Android (APK)
 * Cách dùng trong App VAX: Điền link Worker `https://ten-worker.workers.dev/?url={url}`
 * vào mục "CORS Proxy / AI Server" trong Cài đặt.
 * =============================================================================
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response(JSON.stringify({
        status: "ok",
        service: "VAX Film AI Proxy Worker",
        usage: "?url=https://target-movie-site.com"
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    try {
      const targetParsed = new URL(targetUrl);
      const headers = new Headers();
      headers.set("User-Agent", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
      headers.set("Referer", targetParsed.origin + "/");
      headers.set("Origin", targetParsed.origin);
      headers.set("Accept", "*/*");

      // Giữ lại các header đặc thù của VAX plugin nếu có
      for (const h of ["x-vax-yb", "x-f4k-pt", "api-key", "authorization", "content-type"]) {
        if (request.headers.has(h)) {
          headers.set(h, request.headers.get(h));
        }
      }

      const resp = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined,
        redirect: "follow"
      });

      const outHeaders = new Headers(corsHeaders);
      outHeaders.set("Content-Type", resp.headers.get("Content-Type") || "text/plain; charset=utf-8");

      return new Response(resp.body, {
        status: resp.status,
        headers: outHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
  }
};
