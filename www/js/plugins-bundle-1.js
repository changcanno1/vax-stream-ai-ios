// =============================================================================
// VAX BUILT-IN PLUGINS BUNDLE (PART 1)
// Bao gồm nguyên bản mã nguồn của các plugin:
// 1. Dexter (4K Quốc tế + Vietsub)
// 2. DANET Phim (AVOD)
// 3. Film4K (4K/1080p)
// 4. HHPanda (Anime 3D)
// 5. CityPhim (123Embed + TMDB)
// 6. Hoạt Hình 1 (Tu Tiên / Tiên Hiệp)
// 7. FreeReels (Short Drama)
// =============================================================================

window.VAX_BUILTIN_PLUGINS = window.VAX_BUILTIN_PLUGINS || [];

// 1. DEXTER
window.VAX_BUILTIN_PLUGINS.push({
  id: "dexter",
  name: "Dexter 4K",
  code: String.raw`var DEXTER_BASE = "https://dexter.pw";
var DEXTER_API = DEXTER_BASE + "/api";
var DEXTER_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var DEXTER_IMG = "https://image.tmdb.org/t/p/";
var DEXTER_HEADERS = {
    "User-Agent": DEXTER_UA,
    "Accept": "application/json, text/plain, */*",
    "Referer": DEXTER_BASE + "/"
};
var DX_MASTER_CACHE = {};
var DX_SUB_WORKER = "https://getsubtitle.alokillgtv.workers.dev/";
var DX_GENRES = [
    { id: 28, slug: "hanh-dong", name: "Hành động", aliases: ["action"] },
    { id: 12, slug: "phieu-luu", name: "Phiêu lưu", aliases: ["adventure"] },
    { id: 16, slug: "hoat-hinh", name: "Hoạt hình", aliases: ["animation"] },
    { id: 35, slug: "hai", name: "Hài", aliases: ["comedy"] },
    { id: 80, slug: "toi-pham", name: "Tội phạm", aliases: ["crime"] },
    { id: 99, slug: "tai-lieu", name: "Tài liệu", aliases: ["documentary"] },
    { id: 18, slug: "chinh-kich", name: "Chính kịch", aliases: ["drama"] },
    { id: 10751, slug: "gia-dinh", name: "Gia đình", aliases: ["family"] },
    { id: 14, slug: "gia-tuong", name: "Giả tưởng", aliases: ["fantasy"] },
    { id: 36, slug: "lich-su", name: "Lịch sử", aliases: ["history"] },
    { id: 27, slug: "kinh-di", name: "Kinh dị", aliases: ["horror"] },
    { id: 10402, slug: "am-nhac", name: "Âm nhạc", aliases: ["music"] },
    { id: 9648, slug: "bi-an", name: "Bí ẩn", aliases: ["mystery"] },
    { id: 10749, slug: "lang-man", name: "Lãng mạn", aliases: ["romance"] },
    { id: 878, slug: "khoa-hoc-vien-tuong", name: "Khoa học viễn tưởng", aliases: ["science-fiction", "sci-fi"] },
    { id: 53, slug: "giat-gan", name: "Giật gân", aliases: ["thriller"] },
    { id: 10752, slug: "chien-tranh", name: "Chiến tranh", aliases: ["war"] },
    { id: 37, slug: "vien-tay", name: "Viễn Tây", aliases: ["western"] }
];

function dxLog(step, msg) {
    try { console.log("[DEXTER] " + step + " | " + msg); } catch (e) {}
}

function dxTrim(s) {
    return String(s === undefined || s === null ? "" : s).replace(/^\s+|\s+$/g, "");
}

function dxAscii(s) {
    return String(s || "").toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
        .replace(/[èéẹẻẽêềếệểễ]/g, "e")
        .replace(/[ìíịỉĩ]/g, "i")
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
        .replace(/[ùúụủũưừứựửữ]/g, "u")
        .replace(/[ỳýỵỷỹ]/g, "y")
        .replace(/đ/g, "d");
}

function dxSafeJson(s) {
    try {
        if (!s) return null;
        var text = String(s).replace(/^\uFEFF/, "").replace(/^\s+/, "");
        if (text.charAt(0) !== "{" && text.charAt(0) !== "[") return null;
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

function dxBody(res) {
    if (!res) return "";
    if (res.body !== undefined && res.body !== null) return String(res.body);
    if (res.data !== undefined && res.data !== null) return String(res.data);
    if (res.text !== undefined && res.text !== null) return String(res.text);
    return "";
}

function dxOk(res) {
    if (!res) return false;
    var code = parseInt(res.status, 10);
    return res.isSuccessful === true || code >= 200 && code < 300;
}

function dxHttp(url, label, timeout, headers) {
    if (!url) return null;
    try {
        dxLog("HTTP", label + " -> " + url);
        if (typeof httpRequest !== "function") return null;
        var res = httpRequest(url, { method: "GET", headers: headers || DEXTER_HEADERS, timeout: timeout || 15000 });
        return res;
    } catch (e) {
        return null;
    }
}

function dxGetJson(url, label, timeout) {
    var res = dxHttp(url, label, timeout);
    var body = dxBody(res);
    return dxSafeJson(body);
}

function dxGetMaster(url) {
    url = dxAbs(url);
    if (!url) return "";
    if (DX_MASTER_CACHE[url]) return DX_MASTER_CACHE[url];
    var res = dxHttp(url, "MASTER", 15000);
    var body = dxBody(res);
    if (dxOk(res) && body.indexOf("#EXTM3U") >= 0) {
        DX_MASTER_CACHE[url] = body;
        return body;
    }
    return "";
}

function dxAbs(u) {
    u = dxTrim(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf("//") === 0) return "https:" + u;
    return DEXTER_BASE + (u.charAt(0) === "/" ? u : "/" + u);
}

function dxImg(path, size) {
    path = dxTrim(path);
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return DEXTER_IMG + (size || "w500") + (path.charAt(0) === "/" ? path : "/" + path);
}

function dxStripPipe(u) {
    u = String(u || "");
    var i = u.indexOf("|");
    if (i >= 0) u = u.substring(0, i);
    u = u.replace(/#.*$/, "");
    return dxTrim(u);
}

function dxIdFromUrl(u) {
    u = dxStripPipe(u);
    var m = u.match(/\/(?:movie|show|watch)\/(?:show\/)?([A-Za-z0-9]+)/);
    if (m) return m[1];
    m = u.match(/\/(\d+)(?:-|\/|$)/);
    return m ? m[1] : "";
}

function dxMovieApi(u) {
    var id = dxIdFromUrl(u);
    return id ? DEXTER_API + "/movie/" + id : "";
}

function dxShowApi(u) {
    var id = dxIdFromUrl(u);
    return id ? DEXTER_API + "/tv/" + id : "";
}

function dxEpisodeApi(u) {
    u = dxStripPipe(u);
    var m = u.match(/\/api\/tv\/(\d+)\/episode\/(\d+)\/(\d+)/i);
    if (m) return DEXTER_API + "/tv/" + m[1] + "/episode/" + m[2] + "/" + m[3];
    m = u.match(/\/watch\/show\/(\d+)\/(\d+)\/(\d+)/i);
    if (m) return DEXTER_API + "/tv/" + m[1] + "/episode/" + m[2] + "/" + m[3];
    m = u.match(/\/show\/(\d+)/i);
    if (m) {
        var s = (u.match(/[#?&](?:s|season)=(\d+)/i) || [])[1] || "1";
        var e = (u.match(/[#?&](?:e|episode)=(\d+)/i) || [])[1] || "1";
        return DEXTER_API + "/tv/" + m[1] + "/episode/" + s + "/" + e;
    }
    if (/\/api\/movie\/\d+/i.test(u) || /\/movie\/\d+/i.test(u) || /\/watch\/\d+/i.test(u)) {
        return dxMovieApi(u);
    }
    return u;
}

function dxDetailApi(u) {
    u = dxStripPipe(u);
    if (/\/api\/tv\/\d+\/episode\//i.test(u) || /\/watch\/show\/\d+\/\d+\/\d+/i.test(u)) return dxEpisodeApi(u);
    if (/\/api\/movie\/\d+/i.test(u) || /\/api\/tv\/\d+/i.test(u)) return u;
    if (/\/show\//i.test(u)) return dxShowApi(u);
    if (/\/movie\//i.test(u) || /\/watch\//i.test(u)) return dxMovieApi(u);
    return dxEpisodeApi(u);
}

function dxPad(n) {
    n = parseInt(n, 10) || 0;
    return n < 10 ? "0" + n : String(n);
}

function dxClean(s) {
    return String(s || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");
}

function dxLang(code) {
    var c = dxTrim(code);
    var map = { "vi": "Tiếng Việt", "en": "English", "zh": "中文", "zh-CN": "中文 (简体)", "zh-TW": "中文 (繁體)" };
    return map[c] || c || "Unknown";
}

function dxSubGroup(code) {
    var c = dxTrim(code).toLowerCase();
    if (c === "vi" || c === "vie" || c.indexOf("vi-") === 0) return "vi";
    if (c === "en" || c === "eng" || c.indexOf("en-") === 0) return "en";
    if (c === "zh" || c === "zho" || c === "chi" || c === "cn" || c === "yue" || c.indexOf("zh-") === 0) return "zh";
    return "";
}

function getManifest() {
    return JSON.stringify({
        id: "dexter",
        name: "Dexter",
        version: "1.3.0",
        description: "Nguồn phim nước ngoài chất lượng cao 4K, phụ đề Tiếng Việt.",
        BASEURL: DEXTER_BASE,
        baseUrl: DEXTER_BASE,
        iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/icon/dexter.png",
        referrer: DEXTER_BASE + "/",
        isEnabled: true,
        isAdult: false,
        type: "MOVIE",
        layoutType: "VERTICAL",
        playerType: "exoplayer",
        subtitleCat: true,
        debug: true
    });
}

function getHomeSections() {
    return JSON.stringify([
        { slug: "home", title: "Mới & Nổi bật", type: "Horizontal" },
        { slug: "tv", title: "Phim bộ", type: "Horizontal" },
        { slug: "movies", title: "Phim lẻ", type: "Grid" }
    ]);
}

function dxGenreKey(value) {
    var key = dxTrim(String(value || "").split("|")[0]);
    try { key = decodeURIComponent(key); } catch (e) {}
    key = dxAscii(key).replace(/^the-loai\s*\/?\s*/, "");
    key = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return key.replace(/^the-loai-/, "").replace(/^-+|-+$/g, "");
}

function dxGenreByKey(key) {
    key = dxGenreKey(key);
    if (!key) return null;
    for (var i = 0; i < DX_GENRES.length; i++) {
        var g = DX_GENRES[i];
        if (g.slug === key || String(g.id) === key) return g;
        for (var j = 0; j < g.aliases.length; j++) {
            if (g.aliases[j] === key) return g;
        }
    }
    return null;
}

function getPrimaryCategories() {
    var out = [
        { name: "Phim lẻ", slug: "movies" },
        { name: "Phim bộ", slug: "tv" }
    ];
    for (var i = 0; i < DX_GENRES.length; i++) {
        out.push({ name: DX_GENRES[i].name, slug: DX_GENRES[i].slug });
    }
    return JSON.stringify(out);
}

function getFilterConfig() {
    return JSON.stringify({ sort: [] });
}

function getUrlList(slug, filtersJson) {
    var f = {};
    try { f = JSON.parse(filtersJson || "{}"); } catch (e) {}
    var page = parseInt(f.page, 10) || parseInt(f.pageNumber, 10) || 1;
    var key = dxTrim(slug).replace(/^\/+|\/+$/g, "").toLowerCase();
    var type = String(f.type || "").toLowerCase() === "tv" || String(f.type || "").toLowerCase() === "show" ? "tv" : "movie";
    var genre = dxGenreByKey(key) || dxGenreByKey(f.category) || dxGenreByKey(f.genre);
    var url;
    if (key === "movies" || key === "movie" || key === "phim-le") {
        url = DEXTER_API + "/browse?type=movie" + (genre ? "&genre=" + genre.id : "") + "&page=" + page;
    } else if (key === "tv" || key === "shows" || key === "phim-bo") {
        url = DEXTER_API + "/browse?type=tv" + (genre ? "&genre=" + genre.id : "") + "&page=" + page;
    } else if (genre) {
        url = DEXTER_API + "/browse?type=" + type + "&genre=" + genre.id + "&page=" + page;
    } else if (!key || key === "home" || key === "trang-chu") {
        url = DEXTER_API + "/home";
    } else {
        url = DEXTER_API + "/browse?type=movie&page=" + page;
    }
    return url;
}

function getUrlSearch(keyword, filtersJson) {
    var f = {};
    try { f = JSON.parse(filtersJson || "{}"); } catch (e) {}
    var page = parseInt(f.page, 10) || 1;
    return DEXTER_API + "/search?q=" + encodeURIComponent(keyword || "") + "&page=" + page;
}

function getUrlDetail(slug) {
    return dxDetailApi(slug);
}

function dxItem(x) {
    if (!x) return null;
    var type = x.type === "tv" ? "show" : "movie";
    var id = x.id ? DEXTER_BASE + "/" + type + "/" + x.id : "";
    if (!id && x.url) id = dxAbs(x.url);
    var poster = dxImg(x.poster || x.portrait || x.backdrop, "w500");
    var backdrop = dxImg(x.backdrop || x.poster, "w1280");
    return {
        id: id,
        title: dxClean(x.title || x.name || ""),
        posterUrl: poster,
        backdropUrl: backdrop,
        description: dxClean(x.overview || x.description || ""),
        year: parseInt(x.year, 10) || 0,
        rating: x.rating || 0,
        quality: "4K HDR",
        lang: "Vietsub"
    };
}

function dxMapItems(arr) {
    var out = [];
    if (!arr || !arr.length) return out;
    for (var i = 0; i < arr.length; i++) {
        var it = dxItem(arr[i]);
        if (it && it.id) out.push(it);
    }
    return out;
}

function parseListResponse(html, apiUrl) {
    var data = dxSafeJson(html);
    if (!data) data = dxGetJson(apiUrl, "LIST-RETRY", 20000);
    if (data && data.items && data.pagination) return JSON.stringify(data);
    var items = [];
    if (data && data.hero) {
        items = dxMapItems(data.hero);
        if (data.shelves) {
            for (var s = 0; s < data.shelves.length; s++) {
                var shelfItems = dxMapItems(data.shelves[s].items);
                for (var k = 0; k < shelfItems.length; k++) items.push(shelfItems[k]);
            }
        }
    } else if (data && data.results) {
        items = dxMapItems(data.results);
    }
    var page = (data && parseInt(data.page, 10)) || 1;
    var totalPages = (data && parseInt(data.totalPages, 10)) || 1;
    var totalItems = (data && parseInt(data.totalResults, 10)) || items.length;
    return JSON.stringify({
        items: items,
        pagination: { currentPage: page, totalPages: totalPages, totalItems: totalItems, itemsPerPage: items.length || 20 }
    });
}

function parseSearchResponse(html, apiUrl) {
    return parseListResponse(html, apiUrl);
}

function dxSeasonServers(showId) {
    var show = dxGetJson(DEXTER_API + "/tv/" + showId, "SHOW-DETAIL", 20000);
    if (!show) return { show: {}, servers: [] };
    var list = show.seasonList || [];
    var seasons = [];
    for (var i = 0; i < list.length; i++) {
        var sn = parseInt(list[i].number, 10);
        if (!isNaN(sn)) seasons.push(sn);
    }
    if (!seasons.length) {
        for (var n = 1; n <= (parseInt(show.seasons, 10) || 1); n++) seasons.push(n);
    }
    var servers = [];
    for (var r = 0; r < seasons.length; r++) {
        var seasonData = dxGetJson(DEXTER_API + "/tv/" + showId + "/season/" + seasons[r], "SEASON-S" + seasons[r], 20000);
        if (!seasonData || !seasonData.episodes) continue;
        var eps = [];
        for (var e = 0; e < seasonData.episodes.length; e++) {
            var ep = seasonData.episodes[e];
            var sn2 = parseInt(ep.season, 10) || seasons[r];
            var en = parseInt(ep.episode, 10);
            if (isNaN(en)) continue;
            eps.push({
                id: DEXTER_API + "/tv/" + showId + "/episode/" + sn2 + "/" + en,
                name: "S" + dxPad(sn2) + "E" + dxPad(en) + " · " + dxClean(ep.title || ""),
                slug: "s" + sn2 + "e" + en,
                thumb: dxImg(ep.still, "w300")
            });
        }
        if (eps.length) servers.push({ name: "Season " + seasons[r], episodes: eps });
    }
    return { show: show, servers: servers };
}

function parseMovieDetail(html, pageUrl, datasend) {
    var data = dxSafeJson(html);
    if (data && data.servers) return JSON.stringify(data);
    var api = dxDetailApi(pageUrl);
    if (!data || (!data.type && !data.sources)) data = dxGetJson(api, "DETAIL-API", 20000);
    if (!data) return JSON.stringify({ id: pageUrl, title: "Dexter", servers: [] });
    if (data.show && data.episode) data = data.show;
    var isShow = data.type === "tv" || /\/tv\//i.test(api) || /\/show\//i.test(pageUrl);
    var title = dxClean(data.title || data.name || "Dexter");
    var poster = dxImg(data.poster || data.portrait, "w500");
    var backdrop = dxImg(data.backdrop || data.poster, "w1280");
    var servers = [];
    if (isShow) {
        var ss = dxSeasonServers(data.id);
        servers = ss.servers;
        if (!servers.length) {
            servers = [{ name: "Dexter", episodes: [{ id: DEXTER_API + "/tv/" + data.id + "/episode/1/1", name: "S01E01", slug: "s1e1" }] }];
        }
    } else {
        servers = [{ name: "Dexter 4K", episodes: [{ id: DEXTER_API + "/movie/" + data.id, name: "Full · 4K", slug: "full" }] }];
    }
    var casts = [];
    if (data.cast) {
        for (var c = 0; c < data.cast.length && c < 12; c++) casts.push(data.cast[c].name);
    }
    var directors = [];
    if (data.directors) {
        for (var d = 0; d < data.directors.length; d++) directors.push(data.directors[d].name);
    }
    return JSON.stringify({
        id: data.id ? String(data.id) : pageUrl,
        title: title,
        posterUrl: poster,
        backdropUrl: backdrop,
        description: dxClean(data.overview || ""),
        year: parseInt(data.year, 10) || 0,
        rating: data.rating || 0,
        quality: "4K",
        lang: "Vietsub",
        casts: casts.join(", "),
        director: directors.join(", "),
        category: (data.genres || []).join(", "),
        status: data.status || "",
        duration: data.runtime ? data.runtime + " phút" : "",
        servers: servers
    });
}

function parseDetailResponse(html, pageUrl, datasend) {
    var data = dxSafeJson(html);
    if (data && data.url && data.headers) return JSON.stringify(data);
    var api = dxDetailApi(pageUrl);
    if (!data || !data.sources) data = dxGetJson(api, "STREAM-API", 20000);
    if (!data || !data.sources) {
        return JSON.stringify({ url: "", isEmbed: true, headers: { "Referer": DEXTER_BASE + "/" }, subtitles: [] });
    }
    var hlsUrl = "";
    var embedUrl = "";
    for (var i = 0; i < data.sources.length; i++) {
        var s = data.sources[i] || {};
        if (s.kind === "hls" && s.url && !s.sealed && !hlsUrl) hlsUrl = dxAbs(s.url);
        if (s.kind === "embed" && s.url && !embedUrl) embedUrl = dxAbs(s.url);
    }
    var subs = [];
    if (data.subtitles) {
        for (var k = 0; k < data.subtitles.length; k++) {
            var st = data.subtitles[k] || {};
            if (st.url || st.file) subs.push({ lang: st.label || dxLang(st.lang), url: dxAbs(st.url || st.file), mimeType: "text/vtt" });
        }
    }
    if (hlsUrl) {
        return JSON.stringify({
            url: hlsUrl,
            isEmbed: false,
            mimeType: "application/x-mpegURL",
            headers: { "Referer": DEXTER_BASE + "/", "Origin": DEXTER_BASE },
            subtitles: subs
        });
    }
    return JSON.stringify({
        url: embedUrl,
        isEmbed: true,
        headers: { "Referer": DEXTER_BASE + "/" },
        subtitles: subs
    });
}
function parseEmbedResponse(html, url, datasend) { return parseDetailResponse(html, url, datasend); }`
});

