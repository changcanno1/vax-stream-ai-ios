import SwiftUI
import UniformTypeIdentifiers

// =============================================================================
// 9. NATIVE IMAGE CACHE & MOVIE CARD (CachedAsyncImage.swift + MovieCard.swift)
// =============================================================================
final class NativeImageCache {
    static let shared = NativeImageCache()
    private let cache = NSCache<NSString, UIImage>()
    private init() {
        cache.countLimit = 300
    }
    func image(for url: String) -> UIImage? {
        cache.object(forKey: url as NSString)
    }
    func set(_ img: UIImage, for url: String) {
        cache.setObject(img, forKey: url as NSString)
    }
    func clear() {
        cache.removeAllObjects()
    }
}

struct CachedPosterImage: View {
    let urlString: String
    @State private var uiImage: UIImage? = nil

    var body: some View {
        ZStack {
            if let img = uiImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else {
                LinearGradient(
                    colors: [Color(white: 0.14), Color(white: 0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .overlay(
                    Image(systemName: "film")
                        .font(.system(size: 22))
                        .foregroundColor(.white.opacity(0.22))
                )
            }
        }
        .onAppear { loadImage() }
        .onChange(of: urlString) { _ in
            uiImage = nil
            loadImage()
        }
    }

    private func loadImage() {
        let clean = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        if let cached = NativeImageCache.shared.image(for: clean) {
            uiImage = cached
            return
        }
        guard let url = URL(string: clean) else { return }
        var req = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 15)
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", forHTTPHeaderField: "User-Agent")
        if let scheme = url.scheme, let host = url.host {
            req.setValue("\(scheme)://\(host)/", forHTTPHeaderField: "Referer")
        }
        URLSession.shared.dataTask(with: req) { data, _, _ in
            if let data = data, let decoded = UIImage(data: data) {
                NativeImageCache.shared.set(decoded, for: clean)
                DispatchQueue.main.async {
                    self.uiImage = decoded
                }
            }
        }.resume()
    }
}

struct MovieCardView: View {
    let movie: JSMovieItem
    var width: CGFloat = 126
    var height: CGFloat = 182

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topLeading) {
                CachedPosterImage(urlString: movie.posterUrl)
                    .frame(width: width, height: height)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    )

                if !movie.episodeCurrent.isEmpty || !movie.quality.isEmpty {
                    Text(!movie.episodeCurrent.isEmpty ? movie.episodeCurrent : movie.quality)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.black.opacity(0.72), in: Capsule())
                        .padding(7)
                }
            }

            Text(movie.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .frame(width: width, alignment: .leading)
        }
    }
}

// =============================================================================
// 10. ROOT CONTENT VIEW WITH FLOATING GLASS TAB BAR + SEARCH BUTTON
// (Khớp 100% thiết kế thanh Tab Bar kính mờ + nút Search tròn bên phải)
// =============================================================================
enum VaxTab: Int {
    case home = 0
    case genre = 1
    case history = 2
    case settings = 3
}

struct ContentView: View {
    @StateObject private var pm = PluginManager.shared
    @State private var selectedTab: VaxTab = .home
    @State private var showSourcePicker: Bool = false
    @State private var showSearchSheet: Bool = false
    @State private var showAIPluginStudio: Bool = false
    @State private var selectedMovie: JSMovieItem? = nil
    @State private var selectedCategory: JSCategoryTag? = nil

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.ignoresSafeArea()

            // Main Tab Content
            Group {
                switch selectedTab {
                case .home:
                    HomeView(
                        onOpenSourcePicker: { showSourcePicker = true },
                        onOpenAIStudio: { showAIPluginStudio = true },
                        onSelectMovie: { selectedMovie = $0 },
                        onSelectGenre: { tag in
                            selectedCategory = tag
                            selectedTab = .genre
                        }
                    )
                case .genre:
                    GenreExplorerView(
                        initialGenre: selectedCategory,
                        onSelectMovie: { selectedMovie = $0 }
                    )
                case .history:
                    HistoryAndFavoritesView(
                        onSelectMovie: { selectedMovie = $0 }
                    )
                case .settings:
                    SettingsRootView(
                        onOpenAIStudio: { showAIPluginStudio = true }
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Floating Glass Bottom Bar + Circular Search Button (Khớp ảnh 1-8)
            HStack(spacing: 12) {
                HStack(spacing: 0) {
                    tabBarItem(tab: .home, icon: "house.fill", title: "Trang chủ")
                    tabBarItem(tab: .genre, icon: "square.grid.2x2.fill", title: "Thể loại")
                    tabBarItem(tab: .history, icon: "clock.fill", title: "Lịch sử")
                    tabBarItem(tab: .settings, icon: "gearshape.fill", title: "Cài đặt")
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.16), lineWidth: 0.8))

                Button {
                    showSearchSheet = true
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 56, height: 56)
                        .background(.ultraThinMaterial, in: Circle())
                        .overlay(Circle().stroke(Color.white.opacity(0.16), lineWidth: 0.8))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showSourcePicker) {
            SourcePickerSheet(
                onOpenAIStudio: {
                    showSourcePicker = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showAIPluginStudio = true
                    }
                }
            )
        }
        .sheet(isPresented: $showSearchSheet) {
            SearchSheetView(onSelectMovie: { movie in
                showSearchSheet = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    selectedMovie = movie
                }
            })
        }
        .sheet(isPresented: $showAIPluginStudio) {
            AIPluginStudioSheet()
        }
        .fullScreenCover(item: $selectedMovie) { movie in
            MovieDetailScreen(movie: movie)
        }
    }

    @ViewBuilder
    private func tabBarItem(tab: VaxTab, icon: String, title: String) -> some View {
        let isSelected = (selectedTab == tab)
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundColor(isSelected ? Color(red: 0.22, green: 0.65, blue: 1.0) : .white.opacity(0.75))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(
                Group {
                    if isSelected {
                        Capsule().fill(Color.white.opacity(0.14))
                    }
                }
            )
        }
    }
}

// =============================================================================
// 11. HOME VIEW (Ảnh 8: Pill nguồn phim trên cùng + Hero Poster + Khám Phá Thể Loại + Xem tiếp)
// =============================================================================
struct HomeView: View {
    @ObservedObject private var pm = PluginManager.shared
    let onOpenSourcePicker: () -> Void
    let onOpenAIStudio: () -> Void
    let onSelectMovie: (JSMovieItem) -> Void
    let onSelectGenre: (JSCategoryTag) -> Void

