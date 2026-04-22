import Foundation

@MainActor
final class FavoritesViewModel: ObservableObject {
    enum Tab: String, CaseIterable, Identifiable {
        case favorites
        case history
        case lists

        var id: String { rawValue }
    }

    @Published var selectedTab: Tab = .favorites
    @Published private(set) var favoriteWindows: [HappyHourWindow] = []
    @Published private(set) var history: [HistoryEntry] = []
    @Published private(set) var lists: [UserList] = []
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let happyHourService: HappyHourServicing
    private let userService: UserServicing
    private let sessionStore: SessionStore

    init(happyHourService: HappyHourServicing, userService: UserServicing, sessionStore: SessionStore) {
        self.happyHourService = happyHourService
        self.userService = userService
        self.sessionStore = sessionStore
    }

    func load() async {
        guard let session = sessionStore.session else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            async let windowsTask = happyHourService.fetchPublishedHappyHours(accessToken: session.accessToken)
            async let followsTask = userService.fetchFollowedVenueIDs(userID: session.user.id, accessToken: session.accessToken)
            async let historyTask = userService.fetchHistory(userID: session.user.id, accessToken: session.accessToken)
            async let listsTask = userService.fetchLists(userID: session.user.id, accessToken: session.accessToken)

            let windows = try await windowsTask
            let followedIDs = Set(try await followsTask)
            history = try await historyTask
            lists = try await listsTask

            favoriteWindows = windows.filter { window in
                guard let venueID = window.venueID else { return false }
                return followedIDs.contains(venueID)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