// 2. DANET
window.VAX_BUILTIN_PLUGINS.push({
  id: "danet",
  name: "DANET Phim",
  code: String.raw`var BASEURL = "https://danet.vn";
var API = BASEURL + "/api";
var DEVICE_ID = "vax-danet-avod";
var UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";

function getManifest() {
  return JSON.stringify({
    id: "danet",
    name: "DANET Phim",
    version: "1.0.0",
    author: "VAX",
    description: "Xem các phim bản quyền miễn phí (AVOD) từ Danet",
    baseUrl: BASEURL,
    iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/danet.png",
    imageReferer: BASEURL + "/",
    isEnabled: true,
    isAdult: false,
    type: "MOVIE",
    layoutType: "HORIZONTAL",
    playerType: "auto"
  });
}

function danetRequest(url, method, body) {
  if (typeof httpRequest !== "function") return "";
  try {
    var response = httpRequest(url, {
      method: method || "GET",
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "Accept": "application/json, text/html, */*",
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Referer": BASEURL + "/avod",
        "x-device-id": DEVICE_ID,
        "x-device-model": "VAX Mobile",
        "x-device-os": "Android 13"
      }
    });
    if (!response || !response.isSuccessful) return "";
    return String(response.body || "");
  } catch (e) { return ""; }
}

function danetJson(raw) {
  try { return JSON.parse(String(raw || "{}")); } catch (e) { return {}; }
}

function filtersPage(filtersJson) {
  try {
    var filters = typeof filtersJson === "string" ? JSON.parse(filtersJson || "{}") : (filtersJson || {});
    return Math.max(1, parseInt(filters.page, 10) || 1);
  } catch (e) { return 1; }
}

function isAvod(item) {
  if (!item || item.is_playable === false) return false;
  var packages = item.movie_packages || item.packages || [];
  if (!packages.length) return !!item.uid;
  for (var i = 0; i < packages.length; i++) {
    if (String(packages[i] && packages[i].code || "").toLowerCase() === "avod") return true;
  }
  return false;
}

function mapMovie(item) {
  if (!item || !item.uid || item.is_playable === false) return null;
  var packages = item.movie_packages || item.packages;
  if (packages && packages.length && !isAvod(item)) return null;
  return {
    id: String(item.uid),
    title: item.title || item.title_en || "DANET",
    posterUrl: item.poster || "",
    backdropUrl: item.banner || item.poster || "",
    description: item.summary || item.story || "",
    year: item.release_year || "",
    quality: item.quality || "HD",
    episode_current: item.total_episodes ? String(item.total_episodes) + " tập" : "Full",
    lang: item.movie_language && item.movie_language.name || "Tiếng Việt",
    type: item.series_id ? "tv" : "movie"
  };
}

function queryValue(url, key, fallback) {
  var match = String(url || "").match(new RegExp("[?&]" + key + "=([^&]+)"));
  if (!match) return fallback;
  try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
}

function parseApiMovieList(raw, url) {
  var data = danetJson(raw);
  var source = data.results || [];
  var items = [];
  for (var i = 0; i < source.length; i++) {
    var item = mapMovie(source[i]);
    if (item) items.push(item);
  }
  var page = parseInt(queryValue(url, "page", "1"), 10) || 1;
  var limit = parseInt(queryValue(url, "limit", "20"), 10) || 20;
  var found = parseInt(data.num_found, 10) || items.length;
  var pages = Math.max(page, Math.ceil(found / limit));
  return JSON.stringify({
    items: items,
    pagination: { currentPage: page, totalPages: pages, totalItems: found, itemsPerPage: limit }
  });
}

function getHomeSections() {
  return JSON.stringify([
    { slug: "playlist:133", title: "Top 10 trong ngày", type: "Horizontal" },
    { slug: "playlist:84", title: "Mới nhất trên DANET", type: "Grid" },
    { slug: "playlist:16", title: "Drama hàng đầu", type: "Horizontal" },
    { slug: "playlist:49", title: "Anime mới nhất", type: "Horizontal" },
    { slug: "avod", title: "Tất cả phim miễn phí", type: "Grid" }
  ]);
}

function getPrimaryCategories() {
  return JSON.stringify([
    { name: "Phim miễn phí AVOD", slug: "avod" },
    { name: "Top 10 trong ngày", slug: "playlist:133" },
    { name: "Mới nhất trên DANET", slug: "playlist:84" },
    { name: "Drama hàng đầu", slug: "playlist:16" },
    { name: "Anime mới nhất", slug: "playlist:49" },
    { name: "Phim thuyết minh Trung Quốc", slug: "playlist:26" },
    { name: "Anime thịnh hành", slug: "playlist:52" }
  ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
  var page = filtersPage(filtersJson);
  var value = String(slug || "avod");
  var limit = 20;
  if (value.indexOf("playlist:") === 0) {
    var playlistId = value.substring(8).replace(/[^0-9]/g, "");
    if (!playlistId) return "";
    return API + "/movie-playlists/" + playlistId + "/movies?module_id=2&limit=" + limit + "&page=" + page;
  }
  return API + "/movies?module_id=2&limit=" + limit + "&page=" + page;
}

function getUrlSearch(keyword, filtersJson) {
  var page = filtersPage(filtersJson);
  return API + "/movies?module_id=2&limit=20&page=" + page + "&q=" + encodeURIComponent(String(keyword || "").slice(0, 100));
}

function getUrlDetail(id) {
  var value = String(id || "");
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\d+$/.test(value)) return API + "/movies/" + value;
  return "";
}

function parseListResponse(raw, url) { return parseApiMovieList(raw, url); }
function parseSearchResponse(raw, url) { return parseApiMovieList(raw, url); }

function parseMovieDetail(raw, url, datasend) {
  var movie = danetJson(raw);
  var uid = String(movie.uid || (String(url || "").match(/\/movies\/(\d+)/) || [])[1] || "");
  if (!uid || !isAvod(movie)) {
    return JSON.stringify({ id: uid, title: movie.title || "DANET", servers: [{ name: "AVOD", episodes: [] }] });
  }
  var episodes = [];
  var episodeData = danetJson(danetRequest(API + "/movies/" + uid + "/episodes?limit=100&page=1"));
  var rows = episodeData.results || [];
  for (var i = 0; i < rows.length; i++) {
    var ep = rows[i];
    if (!ep || !ep.uid || ep.is_playable === false) continue;
    episodes.push({
      id: API + "/movies/" + uid + "/episodes/" + ep.uid + "/locations|data:" + uid + ":" + ep.uid,
      name: ep.sequence ? "Tập " + ep.sequence + " - " + (ep.title || "") : (ep.title || "Tập " + (i + 1)),
      slug: "episode-" + ep.uid,
      thumb: ep.screenshot || ""
    });
  }
  return JSON.stringify({
    id: uid,
    title: movie.title || movie.title_en || uid,
    posterUrl: movie.poster || "",
    backdropUrl: movie.banner || movie.poster || "",
    description: movie.summary || movie.story || "",
    year: movie.release_year || "",
    quality: movie.quality || "HD",
    type: movie.series_id ? "tv" : "movie",
    episode_current: movie.total_episodes ? String(movie.total_episodes) + " tập" : "",
    servers: [{ name: "DANET AVOD", episodes: episodes }]
  });
}

function parseDetailResponse(raw, url, datasend) {
  var result = danetJson(raw);
  if (result.statusCode !== 200) {
    return JSON.stringify({ url: "", isEmbed: false, mimeType: "application/x-mpegURL", headers: {}, subtitles: [] });
  }
  var streams = result.streams || [];
  var stream = "";
  var fileType = "";
  for (var i = 0; i < streams.length; i++) {
    if (streams[i] && streams[i].file_location) {
      stream = streams[i].file_location;
      fileType = String(streams[i].file_type || "").toLowerCase();
      break;
    }
  }
  var subtitles = [];
  var tracks = result.subtitles || [];
  for (var j = 0; j < tracks.length; j++) {
    var track = tracks[j];
    if (!track) continue;
    var subUrl = track.file_location || track.url || track.src;
    if (subUrl) subtitles.push({ lang: track.language || track.lang || "Tiếng Việt", url: subUrl });
  }
  return JSON.stringify({
    url: stream,
    isEmbed: false,
    mimeType: fileType === "mp4" ? "video/mp4" : "application/x-mpegURL",
    headers: { "User-Agent": UA, "Referer": BASEURL + "/avod" },
    subtitles: subtitles
  });
}`
});