    private let genreColors: [Color] = [
        Color(red: 0.36, green: 0.14, blue: 0.42),
        Color(red: 0.42, green: 0.15, blue: 0.22),
        Color(red: 0.40, green: 0.27, blue: 0.15),
        Color(red: 0.14, green: 0.34, blue: 0.42),
        Color(red: 0.16, green: 0.38, blue: 0.26),
        Color(red: 0.44, green: 0.20, blue: 0.32)
    ]

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    // 1. HERO BANNER (Khớp ảnh 8)
                    ZStack(alignment: .bottom) {
                        if let hero = pm.heroMovie {
                            CachedPosterImage(urlString: hero.backdropUrl.isEmpty ? hero.posterUrl : hero.backdropUrl)
                                .frame(width: UIScreen.main.bounds.width, height: 470)
                                .clipped()
                        } else {
                            LinearGradient(
                                colors: [Color(red: 0.15, green: 0.18, blue: 0.25), .black],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(width: UIScreen.main.bounds.width, height: 470)
                        }

                        // Fade to black at bottom
                        LinearGradient(
                            colors: [.clear, .black.opacity(0.75), .black],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 220)

                        if let hero = pm.heroMovie {
                            VStack(spacing: 16) {
                                Text(hero.title.uppercased())
                                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                                    .foregroundColor(Color(red: 0.93, green: 0.78, blue: 0.56))
                                    .multilineTextAlignment(.center)
                                    .shadow(color: .black.opacity(0.8), radius: 8, x: 0, y: 4)
                                    .padding(.horizontal, 24)

                                Button {
                                    onSelectMovie(hero)
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: "play.fill")
                                            .font(.system(size: 15, weight: .bold))
                                        Text("Xem Phim")
                                            .font(.system(size: 16, weight: .bold))
                                    }
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 28)
                                    .padding(.vertical, 13)
                                    .background(Color(red: 0.16, green: 0.33, blue: 0.48), in: Capsule())
                                    .overlay(Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1))
                                }
                            }
                            .padding(.bottom, 18)
                        }
                    }

                    // 2. KHÁM PHÁ THỂ LOẠI (Colored cards khớp ảnh 8)
                    if !pm.genreList.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Khám Phá Thể Loại")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 16)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(Array(pm.genreList.enumerated()), id: \.element.id) { idx, tag in
                                        let bgColor = genreColors[idx % genreColors.count]
                                        Button {
                                            onSelectGenre(tag)
                                        } label: {
                                            Text(tag.name)
                                                .font(.system(size: 15, weight: .bold))
                                                .foregroundColor(.white)
                                                .frame(width: 142, height: 68)
                                                .background(bgColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                        .stroke(Color.white.opacity(0.18), lineWidth: 1)
                                                )
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }

                    // 3. XEM TIẾP (Watch History Row khớp ảnh 8)
                    if !pm.watchHistory.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Xem tiếp")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 16)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(pm.watchHistory.prefix(12)) { hist in
                                        Button {
                                            let item = JSMovieItem(
                                                id: hist.movieId,
                                                title: hist.title,
                                                posterUrl: hist.posterUrl,
                                                backdropUrl: hist.backdropUrl,
                                                description: "",
                                                year: "",
                                                quality: "HD",
                                                episodeCurrent: hist.episodeName,
                                                lang: "Vietsub",
                                                datasend: hist.datasend,
                                                pluginId: hist.pluginId
                                            )
                                            onSelectMovie(item)
                                        } label: {
                                            MovieCardView(
                                                movie: JSMovieItem(
                                                    id: hist.movieId,
                                                    title: hist.title,
                                                    posterUrl: hist.posterUrl,
                                                    backdropUrl: hist.backdropUrl,
                                                    description: "",
                                                    year: "",
                                                    quality: "HD",
                                                    episodeCurrent: hist.episodeName,
                                                    lang: "",
                                                    datasend: hist.datasend,
                                                    pluginId: hist.pluginId
                                                ),
                                                width: 140,
                                                height: 196
                                            )
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }

                    // 4. LOADING / ERROR / HOME SHELVES
                    if pm.isLoadingHome {
                        HStack {
                            Spacer()
                            VStack(spacing: 12) {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(1.3)
                                Text("Đang tải phim từ \(pm.activePlugin?.name ?? "nguồn")...")
                                    .font(.subheadline)
                                    .foregroundColor(.white.opacity(0.7))
                            }
                            .padding(.vertical, 40)
                            Spacer()
                        }
                    } else if let err = pm.homeError {
                        VStack(spacing: 14) {
                            Text(err)
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.8))
                                .multilineTextAlignment(.center)
                            HStack(spacing: 12) {
                                Button("Thử lại") {
                                    pm.loadHomeForActivePlugin()
                                }
                                .padding(.horizontal, 18)
                                .padding(.vertical, 10)
                                .background(Color.blue, in: Capsule())
                                .foregroundColor(.white)

                                Button("Đổi Nguồn Phim") {
                                    onOpenSourcePicker()
                                }
                                .padding(.horizontal, 18)
                                .padding(.vertical, 10)
                                .background(Color.white.opacity(0.15), in: Capsule())
                                .foregroundColor(.white)
                            }
                        }
                        .padding(24)
                        .frame(maxWidth: .infinity)
                    } else {
                        ForEach(pm.homeShelves) { shelf in
                            VStack(alignment: .leading, spacing: 12) {
                                Text(shelf.section.title)
                                    .font(.system(size: 20, weight: .bold))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)

                                ScrollView(.horizontal, showsIndicators: false) {
                                    LazyHStack(spacing: 14) {
                                        ForEach(shelf.movies) { movie in
                                            Button {
                                                onSelectMovie(movie)
                                            } label: {
                                                MovieCardView(movie: movie, width: 132, height: 190)
                                            }
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                }
                            }
                        }
                    }

                    Spacer(minLength: 100)
                }
            }
            .ignoresSafeArea(edges: .top)

            // TOP FLOATING SOURCE PILL ("Dexter ⌄" + Nút AI Tạo Plugin nhanh)
            HStack {
                Spacer()
                Button {
                    onOpenSourcePicker()
                } label: {
                    HStack(spacing: 6) {
                        Text(pm.activePlugin?.name ?? "Chọn nguồn")
                            .font(.system(size: 14, weight: .semibold))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 0.8))
                }
                Spacer()
            }
            .overlay(alignment: .trailing) {
                Button {
                    onOpenAIStudio()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 12, weight: .bold))
                        Text("AI Web")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        LinearGradient(colors: [.purple, .blue], startPoint: .leading, endPoint: .trailing),
                        in: Capsule()
                    )
                }
                .padding(.trailing, 16)
            }
            .padding(.top, 8)
        }
    }
}

