import Foundation

enum DateTimeFormatters {
    static func formatTimeRange(start: String?, end: String?) -> String {
        guard let start, let end else { return "" }
        return "\(to12h(start)) - \(to12h(end))"
    }

    static func formatDays(_ dow: [Int]) -> String {
        let labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        return dow.map { idx in labels.indices.contains(idx) ? labels[idx] : "D\(idx)" }
            .joined(separator: " · ")
    }

    private static func to12h(_ value: String) -> String {
        let parts = value.split(separator: ":")
        guard let hourRaw = Int(parts.first ?? ""), let minuteRaw = Int(parts.dropFirst().first ?? "") else {
            return value
        }
        let suffix = hourRaw >= 12 ? "PM" : "AM"
        let hour = ((hourRaw + 11) % 12) + 1
        return String(format: "%d:%02d %@", hour, minuteRaw, suffix)
    }
}
