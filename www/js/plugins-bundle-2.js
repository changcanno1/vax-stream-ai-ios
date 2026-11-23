// =============================================================================
// VAX BUILT-IN PLUGINS BUNDLE (PART 2)
// Bao gồm nguyên bản mã nguồn của các plugin:
// 8. Sài Gòn Phim (Phim4K + PhimAPI/KKPhim Auto-Fallback)
// 9. Onflix (k8s.onflixcdn.com)
// 10. Phim Chill (phimchillhdz.im)
// 11. Phim Fun (phimfun.net)
// 12. PineDrama (TikTok Short Drama)
// 13. Phim Ngắn (phimngan.net)
// 14. Phim Bom (phimbom.us)
// 15. TuTiênTV (tutien.com.vn)
// =============================================================================

window.VAX_BUILTIN_PLUGINS = window.VAX_BUILTIN_PLUGINS || [];

// 8. SÀI GÒN PHIM (Phim4K + PhimAPI / KKPhim) — Nguồn phim Việt & Quốc tế siêu ổn định, mở sẵn CORS
window.VAX_BUILTIN_PLUGINS.push({
  id: "saigonphim",
  name: "Sài Gòn Phim [4K + KKPhim]",
  code: String.raw`var BASEURL = "https://phimapi.com";
var PHIMAPI_BASE = "https://phimapi.com";
var PHIMAPI_HEADERS = {
  "Accept": "application/json, text/plain, */*"
};

function getManifest() {
  return JSON.stringify({
    "id": "saigonphim",
    "name": "Sài Gòn Phim [4K/FHD]",
    "version": "1.5.2",
    "author": "Alokillgtv",
    "description": "Kho phim Lẻ, Phim Bộ, Chiếu Rạp, Hoạt Hình tốc độ cao (Vietsub & Thuyết Minh)",
    "BASEURL": BASEURL,
    "baseUrl": BASEURL,
    "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/saigonphim.png",
    "isEnabled": true,
    "isAdult": false,
    "type": "MOVIE",
    "playerType": "exoplayer"
  });
}

function getHomeSections() {
  return JSON.stringify([
    { "slug": "/v1/api/danh-sach/phim-le", "title": "Phim Lẻ Mới", "type": "Horizontal" },
    { "slug": "/v1/api/danh-sach/phim-bo", "title": "Phim Bộ Đang Hot", "type": "Horizontal" },
    { "slug": "/v1/api/danh-sach/hoat-hinh", "title": "Hoạt Hình & Anime", "type": "Horizontal" },
    { "slug": "/danh-sach/phim-moi-cap-nhat-v3", "title": "Mới Cập Nhật", "type": "Grid" }
  ]);
}

function getPrimaryCategories() {
  return JSON.stringify([
    { "name": "Phim Mới", "slug": "/danh-sach/phim-moi-cap-nhat-v3" },
    { "name": "Phim Lẻ", "slug": "/v1/api/danh-sach/phim-le" },
    { "name": "Phim Bộ", "slug": "/v1/api/danh-sach/phim-bo" },
    { "name": "Hoạt Hình", "slug": "/v1/api/danh-sach/hoat-hinh" },
    { "name": "TV Shows", "slug": "/v1/api/danh-sach/tv-shows" },
    { "name": "Hành Động", "slug": "/v1/api/the-loai/hanh-dong" },
    { "name": "Cổ Trang", "slug": "/v1/api/the-loai/co-trang" },
    { "name": "Viễn Tưởng", "slug": "/v1/api/the-loai/vien-tuong" },
    { "name": "Kinh Dị", "slug": "/v1/api/the-loai/kinh-di" },
    { "name": "Tình Cảm", "slug": "/v1/api/the-loai/tinh-cam" },
    { "name": "Hài Hước", "slug": "/v1/api/the-loai/hai-huoc" },
    { "name": "Hình Sự", "slug": "/v1/api/the-loai/hinh-su" },
    { "name": "Võ Thuật", "slug": "/v1/api/the-loai/vo-thuat" },
    { "name": "Bí Ẩn", "slug": "/v1/api/the-loai/bi-an" }
  ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function phimApiPoster(path) {
  var s = String(path || "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return "https://phimimg.com/" + s.replace(/^\/+/, "");
}

function getUrlList(slug, filtersJson) {
  var page = 1;
  try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
  var s = String(slug || "/danh-sach/phim-moi-cap-nhat-v3");
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf("phim-moi-cap-nhat") > -1) {
    return PHIMAPI_BASE + "/danh-sach/phim-moi-cap-nhat-v3?page=" + page;
  }
  var sep = s.indexOf("?") > -1 ? "&" : "?";
  return PHIMAPI_BASE + (s.indexOf("/") === 0 ? s : "/" + s) + sep + "page=" + page + "&limit=24";
}

function getUrlSearch(keyword, filtersJson) {
  var page = 1;
  try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
  return PHIMAPI_BASE + "/v1/api/tim-kiem?keyword=" + encodeURIComponent(keyword || "") + "&limit=24&page=" + page;
}

function getUrlDetail(slug) {
  if (!slug) return "";
  if (/^https?:\/\//i.test(slug)) return slug;
  return PHIMAPI_BASE + "/phim/" + encodeURIComponent(String(slug).replace(/^\/+/, ""));
}

function phimApiRawItems(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.items)) return json.items;
  if (json.data) {
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.data.items)) return json.data.items;
  }
  return [];
}

function parseListResponse(html, sourceUrl) {
  try {
    var json = JSON.parse(html);
    var raw = phimApiRawItems(json);
    var items = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (!item || !item.slug) continue;
      items.push({
        id: PHIMAPI_BASE + "/phim/" + encodeURIComponent(item.slug),
        title: String(item.name || item.origin_name || "").trim(),
        posterUrl: phimApiPoster(item.poster_url || item.thumb_url),
        backdropUrl: phimApiPoster(item.thumb_url || item.poster_url),
        year: item.year || "",
        quality: item.quality || "FHD",
        episode_current: item.episode_current || "Full",
        lang: item.lang || "Vietsub"
      });
    }
    var p = (json && json.pagination) || (json && json.data && json.data.params && json.data.params.pagination) || {};
    var curPage = parseInt(p.currentPage, 10) || 1;
    var totalPages = parseInt(p.totalPages, 10) || 100;
    return JSON.stringify({
      items: items,
      pagination: { currentPage: curPage, totalPages: totalPages }
    });
  } catch (e) {
    return JSON.stringify({ items: [], pagination: { currentPage: 1, totalPages: 1 } });
  }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
  try {
    var json = JSON.parse(html);
    var movie = json.movie || (json.data && json.data.item) || {};
    var episodes = json.episodes || movie.episodes || [];
    var servers = [];
    for (var i = 0; i < episodes.length; i++) {
      var server = episodes[i] || {};
      var rows = server.server_data || [];
      var list = [];
      for (var j = 0; j < rows.length; j++) {
        var ep = rows[j] || {};
        var link = ep.link_m3u8 || ep.link_embed || "";
        if (!link) continue;
        var ids = [];
        if (ep.link_m3u8) ids.push({ name: "HLS M3U8 (Mượt)", url: ep.link_m3u8 });
        if (ep.link_embed) ids.push({ name: "Embed Player", url: ep.link_embed });
        list.push({
          name: ep.name || ("Tập " + (list.length + 1)),
          slug: ep.slug || ("tap-" + (list.length + 1)),
          id: link,
          ids: ids
        });
      }
      if (list.length) servers.push({ name: server.server_name || ("Server " + (i + 1)), episodes: list });
    }
    var category = Array.isArray(movie.category) ? movie.category.map(function (c) { return c.name; }).join(", ") : "";
    var country = Array.isArray(movie.country) ? movie.country.map(function (c) { return c.name; }).join(", ") : "";
    var director = Array.isArray(movie.director) ? movie.director.join(", ") : (movie.director || "");
    var casts = Array.isArray(movie.actor) ? movie.actor.join(", ") : (movie.actor || "");
    var rating = (movie.tmdb && movie.tmdb.vote_average) ? String(movie.tmdb.vote_average) : "";
    return JSON.stringify({
      id: url,
      title: movie.name || "",
      originName: movie.origin_name || "",
      posterUrl: phimApiPoster(movie.poster_url || movie.thumb_url),
      backdropUrl: phimApiPoster(movie.thumb_url || movie.poster_url),
      description: String(movie.content || "").replace(/<[^>]*>/g, ""),
      quality: movie.quality || "FHD",
      year: movie.year || "",
      rating: rating,
      status: movie.status || "",
      category: category,
      episode_current: movie.episode_current || "",
      servers: servers,
      duration: movie.time || "",
      casts: casts,
      director: director,
      country: country,
      lang: movie.lang || "Vietsub"
    });
  } catch (e) {
    return JSON.stringify({ id: url, title: "Lỗi tải phim", servers: [] });
  }
}

function getStreamLink(slug) {
  var link = String(slug || "").split("|")[0];
  var isM3u8 = /\.m3u8(\?|$)/i.test(link);
  var isMp4 = /\.mp4(\?|$)/i.test(link);
  var isDirect = isM3u8 || isMp4;
  return JSON.stringify({
    url: link,
    mimeType: isM3u8 ? "application/x-mpegURL" : (isMp4 ? "video/mp4" : ""),
    isEmbed: !isDirect,
    skipTimes: isM3u8 ? [{ start: 890, end: 935, type: "ad" }] : [],
    headers: { "Referer": "https://phimapi.com/" },
    subtitles: []
  });
}

function parseDetailResponse(html, url) { return getStreamLink(url); }`
});