// =============================================================================
// 12. SOURCE PICKER SHEET (Ảnh 7: Chọn nguồn - 2 cột + Tất cả / Yêu thích / Movie / Phim ngắn)
// =============================================================================
struct SourcePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared
    let onOpenAIStudio: () -> Void

    @State private var searchText: String = ""
    @State private var selectedFilter: String = "all" // all, fav, movie, short, ai
    @State private var showFileImporter: Bool = false

    var filteredPlugins: [PluginManifest] {
        pm.plugins.filter { p in
            if !pm.allow18Plus && p.isAdult { return false }
            if !searchText.isEmpty {
                let q = searchText.lowercased()
                if !p.name.lowercased().contains(q) && !p.id.lowercased().contains(q) {
                    return false
                }
            }
            switch selectedFilter {
            case "fav":
                return pm.favoritePluginIds.contains(p.id)
            case "movie":
                return p.type.uppercased() == "MOVIE"
            case "short":
                return p.type.uppercased().contains("SHORT") || p.layoutType.uppercased() == "VERTICAL"
            case "ai":
                return p.isAiGenerated
            default:
                return true
            }
        }
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.05, green: 0.05, blue: 0.06).ignoresSafeArea()

                VStack(spacing: 14) {
                    // Header: [X] --- Chọn nguồn --- [File+ / AI+]
                    HStack {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.08), in: Circle())
                        }

                        Spacer()
                        Text("Chọn nguồn")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                        Spacer()

                        Menu {
                            Button {
                                onOpenAIStudio()
                            } label: {
                                Label("Tạo Plugin từ Link Web (AI)", systemImage: "sparkles")
                            }
                            Button {
                                showFileImporter = true
                            } label: {
                                Label("Cài file Plugin (.js) từ máy", systemImage: "doc.badge.plus")
                            }
                        } label: {
                            Image(systemName: "doc.badge.plus")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.08), in: Circle())
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)

                    // Search Bar
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)
                        TextField("Tìm kiếm nguồn (tên, ID)...", text: $searchText)
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.white.opacity(0.08), in: Capsule())
                    .padding(.horizontal, 16)

                    // Filter Pills (Tất cả, ♥ Yêu thích, 🎬 Movie, 📱 Phim ngắn, ✨ AI tạo)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            filterPill(id: "all", label: "Tất cả", icon: nil)
                            filterPill(id: "fav", label: "Yêu thích", icon: "heart.fill")
                            filterPill(id: "movie", label: "Movie", icon: "film")
                            filterPill(id: "short", label: "Phim ngắn", icon: "play.rectangle")
                            filterPill(id: "ai", label: "AI tạo", icon: "sparkles")
                        }
                        .padding(.horizontal, 16)
                    }

                    // 2-Column Grid of Sources (Khớp ảnh 7)
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 12) {
                            ForEach(filteredPlugins) { plugin in
                                let isCurrent = (pm.activePlugin?.id == plugin.id)
                                let isFav = pm.favoritePluginIds.contains(plugin.id)

                                Button {
                                    pm.selectPlugin(plugin)
                                    dismiss()
                                } label: {
                                    VStack(alignment: .leading, spacing: 10) {
                                        HStack {
                                            // Icon or First Letter Badge
                                            ZStack {
                                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                    .fill(Color.white.opacity(0.1))
                                                    .frame(width: 40, height: 40)
                                                Text(String(plugin.name.prefix(1)).uppercased())
                                                    .font(.system(size: 18, weight: .bold))
                                                    .foregroundColor(.white)
                                            }

                                            Spacer()

                                            Button {
                                                pm.toggleFavoritePlugin(plugin.id)
                                            } label: {
                                                Image(systemName: isFav ? "heart.fill" : "heart")
                                                    .font(.system(size: 16))
                                                    .foregroundColor(isFav ? .red : .gray)
                                            }
                                        }

                                        Text(plugin.name)
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundColor(.white)
                                            .lineLimit(1)

                                        Text("v\(plugin.version)")
                                            .font(.system(size: 12))
                                            .foregroundColor(.gray)
                                    }
                                    .padding(14)
                                    .background(
                                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .fill(Color.white.opacity(isCurrent ? 0.14 : 0.06))
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .stroke(isCurrent ? Color.blue : Color.white.opacity(0.08), lineWidth: isCurrent ? 1.5 : 1)
                                    )
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationBarHidden(true)
            .fileImporter(
                isPresented: $showFileImporter,
                allowedContentTypes: [.javaScript, .plainText, .data],
                allowsMultipleSelection: true
            ) { result in
                if let urls = try? result.get() {
                    for url in urls {
                        let secured = url.startAccessingSecurityScopedResource()
                        if let code = try? String(contentsOf: url, encoding: .utf8) {
                            _ = pm.installCustomPlugin(rawScript: code, selectImmediately: true)
                        }
                        if secured { url.stopAccessingSecurityScopedResource() }
                    }
                    dismiss()
                }
            }
        }
    }

    @ViewBuilder
    private func filterPill(id: String, label: String, icon: String?) -> some View {
        let active = (selectedFilter == id)
        Button {
            selectedFilter = id
        } label: {
            HStack(spacing: 5) {
                if let ic = icon {
                    Image(systemName: ic)
                        .font(.system(size: 12))
                }
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(active ? Color.blue : Color.white.opacity(0.08), in: Capsule())
        }
    }
}

// =============================================================================
// 13. MOVIE DETAIL SCREEN (Ảnh 11: Full-bleed poster, Xem Ngay, Server tabs, 4-col Episode Grid)
// =============================================================================
struct MovieDetailScreen: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared
    let movie: JSMovieItem

    @State private var detail: JSMovieDetail? = nil
    @State private var isLoading: Bool = true
    @State private var selectedServerIdx: Int = 0
    @State private var playingEpisode: JSEpisode? = nil
    @State private var expandDescription: Bool = false

    private let epColumns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    // 1. Backdrop Header + Title + [▶ Xem Ngay] [♡] [+]
                    ZStack(alignment: .bottom) {
                        CachedPosterImage(urlString: detail?.backdropUrl ?? movie.backdropUrl)
                            .frame(width: UIScreen.main.bounds.width, height: 420)
                            .clipped()

                        LinearGradient(
                            colors: [.clear, .black.opacity(0.82), .black],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 250)

                        VStack(spacing: 10) {
                            Text(detail?.title ?? movie.title)
                                .font(.system(size: 24, weight: .heavy))
                                .foregroundColor(.white)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 20)

                            if let origin = detail?.originName, !origin.isEmpty {
                                Text(origin)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.gray)
                            }

                            // Meta Badges: 2021 • HD • Hoàn Tất
                            HStack(spacing: 8) {
                                let y = detail?.year ?? movie.year
                                if !y.isEmpty {
                                    Text(y).foregroundColor(.gray)
                                    Text("•").foregroundColor(.gray)
                                }
                                Text(detail?.quality ?? movie.quality)
                                    .font(.system(size: 12, weight: .bold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
                                    .foregroundColor(.white)

                                if let st = detail?.status, !st.isEmpty {
                                    Text("•").foregroundColor(.gray)
                                    Text(st).foregroundColor(.gray)
                                }
                            }
                            .font(.system(size: 13, weight: .medium))

                            // Action Buttons: [▶ Xem Ngay]  [♡]
                            HStack(spacing: 12) {
                                Button {
                                    if let firstEp = currentEpisodes.first {
                                        playingEpisode = firstEp
                                    }
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: "play.fill")
                                        Text("Xem Ngay")
                                            .font(.system(size: 16, weight: .bold))
                                    }
                                    .foregroundColor(.black)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                }

                                let isFav = pm.isMovieFavorite(movie)
                                Button {
                                    pm.toggleFavoriteMovie(movie)
                                } label: {
                                    Image(systemName: isFav ? "heart.fill" : "heart")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(isFav ? .red : .white)
                                        .frame(width: 50, height: 50)
                                        .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 6)
                        }
                    }

                    // 2. Description & Casts
                    VStack(alignment: .leading, spacing: 10) {
                        let desc = detail?.description ?? movie.description
                        if !desc.isEmpty {
                            Text(desc)
                                .font(.system(size: 14))
                                .foregroundColor(.white.opacity(0.85))
                                .lineLimit(expandDescription ? nil : 3)
                                .onTapGesture { expandDescription.toggle() }
                        }

                        if let cat = detail?.category, !cat.isEmpty {
                            Text("Thể loại: \(cat)")
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                        }
                        if let casts = detail?.casts, !casts.isEmpty {
                            Text("Diễn viên: \(casts)")
                                .font(.system(size: 13))
                                .foregroundColor(.gray)
                                .lineLimit(2)
                        }
                    }
                    .padding(.horizontal, 18)

                    // 3. Server Tabs & 4-Column Episode Grid (Khớp ảnh 11)
                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView("Đang tải danh sách tập...")
                                .foregroundColor(.gray)
                                .padding(.vertical, 30)
                            Spacer()
                        }
                    } else if let d = detail, !d.servers.isEmpty {
                        VStack(alignment: .leading, spacing: 14) {
                            // Server Selector
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(Array(d.servers.enumerated()), id: \.offset) { idx, sv in
                                        let active = (selectedServerIdx == idx)
                                        Button {
                                            selectedServerIdx = idx
                                        } label: {
                                            HStack(spacing: 6) {
                                                Image(systemName: "server.rack")
                                                    .font(.system(size: 12))
                                                Text(sv.name)
                                                    .font(.system(size: 13, weight: .bold))
                                            }
                                            .foregroundColor(active ? .black : .white)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 8)
                                            .background(active ? Color.white : Color.white.opacity(0.1), in: Capsule())
                                        }
                                    }
                                }
                                .padding(.horizontal, 18)
                            }

                            HStack {
                                Text("Danh sách tập")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundColor(.white)
                                Spacer()
                                Text("\(currentEpisodes.count) tập")
                                    .font(.system(size: 13))
                                    .foregroundColor(.gray)
                            }
                            .padding(.horizontal, 18)

                            LazyVGrid(columns: epColumns, spacing: 10) {
                                ForEach(currentEpisodes) { ep in
                                    Button {
                                        playingEpisode = ep
                                    } label: {
                                        Text(ep.name)
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                                    .stroke(Color.white.opacity(0.12), lineWidth: 1)
                                            )
                                    }
                                }
                            }
                            .padding(.horizontal, 18)
                        }
                    }

                    Spacer(minLength: 60)
                }
            }
            .ignoresSafeArea(edges: .top)

            // Back Button [<]
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding(.leading, 16)
            .padding(.top, 12)
        }
        .onAppear {
            pm.fetchMovieDetail(movie: movie) { fetched in
                self.detail = fetched
                self.isLoading = false
            }
        }
        .fullScreenCover(item: $playingEpisode) { ep in
            NativePlayerView(
                movie: movie,
                detail: detail,
                episode: ep,
                serverIndex: selectedServerIdx
            )
        }
    }

    private var currentEpisodes: [JSEpisode] {
        guard let d = detail, d.servers.indices.contains(selectedServerIdx) else { return [] }
        return d.servers[selectedServerIdx].episodes
    }
}

