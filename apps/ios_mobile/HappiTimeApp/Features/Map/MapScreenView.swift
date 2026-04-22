import MapKit
import SwiftUI

struct MapScreenView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject var viewModel: MapViewModel
    @StateObject private var locationService = LocationService()

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                TextField("Search venues", text: $viewModel.query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(viewModel.cuisineOptions, id: \.self) { option in
                            Button(option.capitalized) {
                                viewModel.selectedCuisine = option
                            }
                            .buttonStyle(option == viewModel.selectedCuisine ? .borderedProminent : .bordered)
                        }
                    }
                }
            }
            .padding()
            .background(.ultraThinMaterial)

            if let error = viewModel.errorMessage {
                ErrorMessageView(message: error)
                    .padding()
            }

            Map(position: $cameraPosition) {
                UserAnnotation()
                ForEach(viewModel.filteredMarkers) { marker in
                    Annotation(marker.title, coordinate: marker.coordinate) {
                        NavigationLink {
                            VenueDetailView(windowID: marker.windowID, container: container)
                        } label: {
                            VStack(spacing: 2) {
                                Image(systemName: "mappin.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(AppTheme.Colors.primary)
                                Text(marker.title)
                                    .font(.caption2)
                                    .lineLimit(1)
                                    .padding(.horizontal, 6)
                                    .background(.ultraThinMaterial)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
            }
            .mapControls {
                MapCompass()
                MapScaleView()
                MapUserLocationButton()
            }
            .onAppear {
                locationService.requestWhenInUseAuthorization()
            }
            .onChange(of: locationService.lastLocation) { _, location in
                guard let location else { return }
                cameraPosition = .region(
                    MKCoordinateRegion(
                        center: location.coordinate,
                        span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06)
                    )
                )
            }
        }
        .navigationTitle("Map")
        .task {
            await viewModel.load()
        }
    }
}
