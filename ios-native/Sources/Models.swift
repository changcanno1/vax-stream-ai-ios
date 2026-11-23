import Foundation

// =============================================================================
// 1. NATIVE DATA MODELS (TƯƠNG THÍCH 100% VỚI PLUGIN DECODE CỦA VAX PLAYER GỐC)
// =============================================================================

struct PluginManifest: Identifiable, Codable, Equatable {
    var id: String
    var name: String
    var version: String
    var description: String
    var baseUrl: String
    var iconUrl: String
    var type: String
    var layoutType: String
    var playerType: String
    var isAdult: Bool
    var isEnabled: Bool
    var isAiGenerated: Bool = false

    static func parse(from dict: [String: Any], fallbackId: String) -> PluginManifest {
        let id = (dict["id"] as? String) ?? fallbackId
        let name = (dict["name"] as? String) ?? id
        let version = (dict["version"] as? String) ?? "1.0.0"
        let desc = (dict["description"] as? String) ?? (dict["info"] as? String) ?? "Nguồn phim VAX"
        let base = (dict["baseUrl"] as? String) ?? (dict["BASEURL"] as? String) ?? (dict["baseURL"] as? String) ?? ""
        let icon = (dict["iconUrl"] as? String) ?? ""
        let type = (dict["type"] as? String) ?? "MOVIE"
        let layout = (dict["layoutType"] as? String) ?? "GRID"
        let pType = (dict["playerType"] as? String) ?? (dict["playerTpye"] as? String) ?? "exoplayer"
        let adult = (dict["isAdult"] as? Bool) ?? false
        let enabled = (dict["isEnabled"] as? Bool) ?? true
        return PluginManifest(
            id: id, name: name, version: version, description: desc,
            baseUrl: base, iconUrl: icon, type: type, layoutType: layout,
            playerType: pType, isAdult: adult, isEnabled: enabled
        )
    }
}

struct JSHomeSection: Identifiable, Equatable {
    var id: String { slug + "_" + title }
    var slug: String
    var title: String
    var type: String // "Horizontal" | "Grid"
}

struct JSCategoryTag: Identifiable, Equatable {
    var id: String { slug + "_" + name }
    var name: String
    var slug: String
}

struct JSMovieItem: Identifiable, Codable, Equatable {
    var id: String
    var title: String
    var posterUrl: String
    var backdropUrl: String
    var description: String
    var year: String
    var quality: String
    var episodeCurrent: String
    var lang: String
    var datasend: String
    var pluginId: String = ""

    static func parse(from dict: [String: Any], pluginId: String = "") -> JSMovieItem? {
        let rawId = "\(dict["id"] ?? dict["slug"] ?? dict["href"] ?? dict["url"] ?? "")"
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let rawTitle = "\(dict["title"] ?? dict["name"] ?? "")"
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if rawId.isEmpty && rawTitle.isEmpty { return nil }

        let poster = "\(dict["posterUrl"] ?? dict["poster"] ?? dict["thumb"] ?? "")"
        let backdrop = "\(dict["backdropUrl"] ?? dict["backdrop"] ?? poster)"
        let desc = "\(dict["description"] ?? dict["overview"] ?? "")"
        let year = "\(dict["year"] ?? "")"
        let quality = "\(dict["quality"] ?? "HD")"
        let epCur = "\(dict["episode_current"] ?? dict["status"] ?? "")"
        let lang = "\(dict["lang"] ?? "Vietsub")"
        var ds = ""
        if let dStr = dict["datasend"] as? String {
            ds = dStr
        } else if let dObj = dict["datasend"],
                  let dData = try? JSONSerialization.data(withJSONObject: dObj),
                  let s = String(data: dData, encoding: .utf8) {
            ds = s
        }

        return JSMovieItem(
            id: rawId.isEmpty ? rawTitle : rawId,
            title: rawTitle.isEmpty ? "Không tiêu đề" : rawTitle,
            posterUrl: poster,
            backdropUrl: backdrop.isEmpty ? poster : backdrop,
            description: desc,
            year: year == "0" ? "" : year,
            quality: quality,
            episodeCurrent: epCur,
            lang: lang,
            datasend: ds,
            pluginId: pluginId
        )
    }
}

