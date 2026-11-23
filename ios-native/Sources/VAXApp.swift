import SwiftUI

// =============================================================================
// VAX 2.0.1 (101) - 100% NATIVE SWIFTUI + JAVASCRIPTCORE + AVPLAYER ENTRY POINT
// Tái tạo nguyên bản kiến trúc siêu mượt 60fps của VaxPlayer (3).ipa kết hợp
// tính năng AI Plugin Studio (Chuyển mọi Link Website thành Plugin VAX).
// =============================================================================

@main
struct VAXPlayerNativeApp: App {
    init() {
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = .black
        appearance.titleTextAttributes = [.foregroundColor: UIColor.white]
        appearance.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}
