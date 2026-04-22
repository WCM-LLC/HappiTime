import Foundation

@MainActor
final class VenueDetailViewModel: ObservableObject {
    @Published private(set) var window: HappyHourWindow?
    @Published private(set) var menus: [Menu] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var isSaved = false

    private let windowID: String
    private let happyHourService: HappyHourServicing
    private let userService: UserServicing
    private let sessionStore: SessionStore

    init(windowID: String, happyHourService: HappyHourServicing, userService: UserServicing, sessionStore: SessionStore) {
        self.windowID = windowID
        self.happyHourService = happyHourService
        self.userService = userService
        self.sessionStore = sessionStore
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let session = sessionStore.session else {
            errorMessage = "You must be signed in."
            return
        }

        do {
            let windows = try await happyHourService.fetchPublishedHappyHours(accessToken: session.accessToken)
            window = windows.first(where: { $0.id == windowID })

            if let venueID = window?.venueID {
                async let menuFetch = happyHourService.fetchVenueMenus(venueID: venueID, accessToken: session.accessToken)
                async let followsFetch = userService.fetchFollowedVenueIDs(userID: session.user.id, accessToken: session.accessToken)
                menus = try await menuFetch
                let follows = try await followsFetch
                isSaved = follows.contains(venueID)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleSave() async {
        guard let session = sessionStore.session, let venueID = window?.venueID else { return }

        do {
            try await userService.toggleFollowVenue(
                userID: session.user.id,
                venueID: venueID,
                currentlyFollowing: isSaved,
                accessToken: session.accessToken
            )
            isSaved.toggle()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
