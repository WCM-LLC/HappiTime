import Foundation

enum Environment: String {
    case development
    case staging
    case production

    static var current: Environment {
        let raw = ProcessInfo.processInfo.environment["HAPPITIME_ENV"]?.lowercased()
        return Environment(rawValue: raw ?? "development") ?? .development
    }
}
