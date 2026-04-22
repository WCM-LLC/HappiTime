import Foundation

enum APIError: LocalizedError {
    case missingConfiguration(String)
    case invalidResponse
    case unauthorized
    case server(String)
    case decoding(String)
    case unknown(String)

    var errorDescription: String? {
        switch self {
        case .missingConfiguration(let message): return message
        case .invalidResponse: return "Invalid response from server."
        case .unauthorized: return "You are not authorized."
        case .server(let message): return message
        case .decoding(let message): return "Failed to decode response: \(message)"
        case .unknown(let message): return message
        }
    }
}
