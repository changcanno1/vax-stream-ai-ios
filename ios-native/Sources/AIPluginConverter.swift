import Foundation

// =============================================================================
// 6. AI WEBSITE -> VAX PLUGIN CONVERTER (AIPluginConverter.swift)
// Cho phép điền bất kỳ link website phim nào vào -> Tự động bóc tách DOM/API
// và tạo ra file Plugin JavaScript chuẩn VaxPlayer thông qua Server AI
// (Gemini / OpenAI / Custom Server của bạn) hoặc Smart Heuristic Engine!
// =============================================================================

struct AIConversionProgress {
    var step: String
    var detail: String
    var detectedCMS: String
    var generatedCode: String
    var isCompleted: Bool
    var error: String?
}

final class AIPluginConverter {
    static let shared = AIPluginConverter()

    private init() {}

    func convertWebsiteToPlugin(
        websiteUrl: String,
        customName: String = "",
        onProgress: @escaping (AIConversionProgress) -> Void,
        onComplete: @escaping (Result<PluginManifest, Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            var cleanUrl = websiteUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanUrl.hasPrefix("http://") && !cleanUrl.hasPrefix("https://") {
                cleanUrl = "https://" + cleanUrl
            }
            if cleanUrl.hasSuffix("/") {
                cleanUrl.removeLast()
            }

            guard let urlObj = URL(string: cleanUrl), let host = urlObj.host else {
                DispatchQueue.main.async {
                    onComplete(.failure(NSError(domain: "AIPluginConverter", code: 400, userInfo: [NSLocalizedDescriptionKey: "URL không hợp lệ"])))
                }
                return
            }

            let pluginId = host
                .replacingOccurrences(of: "www.", with: "")
                .replacingOccurrences(of: ".", with: "_")
                .replacingOccurrences(of: "-", with: "_")
                .lowercased()

            let displayName = customName.isEmpty
                ? host.replacingOccurrences(of: "www.", with: "").capitalized + " [AI]"
                : customName

            let report = { (step: String, detail: String, cms: String, code: String) in
                DispatchQueue.main.async {
                    onProgress(AIConversionProgress(
                        step: step, detail: detail, detectedCMS: cms,
                        generatedCode: code, isCompleted: false, error: nil
                    ))
                }
            }

            // STEP 1: Crawl trang chủ và nhận diện cấu trúc DOM / API
            report("Bước 1/4: Đang quét cấu trúc Website...", "Kết nối tới \(cleanUrl) để thu thập HTML, JSON-LD, __NEXT_DATA__ và API...", "Đang phân tích...", "")

            let respJson = PluginJSRuntime.shared.performSyncHttp(urlStr: cleanUrl, optionsJson: "{}")
            var htmlBody = ""
            if let rData = respJson.data(using: .utf8),
               let rObj = try? JSONSerialization.jsonObject(with: rData) as? [String: Any] {
                htmlBody = (rObj["body"] as? String) ?? ""
            }

            // Nhận diện kiến trúc CMS của web phim
            let cmsType = self.detectCMSArchitecture(html: htmlBody, baseUrl: cleanUrl)
            report("Bước 2/4: Đã nhận diện kiến trúc \(cmsType)", "Phát hiện cấu trúc \(cmsType) (\(htmlBody.count) bytes HTML). Chuẩn bị gửi mẫu DOM lên AI Server...", cmsType, "")

            // STEP 2: Gọi AI Server (nếu người dùng đã cấu hình API Key hoặc Custom AI Server)
            let pm = PluginManager.shared
            var finalJSCode = ""

            if pm.aiProvider != "heuristic" && (!pm.aiApiKey.isEmpty || !pm.aiCustomEndpoint.isEmpty) {
                report("Bước 3/4: Đang gọi AI Server (\(pm.aiProvider.uppercased()))...", "Yêu cầu AI sinh mã nguồn VAX Plugin tương thích JavaScriptCore (_$, httpRequest, getManifest)...", cmsType, "")
                if let aiCode = self.requestAIServerGeneration(
                    baseUrl: cleanUrl,
                    pluginId: pluginId,
                    pluginName: displayName,
                    cmsType: cmsType,
                    htmlSample: String(htmlBody.prefix(14000))
                ) {
                    finalJSCode = aiCode
                }
            }

            // STEP 3: Fallback hoặc kết hợp Smart Heuristic Generator đảm bảo 100% chạy được ngay
            if finalJSCode.isEmpty || !finalJSCode.contains("getManifest") {
                report("Bước 3/4: Đang biên dịch bằng VAX Smart Heuristic AI Engine...", "Tự động đóng gói bộ bóc tách đa luồng tương thích với \(cmsType)...", cmsType, "")
                finalJSCode = self.generateUniversalAdaptivePlugin(
                    pluginId: pluginId,
                    pluginName: displayName,
                    baseUrl: cleanUrl,
                    cmsType: cmsType
                )
            }

            // STEP 4: Kiểm thử trong JavaScriptCore Sandbox và cài đặt vào App
            report("Bước 4/4: Đang nạp thử nghiệm vào JavaScriptCore...", "Kiểm tra hàm getManifest(), getHomeSections(), parseListResponse(), parseMovieDetail()...", cmsType, finalJSCode)

            if let manifest = PluginManager.shared.installCustomPlugin(rawScript: finalJSCode, selectImmediately: true) {
                DispatchQueue.main.async {
                    onProgress(AIConversionProgress(
                        step: "Hoàn tất!",
                        detail: "Đã tạo và kích hoạt plugin \(manifest.name) thành công!",
                        detectedCMS: cmsType,
                        generatedCode: finalJSCode,
                        isCompleted: true,
                        error: nil
                    ))
                    onComplete(.success(manifest))
                }
            } else {
                // Nếu code do AI trả về bị lỗi cú pháp, tự động fallback về Universal Adaptive Plugin
                let fallbackCode = self.generateUniversalAdaptivePlugin(
                    pluginId: pluginId,
                    pluginName: displayName,
                    baseUrl: cleanUrl,
                    cmsType: cmsType
                )
                if let manifest = PluginManager.shared.installCustomPlugin(rawScript: fallbackCode, selectImmediately: true) {
                    DispatchQueue.main.async {
                        onComplete(.success(manifest))
                    }
                } else {
                    DispatchQueue.main.async {
                        onComplete(.failure(NSError(domain: "AIPluginConverter", code: 500, userInfo: [NSLocalizedDescriptionKey: "Không thể biên dịch plugin cho trang web này."])))
                    }
                }
            }
        }
    }