// 9. ONFLIX
window.VAX_BUILTIN_PLUGINS.push({
  id: "onflix",
  name: "Onflix",
  code: String.raw`var BASEURL = "https://onflix.lat";
var BASEAPI = "https://k8s.onflixcdn.com/api";

function getManifest() {
	return JSON.stringify({
		"id": "onflix",
		"name": "Onflix",
		"description": "Phim chiếu rạp, phim bộ, phim lẻ cập nhật liên tục từ Onflix CDN.",
		"version": "2.1",
		"baseUrl": BASEURL,
		"iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/icon/onflix.png",
		"isEnabled": true,
		"type": "MOVIE",
		"author": "Alokillgtv",
		"playerType": "auto"
	});
}

function getHomeSections() {
    return JSON.stringify([
        { "slug": "/movies?type=chieu_rap&sort=newest&limit=24", "title": "Phim Chiếu Rạp", "type": "Horizontal" },
        { "slug": "/movies?type=phim-bo&sort=newest&limit=24", "title": "Phim Bộ", "type": "Horizontal" },
        { "slug": "/movies?type=phim-le&sort=newest&limit=24", "title": "Phim Lẻ", "type": "Horizontal" },
        { "slug": "/movies?sort=newest&limit=24", "title": "Phim Mới", "type": "Grid" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { "slug": "/themes/de-xuat-cho-ban", "name": "Đề Xuất" },
        { "slug": "/themes/dang-chieu-phat", "name": "Đang Chiếu" },
        { "slug": "/movies?sort=year_desc&limit=24&category=hanh-dong", "name": "Hành Động" },
        { "slug": "/movies?sort=year_desc&limit=24&category=co-trang", "name": "Cổ Trang" },
        { "slug": "/movies?sort=year_desc&limit=24&category=kinh-di", "name": "Kinh Dị" },
        { "slug": "/movies?sort=year_desc&limit=24&category=tinh-cam", "name": "Tình Cảm" },
        { "slug": "/movies?sort=year_desc&limit=24&category=hai-huoc", "name": "Hài Hước" },
        { "slug": "/movies?sort=year_desc&limit=24&category=vien-tuong", "name": "Viễn Tưởng" },
        { "slug": "/movies?sort=year_desc&limit=24&category=hoat-hinh", "name": "Hoạt Hình" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var path = slug || "/movies?sort=newest&limit=24";
    if (path.indexOf("http") === 0) return path;
    if (path.indexOf("/") !== 0) path = "/" + path;
    var resultUrl = BASEAPI + path;
    if (page > 1 && resultUrl.indexOf("page=") === -1) {
        resultUrl += (resultUrl.indexOf("?") > -1 ? "&" : "?") + "page=" + page;
    }
    return resultUrl;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    return BASEAPI + "/search?q=" + encodeURIComponent(keyword || "") + "&page=" + page;
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL + "/phim/" + slug.replace(/^\/+/, "");
}

function parseListResponse(html) {
    try {
        var videoData = typeof html === "string" ? JSON.parse(html) : html;
        var rawList = Array.isArray(videoData.movies) ? videoData.movies : (Array.isArray(videoData.data) ? videoData.data : (videoData.data && Array.isArray(videoData.data.items) ? videoData.data.items : []));
        var items = [];
        for (var j = 0; j < rawList.length; j++) {
            var block = rawList[j];
            var poster = (block.poster_url || "").replace("https://img.ophim.live", "https://ophim1.com");
            var backdrop = (block.thumb_url || poster).replace("https://img.ophim.live", "https://ophim1.com");
            items.push({
                "id": BASEURL + "/phim/" + (block.slug || ""),
                "title": (block.title || block.name || "").trim(),
                "posterUrl": poster,
                "backdropUrl": backdrop,
                "year": block.year || "",
                "quality": block.quality || "HD",
                "episode_current": block.episode_current || "",
                "lang": block.lang || "Vietsub"
            });
        }
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 50 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html) { return parseListResponse(html); }

function parseMovieDetail(html, $url) {
    try {
        var m3u8Matches = html.match(/https?:\/\/[^\s"'\\]+\.m3u8/gi) || [];
        var title = _$(html).find("h1").text() || _$(html).find('meta[property="og:title"]').attr("content") || "Onflix";
        var poster = _$(html).find('meta[property="og:image"]').attr("content") || "";
        var desc = _$(html).find('meta[property="og:description"]').attr("content") || "";
        var eps = [];
        var seen = {};
        for (var i = 0; i < m3u8Matches.length; i++) {
            var link = m3u8Matches[i].replace(/\\/g, "");
            if (seen[link]) continue;
            seen[link] = true;
            eps.push({ id: link, name: "Tập " + (eps.length + 1), slug: "tap-" + (eps.length + 1) });
        }
        return JSON.stringify({
            id: $url,
            title: title,
            posterUrl: poster,
            backdropUrl: poster,
            description: desc,
            quality: "FHD",
            servers: [{ name: "Onflix VIP", episodes: eps }]
        });
    } catch (e) {
        return JSON.stringify({ id: $url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    var isM3u8 = /\.m3u8(\?|$)/i.test(url);
    return JSON.stringify({
        url: url,
        mimeType: isM3u8 ? "application/x-mpegURL" : "",
        isEmbed: !isM3u8,
        headers: { "Referer": BASEURL + "/" },
        subtitles: []
    });
}`
});

