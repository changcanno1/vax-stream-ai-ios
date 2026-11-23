import Foundation
import SwiftUI
import Combine

// MARK: - Additional Persistence Models
struct WatchHistoryItem: Identifiable, Codable, Equatable {
    var id: String { "\(pluginId)_\(movieId)" }
    var pluginId: String
    var pluginName: String
    var movieId: String
    var title: String
    var posterUrl: String
    var backdropUrl: String
    var episodeName: String
    var episodeId: String
    var positionSeconds: Double
    var durationSeconds: Double
    var datasend: String
    var updatedAt: Date
}

struct FavoriteMovieItem: Identifiable, Codable, Equatable {
    var id: String { "\(pluginId)_\(movieId)" }
    var pluginId: String
    var pluginName: String
    var movieId: String
    var title: String
    var posterUrl: String
    var backdropUrl: String
    var year: String
    var quality: String
    var datasend: String
    var addedAt: Date
}

struct HomeShelfData: Identifiable, Equatable {
    var id: String { section.id }
    var section: JSHomeSection
    var movies: [JSMovieItem]
}

// =============================================================================
// 4. NATIVE PLUGIN MANAGER (PluginManager.swift)
// =============================================================================
final class PluginManager: ObservableObject {
    static let shared = PluginManager()

    @Published var plugins: [PluginManifest] = []
    @Published var activePlugin: PluginManifest?
    @Published var favoritePluginIds: Set<String> = []
    @Published var customDomains: [String: String] = [:]
    @Published var repoUrls: [String] = [
        "https://raw.githubusercontent.com/williampro01/vax-plugins/main/manifest.json"
    ]
    @Published var dnsProvider: String = "Hệ thống (Mặc định)"
    @Published var allow18Plus: Bool = true
    @Published var defaultPlayer: String = "Tự động"

    // AI Settings
    @Published var autoTranslateSubtitles: Bool = true
    @Published var autoTranslateMovieInfo: Bool = false
    @Published var enableVaxTTS: Bool = false
    @Published var ttsRate: Float = 0.52

    // AI Server Config (Website URL -> Plugin JS Converter)
    @Published var aiProvider: String = "gemini" // gemini, openai, custom, heuristic
    @Published var aiApiKey: String = ""
    @Published var aiModelName: String = "gemini-2.5-flash"
    @Published var aiCustomEndpoint: String = ""

    // Home Screen State
    @Published var isLoadingHome: Bool = false
    @Published var homeError: String? = nil
    @Published var heroMovie: JSMovieItem? = nil
    @Published var homeShelves: [HomeShelfData] = []
    @Published var genreList: [JSCategoryTag] = []

    // History & Favorites
    @Published var watchHistory: [WatchHistoryItem] = []
    @Published var favoriteMovies: [FavoriteMovieItem] = []

    private var rawScripts: [String: String] = [:]
    private let defaults = UserDefaults.standard
    private let workerQueue = DispatchQueue(label: "com.vaxplayer.pluginmanager", qos: .userInitiated, attributes: .concurrent)

    private init() {
        loadSavedSettings()
        bootstrapAllPlugins()
    }

    // MARK: - Persistence
    private func loadSavedSettings() {
        if let favs = defaults.stringArray(forKey: "vax_favorite_plugin_ids") {
            favoritePluginIds = Set(favs)
        }
        if let domains = defaults.dictionary(forKey: "vax_custom_base_urls") as? [String: String] {
            customDomains = domains
        }
        if let repos = defaults.stringArray(forKey: "vax_repo_urls"), !repos.isEmpty {
            repoUrls = repos
        }
        dnsProvider = defaults.string(forKey: "vax_dns_provider") ?? "Hệ thống (Mặc định)"
        allow18Plus = defaults.object(forKey: "vax_allow_18_plus") as? Bool ?? true
        defaultPlayer = defaults.string(forKey: "vax_default_player") ?? "Tự động"
        autoTranslateSubtitles = defaults.object(forKey: "vax_auto_translate_sub") as? Bool ?? true
        enableVaxTTS = defaults.object(forKey: "vax_enable_tts") as? Bool ?? false

        aiProvider = defaults.string(forKey: "vax_ai_provider") ?? "gemini"
        aiApiKey = defaults.string(forKey: "vax_ai_api_key") ?? ""
        aiModelName = defaults.string(forKey: "vax_ai_model") ?? "gemini-2.5-flash"
        aiCustomEndpoint = defaults.string(forKey: "vax_ai_custom_endpoint") ?? ""

        if let histData = defaults.data(forKey: "vax_watch_history"),
           let decoded = try? JSONDecoder().decode([WatchHistoryItem].self, from: histData) {
            watchHistory = decoded
        }
        if let favData = defaults.data(forKey: "vax_favorite_movies"),
           let decoded = try? JSONDecoder().decode([FavoriteMovieItem].self, from: favData) {
            favoriteMovies = decoded
        }
    }

