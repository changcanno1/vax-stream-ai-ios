import Foundation

// =============================================================================
// BỘ THƯ VIỆN JAVASCRIPT NATIVE ĐƯỢC TRÍCH XUẤT 100% TỪ VAXPLAYER (3).IPA
// Cung cấp: _$, BASE64, getparam, decodeHTMLtext, httpRequest, fetchAll,
// AppCrypto, console, localStorage, __va_invoke
// =============================================================================

enum VaxBuiltinJSLibrary {
    static let code: String = #"""
var global = this;
var globalThis = this;
var window = this;
var self = this;
var __va_global = this;
var popuphtm = "";

function __va_fmt(args) {
    return Array.prototype.slice.call(args).map(function(a) {
        if (a === undefined) return 'undefined';
        if (a === null) return 'null';
        if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (e) { return String(a); }
        }
        return String(a);
    }).join(' ');
}

var console = {
    log:   function() { try { _vaLog('info',  __va_fmt(arguments)); } catch (e) {} },
    info:  function() { try { _vaLog('info',  __va_fmt(arguments)); } catch (e) {} },
    warn:  function() { try { _vaLog('warn',  __va_fmt(arguments)); } catch (e) {} },
    error: function() { try { _vaLog('error', __va_fmt(arguments)); } catch (e) {} },
    debug: function() { try { _vaLog('info',  __va_fmt(arguments)); } catch (e) {} }
};

function print() { try { _vaLog('print', __va_fmt(arguments)); } catch (e) {} }
function log()   { try { _vaLog('info',  __va_fmt(arguments)); } catch (e) {} }
function nativeLog() { try { _vaLog('info', __va_fmt(arguments)); } catch (e) {} }

function _normalizeNetworkOptions(options, defaultMethod) {
    var opts = options || {};
    if (typeof opts === 'string') {
        try { opts = JSON.parse(opts); } catch(e) { opts = {}; }
    }
    var normalized = {};
    if (opts.method || opts.headers || opts.body) {
        normalized.method = opts.method || defaultMethod || "GET";
        normalized.headers = opts.headers || {};
        normalized.body = opts.body || "";
    } else {
        normalized.method = defaultMethod || "GET";
        normalized.headers = opts;
        normalized.body = "";
    }
    return normalized;
}

function httpRequest(url, options) {
    try {
        if (typeof _vaHttpSync !== 'undefined') {
            var opts = _normalizeNetworkOptions(options, "GET");
            var resJson = _vaHttpSync(String(url), JSON.stringify(opts));
            return resJson ? JSON.parse(resJson) : null;
        }
    } catch(e) {
        try { _vaLog('error', 'httpRequest error: ' + String(e)); } catch(err) {}
    }
    return null;
}

function getResponseHeaders(url, options) {
    try {
        var opts = _normalizeNetworkOptions(options, "GET");
        var res = httpRequest(url, opts);
        return res ? (res.headers || {}) : {};
    } catch(e) { return {}; }
}

function getSetCookies(url, options) { return []; }
function getSetCookie(url, options) { return ""; }

function fetchAll(requests, globalOptions) {
    try {
        if (typeof _vaHttpBatchSync !== 'undefined') {
            var reqs = requests;
            if (typeof reqs === 'string') {
                try { reqs = JSON.parse(reqs); } catch(e) { reqs = [reqs]; }
            }
            if (!Array.isArray(reqs)) reqs = [reqs];
            var resJson = _vaHttpBatchSync(JSON.stringify(reqs), JSON.stringify(globalOptions || {}));
            return resJson ? JSON.parse(resJson) : [];
        }
    } catch(e) {
        try { _vaLog('error', 'fetchAll error: ' + String(e)); } catch(err) {}
    }
    return [];
}
var httpBatchRequest = fetchAll;

var FALSE = false;
var TRUE = true;
var NULL = null;

