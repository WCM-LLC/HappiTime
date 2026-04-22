import SwiftUI

struct VenueMapPlaceholderView: View {
    var body: some View {
        ContentUnavailableView(
            "Map coming next",
            systemImage: "map",
            description: Text("Map parity is scheduled for Stage 7 (MapKit + location overlays).")
        )
        .navigationTitle("Map")
    }
}
