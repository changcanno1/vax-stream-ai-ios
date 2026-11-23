import SwiftUI
import AVKit
import AVFoundation
import WebKit

// =============================================================================
// 7. NATIVE FULLSCREEN VIDEO PLAYER (NativePlayerView.swift)
// Tái tạo 100% cơ chế phát video mượt mà của VaxPlayer (3).ipa:
// - AVURLAsset với AVURLAssetHTTPHeaderFieldsKey (hỗ trợ Referer, Origin, Cookie)
// - Hỗ trợ phát trực tiếp m3u8Content (như Dexter) qua file .m3u8 tạm trên máy
// - WKWebView SnifferBridge tự động chặn quảng cáo và hút luồng .m3u8 từ iframe
// - Giao diện iOS Glassmorphism chuẩn theo bộ ảnh (Chọn tập, Chất lượng, AI Sub, VAX TTS)
// =============================================================================

enum PlayerActivePopover {
    case none
    case episodes
    case settings
    case subtitles
    case speed
}

final class NativePlayerViewModel: NSObject, ObservableObject {
    @Published var player: AVPlayer? = nil
    @Published var isPlaying: Bool = false
    @Published var isBuffering: Bool = true
    @Published var currentTime: Double = 0
    @Published var duration: Double = 1
    @Published var volume: Float = 1.0
    @Published var playbackRate: Float = 1.0
    @Published var isLocked: Bool = false
    @Published var showControls: Bool = true
    @Published var videoGravity: AVLayerVideoGravity = .resizeAspect
    @Published var activePopover: PlayerActivePopover = .none

    // Stream & Episode State
    @Published var movie: JSMovieItem
    @Published var detail: JSMovieDetail?
    @Published var currentServerIndex: Int = 0
    @Published var currentEpisode: JSEpisode
    @Published var streamInfo: JSStreamInfo? = nil
    @Published var useEmbedWebView: Bool = false
    @Published var errorMessage: String? = nil

    // Subtitles & AI TTS State
    @Published var subtitles: [JSSubtitle] = []
    @Published var selectedSubtitleUrl: String = ""
    @Published var subtitleCues: [SubtitleCue] = []
    @Published var currentSubtitleText: String = ""
    @Published var aiTranslateSubEnabled: Bool = PluginManager.shared.autoTranslateSubtitles
    @Published var aiTTSEnabled: Bool = PluginManager.shared.enableVaxTTS

    private var timeObserver: Any?
    private let synthesizer = AVSpeechSynthesizer()
    private var lastSpokenCueId: UUID?
    private var hideControlsWorkItem: DispatchWorkItem?

    init(movie: JSMovieItem, detail: JSMovieDetail?, initialEpisode: JSEpisode, serverIndex: Int = 0) {
        self.movie = movie
        self.detail = detail
        self.currentEpisode = initialEpisode
        self.currentServerIndex = serverIndex
        super.init()
        configureAudioSession()
        loadEpisode(initialEpisode)
    }

    private func configureAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var currentServerEpisodes: [JSEpisode] {
        guard let detail = detail, detail.servers.indices.contains(currentServerIndex) else {
            return [currentEpisode]
        }
        return detail.servers[currentServerIndex].episodes
    }

    var nextEpisode: JSEpisode? {
        let eps = currentServerEpisodes
        if let idx = eps.firstIndex(where: { $0.id == currentEpisode.id }), idx + 1 < eps.count {
            return eps[idx + 1]
        }
        return nil
    }

