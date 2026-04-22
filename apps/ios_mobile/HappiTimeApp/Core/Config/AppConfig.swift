import Foundation

struct AppConfig {
    let environment: Environment
    let supabaseURL: URL?
    let supabaseAnonKey: String
    let authRedirectScheme: String
    let googleIOSClientID: String?
    let bundleIdentifier: String?

    static func load(bundle: Bundle = .main) -> AppConfig {
        let plist = bundle.infoDictionary ?? [:]

        let urlString = ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? plist["SUPABASE_URL"] as? String
        let anonKey = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]
            ?? plist["SUPABASE_ANON_KEY"] as? String
            ?? ""
        let redirectScheme = ProcessInfo.processInfo.environment["AUTH_REDIRECT_SCHEME"]
            ?? plist["AUTH_REDIRECT_SCHEME"] as? String
            ?? "happitime"
        let googleClientID = ProcessInfo.processInfo.environment["GOOGLE_IOS_CLIENT_ID"]
            ?? plist["GOOGLE_IOS_CLIENT_ID"] as? String
        let bundleID = bundle.bundleIdentifier ?? (plist["BUNDLE_IDENTIFIER"] as? String)

        return AppConfig(
            environment: Environment.current,
            supabaseURL: urlString.flatMap(URL.init(string:)),
            supabaseAnonKey: anonKey,
            authRedirectScheme: redirectScheme,
            googleIOSClientID: googleClientID,
            bundleIdentifier: bundleID
        )
    }

    var isSupabaseConfigured: Bool {
        supabaseURL != nil && !supabaseAnonKey.isEmpty
    }

    var authCallbackURL: URL? {
        URL(string: "\(authRedirectScheme)://auth/callback")
    }
}