// 3. FILM4K
window.VAX_BUILTIN_PLUGINS.push({
  id: "film4k",
  name: "Film4K",
  code: String.raw`var SITE = "https://film4k.pl";
var BASEURL = "https://film4k.pl";
var API = SITE + "/api";
var UA = "Mozilla/5.0 (Linux; Android 13; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "Referer": SITE + "/",
    "Origin": SITE
};
var PT_TOKEN = "";
var PT_EXP = 0;

function getManifest() {
    return JSON.stringify({
        "id": "film4k",
        "name": "Film4K",
        "version": "2.1",
        "author": "alokillgtv",
        "description": "Nguồn phim 4K & 1080p chất lượng cao từ Film4K",
        "baseUrl": SITE,
        "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/film4k.png",
        "isEnabled": true,
        "type": "MOVIE",
        "playerType": "exoplayer"
    });
}

function fix(u) {
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http") === 0) return u;
    if (u.indexOf("/") === 0) return SITE + u;
    return SITE + "/" + u;
}
function pad2(n) { n = parseInt(n, 10) || 0; return n < 10 ? "0" + n : String(n); }
function encB64(s) { return BASE64.encode(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decB64(s) { return BASE64.decode(s); }

function req(url, method, headers) {
    var h = Object.assign({}, HEADERS, headers || {});
    var res = httpRequest(url, { method: method || "GET", headers: h });
    return res && res.body ? String(res.body) : "";
}
function getJSON(url) { try { return JSON.parse(req(url)); } catch (e) { return null; } }

function getTicket() {
    if (PT_TOKEN && Date.now() < PT_EXP) return PT_TOKEN;
    try {
        var r1 = httpRequest(API + "/play-ticket", { method: "POST", headers: HEADERS, body: "{}" });
        var j1 = JSON.parse((r1 && r1.body) ? String(r1.body) : "{}");
        if (j1 && j1.token) {
            PT_TOKEN = j1.token;
            PT_EXP = Date.now() + ((j1.expiresIn || 300) * 1000);
            return PT_TOKEN;
        }
    } catch (e) {}
    return "";
}

function getHomeSections() {
    return JSON.stringify([
        { "slug": "/movie", "title": "Phim Lẻ", "type": "Horizontal" },
        { "slug": "/tv", "title": "Phim Bộ", "type": "Horizontal" },
        { "slug": "/home", "title": "Phim Mới", "type": "Grid" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { slug: "/?browse=1", name: "Tất cả" },
        { slug: "/?genre=Phim+H%C3%A0nh+%C4%90%E1%BB%99ng&browse=1", name: "Hành Động" },
        { slug: "/?genre=Phim+Khoa+H%E1%BB%8Dc+Vi%E1%BB%85n+T%C6%B0%E1%BB%9Fng&browse=1", name: "Viễn Tưởng" },
        { slug: "/?genre=Phim+Kinh+D%E1%BB%8B&browse=1", name: "Kinh Dị" },
        { slug: "/?genre=Phim+Ho%E1%BA%A1t+H%C3%ACnh&browse=1", name: "Hoạt Hình" },
        { slug: "/?genre=Phim+H%C3%A0i&browse=1", name: "Hài Hước" },
        { slug: "/?genre=Phim+L%C3%A3ng+M%E1%BA%A1n&browse=1", name: "Lãng Mạn" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    var page = 1;
    if (filtersJson) {
        try {
            var f = JSON.parse(filtersJson);
            page = parseInt(f.page) || 1;
        } catch (e) {}
    }
    var s = slug || "/home";
    if (s.indexOf("/") !== 0) s = "/" + s;
    var url = API + "/home";
    var parts = [];
    if (s.indexOf("/?") === 0) {
        var qs = s.substring(2);
        if (qs) parts.push(qs);
    } else if (s === "/movie") parts.push("type=movie");
    else if (s === "/tv") parts.push("type=tv");
    if (page > 1) parts.push("page=" + page);
    if (parts.length) url += "?" + parts.join("&");
    return url;
}

function itemToCard(it) {
    var title = (it.title && (it.title.vi || it.title.en)) || "";
    var poster = (it.poster && (it.poster.vi || it.poster.en)) || it.backdrop || "";
    var isTv = it.mediaType === "tv";
    return {
        "id": SITE + "/api/title/" + it.slug,
        "title": title,
        "quality": it.maxRes || (it.epTotal ? (it.epTotal + " tập") : "4K"),
        "episode_current": isTv ? "Phim Bộ" : "Phim Lẻ",
        "posterUrl": poster,
        "backdropUrl": it.backdrop || poster,
        "year": it.year ? String(it.year) : "",
        "lang": (it.country && (it.country.vi || it.country.en)) || "Vietsub"
    };
}

function parseListResponse(html, url) {
    try {
        var j = JSON.parse(html);
        var list = (j && j.list) ? j.list : [];
        var items = [];
        for (var i = 0; i < list.length; i++) items.push(itemToCard(list[i]));
        var total = j && j.total ? j.total : items.length;
        return JSON.stringify({
            "items": items,
            "pagination": { "currentPage": (j && j.page) || 1, "totalPages": Math.max(1, Math.ceil(total / 60)) }
        });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function getUrlDetail(slug) {
    if (slug && slug.indexOf("http") === 0) {
        var i = slug.indexOf("|data:");
        return i !== -1 ? slug.slice(0, i) : slug;
    }
    return "";
}

function parseMovieDetail(html, url) {
    try {
        var j = JSON.parse(html);
        var m = j.movie || {};
        var title = (m.title && (m.title.vi || m.title.en)) || "";
        var description = (m.overview && (m.overview.vi || m.overview.en)) || "";
        var poster = (m.poster && (m.poster.vi || m.poster.en)) || m.backdrop || "";
        var eps = j.episodes || [];
        var _slugMatch = String(url || "").match(/\/title\/([^?#]+)/);
        var _slug = _slugMatch ? _slugMatch[1] : (m.slug || "");

        var epItems = [];
        var multiSeason = false;
        for (var s = 0; s < eps.length; s++) if ((eps[s].season || 1) > 1) multiSeason = true;

        for (var k = 0; k < eps.length; k++) {
            var e = eps[k];
            var src = (e.sources && e.sources[0] && e.sources[0].url) ? e.sources[0].url : "";
            if (!src) continue;
            var name = eps.length > 1 ? (multiSeason ? ("S" + pad2(e.season) + "E" + pad2(e.episode)) : ("Tập " + e.episode)) : "Xem Ngay";
            var link = "https://example.com?url=" + encB64(src) + "&slug=" + encodeURIComponent(_slug) + "&season=" + (e.season || 1) + "&ep=" + (e.episode || 1);
            epItems.push({ id: link, name: name, slug: "tap-" + (k + 1), ids: [{ name: "Server 1", url: link }] });
        }
        if (!epItems.length && m.hlsUrl) {
            var link2 = "https://example.com?url=" + encB64(m.hlsUrl) + "&slug=" + encodeURIComponent(_slug) + "&season=1&ep=1";
            epItems.push({ id: link2, name: "Xem Ngay", slug: "tap-1", ids: [{ name: "Server 1", url: link2 }] });
        }

        return JSON.stringify({
            id: url,
            title: title,
            originName: (m.title && m.title.en) || "",
            posterUrl: poster,
            backdropUrl: m.backdrop || poster,
            description: description,
            quality: m.maxRes || "4K",
            year: m.year ? String(m.year) : "",
            rating: m.score ? String(m.score) : "",
            status: m.epTotal ? (m.epTotal + " tập") : "",
            category: (m.genres && m.genres.vi) ? m.genres.vi.join(", ") : "",
            servers: [{ name: "Film4K Server", episodes: epItems }],
            country: (m.country && m.country.vi) || ""
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Lỗi", description: String(e), servers: [] });
    }
}

function parseDetailResponse(html, url) {
    try {
        var mUrl = url.match(/[?&]url=([^&]+)/);
        var hlsPath = mUrl ? decB64(mUrl[1]) : "";
        var stream = fix(hlsPath);
        var mSlug = url.match(/[?&]slug=([^&]+)/);
        var mSeason = url.match(/[?&]season=([^&]+)/);
        var mEp = url.match(/[?&]ep=([^&]+)/);

        if (mSlug && mSlug[1]) {
            var slug = decodeURIComponent(mSlug[1]);
            var targetSeason = mSeason ? parseInt(mSeason[1]) || 1 : 1;
            var targetEp = mEp ? parseInt(mEp[1]) || 1 : 1;
            var freshJson = getJSON(API + "/title/" + slug);
            if (freshJson && freshJson.episodes) {
                for (var i = 0; i < freshJson.episodes.length; i++) {
                    var fe = freshJson.episodes[i];
                    if ((fe.season || 1) === targetSeason && (fe.episode || 1) === targetEp) {
                        var freshSrc = (fe.sources && fe.sources[0] && fe.sources[0].url) ? fe.sources[0].url : "";
                        if (freshSrc) stream = fix(freshSrc);
                        break;
                    }
                }
            }
        }
        var token = getTicket();
        return JSON.stringify({
            url: stream,
            mimeType: "application/x-mpegURL",
            isEmbed: false,
            headers: { "User-Agent": UA, "Referer": SITE + "/", "Origin": SITE, "X-F4K-PT": token || "" },
            subtitles: []
        });
    } catch (e) {
        return JSON.stringify({ url: "", mimeType: "video/mp4", isEmbed: false, headers: {}, subtitles: [] });
    }
}

function getUrlSearch(keyword) { return API + "/search/suggest?q=" + encodeURIComponent(keyword); }
function parseSearchResponse(html, url) { return parseListResponse(html, url); }`
});