// =============================================================================
// 14. GENRE EXPLORER, SEARCH SHEET, AND WATCH HISTORY VIEWS
// =============================================================================
struct GenreExplorerView: View {
    @ObservedObject private var pm = PluginManager.shared
    let initialGenre: JSCategoryTag?
    let onSelectMovie: (JSMovieItem) -> Void

    @State private var selectedSlug: String = ""
    @State private var movies: [JSMovieItem] = []
    @State private var isLoading: Bool = false
    @State private var page: Int = 1

    private let gridCols = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Khám Phá Thể Loại")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.top, 14)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pm.genreList) { tag in
                        let active = (selectedSlug == tag.slug)
                        Button {
                            selectedSlug = tag.slug
                            page = 1
                            loadGenreMovies(reset: true)
                        } label: {
                            Text(tag.name)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(active ? Color.blue : Color.white.opacity(0.1), in: Capsule())
                        }
                    }
                }
                .padding(.horizontal, 16)
            }

            if isLoading && movies.isEmpty {
                Spacer()
                HStack {
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    Spacer()
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVGrid(columns: gridCols, spacing: 16) {
                        ForEach(movies) { m in
                            Button {
                                onSelectMovie(m)
                            } label: {
                                MovieCardView(movie: m, width: (UIScreen.main.bounds.width - 56) / 3, height: 162)
                            }
                        }
                    }
                    .padding(.horizontal, 16)

                    if !movies.isEmpty {
                        Button {
                            page += 1
                            loadGenreMovies(reset: false)
                        } label: {
                            Text(isLoading ? "Đang tải thêm..." : "Tải thêm trang \(page + 1)")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 11)
                                .background(Color.white.opacity(0.12), in: Capsule())
                        }
                        .padding(.vertical, 20)
                    }

                    Spacer(minLength: 100)
                }
            }
        }
        .onAppear {
            if selectedSlug.isEmpty {
                selectedSlug = initialGenre?.slug ?? pm.genreList.first?.slug ?? ""
            }
            loadGenreMovies(reset: true)
        }
    }

    private func loadGenreMovies(reset: Bool) {
        if reset { movies = [] }
        isLoading = true
        pm.fetchCategoryOrSearch(slug: selectedSlug, page: page) { items in
            if reset {
                movies = items
            } else {
                movies.append(contentsOf: items)
            }
            isLoading = false
        }
    }
}

struct SearchSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared
    let onSelectMovie: (JSMovieItem) -> Void

    @State private var query: String = ""
    @State private var results: [JSMovieItem] = []
    @State private var isSearching: Bool = false

    private let gridCols = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 14) {
                    HStack(spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "magnifyingglass")
                                .foregroundColor(.gray)
                            TextField("Tìm phim trên \(pm.activePlugin?.name ?? "nguồn hiện tại")...", text: $query)
                                .foregroundColor(.white)
                                .submitLabel(.search)
                                .onSubmit { performSearch() }
                            if !query.isEmpty {
                                Button {
                                    query = ""
                                    results = []
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.1), in: Capsule())

                        Button("Đóng") { dismiss() }
                            .foregroundColor(.blue)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)

                    if isSearching {
                        Spacer()
                        ProgressView("Đang tìm kiếm...")
                            .foregroundColor(.gray)
                        Spacer()
                    } else if results.isEmpty {
                        Spacer()
                        VStack(spacing: 10) {
                            Image(systemName: "film.stack")
                                .font(.system(size: 42))
                                .foregroundColor(.gray.opacity(0.5))
                            Text("Nhập tên phim để tìm kiếm nhanh")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVGrid(columns: gridCols, spacing: 16) {
                                ForEach(results) { m in
                                    Button {
                                        onSelectMovie(m)
                                    } label: {
                                        MovieCardView(movie: m, width: (UIScreen.main.bounds.width - 56) / 3, height: 162)
                                    }
                                }
                            }
                            .padding(16)
                        }
                    }
                }
            }
            .navigationBarHidden(true)
        }
    }

    private func performSearch() {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        isSearching = true
        pm.fetchCategoryOrSearch(slug: "", page: 1, keyword: q) { items in
            self.results = items
            self.isSearching = false
        }
    }
}

