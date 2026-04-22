import Foundation

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var query: String = ""
    @Published private(set) var results: [HappyHourWindow] = []
    @Published private(set) var loading = false
    @Published private(set) var errorMessage: String?

    private let happyHourService: HappyHourServicing
    private let sessionStore: SessionStore

    init(happyHourService: HappyHourServicing, sessionStore: SessionStore) {
        self.happyHourService = happyHourService
        self.sessionStore = sessionStore
    }

    func search() async {
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            let all = try await happyHourService.fetchPublishedHappyHours(accessToken: sessionStore.session?.accessToken)
            let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if normalized.isEmpty {
                results = all
            } else {
                results = all.filter {
                    ($0.venue?.name ?? "").lowercased().contains(normalized)
                    || ($0.venue?.orgName ?? "").lowercased().contains(normalized)
                    || ($0.venue?.address ?? "").lowercased().contains(normalized)
                    || ($0.venue?.city ?? "").lowercased().contains(normalized)
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            results = []
        }
    }
}