// 10. PHIM CHILL
window.VAX_BUILTIN_PLUGINS.push({
  id: "phimchill",
  name: "Phim Chill",
  code: String.raw`var iddomain = "phimchill";
var BASEURL = "https://phimchillhdz.im";

function getManifest() {
    return JSON.stringify({
        "id": "phimchill",
        "name": "Phim Chill",
        "description": "Phim chiếu rạp, phim bộ, phim lẻ chất lượng cao từ PhimChill",
        "version": "3.9.8",
        "baseUrl": BASEURL,
        "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/icon/phimchill.png",
        "isEnabled": true,
        "author": "Alokillgtv",
        "type": "MOVIE",
        "playerType": "auto"
    });
}

function getHomeSections() {
    return JSON.stringify([
        { "slug": "danh-sach/phim-chieu-rap.html", "title": "Phim Chiếu Rạp", "type": "Horizontal" },
        { "slug": "danh-sach/phim-bo.html", "title": "Phim Bộ", "type": "Horizontal" },
        { "slug": "danh-sach/phim-le.html", "title": "Phim Lẻ", "type": "Horizontal" },
        { "slug": "danh-sach/phim-moi.html", "title": "Phim Mới", "type": "Grid" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { "slug": "danh-sach/phim-le.html", "name": "Phim Lẻ" },
        { "slug": "danh-sach/phim-bo.html", "name": "Phim Bộ" },
        { "slug": "the-loai/hanh-dong.html", "name": "Hành Động" },
        { "slug": "the-loai/tinh-cam.html", "name": "Tình Cảm" },
        { "slug": "the-loai/kinh-di.html", "name": "Kinh Dị" },
        { "slug": "the-loai/vien-tuong.html", "name": "Viễn Tưởng" },
        { "slug": "the-loai/co-trang.html", "name": "Cổ Trang" },
        { "slug": "the-loai/hai-huoc.html", "name": "Hài Hước" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var url = BASEURL + (slug ? (slug.indexOf("/") === 0 ? slug : "/" + slug) : "/danh-sach/phim-moi.html");
    if (page > 1) url += "?page=" + page;
    return url;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var url = BASEURL + "/?search=" + encodeURIComponent(keyword || "");
    if (page > 1) url += "&page=" + page;
    return url;
}

function getUrlDetail(id) {
    if (!id) return "";
    if (id.indexOf('http') === 0) return id;
    return BASEURL + (id.indexOf("/") === 0 ? id : "/" + id);
}

function parseListResponse(html) {
    try {
        var items = [];
        var pattern = /(?=<article[^>]*class="[^"]*max-w-xs[^"]*")/g;
        var splitItems = html.split(pattern).filter(Boolean);
        for (var j = 1; j < splitItems.length; j++) {
            var block = splitItems[j];
            var hrefMatch = block.match(/href="([^"]+)"/i);
            if (!hrefMatch) continue;
            var id = hrefMatch[1].trim();
            var altMatch = block.match(/title="([^"]+)"/i);
            var title = altMatch ? altMatch[1].trim() : "";
            if (!title) continue;
            var srcMatch = block.match(/img[\s\S]*?src="([^"]+)"/i);
            var posterUrl = srcMatch ? srcMatch[1].trim() : "";
            if (posterUrl && posterUrl.indexOf('http') !== 0) {
                posterUrl = BASEURL + (posterUrl.indexOf('/') === 0 ? '' : '/') + posterUrl;
            }
            items.push({ "id": id, "title": title, "posterUrl": posterUrl, "backdropUrl": posterUrl, "quality": "HD" });
        }
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 50 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html) { return parseListResponse(html); }

function parseMovieDetail(htmlContent, url) {
    try {
        var $doc = _$(htmlContent);
        var lname = $doc.find('meta[property="og:title"]').attr("content") || $doc.find("h1").text() || "PhimChill";
        var limg = $doc.find('meta[property="og:image"]').attr("content") || "";
        var ldes = $doc.find('meta[property="og:description"]').attr("content") || "";
        var servers = [];
        $doc.find('span:content("Danh|Sách")').each(function() {
            var $box = this.next();
            var $nameserver = this.text();
            var $items = [];
            $box.find("a").each(function() {
                var $link = this.attr("href");
                var $number = this.text();
                if ($link) {
                    if ($link.indexOf('http') !== 0) $link = BASEURL + ($link.startsWith('/') ? '' : '/') + $link;
                    $items.push({ id: $link, name: "Tập " + $number.trim(), slug: "tap-" + $number.trim() });
                }
            });
            if ($items.length > 0) servers.push({ name: $nameserver.trim() || "Vietsub", episodes: $items });
        });
        var isPlayPage = /\/tap-[^/]+?\.html$/.test(url);
        var extra = "";
        if (!isPlayPage && !servers.length) {
            extra = $doc.find(".text-center .mx-auto").attr("href") || "";
        }
        return JSON.stringify({
            id: url,
            title: lname,
            posterUrl: limg,
            backdropUrl: limg,
            description: ldes,
            quality: "HD",
            servers: servers,
            extra: extra
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    var $doc = _$(html);
    var streamUrl = $doc.find('a[data-type="m3u8"]').attr("data-link");
    if (streamUrl) {
        return JSON.stringify({ url: streamUrl, isEmbed: false, mimeType: "application/x-mpegURL", headers: { "Referer": BASEURL }, subtitles: [] });
    }
    var embed = $doc.find('a[data-type="embed"]').attr("data-link") || url;
    return JSON.stringify({ url: embed, isEmbed: true, headers: { "Referer": BASEURL }, subtitles: [] });
}`
});

