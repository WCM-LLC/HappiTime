import Foundation

struct HappyHourWindow: Codable, Identifiable, Equatable {
    let id: String
    let venueID: String?
    let name: String?
    let label: String?
    let startTime: String?
    let endTime: String?
    let timezone: String?
    let dayOfWeek: [Int]
    let venue: Venue?
    let offers: [HappyHourOffer]
    let createdAt: Date?
    let updatedAt: Date?
    let lastConfirmedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case venueID = "venue_id"
        case name
        case label
        case startTime = "start_time"
        case endTime = "end_time"
        case timezone
        case dayOfWeek = "dow"
        case venue
        case offers
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case lastConfirmedAt = "last_confirmed_at"
    }
}

struct HappyHourOffer: Codable, Identifiable, Equatable {
    let id: String
    let windowID: String?
    let title: String?
    let description: String?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case id
        case windowID = "window_id"
        case title
        case description
        case status
    }
}