    func saveSettings() {
        defaults.set(Array(favoritePluginIds), forKey: "vax_favorite_plugin_ids")
        defaults.set(customDomains, forKey: "vax_custom_base_urls")
        defaults.set(repoUrls, forKey: "vax_repo_urls")
        defaults.set(dnsProvider, forKey: "vax_dns_provider")
        defaults.set(allow18Plus, forKey: "vax_allow_18_plus")
        defaults.set(defaultPlayer, forKey: "vax_default_player")
        defaults.set(autoTranslateSubtitles, forKey: "vax_auto_translate_sub")
        defaults.set(enableVaxTTS, forKey: "vax_enable_tts")
        defaults.set(aiProvider, forKey: "vax_ai_provider")
        defaults.set(aiApiKey, forKey: "vax_ai_api_key")
        defaults.set(aiModelName, forKey: "vax_ai_model")
        defaults.set(aiCustomEndpoint, forKey: "vax_ai_custom_endpoint")
    }

    func toggleFavoritePlugin(_ id: String) {
        if favoritePluginIds.contains(id) {
            favoritePluginIds.remove(id)
        } else {
            favoritePluginIds.insert(id)
        }
        saveSettings()
    }

    func updateCustomDomain(pluginId: String, newDomain: String) {
        let trimmed = newDomain.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if trimmed.isEmpty {
            customDomains.removeValue(forKey: pluginId)
        } else {
            customDomains[pluginId] = trimmed
        }
        saveSettings()
        if let raw = rawScripts[pluginId] {
            _ = loadSinglePlugin(fallbackId: pluginId, rawScript: raw)
        }
        if activePlugin?.id == pluginId {
            loadHomeForActivePlugin()
        }
    }

    // MARK: - Watch History & Favorite Movies
    func saveWatchProgress(movie: JSMovieItem, episode: JSEpisode, position: Double, duration: Double) {
        guard let plugin = activePlugin else { return }
        let item = WatchHistoryItem(
            pluginId: plugin.id,
            pluginName: plugin.name,
            movieId: movie.id,
            title: movie.title,
            posterUrl: movie.posterUrl,
            backdropUrl: movie.backdropUrl,
            episodeName: episode.name,
            episodeId: episode.id,
            positionSeconds: position,
            durationSeconds: max(duration, 1),
            datasend: movie.datasend,
            updatedAt: Date()
        )
        DispatchQueue.main.async {
            self.watchHistory.removeAll(where: { $0.id == item.id })
            self.watchHistory.insert(item, at: 0)
            if self.watchHistory.count > 100 { self.watchHistory.removeLast() }
            if let data = try? JSONEncoder().encode(self.watchHistory) {
                self.defaults.set(data, forKey: "vax_watch_history")
            }
        }
    }

    func clearWatchHistory() {
        watchHistory.removeAll()
        defaults.removeObject(forKey: "vax_watch_history")
    }

    func isMovieFavorite(_ movie: JSMovieItem) -> Bool {
        let pid = movie.pluginId.isEmpty ? (activePlugin?.id ?? "") : movie.pluginId
        return favoriteMovies.contains(where: { $0.movieId == movie.id && $0.pluginId == pid })
    }