var _vaLocalStorage = {};
var localStorage = {
    getItem:    function(k) { return _vaLocalStorage[k] !== undefined ? _vaLocalStorage[k] : null; },
    setItem:    function(k, v) { _vaLocalStorage[k] = String(v); },
    removeItem: function(k) { delete _vaLocalStorage[k]; },
    clear:      function() { _vaLocalStorage = {}; }
};

var AppCrypto = {
    sha256: function(text) {
        try { if (typeof _vaSha256 !== 'undefined') return _vaSha256(String(text)); } catch (e) {}
        return "";
    },
    hmacSha256: function(message, secret) {
        try { if (typeof _vaHmacSha256 !== 'undefined') return _vaHmacSha256(String(message), String(secret)); } catch (e) {}
        return "";
    },
    resolveStreamUrl: function(streamKey, cdnBase, secret, referer) {
        try { if (typeof _vaResolveStreamUrl !== 'undefined') return _vaResolveStreamUrl(String(streamKey), String(cdnBase), String(secret), String(referer || "")); } catch (e) {}
        return "";
    },
    genStreamUrl: function(streamKey, cdnBase, secret) {
        try { if (typeof _vaResolveStreamUrl !== 'undefined') return _vaResolveStreamUrl(String(streamKey), String(cdnBase), String(secret), ""); } catch (e) {}
        return "";
    },
    fetchDynamicConfig: function() { return ""; },
    resolveStreamfree: function() { return ""; },
    buildStreamfreeSession: function() { return ""; }
};

function getparam(url, param) {
    if (!url || !param) return null;
    try {
        var escapedParam = param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp('[?&]' + escapedParam + '=([^&#]*)');
        var match = String(url).match(regex);
        if (match) {
            try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); }
            catch(e) { return match[1]; }
        }
    } catch(err) {}
    return null;
}