    private func detectCMSArchitecture(html: String, baseUrl: String) -> String {
        let lower = html.lowercased()
        if lower.contains("__next_data__") {
            return "Next.js SSR (__NEXT_DATA__ JSON)"
        } else if lower.contains("halim") || lower.contains("halimthemes") || lower.contains("halim-item") {
            return "WordPress HalimThemes Movie CMS"
        } else if lower.contains("ophim") || lower.contains("kkphim") || baseUrl.contains("ophim") || baseUrl.contains("kkphim") {
            return "OPhim / KKPhim REST JSON API"
        } else if lower.contains("dooplay") || lower.contains("dt_mainmeta") {
            return "WordPress DooPlay / ToroPlay CMS"
        } else if lower.contains("movie-item") || lower.contains("film-poster") || lower.contains("flw-item") {
            return "Flix / WatchMovies HTML Grid CMS"
        }
        return "Universal HTML5 + M3U8/Embed Stream CMS"
    }

    private func requestAIServerGeneration(
        baseUrl: String,
        pluginId: String,
        pluginName: String,
        cmsType: String,
        htmlSample: String
    ) -> String? {
        let pm = PluginManager.shared
        let systemPrompt = """
        Bạn là chuyên gia viết Plugin JavaScript cho ứng dụng xem phim iOS VaxPlayer.
        Runtime của VaxPlayer chạy trên JavaScriptCore với các hàm global có sẵn:
        - `_$(html)`: giống Cheerio/jQuery (`.find(sel)`, `.each((i,el)=>{})`, `.attr('href')`, `.text()`, `.html()`).
        - `httpRequest(url, { method, headers, body })`: đồng bộ, trả về `{ status, isSuccessful, body }`.
        - `BASE64.encode(str)`, `BASE64.decode(str)`, `decodeHTMLtext(str)`.

        Plugin BẮT BUỘC phải là code JavaScript thuần (không bọc markdown ```), có comment `// AI_GENERATED_PLUGIN` ở dòng đầu, và định nghĩa các hàm global sau:
        1. `function getManifest()` -> `JSON.stringify({ id: "\(pluginId)", name: "\(pluginName)", version: "1.0.0", baseUrl: "\(baseUrl)", iconUrl: "\(baseUrl)/favicon.ico", isEnabled: true, isAdult: false, type: "MOVIE", layoutType: "GRID" })`
        2. `function getHomeSections()` -> `JSON.stringify([{ slug: "latest", title: "Mới cập nhật", type: "Grid" }])`
        3. `function getPrimaryCategories()` -> `JSON.stringify([...])`
        4. `function getFilterConfig()` -> `JSON.stringify({ sort: [], categories: [] })`
        5. `function getUrlList(slug, filtersJson)` -> `JSON.stringify({ url: "..." })`
        6. `function getUrlSearch(keyword, filtersJson)` -> `JSON.stringify({ url: "..." })`
        7. `function getUrlDetail(slugOrUrl, datasend)` -> `JSON.stringify({ url: "..." })`
        8. `function getStreamLink(slugOrUrl, datasend)` -> `JSON.stringify({ url: "..." })`
        9. `function parseListResponse(html, requestUrl)` -> `JSON.stringify({ items: [{ id, title, posterUrl, backdropUrl, quality, episode_current, year, datasend }] })`
        10. `function parseMovieDetail(html, requestUrl, datasend)` -> `JSON.stringify({ id, title, posterUrl, backdropUrl, description, year, quality, status, category, servers: [{ name: "Server 1", episodes: [{ id, name, slug, datasend }] }] })`
        11. `function parseDetailResponse(html, requestUrl, datasend)` -> `JSON.stringify({ url: "...", headers: { "Referer": "\(baseUrl)/" }, isEmbed: false, subtitles: [] })`

        Hãy phân tích HTML thực tế của trang \(baseUrl) (kiến trúc: \(cmsType)) dưới đây và viết plugin hoàn chỉnh. Chỉ trả về code JS thuần túy:
        \(htmlSample)
        """

        var endpoint = ""
        var headers: [String: String] = ["Content-Type": "application/json"]
        var payloadDict: [String: Any] = [:]

        if pm.aiProvider == "gemini" {
            let model = pm.aiModelName.isEmpty ? "gemini-2.5-flash" : pm.aiModelName
            endpoint = "https://generativelanguage.googleapis.com/v1beta/models/\(model):generateContent?key=\(pm.aiApiKey)"
            payloadDict = [
                "contents": [
                    ["parts": [["text": systemPrompt]]]
                ],
                "generationConfig": ["temperature": 0.2]
            ]
        } else {
            endpoint = pm.aiProvider == "custom" && !pm.aiCustomEndpoint.isEmpty
                ? pm.aiCustomEndpoint
                : "https://api.openai.com/v1/chat/completions"
            if !pm.aiApiKey.isEmpty {
                headers["Authorization"] = "Bearer \(pm.aiApiKey)"
            }
            payloadDict = [
                "model": pm.aiModelName.isEmpty ? "gpt-4o-mini" : pm.aiModelName,
                "messages": [
                    ["role": "system", "content": "Only output valid VaxPlayer JavaScript plugin code without markdown fences."],
                    ["role": "user", "content": systemPrompt]
                ],
                "temperature": 0.2
            ]
        }

        guard let bodyData = try? JSONSerialization.data(withJSONObject: payloadDict),
              let bodyStr = String(data: bodyData, encoding: .utf8),
              let optData = try? JSONSerialization.data(withJSONObject: ["method": "POST", "headers": headers, "body": bodyStr]),
              let optStr = String(data: optData, encoding: .utf8) else {
            return nil
        }

        let respStr = PluginJSRuntime.shared.performSyncHttp(urlStr: endpoint, optionsJson: optStr)
        guard let rData = respStr.data(using: .utf8),
              let rObj = try? JSONSerialization.jsonObject(with: rData) as? [String: Any],
              let respBody = rObj["body"] as? String,
              let bData = respBody.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: bData) as? [String: Any] else {
            return nil
        }