// 11. PHIM FUN
window.VAX_BUILTIN_PLUGINS.push({
  id: "phimfun",
  name: "Nguồn Phim Fun",
  code: String.raw`var DOMAIN = "https://phimfun.net";
var BASEURL = DOMAIN;

function getManifest() {
    return JSON.stringify({
      "id": "phimfun",
      "name": "Nguồn Phim Fun",
      "description": "Nguồn phim tối ưu giao diện Native Player cho iOS & Android.",
      "version": "1.0.5",
      "baseUrl": DOMAIN,
      "iconUrl": DOMAIN + "/Content/PhimFun/Imgs/phimFun.png",
      "isEnabled": true,
      "type": "MOVIE",
      "playerType": "auto"
    });
}

function getHomeSections() {
    return JSON.stringify([
        { "slug": "/the-loai/phim-cap-nhat-1", "title": "Phim Mới Cập Nhật", "type": "Grid" },
        { "slug": "/the-loai/phim-le-1", "title": "Phim Lẻ", "type": "Horizontal" },
        { "slug": "/the-loai/phim-bo-1", "title": "Phim Bộ", "type": "Horizontal" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        {"slug":"/the-loai/phim-cap-nhat-1","name":"Phim Mới"},
        {"slug":"/the-loai/phim-le-1","name":"Phim Lẻ"},
        {"slug":"/the-loai/phim-bo-1","name":"Phim Bộ"},
        {"slug":"/the-loai/than-thoai-co-trang-1","name":"Cổ trang"},
        {"slug":"/the-loai/hanh-dong-1","name":"Hành động"},
        {"slug":"/the-loai/tam-ly-1","name":"Tâm lý"},
        {"slug":"/the-loai/kinh-di-1","name":"Kinh dị"},
        {"slug":"/the-loai/hai-huoc-1","name":"Hài hước"},
        {"slug":"/the-loai/vien-tuong-1","name":"Viễn tưởng"},
        {"slug":"/the-loai/hoat-hinh-1","name":"Hoạt hình"}
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var path = slug || "/the-loai/phim-cap-nhat-1";
    var resultUrl = BASEURL + path;
    if (page > 1) resultUrl = resultUrl.replace(/(\d+)$/i, "") + page;
    return resultUrl;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    return BASEURL + "/search?k=" + encodeURIComponent(keyword) + (page > 1 ? "&page=" + page : "");
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL + "/" + slug.replace(/^\/+/, "");
}

function fixHref(href) {
    if (!href) return '';
    var c = href.trim();
    if (/^https?:\/\//i.test(c)) return c;
    if (c.indexOf('//') === 0) return 'https:' + c;
    return BASEURL + (c.indexOf('/') === 0 ? '' : '/') + c;
}

function parseListResponse(html) {
    try {
        var items = [];
        _$(html).find(".MovieList li").each(function() {
            var href = fixHref(this.find("a").attr("href")).replace("/phim/", "/xem-phim/");
            var title = this.find("img").attr("alt") || this.find("a").text();
            var src = this.find("img").attr("src");
            if (src && src.indexOf("base64") > -1) src = this.find("img").attr("data-src");
            src = fixHref(src);
            var episode_current = this.find(".mc__ep-badge").text().trim();
            if (href && /^https?:\/\//i.test(href) && title) {
                items.push({
                    "id": href,
                    "title": title.trim(),
                    "posterUrl": src,
                    "backdropUrl": src,
                    "quality": "HD",
                    "episode_current": episode_current
                });
            }
        });
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 99 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
    try {
        var $doc = _$(html);
        var lname = $doc.find("h1").text() || "PhimFun";
        var limg = $doc.find('meta[property="og:image"]').attr("content") || "";
        if (limg && limg.indexOf("http") === -1) limg = BASEURL + limg;
        var ldes = $doc.find("h2:content('Thông tin về phim')").next().text() || $doc.find('meta[property="og:description"]').attr("content") || "";
        var servers = [];
        var items = [];
        $doc.find("#halim-list-server a").each(function() {
            var link = fixHref(this.attr("href"));
            var name = this.attr("title") || this.text();
            if (link) items.push({ id: link, name: name, slug: "tap-" + (items.length + 1) });
        });
        if (items.length) servers.push({ name: "Server 1", episodes: items });
        return JSON.stringify({
            id: url,
            title: lname,
            posterUrl: limg,
            backdropUrl: limg,
            description: ldes,
            quality: "HD",
            servers: servers
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Lỗi tải phim", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    var streamUrl = _$(html).find("#iframeStream").attr("src");
    if (!streamUrl) {
        var m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (m) streamUrl = m[1];
    }
    if (streamUrl && streamUrl.indexOf("//") === 0) streamUrl = "https:" + streamUrl;
    return JSON.stringify({ url: streamUrl || "", isEmbed: true, headers: { "Referer": DOMAIN + "/" }, subtitles: [] });
}`
});