    func toggleFavoriteMovie(_ movie: JSMovieItem) {
        let pid = movie.pluginId.isEmpty ? (activePlugin?.id ?? "") : movie.pluginId
        let pName = plugins.first(where: { $0.id == pid })?.name ?? "VAX"
        if let idx = favoriteMovies.firstIndex(where: { $0.movieId == movie.id && $0.pluginId == pid }) {
            favoriteMovies.remove(at: idx)
        } else {
            let fav = FavoriteMovieItem(
                pluginId: pid,
                pluginName: pName,
                movieId: movie.id,
                title: movie.title,
                posterUrl: movie.posterUrl,
                backdropUrl: movie.backdropUrl,
                year: movie.year,
                quality: movie.quality,
                datasend: movie.datasend,
                addedAt: Date()
            )
            favoriteMovies.insert(fav, at: 0)
        }
        if let data = try? JSONEncoder().encode(favoriteMovies) {
            defaults.set(data, forKey: "vax_favorite_movies")
        }
    }

    // MARK: - Load Builtin + Custom Plugins into JavaScriptCore
    func bootstrapAllPlugins() {
        workerQueue.async {
            var loaded: [PluginManifest] = []

            // 1. Extract from bundled plugins-bundle-1.js & plugins-bundle-2.js
            let bundleNames = ["plugins-bundle-1", "plugins-bundle-2"]
            for bName in bundleNames {
                if let url = Bundle.main.url(forResource: bName, withExtension: "js", subdirectory: "www/js")
                    ?? Bundle.main.url(forResource: bName, withExtension: "js"),
                   let content = try? String(contentsOf: url, encoding: .utf8) {
                    let extracted = self.extractPluginsFromBundleJS(content)
                    for (idx, raw) in extracted.enumerated() {
                        if let manifest = self.loadSinglePlugin(fallbackId: "\(bName)_\(idx)", rawScript: raw) {
                            if !loaded.contains(where: { $0.id == manifest.id }) {
                                loaded.append(manifest)
                            }
                        }
                    }
                }
            }

            // 2. Load user/AI-installed plugins from UserDefaults
            if let savedCustom = self.defaults.dictionary(forKey: "vax_installed_custom_plugins") as? [String: String] {
                for (pid, raw) in savedCustom {
                    if var manifest = self.loadSinglePlugin(fallbackId: pid, rawScript: raw) {
                        manifest.isAiGenerated = raw.contains("AI_GENERATED_PLUGIN") || raw.contains("AI Studio")
                        if let existIdx = loaded.firstIndex(where: { $0.id == manifest.id }) {
                            loaded[existIdx] = manifest
                        } else {
                            loaded.insert(manifest, at: 0)
                        }
                    }
                }
            }

            let savedActiveId = self.defaults.string(forKey: "vax_active_plugin_id") ?? "dexter"
            let initialPlugin = loaded.first(where: { $0.id == savedActiveId })
                ?? loaded.first(where: { $0.id == "dexter" })
                ?? loaded.first(where: { $0.id == "saigonphim" })
                ?? loaded.first

            DispatchQueue.main.async {
                self.plugins = loaded
                if let initP = initialPlugin {
                    self.selectPlugin(initP)
                }
            }
        }
    }

    private func extractPluginsFromBundleJS(_ content: String) -> [String] {
        // Parse backtick template strings inside window.BUILTIN_PLUGINS_PART1 / PART2
        var scripts: [String] = []
        var current = ""
        var inBacktick = false
        var prevChar: Character = "\0"

        for ch in content {
            if ch == "`" && prevChar != "\\" {
                if inBacktick {
                    if current.contains("getManifest") {
                        let unescaped = current
                            .replacingOccurrences(of: "\\`", with: "`")
                            .replacingOccurrences(of: "\\${", with: "${")
                            .replacingOccurrences(of: "\\\\", with: "\\")
                        scripts.append(unescaped)
                    }
                    current = ""
                    inBacktick = false
                } else {
                    inBacktick = true
                    current = ""
                }
            } else if inBacktick {
                current.append(ch)
            }
            prevChar = ch
        }
        return scripts
    }