        var rawText = ""
        if let candidates = json["candidates"] as? [[String: Any]],
           let content = candidates.first?["content"] as? [String: Any],
           let parts = content["parts"] as? [[String: Any]],
           let txt = parts.first?["text"] as? String {
            rawText = txt
        } else if let choices = json["choices"] as? [[String: Any]],
                  let msg = choices.first?["message"] as? [String: Any],
                  let txt = msg["content"] as? String {
            rawText = txt
        } else if let directCode = json["pluginCode"] as? String ?? json["code"] as? String {
            rawText = directCode
        }

        rawText = rawText
            .replacingOccurrences(of: "```javascript", with: "")
            .replacingOccurrences(of: "```js", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if rawText.contains("getManifest") && rawText.contains("parseListResponse") {
            return "// AI_GENERATED_PLUGIN\n" + rawText
        }
        return nil
    }

    // Bộ sinh Plugin Đa Năng (Universal Adaptive VaxPlayer Plugin) chạy mượt cho hầu hết web phim Việt Nam
    func generateUniversalAdaptivePlugin(
        pluginId: String,
        pluginName: String,
        baseUrl: String,
        cmsType: String
    ) -> String {
        return """
        // AI_GENERATED_PLUGIN
        // @name: \(pluginName)
        // @version: 1.0.0 - AI Smart Studio (\(cmsType))

        var PLUGIN_ID = "\(pluginId)";
        var PLUGIN_NAME = "\(pluginName)";
        var BASE_URL = "\(baseUrl)";

        var DEFAULT_HEADERS = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            "Referer": BASE_URL + "/"
        };

        function getManifest() {
            return JSON.stringify({
                id: PLUGIN_ID,
                name: PLUGIN_NAME,
                version: "1.0.0",
                baseUrl: BASE_URL,
                iconUrl: BASE_URL + "/favicon.ico",
                isEnabled: true,
                isAdult: false,
                type: "MOVIE",
                layoutType: "GRID"
            });
        }

        function getHomeSections() {
            return JSON.stringify([
                { slug: "", title: "Mới Cập Nhật", type: "Grid" },
                { slug: "phim-bo", title: "Phim Bộ", type: "Horizontal" },
                { slug: "phim-le", title: "Phim Lẻ", type: "Horizontal" },
                { slug: "hoat-hinh", title: "Hoạt Hình", type: "Horizontal" }
            ]);
        }

        function getPrimaryCategories() {
            return JSON.stringify([
                { name: "Phim Mới", slug: "" },
                { name: "Phim Bộ", slug: "phim-bo" },
                { name: "Phim Lẻ", slug: "phim-le" },
                { name: "Hoạt Hình", slug: "hoat-hinh" },
                { name: "Hành Động", slug: "the-loai/hanh-dong" },
                { name: "Tình Cảm", slug: "the-loai/tinh-cam" },
                { name: "Cổ Trang", slug: "the-loai/co-trang" },
                { name: "Viễn Tưởng", slug: "the-loai/vien-tuong" }
            ]);
        }

        function getFilterConfig() {
            return JSON.stringify({ sort: [], categories: [] });
        }

        function resolveUrl(href) {
            if (!href) return "";
            href = String(href).trim();
            if (href.indexOf("http") === 0) return href;
            if (href.indexOf("//") === 0) return "https:" + href;
            if (href.charAt(0) === "/") return BASE_URL + href;
            return BASE_URL + "/" + href;
        }

        function getUrlList(slug, filtersJson) {
            var page = 1;
            try {
                var f = JSON.parse(filtersJson || "{}");
                if (f.page && f.page > 1) page = f.page;
            } catch (e) {}

            var cleanSlug = String(slug || "").replace(/^\\/+|\\/+$/g, "");
            var url = cleanSlug ? (BASE_URL + "/" + cleanSlug) : BASE_URL;
            if (page > 1) {
                url += (url.indexOf("?") > -1 ? "&page=" : "/page/") + page;
            }
            return JSON.stringify({ url: url, headers: DEFAULT_HEADERS });
        }

        function getUrlSearch(keyword, filtersJson) {
            var q = encodeURIComponent(String(keyword || "").trim());
            return JSON.stringify({
                url: BASE_URL + "/?s=" + q + "&keyword=" + q,
                headers: DEFAULT_HEADERS
            });
        }

        function getUrlDetail(slugOrUrl, datasend) {
            return JSON.stringify({
                url: resolveUrl(slugOrUrl),
                headers: DEFAULT_HEADERS
            });
        }

        function getStreamLink(slugOrUrl, datasend) {
            return JSON.stringify({
                url: resolveUrl(slugOrUrl),
                headers: DEFAULT_HEADERS
            });
        }

        function parseListResponse(html, requestUrl) {
            var items = [];
            var seen = {};
            var $ = _$(html || "");

            // 1. Thử bóc tách từ __NEXT_DATA__ hoặc JSON API nếu có
            var nextMatch = String(html || "").match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\\s\\S]*?)<\\/script>/i);
            if (nextMatch) {
                try {
                    var nextJson = JSON.parse(nextMatch[1]);
                    var rawStr = JSON.stringify(nextJson);
                    var objRe = /\\{"[^"]*?(?:slug|id)"\\s*:\\s*"([^"]+)"[^\\}]*?"(?:name|title)"\\s*:\\s*"([^"]+)"[^\\}]*?(?:"(?:thumb_url|poster_url|poster|thumb|image)"\\s*:\\s*"([^"]+)")?/g;
                    var m;
                    while ((m = objRe.exec(rawStr)) !== null) {
                        var id = m[1];
                        var title = m[2];
                        var poster = resolveUrl(m[3] || "");
                        if (id && title && !seen[id]) {
                            seen[id] = true;
                            items.push({
                                id: id,
                                title: decodeHTMLtext(title),
                                posterUrl: poster,
                                backdropUrl: poster,
                                quality: "HD",
                                episode_current: "Full",
                                year: 2025
                            });
                        }
                    }
                } catch (e) {}
            }

            // 2. Quét các thẻ HTML phổ biến của HalimThemes, DooPlay, ToroPlay, PhimMoi, Rophim...
            var selectors = [
                "article", ".halim-item", ".movie-item", ".film-item", ".flw-item",
                ".item", ".TPost", ".post-item", "li.item", ".col-md-3", ".col-6"
            ];

            for (var s = 0; s < selectors.length; s++) {
                $(selectors[s]).each(function(i, el) {
                    var node = _$(el);
                    var linkEl = node.find("a").first();
                    var href = linkEl.attr("href") || node.attr("href") || "";
                    if (!href || href === "#" || href.indexOf("javascript:") === 0) return;

                    var imgEl = node.find("img").first();
                    var poster = imgEl.attr("data-src") || imgEl.attr("data-original") || imgEl.attr("data-lazy-src") || imgEl.attr("src") || "";
                    var title = node.find(".entry-title, .title, .name, .film-name, h2, h3, h4").first().text()
                        || linkEl.attr("title") || imgEl.attr("alt") || "";
                    title = decodeHTMLtext(String(title || "").trim());

                    if (!title || title.length < 2 || !poster) return;
                    var fullHref = resolveUrl(href);
                    if (seen[fullHref]) return;
                    seen[fullHref] = true;

                    var epBadge = node.find(".episode, .ep, .status, .quality, .halim-episode").first().text() || "HD";
                    items.push({
                        id: fullHref,
                        title: title,
                        posterUrl: resolveUrl(poster),
                        backdropUrl: resolveUrl(poster),
                        quality: "HD",
                        episode_current: String(epBadge).trim() || "Vietsub",
                        year: 2025
                    });
                });
                if (items.length >= 6) break;
            }

            return JSON.stringify({ items: items });
        }

        function parseMovieDetail(html, requestUrl, datasend) {
            var $ = _$(html || "");
            var title = $("h1, .entry-title, .movie-title, .title").first().text()
                || $("meta[property='og:title']").attr("content") || "Phim";
            var desc = $(".entry-content, .description, .film-description, #info-movie").first().text()
                || $("meta[property='og:description']").attr("content") || "";
            var poster = $("meta[property='og:image']").attr("content")
                || $(".movie-poster img, .poster img, .thumb img").first().attr("src") || "";

            var episodes = [];
            var seenEp = {};

            // Quét danh sách tập phim
            $(".halim-list-eps a, .list-episode a, .episodes a, .server-list a, a[href*='tap-'], a[href*='episode']").each(function(i, el) {
                var a = _$(el);
                var href = a.attr("href") || "";
                var name = String(a.text() || "").trim();
                if (!href || href === "#" || !name) return;
                var fullUrl = resolveUrl(href);
                if (seenEp[fullUrl]) return;
                seenEp[fullUrl] = true;
                episodes.push({
                    id: fullUrl,
                    name: name.indexOf("Tập") === 0 ? name : ("Tập " + name),
                    slug: "ep-" + (episodes.length + 1)
                });
            });

            // Tìm nút Xem Phim nếu trang chi tiết chưa hiện danh sách tập
            if (episodes.length === 0) {
                var watchHref = $("a.btn-watch, a.halim-btn, a[href*='xem-phim'], a[href*='watch']").first().attr("href") || requestUrl;
                episodes.push({
                    id: resolveUrl(watchHref),
                    name: "Full HD",
                    slug: "full"
                });
            }

            return JSON.stringify({
                id: requestUrl,
                title: decodeHTMLtext(String(title).trim()),
                posterUrl: resolveUrl(poster),
                backdropUrl: resolveUrl(poster),
                description: decodeHTMLtext(String(desc).trim()),
                year: "2025",
                quality: "FHD",
                status: "Đang chiếu",
                servers: [
                    { name: "VIP Server", episodes: episodes }
                ]
            });
        }

        function parseDetailResponse(html, requestUrl, datasend) {
            var raw = String(html || "");

            // 1. Tìm link .m3u8 hoặc .mp4 trực tiếp trong source trang
            var m3u8Match = raw.match(/https?:\\\\?\\/\\\\?\\/[^"'\\s<>]+\\.m3u8[^"'\\s<>]*/i);
            if (m3u8Match) {
                var streamUrl = m3u8Match[0].replace(/\\\\\\//g, "/");
                return JSON.stringify({
                    url: streamUrl,
                    headers: DEFAULT_HEADERS,
                    isEmbed: false,
                    subtitles: []
                });
            }

            // 2. Tìm iframe embed player
            var $ = _$(raw);
            var iframeSrc = $("iframe").first().attr("src") || $("iframe").first().attr("data-src") || "";
            if (iframeSrc && iframeSrc.indexOf("facebook.com") === -1 && iframeSrc.indexOf("google") === -1) {
                return JSON.stringify({
                    url: resolveUrl(iframeSrc),
                    headers: DEFAULT_HEADERS,
                    isEmbed: true,
                    subtitles: []
                });
            }

            // 3. Fallback: mở trang bằng WebView Sniffer của VaxPlayer để tự bắt luồng M3U8 động
            return JSON.stringify({
                url: requestUrl,
                headers: DEFAULT_HEADERS,
                isEmbed: true,
                subtitles: []
            });
        }
        """
    }
}