struct HistoryAndFavoritesView: View {
    @ObservedObject private var pm = PluginManager.shared
    let onSelectMovie: (JSMovieItem) -> Void
    @State private var mode: Int = 0 // 0 = Lịch sử, 1 = Yêu thích

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Tủ Phim Cá Nhân")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Picker("", selection: $mode) {
                    Text("Lịch sử xem").tag(0)
                    Text("Yêu thích").tag(1)
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)

            if mode == 0 {
                if pm.watchHistory.isEmpty {
                    Spacer()
                     CenterEmptyView(icon: "clock", text: "Chưa có lịch sử xem phim")
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(pm.watchHistory) { item in
                                Button {
                                    onSelectMovie(JSMovieItem(
                                        id: item.movieId, title: item.title, posterUrl: item.posterUrl,
                                        backdropUrl: item.backdropUrl, description: "", year: "",
                                        quality: "HD", episodeCurrent: item.episodeName, lang: "",
                                        datasend: item.datasend, pluginId: item.pluginId
                                    ))
                                } label: {
                                    HStack(spacing: 14) {
                                        CachedPosterImage(urlString: item.posterUrl)
                                            .frame(width: 70, height: 98)
                                            .clipShape(RoundedRectangle(cornerRadius: 10))
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(item.title)
                                                .font(.system(size: 16, weight: .bold))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text("Đang xem: \(item.episodeName)")
                                                .font(.system(size: 13))
                                                .foregroundColor(.cyan)
                                            Text("Nguồn: \(item.pluginName)")
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                        Spacer()
                                        Image(systemName: "play.circle.fill")
                                            .font(.system(size: 28))
                                            .foregroundColor(.white.opacity(0.8))
                                    }
                                    .padding(12)
                                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        Spacer(minLength: 100)
                    }
                }
            } else {
                if pm.favoriteMovies.isEmpty {
                    Spacer()
                    CenterEmptyView(icon: "heart", text: "Chưa có phim yêu thích")
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(pm.favoriteMovies) { fav in
                                Button {
                                    onSelectMovie(JSMovieItem(
                                        id: fav.movieId, title: fav.title, posterUrl: fav.posterUrl,
                                        backdropUrl: fav.backdropUrl, description: "", year: fav.year,
                                        quality: fav.quality, episodeCurrent: "", lang: "",
                                        datasend: fav.datasend, pluginId: fav.pluginId
                                    ))
                                } label: {
                                    HStack(spacing: 14) {
                                        CachedPosterImage(urlString: fav.posterUrl)
                                            .frame(width: 70, height: 98)
                                            .clipShape(RoundedRectangle(cornerRadius: 10))
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(fav.title)
                                                .font(.system(size: 16, weight: .bold))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text("Nguồn: \(fav.pluginName)")
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.gray)
                                    }
                                    .padding(12)
                                    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        Spacer(minLength: 100)
                    }
                }
            }
        }
    }
}

struct CenterEmptyView: View {
    let icon: String
    let text: String
    var body: some View {
        HStack {
            Spacer()
            VStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 42))
                    .foregroundColor(.gray.opacity(0.45))
                Text(text)
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            Spacer()
        }
    }
}

// =============================================================================
// 15. SETTINGS ROOT VIEW, KHO PLUGIN & AI MODEL (Khớp 100% ảnh 1, 2, 3, 4, 5, 6)
// =============================================================================
struct SettingsRootView: View {
    @ObservedObject private var pm = PluginManager.shared
    let onOpenAIStudio: () -> Void

    @State private var newRepoUrl: String = ""
    @State private var showPluginStore: Bool = false
    @State private var showAIModelCenter: Bool = false
    @State private var showFileImporter: Bool = false
    @State private var showDomainAlert: Bool = false
    @State private var customDomainInput: String = ""
    @State private var statusBanner: String? = nil

    private let dnsOptions = [
        "Hệ thống (Mặc định)",
        "Google DNS (8.8.8.8)",
        "Cloudflare DNS (1.1.1.1)",
        "AdGuard DNS",
        "AliDNS"
    ]

    private let playerOptions = ["Tự động", "Native AVPlayer", "VLC", "Infuse"]

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Cài đặt")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.top, 10)

