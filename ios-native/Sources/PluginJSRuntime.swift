import Foundation
import JavaScriptCore
import CryptoKit

// =============================================================================
// 2. NATIVE JAVASCRIPTCORE ENGINE (PluginJSRuntime.swift)
// Chạy 100% trên background thread bằng JavaScriptCore gốc của Apple iOS,
// cung cấp nguyên bản bộ thư viện JsBuiltinLibraries (_$, BASE64, getparam,
// httpRequest, fetchAll, AppCrypto, _vaHttpSync, _vaHttpBatchSync) được trích
// xuất trực tiếp từ file binary VaxPlayer (3).ipa của bạn!
// =============================================================================

final class PluginJSRuntime {
    static let shared = PluginJSRuntime()

    private let jsQueue = DispatchQueue(label: "com.vaxplayer.jsruntime", qos: .userInitiated)
    private var contexts: [String: JSContext] = [:]
    private let session: URLSession

    private init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.timeoutIntervalForResource = 30
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        self.session = URLSession(configuration: cfg)
    }

    // Thực hiện HTTP Request đồng bộ trên Background Thread (Không bao giờ khóa UI!)
    func performSyncHttp(urlStr: String, optionsJson: String) -> String {
        var targetUrlStr = urlStr.trimmingCharacters(in: .whitespacesAndNewlines)
        if targetUrlStr.isEmpty || targetUrlStr.hasPrefix("https://example.com") {
            return "{\"status\":200,\"isSuccessful\":true,\"ok\":true,\"body\":\"\",\"url\":\"\(targetUrlStr)\"}"
        }

        // Giải mã vax.local bridge nếu plugin gọi https://vax.local/p?d=<base64>
        if targetUrlStr.hasPrefix("https://vax.local/p?d="),
           let b64 = targetUrlStr.components(separatedBy: "?d=").last {
            var std = b64.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            let rem = std.count % 4
            if rem > 0 { std += String(repeating: "=", count: 4 - rem) }
            if let data = Data(base64Encoded: std),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let innerUrl = obj["url"] as? String {
                let innerOptsData = (try? JSONSerialization.data(withJSONObject: obj)) ?? Data()
                let innerOptsStr = String(data: innerOptsData, encoding: .utf8) ?? "{}"
                let innerResStr = performSyncHttp(urlStr: innerUrl, optionsJson: innerOptsStr)
                if let rData = innerResStr.data(using: .utf8),
                   let rJson = try? JSONSerialization.jsonObject(with: rData) as? [String: Any],
                   let body = rJson["body"] as? String {
                    let wrapped: [String: Any] = [
                        "status": rJson["status"] ?? 200,
                        "isSuccessful": rJson["isSuccessful"] ?? true,
                        "ok": rJson["isSuccessful"] ?? true,
                        "body": (try? String(data: JSONSerialization.data(withJSONObject: ["data": body]), encoding: .utf8)) ?? body
                    ]
                    if let wData = try? JSONSerialization.data(withJSONObject: wrapped),
                       let wStr = String(data: wData, encoding: .utf8) {
                        return wStr
                    }
                }
            }
        }

        // Bỏ phần |data:... nếu có
        if let pipeIdx = targetUrlStr.firstIndex(of: "|") {
            targetUrlStr = String(targetUrlStr[..<pipeIdx])
        }

        guard let url = URL(string: targetUrlStr) else {
            return "{\"status\":0,\"isSuccessful\":false,\"error\":\"Invalid URL\",\"body\":\"\"}"
        }

        var method = "GET"
        var headers: [String: String] = [:]
        var bodyStr = ""

        if let optData = optionsJson.data(using: .utf8),
           let optDict = try? JSONSerialization.jsonObject(with: optData) as? [String: Any] {
            if let m = optDict["method"] as? String, !m.isEmpty { method = m.uppercased() }
            if let h = optDict["headers"] as? [String: Any] {
                for (k, v) in h { headers[k] = "\(v)" }
            }
            if let b = optDict["body"] as? String { bodyStr = b }
        }

        var req = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 18)
        req.httpMethod = method
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        if let scheme = url.scheme, let host = url.host {
            req.setValue("\(scheme)://\(host)/", forHTTPHeaderField: "Referer")
        }

        for (k, v) in headers {
            req.setValue(v, forHTTPHeaderField: k)
        }

        if !bodyStr.isEmpty && method != "GET" && method != "HEAD" {
            req.httpBody = bodyStr.data(using: .utf8)
        }

        let sem = DispatchSemaphore(value: 0)
        var statusCode = 0
        var respBody = ""
        var finalUrl = targetUrlStr
        var respHeaders: [String: String] = [:]

        let task = session.dataTask(with: req) { data, resp, _ in
            if let http = resp as? HTTPURLResponse {
                statusCode = http.statusCode
                finalUrl = http.url?.absoluteString ?? targetUrlStr
                for (k, v) in http.allHeaderFields {
                    respHeaders["\(k)"] = "\(v)"
                }
            }
            if let data = data {
                respBody = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
            }
            sem.signal()
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 20)

        let isOk = (statusCode >= 200 && statusCode < 400)
        let resultDict: [String: Any] = [
            "status": statusCode,
            "isSuccessful": isOk,
            "ok": isOk,
            "body": respBody,
            "data": respBody,
            "url": finalUrl,
            "headers": respHeaders
        ]

        if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
           let jsonStr = String(data: jsonData, encoding: .utf8) {
            return jsonStr
        }
        return "{\"status\":0,\"isSuccessful\":false,\"body\":\"\"}"
    }

    func performBatchHttp(requestsJson: String, globalOptsJson: String) -> String {
        guard let rData = requestsJson.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: rData) as? [Any] else {
            return "[]"
        }

        var globalHeaders: [String: Any] = [:]
        if let gData = globalOptsJson.data(using: .utf8),
           let gDict = try? JSONSerialization.jsonObject(with: gData) as? [String: Any],
           let gh = gDict["headers"] as? [String: Any] {
            globalHeaders = gh
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var results: [Int: [String: Any]] = [:]

        for (idx, item) in arr.enumerated() {
            var u = ""
            var opts: [String: Any] = ["method": "GET", "headers": globalHeaders]
            if let s = item as? String {
                u = s
            } else if let d = item as? [String: Any] {
                u = (d["url"] as? String) ?? ""
                opts["method"] = (d["method"] as? String) ?? "GET"
                var mergedH = globalHeaders
                if let dh = d["headers"] as? [String: Any] {
                    for (k, v) in dh { mergedH[k] = v }
                }
                opts["headers"] = mergedH
                if let b = d["body"] as? String { opts["body"] = b }
            }

            group.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                let optData = (try? JSONSerialization.data(withJSONObject: opts)) ?? Data()
                let optStr = String(data: optData, encoding: .utf8) ?? "{}"
                let resStr = self.performSyncHttp(urlStr: u, optionsJson: optStr)
                if let data = resStr.data(using: .utf8),
                   let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    lock.lock()
                    results[idx] = obj
                    lock.unlock()
                }
                group.leave()
            }
        }

        _ = group.wait(timeout: .now() + 22)
        var ordered: [[String: Any]] = []
        for i in 0..<arr.count {
            ordered.append(results[i] ?? ["status": 0, "isSuccessful": false, "body": ""])
        }
        if let outData = try? JSONSerialization.data(withJSONObject: ordered),
           let outStr = String(data: outData, encoding: .utf8) {
            return outStr
        }
        return "[]"
    }

    // Khởi tạo JSContext với đúng bộ thư viện JsBuiltinLibraries từ VaxPlayer (3).ipa
    func loadPlugin(pluginId: String, script: String) -> PluginManifest? {
        return jsQueue.sync {
            let ctx = JSContext()!
            ctx.name = "VAX_\(pluginId)"

            // 1. Bridge _vaLog
            let vaLog: @convention(block) (String, String) -> Void = { level, msg in
                PluginConsole.shared.log(pluginId: pluginId, level: level, message: msg)
            }
            ctx.setObject(vaLog, forKeyedSubscript: "_vaLog" as NSString)

            // 2. Bridge _vaHttpSync
            let vaHttpSync: @convention(block) (String, String) -> String = { [weak self] url, opts in
                return self?.performSyncHttp(urlStr: url, optionsJson: opts) ?? "{\"status\":0,\"isSuccessful\":false,\"body\":\"\"}"
            }
            ctx.setObject(vaHttpSync, forKeyedSubscript: "_vaHttpSync" as NSString)

            // 3. Bridge _vaHttpBatchSync
            let vaHttpBatchSync: @convention(block) (String, String) -> String = { [weak self] reqs, gOpts in
                return self?.performBatchHttp(requestsJson: reqs, globalOptsJson: gOpts) ?? "[]"
            }
            ctx.setObject(vaHttpBatchSync, forKeyedSubscript: "_vaHttpBatchSync" as NSString)

            // 4. Bridge _vaSha256 & _vaHmacSha256 & _vaGenStreamUrl
            let vaSha256: @convention(block) (String) -> String = { text in
                let digest = SHA256.hash(data: Data(text.utf8))
                return digest.map { String(format: "%02x", $0) }.joined()
            }
            ctx.setObject(vaSha256, forKeyedSubscript: "_vaSha256" as NSString)

            let vaHmacSha256: @convention(block) (String, String) -> String = { message, secret in
                let key = SymmetricKey(data: Data(secret.utf8))
                let mac = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: key)
                return Data(mac).map { String(format: "%02x", $0) }.joined()
            }
            ctx.setObject(vaHmacSha256, forKeyedSubscript: "_vaHmacSha256" as NSString)

            let vaResolveStreamUrl: @convention(block) (String, String, String, String) -> String = { key, cdn, _, _ in
                if key.hasPrefix("http") { return key }
                let cleanCdn = cdn.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                let cleanKey = key.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                return "\(cleanCdn)/\(cleanKey)"
            }
            ctx.setObject(vaResolveStreamUrl, forKeyedSubscript: "_vaResolveStreamUrl" as NSString)

            // 5. Evaluate JsBuiltinLibraries (trích xuất từ VaxPlayer IPA gốc)
            ctx.evaluateScript(VaxBuiltinJSLibrary.code)
            ctx.evaluateScript(script)

            contexts[pluginId] = ctx

            // Gọi getManifest()
            guard let res = ctx.evaluateScript("__va_invoke('getManifest', [])")?.toString(),
                  !res.hasPrefix("__VA_"),
                  let data = res.data(using: .utf8),
                  let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }
            return PluginManifest.parse(from: dict, fallbackId: pluginId)
        }
    }

    func callFunction(pluginId: String, fnName: String, args: [Any] = []) -> String? {
        return jsQueue.sync {
            guard let ctx = contexts[pluginId] else { return nil }
            guard let invokeFn = ctx.objectForKeyedSubscript("__va_invoke") else { return nil }
            guard let res = invokeFn.call(withArguments: [fnName, args])?.toString() else { return nil }
            if res == "__VA_NOFN__" || res.hasPrefix("__VA_ERR__:") {
                if res.hasPrefix("__VA_ERR__:") {
                    PluginConsole.shared.log(pluginId: pluginId, level: "error", message: "\(fnName) error: \(res)")
                }
                return nil
            }
            return res
        }
    }

    func hasFunction(pluginId: String, fnName: String) -> Bool {
        return jsQueue.sync {
            guard let ctx = contexts[pluginId] else { return false }
            return ctx.evaluateScript("typeof __va_global['\(fnName)'] === 'function'")?.toBool() ?? false
        }
    }
}

// =============================================================================
// 3. PLUGIN CONSOLE LOGGER (LocalPluginConsole.swift)
// =============================================================================
final class PluginConsole: ObservableObject {
    static let shared = PluginConsole()
    @Published var logs: [String] = []
    private let lock = NSLock()

    func log(pluginId: String, level: String, message: String) {
        let timeStr = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        let entry = "[\(timeStr)] [\(pluginId)] [\(level.uppercased())] \(message)"
        DispatchQueue.main.async {
            self.logs.insert(entry, at: 0)
            if self.logs.count > 250 { self.logs.removeLast() }
        }
    }

    func clear() {
        DispatchQueue.main.async { self.logs.removeAll() }
    }
}
