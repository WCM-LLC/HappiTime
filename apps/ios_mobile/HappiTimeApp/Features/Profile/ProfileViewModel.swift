import Foundation

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var displayName: String = ""
    @Published var handle: String = ""
    @Published var bio: String = ""
    @Published var isPublic = false

    @Published var homeCity: String = ""
    @Published var homeState: String = ""
    @Published var notificationsPush = true
    @Published var notificationsHappyHours = true
    @Published var notificationsVenueUpdates = true
    @Published var notificationsFriendActivity = true
    @Published var notificationsProduct = true

    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published var statusMessage: String?

    private let userService: UserServicing
    private let sessionStore: SessionStore

    init(userService: UserServicing, sessionStore: SessionStore) {
        self.userService = userService
        self.sessionStore = sessionStore
    }

    func load() async {
        guard let session = sessionStore.session else { return }
        loading = true
        defer { loading = false }

        do {
            if let profile = try await userService.fetchProfile(userID: session.user.id, accessToken: session.accessToken) {
                displayName = profile.displayName ?? ""
                handle = profile.handle ?? ""
                bio = profile.bio ?? ""
                isPublic = profile.isPublic
            }

            let prefs = try await userService.fetchPreferences(userID: session.user.id, accessToken: session.accessToken)
            homeCity = prefs.homeCity ?? ""
            homeState = prefs.homeState ?? ""
            notificationsPush = prefs.notificationsPush
            notificationsHappyHours = prefs.notificationsHappyHours
            notificationsVenueUpdates = prefs.notificationsVenueUpdates
            notificationsFriendActivity = prefs.notificationsFriendActivity
            notificationsProduct = prefs.notificationsProduct
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func saveProfileAndPreferences() async {
        guard let session = sessionStore.session else { return }
        saving = true
        defer { saving = false }

        do {
            let profile = UserProfile(
                userID: session.user.id,
                handle: handle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().nilIfEmpty,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                avatarURL: nil,
                bio: bio.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                isPublic: isPublic
            )

            try await userService.upsertProfile(profile, accessToken: session.accessToken)

            try await userService.upsertPreferences(
                userID: session.user.id,
                patch: [
                    "home_city": homeCity.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty as Any,
                    "home_state": homeState.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().nilIfEmpty as Any,
                    "notifications_push": notificationsPush,
                    "notifications_happy_hours": notificationsHappyHours,
                    "notifications_venue_updates": notificationsVenueUpdates,
                    "notifications_friend_activity": notificationsFriendActivity,
                    "notifications_product": notificationsProduct
                ],
                accessToken: session.accessToken
            )

            statusMessage = "Profile saved."
        } catch {
            statusMessage = error.localizedDescription
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
