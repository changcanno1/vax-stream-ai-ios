// =============================================================================
// VAX PLUGIN SANDBOX RUNTIME & NATIVE BRIDGE POLYFILL
// Tương thích 100% với tất cả các plugin VAX (Dexter, Danet, Film4K, HHPanda,
// CityPhim, HoạtHình1, FreeReels, PhimChill, PhimFun, PineDrama, PhimNgắn,
// SàiGònPhim, Onflix, PhimBom, TuTiênTV) và plugin do AI tự động sinh ra.
// =============================================================================

window.VaxRuntime = (function () {
  const LOG_BUFFER = [];
  const MAX_LOGS = 300;
  let onLogCallback = null;

  function pushLog(pluginId, level, msg) {
    const entry = {
      time: new Date().toLocaleTimeString('vi-VN', { hour12: false }),
      pluginId: pluginId || 'system',
      level: level || 'INFO',
      text: String(msg)
    };
    LOG_BUFFER.unshift(entry);
    if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.pop();
    if (typeof onLogCallback === 'function') {
      try { onLogCallback(entry); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------------------
  // 1. BASE64 & URL PARAMETER HELPERS (Global trong VAX)
  // ---------------------------------------------------------------------------
  const BASE64 = {
    encode: function (str) {
      try {
        return btoa(unescape(encodeURIComponent(String(str || ''))));
      } catch (e) {
        return '';
      }
    },
    decode: function (str) {
      try {
        let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
        return decodeURIComponent(escape(atob(s)));
      } catch (e) {
        return '';
      }
    }
  };

  function getparam(url, param) {
    if (!url || !param) return null;
    const escaped = String(param).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('[?&]' + escaped + '=([^&#|]*)', 'i');
    const match = String(url).match(regex);
    if (match && match[1] !== undefined) {
      try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); }
      catch (e) { return match[1]; }
    }
    return null;
  }

  function getSlug(url) {
    if (!url) return '';
    return String(url).replace(/^https?:\/\/[^/]+/i, '');
  }

  // ---------------------------------------------------------------------------
  // 2. MINI-JQUERY VIRTUAL DOM ENGINE: _$(html)
  // Hỗ trợ đầy đủ: .find(), .each(), .attr(), .text(), .textAll(), .html(),
  // .eq(), .first(), .last(), .next(), .before(), .after(), .parent(), .closest()
  // và pseudo selectors của VAX: :content("A|B"), :first, :last, :eq(n), :not(...)
  // ---------------------------------------------------------------------------
  function createMiniJQ() {
    function parseHTML(htmlString) {
      let nodes = [];
      let root = { id: 0, tag: "ROOT", attrs: {}, childrenIds: [], parentId: null, rawHtml: "" };
      nodes.push(root);

      try {
        let html = String(htmlString || "").trim();
        if (!html) return { root, nodes };

        const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
        let stack = [0];
        let tagRegex = /<(?:\/([a-zA-Z0-9_:-]+)|([a-zA-Z0-9_:-]+)([^>]*?)(\/)?)\s*>/g;

        let lastIndex = 0;
        let match;
        let maxIter = 80000;
        let iter = 0;

        while ((match = tagRegex.exec(html)) !== null && iter++ < maxIter) {
          let textBefore = html.slice(lastIndex, match.index);
          let parentId = stack[stack.length - 1];

          if (textBefore && textBefore.trim()) {
            let textId = nodes.length;
            nodes.push({ id: textId, tag: "#text", text: textBefore.trim(), attrs: {}, childrenIds: [], parentId: parentId });
            nodes[parentId].childrenIds.push(textId);
          }

          lastIndex = tagRegex.lastIndex;
          let isCloseTag = !!match[1];
          let tagName = (match[1] || match[2] || "").toLowerCase();
          let attrStr = match[3] || "";
          let isSelfClosing = !!match[4] || VOID_TAGS.has(tagName);

          if (isCloseTag) {
            for (let i = stack.length - 1; i > 0; i--) {
              if (nodes[stack[i]].tag === tagName) {
                stack.splice(i);
                break;
              }
            }
          } else {
            let attrs = {};
            let attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
              attrs[attrMatch[1].toLowerCase()] = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : (attrMatch[4] || ""));
            }

            let nodeId = nodes.length;
            let node = { id: nodeId, tag: tagName, attrs: attrs, childrenIds: [], parentId: parentId };
            nodes.push(node);
            nodes[parentId].childrenIds.push(nodeId);

            if (!isSelfClosing) {
              stack.push(nodeId);
            }
          }
        }

        let remainingText = html.slice(lastIndex).trim();
        if (remainingText && stack.length > 0) {
          let parentId = stack[stack.length - 1];
          let textId = nodes.length;
          nodes.push({ id: textId, tag: "#text", text: remainingText, attrs: {}, childrenIds: [], parentId: parentId });
          nodes[parentId].childrenIds.push(textId);
        }
      } catch (err) {}
      return { root, nodes };
    }

    function getNodeText(node, nodes, depth, sep) {
      if (!node || (depth || 0) > 25) return "";
      if (node.tag === "#text") return node.text || "";
      let parts = [];
      if (node.childrenIds) {
        for (let cid of node.childrenIds) {
          let childText = getNodeText(nodes[cid], nodes, (depth || 0) + 1, sep);
          if (childText) parts.push(childText);
        }
      }
      return parts.join(sep !== undefined ? sep : " ").trim();
    }

    function matchSingleSelector(node, sel, nodes) {
      if (!node || node.tag === "#text" || node.tag === "ROOT") return false;
      let cleanSel = sel.replace(/:first|:last|:eq\([0-9]+\)/gi, "").trim();

      let pseudoContentArg = null;
      let contentMatch = cleanSel.match(/:content\((?:["'](.*?)["']|([^)]+))\)/i);
      if (contentMatch) {
        pseudoContentArg = contentMatch[1] !== undefined ? contentMatch[1] : contentMatch[2];
        cleanSel = cleanSel.replace(contentMatch[0], "").trim();
      }

      let notArg = null;
      let notMatch = cleanSel.match(/:not\(([^)]+)\)/i);
      if (notMatch) {
        notArg = notMatch[1].trim();
        cleanSel = cleanSel.replace(notMatch[0], "").trim();
      }

      if (cleanSel && cleanSel !== "*") {
        let attrRegex = /\[([a-zA-Z0-9_:-]+)\s*(?:([*^$]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]"']*)))?\]/g;
        let attrM;
        while ((attrM = attrRegex.exec(cleanSel)) !== null) {
          let aName = attrM[1].toLowerCase();
          let aOp = attrM[2];
          let aVal = attrM[3] !== undefined ? attrM[3] : (attrM[4] !== undefined ? attrM[4] : attrM[5]);
          if (!node.attrs || !(aName in node.attrs)) return false;
          let actual = String(node.attrs[aName] || "");
          if (aOp === "=") {
            if (actual !== aVal) return false;
          } else if (aOp === "*=") {
            if (actual.indexOf(aVal) === -1) return false;
          } else if (aOp === "^=") {
            if (actual.indexOf(aVal) !== 0) return false;
          } else if (aOp === "$=") {
            if (!actual.endsWith(aVal)) return false;
          }
        }
        cleanSel = cleanSel.replace(attrRegex, "").trim();

        let idMatch = cleanSel.match(/#([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          if (!node.attrs || node.attrs.id !== idMatch[1]) return false;
          cleanSel = cleanSel.replace(idMatch[0], "");
        }

        let classMatches = cleanSel.match(/\.([a-zA-Z0-9_\-\/\\:]+)/g);
        if (classMatches) {
          if (!node.attrs || !node.attrs.class) return false;
          let elClasses = node.attrs.class.split(/\s+/);
          for (let c of classMatches) {
            let targetClass = c.substring(1);
            if (!elClasses.includes(targetClass)) return false;
          }
          cleanSel = cleanSel.replace(/\.([a-zA-Z0-9_\-\/\\:]+)/g, "");
        }

        let tagMatch = cleanSel.trim().match(/^[a-zA-Z0-9_:-]+$/);
        if (tagMatch && node.tag !== tagMatch[0].toLowerCase()) return false;
      }

      if (notArg && matchSingleSelector(node, notArg, nodes)) return false;

      if (pseudoContentArg !== null) {
        let fullText = getNodeText(node, nodes, 0);
        let keywords = pseudoContentArg.split("|").map(k => k.trim().toLowerCase());
        let found = keywords.some(kw => fullText.toLowerCase().includes(kw));
        if (!found) return false;
      }

      return true;
    }

    function querySelectorAllSingleLevel(startNode, selector, nodes) {
      let results = [];
      function search(currentId, depth) {
        if (depth > 60) return;
        let current = nodes[currentId];
        if (!current) return;
        if (current.tag !== "ROOT" && current.tag !== "#text" && current.id !== startNode.id) {
          if (matchSingleSelector(current, selector, nodes)) {
            results.push(current);
          }
        }
        if (current.childrenIds) {
          for (let cid of current.childrenIds) {
            search(cid, depth + 1);
          }
        }
      }
      search(startNode.id, 0);

      if (/:first\b/i.test(selector)) return results.slice(0, 1);
      if (/:last\b/i.test(selector)) return results.slice(-1);
      let eqMatch = selector.match(/:eq\(([0-9]+)\)/i);
      if (eqMatch) {
        let idx = parseInt(eqMatch[1], 10);
        return results[idx] ? [results[idx]] : [];
      }
      return results;
    }

    function tokenizeSelector(sel) {
      // Split by whitespace outside brackets/parentheses
      let tokens = [];
      let cur = "";
      let depthParen = 0;
      let depthBracket = 0;
      let inQuote = null;
      for (let i = 0; i < sel.length; i++) {
        let ch = sel[i];
        if (inQuote) {
          if (ch === inQuote && sel[i - 1] !== '\\') inQuote = null;
          cur += ch;
        } else if (ch === '"' || ch === "'") {
          inQuote = ch;
          cur += ch;
        } else if (ch === '(') {
          depthParen++;
          cur += ch;
        } else if (ch === ')') {
          depthParen = Math.max(0, depthParen - 1);
          cur += ch;
        } else if (ch === '[') {
          depthBracket++;
          cur += ch;
        } else if (ch === ']') {
          depthBracket = Math.max(0, depthBracket - 1);
          cur += ch;
        } else if (/\s/.test(ch) && depthParen === 0 && depthBracket === 0) {
          if (cur.trim()) {
            tokens.push(cur.trim());
            cur = "";
          }
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) tokens.push(cur.trim());
      return tokens;
    }

    function querySelectorAll(startNode, selector, nodes) {
      try {
        if (!startNode || !selector) return [];
        if (selector.indexOf(',') !== -1 && selector.indexOf(':content(') === -1) {
          let groupSelectors = selector.split(',').map(s => s.trim()).filter(Boolean);
          let resMap = new Map();
          for (let gSel of groupSelectors) {
            let subRes = querySelectorAll(startNode, gSel, nodes);
            for (let r of subRes) resMap.set(r.id, r);
          }
          return Array.from(resMap.values());
        }

        let spaceParts = tokenizeSelector(selector).filter(p => p !== '>');
        if (spaceParts.length > 1) {
          let currentNodes = [startNode];
          for (let part of spaceParts) {
            let nextLevelNodes = [];
            let addedIds = new Set();
            for (let cNode of currentNodes) {
              let subResults = querySelectorAllSingleLevel(cNode, part, nodes);
              for (let r of subResults) {
                if (!addedIds.has(r.id)) {
                  addedIds.add(r.id);
                  nextLevelNodes.push(r);
                }
              }
            }
            currentNodes = nextLevelNodes;
            if (currentNodes.length === 0) break;
          }
          return currentNodes;
        }
        return querySelectorAllSingleLevel(startNode, selector.trim(), nodes);
      } catch (err) {
        return [];
      }
    }

    function MiniJQ(elements, nodesStore) {
      this.elements = Array.isArray(elements) ? elements : (elements ? [elements] : []);
      this.nodes = nodesStore || [];
      this.length = this.elements.length;
    }

    MiniJQ.prototype = {
      find: function (selector) {
        if (this.elements.length === 0) return new MiniJQ([], this.nodes);
        let matched = [];
        let addedIds = new Set();
        for (let el of this.elements) {
          let res = querySelectorAll(el, selector, this.nodes);
          for (let r of res) {
            if (!addedIds.has(r.id)) {
              addedIds.add(r.id);
              matched.push(r);
            }
          }
        }
        return new MiniJQ(matched, this.nodes);
      },
      text: function (sep) {
        if (this.elements.length === 0) return "";
        return getNodeText(this.elements[0], this.nodes, 0, sep);
      },
      textAll: function (delimiter) {
        if (delimiter === undefined) delimiter = " ";
        let texts = [];
        for (let el of this.elements) {
          let t = getNodeText(el, this.nodes, 0);
          if (t) texts.push(t);
        }
        return texts.join(delimiter);
      },
      html: function () {
        if (this.elements.length === 0) return "";
        let self = this;
        let serialize = function (nodeId, depth) {
          if (depth > 25) return "";
          let node = self.nodes[nodeId];
          if (!node) return "";
          if (node.tag === "#text") return node.text || "";
          let attrs = Object.entries(node.attrs || {}).map(([k, v]) => ` ${k}="${v}"`).join("");
          let childrenHTML = (node.childrenIds || []).map(cid => serialize(cid, depth + 1)).join("");
          return `<${node.tag}${attrs}>${childrenHTML}</${node.tag}>`;
        };
        return (this.elements[0].childrenIds || []).map(cid => serialize(cid, 0)).join("");
      },
      attr: function (name, value) {
        if (!name) return "";
        let low = String(name).toLowerCase();
        if (value !== undefined) {
          for (let el of this.elements) {
            if (el && el.tag !== "#text") {
              if (!el.attrs) el.attrs = {};
              el.attrs[low] = value;
            }
          }
          return this;
        }
        if (this.elements.length === 0 || !this.elements[0].attrs) return "";
        return this.elements[0].attrs[low] || "";
      },
      each: function (callback) {
        if (typeof callback !== 'function') return this;
        this.elements.forEach((el, index) => {
          let jqEl = new MiniJQ([el], this.nodes);
          callback.call(jqEl, index, jqEl);
        });
        return this;
      },
      first: function () {
        return new MiniJQ(this.elements.length > 0 ? [this.elements[0]] : [], this.nodes);
      },
      last: function () {
        return new MiniJQ(this.elements.length > 0 ? [this.elements[this.elements.length - 1]] : [], this.nodes);
      },
      eq: function (index) {
        let idx = index < 0 ? this.elements.length + index : index;
        return new MiniJQ(this.elements[idx] ? [this.elements[idx]] : [], this.nodes);
      },
      parent: function () {
        let parents = [];
        let addedIds = new Set();
        for (let el of this.elements) {
          if (el && el.parentId !== null && el.parentId !== 0) {
            let pNode = this.nodes[el.parentId];
            if (pNode && !addedIds.has(pNode.id)) {
              addedIds.add(pNode.id);
              parents.push(pNode);
            }
          }
        }
        return new MiniJQ(parents, this.nodes);
      },
      next: function () {
        let nexts = [];
        for (let el of this.elements) {
          if (!el || el.parentId === null) continue;
          let pNode = this.nodes[el.parentId];
          if (!pNode) continue;
          let siblings = pNode.childrenIds.map(cid => this.nodes[cid]).filter(c => c && c.tag !== "#text");
          let idx = siblings.findIndex(s => s.id === el.id);
          if (idx !== -1 && idx + 1 < siblings.length) {
            nexts.push(siblings[idx + 1]);
          }
        }
        return new MiniJQ(nexts, this.nodes);
      },
      before: function () {
        let befores = [];
        for (let el of this.elements) {
          if (!el || el.parentId === null) continue;
          let pNode = this.nodes[el.parentId];
          if (!pNode) continue;
          let siblings = pNode.childrenIds.map(cid => this.nodes[cid]).filter(c => c && c.tag !== "#text");
          let idx = siblings.findIndex(s => s.id === el.id);
          if (idx > 0) befores.push(siblings[idx - 1]);
        }
        return new MiniJQ(befores, this.nodes);
      },
      after: function () {
        return this.next();
      },
      closest: function (selector) {
        let matched = [];
        let addedIds = new Set();
        for (let el of this.elements) {
          let currParentId = el.parentId;
          let depth = 0;
          while (currParentId !== null && currParentId !== 0 && depth++ < 30) {
            let curr = this.nodes[currParentId];
            if (!curr) break;
            if (matchSingleSelector(curr, selector, this.nodes)) {
              if (!addedIds.has(curr.id)) {
                addedIds.add(curr.id);
                matched.push(curr);
              }
              break;
            }
            currParentId = curr.parentId;
          }
        }
        return new MiniJQ(matched, this.nodes);
      }
    };

    return function _$(param) {
      try {
        if (!param) return new MiniJQ([], []);
        if (param instanceof MiniJQ) return param;
        if (typeof param === "string") {
          let parsed = parseHTML(param);
          return new MiniJQ(parsed.root, parsed.nodes);
        }
        return new MiniJQ(param, []);
      } catch (err) {
        return new MiniJQ([], []);
      }
    };
  }

  const globalMiniJQ = createMiniJQ();

  // ---------------------------------------------------------------------------
  // 3. SYNCHRONOUS & ASYNCHRONOUS HTTP PROXY LAYER
  // Các plugin VAX gọi `httpRequest(url, options)` và `fetchAll(requests, opts)`
  // đồng bộ (synchronous) trong JS engine của app IPA.
  // Trên trình duyệt / WebView, ta hỗ trợ:
  // - Local/Custom Proxy hoặc CORS Proxy đa tầng (AllOrigins / CorsProxy / CodeTabs / Direct)
  // - Synchronous XMLHttpRequest (cho các hàm plugin gọi httpRequest trực tiếp)
  // - Async Pre-fetcher cho các URL chính (getUrlList, getUrlSearch, getUrlDetail)
  // ---------------------------------------------------------------------------
  const HTTP_CACHE = new Map();
  const CACHE_TTL = 90 * 1000; // 90s cache

  function getProxyConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem('vax_settings_v1') || '{}');
      return {
        customProxy: (saved.corsProxyUrl || '').trim(),
        useProxy: saved.useCorsProxy !== false
      };
    } catch (e) {
      return { customProxy: '', useProxy: true };
    }
  }

  // Giải mã vax.local bridge URL nếu plugin gọi https://vax.local/p?d=<base64>
  function unwrapVaxLocal(url) {
    if (String(url).indexOf('https://vax.local/p?d=') === 0) {
      try {
        const b64 = String(url).split('?d=')[1];
        const decoded = BASE64.decode(b64);
        const payload = JSON.parse(decoded);
        return payload;
      } catch (e) {}
    }
    return null;
  }

  function buildProxyUrls(targetUrl, customHeaders, method, bodyData) {
    const cfg = getProxyConfig();
    const list = [];

    // 0. Nếu đang chạy trong Native iOS IPA (có VaxProxySchemeHandler vax-proxy://)
    // Toàn bộ request (kể cả POST, custom Referer/Origin/User-Agent/X-VAX-YB/X-F4K-PT)
    // đi thẳng qua URLSession Native của iOS không bị bất kỳ giới hạn CORS nào!
    if (typeof window !== 'undefined' && window.__VAX_IOS_NATIVE__) {
      const payload = {
        url: targetUrl,
        method: method || 'GET',
        headers: customHeaders || {},
        body: bodyData || null
      };
      const b64 = BASE64.encode(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      list.push(`vax-proxy://fetch?d=${b64}`);
    }

    // 1. Nếu người dùng cấu hình Cloudflare Worker / Custom Proxy riêng
    if (cfg.customProxy) {
      if (cfg.customProxy.includes('{url}')) {
        list.push(cfg.customProxy.replace('{url}', encodeURIComponent(targetUrl)));
      } else {
        const sep = cfg.customProxy.includes('?') ? '&' : '?';
        list.push(`${cfg.customProxy}${sep}url=${encodeURIComponent(targetUrl)}`);
      }
    }

    // 2. Các API đã mở sẵn CORS (phimapi.com, workers.dev, image.tmdb.org, githubusercontent...)
    const corsFriendly = /phimapi\.com|workers\.dev|githubusercontent\.com|tmdb\.org|githack\.com|jsdelivr\.net/i.test(targetUrl);
    if (corsFriendly) {
      list.push(targetUrl);
    }

    // 3. Hệ thống Multi-Proxy Fallback tự động vượt CORS trên trình duyệt / iOS WebView
    if (cfg.useProxy) {
      list.push(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`);
      list.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
      list.push(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    }

    // 4. Direct call cuối cùng
    if (!corsFriendly) {
      list.push(targetUrl);
    }

    return list;
  }

  // Hàm httpRequest đồng bộ (Synchronous XHR) phục vụ bên trong thân code plugin VAX
  function syncHttpRequest(url, options) {
    options = options || {};
    if (!url || /^https?:\/\/example\.com/i.test(url)) {
      return { status: 200, isSuccessful: true, ok: true, body: "", url: url };
    }

    // Kiểm tra vax.local bridge
    const vaxPayload = unwrapVaxLocal(url);
    if (vaxPayload && vaxPayload.url) {
      const innerRes = syncHttpRequest(vaxPayload.url, {
        method: vaxPayload.method || 'GET',
        headers: vaxPayload.headers || {},
        body: vaxPayload.body
      });
      return {
        status: innerRes.status,
        isSuccessful: innerRes.isSuccessful,
        ok: innerRes.isSuccessful,
        body: JSON.stringify({ data: innerRes.body }),
        url: url
      };
    }

    const method = (options.method || 'GET').toUpperCase();
    const bodyData = options.body !== undefined ? options.body : null;
    const cacheKey = `${method}:${url}:${bodyData ? String(bodyData).slice(0, 120) : ''}`;

    if (method === 'GET' && HTTP_CACHE.has(cacheKey)) {
      const cached = HTTP_CACHE.get(cacheKey);
      if (Date.now() - cached.time < CACHE_TTL) {
        return cached.res;
      }
    }

    const candidates = buildProxyUrls(url, options.headers, method, bodyData);
    let lastStatus = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidateUrl = candidates[i];
      const isNativeProxy = candidateUrl.startsWith('vax-proxy://');
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(isNativeProxy ? 'GET' : method, candidateUrl, false); // Synchronous XHR
        const isDirect = candidateUrl === url;

        if (!isNativeProxy && options.headers && typeof options.headers === 'object') {
          for (let hk in options.headers) {
            const low = hk.toLowerCase();
            // Trình duyệt cấm set các forbidden headers như Referer, Origin, User-Agent, Cookie, Host
            const forbidden = ['user-agent', 'referer', 'origin', 'cookie', 'host', 'connection', 'content-length', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'x-requested-with'];
            if (!forbidden.includes(low)) {
              // Chỉ gắn custom headers khi gọi trực tiếp hoặc gọi tới worker của chính plugin
              if (isDirect || candidateUrl.includes('workers.dev')) {
                try { xhr.setRequestHeader(hk, options.headers[hk]); } catch (e) {}
              }
            }
          }
        }

        xhr.send(isNativeProxy ? null : bodyData);
        lastStatus = xhr.status;
        if (xhr.status >= 200 && xhr.status < 400) {
          const responseText = xhr.responseText || '';
          const resObj = {
            status: xhr.status,
            isSuccessful: true,
            ok: true,
            body: responseText,
            data: responseText,
            text: function () { return responseText; },
            url: xhr.responseURL || url
          };
          if (method === 'GET' && responseText.length > 0) {
            HTTP_CACHE.set(cacheKey, { time: Date.now(), res: resObj });
          }
          return resObj;
        }
      } catch (err) {
        // Thử proxy tiếp theo
      }
    }

    return {
      status: lastStatus || 0,
      isSuccessful: false,
      ok: false,
      body: "",
      data: "",
      text: function () { return ""; },
      url: url
    };
  }

  // Hàm fetch异步 (Async) dùng khi App chủ động tải trang cho getUrlList / getUrlSearch / getUrlDetail
  async function asyncHttpRequest(url, options) {
    options = options || {};
    if (!url || /^https?:\/\/example\.com/i.test(url) || String(url).indexOf('freereels:') === 0) {
      return { status: 200, isSuccessful: true, ok: true, body: "", url: url };
    }

    const cleanUrl = String(url).split('|')[0];
    if (/^https?:\/\/example\.com/i.test(cleanUrl)) {
      return { status: 200, isSuccessful: true, ok: true, body: "", url: url };
    }

    const method = (options.method || 'GET').toUpperCase();
    const bodyData = options.body !== undefined ? options.body : undefined;
    const cacheKey = `${method}:${cleanUrl}:${bodyData ? String(bodyData).slice(0, 120) : ''}`;

    if (method === 'GET' && HTTP_CACHE.has(cacheKey)) {
      const cached = HTTP_CACHE.get(cacheKey);
      if (Date.now() - cached.time < CACHE_TTL) {
        return cached.res;
      }
    }

    const candidates = buildProxyUrls(cleanUrl, options.headers, method, bodyData);
    let lastStatus = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidateUrl = candidates[i];
      const isNativeProxy = candidateUrl.startsWith('vax-proxy://');
      try {
        const isDirect = candidateUrl === cleanUrl;
        const safeHeaders = {};
        if (!isNativeProxy && options.headers && typeof options.headers === 'object') {
          for (let hk in options.headers) {
            const low = hk.toLowerCase();
            const forbidden = ['user-agent', 'referer', 'origin', 'cookie', 'host', 'connection', 'content-length', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'x-requested-with'];
            if (!forbidden.includes(low) && (isDirect || candidateUrl.includes('workers.dev'))) {
              safeHeaders[hk] = options.headers[hk];
            }
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeout || 14000);
        const resp = await fetch(candidateUrl, {
          method: isNativeProxy ? 'GET' : method,
          headers: Object.keys(safeHeaders).length ? safeHeaders : undefined,
          body: (!isNativeProxy && method === 'POST') ? bodyData : undefined,
          signal: controller.signal
        });
        clearTimeout(timer);

        lastStatus = resp.status;
        if (resp.ok) {
          const text = await resp.text();
          const resObj = {
            status: resp.status,
            isSuccessful: true,
            ok: true,
            body: text,
            data: text,
            text: () => text,
            url: resp.url || cleanUrl
          };
          if (method === 'GET' && text.length > 0) {
            HTTP_CACHE.set(cacheKey, { time: Date.now(), res: resObj });
          }
          return resObj;
        }
      } catch (e) {
        // Thử candidate tiếp theo
      }
    }

    return {
      status: lastStatus || 0,
      isSuccessful: false,
      ok: false,
      body: "",
      data: "",
      text: () => "",
      url: cleanUrl
    };
  }

  function syncFetchAll(requests, defaultOptions) {
    if (!Array.isArray(requests)) return [];
    const defHeaders = (defaultOptions && defaultOptions.headers) || {};
    return requests.map(req => {
      const u = typeof req === 'string' ? req : req.url;
      const m = (req && req.method) || 'GET';
      const h = Object.assign({}, defHeaders, (req && req.headers) || {});
      return syncHttpRequest(u, { method: m, headers: h, timeout: req.timeout });
    });
  }

  // ---------------------------------------------------------------------------
  // 4. APPCRYPTO NATIVE BRIDGE POLYFILL (Cho HHPanda & SàiGònPhim)
  // ---------------------------------------------------------------------------
  const AppCrypto = {
    fetchDynamicConfig: function (workerUrl, secret) {
      return null;
    },
    resolveStreamUrl: function (streamKey, cdn, hmacSecret, referer) {
      if (!streamKey) return "";
      if (/^https?:\/\//i.test(streamKey)) return streamKey;
      return (cdn || "https://sv1.p4k.dpdns.org").replace(/\/+$/, '') + "/" + String(streamKey).replace(/^\/+/, '');
    },
    genStreamUrl: function (streamKey, cdn) {
      if (!streamKey) return "";
      return (cdn || "https://sv1.p4k.dpdns.org").replace(/\/+$/, '') + "/" + String(streamKey).replace(/^\/+/, '');
    },
    resolveStreamfree: function (sfUrl, pageUrl) {
      return "";
    },
    buildStreamfreeSession: function (sfUrl, htmlBody) {
      if (!htmlBody) return "";
      const m = String(htmlBody).match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
      if (m && m[1]) {
        return JSON.stringify({
          m3u8Url: m[1].replace(/\\/g, ''),
          headers: { Referer: sfUrl }
        });
      }
      return "";
    }
  };

  // ---------------------------------------------------------------------------
  // 5. PLUGIN COMPILER & SANDBOX EXECUTOR
  // Thực thi mã nguồn JS của mỗi plugin trong một closure cô lập, cung cấp
  // đầy đủ biến môi trường của VAX IPA: httpRequest, fetchAll, _$, BASE64,
  // getparam, getSetCookie, AppCrypto, nativeLog, console, localStorage
  // ---------------------------------------------------------------------------
  function compilePlugin(sourceCode, pluginKey) {
    const sandboxConsole = {
      log: function (...args) { pushLog(pluginKey, 'LOG', args.join(' ')); },
      warn: function (...args) { pushLog(pluginKey, 'WARN', args.join(' ')); },
      error: function (...args) { pushLog(pluginKey, 'ERR', args.join(' ')); }
    };

    const nativeLog = function (msg) {
      pushLog(pluginKey, 'NATIVE', msg);
    };

    const getSetCookie = function () { return ""; };

    const wrappedSource = `
      var globalThis = {};
      var window = globalThis;
      var self = globalThis;
      var BASEURL = "";
      var BASELINK = "";
      var BASEAPI = "";
      var NEWDOMAIN = false;
      var iddomain = "";

      ${sourceCode}

      return {
        getManifest: typeof getManifest === 'function' ? getManifest : (globalThis.getManifest || null),
        getHomeSections: typeof getHomeSections === 'function' ? getHomeSections : (globalThis.getHomeSections || null),
        getPrimaryCategories: typeof getPrimaryCategories === 'function' ? getPrimaryCategories : (globalThis.getPrimaryCategories || null),
        getFilterConfig: typeof getFilterConfig === 'function' ? getFilterConfig : (globalThis.getFilterConfig || null),
        getUrlList: typeof getUrlList === 'function' ? getUrlList : (globalThis.getUrlList || null),
        getUrlSearch: typeof getUrlSearch === 'function' ? getUrlSearch : (globalThis.getUrlSearch || null),
        getUrlDetail: typeof getUrlDetail === 'function' ? getUrlDetail : (globalThis.getUrlDetail || null),
        getUrlCategories: typeof getUrlCategories === 'function' ? getUrlCategories : (globalThis.getUrlCategories || null),
        parseCategoriesResponse: typeof parseCategoriesResponse === 'function' ? parseCategoriesResponse : (globalThis.parseCategoriesResponse || null),
        parseListResponse: typeof parseListResponse === 'function' ? parseListResponse : (globalThis.parseListResponse || null),
        parseSearchResponse: typeof parseSearchResponse === 'function' ? parseSearchResponse : (globalThis.parseSearchResponse || null),
        parseMovieDetail: typeof parseMovieDetail === 'function' ? parseMovieDetail : (globalThis.parseMovieDetail || null),
        parseDetailResponse: typeof parseDetailResponse === 'function' ? parseDetailResponse : (globalThis.parseDetailResponse || null),
        parseEmbedResponse: typeof parseEmbedResponse === 'function' ? parseEmbedResponse : (globalThis.parseEmbedResponse || null),
        getStreamLink: typeof getStreamLink === 'function' ? getStreamLink : (globalThis.getStreamLink || null)
      };
    `;

    try {
      const factory = new Function(
        'httpRequest',
        'fetchAll',
        '_$',
        'BASE64',
        'getparam',
        'getSlug',
        'getSetCookie',
        'AppCrypto',
        'nativeLog',
        'console',
        wrappedSource
      );

      const api = factory(
        syncHttpRequest,
        syncFetchAll,
        globalMiniJQ,
        BASE64,
        getparam,
        getSlug,
        getSetCookie,
        AppCrypto,
        nativeLog,
        sandboxConsole
      );

      let manifest = {};
      if (api.getManifest) {
        const rawM = api.getManifest();
        manifest = typeof rawM === 'string' ? JSON.parse(rawM) : (rawM || {});
      }

      return {
        ok: true,
        id: manifest.id || pluginKey || 'custom_' + Date.now(),
        manifest: manifest,
        api: api,
        sourceCode: sourceCode
      };
    } catch (err) {
      pushLog(pluginKey, 'ERR', 'Compile error: ' + err.message);
      return {
        ok: false,
        id: pluginKey || 'broken_plugin',
        error: err.message,
        sourceCode: sourceCode
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 6. HIGH-LEVEL PLUGIN WORKFLOW RUNNERS
  // Chuẩn hóa toàn bộ chu trình gọi plugin giống hệt App IPA VAX:
  // - Load Home Sections & Categories
  // - Load Movie List (getUrlList -> fetch -> parseListResponse)
  // - Search Movies (getUrlSearch -> fetch -> parseSearchResponse)
  // - Load Movie Detail (getUrlDetail -> fetch -> parseMovieDetail + xử lý `extra` 2-pass cho PhimChill/PhimBom)
  // - Load Stream Link (getUrlDetail/episode.id -> fetch -> parseDetailResponse / getStreamLink / parseEmbedResponse)
  // ---------------------------------------------------------------------------
  function safeJsonParse(str, fallback) {
    if (!str) return fallback;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  function extractPipeData(urlStr) {
    const s = String(urlStr || '');
    const idx = s.indexOf('|');
    if (idx < 0) return { cleanUrl: s, datasend: '' };
    const cleanUrl = s.substring(0, idx);
    let datasend = s.substring(idx + 1);
    if (datasend.indexOf('data:') === 0) datasend = datasend.substring(5);
    return { cleanUrl, datasend };
  }

  function getPluginHeaders(instance) {
    const m = (instance && instance.manifest) || {};
    const h = Object.assign({}, m.headers || {});
    if (m.referrer && !h.Referer) h.Referer = m.referrer;
    return h;
  }

  async function fetchList(instance, slug, page = 1, extraFilters = {}) {
    if (!instance || !instance.api) throw new Error("Plugin không hợp lệ");
    const filtersObj = Object.assign({ page: page }, extraFilters);
    const filtersJson = JSON.stringify(filtersObj);

    const rawUrl = instance.api.getUrlList ? instance.api.getUrlList(slug || '', filtersJson) : '';
    pushLog(instance.id, 'LIST', `getUrlList("${slug}", page=${page}) -> ${rawUrl}`);

    const { cleanUrl } = extractPipeData(rawUrl);
    const res = await asyncHttpRequest(cleanUrl, { headers: getPluginHeaders(instance) });
    const parsedStr = instance.api.parseListResponse
      ? instance.api.parseListResponse(res.body || '', rawUrl)
      : '{"items":[],"pagination":{"currentPage":1,"totalPages":1}}';

    return safeJsonParse(parsedStr, { items: [], pagination: { currentPage: page, totalPages: 1 } });
  }

  async function searchMovies(instance, keyword, page = 1) {
    if (!instance || !instance.api) throw new Error("Plugin không hợp lệ");
    const filtersJson = JSON.stringify({ page: page });
    const rawUrl = instance.api.getUrlSearch ? instance.api.getUrlSearch(keyword, filtersJson) : '';
    pushLog(instance.id, 'SEARCH', `getUrlSearch("${keyword}", page=${page}) -> ${rawUrl}`);

    const { cleanUrl } = extractPipeData(rawUrl);
    const res = await asyncHttpRequest(cleanUrl, { headers: getPluginHeaders(instance) });
    const parser = instance.api.parseSearchResponse || instance.api.parseListResponse;
    const parsedStr = parser ? parser(res.body || '', rawUrl) : '{"items":[]}';

    return safeJsonParse(parsedStr, { items: [], pagination: { currentPage: page, totalPages: 1 } });
  }

  async function fetchMovieDetail(instance, itemOrId) {
    if (!instance || !instance.api) throw new Error("Plugin không hợp lệ");
    const itemId = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
    const itemDatasend = typeof itemOrId === 'object' ? (itemOrId.datasend || '') : '';

    let rawUrl = instance.api.getUrlDetail
      ? instance.api.getUrlDetail(itemId, itemDatasend)
      : itemId;

    pushLog(instance.id, 'DETAIL', `getUrlDetail("${itemId}") -> ${String(rawUrl).slice(0, 140)}`);

    // Trường hợp đặc biệt: PineDrama getUrlDetail trả trực tiếp chuỗi JSON detail
    if (rawUrl && String(rawUrl).trim().startsWith('{')) {
      const directDetail = safeJsonParse(rawUrl, null);
      if (directDetail && directDetail.servers) return directDetail;
    }

    const { cleanUrl, datasend } = extractPipeData(rawUrl);
    const effectiveDatasend = itemDatasend || datasend;
    const res = await asyncHttpRequest(cleanUrl, { headers: getPluginHeaders(instance) });

    let detailStr = instance.api.parseMovieDetail
      ? instance.api.parseMovieDetail(res.body || '', rawUrl, effectiveDatasend)
      : '{}';

    let detail = safeJsonParse(detailStr, { id: itemId, title: '', servers: [] });

    // Hỗ trợ cơ chế 2-pass `extra` của VAX (dùng trong PhimChill và PhimBom:
    // Trang 1 là trang giới thiệu trả về `extra` chứa link nút "Xem Phim",
    // App tự động fetch tiếp `extra` để lấy danh sách tập `servers`)
    if (detail && detail.extra && (!detail.servers || detail.servers.length === 0)) {
      let extraUrl = String(detail.extra).trim();
      const base = (instance.manifest.baseUrl || instance.manifest.BASEURL || '').replace(/\/+$/, '');
      if (extraUrl && !/^https?:\/\//i.test(extraUrl)) {
        extraUrl = base + (extraUrl.startsWith('/') ? '' : '/') + extraUrl;
      }
      pushLog(instance.id, 'DETAIL-2PASS', `Đang tải trang Xem Phim (extra): ${extraUrl}`);
      const res2 = await asyncHttpRequest(extraUrl, { headers: getPluginHeaders(instance) });
      if (res2 && res2.body) {
        const detail2Str = instance.api.parseMovieDetail(res2.body, extraUrl, effectiveDatasend);
        const detail2 = safeJsonParse(detail2Str, null);
        if (detail2 && Array.isArray(detail2.servers) && detail2.servers.length > 0) {
          detail.servers = detail2.servers;
        }
      }
    }

    // Làm sạch chuỗi JSON ẩn trong description của PhimChill
    if (detail && detail.description) {
      detail.description = String(detail.description).split('\r\n\r\n\r\n')[0].trim();
    }

    return detail;
  }

  async function resolveEpisodeStream(instance, episodeObj, sourceOptionUrl) {
    if (!instance || !instance.api) throw new Error("Plugin không hợp lệ");
    const targetId = sourceOptionUrl || (typeof episodeObj === 'object' ? episodeObj.id : episodeObj);
    const epDatasend = (typeof episodeObj === 'object' && episodeObj.datasend) ? episodeObj.datasend : '';

    const { cleanUrl, datasend } = extractPipeData(targetId);
    const finalDatasend = epDatasend || datasend;

    pushLog(instance.id, 'STREAM', `Resolve tập: ${cleanUrl.slice(0, 120)}`);

    // Nếu plugin định nghĩa getStreamLink và URL không cần tải HTML trước (như FreeReels, PineDrama, SàiGònPhim, TuTiênTV)
    if (instance.api.getStreamLink && (!/^https?:\/\//i.test(cleanUrl) || cleanUrl.includes('example.com') || cleanUrl.includes('/stream?setData='))) {
      try {
        const directStreamStr = instance.api.getStreamLink(targetId, finalDatasend);
        const directStream = safeJsonParse(directStreamStr, null);
        if (directStream && (directStream.url || directStream.m3u8Content)) {
          return directStream;
        }
      } catch (e) {}
    }

    // Chu trình chuẩn: getUrlDetail(episode.id) -> fetch -> parseDetailResponse
    let detailTarget = targetId;
    if (!/^https?:\/\//i.test(cleanUrl) && instance.api.getUrlDetail) {
      detailTarget = instance.api.getUrlDetail(targetId, finalDatasend) || targetId;
    }

    const extracted = extractPipeData(detailTarget);
    const res = await asyncHttpRequest(extracted.cleanUrl, { headers: getPluginHeaders(instance) });

    let streamStr = '';
    if (instance.api.parseDetailResponse) {
      streamStr = instance.api.parseDetailResponse(res.body || '', detailTarget, finalDatasend || extracted.datasend);
    } else if (instance.api.getStreamLink) {
      streamStr = instance.api.getStreamLink(detailTarget, finalDatasend || extracted.datasend);
    }

    let streamData = safeJsonParse(streamStr, { url: '', isEmbed: false, headers: {}, subtitles: [] });

    // Nếu kết quả trả về là Embed trung gian cần bóc lớp 2 qua parseEmbedResponse (ví dụ PhimBom datasend=1 hoặc streamvsmov)
    if (streamData && streamData.url && instance.api.parseEmbedResponse &&
        (streamData.datasend === 1 || streamData.datasend === "1" || /streamvsmov\.com|123embed\.net\/ajax/i.test(streamData.url))) {
      pushLog(instance.id, 'EMBED-2PASS', `Đang bóc lớp 2 Embed: ${streamData.url}`);
      const embedRes = await asyncHttpRequest(streamData.url, { headers: streamData.headers || getPluginHeaders(instance) });
      if (embedRes && embedRes.body) {
        const embedStr = instance.api.parseEmbedResponse(embedRes.body, streamData.url, streamData.datasend);
        const embedParsed = safeJsonParse(embedStr, null);
        if (embedParsed && embedParsed.url) {
          streamData = embedParsed;
        }
      }
    }

    return streamData;
  }

  return {
    compilePlugin,
    fetchList,
    searchMovies,
    fetchMovieDetail,
    resolveEpisodeStream,
    asyncHttpRequest,
    syncHttpRequest,
    _$: globalMiniJQ,
    BASE64,
    getLogs: () => LOG_BUFFER,
    clearLogs: () => { LOG_BUFFER.length = 0; },
    onLog: (cb) => { onLogCallback = cb; }
  };
})();
