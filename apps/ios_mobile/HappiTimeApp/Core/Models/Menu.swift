import Foundation

struct Menu: Codable, Identifiable, Equatable {
    let id: String
    let venueID: String
    let name: String
    let sections: [MenuSection]

    enum CodingKeys: String, CodingKey {
        case id
        case venueID = "venue_id"
        case name
        case sections
    }
}

struct MenuSection: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let items: [MenuItem]
}

struct MenuItem: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String?
    let price: String?
}
