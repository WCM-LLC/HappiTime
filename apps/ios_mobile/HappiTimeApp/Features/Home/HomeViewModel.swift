import Foundation

@MainActor
final class HomeViewModel: ObservableObject {
    @Published private(set) var windows: [HappyHourWindow] = []
    @Published private(set) var filtered: [HappyHourWindow] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    @Published var searchQuery: String = "" { didSet { applyFilters() } }
    @Published var selectedCuisine: String = "all" { didSet { applyFilters() } }
    @Published var selectedPriceTier: Int? { didSet { applyFilters() } }

    private let happyHourService: HappyHourServicing
    private let sessionStore: SessionStore

    init(happyHourService: HappyHourServicing, sessionStore: SessionStore) {
        self.happyHourService = happyHourService
        self.sessionStore = sessionStore
    }

    var cuisineOptions: [String] {
        let cuisines = Set(
            windows
                .flatMap { $0.venue?.tags ?? [] }
                .map { $0.replacingOccurrences(of: "_", with: " ").lowercased() }
        )
        let sorted = cuisines.sorted()
        return ["all"] + sorted
    }

    var priceTierOptions: [Int] {
        let tiers = Set(windows.compactMap { $0.venue?.priceTier })
        return tiers.sorted()
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let token = sessionStore.session?.accessToken
            let fetched = try await happyHourService.fetchPublishedHappyHours(accessToken: token)
            windows = fetched
            applyFilters()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        await load()
    }

    func isVenueSaved(_ venueID: String?) -> Bool {
        false
    }

    private func applyFilters() {
        let today = Calendar.current.component(.weekday, from: Date()) - 1
        var result = windows.filter { window in
            window.dayOfWeek.contains(today)
        }

        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !q.isEmpty {
            result = result.filter { window in
                let name = (window.venue?.name ?? window.name ?? "").lowercased()
                let org = (window.venue?.orgName ?? "").lowercased()
                let address = (window.venue?.address ?? "").lowercased()
                let city = (window.venue?.city ?? "").lowercased()
                return name.contains(q) || org.contains(q) || address.contains(q) || city.contains(q)
            }
        }

        if selectedCuisine != "all" {
            result = result.filter {
                ($0.venue?.tags ?? []).map { $0.replacingOccurrences(of: "_", with: " ").lowercased() }.contains(selectedCuisine)
            }
        }

        if let selectedPriceTier {
            result = result.filter { $0.venue?.priceTier == selectedPriceTier }
        }

        filtered = result
    }
}
