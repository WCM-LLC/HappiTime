import Foundation
import FoundationNetworking

protocol AuthServicing {
    func restoreSession() async throws -> AuthSession?
    func signInWithMagicLink(email: String, redirectTo: URL) async throws
    func signInWithOAuth(provider: OAuthProvider, redirectTo: URL) async throws -> URL?
    func handleOpenURL(_ url: URL) async throws -> AuthSession?
    func signOut() async throws
}

enum OAuthProvider: String, CaseIterable {
    case apple
    case google
}

private struct SupabaseTokenResponse: Decodable {
    let access_token: String
    let refresh_token: String
    let token_type: String
    let expires_in: Int?
    let expires_at: Int?
    let user: SupabaseUserResponse
}

private struct SupabaseUserResponse: Decodable {
    let id: String
    let email: String?
}

private struct SupabaseOTPRequest: Encodable {
    let email: String
    let create_user: Bool
    let email_redirect_to: String
}

private struct SupabaseRefreshRequest: Encodable {
    let refresh_token: String
}

final class SupabaseAuthService: AuthServicing {
    private let config: AppConfig
    private let storage: KeyValueStore
    private let sessionKey = "happitime.auth.session"

    init(config: AppConfig, storage: KeyValueStore = KeychainKeyValueStore()) {
        self.config = config
        self.storage = storage
    }

    func restoreSession() async throws -> AuthSession? {
        guard let existing = try loadSessionFromStorage() else { return nil }

        if existing.isLikelyExpired {
            return try await refreshSession(using: existing.refreshToken)
        }

        return existing
    }

    func signInWithMagicLink(email: String, redirectTo: URL) async throws {
        guard config.isSupabaseConfigured, let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("Missing Supabase configuration in Info.plist or environment.")
        }

        let endpoint = baseURL.appendingPathComponent("auth/v1/otp")
        let body = SupabaseOTPRequest(email: email, create_user: true, email_redirect_to: redirectTo.absoluteString)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        addSupabaseHeaders(to: &request)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            throw APIError.server("Magic link request failed (status \(http.statusCode)).")
        }
    }

    func signInWithOAuth(provider: OAuthProvider, redirectTo: URL) async throws -> URL? {
        guard config.isSupabaseConfigured, let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("Missing Supabase configuration in Info.plist or environment.")
        }

        var components = URLComponents(url: baseURL.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "provider", value: provider.rawValue),
            URLQueryItem(name: "redirect_to", value: redirectTo.absoluteString)
        ]

        return components?.url
    }

    func handleOpenURL(_ url: URL) async throws -> AuthSession? {
        let tokens = extractTokens(from: url)
        guard let tokens else { return nil }

        let session = try await exchangeTokensForSession(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken)
        try persistSession(session)
        return session
    }

    func signOut() async throws {
        guard config.isSupabaseConfigured, let baseURL = config.supabaseURL else {
            storage.removeValue(forKey: sessionKey)
            return
        }

        if let session = try? loadSessionFromStorage() {
            var request = URLRequest(url: baseURL.appendingPathComponent("auth/v1/logout"))
            request.httpMethod = "POST"
            addSupabaseHeaders(to: &request)
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }

        storage.removeValue(forKey: sessionKey)
    }

    private func refreshSession(using refreshToken: String) async throws -> AuthSession {
        guard let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("Missing Supabase URL for refresh.")
        }

        let endpoint = baseURL.appendingPathComponent("auth/v1/token")
        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]

        guard let refreshURL = components?.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: refreshURL)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(SupabaseRefreshRequest(refresh_token: refreshToken))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        addSupabaseHeaders(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.server("Session refresh failed (status \(http.statusCode)).")
        }

        let tokenResponse = try JSONDecoder().decode(SupabaseTokenResponse.self, from: data)
        let session = mapSession(from: tokenResponse)
        try persistSession(session)
        return session
    }

    private func exchangeTokensForSession(accessToken: String, refreshToken: String) async throws -> AuthSession {
        guard let baseURL = config.supabaseURL else {
            throw APIError.missingConfiguration("Missing Supabase URL for auth callback.")
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("auth/v1/user"))
        request.httpMethod = "GET"
        addSupabaseHeaders(to: &request)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.server("Failed to load auth user from callback token (status \(http.statusCode)).")
        }

        let userResponse = try JSONDecoder().decode(SupabaseUserResponse.self, from: data)

        return AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenType: "bearer",
            user: AuthUser(id: userResponse.id, email: userResponse.email),
            expiresAt: nil
        )
    }

    private func mapSession(from response: SupabaseTokenResponse) -> AuthSession {
        let expiresAt: Date?
        if let epoch = response.expires_at {
            expiresAt = Date(timeIntervalSince1970: TimeInterval(epoch))
        } else if let expiresIn = response.expires_in {
            expiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))
        } else {
            expiresAt = nil
        }

        return AuthSession(
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            tokenType: response.token_type,
            user: AuthUser(id: response.user.id, email: response.user.email),
            expiresAt: expiresAt
        )
    }

    private func loadSessionFromStorage() throws -> AuthSession? {
        guard let data = storage.data(forKey: sessionKey) else { return nil }
        do {
            return try JSONDecoder().decode(AuthSession.self, from: data)
        } catch {
            storage.removeValue(forKey: sessionKey)
            throw APIError.decoding(error.localizedDescription)
        }
    }

    private func persistSession(_ session: AuthSession) throws {
        let data = try JSONEncoder().encode(session)
        storage.setData(data, forKey: sessionKey)
    }

    private func addSupabaseHeaders(to request: inout URLRequest) {
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
    }

    private func extractTokens(from url: URL) -> (accessToken: String, refreshToken: String)? {
        let absolute = url.absoluteString

        let fragment: String?
        if let hash = absolute.split(separator: "#", maxSplits: 1).dropFirst().first {
            fragment = String(hash)
        } else {
            fragment = URLComponents(url: url, resolvingAgainstBaseURL: false)?.query
        }

        guard let fragment else { return nil }

        let pairs = fragment.split(separator: "&")
        var values: [String: String] = [:]

        for pair in pairs {
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard let key = parts.first else { continue }
            let value = parts.count > 1 ? parts[1] : ""
            values[key.removingPercentEncoding ?? key] = value.removingPercentEncoding ?? value
        }

        guard
            let accessToken = values["access_token"],
            let refreshToken = values["refresh_token"],
            !accessToken.isEmpty,
            !refreshToken.isEmpty
        else {
            return nil
        }

        return (accessToken, refreshToken)
    }
}