struct JSEpisodeSource: Identifiable, Equatable {
    var id: String { name + "_" + url }
    var name: String
    var url: String
    var datasend: String
}

struct JSEpisode: Identifiable, Equatable {
    var id: String
    var name: String
    var slug: String
    var thumb: String
    var datasend: String
    var ids: [JSEpisodeSource]
}

struct JSServer: Identifiable, Equatable {
    var id: String { name }
    var name: String
    var episodes: [JSEpisode]
}

struct JSMovieDetail: Equatable {
    var id: String
    var title: String
    var originName: String
    var posterUrl: String
    var backdropUrl: String
    var description: String
    var year: String
    var rating: String
    var quality: String
    var status: String
    var category: String
    var episodeCurrent: String
    var duration: String
    var casts: String
    var director: String
    var country: String
    var lang: String
    var extra: String
    var servers: [JSServer]

    static func parse(from dict: [String: Any], fallbackItem: JSMovieItem) -> JSMovieDetail {
        let id = "\(dict["id"] ?? fallbackItem.id)"
        let title = "\(dict["title"] ?? dict["name"] ?? fallbackItem.title)"
        let origin = "\(dict["originName"] ?? "")"
        let poster = "\(dict["posterUrl"] ?? fallbackItem.posterUrl)"
        let backdrop = "\(dict["backdropUrl"] ?? (poster.isEmpty ? fallbackItem.backdropUrl : poster))"
        var desc = "\(dict["description"] ?? fallbackItem.description)"
        if let splitDesc = desc.components(separatedBy: "\r\n\r\n\r\n").first {
            desc = splitDesc.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let year = "\(dict["year"] ?? fallbackItem.year)"
        let rating = "\(dict["rating"] ?? "")"
        let quality = "\(dict["quality"] ?? fallbackItem.quality)"
        let status = "\(dict["status"] ?? "")"
        let category = "\(dict["category"] ?? "")"
            .replacingOccurrences(of: #"\[([^\]]+)\]\([^\)]+\)"#, with: "$1", options: .regularExpression)
        let epCur = "\(dict["episode_current"] ?? fallbackItem.episodeCurrent)"
        let duration = "\(dict["duration"] ?? "")"
        let casts = "\(dict["casts"] ?? dict["actors"] ?? "")"
            .replacingOccurrences(of: #"\[([^\]]+)\]\([^\)]+\)"#, with: "$1", options: .regularExpression)
        let director = "\(dict["director"] ?? dict["directors"] ?? "")"
            .replacingOccurrences(of: #"\[([^\]]+)\]\([^\)]+\)"#, with: "$1", options: .regularExpression)
        let country = "\(dict["country"] ?? "")"
            .replacingOccurrences(of: #"\[([^\]]+)\]\([^\)]+\)"#, with: "$1", options: .regularExpression)
        let lang = "\(dict["lang"] ?? fallbackItem.lang)"
        let extra = "\(dict["extra"] ?? "")"

        var parsedServers: [JSServer] = []
        if let svArr = dict["servers"] as? [[String: Any]] {
            for (sIdx, svDict) in svArr.enumerated() {
                let svName = "\(svDict["name"] ?? svDict["server_name"] ?? "Server \(sIdx + 1)")"
                var eps: [JSEpisode] = []
                let rawEps = (svDict["episodes"] as? [[String: Any]]) ?? (svDict["list"] as? [[String: Any]]) ?? []
                for (eIdx, epDict) in rawEps.enumerated() {
                    var epId = "\(epDict["id"] ?? epDict["url"] ?? epDict["link"] ?? epDict["link_m3u8"] ?? epDict["link_embed"] ?? "")"
                    let epName = "\(epDict["name"] ?? epDict["title"] ?? "Tập \(eIdx + 1)")"
                    let epSlug = "\(epDict["slug"] ?? "tap-\(eIdx + 1)")"
                    let epThumb = "\(epDict["thumb"] ?? "")"
                    var epDs = ""
                    if let dStr = epDict["datasend"] as? String {
                        epDs = dStr
                    } else if let dObj = epDict["datasend"],
                              let dData = try? JSONSerialization.data(withJSONObject: dObj),
                              let s = String(data: dData, encoding: .utf8) {
                        epDs = s
                    }

                    var subSources: [JSEpisodeSource] = []
                    if let idsArr = (epDict["ids"] as? [[String: Any]]) ?? (epDict["sources"] as? [[String: Any]]) {
                        for srcDict in idsArr {
                            let sName = "\(srcDict["name"] ?? "Server")"
                            let sUrl = "\(srcDict["url"] ?? srcDict["id"] ?? "")"
                            let sDs = "\(srcDict["datasend"] ?? "")"
                            if !sUrl.isEmpty {
                                subSources.append(JSEpisodeSource(name: sName, url: sUrl, datasend: sDs))
                            }
                        }
                    }
                    if epId.isEmpty, let firstSrc = subSources.first {
                        epId = firstSrc.url
                    }
                    if !epId.isEmpty {
                        eps.append(JSEpisode(id: epId, name: epName, slug: epSlug, thumb: epThumb, datasend: epDs, ids: subSources))
                    }
                }
                if !eps.isEmpty {
                    parsedServers.append(JSServer(name: svName, episodes: eps))
                }
            }
        }

        return JSMovieDetail(
            id: id, title: title, originName: origin, posterUrl: poster,
            backdropUrl: backdrop, description: desc, year: year == "0" ? "" : year,
            rating: rating == "0" ? "" : rating, quality: quality, status: status,
            category: category, episodeCurrent: epCur, duration: duration,
            casts: casts, director: director, country: country, lang: lang,
            extra: extra, servers: parsedServers
        )
    }
}

struct JSSubtitle: Identifiable, Equatable {
    var id: String { url }
    var lang: String
    var url: String
    var mimeType: String
}

struct JSSkipTime: Equatable {
    var start: Double
    var end: Double
    var type: String
}

struct JSStreamInfo: Equatable {
    var url: String
    var m3u8Content: String
    var baseUrl: String
    var mimeType: String
    var isEmbed: Bool
    var headers: [String: String]
    var subtitles: [JSSubtitle]
    var skipTimes: [JSSkipTime]
    var datasend: String

    static func parse(from dict: [String: Any]) -> JSStreamInfo {
        let url = "\(dict["url"] ?? dict["file"] ?? dict["stream"] ?? "")"
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let m3u8 = "\(dict["m3u8Content"] ?? dict["m3u8_content"] ?? "")"
        let base = "\(dict["baseUrl"] ?? dict["base_url"] ?? url)"
        let mime = "\(dict["mimeType"] ?? "")"
        let isEmbed = (dict["isEmbed"] as? Bool) ?? false
        let ds = "\(dict["datasend"] ?? "")"

        var hdrs: [String: String] = [:]
        if let hDict = dict["headers"] as? [String: Any] {
            for (k, v) in hDict {
                hdrs[k] = "\(v)"
            }
        }

        var subs: [JSSubtitle] = []
        if let sArr = dict["subtitles"] as? [[String: Any]] {
            for s in sArr {
                let sUrl = "\(s["url"] ?? s["file"] ?? s["src"] ?? "")"
                let sLang = "\(s["lang"] ?? s["label"] ?? s["language"] ?? "Tiếng Việt")"
                let sMime = "\(s["mimeType"] ?? "text/vtt")"
                if !sUrl.isEmpty {
                    subs.append(JSSubtitle(lang: sLang, url: sUrl, mimeType: sMime))
                }
            }
        }

        var skips: [JSSkipTime] = []
        if let skArr = (dict["skipTimes"] as? [[String: Any]]) ?? (dict["skip_times"] as? [[String: Any]]) {
            for sk in skArr {
                let st = Double("\(sk["start"] ?? 0)") ?? 0
                let en = Double("\(sk["end"] ?? 0)") ?? 0
                let tp = "\(sk["type"] ?? "intro")"
                if en > st {
                    skips.append(JSSkipTime(start: st, end: en, type: tp))
                }
            }
        }

        return JSStreamInfo(
            url: url, m3u8Content: m3u8, baseUrl: base, mimeType: mime,
            isEmbed: isEmbed, headers: hdrs, subtitles: subs,
            skipTimes: skips, datasend: ds
        )
    }
}

struct SubtitleCue: Identifiable, Equatable {
    let id = UUID()
    let start: Double
    let end: Double
    let text: String
}