// 4. HHPANDA
window.VAX_BUILTIN_PLUGINS.push({
  id: "hhpanda",
  name: "HHPanda [ANIME]",
  code: String.raw`var iddomain = "hhpanda";
var BASEURL = "https://hhpanda.st";
var BASELINK = BASEURL;

function getManifest() {
    return JSON.stringify({
      "id": "hhpanda",
      "name": "HHPanda [ANIME]",
      "description": "Hoạt hình 3D Trung Quốc & Anime cập nhật nhanh.",
      "version": "2.3",
      "baseUrl": BASEURL,
      "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/icon/hhpanda.png",
      "isEnabled": true,
      "type": "ANIME",
      "playerType": "exoplayer"
    });
}

function getHomeSections() {
    return JSON.stringify([
       { "slug": "/hoan-thanh", "title": "Phim Hoàn Thành", "type": "Horizontal" },
       { "slug": "/most-viewed", "title": "Phim Xem Nhiều", "type": "Horizontal" },
       { "slug": "/the-loai/tu-tien", "title": "Tu Tiên", "type": "Horizontal" },
       { "slug": "/the-loai/do-thi", "title": "Đô thị", "type": "Horizontal" },
       { "slug": "/moi-cap-nhat/", "title": "Phim Mới", "type": "Grid" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { slug: "/moi-cap-nhat/", name: "Phim Mới" },
        { slug: "/the-loai/tu-tien", name: "Tu Tiên" },
        { slug: "/the-loai/kiem-hiep", name: "Kiếm Hiệp" },
        { slug: "/the-loai/co-trang", name: "Cổ Trang" },
        { slug: "/the-loai/huyen-huyen", name: "Huyền Huyễn" },
        { slug: "/the-loai/khoa-huyen", name: "Khoa Huyễn" },
        { slug: "/the-loai/ky-ao", name: "Kỳ Ảo" },
        { slug: "/the-loai/do-thi", name: "Đô Thị" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    var path = slug || "/moi-cap-nhat/";
    if (filtersJson) {
        try {
            var filters = JSON.parse(filtersJson);
            page = parseInt(filters.page) || 1;
        } catch (e) {}
    }
    var resultUrl = BASEURL + (path.indexOf("/") === 0 ? path : "/" + path);
    if (page > 1) resultUrl += "/page/" + page;
    return resultUrl.replace(/([^:]\/)\/+/g, "$1");
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    if (page > 1) return BASEURL + "/page/" + page + "?s=" + encodeURIComponent(keyword);
    return BASEURL + "?s=" + encodeURIComponent(keyword);
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL + "/" + slug.replace(/^\/+/, "");
}

function fixHref(href) {
    if (!href) return '';
    var cleanHref = href.trim();
    if (/^(#|https?:\/\/|\/\/)/i.test(cleanHref)) {
        return cleanHref.indexOf('//') === 0 ? 'https:' + cleanHref : cleanHref;
    }
    return BASEURL + (cleanHref.indexOf('/') === 0 ? '' : '/') + cleanHref;
}

function parseListResponse(html, $url) {
    try {
        var items = [];
        var $doc = _$(html);
        $doc.find("article").each(function() {
            var href = fixHref(this.find("a").attr("href"));
            var title = this.find("a").attr("title") || this.find("h2, .entry-title").text();
            var src = fixHref(this.find("img").attr("src") || this.find("img").attr("data-src"));
            var episode_current = this.find(".status").text().trim();
            var quality = this.find(".mc__score").text().trim() || "HD";

            if (href && /^https?:\/\//i.test(href) && title) {
                items.push({
                    "id": href.trim(),
                    "title": title.trim(),
                    "posterUrl": src.replace(/&amp;/g, '&').trim(),
                    "backdropUrl": src.replace(/&amp;/g, '&').trim(),
                    "quality": quality,
                    "episode_current": episode_current
                });
            }
        });
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 999 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
    try {
        var $doc = _$(html);
        var idMatch = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(html) || /<meta\s+property="og:url"\s+content="([^"]+)"/i.exec(html);
        var id = idMatch ? idMatch[1] : (url || "");
        var limg = ($doc.find('meta[property="og:image"]').attr("content") || "");
        if (limg.indexOf("//") === 0) limg = "https:" + limg;
        else if (limg && limg.indexOf("http") === -1) limg = BASEURL + limg;

        var lname = $doc.find('meta[property="og:title"]').attr("content") || $doc.find("h1").text() || "HHPanda";
        var ldes = $doc.find(".video-item article").text() || $doc.find('meta[property="og:description"]').attr("content") || "";
        var episode_current = $doc.find("span.new-ep").text();

        var servers = [];
        $doc.find("#halim-list-server .halim-server").each(function() {
            var $namesv = this.find(".halim-server-name").text() || "Server";
            var items = [];
            this.find(".halim-list-eps a").each(function() {
                var epHref = fixHref(this.attr("href"));
                var epName = this.attr("title") || this.text();
                var epSlug = this.attr("data-ep") || epName;
                if (epHref) items.push({ id: epHref, name: epName, slug: epSlug });
            });
            if (items.length) servers.push({ name: $namesv, episodes: items });
        });

        return JSON.stringify({
            id: id,
            title: lname,
            posterUrl: limg,
            backdropUrl: limg,
            description: ldes,
            quality: "HD",
            year: 2026,
            episode_current: episode_current,
            servers: servers
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, pageUrl, datasend) {
    try {
        var $doc = _$(html);
        var currentlink = $doc.find("meta[property='og:url']").attr("content") || pageUrl;
        var matchC = currentlink.match(/sv(\d+)/i);
        var currentserver = (matchC && matchC[1]) ? matchC[1] : 1;
        var matchA = currentlink.match(/(tap-\d+)/i);
        var currenttap = (matchA && matchA[1]) ? matchA[1] : (currentlink.indexOf("-full") > -1 ? "tap-full" : 1);
        var currentid = $doc.find("#main-contents").attr("data-id") || $doc.find("[data-id]").attr("data-id");
        var typecurrent = $doc.find("#halim-ajax-list-server span:first").attr("data-type") || "pro";

        var candidateTypes = [typecurrent, "pro", "tiktik", "vip4k", "vip4kv2"];
        for (var ti = 0; ti < candidateTypes.length; ti++) {
            var curType = candidateTypes[ti];
            var testPlayerUrl = BASEURL + "/player/player.php?action=dox_ajax_player&post_id=" + currentid + "&chapter_st=" + currenttap + "&type=" + curType + "&sv=" + currentserver;
            var resPlayer = httpRequest(testPlayerUrl, { method: "GET", headers: { "Referer": pageUrl } });
            if (resPlayer && resPlayer.isSuccessful && resPlayer.body) {
                var pbody = resPlayer.body;
                var m3u8m = pbody.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8)(?:\?[^\s"'<>]*)?)/i) || pbody.match(/"file"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i);
                if (m3u8m && m3u8m[1]) {
                    var direct = m3u8m[1].replace(/\\/g, "");
                    return JSON.stringify({
                        url: direct,
                        isEmbed: false,
                        mimeType: direct.indexOf(".m3u8") !== -1 ? "application/x-mpegURL" : "video/mp4",
                        headers: { "Referer": BASEURL + "/" },
                        subtitles: []
                    });
                }
            }
        }
        var framelink = BASEURL + "/player/player.php?action=dox_ajax_player&post_id=" + currentid + "&chapter_st=" + currenttap + "&type=" + typecurrent + "&sv=" + currentserver;
        return JSON.stringify({ url: framelink, isEmbed: true, headers: { "Referer": pageUrl }, subtitles: [] });
    } catch (e) {
        return JSON.stringify({ url: "", isEmbed: false, headers: {}, subtitles: [] });
    }
}`
});