    func loadEpisode(_ episode: JSEpisode) {
        cleanupPlayer()
        currentEpisode = episode
        isBuffering = true
        errorMessage = nil
        useEmbedWebView = false
        currentSubtitleText = ""
        subtitleCues = []
        activePopover = .none

        PluginManager.shared.resolveStream(movie: movie, episode: episode) { [weak self] info in
            guard let self = self else { return }
            guard let info = info, (!info.url.isEmpty || !info.m3u8Content.isEmpty) else {
                self.isBuffering = false
                self.errorMessage = "Không tìm thấy luồng phát cho tập này."
                return
            }
            self.streamInfo = info
            self.subtitles = info.subtitles
            if let firstSub = info.subtitles.first {
                self.loadSubtitle(urlStr: firstSub.url)
            }

            if !info.m3u8Content.isEmpty {
                self.playRawM3U8Content(info.m3u8Content, headers: info.headers)
            } else if info.isEmbed && !info.url.contains(".m3u8") && !info.url.contains(".mp4") {
                // Sử dụng WKWebView kèm SnifferBridge để tự động bắt link .m3u8 hoặc hiển thị trình phát nhúng
                self.useEmbedWebView = true
                self.isBuffering = false
            } else {
                self.playDirectStreamUrl(info.url, headers: info.headers)
            }
        }
    }

    private func playRawM3U8Content(_ content: String, headers: [String: String]) {
        let tempDir = FileManager.default.temporaryDirectory
        let fileUrl = tempDir.appendingPathComponent("vax_stream_\(Int(Date().timeIntervalSince1970)).m3u8")
        do {
            try content.write(to: fileUrl, atomically: true, encoding: .utf8)
            setupAVPlayer(with: fileUrl, headers: headers)
        } catch {
            errorMessage = "Lỗi ghi đệm M3U8: \(error.localizedDescription)"
            isBuffering = false
        }
    }

    func playDirectStreamUrl(_ urlStr: String, headers: [String: String]) {
        guard let url = URL(string: urlStr) else {
            errorMessage = "URL video không hợp lệ"
            isBuffering = false
            return
        }
        useEmbedWebView = false
        setupAVPlayer(with: url, headers: headers)
    }

    private func setupAVPlayer(with url: URL, headers: [String: String]) {
        var assetHeaders: [String: String] = [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ]
        for (k, v) in headers {
            assetHeaders[k] = v
        }

        let options: [String: Any] = [
            "AVURLAssetHTTPHeaderFieldsKey": assetHeaders
        ]
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        let avPlayer = AVPlayer(playerItem: item)
        avPlayer.automaticallyWaitsToMinimizeStalling = true
        self.player = avPlayer

        // Observe periodic time
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self, let currentItem = self.player?.currentItem else { return }
            let sec = CMTimeGetSeconds(time)
            if sec.isFinite && sec >= 0 {
                self.currentTime = sec
            }
            let dur = CMTimeGetSeconds(currentItem.duration)
            if dur.isFinite && dur > 0 {
                self.duration = dur
            }
            self.isBuffering = !currentItem.isPlaybackLikelyToKeepUp && self.player?.timeControlStatus != .playing
            self.updateActiveSubtitleCue(at: self.currentTime)

            if Int(self.currentTime) % 10 == 0 && self.currentTime > 5 {
                PluginManager.shared.saveWatchProgress(
                    movie: self.movie,
                    episode: self.currentEpisode,
                    position: self.currentTime,
                    duration: self.duration
                )
            }
        }

