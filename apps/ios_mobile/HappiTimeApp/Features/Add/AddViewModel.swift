import Foundation

@MainActor
final class AddViewModel: ObservableObject {
    enum Mode: String, CaseIterable, Identifiable {
        case venueSuggestion
        case itinerary

        var id: String { rawValue }
    }

    @Published var mode: Mode = .venueSuggestion

    @Published var listName: String = ""
    @Published var listDescription: String = ""

    @Published var venueName: String = ""
    @Published var venueAddress: String = ""
    @Published var venueCity: String = ""
    @Published var venueState: String = ""
    @Published var venueNotes: String = ""

    @Published private(set) var saving = false
    @Published var statusMessage: String?

    private let userService: UserServicing
    private let sessionStore: SessionStore

    init(userService: UserServicing, sessionStore: SessionStore) {
        self.userService = userService
        self.sessionStore = sessionStore
    }

    func submit() async {
        guard let session = sessionStore.session else {
            statusMessage = "You must be signed in."
            return
        }

        saving = true
        defer { saving = false }

        do {
            switch mode {
            case .itinerary:
                guard !listName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    statusMessage = "Enter an itinerary name."
                    return
                }
                try await userService.createList(
                    userID: session.user.id,
                    name: listName.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: listDescription.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    accessToken: session.accessToken
                )
                statusMessage = "Itinerary created."
                listName = ""
                listDescription = ""

            case .venueSuggestion:
                guard !venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    statusMessage = "Enter a venue name."
                    return
                }

                try await userService.suggestVenue(
                    userID: session.user.id,
                    payload: [
                        "meta": [
                            "venue_name": venueName.trimmingCharacters(in: .whitespacesAndNewlines),
                            "address": venueAddress.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty as Any,
                            "city": venueCity.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty as Any,
                            "state": venueState.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty as Any,
                            "notes": venueNotes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty as Any
                        ]
                    ],
                    accessToken: session.accessToken
                )

                statusMessage = "Venue suggestion submitted."
                venueName = ""
                venueAddress = ""
                venueCity = ""
                venueState = ""
                venueNotes = ""
            }
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
