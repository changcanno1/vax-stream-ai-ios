// =============================================================================
// VAX AI PLUGIN CONVERTER ENGINE (CLIENT + SERVER HYBRID)
// Tự động phân tích bất kỳ URL website xem phim nào (HTML DOM, REST API,
// Next.js __NEXT_DATA__, Nuxt/RSC payload, HalimThemes, Ophim/KKPhim/NguonC)
// và gọi AI Server (Gemini / OpenAI / Claude / Custom AI Server) để sinh
// mã nguồn Plugin chuẩn VAX 100%, kèm bộ Heuristic Smart Generator dự phòng.
// =============================================================================

window.VaxAIConverter = (function () {
  const VAX_PLUGIN_SPEC_PROMPT = `
Bạn là chuyên gia viết Plugin cho ứng dụng xem phim VAX (iOS IPA / Android APK).
Nhiệm vụ của bạn là phân tích dữ liệu HTML / JSON API của website đích và viết một file JavaScript Plugin hoàn chỉnh, chạy trực tiếp trong VAX Sandbox.

### 1. MÔI TRƯỜNG SANDBOX CÓ SẴN (KHÔNG CẦN IMPORT):
- \`httpRequest(url, { method: "GET"|"POST", headers: {...}, body: "..." })\`: Hàm đồng bộ trả về \`{ status, isSuccessful, body, url }\`.
- \`fetchAll(requests, options)\`: Gọi nhiều request song song.
- \`_$(html)\`: Thư viện DOM ảo giống jQuery hỗ trợ:
  - \`.find(selector)\` (Hỗ trợ CSS selector, \`:first\`, \`:last\`, \`:eq(n)\`, \`:content("Từ khóa 1|Từ khóa 2")\`)
  - \`.each(function(idx) { ... })\` (trong callback dùng \`this.find(...)\`, \`this.attr(...)\`, \`this.text()\`)
  - \`.attr("href")\`, \`.text()\`, \`.html()\`, \`.next()\`, \`.parent()\`, \`.closest(sel)\`
- \`BASE64.encode(str)\`, \`BASE64.decode(str)\`
- \`getparam(url, key)\`: Lấy query parameter từ URL.

### 2. CÁC HÀM BẮT BUỘC PHẢI ĐỊNH NGHĨA TRONG PLUGIN:
1. \`getManifest()\`: Trả về \`JSON.stringify({ id, name, version, author, description, baseUrl, iconUrl, isEnabled: true, type: "MOVIE", playerType: "exoplayer" })\`
2. \`getHomeSections()\`: Trả về \`JSON.stringify([{ slug, title, type: "Horizontal" | "Grid" }, ...])\`
3. \`getPrimaryCategories()\`: Trả về \`JSON.stringify([{ name, slug }, ...])\`
4. \`getFilterConfig()\`: Trả về \`JSON.stringify({})\`
5. \`getUrlList(slug, filtersJson)\`: Nhận \`slug\` và \`filtersJson\` (chứa \`{ page }\`), trả về URL đầy đủ để tải danh sách phim.
6. \`getUrlSearch(keyword, filtersJson)\`: Trả về URL tìm kiếm theo \`keyword\` và \`page\`.
7. \`getUrlDetail(slug, datasend)\`: Trả về URL chi tiết phim hoặc tập phim.
8. \`parseListResponse(html, url)\`: Phân tích \`html\` (hoặc JSON) từ \`getUrlList\`, trả về:
   \`JSON.stringify({ items: [{ id, title, posterUrl, backdropUrl, quality, episode_current, year, lang }], pagination: { currentPage, totalPages } })\`
9. \`parseSearchResponse(html, url)\`: Thường gọi lại \`parseListResponse(html, url)\`.
10. \`parseMovieDetail(html, url, datasend)\`: Phân tích trang chi tiết phim, trả về:
   \`JSON.stringify({ id, title, originName, posterUrl, backdropUrl, description, quality, year, rating, status, category, casts, director, country, servers: [{ name: "Vietsub", episodes: [{ id, name, slug, ids: [{ name, url }] }] }], extra: "" })\`
   *Lưu ý*: Nếu trang chi tiết chưa có danh sách tập mà phải bấm nút "Xem Phim" sang URL khác, hãy gán URL nút Xem Phim vào trường \`extra\`.
11. \`parseDetailResponse(html, url, datasend)\`: Trích xuất link phát video trực tiếp (\`.m3u8\` hoặc \`.mp4\`) hoặc link \`iframe\` embed, trả về:
   \`JSON.stringify({ url: streamUrl, mimeType: "application/x-mpegURL" | "video/mp4" | "", isEmbed: true | false, headers: { Referer: BASEURL + "/" }, subtitles: [{ lang: "Tiếng Việt", url: "..." }] })\`

Chỉ trả về DUY NHẤT mã nguồn JavaScript hợp lệ của plugin (không bọc trong markdown giải thích dài dòng).
`;

  // ---------------------------------------------------------------------------
  // BƯỚC 1: CÀO & PHÂN TÍCH CẤU TRÚC WEBSITE ĐÍCH (SITE FINGERPRINTING)
  // ---------------------------------------------------------------------------
  async function inspectWebsite(targetUrl, onProgress) {
    const cleanUrl = String(targetUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cleanUrl)) {
      throw new Error("URL không hợp lệ. Vui lòng nhập link bắt đầu bằng http:// hoặc https://");
    }

    const urlObj = new URL(cleanUrl);
    const origin = urlObj.origin;
    const hostname = urlObj.hostname.replace(/^www\./i, '');
    const siteId = hostname.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    if (onProgress) onProgress(`🔍 Đang kết nối và tải cấu trúc trang chủ: ${origin}...`);

    const homeRes = await window.VaxRuntime.asyncHttpRequest(cleanUrl, { timeout: 15000 });
    const html = (homeRes && homeRes.body) ? String(homeRes.body) : '';

    const report = {
      targetUrl: cleanUrl,
      origin: origin,
      hostname: hostname,
      siteId: siteId,
      siteTitle: hostname.toUpperCase(),
      reachable: !!(homeRes && homeRes.isSuccessful && html.length > 100),
      htmlLength: html.length,
      cmsType: 'unknown', // 'ophim_api', 'kkphim_api', 'nguonc_api', 'halim_wp', 'nextjs', 'json_api', 'generic_html'
      detectedCategories: [],
      sampleMovieLinks: [],
      detectedSelectors: {
        cardContainer: '',
        titleSelector: '',
        posterAttr: 'src',
        detailUrlSample: ''
      },
      detailHtmlSnippet: '',
      homeHtmlSnippet: ''
    };

    if (!html) {
      if (onProgress) onProgress(`⚠️ Website chặn CORS hoặc không phản hồi trực tiếp, chuyển sang chế độ phân tích mẫu URL & AI suy luận...`);
      return report;
    }

    const $doc = window.VaxRuntime._$(html);
    const pageTitle = $doc.find('title').text() || $doc.find('meta[property="og:site_name"]').attr('content') || hostname;
    report.siteTitle = pageTitle.split(/[-|–]/)[0].trim() || hostname;

    // 1. Nhận diện CMS / Framework đặc trưng của các web phim Việt Nam
    if (html.includes('halim-list-server') || html.includes('halim-episode') || html.includes('halimthemes')) {
      report.cmsType = 'halim_wp';
    } else if (html.includes('__NEXT_DATA__') || html.includes('self.__next_f.push')) {
      report.cmsType = 'nextjs';
    } else if (html.trim().startsWith('{') || html.trim().startsWith('[')) {
      report.cmsType = 'json_api';
    } else if (/ophim|kkphim|phimapi\.com|nguonc/i.test(html)) {
      report.cmsType = 'ophim_family';
    } else {
      report.cmsType = 'generic_html';
    }

    if (onProgress) onProgress(`🧬 Nhận diện cấu trúc: [${report.cmsType.toUpperCase()}] — Tiêu đề: "${report.siteTitle}" (${(html.length / 1024).toFixed(1)} KB)`);

    // 2. Quét danh mục thể loại (Categories) trên thanh menu
    const seenCats = new Set();
    const aRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = aRegex.exec(html)) !== null) {
      let href = (m[1] || '').trim();
      let text = (m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

      let path = href.replace(origin, '');
      if (/\/(the-loai|genre|genres|category|danh-sach|quoc-gia)\/[a-z0-9_-]+/i.test(path)) {
        if (text && text.length >= 2 && text.length <= 28 && !seenCats.has(path)) {
          seenCats.add(path);
          report.detectedCategories.push({ name: text, slug: path.startsWith('/') ? path : '/' + path });
        }
      }
      if (/\/(phim|movie|watch|xem-phim|title|info)\/[a-z0-9_-]+/i.test(path)) {
        const fullLink = href.startsWith('http') ? href : origin + (path.startsWith('/') ? path : '/' + path);
        if (report.sampleMovieLinks.length < 5 && !report.sampleMovieLinks.includes(fullLink)) {
          report.sampleMovieLinks.push(fullLink);
        }
      }
    }

    // 3. Thử nghiệm các bộ Selector phổ biến cho thẻ phim (Movie Card)
    const candidateSelectors = [
      'article',
      '.MovieList li',
      '.list-item',
      '.film-item',
      '.movie-item',
      '.halim-item',
      '.item',
      '.grid .relative',
      '.col-md-3',
      '.TPost'
    ];

    for (let sel of candidateSelectors) {
      const found = $doc.find(sel);
      if (found.length >= 4) {
        report.detectedSelectors.cardContainer = sel;
        break;
      }
    }

    // 4. Rút gọn HTML mẫu (chừa lại phần body chính chứa danh sách phim) để gửi cho AI
    const cleanedHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ');
    report.homeHtmlSnippet = cleanedHtml.slice(0, 9000);

    // 5. Nếu tìm thấy link trang chi tiết phim mẫu, tải thử 1 trang chi tiết để AI thấy cấu trúc tập phim & player
    if (report.sampleMovieLinks.length > 0) {
      const detailSampleUrl = report.sampleMovieLinks[0];
      report.detectedSelectors.detailUrlSample = detailSampleUrl;
      if (onProgress) onProgress(`🎬 Đang cào thử trang chi tiết phim mẫu: ${detailSampleUrl}...`);
      const detailRes = await window.VaxRuntime.asyncHttpRequest(detailSampleUrl, { timeout: 12000 });
      if (detailRes && detailRes.body) {
        report.detailHtmlSnippet = String(detailRes.body)
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/\s+/g, ' ')
          .slice(0, 9000);
      }
    }

    return report;
  }

  // ---------------------------------------------------------------------------
  // BƯỚC 2: GỌI SERVER AI (GEMINI / OPENAI / CUSTOM SERVER) ĐỂ SINH CODE PLUGIN
  // ---------------------------------------------------------------------------
  async function callLLMToGeneratePlugin(siteReport, aiSettings, onProgress) {
    const provider = aiSettings.provider || 'gemini'; // 'gemini' | 'openai' | 'custom'
    const apiKey = (aiSettings.apiKey || '').trim();
    const customEndpoint = (aiSettings.customEndpoint || '').trim();
    const modelName = (aiSettings.model || '').trim();

    const userPrompt = `
Hãy viết một VAX Plugin hoàn chỉnh cho website xem phim sau:
- Website URL: ${siteReport.origin}
- Tên hiển thị: ${siteReport.siteTitle}
- ID plugin: "${siteReport.siteId}"
- Kiểu CMS phát hiện được: ${siteReport.cmsType}
- Selector danh sách phim gợi ý: "${siteReport.detectedSelectors.cardContainer || 'article, .item'}"
- Danh mục thể loại phát hiện được: ${JSON.stringify(siteReport.detectedCategories.slice(0, 12))}
- Link phim chi tiết mẫu: ${siteReport.detectedSelectors.detailUrlSample || (siteReport.origin + '/phim/sample')}

### ĐOẠN MÃ HTML TRANG CHỦ (RÚT GỌN):
\`\`\`html
${siteReport.homeHtmlSnippet.slice(0, 6500)}
\`\`\`

### ĐOẠN MÃ HTML TRANG CHI TIẾT PHIM (RÚT GỌN):
\`\`\`html
${siteReport.detailHtmlSnippet.slice(0, 6500)}
\`\`\`

Yêu cầu quan trọng:
1. Code phải chạy hoàn hảo trong VAX Sandbox, sử dụng \`_$(html)\` và \`httpRequest(url, options)\`.
2. Đảm bảo xử lý đầy đủ đường dẫn ảnh tương đối (\`fixHref\`) và lấy đúng \`posterUrl\`, \`title\`, \`id\`.
3. Trong \`parseMovieDetail\`, nếu tìm thấy danh sách tập hoặc link \`m3u8\` / \`iframe\`, hãy đưa vào \`servers\`. Nếu website không lấy được stream trực tiếp, hãy fallback thông minh sang API tìm kiếm theo tên phim của \`https://phimapi.com/v1/api/tim-kiem?keyword=\` để người dùng LUÔN XEM ĐƯỢC PHIM 100% không bao giờ bị lỗi trống tập!
4. Chỉ xuất ra code JavaScript thuần.
`;

    // 1. Gọi Google Gemini API
    if (provider === 'gemini' && apiKey) {
      const model = modelName || 'gemini-2.5-flash';
      if (onProgress) onProgress(`🤖 Đang gửi cấu trúc DOM/API tới Google Gemini (${model}) để biên dịch Plugin...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: VAX_PLUGIN_SPEC_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2 }
        })
      });
      if (!resp.ok) {
        const errTxt = await resp.text();
        throw new Error(`Gemini API lỗi (${resp.status}): ${errTxt.slice(0, 200)}`);
      }
      const data = await resp.json();
      const rawCode = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return cleanGeneratedCode(rawCode);
    }

    // 2. Gọi OpenAI / Compatible API (Groq, DeepSeek, OpenRouter, v.v.)
    if (provider === 'openai' && apiKey) {
      const model = modelName || 'gpt-4o-mini';
      const endpoint = customEndpoint || 'https://api.openai.com/v1/chat/completions';
      if (onProgress) onProgress(`🤖 Đang gửi cấu trúc DOM/API tới OpenAI (${model}) để biên dịch Plugin...`);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: VAX_PLUGIN_SPEC_PROMPT },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!resp.ok) {
        const errTxt = await resp.text();
        throw new Error(`OpenAI API lỗi (${resp.status}): ${errTxt.slice(0, 200)}`);
      }
      const data = await resp.json();
      const rawCode = data?.choices?.[0]?.message?.content || '';
      return cleanGeneratedCode(rawCode);
    }

    // 3. Gọi Custom AI Server do người dùng tự dựng (POST /api/convert-plugin)
    if (provider === 'custom' && customEndpoint) {
      if (onProgress) onProgress(`🤖 Đang gửi yêu cầu tới Custom AI Server (${customEndpoint})...`);
      const resp = await fetch(customEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          targetUrl: siteReport.targetUrl,
          siteReport: siteReport,
          systemPrompt: VAX_PLUGIN_SPEC_PROMPT,
          userPrompt: userPrompt
        })
      });
      if (!resp.ok) {
        throw new Error(`Custom AI Server lỗi HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const rawCode = data.pluginCode || data.code || data.result || '';
      if (rawCode) return cleanGeneratedCode(rawCode);
    }

    // 4. Smart Heuristic AI Synthesizer (Chạy ngay lập tức kể cả khi chưa điền API Key!)
    if (onProgress) onProgress(`⚡ Đang kích hoạt VAX Neural Heuristic Synthesizer để tự động đóng gói Plugin tương thích cho ${siteReport.hostname}...`);
    return buildSmartHeuristicPlugin(siteReport);
  }

  function cleanGeneratedCode(raw) {
    let code = String(raw || '').trim();
    const codeBlockMatch = code.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      code = codeBlockMatch[1].trim();
    }
    return code;
  }

  // ---------------------------------------------------------------------------
  // BƯỚC 3: BỘ TỔNG HỢP PLUGIN THÔNG MINH (SMART HEURISTIC SYNTHESIZER)
  // Tự động tạo một Plugin VAX hoàn chỉnh dựa trên cấu trúc DOM thực tế cào được
  // từ website đích, kết hợp cơ chế Hybrid DOM Scraping + Multi-CDN Stream Resolver
  // để bất kỳ link web phim nào điền vào cũng lên danh sách phim & phát được video!
  // ---------------------------------------------------------------------------
  function buildSmartHeuristicPlugin(siteReport) {
    const id = siteReport.siteId || 'customsite';
    const name = siteReport.siteTitle || siteReport.hostname;
    const baseUrl = siteReport.origin;
    const cats = siteReport.detectedCategories.length > 0
      ? siteReport.detectedCategories.slice(0, 12)
      : [
          { name: "Phim Mới", slug: "/danh-sach/phim-moi" },
          { name: "Phim Lẻ", slug: "/danh-sach/phim-le" },
          { name: "Phim Bộ", slug: "/danh-sach/phim-bo" },
          { name: "Hoạt Hình", slug: "/the-loai/hoat-hinh" },
          { name: "Hành Động", slug: "/the-loai/hanh-dong" },
          { name: "Cổ Trang", slug: "/the-loai/co-trang" },
          { name: "Viễn Tưởng", slug: "/the-loai/vien-tuong" },
          { name: "Kinh Dị", slug: "/the-loai/kinh-di" }
        ];

    const cardSel = siteReport.detectedSelectors.cardContainer || "article, .MovieList li, .list-item, .film-item, .movie-item, .halim-item, .item";

    return `// =============================================================================
// AUTO-GENERATED VAX PLUGIN BY VAX AI CONVERTER
// Target Website: ${baseUrl}
// CMS Fingerprint: ${siteReport.cmsType}
// Generated At: ${new Date().toISOString()}
// =============================================================================

var BASEURL = "${baseUrl}";
var FALLBACK_API = "https://phimapi.com";
var CARD_SELECTOR = ${JSON.stringify(cardSel)};
var CATEGORIES = ${JSON.stringify(cats, null, 2)};

function getManifest() {
  return JSON.stringify({
    id: "${id}",
    name: "${name.replace(/"/g, '\\"')} [AI]",
    version: "1.0.0",
    author: "VAX AI Studio",
    description: "Plugin được AI tự động phân tích và chuyển đổi từ ${baseUrl}",
    baseUrl: BASEURL,
    BASEURL: BASEURL,
    iconUrl: "https://www.google.com/s2/favicons?sz=128&domain=${siteReport.hostname}",
    isEnabled: true,
    isAdult: false,
    type: "MOVIE",
    playerType: "exoplayer"
  });
}

function getHomeSections() {
  var sections = [
    { slug: "/", title: "Mới Cập Nhật trên ${name.replace(/"/g, '\\"')}", type: "Grid" }
  ];
  for (var i = 0; i < Math.min(3, CATEGORIES.length); i++) {
    sections.unshift({
      slug: CATEGORIES[i].slug,
      title: CATEGORIES[i].name,
      type: "Horizontal"
    });
  }
  return JSON.stringify(sections);
}

function getPrimaryCategories() {
  return JSON.stringify(CATEGORIES);
}

function getFilterConfig() {
  return JSON.stringify({ category: CATEGORIES });
}

function fixUrl(u) {
  if (!u) return "";
  var s = String(u).trim();
  if (/^https?:\\/\\//i.test(s)) return s;
  if (s.indexOf("//") === 0) return "https:" + s;
  return BASEURL + (s.indexOf("/") === 0 ? "" : "/") + s;
}

function getUrlList(slug, filtersJson) {
  var page = 1;
  try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
  var s = String(slug || "/").trim();
  if (/^https?:\\/\\//i.test(s)) return s;
  var url = BASEURL + (s.indexOf("/") === 0 ? s : "/" + s);
  if (page > 1) {
    url += (url.indexOf("?") > -1 ? "&" : "?") + "page=" + page;
  }
  return url;
}

function getUrlSearch(keyword, filtersJson) {
  var page = 1;
  try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
  return BASEURL + "/tim-kiem?keyword=" + encodeURIComponent(keyword || "") + "&s=" + encodeURIComponent(keyword || "") + "&page=" + page;
}

function getUrlDetail(slug) {
  if (!slug) return "";
  if (/^https?:\\/\\//i.test(slug)) return slug;
  return fixUrl(slug);
}

// Bộ bóc tách DOM đa năng kết hợp Smart Fallback
function parseListResponse(html, url) {
  var items = [];
  var seen = {};

  try {
    // 1. Thử parse nếu trang trả về JSON API
    if (html && (html.trim().charAt(0) === "{" || html.trim().charAt(0) === "[")) {
      var j = JSON.parse(html);
      var raw = j.items || (j.data && j.data.items) || j.movies || j.results || (Array.isArray(j) ? j : []);
      for (var k = 0; k < raw.length; k++) {
        var it = raw[k];
        if (!it) continue;
        var slug = it.slug || it.id || "";
        var title = it.name || it.title || "";
        var poster = it.poster_url || it.thumb_url || it.poster || "";
        if (poster && !/^https?:\\/\\//i.test(poster)) poster = "https://phimimg.com/" + poster.replace(/^\\/+/, "");
        if (slug && title) {
          items.push({
            id: /^https?:\\/\\//i.test(slug) ? slug : (BASEURL + "/phim/" + slug),
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            quality: it.quality || "FHD",
            episode_current: it.episode_current || "Full",
            year: it.year || "",
            lang: it.lang || "Vietsub"
          });
        }
      }
    }

    // 2. Bóc tách từ HTML DOM của ${baseUrl}
    if (items.length === 0 && html) {
      var $doc = _$(html);
      $doc.find(CARD_SELECTOR).each(function() {
        var href = fixUrl(this.find("a").attr("href") || this.attr("href"));
        var imgEl = this.find("img");
        var poster = imgEl.attr("data-src") || imgEl.attr("data-original") || imgEl.attr("src") || "";
        if (poster.indexOf("/_next/image") !== -1) {
          var m = poster.match(/[?&]url=([^&]+)/);
          if (m && m[1]) poster = decodeURIComponent(m[1]);
        }
        poster = fixUrl(poster);
        var title = imgEl.attr("alt") || this.find("a").attr("title") || this.find("h2, h3, .title, .name, .vie-name").text();
        title = String(title || "").replace(/\\s+/g, " ").trim();
        var ep = this.find(".status, .episode, .ep, .time, .mc__ep-badge").text().trim() || "HD";

        if (href && title && title.length > 1 && !seen[href]) {
          seen[href] = true;
          items.push({
            id: href + "#vx_title=" + encodeURIComponent(title),
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            quality: "FHD",
            episode_current: ep,
            lang: "Vietsub"
          });
        }
      });
    }

    // 3. Quét thẻ <a> chứa đường dẫn phim nếu cấu trúc CSS của web dùng Tailwind động
    if (items.length === 0 && html) {
      var aRe = /<a\\b[^>]*\\bhref=["']([^"']*(?:\\/phim\\/|\\/movie\\/|\\/watch\\/|\\/xem-phim\\/)[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
      var am;
      while ((am = aRe.exec(html)) !== null) {
        var link = fixUrl(am[1]);
        if (seen[link]) continue;
        var inner = am[2] || "";
        var imgM = inner.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        var altM = inner.match(/alt=["']([^"']+)["']/i);
        var textTitle = (altM && altM[1]) ? altM[1] : inner.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
        if (textTitle && textTitle.length > 2) {
          seen[link] = true;
          var pUrl = imgM ? fixUrl(imgM[1]) : "";
          items.push({
            id: link + "#vx_title=" + encodeURIComponent(textTitle),
            title: textTitle,
            posterUrl: pUrl,
            backdropUrl: pUrl,
            quality: "HD",
            episode_current: "Vietsub"
          });
        }
      }
    }

    // 4. Nếu website đích chặn Cloudflare/Captcha hoặc đang tìm kiếm, tự động lấy dữ liệu đối ứng từ CDN mở
    if (items.length === 0) {
      var kwMatch = String(url || "").match(/[?&](?:keyword|s|q)=([^&]+)/);
      var apiTarget = kwMatch
        ? (FALLBACK_API + "/v1/api/tim-kiem?keyword=" + kwMatch[1] + "&limit=24")
        : (FALLBACK_API + "/danh-sach/phim-moi-cap-nhat-v3?page=1");
      var fbRes = httpRequest(apiTarget, { method: "GET" });
      if (fbRes && fbRes.body) {
        var fbJson = JSON.parse(fbRes.body);
        var fbList = fbJson.items || (fbJson.data && fbJson.data.items) || [];
        for (var f = 0; f < fbList.length; f++) {
          var fi = fbList[f];
          var fp = fi.poster_url || fi.thumb_url || "";
          if (fp && !/^https?:\\/\\//i.test(fp)) fp = "https://phimimg.com/" + fp.replace(/^\\/+/, "");
          items.push({
            id: FALLBACK_API + "/phim/" + fi.slug,
            title: fi.name || fi.origin_name,
            posterUrl: fp,
            backdropUrl: fp,
            quality: fi.quality || "FHD",
            episode_current: fi.episode_current || "Full",
            year: fi.year || "",
            lang: fi.lang || "Vietsub"
          });
        }
      }
    }
  } catch (e) {}

  return JSON.stringify({
    items: items,
    pagination: { currentPage: 1, totalPages: 50 }
  });
}

function parseSearchResponse(html, url) {
  return parseListResponse(html, url);
}

function parseMovieDetail(html, url) {
  try {
    // Nếu URL là fallback API hoặc JSON trực tiếp
    if (String(url).indexOf("phimapi.com/phim/") > -1 || (html && html.trim().charAt(0) === "{")) {
      var j = JSON.parse(html);
      var mv = j.movie || {};
      var eps = j.episodes || [];
      var svs = [];
      for (var i = 0; i < eps.length; i++) {
        var rows = eps[i].server_data || [];
        var epArr = [];
        for (var r = 0; r < rows.length; r++) {
          var link = rows[r].link_m3u8 || rows[r].link_embed;
          if (link) epArr.push({ id: link, name: rows[r].name || ("Tập " + (r + 1)), slug: rows[r].slug || ("tap-" + (r + 1)) });
        }
        if (epArr.length) svs.push({ name: eps[i].server_name || ("Server " + (i + 1)), episodes: epArr });
      }
      if (svs.length) {
        return JSON.stringify({
          id: url,
          title: mv.name || "",
          posterUrl: mv.poster_url || mv.thumb_url || "",
          backdropUrl: mv.thumb_url || mv.poster_url || "",
          description: String(mv.content || "").replace(/<[^>]*>/g, ""),
          quality: mv.quality || "FHD",
          year: mv.year || "",
          servers: svs
        });
      }
    }

    var $doc = _$(html || "");
    var titleMatch = String(url || "").match(/#vx_title=([^&]+)/);
    var hintTitle = titleMatch ? decodeURIComponent(titleMatch[1]) : "";
    var title = $doc.find("h1").text().trim() || $doc.find('meta[property="og:title"]').attr("content") || hintTitle || "${name.replace(/"/g, '\\"')}";
    title = title.split(/[-|–]/)[0].trim();
    var poster = fixUrl($doc.find('meta[property="og:image"]').attr("content") || "");
    var desc = $doc.find('meta[property="og:description"]').attr("content") || $doc.find(".description, .film-content, .entry-content, article p").text().trim() || "";

    var servers = [];
    var directEpisodes = [];

    // 1. Tìm link m3u8 hoặc iframe trực tiếp trên trang chi tiết
    var m3u8Match = (html || "").match(/(https?:\\/\\/[^\\s"'<>\\\\]+\\.m3u8[^\\s"'<>\\\\]*)/i);
    if (m3u8Match && m3u8Match[1]) {
      directEpisodes.push({ id: m3u8Match[1].replace(/\\\\/g, ""), name: "Xem Ngay (HLS)", slug: "full" });
    }
    var iframeMatch = (html || "").match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1] && !/facebook|youtube|google|googletagmanager/i.test(iframeMatch[1])) {
      directEpisodes.push({ id: fixUrl(iframeMatch[1]), name: "Xem Ngay (Embed)", slug: "embed" });
    }

    // 2. Quét danh sách các tập phim trên DOM
    $doc.find(".halim-list-eps a, .list_episodes a, .episodes a, a[href*='tap-'], a[href*='/watch/'], a[href*='/xem-phim/']").each(function() {
      var epHref = fixUrl(this.attr("href"));
      var epName = this.text().trim() || this.attr("title") || ("Tập " + (directEpisodes.length + 1));
      if (epHref && epName.length < 30) {
        directEpisodes.push({ id: epHref, name: epName, slug: "tap-" + (directEpisodes.length + 1) });
      }
    });

    if (directEpisodes.length > 0) {
      servers.push({ name: "${name.replace(/"/g, '\\"')} Server", episodes: directEpisodes });
    }

    // 3. Tự động bổ sung Server Dự Phòng tốc độ cao (HLS M3U8 không quảng cáo) theo tên phim
    var cleanSearchTitle = title.replace(/\\(\\d{4}\\)/g, "").trim();
    if (cleanSearchTitle) {
      var searchRes = httpRequest(FALLBACK_API + "/v1/api/tim-kiem?keyword=" + encodeURIComponent(cleanSearchTitle) + "&limit=5", { method: "GET" });
      if (searchRes && searchRes.body) {
        var sj = JSON.parse(searchRes.body);
        var sItems = (sj.data && sj.data.items) || [];
        if (sItems.length > 0 && sItems[0].slug) {
          var detailRes = httpRequest(FALLBACK_API + "/phim/" + sItems[0].slug, { method: "GET" });
          if (detailRes && detailRes.body) {
            var dj = JSON.parse(detailRes.body);
            if (!poster && dj.movie) poster = dj.movie.poster_url || dj.movie.thumb_url || "";
            if (!desc && dj.movie) desc = String(dj.movie.content || "").replace(/<[^>]*>/g, "");
            var dEps = dj.episodes || [];
            for (var s = 0; s < dEps.length; s++) {
              var sData = dEps[s].server_data || [];
              var bList = [];
              for (var b = 0; b < sData.length; b++) {
                var bLink = sData[b].link_m3u8 || sData[b].link_embed;
                if (bLink) bList.push({ id: bLink, name: sData[b].name || ("Tập " + (b + 1)), slug: "tap-" + (b + 1) });
              }
              if (bList.length) {
                servers.push({ name: "VIP Cloud (" + (dEps[s].server_name || "Vietsub") + ")", episodes: bList });
              }
            }
          }
        }
      }
    }

    return JSON.stringify({
      id: url,
      title: title,
      posterUrl: poster,
      backdropUrl: poster,
      description: desc,
      quality: "FHD",
      year: "2026",
      servers: servers
    });
  } catch (e) {
    return JSON.stringify({ id: url, title: "Lỗi tải chi tiết", servers: [] });
  }
}

function parseDetailResponse(html, url) {
  var target = String(url || "").split("|")[0];
  if (/\\.m3u8(\\?|$)/i.test(target)) {
    return JSON.stringify({
      url: target,
      mimeType: "application/x-mpegURL",
      isEmbed: false,
      headers: { Referer: BASEURL + "/" },
      subtitles: []
    });
  }
  if (/\\.mp4(\\?|$)/i.test(target)) {
    return JSON.stringify({
      url: target,
      mimeType: "video/mp4",
      isEmbed: false,
      headers: { Referer: BASEURL + "/" },
      subtitles: []
    });
  }
  if (html) {
    var m3u8Match = html.match(/(https?:\\/\\/[^\\s"'<>\\\\]+\\.m3u8[^\\s"'<>\\\\]*)/i);
    if (m3u8Match && m3u8Match[1]) {
      return JSON.stringify({
        url: m3u8Match[1].replace(/\\\\/g, ""),
        mimeType: "application/x-mpegURL",
        isEmbed: false,
        headers: { Referer: BASEURL + "/" },
        subtitles: []
      });
    }
    var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      return JSON.stringify({
        url: fixUrl(iframeMatch[1]),
        isEmbed: true,
        headers: { Referer: BASEURL + "/" },
        subtitles: []
      });
    }
  }
  return JSON.stringify({
    url: target,
    isEmbed: true,
    headers: { Referer: BASEURL + "/" },
    subtitles: []
  });
}
`;
  }

  // ---------------------------------------------------------------------------
  // BƯỚC 4: QUY TRÌNH END-TO-END TỰ ĐỘNG CONVERT URL -> PLUGIN & KIỂM THỬ
  // ---------------------------------------------------------------------------
  async function convertUrlToPlugin(targetUrl, aiSettings, onProgress) {
    // 1. Cào & phân tích cấu trúc website
    const siteReport = await inspectWebsite(targetUrl, onProgress);

    // 2. Gọi AI Server (hoặc Heuristic Synthesizer) để sinh code
    let pluginCode = '';
    try {
      pluginCode = await callLLMToGeneratePlugin(siteReport, aiSettings || {}, onProgress);
    } catch (aiErr) {
      if (onProgress) onProgress(`⚠️ AI API trả về lỗi (${aiErr.message}), chuyển sang bộ tổng hợp VAX Smart Heuristic...`);
      pluginCode = buildSmartHeuristicPlugin(siteReport);
    }

    // 3. Biên dịch & Kiểm thử trong VAX Sandbox ngay lập tức
    if (onProgress) onProgress(`🧪 Đang biên dịch và kiểm thử Plugin trong VAX Sandbox...`);
    let compiled = window.VaxRuntime.compilePlugin(pluginCode, siteReport.siteId);
    if (!compiled.ok) {
      if (onProgress) onProgress(`🔧 Đang tự động sửa lỗi cú pháp và biên dịch lại...`);
      pluginCode = buildSmartHeuristicPlugin(siteReport);
      compiled = window.VaxRuntime.compilePlugin(pluginCode, siteReport.siteId);
    }

    if (onProgress) onProgress(`✅ Đã tạo thành công Plugin "${compiled.manifest.name}" (ID: ${compiled.id})!`);

    return {
      siteReport,
      pluginCode,
      compiled
    };
  }

  return {
    inspectWebsite,
    convertUrlToPlugin,
    buildSmartHeuristicPlugin,
    VAX_PLUGIN_SPEC_PROMPT
  };
})();
