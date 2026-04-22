import Foundation
import FoundationNetworking

protocol HappyHourServicing {
    func fetchPublishedHappyHours(accessToken: String?) async throws -> [HappyHourWindow]
    func fetchVenueMenus(venueID: String, accessToken: String?) async throws -> [Menu]
}

private struct HappyHourWindowDTO: Decodable {
    let id: String
    let venue_id: String?
    let name: String?
    let label: String?
    let start_time: String?
    let end_time: String?
    let timezone: String?
    let dow: [Int]?
    let created_at: String?
    let updated_at: String?
    let last_confirmed_at: String?
}

private struct HappyHourOfferDTO: Decodable {
    let id: String
    let window_id: String?
    let title: String?
    let description: String?
    let status: String?
}

private struct VenueDTO: Decodable {
    let id: String
    let org_id: String?
    let org_name: String?
    let name: String?
    let address: String?
    let city: String?
    let state: String?
    let zip: String?
    let phone: String?
    let website: String?
    let timezone: String?
    let tags: [String]?
    let price_tier: Int?
    let lat: Double?
    let lng: Double?
}

private struct MenuDTO: Decodable {
    let id: String
    let venue_id: String
    let name: String
}

private struct MenuSectionDTO: Decodable {
    let id: String
    let menu_id: String
    let name: String
}

private struct MenuItemDTO: Decodable {
    let id: String
    let section_id: String
    let name: String
    let description: String?
    let price: String?
}

final class HappyHourService: HappyHourServicing {
    private let config: AppConfig

    init(config: AppConfig = AppConfig.load()) {
        self.config = config
    }

    func fetchPublishedHappyHours(accessToken: String?) async throws -> [HappyHourWindow] {
        guard let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("SUPABASE_URL is missing.")
        }

        let windows: [HappyHourWindowDTO] = try await select(
            table: "happy_hour_windows",
            queryItems: [
                URLQueryItem(name: "status", value: "eq.published"),
                URLQueryItem(name: "select", value: "id,venue_id,name,label,start_time,end_time,timezone,dow,created_at,updated_at,last_confirmed_at")
            ],
            accessToken: accessToken,
            baseURL: baseURL
        )

        let windowIDs = windows.map(\.id)
        let venueIDs = Array(Set(windows.compactMap(\.venue_id))).sorted()

        let offers: [HappyHourOfferDTO]
        if windowIDs.isEmpty {
            offers = []
        } else {
            let inValue = "(\(windowIDs.joined(separator: ",")))"
            offers = try await select(
                table: "happy_hour_offers",
                queryItems: [
                    URLQueryItem(name: "status", value: "eq.published"),
                    URLQueryItem(name: "window_id", value: "in.\(inValue)"),
                    URLQueryItem(name: "select", value: "id,window_id,title,description,status")
                ],
                accessToken: accessToken,
                baseURL: baseURL
            )
        }

        let venues: [VenueDTO]
        if venueIDs.isEmpty {
            venues = []
        } else {
            let inValue = "(\(venueIDs.joined(separator: ",")))"
            venues = try await select(
                table: "venues",
                queryItems: [
                    URLQueryItem(name: "id", value: "in.\(inValue)"),
                    URLQueryItem(name: "select", value: "id,org_id,org_name,name,address,city,state,zip,phone,website,timezone,tags,price_tier,lat,lng")
                ],
                accessToken: accessToken,
                baseURL: baseURL
            )
        }

        let offersByWindow = Dictionary(grouping: offers, by: { $0.window_id ?? "" })
        let venueByID = Dictionary(uniqueKeysWithValues: venues.map { ($0.id, $0) })

        return windows.map { row in
            let mappedOffers = (offersByWindow[row.id] ?? []).map {
                HappyHourOffer(id: $0.id, windowID: $0.window_id, title: $0.title, description: $0.description, status: $0.status)
            }

            let mappedVenue = row.venue_id.flatMap { venueByID[$0] }.map(mapVenue)

            return HappyHourWindow(
                id: row.id,
                venueID: row.venue_id,
                name: row.name,
                label: row.label,
                startTime: row.start_time,
                endTime: row.end_time,
                timezone: row.timezone,
                dayOfWeek: row.dow ?? [],
                venue: mappedVenue,
                offers: mappedOffers,
                createdAt: parseDate(row.created_at),
                updatedAt: parseDate(row.updated_at),
                lastConfirmedAt: parseDate(row.last_confirmed_at)
            )
        }
    }

    func fetchVenueMenus(venueID: String, accessToken: String?) async throws -> [Menu] {
        guard let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("SUPABASE_URL is missing.")
        }

        let menus: [MenuDTO] = try await select(
            table: "menus",
            queryItems: [
                URLQueryItem(name: "venue_id", value: "eq.\(venueID)"),
                URLQueryItem(name: "status", value: "eq.published"),
                URLQueryItem(name: "select", value: "id,venue_id,name")
            ],
            accessToken: accessToken,
            baseURL: baseURL
        )

        let menuIDs = menus.map(\.id)
        guard !menuIDs.isEmpty else { return [] }

        let inMenus = "(\(menuIDs.joined(separator: ",")))"

        let sections: [MenuSectionDTO] = try await select(
            table: "menu_sections",
            queryItems: [
                URLQueryItem(name: "menu_id", value: "in.\(inMenus)"),
                URLQueryItem(name: "select", value: "id,menu_id,name")
            ],
            accessToken: accessToken,
            baseURL: baseURL
        )

        let sectionIDs = sections.map(\.id)
        let items: [MenuItemDTO]

        if sectionIDs.isEmpty {
            items = []
        } else {
            let inSections = "(\(sectionIDs.joined(separator: ",")))"
            items = try await select(
                table: "menu_items",
                queryItems: [
                    URLQueryItem(name: "section_id", value: "in.\(inSections)"),
                    URLQueryItem(name: "select", value: "id,section_id,name,description,price")
                ],
                accessToken: accessToken,
                baseURL: baseURL
            )
        }

        let itemsBySection = Dictionary(grouping: items, by: \.section_id)
        let sectionsByMenu = Dictionary(grouping: sections, by: \.menu_id)

        return menus.map { menu in
            let mappedSections = (sectionsByMenu[menu.id] ?? []).map { section in
                let mappedItems = (itemsBySection[section.id] ?? []).map {
                    MenuItem(id: $0.id, name: $0.name, description: $0.description, price: $0.price)
                }
                return MenuSection(id: section.id, name: section.name, items: mappedItems)
            }
            return Menu(id: menu.id, venueID: menu.venue_id, name: menu.name, sections: mappedSections)
        }
    }

    private func mapVenue(_ row: VenueDTO) -> Venue {
        Venue(
            id: row.id,
            orgID: row.org_id,
            orgName: row.org_name,
            name: row.name,
            address: row.address,
            city: row.city,
            state: row.state,
            zip: row.zip,
            phone: row.phone,
            website: row.website,
            timezone: row.timezone,
            tags: row.tags ?? [],
            priceTier: row.price_tier,
            latitude: row.lat,
            longitude: row.lng
        )
    }

    private func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return ISO8601DateFormatter().date(from: value)
    }

    private func select<T: Decodable>(
        table: String,
        queryItems: [URLQueryItem],
        accessToken: String?,
        baseURL: URL
    ) async throws -> [T] {
        guard var components = URLComponents(url: baseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidResponse
        }
        components.queryItems = queryItems

        guard let url = components.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        let bearer = accessToken ?? config.supabaseAnonKey
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown Supabase error"
            throw APIError.server(message)
        }

        do {
            return try JSONDecoder().decode([T].self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}