    func loadSinglePlugin(fallbackId: String, rawScript: String) -> PluginManifest? {
        // Apply custom domain override if user configured one
        var processedScript = rawScript
        // Pre-load once to discover id
        guard var manifest = PluginJSRuntime.shared.loadPlugin(pluginId: fallbackId, script: processedScript) else {
            return nil
        }
        if let customDomain = customDomains[manifest.id], !customDomain.isEmpty, !manifest.baseUrl.isEmpty {
            processedScript = rawScript.replacingOccurrences(of: manifest.baseUrl, with: customDomain)
            manifest.baseUrl = customDomain
        }
        // Re-register under canonical manifest.id
        if let finalManifest = PluginJSRuntime.shared.loadPlugin(pluginId: manifest.id, script: processedScript) {
            manifest = finalManifest
        }
        manifest.isAiGenerated = rawScript.contains("AI_GENERATED_PLUGIN")
        rawScripts[manifest.id] = rawScript
        return manifest
    }

    func installCustomPlugin(rawScript: String, selectImmediately: Bool = true) -> PluginManifest? {
        let tempId = "custom_\(Int(Date().timeIntervalSince1970))"
        guard var manifest = loadSinglePlugin(fallbackId: tempId, rawScript: rawScript) else {
            return nil
        }
        manifest.isAiGenerated = rawScript.contains("AI_GENERATED_PLUGIN")

        var saved = (defaults.dictionary(forKey: "vax_installed_custom_plugins") as? [String: String]) ?? [:]
        saved[manifest.id] = rawScript
        defaults.set(saved, forKey: "vax_installed_custom_plugins")

        DispatchQueue.main.async {
            if let idx = self.plugins.firstIndex(where: { $0.id == manifest.id }) {
                self.plugins[idx] = manifest
            } else {
                self.plugins.insert(manifest, at: 0)
            }
            if selectImmediately {
                self.selectPlugin(manifest)
            }
        }
        return manifest
    }

    func removePlugin(_ pluginId: String) {
        var saved = (defaults.dictionary(forKey: "vax_installed_custom_plugins") as? [String: String]) ?? [:]
        saved.removeValue(forKey: pluginId)
        defaults.set(saved, forKey: "vax_installed_custom_plugins")
        plugins.removeAll(where: { $0.id == pluginId })
        if activePlugin?.id == pluginId, let first = plugins.first {
            selectPlugin(first)
        }
    }

    func getRawScript(for pluginId: String) -> String {
        return rawScripts[pluginId] ?? ""
    }

    func selectPlugin(_ plugin: PluginManifest) {
        activePlugin = plugin
        defaults.set(plugin.id, forKey: "vax_active_plugin_id")
        loadHomeForActivePlugin()
    }

    // =========================================================================
    // 5. CORE VAX PLAYER PLUGIN LIFECYCLE (100% NATIVE BACKGROUND EXECUTION)
    // =========================================================================

    private func unpackUrlAndOptions(_ rawJsonOrUrl: String) -> (url: String, optionsJson: String) {
        let trimmed = rawJsonOrUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("{"),
           let data = trimmed.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let u = obj["url"] as? String {
            return (u, trimmed)
        }
        // Unquote if JS returned a JSON-encoded string like "\"https://...\""
        if trimmed.hasPrefix("\"") && trimmed.hasSuffix("\"") {
            let unquoted = String(trimmed.dropFirst().dropLast())
            return (unquoted, "{}")
        }
        return (trimmed, "{}")
    }