                        if let banner = statusBanner {
                            Text(banner)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.green)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        }

                        // 0. AI WEBSITE -> PLUGIN CONVERTER CARD (Tính năng mới theo yêu cầu của bạn!)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("AI PLUGIN STUDIO (CHUYỂN WEB THÀNH PLUGIN)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            Button {
                                onOpenAIStudio()
                            } label: {
                                HStack(spacing: 14) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(LinearGradient(colors: [.purple, .blue], startPoint: .topLeading, endPoint: .bottomTrailing))
                                            .frame(width: 44, height: 44)
                                        Image(systemName: "wand.and.stars")
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundColor(.white)
                                    }
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Chuyển Link Website thành Plugin")
                                            .font(.system(size: 16, weight: .bold))
                                            .foregroundColor(.white)
                                        Text("Điền bất kỳ link web phim nào để Server AI tự sinh Plugin chạy ngay trên App")
                                            .font(.system(size: 12))
                                            .foregroundColor(.white.opacity(0.75))
                                            .multilineTextAlignment(.leading)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundColor(.gray)
                                }
                                .padding(16)
                                .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                                        .stroke(Color.purple.opacity(0.45), lineWidth: 1)
                                )
                            }
                        }

                        // 1. DANH SÁCH NGUỒN PLUGIN JSON (Ảnh 5)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("DANH SÁCH NGUỒN PLUGIN JSON")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            VStack(spacing: 14) {
                                ForEach(pm.repoUrls, id: \.self) { repo in
                                    HStack(spacing: 10) {
                                        Image(systemName: "link")
                                            .foregroundColor(.blue)
                                        Text(repo.contains("williampro01") ? "williampro01" : repo)
                                            .font(.system(size: 15, weight: .medium))
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                        Spacer()
                                    }
                                }

                                Divider().background(Color.white.opacity(0.1))

                                HStack {
                                    TextField("Dán link JSON nguồn mới...", text: $newRepoUrl)
                                        .foregroundColor(.white)
                                    Button("Thêm") {
                                        let clean = newRepoUrl.trimmingCharacters(in: .whitespacesAndNewlines)
                                        if clean.hasPrefix("http") && !pm.repoUrls.contains(clean) {
                                            pm.repoUrls.append(clean)
                                            pm.saveSettings()
                                            newRepoUrl = ""
                                        }
                                    }
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(.gray)
                                }

                                Divider().background(Color.white.opacity(0.1))

                                Button {
                                    statusBanner = "Đang đồng bộ kho plugin..."
                                    pm.syncAllRemoteRepos { count in
                                        statusBanner = "Đã đồng bộ hoàn tất (\(pm.plugins.count) plugin sẵn sàng)!"
                                    }
                                } label: {
                                    Text("Tải lại tất cả nguồn")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.blue)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 4)
                                }

                                Divider().background(Color.white.opacity(0.1))

                                Button {
                                    showPluginStore = true
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "puzzlepiece.extension.fill")
                                            .foregroundColor(.blue)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Quản lý kho plugin")
                                                .font(.system(size: 15, weight: .semibold))
                                                .foregroundColor(.white)
                                            Text("\(pm.plugins.count)/\(pm.plugins.count) plugin đã cài đặt")
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.gray)
                                    }
                                }

                                Divider().background(Color.white.opacity(0.1))

                                Button {
                                    showFileImporter = true
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: "folder.badge.plus")
                                            .foregroundColor(.green)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("Cài plugin từ bộ nhớ máy")
                                                .font(.system(size: 15, weight: .semibold))
                                                .foregroundColor(.white)
                                            Text("Chọn file JavaScript (.js) để cài đặt trực tiếp")
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.gray)
                                    }
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        // 2. MÁY CHỦ DNS (DoH & BYPASS DPI) (Ảnh 5 & 6)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("MÁY CHỦ DNS (DoH & BYPASS DPI)")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            HStack {
                                Text("DNS Provider")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.white)
                                Spacer()
                                Menu {
                                    ForEach(dnsOptions, id: \.self) { opt in
                                        Button {
                                            pm.dnsProvider = opt
                                            pm.saveSettings()
                                        } label: {
                                            HStack {
                                                Text(opt)
                                                if pm.dnsProvider == opt {
                                                    Image(systemName: "checkmark")
                                                }
                                            }
                                        }
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(pm.dnsProvider)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.system(size: 11))
                                    }
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.blue)
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        // 3. CẤU HÌNH PLUGIN ĐANG CHỌN (Ảnh 5)
                        if let active = pm.activePlugin {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("CẤU HÌNH: \(active.name.uppercased())")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.gray)

                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Plugin đang chọn")
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundColor(.white)
                                        Text(pm.customDomains[active.id] ?? (active.baseUrl.isEmpty ? "Không có URL Base đăng nhập" : active.baseUrl))
                                            .font(.system(size: 12))
                                            .foregroundColor(.gray)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Button {
                                        customDomainInput = pm.customDomains[active.id] ?? active.baseUrl
                                        showDomainAlert = true
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: "globe")
                                            Text("Đổi Domain")
                                        }
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(Color.red, in: Capsule())
                                    }
                                }
                                .padding(16)
                                .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                        }

                        // 4. BẢO MẬT & NỘI DUNG + TRÌNH PHÁT VIDEO (Ảnh 3)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("BẢO MẬT & NỘI DUNG")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            Toggle(isOn: Binding(
                                get: { pm.allow18Plus },
                                set: { pm.allow18Plus = $0; pm.saveSettings() }
                            )) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Nội dung 18+")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.white)
                                    Text("Hiện/Ẩn các nguồn phim người lớn")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                }
                            }
                            .tint(.blue)
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("TRÌNH PHÁT VIDEO")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            HStack {
                                Text("Trình phát mặc định")
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.white)
                                Spacer()
                                Menu {
                                    ForEach(playerOptions, id: \.self) { opt in
                                        Button(opt) {
                                            pm.defaultPlayer = opt
                                            pm.saveSettings()
                                        }
                                    }
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(pm.defaultPlayer)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.system(size: 11))
                                    }
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.blue)
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        // 5. TRÍ TUỆ NHÂN TẠO (AI MODEL) (Ảnh 2 & 3)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("TRÍ TUỆ NHÂN TẠO")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            Button {
                                showAIModelCenter = true
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 20))
                                        .foregroundColor(.red)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("AI Model")
                                            .font(.system(size: 16, weight: .bold))
                                            .foregroundColor(.white)
                                        Text("Dịch thuật, lồng tiếng, phụ đề AI & Server AI tạo Plugin")
                                            .font(.system(size: 12))
                                            .foregroundColor(.gray)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundColor(.gray)
                                }
                                .padding(16)
                                .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                        }

                        // 6. THÔNG TIN & QUẢN LÝ BỘ NHỚ (Ảnh 2)
                        VStack(alignment: .leading, spacing: 10) {
                            Text("THÔNG TIN")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            VStack(spacing: 14) {
                                HStack {
                                    Text("Phiên bản").foregroundColor(.white)
                                    Spacer()
                                    Text("2.0.1 (101) Native").foregroundColor(.gray)
                                }
                                Divider().background(Color.white.opacity(0.1))
                                HStack {
                                    Text("Nhà phát triển").foregroundColor(.white)
                                    Spacer()
                                    Text("VAX Team + AI Studio").foregroundColor(.gray)
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("QUẢN LÝ BỘ NHỚ")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.gray)

                            VStack(spacing: 14) {
                                Button {
                                    NativeImageCache.shared.clear()
                                    statusBanner = "Đã xóa bộ nhớ đệm hình ảnh!"
                                } label: {
                                    HStack {
                                        Text("Xóa bộ nhớ đệm hình ảnh")
                                            .foregroundColor(.blue)
                                        Spacer()
                                        Image(systemName: "trash")
                                            .foregroundColor(.red)
                                    }
                                }

                                Divider().background(Color.white.opacity(0.1))

                                Button {
                                    pm.clearWatchHistory()
                                    statusBanner = "Đã xóa tất cả lịch sử xem!"
                                } label: {
                                    HStack {
                                        Text("Xóa tất cả lịch sử xem")
                                            .foregroundColor(.blue)
                                        Spacer()
                                        Image(systemName: "clock.badge.xmark")
                                            .foregroundColor(.red)
                                    }
                                }
                            }
                            .padding(16)
                            .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }

                        Spacer(minLength: 100)
                    }
                    .padding(.horizontal, 16)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showPluginStore) {
                PluginStoreSheet()
            }
            .sheet(isPresented: $showAIModelCenter) {
                AIModelCenterSheet()
            }
            .alert("Đổi tên miền (Domain)", isPresented: $showDomainAlert) {
                TextField("https://...", text: $customDomainInput)
                Button("Lưu") {
                    if let id = pm.activePlugin?.id {
                        pm.updateCustomDomain(pluginId: id, newDomain: customDomainInput)
                    }
                }
                Button("Hủy", role: .cancel) {}
            } message: {
                Text("Nhập tên miền mới cho nguồn phim hiện tại khi tên miền cũ bị nhà mạng chặn.")
            }
            .fileImporter(
                isPresented: $showFileImporter,
                allowedContentTypes: [.javaScript, .plainText, .data],
                allowsMultipleSelection: true
            ) { result in
                if let urls = try? result.get() {
                    for url in urls {
                        let secured = url.startAccessingSecurityScopedResource()
                        if let code = try? String(contentsOf: url, encoding: .utf8) {
                            if let m = pm.installCustomPlugin(rawScript: code, selectImmediately: true) {
                                statusBanner = "Đã cài đặt plugin \(m.name) thành công!"
                            }
                        }
                        if secured { url.stopAccessingSecurityScopedResource() }
                    }
                }
            }
        }
    }
}