// 12. PINEDRAMA (TikTok Mini Drama)
window.VAX_BUILTIN_PLUGINS.push({
  id: "pinedrama",
  name: "PineDrama [TikTok Short]",
  code: String.raw`var BASEURL = "https://www.tiktok.com";
var API = "https://api-normal.tiktokv.com";
var NATIVE_URL = "https://example.com/";
var UA = "com.ss.android.ttmd.video/47.6.3 (Linux; U; Android 13)";
var COMMON = "aid=1233&app_name=trill&version_code=2024706030&version_name=47.6.3&device_platform=android&os=android&language=vi&app_language=vi&region=VN&sys_region=VN&carrier_region=VN&tz_name=Asia/Ho_Chi_Minh&channel=googleplay&device_brand=google&os_version=13";

function getManifest() {
  return JSON.stringify({
    id: "pinedrama",
    name: "PineDrama [SHORT]",
    version: "1.0.2",
    author: "alokillgtv",
    description: "Phim ngắn PineDrama (TikTok) - tiếng Việt, tự động lấy phụ đề vie-VN",
    BASEURL: BASEURL,
    baseUrl: BASEURL,
    iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/shortflix/pinedrama.jpg",
    isEnabled: true,
    type: "shortfilm",
    layoutType: "VERTICAL",
    playerType: "exoplayer"
  });
}

function getHomeSections() {
  return JSON.stringify([
    { slug: NATIVE_URL + "?pinedrama_cat=t%E1%BB%95ng%20t%C3%A0i", title: "Tổng Tài Bá Đạo", type: "Horizontal" },
    { slug: NATIVE_URL + "?pinedrama_cat=tr%E1%BA%A3%20th%C3%B9", title: "Trọng Sinh & Trả Thù", type: "Horizontal" },
    { slug: NATIVE_URL + "?pinedrama_feed=1", title: "Phim Ngắn Mới", type: "Grid" }
  ]);
}

function getPrimaryCategories() {
  var cats = ["tình cảm", "trả thù", "tổng tài", "ngôn tình", "cổ trang", "huyền huyễn", "gia đình", "học đường"];
  return JSON.stringify(cats.map(function(c) {
    return { slug: NATIVE_URL + "?pinedrama_cat=" + encodeURIComponent(c), name: c.charAt(0).toUpperCase() + c.slice(1) };
  }));
}

function getFilterConfig() { return JSON.stringify({}); }
function getUrlList(slug) { return slug || (NATIVE_URL + "?pinedrama_feed=1"); }
function getUrlSearch(keyword) { return NATIVE_URL + "?pinedrama_search=" + encodeURIComponent(keyword || ""); }
function getUrlDetail(slug) { return slug; }

function searchPine(keyword) {
  var url = API + "/aweme/v1/search/drama/?" + COMMON;
  var body = "keyword=" + encodeURIComponent(keyword || "phim") + "&offset=0&count=20&search_source=drama&enter_from=drama_search&source=drama";
  var res = httpRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: body
  });
  if (!res || !res.body) return [];
  try {
    var data = JSON.parse(res.body);
    var list = data.drama_list || [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var cid = String(item.collection_id_str || item.collection_id || "");
      if (!cid) continue;
      var poster = (item.cover && item.cover.url_list && item.cover.url_list[0]) ? item.cover.url_list[0] : "";
      items.push({
        id: cid,
        title: String(item.title || "PineDrama"),
        posterUrl: poster,
        backdropUrl: poster,
        description: String(item.description || ""),
        quality: "Short",
        episode_current: item.num_videos ? (item.num_videos + " tập") : "Full",
        lang: "Vietsub"
      });
    }
    return items;
  } catch (e) { return []; }
}

function parseListResponse(raw, url) {
  var kw = getparam(url, "pinedrama_cat") || getparam(url, "pinedrama_search") || "phim";
  var items = searchPine(kw);
  return JSON.stringify({ items: items, pagination: { currentPage: 1, totalPages: 5 } });
}
function parseSearchResponse(raw, url) { return parseListResponse(raw, url); }
function parseMovieDetail(html, url) {
  return JSON.stringify({ id: url, title: "PineDrama Collection #" + url, servers: [] });
}
function parseDetailResponse() {
  return JSON.stringify({ url: "", isEmbed: false, headers: {}, subtitles: [] });
}`
});