function decodeHTMLtext(text) {
    if (!text) return "";
    return String(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

var BASE64 = {
    encode: function (str) {
        try {
            if (!str) return "";
            var utf8Bytes = [];
            for (var i = 0; i < str.length; i++) {
                var code = str.charCodeAt(i);
                if (code < 128) {
                    utf8Bytes.push(code);
                } else if (code < 2048) {
                    utf8Bytes.push((code >> 6) | 192, (code & 63) | 128);
                } else if ((code & 0xfc00) === 0xd800 && i + 1 < str.length && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                    code = 0x10000 + ((code & 0x03ff) << 10) + (str.charCodeAt(++i) & 0x03ff);
                    utf8Bytes.push((code >> 18) | 240, ((code >> 12) & 63) | 128, ((code >> 6) & 63) | 128, (code & 63) | 128);
                } else {
                    utf8Bytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
                }
            }
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            var encoded = "";
            for (var j = 0; j < utf8Bytes.length; j += 3) {
                var byte1 = utf8Bytes[j];
                var byte2 = j + 1 < utf8Bytes.length ? utf8Bytes[j + 1] : NaN;
                var byte3 = j + 2 < utf8Bytes.length ? utf8Bytes[j + 2] : NaN;
                var b1 = byte1 >> 2;
                var b2 = ((byte1 & 3) << 4) | (isNaN(byte2) ? 0 : byte2 >> 4);
                var b3 = isNaN(byte2) ? 64 : ((byte2 & 15) << 2) | (isNaN(byte3) ? 0 : byte3 >> 6);
                var b4 = isNaN(byte3) ? 64 : byte3 & 63;
                encoded += chars.charAt(b1) + chars.charAt(b2) + chars.charAt(b3) + chars.charAt(b4);
            }
            return encoded;
        } catch (e) { return ""; }
    },
    decode: function (base64String) {
        try {
            if (!base64String) return "";
            var str = String(base64String).trim();
            try { str = decodeURIComponent(str); } catch(e) {}
            str = str.replace(/-/g, "+").replace(/_/g, "/");
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            var output = [];
            var buffer = 0, bits = 0;
            for (var i = 0; i < str.length; i++) {
                var char = str.charAt(i);
                if (char === "=") break;
                var index = chars.indexOf(char);
                if (index === -1) continue;
                buffer = (buffer << 6) | index;
                bits += 6;
                if (bits >= 8) {
                    bits -= 8;
                    output.push((buffer >> bits) & 0xff);
                }
            }
            var result = "";
            var j = 0;
            while (j < output.length) {
                var c = output[j++];
                if (c < 128) {
                    result += String.fromCharCode(c);
                } else if (c > 191 && c < 224) {
                    var c2 = output[j++];
                    result += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                } else if (c > 223 && c < 240) {
                    var c2 = output[j++], c3 = output[j++];
                    result += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                } else if (c >= 240) {
                    var c2 = output[j++], c3 = output[j++], c4 = output[j++];
                    var u = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
                    result += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
                }
            }
            return result;
        } catch (e) { return ""; }
    }
};

function atob(s) { return BASE64.decode(s); }
function btoa(s) { return BASE64.encode(s); }

function _$(param) {
    function parseHTML(htmlString) {
        let nodes = [];
        let root = { id: 0, tag: "ROOT", attrs: {}, childrenIds: [], parentId: null };
        nodes.push(root);
        try {
            let html = (htmlString || "").trim();
            if (!html) return { root, nodes };
            const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
            let stack = [0];
            let tagRegex = /<(?:\/([a-zA-Z0-9_-]+)|([a-zA-Z0-9_-]+)([^>]*?)(\/)?)\s*>/g;
            let lastIndex = 0, match, maxIter = 50000, iter = 0;
            while ((match = tagRegex.exec(html)) !== null && iter++ < maxIter) {
                let textBefore = html.slice(lastIndex, match.index).trim();
                let parentId = stack[stack.length - 1];
                if (textBefore) {
                    let textId = nodes.length;
                    nodes.push({ id: textId, tag: "#text", text: textBefore, attrs: {}, childrenIds: [], parentId: parentId });
                    nodes[parentId].childrenIds.push(textId);
                }
                lastIndex = tagRegex.lastIndex;
                let isCloseTag = !!match[1];
                let tagName = (match[1] || match[2] || "").toLowerCase();
                let attrStr = match[3] || "";
                let isSelfClosing = !!match[4] || VOID_TAGS.has(tagName);
                if (isCloseTag) {
                    for (let i = stack.length - 1; i > 0; i--) {
                        if (nodes[stack[i]].tag === tagName) { stack.splice(i); break; }
                    }
                } else {
                    let attrs = {};
                    let attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
                    let attrMatch;
                    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
                        attrs[attrMatch[1].toLowerCase()] = attrMatch[2] || attrMatch[3] || attrMatch[4] || "";
                    }
                    let nodeId = nodes.length;
                    let node = { id: nodeId, tag: tagName, attrs: attrs, childrenIds: [], parentId: parentId };
                    nodes.push(node);
                    nodes[parentId].childrenIds.push(nodeId);
                    if (!isSelfClosing) stack.push(nodeId);
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

    function getNodeText(node, nodes, depth) {
        if (!node || (depth || 0) > 20) return "";
        if (node.tag === "#text") return node.text || "";
        let parts = [];
        function collectText(curr, d) {
            if (!curr || d > 20) return;
            if (curr.tag === "#text") {
                if (curr.text) parts.push(curr.text);
                return;
            }
            if (curr.childrenIds) {
                for (let i = 0, len = curr.childrenIds.length; i < len; i++) {
                    collectText(nodes[curr.childrenIds[i]], d + 1);
                }
            }
        }
        collectText(node, depth || 0);
        return parts.length > 0 ? parts.join(" ").trim() : "";
    }

    function matchSingleSelector(node, sel, nodes) {
        if (!node || node.tag === "#text" || node.tag === "ROOT") return false;
        let cleanSel = sel.replace(/:first|:last|:eq\([0-9]+\)/gi, "").trim();
        let pseudoContentArg = null;
        let contentMatch = cleanSel.match(/:content\((['"]?)(.*?)\1\)/i);
        if (contentMatch) {
            pseudoContentArg = contentMatch[2];
            cleanSel = cleanSel.replace(contentMatch[0], "").trim();
        }
        if (cleanSel && cleanSel !== "*") {
            let tagMatch = cleanSel.match(/^[a-zA-Z0-9_-]+/);
            if (tagMatch && node.tag !== tagMatch[0].toLowerCase()) return false;
            let idMatch = cleanSel.match(/#([a-zA-Z0-9_-]+)/);
            if (idMatch && (!node.attrs || node.attrs.id !== idMatch[1])) return false;
            let classMatches = cleanSel.match(/\.([a-zA-Z0-9_\-\/\\:]+)/g);
            if (classMatches) {
                if (!node.attrs || !node.attrs.class) return false;
                let elClasses = node.attrs.class.split(/\s+/);
                for (let c of classMatches) {
                    let targetClass = c.substring(1);
                    if (!elClasses.includes(targetClass)) return false;
                }
            }
            let attrMatch = cleanSel.match(/\[([a-zA-Z0-9_-]+)(?:=['"]?(.*?)['"]?)?\]/);
            if (attrMatch) {
                let attrName = attrMatch[1].toLowerCase();
                let attrVal = attrMatch[2];
                if (!node.attrs || !(attrName in node.attrs)) return false;
                if (attrVal !== undefined && node.attrs[attrName] !== attrVal) return false;
            }
        }
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
            if (depth > 50) return;
            let current = nodes[currentId];
            if (!current) return;
            if (current.tag !== "ROOT" && current.tag !== "#text" && current.id !== startNode.id) {
                if (matchSingleSelector(current, selector, nodes)) results.push(current);
            }
            if (current.childrenIds) {
                for (let cid of current.childrenIds) search(cid, depth + 1);
            }
        }
        search(startNode.id, 0);
        if (selector.indexOf(":first") !== -1) return results.slice(0, 1);
        if (selector.indexOf(":last") !== -1) return results.slice(-1);
        let eqMatch = selector.match(/:eq\(([0-9]+)\)/i);
        if (eqMatch) {
            let idx = parseInt(eqMatch[1], 10);
            return results[idx] ? [results[idx]] : [];
        }
        return results;
    }

    function querySelectorAll(startNode, selector, nodes) {
        try {
            if (!startNode || !selector) return [];
            if (selector.indexOf(',') !== -1) {
                let groupSelectors = selector.split(',').map(s => s.trim());
                let resMap = new Map();
                for (let gSel of groupSelectors) {
                    let subRes = querySelectorAll(startNode, gSel, nodes);
                    for (let r of subRes) resMap.set(r.id, r);
                }
                return Array.from(resMap.values());
            }
            let spaceParts = selector.trim().split(/\s+/);
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
            return querySelectorAllSingleLevel(startNode, selector, nodes);
        } catch (err) { return []; }
    }

    function MiniJQ(elements, nodesStore) {
        this.elements = Array.isArray(elements) ? elements : (elements ? [elements] : []);
        this.nodes = nodesStore || [];
        this.length = this.elements.length;
    }

    MiniJQ.prototype = {
        find: function(selector) {
            if (this.elements.length === 0) return new MiniJQ([], this.nodes);
            let matched = [], addedIds = new Set();
            for (let el of this.elements) {
                let res = querySelectorAll(el, selector, this.nodes);
                for (let r of res) {
                    if (!addedIds.has(r.id)) { addedIds.add(r.id); matched.push(r); }
                }
            }
            return new MiniJQ(matched, this.nodes);
        },
        text: function() {
            if (this.elements.length === 0) return "";
            return getNodeText(this.elements[0], this.nodes, 0);
        },
        html: function() {
            if (this.elements.length === 0) return "";
            let self = this;
            let serialize = function(nodeId, depth) {
                if (depth > 20) return "";
                let node = self.nodes[nodeId];
                if (!node) return "";
                if (node.tag === "#text") return node.text || "";
                let attrs = Object.entries(node.attrs || {}).map(([k, v]) => " " + k + '="' + v + '"').join("");
                let childrenHTML = (node.childrenIds || []).map(cid => serialize(cid, depth + 1)).join("");
                return "<" + node.tag + attrs + ">" + childrenHTML + "</" + node.tag + ">";
            };
            return (this.elements[0].childrenIds || []).map(cid => serialize(cid, 0)).join("");
        },
        attr: function(name, value) {
            if (value !== undefined) {
                for (let el of this.elements) {
                    if (el && el.tag !== "#text") {
                        if (!el.attrs) el.attrs = {};
                        el.attrs[name] = value;
                    }
                }
                return this;
            }
            if (this.elements.length === 0 || !this.elements[0].attrs) return "";
            return this.elements[0].attrs[name] || "";
        },
        each: function(callback) {
            if (typeof callback !== 'function') return this;
            this.elements.forEach((el, index) => {
                let jqEl = new MiniJQ([el], this.nodes);
                callback.call(jqEl, index, jqEl);
            });
            return this;
        },
        textAll: function(delimiter) {
            if (delimiter === undefined) delimiter = " ";
            let texts = [];
            for (let el of this.elements) texts.push(getNodeText(el, this.nodes, 0));
            return texts.join(delimiter);
        },
        first: function() { return new MiniJQ(this.elements.length > 0 ? [this.elements[0]] : [], this.nodes); },
        last: function() { return new MiniJQ(this.elements.length > 0 ? [this.elements[this.elements.length - 1]] : [], this.nodes); },
        eq: function(index) { return new MiniJQ(this.elements[index] ? [this.elements[index]] : [], this.nodes); },
        parent: function() {
            let parents = [], addedIds = new Set();
            for (let el of this.elements) {
                if (el && el.parentId !== null && el.parentId !== 0) {
                    let pNode = this.nodes[el.parentId];
                    if (pNode && !addedIds.has(pNode.id)) { addedIds.add(pNode.id); parents.push(pNode); }
                }
            }
            return new MiniJQ(parents, this.nodes);
        },
        next: function() {
            let nexts = [];
            for (let el of this.elements) {
                if (!el || el.parentId === null) continue;
                let pNode = this.nodes[el.parentId];
                if (!pNode) continue;
                let siblings = pNode.childrenIds.map(cid => this.nodes[cid]).filter(c => c && c.tag !== "#text");
                let idx = siblings.findIndex(s => s.id === el.id);
                if (idx !== -1 && idx + 1 < siblings.length) nexts.push(siblings[idx + 1]);
            }
            return new MiniJQ(nexts, this.nodes);
        },
        before: function() {
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
        after: function() { return this.next(); },
        closest: function(selector) {
            let matched = [], addedIds = new Set();
            for (let el of this.elements) {
                let currParentId = el.parentId, depth = 0;
                while (currParentId !== null && currParentId !== 0 && depth++ < 30) {
                    let curr = this.nodes[currParentId];
                    if (!curr) break;
                    if (matchSingleSelector(curr, selector, this.nodes)) {
                        if (!addedIds.has(curr.id)) { addedIds.add(curr.id); matched.push(curr); }
                        break;
                    }
                    currParentId = curr.parentId;
                }
            }
            return new MiniJQ(matched, this.nodes);
        }
    };

    try {
        if (!param) return new MiniJQ([], []);
        if (param instanceof MiniJQ) return param;
        if (typeof param === "string") {
            let parsed = parseHTML(param);
            return new MiniJQ(parsed.root, parsed.nodes);
        }
        return new MiniJQ(param, []);
    } catch (err) { return new MiniJQ([], []); }
}

function __va_invoke(name, args) {
    var fn = __va_global[name];
    if (typeof fn !== 'function') return "__VA_NOFN__";
    try {
        var res = fn.apply(__va_global, args || []);
        if (typeof res === 'string') return res;
        if (res === undefined || res === null) return "null";
        return JSON.stringify(res);
    } catch (e) {
        var detail = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
        return "__VA_ERR__:" + detail;
    }
}
"""#
}