// MARK: - Ảnh 4: Kho Plugin (PluginStoreSheet)
struct PluginStoreSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared
    @State private var showFileImporter: Bool = false

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()

                VStack(spacing: 16) {
                    // Header
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.1), in: Circle())
                        }
                        Spacer()
                        Text("Kho Plugin")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                        Spacer()
                        Button { showFileImporter = true } label: {
                            Image(systemName: "doc.badge.plus")
                                .font(.system(size: 17))
                                .foregroundColor(.blue)
                                .frame(width: 40, height: 40)
                                .background(Color.white.opacity(0.1), in: Circle())
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)

                    // Summary Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Tổng số plugin: \(pm.plugins.count)")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                        Text("Đã cài đặt: \(pm.plugins.count)")
                            .font(.system(size: 14))
                            .foregroundColor(.gray)

                        Divider().background(Color.white.opacity(0.1))

                        HStack {
                            Button { showFileImporter = true } label: {
                                Label("Cài từ bộ nhớ", systemImage: "folder.badge.plus")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.green)
                            }
                            Spacer()
                            Button {
                                pm.syncAllRemoteRepos { _ in }
                            } label: {
                                Label("Tải tất cả", systemImage: "arrow.down.circle.fill")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    .padding(16)
                    .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20))
                    .padding(.horizontal, 16)

                    // Plugin List
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(pm.plugins) { plugin in
                                HStack(spacing: 14) {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(Color.white.opacity(0.1))
                                            .frame(width: 42, height: 42)
                                        Text(String(plugin.name.prefix(1)).uppercased())
                                            .font(.system(size: 18, weight: .bold))
                                            .foregroundColor(.white)
                                    }

                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 6) {
                                            Text(plugin.name)
                                                .font(.system(size: 15, weight: .bold))
                                                .foregroundColor(.white)
                                            Text("v\(plugin.version)")
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                        Text("Loại: \(plugin.type) • Layout: \(plugin.layoutType)")
                                            .font(.system(size: 12))
                                            .foregroundColor(.gray)
                                    }

                                    Spacer()

                                    Button {
                                        pm.removePlugin(plugin.id)
                                    } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: "trash")
                                            Text("Gỡ")
                                        }
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.red)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 7)
                                        .background(Color.red.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
                                    }
                                }
                                .padding(14)
                                Divider().background(Color.white.opacity(0.08))
                            }
                        }
                        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 20))
                        .padding(.horizontal, 16)
                        .padding(.bottom, 30)
                    }
                }
            }
            .navigationBarHidden(true)
            .fileImporter(
                isPresented: $showFileImporter,
                allowedContentTypes: [.javaScript, .plainText, .data],
                allowsMultipleSelection: true
            ) { result in
                if let urls = try? result.get() {
                    for url in urls {
                        let secured = url.startAccessingSecurityScopedResource()
                        if let code = try? String(contentsOf: url, encoding: .utf8) {
                            _ = pm.installCustomPlugin(rawScript: code, selectImmediately: false)
                        }
                        if secured { url.stopAccessingSecurityScopedResource() }
                    }
                }
            }
        }
    }
}

// MARK: - Ảnh 1: Trung tâm Công nghệ AI (AIModelCenterSheet)
struct AIModelCenterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        // Top bar
                        HStack {
                            Button { dismiss() } label: {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(width: 40, height: 40)
                                    .background(Color.white.opacity(0.1), in: Circle())
                            }
                            Spacer()
                            Text("AI Model")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                            Spacer()
                            Color.clear.frame(width: 40, height: 40)
                        }
                        .padding(.top, 10)

                        // Hero Card (Ảnh 1)
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Image(systemName: "sparkles")
                                    .foregroundColor(.red)
                                Text("Trung tâm Công nghệ AI")
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            Text("Hệ sinh thái AI toàn diện hỗ trợ dịch thuật tự động, lồng tiếng phụ đề, tạo phụ đề từ giọng nói và tự động chuyển đổi bất kỳ Website phim nào thành Plugin VAX.")
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.8))
                                .lineSpacing(3)
                        }
                        .padding(18)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.25, green: 0.06, blue: 0.09), Color(red: 0.08, green: 0.10, blue: 0.18)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 20)
                        )

                        Text("Tính năng AI thông minh")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)

                        // Feature 1: Dịch phụ đề & Thông tin
                        Toggle(isOn: Binding(
                            get: { pm.autoTranslateSubtitles },
                            set: { pm.autoTranslateSubtitles = $0; pm.saveSettings() }
                        )) {
                            HStack(spacing: 14) {
                                Image(systemName: "character.book.closed.fill")
                                    .foregroundColor(.cyan)
                                    .frame(width: 42, height: 42)
                                    .background(Color.cyan.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Dịch phụ đề & Thông tin")
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(.white)
                                    Text("Tự động dịch thông tin phim và phụ đề rời ngoại ngữ sang tiếng Việt")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(16)
                        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 18))

                        // Feature 2: Lồng tiếng phụ đề (VAX TTS)
                        Toggle(isOn: Binding(
                            get: { pm.enableVaxTTS },
                            set: { pm.enableVaxTTS = $0; pm.saveSettings() }
                        )) {
                            HStack(spacing: 14) {
                                Image(systemName: "waveform")
                                    .foregroundColor(.red)
                                    .frame(width: 42, height: 42)
                                    .background(Color.red.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Lồng tiếng phụ đề (VAX TTS)")
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(.white)
                                    Text("Thuyết minh AI tiếng Việt thông minh trực tiếp trên máy")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(16)
                        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 18))

                        // Feature 3: Cấu hình Server AI sinh Plugin tự động
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Cấu hình Server AI tạo Plugin từ Link Web")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)

                            Picker("Nhà cung cấp AI", selection: $pm.aiProvider) {
                                Text("Gemini AI").tag("gemini")
                                Text("OpenAI").tag("openai")
                                Text("Custom Server").tag("custom")
                                Text("Smart Local").tag("heuristic")
                            }
                            .pickerStyle(.segmented)
                            .onChange(of: pm.aiProvider) { _ in pm.saveSettings() }

                            if pm.aiProvider != "heuristic" {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("API Key (Để trống nếu dùng Smart Heuristic tích hợp sẵn)")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                    SecureField("Nhập Gemini / OpenAI API Key...", text: $pm.aiApiKey)
                                        .padding(12)
                                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                        .foregroundColor(.white)
                                        .onChange(of: pm.aiApiKey) { _ in pm.saveSettings() }
                                }

                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Model Name")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                    TextField("gemini-2.5-flash hoặc gpt-4o-mini", text: $pm.aiModelName)
                                        .padding(12)
                                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                        .foregroundColor(.white)
                                        .onChange(of: pm.aiModelName) { _ in pm.saveSettings() }
                                }
                            }

                            if pm.aiProvider == "custom" {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Endpoint Server AI của bạn")
                                        .font(.system(size: 12))
                                        .foregroundColor(.gray)
                                    TextField("https://your-ai-server.com/v1/chat/completions", text: $pm.aiCustomEndpoint)
                                        .padding(12)
                                        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                                        .foregroundColor(.white)
                                        .onChange(of: pm.aiCustomEndpoint) { _ in pm.saveSettings() }
                                }
                            }
                        }
                        .padding(16)
                        .background(Color(white: 0.11), in: RoundedRectangle(cornerRadius: 18))

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 16)
                }
            }
            .navigationBarHidden(true)
        }
    }
}