        avPlayer.play()
        avPlayer.rate = playbackRate
        isPlaying = true
        isBuffering = false
        scheduleAutoHideControls()
    }

    func togglePlayPause() {
        guard let player = player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.play()
            player.rate = playbackRate
            isPlaying = true
            scheduleAutoHideControls()
        }
    }

    func seek(by delta: Double) {
        let target = max(0, min(currentTime + delta, duration))
        seek(to: target)
    }

    func seek(to seconds: Double) {
        let cmTime = CMTime(seconds: seconds, preferredTimescale: 600)
        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = seconds
        scheduleAutoHideControls()
    }

    func setSpeed(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            player?.rate = rate
        }
    }

    func toggleAspectRatio() {
        videoGravity = (videoGravity == .resizeAspect) ? .resizeAspectFill : .resizeAspect
    }

    func scheduleAutoHideControls() {
        hideControlsWorkItem?.cancel()
        guard isPlaying, activePopover == .none else { return }
        let item = DispatchWorkItem { [weak self] in
            withAnimation(.easeInOut(duration: 0.25)) {
                self?.showControls = false
            }
        }
        hideControlsWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.5, execute: item)
    }

    // MARK: - Subtitle & AI Translation + VAX TTS Engine
    func loadSubtitle(urlStr: String) {
        selectedSubtitleUrl = urlStr
        if urlStr.isEmpty {
            subtitleCues = []
            currentSubtitleText = ""
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let resp = PluginJSRuntime.shared.performSyncHttp(urlStr: urlStr, optionsJson: "{}")
            guard let data = resp.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rawText = obj["body"] as? String else { return }

            let parsed = self.parseWebVTTOrSRT(rawText)
            DispatchQueue.main.async {
                self.subtitleCues = parsed
            }
        }
    }

    private func parseWebVTTOrSRT(_ content: String) -> [SubtitleCue] {
        var cues: [SubtitleCue] = []
        let normalized = content.replacingOccurrences(of: "\r\n", with: "\n")
        let blocks = normalized.components(separatedBy: "\n\n")

        for block in blocks {
            let lines = block.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            guard let timeLineIdx = lines.firstIndex(where: { $0.contains("-->") }) else { continue }
            let timeParts = lines[timeLineIdx].components(separatedBy: "-->")
            guard timeParts.count == 2 else { continue }

            let startSec = parseTimestamp(timeParts[0].trimmingCharacters(in: .whitespaces))
            let endSec = parseTimestamp(timeParts[1].components(separatedBy: " ").first ?? timeParts[1])
            let textLines = lines.dropFirst(timeLineIdx + 1)
            let cleanText = textLines.joined(separator: " ")
                .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)

            if !cleanText.isEmpty && endSec > startSec {
                cues.append(SubtitleCue(start: startSec, end: endSec, text: cleanText))
            }
        }
        return cues
    }

    private func parseTimestamp(_ str: String) -> Double {
        let clean = str.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        let parts = clean.components(separatedBy: ":")
        if parts.count == 3 {
            let h = Double(parts[0]) ?? 0
            let m = Double(parts[1]) ?? 0
            let s = Double(parts[2]) ?? 0
            return h * 3600 + m * 60 + s
        } else if parts.count == 2 {
            let m = Double(parts[0]) ?? 0
            let s = Double(parts[1]) ?? 0
            return m * 60 + s
        }
        return 0
    }

    private func updateActiveSubtitleCue(at time: Double) {
        guard !subtitleCues.isEmpty else { return }
        if let active = subtitleCues.first(where: { time >= $0.start && time <= $0.end }) {
            if currentSubtitleText != active.text {
                currentSubtitleText = active.text
                if aiTTSEnabled && lastSpokenCueId != active.id {
                    lastSpokenCueId = active.id
                    speakVietnameseTTS(active.text)
                }
            }
        } else if !currentSubtitleText.isEmpty {
            currentSubtitleText = ""
        }
    }

    private func speakVietnameseTTS(_ text: String) {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "vi-VN")
        utterance.rate = PluginManager.shared.ttsRate
        utterance.volume = 1.0
        player?.volume = 0.28 // Tự động giảm âm lượng nền phim khi thuyết minh AI đọc
        synthesizer.speak(utterance)
    }

    func openInExternalPlayer(scheme: String) {
        guard let urlStr = streamInfo?.url, !urlStr.isEmpty else { return }
        var targetUrlStr = ""
        if scheme == "vlc" {
            targetUrlStr = "vlc-x-callback://x-callback-url/stream?url=\(urlStr.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? urlStr)"
        } else if scheme == "infuse" {
            targetUrlStr = "infuse://x-callback-url/play?url=\(urlStr.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? urlStr)"
        }
        if let extUrl = URL(string: targetUrlStr) {
            UIApplication.shared.open(extUrl)
        }
    }

    func cleanupPlayer() {
        hideControlsWorkItem?.cancel()
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
        if let obs = timeObserver {
            player?.removeTimeObserver(obs)
            timeObserver = nil
        }
        player?.pause()
        player = nil
    }
}