// 5. CITYPHIM
window.VAX_BUILTIN_PLUGINS.push({
  id: "cityphim",
  name: "City Phim",
  code: String.raw`var iddomain = "cityphim";
var BASEURL = "https://chill.phim.city/";
var BASELINK = BASEURL;

function getManifest() {
    return JSON.stringify({
      "id": "cityphim",
      "name": "City Phim [MOVIE]",
      "version": "1.0",
      "author": "Alokillgtv",
      "description": "Nguồn phim đa server 123Embed kết hợp TMDB Metadata.",
      "baseUrl": BASEURL,
      "headers": { "X-VAX-YB": "deo_co_gi_de_coi" },
      "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/cityphim.png",
      "isEnabled": true,
      "type": "MOVIE",
      "playerType": "exoplayer"
    });
}

function getFlink(link) {
    if (link && link.indexOf("http") == -1) return BASEURL.replace(/\/+$/, "") + "/" + link.replace(/^\/+/, "");
    return link;
}

function getHomeSections() {
    return JSON.stringify([
        {"slug": "/top-imdb","title": "Top Đầu","type": "Horizontal"},
        {"slug": "/phim-le","title": "Phim Lẻ","type": "Horizontal"},
        {"slug": "/phim-bo","title": "Phim Bộ","type": "Horizontal"},
        {"slug": "/xu-huong","title": "Xu Hướng","type": "Horizontal"},
        {"slug": "/duyet-phim","title": "Phim Mới","type": "Grid"}
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        {"slug": "/the-loai/hanh-dong", "name": "Hành Động"},
        {"slug": "/the-loai/tinh-cam", "name": "Tình Cảm"},
        {"slug": "/the-loai/hai-huoc", "name": "Hài Hước"},
        {"slug": "/the-loai/co-trang", "name": "Cổ Trang"},
        {"slug": "/the-loai/tam-ly", "name": "Tâm Lý"},
        {"slug": "/the-loai/hinh-su", "name": "Hình Sự"},
        {"slug": "/the-loai/vien-tuong", "name": "Viễn Tưởng"},
        {"slug": "/the-loai/kinh-di", "name": "Kinh Dị"},
        {"slug": "/the-loai/hoat-hinh", "name": "Hoạt Hình"}
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var path = slug || "/duyet-phim";
    var resultUrl = BASELINK.replace(/\/+$/, "") + (path.indexOf("/") === 0 ? path : "/" + path);
    var prefix = resultUrl.indexOf("?") > -1 ? "&" : "?";
    return resultUrl + prefix + "page=" + page;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var enc = encodeURIComponent(keyword || "");
    return BASELINK.replace(/\/+$/, "") + "/tim-kiem/" + enc + "?search=" + enc + "&page=" + page;
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL.replace(/\/+$/, "") + "/" + slug.replace(/^\/+/, "");
}

function parseListResponse(html, url) {
    try {
        var $doc = _$(html);
        var items = [];
        $doc.find(".custom-container .grid .relative").each(function() {
            var id = getFlink(this.find("a").attr("href"));
            var title = this.find("img").attr("alt") || this.find("a").text();
            var poster = getFlink(this.find("img").attr("src"));
            var quality = this.find("span:first").text() || "HD";
            var episode_current = this.find(".pt-4 span:eq(3)").text();
            if (title && id && id.indexOf("http") > -1) {
                items.push({
                    "id": id,
                    "title": title,
                    "quality": quality,
                    "episode_current": episode_current,
                    "posterUrl": poster,
                    "backdropUrl": poster,
                    "lang": "Vietsub"
                });
            }
        });
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 999 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
    try {
        var detailUrl = url.split("|")[0];
        var iframePageUrl = detailUrl;
        if (detailUrl.indexOf('/phim-bo/') > -1) {
            var slug = detailUrl.split('/phim-bo/')[1];
            if (slug) iframePageUrl = "https://chill.phim.city/tap-phim/" + slug + "/1-1";
        }
        var pageHtml = html;
        if (iframePageUrl !== detailUrl || !pageHtml) {
            var fetchRes = httpRequest(iframePageUrl, { headers: { "X-VAX-YB": "deo_co_gi_de_coi" } });
            if (fetchRes && fetchRes.body) pageHtml = fetchRes.body;
        }
        var iframeMatch = pageHtml.match(/<iframe[^>]+src="([^"]*play\.123embed\.net[^"]*)"/i) ||
                          pageHtml.match(/(https:\/\/play\.123embed\.net\/[^\s"']+)/i);
        if (!iframeMatch || !iframeMatch[1]) {
            return JSON.stringify({ id: detailUrl, title: "Không có nguồn phát", servers: [] });
        }
        var embedUrl = iframeMatch[1];
        return JSON.stringify({
            id: detailUrl,
            title: _$(pageHtml).find("h1").text() || "City Phim",
            posterUrl: _$(pageHtml).find('meta[property="og:image"]').attr("content") || "",
            description: _$(pageHtml).find('meta[property="og:description"]').attr("content") || "",
            servers: [{
                name: "123Embed",
                episodes: [{ id: embedUrl, name: "Xem Ngay", slug: "full" }]
            }]
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    var cleanUrl = url.split("|")[0];
    return JSON.stringify({ url: cleanUrl, isEmbed: true, headers: { "Referer": "https://play.123embed.net/" }, subtitles: [] });
}`
});

