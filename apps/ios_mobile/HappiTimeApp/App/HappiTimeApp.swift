import SwiftUI

// Add the import for AppCoordinator if it's in a separate module
// import YourModuleName

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