// 13. PHIM NGẮN (phimngan.net)
window.VAX_BUILTIN_PLUGINS.push({
  id: "phimngan",
  name: "Phim Ngắn [SHORT]",
  code: String.raw`var BASEURL = "https://phimngan.net";

function getManifest() {
    return JSON.stringify({
        "id": "phimngan",
        "name": "Phim Ngắn [SHORT]",
        "version": "2.8",
        "description": "Phim ngắn thuyết minh & Vietsub từ phimngan.net",
        "author": "Alokillgtv",
        "baseUrl": BASEURL,
        "iconUrl": "https://vaxplugin.alokillgtv02.workers.dev/img/phimngan.png",
        "isEnabled": true,
        "type": "shortfilm",
        "playerType": "exoplayer"
    });
}

function getHomeSections() {
    return JSON.stringify([
        { "slug": "/", "title": "Đề Xuất & Mới Cập Nhật", "type": "Grid" },
        { "slug": "/phim-ai", "title": "Phim AI", "type": "Horizontal" }
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { "name": "Ngôn Tình", "slug": "/genres/ngon-tinh" },
        { "name": "Tổng Tài", "slug": "/genres/tong-tai" },
        { "name": "Cổ Trang", "slug": "/genres/co-trang" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var path = (slug || "/").split("|")[0];
    var resultUrl = BASEURL + (path.indexOf("/") === 0 ? path : "/" + path);
    if (page > 1) resultUrl += "?page=" + page;
    return resultUrl;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    return BASEURL + "/search?q=" + encodeURIComponent(keyword || "") + (page > 1 ? "&page=" + page : "");
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL + "/phim/" + String(slug).replace(/^\/+/, "");
}

function parseListResponse(html, $url) {
    try {
        var $doc = _$(html);
        var items = [];
        $doc.find(".grid a[href^='/phim/']").each(function() {
            var href = this.attr("href") || '';
            var title = this.text().trim() || this.attr("title") || "";
            var poster = this.find("img").attr("src") || this.find("img").attr("data-src") || "";
            if (!poster) poster = this.parent().find("img").attr("src") || "";
            if (poster && poster.indexOf("/_next/image") !== -1) {
                var match = poster.match(/[?&]url=([^&]+)/);
                if (match && match[1]) poster = decodeURIComponent(match[1]);
            }
            var id = href.indexOf("http") === 0 ? href : BASEURL + href;
            if (title.length > 1) {
                items.push({
                    "id": id,
                    "title": title,
                    "quality": "HD",
                    "episode_current": "Full",
                    "posterUrl": poster,
                    "backdropUrl": poster,
                    "year": "2026",
                    "lang": "Thuyết Minh"
                });
            }
        });
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 99 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
    try {
        var $doc = _$(html);
        var title = $doc.find("h1").text().trim() || $doc.find("title").text().trim();
        var posterUrl = $doc.find('meta[property="og:image"]').attr("content") || "";
        if (posterUrl && posterUrl.indexOf("/_next/image") !== -1) {
            var match = posterUrl.match(/[?&]url=([^&]+)/);
            if (match && match[1]) posterUrl = decodeURIComponent(match[1]);
        }
        var description = $doc.find('meta[name="description"]').attr("content") || "";
        var slugMatch = url.match(/\/(?:phim|watch)\/([^\/?#]+)/);
        var watchUrl = slugMatch ? (BASEURL + "/watch/" + slugMatch[1]) : url;

        var episodes = [{
            id: watchUrl + "?type=thuyet_minh",
            name: "Xem Ngay",
            slug: "full",
            ids: [
                { name: "Thuyết Minh", url: watchUrl + "?type=thuyet_minh" },
                { name: "Vietsub", url: watchUrl + "?type=vietsub" }
            ]
        }];
        return JSON.stringify({
            id: url,
            title: title,
            posterUrl: posterUrl,
            backdropUrl: posterUrl,
            description: description,
            quality: "HD",
            servers: [{ name: "PhimNgắn Server", episodes: episodes }]
        });
    } catch (e) {
        return JSON.stringify({ id: url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    var $doc = _$(html);
    var type = getparam(url, "type") || "thuyet_minh";
    var idvd = $doc.find("div[data-video-id]:first").attr("data-video-id");
    var stream = idvd ? ("https://api.phimngan.net/api/v1/video/playlist?id=" + idvd + "&audio=" + type) : "";
    return JSON.stringify({
        url: stream,
        mimeType: "application/x-mpegURL",
        isEmbed: false,
        headers: { "Referer": BASEURL + "/", "Origin": BASEURL },
        subtitles: []
    });
}`
});