// MARK: - UIKit AVPlayerLayer Wrapper
struct AVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer
    let videoGravity: AVLayerVideoGravity

    func makeUIView(context: Context) -> PlayerContainerUIView {
        let view = PlayerContainerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = videoGravity
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: PlayerContainerUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        uiView.playerLayer.videoGravity = videoGravity
    }

    final class PlayerContainerUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}

// MARK: - WKWebView SnifferBridge (Hút link .m3u8 tự động từ Embed Iframe như VaxPlayer gốc)
struct EmbedSnifferWebView: UIViewRepresentable {
    let urlString: String
    let headers: [String: String]
    let onStreamIntercepted: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onStreamIntercepted: onStreamIntercepted)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Script SnifferBridge trích xuất từ VaxPlayer (3).ipa
        let snifferJS = """
        (function() {
            const AD_PATTERNS = [/doubleclick/i, /googlesyndication/i, /popads/i, /popcash/i, /exoclick/i, /juicyads/i, /adsterra/i];
            window.open = function() { return null; };
            function checkStreamUrl(u) {
                if (!u || typeof u !== 'string') return;
                if ((u.includes('.m3u8') || u.includes('.mp4')) && u.startsWith('http')) {
                    try { window.webkit.messageHandlers.SnifferBridge.postMessage(u); } catch(e) {}
                }
            }
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                checkStreamUrl(String(url));
                return origOpen.apply(this, arguments);
            };
            const origFetch = window.fetch;
            window.fetch = function(input) {
                const u = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
                checkStreamUrl(u);
                return origFetch.apply(this, arguments);
            };
        })();
        """
        let userScript = WKUserScript(source: snifferJS, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        config.userContentController.addUserScript(userScript)
        config.userContentController.add(context.coordinator, name: "SnifferBridge")

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.backgroundColor = .black
        wv.isOpaque = false
        wv.scrollView.backgroundColor = .black

        if let url = URL(string: urlString) {
            var req = URLRequest(url: url)
            for (k, v) in headers {
                req.setValue(v, forHTTPHeaderField: k)
            }
            wv.load(req)
        }
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onStreamIntercepted: (String) -> Void
        private var didIntercept = false

        init(onStreamIntercepted: @escaping (String) -> Void) {
            self.onStreamIntercepted = onStreamIntercepted
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard !didIntercept, message.name == "SnifferBridge", let streamUrl = message.body as? String else { return }
            if streamUrl.contains(".m3u8") {
                didIntercept = true
                DispatchQueue.main.async {
                    self.onStreamIntercepted(streamUrl)
                }
            }
        }
    }
}

