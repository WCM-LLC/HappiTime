import Foundation

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var email: String = ""
    @Published var isLoading = false
    @Published var statusMessage: String?
    @Published var pendingOAuthURL: URL?

    private unowned let sessionStore: SessionStore

    init(sessionStore: SessionStore) {
        self.sessionStore = sessionStore
    }

    func sendMagicLink() async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            statusMessage = "Enter an email to continue."
            return
        }

        isLoading = true
        defer { isLoading = false }

        await sessionStore.sendMagicLink(email: trimmed)
        if let error = sessionStore.authErrorMessage {
            statusMessage = error
        } else {
            statusMessage = "Magic link sent. Check your email."
        }
    }

    func startOAuth(_ provider: OAuthProvider) async {
        isLoading = true
        defer { isLoading = false }

        pendingOAuthURL = await sessionStore.startOAuth(provider)
        statusMessage = sessionStore.authErrorMessage ?? "Opening browser to continue sign-in…"
    }
}
