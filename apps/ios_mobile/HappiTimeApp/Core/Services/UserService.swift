import Foundation
import FoundationNetworking

struct UserProfile: Codable, Equatable {
    let userID: String
    let handle: String?
    let displayName: String?
    let avatarURL: String?
    let bio: String?
    let isPublic: Bool

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case handle
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case bio
        case isPublic = "is_public"
    }
}

struct UserPreferences: Codable, Equatable {
    let homeCity: String?
    let homeState: String?
    let homeLat: Double?
    let homeLng: Double?
    let notificationsPush: Bool
    let notificationsHappyHours: Bool
    let notificationsVenueUpdates: Bool
    let notificationsFriendActivity: Bool
    let notificationsProduct: Bool

    enum CodingKeys: String, CodingKey {
        case homeCity = "home_city"
        case homeState = "home_state"
        case homeLat = "home_lat"
        case homeLng = "home_lng"
        case notificationsPush = "notifications_push"
        case notificationsHappyHours = "notifications_happy_hours"
        case notificationsVenueUpdates = "notifications_venue_updates"
        case notificationsFriendActivity = "notifications_friend_activity"
        case notificationsProduct = "notifications_product"
    }

    static let `default` = UserPreferences(
        homeCity: nil,
        homeState: nil,
        homeLat: nil,
        homeLng: nil,
        notificationsPush: true,
        notificationsHappyHours: true,
        notificationsVenueUpdates: true,
        notificationsFriendActivity: true,
        notificationsProduct: true
    )
}

struct HistoryEntry: Codable, Identifiable, Equatable {
    let id: String
    let eventType: String
    let venueID: String?
    let createdAt: String
    let venue: VenueSummary?

    enum CodingKeys: String, CodingKey {
        case id
        case eventType = "event_type"
        case venueID = "venue_id"
        case createdAt = "created_at"
        case venue
    }
}

struct VenueSummary: Codable, Equatable {
    let id: String
    let name: String?
    let city: String?
    let state: String?
}

struct UserList: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String?
    let visibility: String
    let createdAt: String
    let updatedAt: String
}

struct Follower: Codable, Identifiable, Equatable {
    var id: String { followerID }
    let followerID: String
    let createdAt: String
    let profile: FollowerProfile?

    enum CodingKeys: String, CodingKey {
        case followerID = "follower_id"
        case createdAt = "created_at"
        case profile
    }
}

struct FollowerProfile: Codable, Equatable {
    let handle: String?
    let displayName: String?
    let avatarURL: String?

    enum CodingKeys: String, CodingKey {
        case handle
        case displayName = "display_name"
        case avatarURL = "avatar_url"
    }
}

protocol UserServicing {
    func fetchFollowedVenueIDs(userID: String, accessToken: String) async throws -> [String]
    func toggleFollowVenue(userID: String, venueID: String, currentlyFollowing: Bool, accessToken: String) async throws
    func fetchProfile(userID: String, accessToken: String) async throws -> UserProfile?
    func upsertProfile(_ profile: UserProfile, accessToken: String) async throws
    func fetchPreferences(userID: String, accessToken: String) async throws -> UserPreferences
    func upsertPreferences(userID: String, patch: [String: Any], accessToken: String) async throws
    func fetchHistory(userID: String, accessToken: String) async throws -> [HistoryEntry]
    func fetchLists(userID: String, accessToken: String) async throws -> [UserList]
    func createList(userID: String, name: String, description: String?, accessToken: String) async throws
    func suggestVenue(userID: String, payload: [String: Any], accessToken: String) async throws
    func fetchFollowers(userID: String, accessToken: String) async throws -> [Follower]
}

final class UserService: UserServicing {
    private let config: AppConfig

    init(config: AppConfig = AppConfig.load()) {
        self.config = config
    }

