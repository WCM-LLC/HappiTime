import Foundation

enum AppRoute: Equatable {
    case loading
    case auth
    case main
}

enum MainTab: Hashable {
    case home
    case search
    case map
    case favorites
    case activity
    case add
    case profile
}