// 14. PHIM BOM (phimbom.us)
window.VAX_BUILTIN_PLUGINS.push({
  id: "phimbom",
  name: "Phim Bom",
  code: String.raw`var iddomain = "phimbom";
var BASEURL = "https://phimbom.us";
var BASELINK = BASEURL;

function getManifest() {
    return JSON.stringify({
      "id": "phimbom",
      "name": "Phim Bom [MOVIE]",
      "version": "2.3",
      "author": "Alokillgtv",
      "description": "Phim chiếu rạp, phim bộ, phim đề cử từ PhimBom",
      "baseUrl": BASEURL,
      "iconUrl": "https://vaxplugin.alokillgtv.workers.dev/img/icon/phimbom.png",
      "isEnabled": true,
      "type": "MOVIE",
      "playerType": "auto"
    });
}

function getHomeSections() {
    return JSON.stringify([
        {"slug": "/danh-sach/phim-chieu-rap.html","title": "Phim Chiếu Rạp","type": "Horizontal"},
        {"slug": "/danh-sach/phim-de-cu.html","title": "Phim Đề Cử","type": "Horizontal"},
        {"slug": "/danh-sach/phim-le.html","title": "Phim Lẻ","type": "Horizontal"},
        {"slug": "/danh-sach/phim-bo.html","title": "Phim Bộ","type": "Horizontal"},
        {"slug": "/danh-sach/phim-moi.html","title": "Phim Mới","type": "Grid"}
    ]);
}

function getPrimaryCategories() {
    return JSON.stringify([
        { "slug": "/the-loai/phim-hanh-dong.html", "name": "Phim Hành Động" },
        { "slug": "/the-loai/phim-vo-thuat.html", "name": "Phim Võ Thuật" },
        { "slug": "/the-loai/phim-tinh-cam.html", "name": "Phim Tình Cảm" },
        { "slug": "/the-loai/phim-hoat-hinh.html", "name": "Phim Hoạt Hình" },
        { "slug": "/the-loai/phim-ma-kinh-di.html", "name": "Phim Ma Kinh Dị" },
        { "slug": "/the-loai/phim-hai-huoc.html", "name": "Phim Hài Hước" },
        { "slug": "/the-loai/phim-vien-tuong.html", "name": "Phim Viễn Tưởng" },
        { "slug": "/the-loai/phim-co-trang.html", "name": "Phim Cổ Trang" }
    ]);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    if (slug && slug.indexOf("http") > -1) return slug;
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var path = slug || "/danh-sach/phim-moi.html";
    return BASELINK + (path.indexOf("/") === 0 ? path : "/" + path) + "?page=" + page;
}

function getUrlSearch(keyword, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page) || 1; } catch (e) {}
    var clean = String(keyword || "").trim().replace(/\s+/g, "-");
    return BASELINK + "/tim-kiem/" + encodeURIComponent(clean) + ".html?page=" + page;
}

function getUrlDetail(slug) {
    if (!slug) return "";
    if (slug.indexOf('http') === 0) return slug;
    return BASEURL + "/" + slug.replace(/^\/+/, "");
}

function parseListResponse(html) {
    try {
        var $doc = _$(html);
        var items = [];
        $doc.find(".list-item").each(function() {
            var id = this.find("a").attr("href");
            var title = this.find(".vie-name").text();
            var poster = this.find("img").attr("data-src") || this.find("img").attr("src");
            var quality = this.find(".quality").text();
            var episode_current = this.find(".time").text();
            if (title && poster) {
                items.push({
                    "id": id,
                    "title": title,
                    "quality": quality || "HD",
                    "episode_current": episode_current,
                    "posterUrl": poster,
                    "backdropUrl": poster,
                    "lang": this.find(".eng-name").text()
                });
            }
        });
        return JSON.stringify({ "items": items, "pagination": { "currentPage": 1, "totalPages": 99 } });
    } catch (e) {
        return JSON.stringify({ "items": [], "pagination": { "currentPage": 1, "totalPages": 1 } });
    }
}

function parseSearchResponse(html, url) { return parseListResponse(html, url); }

function parseMovieDetail(html, url) {
    try {
        var $doc = _$(html);
        if (url.indexOf("/phim/") > -1) {
            var posterUrl = $doc.find(".left-content img").attr("data-src") || $doc.find(".left-content img").attr("src");
            var title = $doc.find(".left-content img").attr("alt") || $doc.find("h1").text();
            var description = $doc.find(".film-content p").text();
            var extra = $doc.find(".btn.btn-danger").attr("href");
            return JSON.stringify({
                id: url,
                title: title,
                posterUrl: posterUrl,
                backdropUrl: posterUrl,
                description: description,
                quality: $doc.find(".quality").text() || "HD",
                servers: [],
                extra: extra
            });
        } else {
            var servers = [];
            var check = $doc.find(".list_episodes").length;
            $doc.find(".control-box .list-servers .server").each(function() {
                var namesv = this.text().trim() || "Server";
                var targetClass = this.attr("data-name");
                var episodes = [];
                if (check) {
                    $doc.find(".list_episodes." + targetClass + " a").each(function() {
                        var epid = this.attr("data-episode-id");
                        var name = this.text().trim();
                        var href = this.attr("href");
                        episodes.push({ id: href + "?episodeID=" + epid + "&server=1", name: name, slug: "tap-" + name });
                    });
                } else {
                    var epid = $doc.find("#episodeid").attr("value");
                    episodes.push({ id: url + "?episodeID=" + epid + "&server=1", name: "Xem Ngay", slug: "tap-full" });
                }
                if (episodes.length) servers.push({ name: namesv, episodes: episodes });
            });
            return JSON.stringify({ id: url, title: "", servers: servers, extra: "" });
        }
    } catch (e) {
        return JSON.stringify({ id: url, title: "Error", servers: [] });
    }
}

function parseDetailResponse(html, url) {
    return JSON.stringify({ url: url, isEmbed: true, headers: { "Referer": BASEURL }, subtitles: [] });
}`
});

