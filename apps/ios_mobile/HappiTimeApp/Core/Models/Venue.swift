import Foundation

struct Venue: Codable, Identifiable, Equatable {
    let id: String
    let orgID: String?
    let orgName: String?
    let name: String?
    let address: String?
    let city: String?
    let state: String?
    let zip: String?
    let phone: String?
    let website: String?
    let timezone: String?
    let tags: [String]
    let priceTier: Int?
    let latitude: Double?
    let longitude: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case orgID = "org_id"
        case orgName = "org_name"
        case name
        case address
        case city
        case state
        case zip
        case phone
        case website
        case timezone
        case tags
        case priceTier = "price_tier"
        case latitude = "lat"
        case longitude = "lng"
    }
}