    func loadHomeForActivePlugin() {
        guard let plugin = activePlugin else { return }
        let pid = plugin.id

        isLoadingHome = true
        homeError = nil

        workerQueue.async {
            // 1. Parse getHomeSections()
            var sections: [JSHomeSection] = []
            if let secJson = PluginJSRuntime.shared.callFunction(pluginId: pid, fnName: "getHomeSections"),
               let data = secJson.data(using: .utf8),
               let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                for item in arr {
                    let slug = "\(item["slug"] ?? "")"
                    let title = "\(item["title"] ?? "Danh mục")"
                    let type = "\(item["type"] ?? "Horizontal")"
                    if !slug.isEmpty {
                        sections.append(JSHomeSection(slug: slug, title: title, type: type))
                    }
                }
            }

            // 2. Parse getPrimaryCategories()
            var genres: [JSCategoryTag] = []
            if let catJson = PluginJSRuntime.shared.callFunction(pluginId: pid, fnName: "getPrimaryCategories"),
               let data = catJson.data(using: .utf8),
               let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                for item in arr {
                    let name = "\(item["name"] ?? item["title"] ?? "")"
                    let slug = "\(item["slug"] ?? "")"
                    if !name.isEmpty && !slug.isEmpty {
                        genres.append(JSCategoryTag(name: name, slug: slug))
                    }
                }
            }

            if sections.isEmpty, let firstGenre = genres.first {
                sections.append(JSHomeSection(slug: firstGenre.slug, title: firstGenre.name, type: "Grid"))
            }

            // 3. Fetch each section concurrently
            let group = DispatchGroup()
            let lock = NSLock()
            var shelfMap: [Int: HomeShelfData] = [:]

            for (idx, sec) in sections.prefix(6).enumerated() {
                group.enter()
                self.workerQueue.async {
                    let items = self.fetchListSync(pluginId: pid, slug: sec.slug, page: 1)
                    if !items.isEmpty {
                        lock.lock()
                        shelfMap[idx] = HomeShelfData(section: sec, movies: items)
                        lock.unlock()
                    }
                    group.leave()
                }
            }

            _ = group.wait(timeout: .now() + 22)

            var orderedShelves: [HomeShelfData] = []
            for i in 0..<min(sections.count, 6) {
                if let shelf = shelfMap[i] {
                    orderedShelves.append(shelf)
                }
            }

            let hero = orderedShelves.first?.movies.first