// 15. TUTIÊN TV (CloudStream Port)
window.VAX_BUILTIN_PLUGINS.push({
  id: "tutientv",
  name: "TuTiênTV",
  code: String.raw`var TT_SITE = "https://tutien.com.vn";
var TT_API = "https://api.tutien.com.vn";
var TT_CDN = "https://x3.tutien.com.vn";
var TT_IMG = "https://img.tutien.com.vn";
var TT_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";
var TT_PAGE_SIZE = 30;

function getManifest() {
    return JSON.stringify({
        id: "tutientv",
        name: "TuTiênTV",
        version: "1.0.1",
        author: "alokillgtv",
        description: "Phim hoạt hình tu tiên, huyền huyễn, tiên hiệp từ tutien.com.vn",
        baseUrl: TT_SITE,
        imageReferer: TT_SITE + "/",
        iconUrl: "https://vaxplugin.alokillgtv.workers.dev/img/icon/tutientv.png",
        isEnabled: true,
        type: "MOVIE",
        playerType: "exoplayer"
    });
}

function ttImg(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    return TT_IMG + (p.charAt(0) === "/" ? "" : "/") + p;
}

var TT_GENRES = ["Linh Dị", "Huyền Huyễn", "Tiên Hiệp", "Cổ Trang", "Kiếm Hiệp", "Hài Hước", "Hiện Đại", "Trùng Sinh", "Xuyên Không", "Tu Tiên", "Đô Thị"];

function getHomeSections() {
    return JSON.stringify([
        { slug: "ranking", title: "Xem nhiều tuần này", type: "Horizontal" },
        { slug: "genre:Huyền Huyễn", title: "Huyền Huyễn", type: "Horizontal" },
        { slug: "genre:Tiên Hiệp", title: "Tiên Hiệp", type: "Horizontal" },
        { slug: "newest", title: "Mới cập nhật", type: "Grid" }
    ]);
}

function getPrimaryCategories() {
    var out = [
        { name: "Mới cập nhật", slug: "newest" },
        { name: "Xem nhiều tuần này", slug: "ranking" }
    ];
    for (var i = 0; i < TT_GENRES.length; i++) out.push({ name: TT_GENRES[i], slug: "genre:" + TT_GENRES[i] });
    return JSON.stringify(out);
}

function getFilterConfig() { return JSON.stringify({}); }

function getUrlList(slug, filtersJson) {
    var page = 1;
    try { page = parseInt(JSON.parse(filtersJson || "{}").page, 10) || 1; } catch (e) {}
    var offset = (page - 1) * TT_PAGE_SIZE;
    var s = String(slug || "newest");
    if (s === "ranking") return TT_API + "/rankings/views-weekly?limit=" + TT_PAGE_SIZE + "&offset=" + offset;
    if (s.indexOf("genre:") === 0) return TT_API + "/movies?page=" + page + "&sort=rating&genre=" + encodeURIComponent(s.substring(6)) + "&limit=" + TT_PAGE_SIZE + "&offset=" + offset;
    return TT_API + "/movies?page=" + page + "&sort=updated&limit=" + TT_PAGE_SIZE + "&offset=" + offset;
}

function getUrlSearch(keyword) {
    return TT_API + "/search-movies?q=" + encodeURIComponent(String(keyword || ""));
}

function getUrlDetail(slug) {
    var s = String(slug || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return TT_API + "/movie/" + encodeURIComponent(s.split("#")[0]);
}

function parseListResponse(raw) {
    try {
        var j = JSON.parse(raw);
        var list = Array.isArray(j) ? j : (Array.isArray(j.data) ? j.data : (j.data && Array.isArray(j.data.movies) ? j.data.movies : []));
        var items = [];
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
            if (!m || !m.slug) continue;
            items.push({
                id: m.slug,
                title: m.title || m.slug,
                posterUrl: ttImg(m.thumbnailUrl2 || m.thumbnailUrl1),
                backdropUrl: ttImg(m.thumbnailUrl1 || m.thumbnailUrl2),
                description: m.description || "",
                quality: m.complete ? "Full" : "Đang chiếu",
                episode_current: m.episodeCount ? (m.episodeCount + " tập") : "",
                year: m.year ? String(m.year) : "",
                lang: "Vietsub"
            });
        }
        return JSON.stringify({ items: items, pagination: { currentPage: 1, totalPages: 20 } });
    } catch (e) {
        return JSON.stringify({ items: [], pagination: { currentPage: 1, totalPages: 1 } });
    }
}

function parseSearchResponse(raw, url) { return parseListResponse(raw, url); }

function parseMovieDetail(raw) {
    try {
        var j = JSON.parse(raw);
        var data = j.data || j;
        var eps = Array.isArray(data.episodes) ? data.episodes : [];
        var out = [];
        for (var i = 0; i < eps.length; i++) {
            var ep = eps[i] || {};
            var num = ep.episodeNumber || (i + 1);
            var ed = { seriesId: data.slug, index: Number(num), m3u8Url2: ep.m3u8Url2 || "", m3u8Url: ep.m3u8Url || "" };
            out.push({
                id: data.slug + "#" + (ep.uuid || ("ep" + num)),
                slug: "tap-" + num,
                name: "Tập " + num,
                datasend: JSON.stringify(ed)
            });
        }
        return JSON.stringify({
            id: data.slug,
            title: data.title || data.slug,
            posterUrl: ttImg(data.thumbnailUrl2 || data.thumbnailUrl1),
            backdropUrl: ttImg(data.thumbnailUrl1 || data.thumbnailUrl2),
            description: data.description || "",
            quality: data.complete ? "Full" : "Đang chiếu",
            year: data.year ? String(data.year) : "",
            servers: [{ name: "TuTiênTV", episodes: out }]
        });
    } catch (e) {
        return JSON.stringify({ id: "", title: "", servers: [] });
    }
}

function getStreamLink(id, datasend) {
    try {
        var d = typeof datasend === "string" ? JSON.parse(datasend || "{}") : (datasend || {});
        var play = d.m3u8Url2 || d.m3u8Url || "";
        if (play && !/^https?:\/\//i.test(play)) play = TT_CDN + "/" + play.replace(/^\/+/, "");
        return JSON.stringify({
            url: play,
            mimeType: "application/x-mpegURL",
            isEmbed: false,
            headers: { "Referer": TT_SITE + "/" },
            subtitles: []
        });
    } catch (e) {
        return JSON.stringify({ url: "", isEmbed: false, headers: {}, subtitles: [] });
    }
}

function parseDetailResponse(raw, url, datasend) { return getStreamLink(url, datasend); }`
});
