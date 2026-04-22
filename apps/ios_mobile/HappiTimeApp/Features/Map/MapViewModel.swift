import Foundation
import MapKit

@MainActor
final class MapViewModel: ObservableObject {
    struct VenueMarker: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let coordinate: CLLocationCoordinate2D
        let windowID: String
        let tags: [String]
    }

    @Published var query: String = "" { didSet { applyFilters() } }
    @Published var selectedCuisine: String = "all" { didSet { applyFilters() } }

    @Published private(set) var markers: [VenueMarker] = []
    @Published private(set) var filteredMarkers: [VenueMarker] = []
    @Published private(set) var loading = false
    @Published private(set) var errorMessage: String?

    private let happyHourService: HappyHourServicing
    private let sessionStore: SessionStore

    init(happyHourService: HappyHourServicing, sessionStore: SessionStore) {
        self.happyHourService = happyHourService
        self.sessionStore = sessionStore
    }

    var cuisineOptions: [String] {
        let set = Set(markers.flatMap(\.tags).map { $0.replacingOccurrences(of: "_", with: " ").lowercased() })
        return ["all"] + set.sorted()
    }

    func load() async {
        guard !loading else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            let windows = try await happyHourService.fetchPublishedHappyHours(accessToken: sessionStore.session?.accessToken)
            markers = windows.compactMap { window in
                guard
                    let venue = window.venue,
                    let lat = venue.latitude,
                    let lng = venue.longitude
                else { return nil }

                return VenueMarker(
                    id: window.id,
                    title: venue.orgName ?? venue.name ?? window.name ?? "Venue",
                    subtitle: venue.address ?? "",
                    coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                    windowID: window.id,
                    tags: venue.tags
                )
            }
            applyFilters()
        } catch {
            errorMessage = error.localizedDescription
            markers = []
            filteredMarkers = []
        }
    }

    private func applyFilters() {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        filteredMarkers = markers.filter { marker in
            let matchesQuery = normalized.isEmpty
                || marker.title.lowercased().contains(normalized)
                || marker.subtitle.lowercased().contains(normalized)

            let normalizedTags = marker.tags.map { $0.replacingOccurrences(of: "_", with: " ").lowercased() }
            let matchesCuisine = selectedCuisine == "all" || normalizedTags.contains(selectedCuisine)

            return matchesQuery && matchesCuisine
        }
    }
}