    func fetchFollowedVenueIDs(userID: String, accessToken: String) async throws -> [String] {
        struct Row: Decodable { let venue_id: String }
        let rows: [Row] = try await get(
            table: "user_followed_venues",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "select", value: "venue_id")
            ],
            accessToken: accessToken
        )
        return rows.map(\.venue_id)
    }

    func toggleFollowVenue(userID: String, venueID: String, currentlyFollowing: Bool, accessToken: String) async throws {
        if currentlyFollowing {
            try await delete(
                table: "user_followed_venues",
                query: [
                    URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                    URLQueryItem(name: "venue_id", value: "eq.\(venueID)")
                ],
                accessToken: accessToken
            )
        } else {
            try await upsert(
                table: "user_followed_venues",
                payload: [["user_id": userID, "venue_id": venueID]],
                onConflict: "user_id,venue_id",
                accessToken: accessToken
            )
        }
    }

    func fetchProfile(userID: String, accessToken: String) async throws -> UserProfile? {
        let profiles: [UserProfile] = try await get(
            table: "user_profiles",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "select", value: "user_id,handle,display_name,avatar_url,bio,is_public"),
                URLQueryItem(name: "limit", value: "1")
            ],
            accessToken: accessToken
        )
        return profiles.first
    }

    func upsertProfile(_ profile: UserProfile, accessToken: String) async throws {
        let payload: [[String: Any]] = [[
            "user_id": profile.userID,
            "handle": profile.handle as Any,
            "display_name": profile.displayName as Any,
            "avatar_url": profile.avatarURL as Any,
            "bio": profile.bio as Any,
            "is_public": profile.isPublic,
            "updated_at": ISO8601DateFormatter().string(from: Date())
        ]]

        try await upsert(table: "user_profiles", payload: payload, onConflict: "user_id", accessToken: accessToken)
    }

    func fetchPreferences(userID: String, accessToken: String) async throws -> UserPreferences {
        let preferences: [UserPreferences] = try await get(
            table: "user_preferences",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "select", value: "home_city,home_state,home_lat,home_lng,notifications_push,notifications_happy_hours,notifications_venue_updates,notifications_friend_activity,notifications_product"),
                URLQueryItem(name: "limit", value: "1")
            ],
            accessToken: accessToken
        )
        return preferences.first ?? .default
    }

    func upsertPreferences(userID: String, patch: [String: Any], accessToken: String) async throws {
        var payload = patch
        payload["user_id"] = userID
        try await upsert(table: "user_preferences", payload: [payload], onConflict: "user_id", accessToken: accessToken)
    }

    func fetchHistory(userID: String, accessToken: String) async throws -> [HistoryEntry] {
        try await get(
            table: "user_events",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "event_type", value: "in.(venue_view,venue_save,venue_checkin)"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "limit", value: "50"),
                URLQueryItem(name: "select", value: "id,event_type,venue_id,created_at,venue:venues(id,name,city,state)")
            ],
            accessToken: accessToken
        )
    }

    func fetchLists(userID: String, accessToken: String) async throws -> [UserList] {
        try await get(
            table: "user_lists",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "order", value: "updated_at.desc"),
                URLQueryItem(name: "select", value: "id,name,description,visibility,created_at,updated_at")
            ],
            accessToken: accessToken
        )
    }

    func createList(userID: String, name: String, description: String?, accessToken: String) async throws {
        try await upsert(
            table: "user_lists",
            payload: [[
                "user_id": userID,
                "name": name,
                "description": description as Any,
                "visibility": "private"
            ]],
            onConflict: nil,
            accessToken: accessToken
        )
    }

    func suggestVenue(userID: String, payload: [String: Any], accessToken: String) async throws {
        var meta = payload
        meta["user_id"] = userID
        meta["event_type"] = "venue_suggestion"
        meta["venue_id"] = NSNull()

        try await upsert(table: "user_events", payload: [meta], onConflict: nil, accessToken: accessToken)
    }

    func fetchFollowers(userID: String, accessToken: String) async throws -> [Follower] {
        try await get(
            table: "user_follows",
            query: [
                URLQueryItem(name: "following_user_id", value: "eq.\(userID)"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "select", value: "follower_id,created_at,profile:user_profiles!user_follows_follower_id_profile_fkey(handle,display_name,avatar_url)")
            ],
            accessToken: accessToken
        )
    }

    // MARK: - HTTP

    private func get<T: Decodable>(table: String, query: [URLQueryItem], accessToken: String) async throws -> [T] {
        let request = try buildRequest(
            table: table,
            method: "GET",
            query: query,
            accessToken: accessToken,
            body: nil,
            prefer: nil
        )
        return try await decodeArray(request)
    }

    private func delete(table: String, query: [URLQueryItem], accessToken: String) async throws {
        let request = try buildRequest(
            table: table,
            method: "DELETE",
            query: query,
            accessToken: accessToken,
            body: nil,
            prefer: nil
        )
        _ = try await URLSession.shared.data(for: request)
    }

    private func upsert(table: String, payload: [[String: Any]], onConflict: String?, accessToken: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: payload)
        var prefer = "return=minimal"
        if onConflict != nil {
            prefer = "resolution=merge-duplicates,\(prefer)"
        }

        var query: [URLQueryItem] = []
        if let onConflict {
            query.append(URLQueryItem(name: "on_conflict", value: onConflict))
        }

        let request = try buildRequest(
            table: table,
            method: "POST",
            query: query,
            accessToken: accessToken,
            body: body,
            prefer: prefer
        )
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.server("Supabase upsert failed for \(table)")
        }
    }

    private func buildRequest(
        table: String,
        method: String,
        query: [URLQueryItem],
        accessToken: String,
        body: Data?,
        prefer: String?
    ) throws -> URLRequest {
        guard let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("SUPABASE_URL is missing.")
        }

        guard var components = URLComponents(url: baseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidResponse
        }
        components.queryItems = query

        guard let url = components.url else { throw APIError.invalidResponse }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }

        return request
    }

    private func decodeArray<T: Decodable>(_ request: URLRequest) async throws -> [T] {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
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