// 6. HOẠT HÌNH 1 (TUTIEN)
window.VAX_BUILTIN_PLUGINS.push({
  id: "hoathinh1",
  name: "Hoạt Hình 1 [ANIME]",
  code: String.raw`var BASE = "https://tutien.com.vn";
var API = "https://api.tutien.com.vn";
var IMG = "https://img.tutien.com.vn";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var PAGE_SIZE = 30;

var GENRES = [
  { slug: "co-trang", name: "Cổ Trang" },
  { slug: "tien-hiep", name: "Tiên Hiệp" },
  { slug: "kiem-hiep", name: "Kiếm Hiệp" },
  { slug: "huyen-huyen", name: "Huyền Huyễn" },
  { slug: "tu-tien", name: "Tu Tiên" },
  { slug: "trung-sinh", name: "Trùng Sinh" },
  { slug: "xuyen-khong", name: "Xuyên Không" },
  { slug: "do-thi", name: "Đô Thị" },
  { slug: "hien-dai", name: "Hiện Đại" },
  { slug: "hai-huoc", name: "Hài Hước" },
  { slug: "linh-di", name: "Linh Dị" }
];

function getManifest() {
  return JSON.stringify({
    id: "hoathinh1",
    name: "Hoạt Hình 1 [ANIME]",
    version: "1.0.4",
    author: "alokillgtv",
    description: "Hoạt hình tiên hiệp, kiếm hiệp Trung Quốc 480p-4K Vietsub",
    BASEURL: API,
    baseUrl: BASE,
    referrer: BASE + "/",
    iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/icon/hoathinh1.png",
    isEnabled: true,
    type: "ANIME",
    playerType: "exoplayer"
  });
}

function getHomeSections() {
  return JSON.stringify([
    { slug: "danh-gia", title: "Đánh Giá Cao", type: "Horizontal" },
    { slug: "xem-nhieu", title: "Xem Nhiều Tuần", type: "Horizontal" },
    { slug: "moi-cap-nhat", title: "Mới Cập Nhật", type: "Grid" }
  ]);
}

function getPrimaryCategories() {
  var out = [{ slug: "all", name: "Tất cả" }];
  for (var i = 0; i < GENRES.length; i++) out.push({ slug: GENRES[i].slug, name: GENRES[i].name });
  return JSON.stringify(out);
}

function getFilterConfig() { return JSON.stringify({}); }

function absImg(p) {
  if (!p) return "";
  p = String(p);
  if (/^https?:\/\//i.test(p)) return p;
  return IMG + (p.charAt(0) === "/" ? p : "/" + p);
}

function genreOf(x) {
  var s = String(x || "").toLowerCase();
  for (var i = 0; i < GENRES.length; i++) {
    if (GENRES[i].slug === s || GENRES[i].name.toLowerCase() === s) return GENRES[i].name;
  }
  return "";
}

function movieItem(m) {
  if (!m || !m.slug) return null;
  var ep = m.episodeCount ? ("Tập " + m.episodeCount) : (m.complete ? "Full" : "Đang chiếu");
  return {
    id: m.slug,
    title: m.title || "",
    posterUrl: absImg(m.thumbnailUrl1 || m.thumbnailUrl2),
    backdropUrl: absImg(m.thumbnailUrl2 || m.thumbnailUrl1),
    description: m.genre || "",
    year: m.year || "",
    quality: "4K",
    episode_current: ep,
    lang: "Vietsub"
  };
}

function getUrlList(slug, filtersJson) {
  var page = 1;
  try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
  var s = String(slug || "").split("|")[0];
  if (s === "xem-nhieu") return API + "/rankings/views-weekly?limit=20&offset=" + ((page - 1) * 20) + "|data:rank";
  var sort = s === "danh-gia" ? "rating" : "newest";
  var g = genreOf(s);
  return g
    ? API + "/movies?page=" + page + "&sort=" + sort + "&genre=" + encodeURIComponent(g) + "|data:genre"
    : API + "/movies?page=" + page + "&sort=" + sort + "|data:list";
}

function getUrlSearch(keyword) {
  return API + "/search-movies?q=" + encodeURIComponent(String(keyword || "")) + "|data:search";
}

function getUrlDetail(slug) {
  var s = String(slug || "");
  if (!s) return "";
  if (s.indexOf("http") === 0) return s;
  return API + "/movie/" + encodeURIComponent(s);
}

function parseListResponse(html, apiUrl) {
  var items = [];
  var totalPages = 10;
  try {
    var d = JSON.parse(html);
    var list = Array.isArray(d) ? d : (d && d.data && Array.isArray(d.data.movies) ? d.data.movies : (d && Array.isArray(d.data) ? d.data : []));
    for (var i = 0; i < list.length; i++) {
      var it = movieItem(list[i]);
      if (it) items.push(it);
    }
  } catch (e) {}
  return JSON.stringify({ items: items, pagination: { currentPage: 1, totalPages: totalPages } });
}

function parseSearchResponse(html, apiUrl) { return parseListResponse(html, apiUrl); }

function parseMovieDetail(html, apiUrl) {
  try {
    var d = JSON.parse(html);
    var m = d.data || d.movie || d;
    var eps = (m.episodes || []).slice().sort(function (a, b) {
      return (Number(a.episodeNumber) || 0) - (Number(b.episodeNumber) || 0);
    });
    var list = [];
    for (var i = 0; i < eps.length; i++) {
      var e = eps[i];
      var n = Number(e.episodeNumber) || (i + 1);
      list.push({
        id: API + "/movie/" + encodeURIComponent(m.slug) + "?ep=" + n + "|data:ep=" + n,
        name: "Tập " + n,
        slug: "tap-" + n
      });
    }
    return JSON.stringify({
      id: m.slug,
      title: m.title || "",
      posterUrl: absImg(m.thumbnailUrl1 || m.thumbnailUrl2),
      backdropUrl: absImg(m.thumbnailUrl2 || m.thumbnailUrl1),
      description: m.description || "",
      year: m.year || "",
      rating: m.rating || 0,
      quality: "4K",
      lang: "Vietsub",
      category: m.genre || "",
      status: m.complete ? "Hoàn thành" : "Đang chiếu",
      duration: (m.episodeCount || list.length) + " tập",
      servers: [{ name: "Vietsub", episodes: list }]
    });
  } catch (e) {
    return JSON.stringify({ id: "", title: "", servers: [] });
  }
}

function parseDetailResponse(html, apiUrl, datasend) {
  try {
    var d = JSON.parse(html);
    var m = d.data || d.movie || d;
    var match = /ep=(\d+)/.exec(String(datasend || apiUrl || ""));
    var n = match ? parseInt(match[1], 10) : 1;
    var eps = m.episodes || [];
    var e = null;
    for (var i = 0; i < eps.length; i++) {
      if (Number(eps[i].episodeNumber) === n) { e = eps[i]; break; }
    }
    if (!e && eps.length) e = eps[0];
    var url = e ? (e.m3u8Url2 || e.m3u8Url) : "";
    var out = {
      url: String(url || ""),
      mimeType: "application/x-mpegURL",
      isEmbed: false,
      headers: { "User-Agent": UA, "Referer": BASE + "/" },
      subtitles: []
    };
    if (e && e.subtitle) out.subtitles.push({ lang: "Vietsub", url: /^https?:\/\//i.test(e.subtitle) ? e.subtitle : BASE + "/" + e.subtitle.replace(/^\/+/, "") });
    var sk = [];
    var intro = Number(e && e.introEndTime) || 0;
    var outro = Number(e && e.outroStartTime) || 0;
    if (intro > 0 && intro < 300) sk.push({ start: 0, end: intro, type: "intro" });
    if (outro > 0) sk.push({ start: outro, end: outro + 600, type: "outro" });
    if (sk.length) out.skipTimes = sk;
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ url: "", isEmbed: false, headers: {}, subtitles: [] });
  }
}`
});