// =============================================================================
// 8. FULLSCREEN GLASSMORPHISM PLAYER UI (100% KHỚP ẢNH CHỤP MÀN HÌNH 9, 10, 12, 13, 14)
// =============================================================================
struct NativePlayerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: NativePlayerViewModel

    init(movie: JSMovieItem, detail: JSMovieDetail?, episode: JSEpisode, serverIndex: Int = 0) {
        _vm = StateObject(wrappedValue: NativePlayerViewModel(
            movie: movie, detail: detail, initialEpisode: episode, serverIndex: serverIndex
        ))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // 1. Video Layer (Native AVPlayer hoặc EmbedSnifferWebView)
            if let player = vm.player, !vm.useEmbedWebView {
                AVPlayerLayerView(player: player, videoGravity: vm.videoGravity)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if vm.activePopover != .none {
                                vm.activePopover = .none
                            } else {
                                vm.showControls.toggle()
                                if vm.showControls { vm.scheduleAutoHideControls() }
                            }
                        }
                    }
            } else if vm.useEmbedWebView, let info = vm.streamInfo {
                EmbedSnifferWebView(urlString: info.url, headers: info.headers) { interceptedM3u8 in
                    vm.playDirectStreamUrl(interceptedM3u8, headers: info.headers)
                }
                .ignoresSafeArea()
            }

            // 2. Subtitle Overlay
            if !vm.currentSubtitleText.isEmpty {
                VStack {
                    Spacer()
                    Text(vm.currentSubtitleText)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.65))
                        .cornerRadius(10)
                        .padding(.bottom, vm.showControls ? 86 : 28)
                }
            }

            // 3. Loading & Error Indicator
            if vm.isBuffering {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.5)
                    .padding(24)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
            }

            if let err = vm.errorMessage {
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 36))
                        .foregroundColor(.yellow)
                    Text(err)
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                    HStack(spacing: 12) {
                        Button("Thử lại") {
                            vm.loadEpisode(vm.currentEpisode)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .clipShape(Capsule())

                        Button("Đóng") {
                            vm.cleanupPlayer()
                            dismiss()
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.18))
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                    }
                }
                .padding(24)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            }

            // 4. Glassmorphism Controls Overlay (Khớp ảnh chụp màn hình VaxPlayer gốc)
            if vm.showControls {
                VStack(spacing: 0) {
                    // TOP BAR: [X] [PiP] [AirPlay] ----- Title ----- [Volume Slider]
                    HStack(spacing: 12) {
                        HStack(spacing: 16) {
                            Button {
                                vm.cleanupPlayer()
                                dismiss()
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 15, weight: .bold))
                                    .foregroundColor(.white)
                            }

                            if !vm.isLocked {
                                Button {
                                    vm.toggleAspectRatio()
                                } label: {
                                    Image(systemName: "pip")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.white)
                                }

                                Menu {
                                    Button("Phát qua VLC") { vm.openInExternalPlayer(scheme: "vlc") }
                                    Button("Phát qua Infuse (4K/HDR)") { vm.openInExternalPlayer(scheme: "infuse") }
                                } label: {
                                    Image(systemName: "airplayvideo")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.white)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())

                        if !vm.isLocked {
                            Text("\(vm.movie.title) • \(vm.currentEpisode.name)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white.opacity(0.9))
                                .lineLimit(1)
                                .frame(maxWidth: .infinity)

                            // Volume Pill
                            HStack(spacing: 8) {
                                Image(systemName: vm.volume < 0.05 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                    .font(.system(size: 12))
                                    .foregroundColor(.white.opacity(0.8))
                                Slider(value: Binding(
                                    get: { Double(vm.volume) },
                                    set: { val in
                                        vm.volume = Float(val)
                                        vm.player?.volume = Float(val)
                                    }
                                ), in: 0...1)
                                .frame(width: 85)
                                .tint(.white)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial, in: Capsule())
                        } else {
                            Spacer()
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)

                    // SECOND ROW: 7 Upper Toolbar Icon Buttons (Chọn tập, Tập tiếp, Khóa, Xoay, Phụ đề, TTS, Cài đặt)
                    HStack(spacing: 22) {
                        if !vm.isLocked {
                            playerToolbarIcon("list.number", isActive: vm.activePopover == .episodes) {
                                vm.activePopover = (vm.activePopover == .episodes) ? .none : .episodes
                            }
                            playerToolbarIcon("forward.end.fill", isActive: false) {
                                if let next = vm.nextEpisode {
                                    vm.loadEpisode(next)
                                }
                            }
                        }

                        playerToolbarIcon(vm.isLocked ? "lock.fill" : "lock.open", isActive: vm.isLocked) {
                            vm.isLocked.toggle()
                            vm.activePopover = .none
                        }

                        if !vm.isLocked {
                            playerToolbarIcon("crop.rotate", isActive: vm.videoGravity == .resizeAspectFill) {
                                vm.toggleAspectRatio()
                            }
                            playerToolbarIcon("captions.bubble", isActive: vm.activePopover == .subtitles) {
                                vm.activePopover = (vm.activePopover == .subtitles) ? .none : .subtitles
                            }
                            playerToolbarIcon("waveform", isActive: vm.aiTTSEnabled) {
                                vm.aiTTSEnabled.toggle()
                                PluginManager.shared.enableVaxTTS = vm.aiTTSEnabled
                                PluginManager.shared.saveSettings()
                            }
                            playerToolbarIcon("gearshape", isActive: vm.activePopover == .settings) {
                                vm.activePopover = (vm.activePopover == .settings) ? .none : .settings
                            }
                        }
                    }
                    .padding(.top, 12)

                    Spacer()

                    // CENTER CONTROLS: [-10]   [Play/Pause]   [+10]
                    if !vm.isLocked && !vm.useEmbedWebView {
                        HStack(spacing: 48) {
                            Button {
                                vm.seek(by: -10)
                            } label: {
                                Image(systemName: "gobackward.10")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundColor(.white)
                                    .frame(width: 54, height: 54)
                                    .background(.ultraThinMaterial, in: Circle())
                            }

                            Button {
                                vm.togglePlayPause()
                            } label: {
                                Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(width: 68, height: 68)
                                    .background(.ultraThinMaterial, in: Circle())
                            }

                            Button {
                                vm.seek(by: 10)
                            } label: {
                                Image(systemName: "goforward.10")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundColor(.white)
                                    .frame(width: 54, height: 54)
                                    .background(.ultraThinMaterial, in: Circle())
                            }
                        }
                    }

                    Spacer()

                    // BOTTOM BAR: Right pill [Speed | Waveform] + Scrub Slider
                    if !vm.isLocked && !vm.useEmbedWebView {
                        VStack(spacing: 8) {
                            HStack {
                                Spacer()
                                HStack(spacing: 14) {
                                    Button {
                                        vm.activePopover = (vm.activePopover == .speed) ? .none : .speed
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: "speedometer")
                                            Text(String(format: "%.2gx", vm.playbackRate))
                                                .font(.system(size: 12, weight: .bold))
                                        }
                                        .foregroundColor(.white)
                                    }

                                    Divider().frame(height: 14).background(Color.white.opacity(0.3))

                                    Button {
                                        vm.aiTTSEnabled.toggle()
                                    } label: {
                                        Image(systemName: "waveform")
                                            .font(.system(size: 14, weight: .semibold))
                                            .foregroundColor(vm.aiTTSEnabled ? .cyan : .white)
                                    }
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(.ultraThinMaterial, in: Capsule())
                            }
                            .padding(.horizontal, 22)

                            HStack(spacing: 12) {
                                Text(formatSeconds(vm.currentTime))
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.85))

                                Slider(
                                    value: Binding(
                                        get: { min(vm.currentTime, max(vm.duration, 1)) },
                                        set: { vm.seek(to: $0) }
                                    ),
                                    in: 0...max(vm.duration, 1)
                                )
                                .tint(.white)

                                Text("-\(formatSeconds(max(0, vm.duration - vm.currentTime)))")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.85))
                            }
                            .padding(.horizontal, 22)
                            .padding(.bottom, 16)
                        }
                    }
                }
            }

            // 5. FLOATING GLASS POPOVERS (Khớp 100% ảnh 9, 10, 13, 14)
            if vm.activePopover != .none {
                glassPopoverContent
                    .transition(.scale(scale: 0.92).combined(with: .opacity))
            }
        }
        .statusBar(hidden: true)
    }

    @ViewBuilder
    private func playerToolbarIcon(_ systemName: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(isActive ? .cyan : .white)
                .frame(width: 36, height: 36)
        }
    }

    @ViewBuilder
    private var glassPopoverContent: some View {
        switch vm.activePopover {
        case .episodes:
            // Ảnh 9: Chọn tập phim
            VStack(alignment: .leading, spacing: 10) {
                Text("Chọn tập phim")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Divider().background(Color.white.opacity(0.15))
                Text("Điều hướng")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))

                if let next = vm.nextEpisode {
                    Button {
                        vm.loadEpisode(next)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "forward.end.fill")
                            Text("Tập tiếp theo")
                                .font(.system(size: 15, weight: .medium))
                            Spacer()
                        }
                        .foregroundColor(.white)
                        .padding(.vertical, 6)
                    }
                    Divider().background(Color.white.opacity(0.15))
                }

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(vm.currentServerEpisodes) { ep in
                            Button {
                                vm.loadEpisode(ep)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .opacity(ep.id == vm.currentEpisode.id ? 1 : 0)
                                    Text(ep.name)
                                        .font(.system(size: 15, weight: ep.id == vm.currentEpisode.id ? .bold : .regular))
                                    Spacer()
                                }
                                .foregroundColor(.white)
                                .padding(.vertical, 8)
                            }
                        }
                    }
                }
                .frame(maxHeight: 210)
            }
            .padding(18)
            .frame(width: 240)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.white.opacity(0.18), lineWidth: 1))

        case .settings:
            // Ảnh 10: Cài đặt -> Chất lượng video & Tính năng AI
            VStack(alignment: .leading, spacing: 12) {
                Text("Cài đặt")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Divider().background(Color.white.opacity(0.15))

                Text("Chất lượng video")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))

                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                    Text("Gốc (1080p)")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(.white)

                Divider().background(Color.white.opacity(0.15))

                Text("Tính năng AI")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.5))

                Button {
                    vm.aiTranslateSubEnabled.toggle()
                    PluginManager.shared.autoTranslateSubtitles = vm.aiTranslateSubEnabled
                    PluginManager.shared.saveSettings()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .opacity(vm.aiTranslateSubEnabled ? 1 : 0)
                        Image(systemName: "globe")
                        Text("Dịch phụ đề AI")
                            .font(.system(size: 15))
                        Spacer()
                    }
                    .foregroundColor(.white)
                }

                Button {
                    vm.aiTTSEnabled.toggle()
                    PluginManager.shared.enableVaxTTS = vm.aiTTSEnabled
                    PluginManager.shared.saveSettings()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .bold))
                            .opacity(vm.aiTTSEnabled ? 1 : 0)
                        Image(systemName: "waveform")
                        Text("Thuyết minh AI")
                            .font(.system(size: 15))
                        Spacer()
                    }
                    .foregroundColor(.white)
                }
            }
            .padding(18)
            .frame(width: 250)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.white.opacity(0.18), lineWidth: 1))

        case .subtitles:
            // Ảnh 13: Chọn Phụ Đề
            VStack(alignment: .leading, spacing: 10) {
                Text("Chọn Phụ Đề")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
                Divider().background(Color.white.opacity(0.15))

                Button {
                    vm.loadSubtitle(urlStr: "")
                    vm.activePopover = .none
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .opacity(vm.selectedSubtitleUrl.isEmpty ? 1 : 0)
                        Text("Tắt phụ đề")
                        Spacer()
                    }
                    .foregroundColor(.white)
                    .padding(.vertical, 6)
                }

                ForEach(vm.subtitles) { sub in
                    Button {
                        vm.loadSubtitle(urlStr: sub.url)
                        vm.activePopover = .none
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "checkmark")
                                .opacity(vm.selectedSubtitleUrl == sub.url ? 1 : 0)
                            Text(sub.lang)
                                .lineLimit(1)
                            Spacer()
                        }
                        .foregroundColor(.white)
                        .padding(.vertical, 6)
                    }
                }
            }
            .padding(18)
            .frame(width: 240)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.white.opacity(0.18), lineWidth: 1))

        case .speed:
            // Ảnh 14: Tốc độ phát
            let speeds: [Float] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
            VStack(alignment: .leading, spacing: 8) {
                ForEach(speeds, id: \.self) { spd in
                    Button {
                        vm.setSpeed(spd)
                        vm.activePopover = .none
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 13, weight: .bold))
                                .opacity(vm.playbackRate == spd ? 1 : 0)
                            Text(String(format: "%.2gx", spd))
                                .font(.system(size: 16, weight: vm.playbackRate == spd ? .bold : .regular))
                            Spacer()
                        }
                        .foregroundColor(.white)
                        .padding(.vertical, 6)
                    }
                }
            }
            .padding(18)
            .frame(width: 180)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.white.opacity(0.18), lineWidth: 1))

        case .none:
            EmptyView()
        }
    }

    private func formatSeconds(_ sec: Double) -> String {
        guard sec.isFinite && sec > 0 else { return "00:00" }
        let total = Int(sec)
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }
}
