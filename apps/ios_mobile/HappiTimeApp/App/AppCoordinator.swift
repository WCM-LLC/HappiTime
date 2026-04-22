import SwiftUI

struct AppCoordinator: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @State private var selectedTab: MainTab = .home

    var body: some View {
        Group {
            switch sessionStore.route {
            case .loading:
                LoadingView(message: "Restoring session…")
            case .auth:
                AuthView(viewModel: AuthViewModel(sessionStore: sessionStore))
            case .main:
                MainTabShell(selectedTab: $selectedTab)
                    .environmentObject(container)
                    .environmentObject(sessionStore)
            }
        }
        .task {
            await sessionStore.bootstrapSession()
        }
    }
}

private struct MainTabShell: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @Binding var selectedTab: MainTab

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                HomeView(viewModel: HomeViewModel(happyHourService: container.happyHourService, sessionStore: sessionStore))
                    .environmentObject(container)
            }
            .tabItem { Label("Home", systemImage: "house.fill") }
            .tag(MainTab.home)

            NavigationStack {
                SearchView(viewModel: SearchViewModel(happyHourService: container.happyHourService, sessionStore: sessionStore))
                    .environmentObject(container)
            }
            .tabItem { Label("Search", systemImage: "magnifyingglass") }
            .tag(MainTab.search)

            NavigationStack {
                MapScreenView(viewModel: MapViewModel(happyHourService: container.happyHourService, sessionStore: sessionStore))
                    .environmentObject(container)
            }
            .tabItem { Label("Map", systemImage: "map.fill") }
            .tag(MainTab.map)

            NavigationStack {
                FavoritesView(viewModel: FavoritesViewModel(
                    happyHourService: container.happyHourService,
                    userService: container.userService,
                    sessionStore: sessionStore
                ))
                .environmentObject(container)
            }
            .tabItem { Label("Favorites", systemImage: "star.fill") }
            .tag(MainTab.favorites)

            NavigationStack {
                ActivityView(viewModel: ActivityViewModel(
                    userService: container.userService,
                    happyHourService: container.happyHourService,
                    sessionStore: sessionStore
                ))
                .environmentObject(container)
            }
            .tabItem { Label("Activity", systemImage: "bell.fill") }
            .tag(MainTab.activity)

            NavigationStack {
                AddView(viewModel: AddViewModel(userService: container.userService, sessionStore: sessionStore))
            }
            .tabItem { Label("Add", systemImage: "plus.circle.fill") }
            .tag(MainTab.add)

            NavigationStack {
                ProfileView(viewModel: ProfileViewModel(userService: container.userService, sessionStore: sessionStore))
            }
            .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
            .tag(MainTab.profile)
        }
        .tint(AppTheme.Colors.primary)
    }
}