// 7. FREEREELS
window.VAX_BUILTIN_PLUGINS.push({
  id: "freereels",
  name: "FreeReels [SHORT]",
  code: String.raw`var FR_BASE = "https://free-reels.com";
var FR_API = "https://apiv2.free-reels.com/frv2-api";
var FR_SECRET = "8IAcbWyCsVhYv82S2eofRqK1DF3nNDAv";
var FR_APP = "com.freereels.app";
var FR_VERSION = "2.2.81";
var FR_UA = "okhttp/4.12.0";
var FR_STATE_KEY = "freereels.state.v2";
var FR_NATIVE = "https://example.com/";
var FR_CURSOR = {};

function frText(v) { return v == null ? "" : String(v).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
function frJson(v, fallback) { try { return JSON.parse(String(v || "")); } catch (e) { return fallback == null ? {} : fallback; } }
function frArray(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
function frFirst(o, keys) { o = o || {}; for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null && o[keys[i]] !== "") return o[keys[i]]; return ""; }

function frMd5(value) {
    var s = unescape(encodeURIComponent(String(value || ""))), bytes = [], i, j;
    for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    var bitLen = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 0; i < 8; i++) bytes.push(i < 4 ? ((bitLen >>> (i * 8)) & 255) : 0);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var shifts = [[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]], k = [], r, q;
    for (i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    function add(a,b,c) { return (a + b + (c || 0)) | 0; }
    function rol(a,n) { return (a << n) | (a >>> (32 - n)); }
    function hex(n) { var z="", v; for (var x=0;x<4;x++) { v=(n >>> (x*8)) & 255; z += (v<16?"0":"") + v.toString(16); } return z; }
    for (i = 0; i < bytes.length; i += 64) {
        var m = [], off = i;
        for (j = 0; j < 16; j++, off += 4) m[j] = bytes[off] | (bytes[off+1]<<8) | (bytes[off+2]<<16) | (bytes[off+3]<<24);
        var a=a0,b=b0,c=c0,d=d0;
        for (j = 0; j < 64; j++) {
            if (j < 16) { q=(b&c)|(~b&d); r=j; }
            else if (j < 32) { q=(d&b)|(~d&c); r=(5*j+1)%16; }
            else if (j < 48) { q=b^c^d; r=(3*j+5)%16; }
            else { q=c^(b|~d); r=(7*j)%16; }
            var tmp=d; d=c; c=b;
            b=add(b, rol(add(a, add(q, m[r], k[j])), shifts[Math.floor(j/16)][j%4])); a=tmp;
        }
        a0=add(a0,a); b0=add(b0,b); c0=add(c0,c); d0=add(d0,d);
    }
    return hex(a0)+hex(b0)+hex(c0)+hex(d0);
}

function frUuid() { var s = ""; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16); return s.slice(0, 8) + "-" + s.slice(8, 12) + "-4" + s.slice(13, 16) + "-8" + s.slice(17, 20) + "-" + s.slice(20); }

function getManifest() {
  return JSON.stringify({
    id: "freereels",
    name: "FreeReels [SHORT]",
    version: "1.0.1",
    author: "alokillgtv",
    description: "Phim ngắn dọc FreeReels Vietsub",
    baseUrl: FR_BASE,
    iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/icon/freeReels.png",
    isEnabled: true,
    type: "MOVIE",
    layoutType: "VERTICAL",
    playerType: "exoplayer"
  });
}

function frInput(mode, data) { return "freereels:" + mode + ":" + encodeURIComponent(JSON.stringify(data || {})); }
function getHomeSections() {
  return JSON.stringify([
    { slug: frInput("hot", {}), title: "Phim Hot", type: "Horizontal" },
    { slug: frInput("foryou", {}), title: "Cho bạn", type: "Grid" }
  ]);
}
function getPrimaryCategories() {
  return JSON.stringify([
    { name: "Cho bạn", slug: frInput("foryou", {}) },
    { name: "Hot", slug: frInput("hot", {}) },
    { name: "Mới nhất", slug: frInput("tab", { tabKey: "505", positionIndex: 10000 }) }
  ]);
}
function getFilterConfig() { return JSON.stringify({}); }
function getUrlList(slug) { return FR_NATIVE + "?fr_mode=" + encodeURIComponent(String(slug || frInput("hot", {}))); }
function getUrlSearch(keyword) { return FR_NATIVE + "?fr_mode=" + encodeURIComponent(frInput("search", { keyword: keyword })); }
function getUrlDetail(slug) { return FR_NATIVE + "?fr_detail=" + encodeURIComponent(slug); }
function parseListResponse() { return JSON.stringify({ items: [], pagination: { currentPage: 1, totalPages: 1 } }); }
function parseSearchResponse() { return parseListResponse(); }
function parseMovieDetail() { return JSON.stringify({ id: "", title: "FreeReels", servers: [] }); }
function parseDetailResponse() { return JSON.stringify({ url: "", isEmbed: false, headers: {}, subtitles: [] }); }`
});