// =============================================================================
// 16. AI PLUGIN STUDIO SHEET (Điền Link Website -> Tự động sinh & cài Plugin VAX)
// =============================================================================
struct AIPluginStudioSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pm = PluginManager.shared

    @State private var websiteUrl: String = ""
    @State private var customPluginName: String = ""
    @State private var isConverting: Bool = false
    @State private var progress: AIConversionProgress? = nil
    @State private var editableCode: String = ""
    @State private var errorMsg: String? = nil

    private let sampleSites = [
        ("PhimMoiChill", "https://phimmoichill.net"),
        ("RoPhim", "https://rophim.me"),
        ("MotChill", "https://motchilltv.ac"),
        ("OPhim", "https://ophim17.cc"),
        ("KKPhim", "https://kkphim.vip")
    ]

    var body: some View {
        NavigationView {
            ZStack {
                Color(red: 0.05, green: 0.05, blue: 0.08).ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        // Header
                        HStack {
                            Button("Đóng") { dismiss() }
                                .foregroundColor(.blue)
                            Spacer()
                            HStack(spacing: 6) {
                                Image(systemName: "wand.and.stars")
                                    .foregroundColor(.purple)
                                Text("AI Plugin Studio")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Color.clear.frame(width: 44, height: 20)
                        }
                        .padding(.top, 14)

                        // Intro Card
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Chuyển đổi mọi Website Phim thành Plugin VAX")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                            Text("Nhập đường dẫn (URL) trang web xem phim bất kỳ. AI Engine sẽ tự động quét cấu trúc HTML/API, sinh mã JavaScript chuẩn VaxPlayer (`getManifest`, `parseListResponse`, `parseMovieDetail`, `parseDetailResponse`) và nạp trực tiếp vào JavaScriptCore.")
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.75))
                        }
                        .padding(16)
                        .background(
                            LinearGradient(colors: [Color.purple.opacity(0.28), Color.blue.opacity(0.18)], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: 18)
                        )

                        // URL Input
                        VStack(alignment: .leading, spacing: 8) {
                            Text("1. Đường dẫn Website xem phim (URL)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.gray)
                            TextField("Ví dụ: https://rophim.me hoặc https://motchilltv.ac", text: $websiteUrl)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                .disableAutocorrection(true)
                                .padding(14)
                                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                                .foregroundColor(.white)

                            // Quick presets
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(sampleSites, id: \.0) { site in
                                        Button {
                                            websiteUrl = site.1
                                            customPluginName = site.0 + " [AI]"
                                        } label: {
                                            Text(site.0)
                                                .font(.system(size: 12, weight: .semibold))
                                                .foregroundColor(.cyan)
                                                .padding(.horizontal, 12)
                                                .padding(.vertical, 6)
                                                .background(Color.cyan.opacity(0.14), in: Capsule())
                                        }
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("2. Tên hiển thị nguồn phim (Tùy chọn)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.gray)
                            TextField("Để trống sẽ tự lấy theo tên miền...", text: $customPluginName)
                                .padding(14)
                                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                                .foregroundColor(.white)
                        }

                        // Generate Button
                        Button {
                            startConversion()
                        } label: {
                            HStack(spacing: 10) {
                                if isConverting {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Image(systemName: "sparkles")
                                }
                                Text(isConverting ? "Đang phân tích & biên dịch Plugin..." : "Tự động tạo & Cài đặt Plugin ngay")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(
                                LinearGradient(colors: [.purple, .blue], startPoint: .leading, endPoint: .trailing),
                                in: RoundedRectangle(cornerRadius: 16)
                            )
                        }
                        .disabled(isConverting || websiteUrl.trimmingCharacters(in: .whitespaces).isEmpty)

                        if let err = errorMsg {
                            Text(err)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.red)
                                .padding(12)
                                .background(Color.red.opacity(0.14), in: RoundedRectangle(cornerRadius: 12))
                        }

                        // Live Progress & Generated Code Inspector
                        if let prog = progress {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Image(systemName: prog.isCompleted ? "checkmark.seal.fill" : "gearshape.2.fill")
                                        .foregroundColor(prog.isCompleted ? .green : .cyan)
                                    Text(prog.step)
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundColor(.white)
                                }
                                Text(prog.detail)
                                    .font(.system(size: 13))
                                    .foregroundColor(.white.opacity(0.8))
                                Text("Kiến trúc phát hiện: \(prog.detectedCMS)")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(.purple)

                                if prog.isCompleted {
                                    Button {
                                        dismiss()
                                    } label: {
                                        Text("Mở Trang Chủ & Trải nghiệm Nguồn Phim Mới")
                                            .font(.system(size: 15, weight: .bold))
                                            .foregroundColor(.black)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 13)
                                            .background(Color.green, in: RoundedRectangle(cornerRadius: 14))
                                    }
                                    .padding(.top, 4)
                                }
                            }
                            .padding(16)
                            .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
                        }

                        if !editableCode.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text("Mã nguồn Plugin VAX JavaScript đã sinh")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.gray)
                                    Spacer()
                                    Button("Cập nhật Code") {
                                        _ = pm.installCustomPlugin(rawScript: editableCode, selectImmediately: true)
                                        dismiss()
                                    }
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundColor(.cyan)
                                }

                                TextEditor(text: $editableCode)
                                    .font(.system(size: 11, design: .monospaced))
                                    .frame(height: 220)
                                    .padding(8)
                                    .background(Color.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
                                    .foregroundColor(.green)
                            }
                        }

                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal, 16)
                }
            }
            .navigationBarHidden(true)
        }
    }

    private func startConversion() {
        isConverting = true
        errorMsg = nil
        AIPluginConverter.shared.convertWebsiteToPlugin(
            websiteUrl: websiteUrl,
            customName: customPluginName,
            onProgress: { p in
                self.progress = p
                if !p.generatedCode.isEmpty {
                    self.editableCode = p.generatedCode
                }
            },
            onComplete: { result in
                self.isConverting = false
                switch result {
                case .success(let manifest):
                    self.editableCode = pm.getRawScript(for: manifest.id)
                case .failure(let err):
                    self.errorMsg = err.localizedDescription
                }
            }
        )
    }
}
