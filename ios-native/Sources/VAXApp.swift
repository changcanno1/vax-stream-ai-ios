import UIKit
import WebKit
import AVFoundation

// =============================================================================
// 1. NATIVE HTTP PROXY SCHEME HANDLER (vax-proxy://fetch?d=<base64>)
// Cho phép JavaScript trong WKWebView gọi synchronous/asynchronous XHR
// thông qua tầng URLSession Native của iOS:
// - Vượt 100% CORS trên mọi trang web xem phim và luồng M3U8
// - Cho phép gắn mọi Forbidden Header: Referer, Origin, User-Agent, Cookie,
//   X-VAX-YB, X-F4K-PT, api-key, Authorization...
// =============================================================================
class VaxProxySchemeHandler: NSObject, WKURLSchemeHandler {
    private var activeTasks: [ObjectIdentifier: URLSessionDataTask] = [:]
    private let lock = NSLock()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let reqUrl = urlSchemeTask.request.url,
              let components = URLComponents(url: reqUrl, resolvingAgainstBaseURL: false),
              let b64Payload = components.queryItems?.first(where: { $0.name == "d" })?.value else {
            sendError(urlSchemeTask, code: 400, message: "Missing base64 payload 'd'")
            return
        }

        // Chuẩn hóa base64 URL-safe
        var standardB64 = b64Payload
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = standardB64.count % 4
        if remainder > 0 {
            standardB64 += String(repeating: "=", count: 4 - remainder)
        }

        guard let decodedData = Data(base64Encoded: standardB64),
              let json = try? JSONSerialization.jsonObject(with: decodedData) as? [String: Any],
              let targetUrlStr = json["url"] as? String,
              let targetUrl = URL(string: targetUrlStr) else {
            sendError(urlSchemeTask, code: 400, message: "Invalid target URL in payload")
            return
        }

        let method = (json["method"] as? String ?? "GET").uppercased()
        var request = URLRequest(url: targetUrl, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 22)
        request.httpMethod = method

        // Mặc định gắn User-Agent & Referer chuẩn nếu plugin không truyền
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        if let scheme = targetUrl.scheme, let host = targetUrl.host {
            request.setValue("\(scheme)://\(host)/", forHTTPHeaderField: "Referer")
        }

        if let headers = json["headers"] as? [String: Any] {
            for (k, v) in headers {
                request.setValue("\(v)", forHTTPHeaderField: k)
            }
        }

        if let bodyStr = json["body"] as? String, !bodyStr.isEmpty, method != "GET" && method != "HEAD" {
            request.httpBody = bodyStr.data(using: .utf8)
        }

        let taskKey = ObjectIdentifier(urlSchemeTask)
        let dataTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            self?.lock.lock()
            let isStillActive = self?.activeTasks.removeValue(forKey: taskKey) != nil
            self?.lock.unlock()

            guard isStillActive else { return }

            if let error = error {
                self?.sendError(urlSchemeTask, code: 502, message: error.localizedDescription)
                return
            }

            let httpResp = response as? HTTPURLResponse
            let statusCode = httpResp?.statusCode ?? 200
            let respData = data ?? Data()

            let headerFields: [String: String] = [
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Content-Type": httpResp?.value(forHTTPHeaderField: "Content-Type") ?? "text/plain; charset=utf-8",
                "X-Final-Url": httpResp?.url?.absoluteString ?? targetUrlStr
            ]

            if let proxyResp = HTTPURLResponse(url: reqUrl, statusCode: statusCode, httpVersion: "HTTP/1.1", headerFields: headerFields) {
                urlSchemeTask.didReceive(proxyResp)
                urlSchemeTask.didReceive(respData)
                urlSchemeTask.didFinish()
            } else {
                self?.sendError(urlSchemeTask, code: 500, message: "Failed to build HTTPURLResponse")
            }
        }

        lock.lock()
        activeTasks[taskKey] = dataTask
        lock.unlock()
        dataTask.resume()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let taskKey = ObjectIdentifier(urlSchemeTask)
        lock.lock()
        let task = activeTasks.removeValue(forKey: taskKey)
        lock.unlock()
        task?.cancel()
    }

    private func sendError(_ task: WKURLSchemeTask, code: Int, message: String) {
        let reqUrl = task.request.url ?? URL(string: "vax-proxy://error")!
        let headers = [
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json; charset=utf-8"
        ]
        if let resp = HTTPURLResponse(url: reqUrl, statusCode: code, httpVersion: "HTTP/1.1", headerFields: headers) {
            task.didReceive(resp)
            let errBody = "{\"error\":\"\(message.replacingOccurrences(of: "\"", with: "\\\""))\"}".data(using: .utf8) ?? Data()
            task.didReceive(errBody)
            task.didFinish()
        }
    }
}

// =============================================================================
// 2. MAIN VIEW CONTROLLER (FULLSCREEN DARK CINEMA WKWEBVIEW)
// =============================================================================
class MainViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        // Cho phép phát âm thanh nền & PiP ngay cả khi gạt nút chuông iPhone
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Đăng ký scheme vax-proxy:// để JS trong app gọi Native HTTP không bị chặn CORS
        config.setURLSchemeHandler(VaxProxySchemeHandler(), forURLScheme: "vax-proxy")

        // Bơm biến toàn cục báo cho vax-runtime.js biết đang chạy trong Native iOS IPA
        let bootstrapJS = "window.__VAX_IOS_NATIVE__ = true;"
        let userScript = WKUserScript(source: bootstrapJS, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        config.userContentController.addUserScript(userScript)

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.uiDelegate = self

        view.addSubview(webView)

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            let wwwDir = indexURL.deletingLastPathComponent()
            webView.loadFileURL(indexURL, allowingReadAccessTo: wwwDir)
        }
    }

    // Hỗ trợ mở VLC / Infuse Pro qua deep-link url scheme
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() {
            if scheme == "vlc" || scheme == "infuse" || scheme == "vlc-x-callback" {
                if UIApplication.shared.canOpenURL(url) {
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                }
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    // Hỗ trợ window.prompt / alert / confirm trong WKWebView (dùng khi Đổi Domain, Cloud Sync)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "VAX", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Đóng", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "VAX", message: prompt, preferredStyle: .alert)
        alert.addTextField { tf in tf.text = defaultText }
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "Xác nhận", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}

// =============================================================================
// 3. APP DELEGATE ENTRY POINT
// =============================================================================
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let win = UIWindow(frame: UIScreen.main.bounds)
        win.backgroundColor = .black
        win.rootViewController = MainViewController()
        win.makeKeyAndVisible()
        self.window = win
        return true
    }
}
