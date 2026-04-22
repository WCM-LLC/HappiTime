import Foundation

@MainActor
final class ActivityViewModel: ObservableObject {
    enum Tab: String, CaseIterable, Identifiable {
        case friends
        case venues
        var id: String { rawValue }
    }

    @Published var selectedTab: Tab = .friends
    @Published private(set) var followers: [Follower] = []
    @Published private(set) var venueUpdates: [HappyHourWindow] = []
    @Published private(set) var loading = false
    @Published var errorMessage: String?

    private let userService: UserServicing
    private let happyHourService: HappyHourServicing
    private let sessionStore: SessionStore

    init(userService: UserServicing, happyHourService: HappyHourServicing, sessionStore: SessionStore) {
        self.userService = userService
        self.happyHourService = happyHourService
        self.sessionStore = sessionStore
    }

    func load() async {
        guard let session = sessionStore.session else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            async let followersTask = userService.fetchFollowers(userID: session.user.id, accessToken: session.accessToken)
            async let followedVenuesTask = userService.fetchFollowedVenueIDs(userID: session.user.id, accessToken: session.accessToken)
            async let windowsTask = happyHourService.fetchPublishedHappyHours(accessToken: session.accessToken)

            let followedVenueIDs = Set(try await followedVenuesTask)
            let windows = try await windowsTask
            followers = try await followersTask

            if followedVenueIDs.isEmpty {
                venueUpdates = windows.sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
            } else {
                venueUpdates = windows
                    .filter { window in
                        guard let venueID = window.venueID else { return false }
                        return followedVenueIDs.contains(venueID)
                    }
                    .sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
