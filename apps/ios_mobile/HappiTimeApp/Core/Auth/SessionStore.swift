import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var route: AppRoute = .loading
    @Published private(set) var session: AuthSession?
    @Published private(set) var isBootstrapped = false
    @Published private(set) var isAuthorizing = false
    @Published var authErrorMessage: String?

    private let authService: AuthServicing
    private let config: AppConfig

    init(authService: AuthServicing, config: AppConfig) {
        self.authService = authService
        self.config = config
    }

    func bootstrapSession() async {
        guard !isBootstrapped else { return }
        isBootstrapped = true
        route = .loading
        authErrorMessage = nil

        do {
            session = try await authService.restoreSession()
            route = session == nil ? .auth : .main
        } catch {
            session = nil
            route = .auth
            authErrorMessage = error.localizedDescription
        }
    }

    func sendMagicLink(email: String) async {
        authErrorMessage = nil
        guard let redirect = config.authCallbackURL else {
            authErrorMessage = "Auth callback URL is not configured."
            return
        }

        isAuthorizing = true
        defer { isAuthorizing = false }

        do {
            try await authService.signInWithMagicLink(email: email, redirectTo: redirect)
        } catch {
            authErrorMessage = error.localizedDescription
        }
    }

    func startOAuth(_ provider: OAuthProvider) async -> URL? {
        authErrorMessage = nil
        guard let redirect = config.authCallbackURL else {
            authErrorMessage = "Auth callback URL is not configured."
            return nil
        }

        isAuthorizing = true
        defer { isAuthorizing = false }

        do {
            return try await authService.signInWithOAuth(provider: provider, redirectTo: redirect)
        } catch {
            authErrorMessage = error.localizedDescription
            return nil
        }
    }

    func handleOpenURL(_ url: URL) async {
        guard !isAuthorizing else { return }
        isAuthorizing = true
        defer { isAuthorizing = false }

        do {
            if let callbackSession = try await authService.handleOpenURL(url) {
                session = callbackSession
                route = .main
                authErrorMessage = nil
            }
        } catch {
            authErrorMessage = error.localizedDescription
            route = .auth
        }
    }

    func signOut() async {
        authErrorMessage = nil

        do {
            try await authService.signOut()
            session = nil
            route = .auth
        } catch {
            authErrorMessage = error.localizedDescription
        }
    }
}
