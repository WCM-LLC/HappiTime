import SwiftUI

@main
struct HappiTimeApp: App {
    @StateObject private var container = AppContainer.bootstrap()

    var body: some Scene {
        WindowGroup {
            AppCoordinator()
                .environmentObject(container)
                .environmentObject(container.sessionStore)
                .onOpenURL { url in
                    Task {
                        await container.sessionStore.handleOpenURL(url)
                    }
                }
        }
    }
}
