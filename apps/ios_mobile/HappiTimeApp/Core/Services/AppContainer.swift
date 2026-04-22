import Foundation

@MainActor
final class AppContainer: ObservableObject {
    let config: AppConfig
    let authService: AuthServicing
    let happyHourService: HappyHourServicing
    let userService: UserServicing
    let sessionStore: SessionStore

    init(
        config: AppConfig,
        authService: AuthServicing,
        happyHourService: HappyHourServicing,
        userService: UserServicing
    ) {
        self.config = config
        self.authService = authService
        self.happyHourService = happyHourService
        self.userService = userService
        self.sessionStore = SessionStore(authService: authService, config: config)
    }

    static func bootstrap() -> AppContainer {
        let config = AppConfig.load()
        let authService = SupabaseAuthService(config: config)
        let happyHourService = HappyHourService(config: config)
        let userService = UserService(config: config)
        return AppContainer(
            config: config,
            authService: authService,
            happyHourService: happyHourService,
            userService: userService
        )
    }
}