            DispatchQueue.main.async {
                guard self.activePlugin?.id == pid else { return }
                self.genreList = genres
                self.homeShelves = orderedShelves
                self.heroMovie = hero
                self.isLoadingHome = false
                if orderedShelves.isEmpty {
                    self.homeError = "Không tải được danh sách phim từ nguồn \(plugin.name). Hãy kiểm tra kết nối hoặc đổi Domain trong Cài đặt."
                }
            }
        }
    }

    // Synchronous list fetch (run on workerQueue)
    func fetchListSync(pluginId: String, slug: String, page: Int = 1, keyword: String = "", sort: String = "", category: String = "", country: String = "", year: String = "") -> [JSMovieItem] {
        let filterDict: [String: Any] = [
            "page": page,
            "keyword": keyword,
            "sort": sort,
            "category": category,
            "country": country,
            "year": year
        ]
        let filterData = (try? JSONSerialization.data(withJSONObject: filterDict)) ?? Data()
        let filterJson = String(data: filterData, encoding: .utf8) ?? "{\"page\":1}"

        let rawReq: String?
        if !keyword.isEmpty && PluginJSRuntime.shared.hasFunction(pluginId: pluginId, fnName: "getUrlSearch") {
            rawReq = PluginJSRuntime.shared.callFunction(pluginId: pluginId, fnName: "getUrlSearch", args: [keyword, filterJson])
        } else {
            rawReq = PluginJSRuntime.shared.callFunction(pluginId: pluginId, fnName: "getUrlList", args: [slug, filterJson])
        }

        guard let reqStr = rawReq, !reqStr.isEmpty else { return [] }
        let (targetUrl, optsJson) = unpackUrlAndOptions(reqStr)

        var httpBody = ""
        if !targetUrl.isEmpty && !targetUrl.hasPrefix("https://example.com") {
            let httpRespJson = PluginJSRuntime.shared.performSyncHttp(urlStr: targetUrl, optionsJson: optsJson)
            if let rData = httpRespJson.data(using: .utf8),
               let rObj = try? JSONSerialization.jsonObject(with: rData) as? [String: Any] {
                httpBody = (rObj["body"] as? String) ?? ""
            }
        }

        guard let parsedJson = PluginJSRuntime.shared.callFunction(
            pluginId: pluginId,
            fnName: "parseListResponse",
            args: [httpBody, targetUrl]
        ), let pData = parsedJson.data(using: .utf8) else {
            return []
        }

        let jsonObj = try? JSONSerialization.jsonObject(with: pData)
        var rawItems: [[String: Any]] = []
        if let arr = jsonObj as? [[String: Any]] {
            rawItems = arr
        } else if let dict = jsonObj as? [String: Any] {
            rawItems = (dict["items"] as? [[String: Any]])
                ?? (dict["movies"] as? [[String: Any]])
                ?? (dict["data"] as? [[String: Any]])
                ?? []
        }

        return rawItems.compactMap { JSMovieItem.parse(from: $0, pluginId: pluginId) }
    }

    func fetchCategoryOrSearch(slug: String, page: Int = 1, keyword: String = "", completion: @escaping ([JSMovieItem]) -> Void) {
        guard let pid = activePlugin?.id else {
            completion([])
            return
        }
        workerQueue.async {
            let items = self.fetchListSync(pluginId: pid, slug: slug, page: page, keyword: keyword)
            DispatchQueue.main.async {
                completion(items)
            }
        }
    }

    // Fetch Movie Detail (Supports 2-pass `detail.extra` like Danet & direct JSON return like Dexter)
    func fetchMovieDetail(movie: JSMovieItem, completion: @escaping (JSMovieDetail?) -> Void) {
        let pid = movie.pluginId.isEmpty ? (activePlugin?.id ?? "") : movie.pluginId
        guard !pid.isEmpty else {
            completion(nil)
            return
        }

        workerQueue.async {
            guard let rawReq = PluginJSRuntime.shared.callFunction(
                pluginId: pid,
                fnName: "getUrlDetail",
                args: [movie.id, movie.datasend]
            ), !rawReq.isEmpty else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            let trimmed = rawReq.trimmingCharacters(in: .whitespacesAndNewlines)

            // Case 1: getUrlDetail returned a direct detail JSON object (has "servers" or "title" without "url")
            if trimmed.hasPrefix("{"),
               let dData = trimmed.data(using: .utf8),
               let dObj = try? JSONSerialization.jsonObject(with: dData) as? [String: Any],
               dObj["url"] == nil && (dObj["servers"] != nil || dObj["title"] != nil) {
                let detail = JSMovieDetail.parse(from: dObj, fallbackItem: movie)
                DispatchQueue.main.async { completion(detail) }
                return
            }

            // Case 2: Standard flow -> HTTP fetch -> parseMovieDetail(body, url, datasend)
            let (targetUrl, optsJson) = self.unpackUrlAndOptions(trimmed)
            var httpBody = ""
            if !targetUrl.isEmpty && !targetUrl.hasPrefix("https://example.com") {
                let httpRespJson = PluginJSRuntime.shared.performSyncHttp(urlStr: targetUrl, optionsJson: optsJson)
                if let rData = httpRespJson.data(using: .utf8),
                   let rObj = try? JSONSerialization.jsonObject(with: rData) as? [String: Any] {
                    httpBody = (rObj["body"] as? String) ?? ""
                }
            }

            let parseFn = PluginJSRuntime.shared.hasFunction(pluginId: pid, fnName: "parseMovieDetail")
                ? "parseMovieDetail"
                : "parseDetailResponse"

            guard let parsedJson = PluginJSRuntime.shared.callFunction(
                pluginId: pid,
                fnName: parseFn,
                args: [httpBody, targetUrl, movie.datasend]
            ),
            let pData = parsedJson.data(using: .utf8),
            let pObj = try? JSONSerialization.jsonObject(with: pData) as? [String: Any] else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            var detail = JSMovieDetail.parse(from: pObj, fallbackItem: movie)

            // Case 3: 2-Pass Extra Fetch (Exact mechanism from VaxPlayer binary: if detail.extra is URL and servers empty)
            if detail.servers.isEmpty && !detail.extra.isEmpty {
                let (extraUrl, extraOpts) = self.unpackUrlAndOptions(detail.extra)
                if extraUrl.hasPrefix("http") {
                    let extraHttp = PluginJSRuntime.shared.performSyncHttp(urlStr: extraUrl, optionsJson: extraOpts)
                    if let eData = extraHttp.data(using: .utf8),
                       let eObj = try? JSONSerialization.jsonObject(with: eData) as? [String: Any],
                       let extraBody = eObj["body"] as? String,
                       let secondJson = PluginJSRuntime.shared.callFunction(
                           pluginId: pid,
                           fnName: parseFn,
                           args: [extraBody, extraUrl, movie.datasend]
                       ),
                       let sData = secondJson.data(using: .utf8),
                       let sObj = try? JSONSerialization.jsonObject(with: sData) as? [String: Any] {
                        detail = JSMovieDetail.parse(from: sObj, fallbackItem: movie)
                    }
                }
            }

            DispatchQueue.main.async {
                completion(detail)
            }
        }
    }

    // Resolve Stream Info (Supports getStreamLink, parseDetailResponse, 2-pass parseEmbedResponse, and direct m3u8Content)
    func resolveStream(movie: JSMovieItem, episode: JSEpisode, completion: @escaping (JSStreamInfo?) -> Void) {
        let pid = movie.pluginId.isEmpty ? (activePlugin?.id ?? "") : movie.pluginId
        guard !pid.isEmpty else {
            completion(nil)
            return
        }

        workerQueue.async {
            let epId = episode.id
            let epDatasend = episode.datasend.isEmpty ? movie.datasend : episode.datasend

            // Fast path: if epId is already a direct .m3u8 or .mp4 stream and plugin doesn't need custom signing
            let reqFn = PluginJSRuntime.shared.hasFunction(pluginId: pid, fnName: "getStreamLink")
                ? "getStreamLink"
                : "getUrlDetail"

            guard let rawReq = PluginJSRuntime.shared.callFunction(
                pluginId: pid,
                fnName: reqFn,
                args: [epId, epDatasend]
            ), !rawReq.isEmpty else {
                // Fallback direct URL
                if epId.hasPrefix("http") {
                    let isM3u8 = epId.contains(".m3u8") || epId.contains(".mp4")
                    let info = JSStreamInfo(
                        url: epId, m3u8Content: "", baseUrl: epId, mimeType: "",
                        isEmbed: !isM3u8, headers: [:], subtitles: [], skipTimes: [], datasend: ""
                    )
                    DispatchQueue.main.async { completion(info) }
                } else {
                    DispatchQueue.main.async { completion(nil) }
                }
                return
            }

            let trimmed = rawReq.trimmingCharacters(in: .whitespacesAndNewlines)

            // Check if getStreamLink returned a ready JSStreamInfo JSON directly (has m3u8Content or isEmbed)
            if trimmed.hasPrefix("{"),
               let dData = trimmed.data(using: .utf8),
               let dObj = try? JSONSerialization.jsonObject(with: dData) as? [String: Any],
               (dObj["m3u8Content"] != nil || dObj["isEmbed"] != nil || dObj["subtitles"] != nil),
               dObj["method"] == nil {
                let info = JSStreamInfo.parse(from: dObj)
                DispatchQueue.main.async { completion(info) }
                return
            }

            let (targetUrl, optsJson) = self.unpackUrlAndOptions(trimmed)
            var httpBody = ""
            if !targetUrl.isEmpty && !targetUrl.hasPrefix("https://example.com") {
                let httpResp = PluginJSRuntime.shared.performSyncHttp(urlStr: targetUrl, optionsJson: optsJson)
                if let rData = httpResp.data(using: .utf8),
                   let rObj = try? JSONSerialization.jsonObject(with: rData) as? [String: Any] {
                    httpBody = (rObj["body"] as? String) ?? ""
                }
            }

            guard let parsedJson = PluginJSRuntime.shared.callFunction(
                pluginId: pid,
                fnName: "parseDetailResponse",
                args: [httpBody, targetUrl, epDatasend]
            ),
            let pData = parsedJson.data(using: .utf8),
            let pObj = try? JSONSerialization.jsonObject(with: pData) as? [String: Any] else {
                if targetUrl.hasPrefix("http") {
                    let info = JSStreamInfo(
                        url: targetUrl, m3u8Content: "", baseUrl: targetUrl, mimeType: "",
                        isEmbed: !targetUrl.contains(".m3u8"), headers: [:], subtitles: [], skipTimes: [], datasend: ""
                    )
                    DispatchQueue.main.async { completion(info) }
                } else {
                    DispatchQueue.main.async { completion(nil) }
                }
                return
            }

            var streamInfo = JSStreamInfo.parse(from: pObj)

            // 2-Pass parseEmbedResponse (Exact mechanism from VaxPlayer binary when datasend == "1" or embed extraction needed)
            if (streamInfo.datasend == "1" || (!streamInfo.url.isEmpty && streamInfo.isEmbed))
                && PluginJSRuntime.shared.hasFunction(pluginId: pid, fnName: "parseEmbedResponse") {
                var embedHeadersJson = "{}"
                if !streamInfo.headers.isEmpty,
                   let hData = try? JSONSerialization.data(withJSONObject: ["headers": streamInfo.headers]),
                   let hStr = String(data: hData, encoding: .utf8) {
                    embedHeadersJson = hStr
                }
                let embedHttp = PluginJSRuntime.shared.performSyncHttp(urlStr: streamInfo.url, optionsJson: embedHeadersJson)
                if let eData = embedHttp.data(using: .utf8),
                   let eObj = try? JSONSerialization.jsonObject(with: eData) as? [String: Any],
                   let embedBody = eObj["body"] as? String,
                   let embedParsed = PluginJSRuntime.shared.callFunction(
                       pluginId: pid,
                       fnName: "parseEmbedResponse",
                       args: [embedBody, streamInfo.url]
                   ),
                   let epData = embedParsed.data(using: .utf8),
                   let epObj = try? JSONSerialization.jsonObject(with: epData) as? [String: Any] {
                    let resolved = JSStreamInfo.parse(from: epObj)
                    if !resolved.url.isEmpty || !resolved.m3u8Content.isEmpty {
                        streamInfo = resolved
                    }
                }
            }

            DispatchQueue.main.async {
                completion(streamInfo)
            }
        }
    }

    // Sync Remote JSON Manifest Repository (e.g. williampro01)
    func syncAllRemoteRepos(completion: @escaping (Int) -> Void) {
        workerQueue.async {
            var installedCount = 0
            for repoUrl in self.repoUrls {
                let resp = PluginJSRuntime.shared.performSyncHttp(urlStr: repoUrl, optionsJson: "{}")
                guard let data = resp.data(using: .utf8),
                      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let body = obj["body"] as? String,
                      let bData = body.data(using: .utf8) else { continue }

                let json = try? JSONSerialization.jsonObject(with: bData)
                var list: [[String: Any]] = []
                if let arr = json as? [[String: Any]] {
                    list = arr
                } else if let dict = json as? [String: Any],
                          let pArr = (dict["plugins"] as? [[String: Any]]) ?? (dict["data"] as? [[String: Any]]) {
                    list = pArr
                }

                for item in list {
                    let scriptUrl = "\(item["scriptUrl"] ?? item["url"] ?? item["src"] ?? "")"
                    if scriptUrl.hasPrefix("http") {
                        let sResp = PluginJSRuntime.shared.performSyncHttp(urlStr: scriptUrl, optionsJson: "{}")
                        if let sData = sResp.data(using: .utf8),
                           let sObj = try? JSONSerialization.jsonObject(with: sData) as? [String: Any],
                           let jsCode = sObj["body"] as? String,
                           jsCode.contains("getManifest") {
                            if self.installCustomPlugin(rawScript: jsCode, selectImmediately: false) != nil {
                                installedCount += 1
                            }
                        }
                    }
                }
            }
            DispatchQueue.main.async {
                completion(installedCount)
            }
        }
    }
}
