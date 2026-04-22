import SwiftUI

struct VenueDetailView: View {
    @Environment(\.openURL) private var openURL
    @StateObject private var viewModel: VenueDetailViewModel

    init(windowID: String, container: AppContainer) {
        _viewModel = StateObject(wrappedValue: VenueDetailViewModel(
            windowID: windowID,
            happyHourService: container.happyHourService,
            userService: container.userService,
            sessionStore: container.sessionStore
        ))
    }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.window == nil {
                LoadingView(message: "Loading venue…")
            } else if let error = viewModel.errorMessage, viewModel.window == nil {
                ErrorMessageView(message: error)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let window = viewModel.window {
                List {
                    Section {
                        Text(window.venue?.orgName ?? window.venue?.name ?? window.name ?? "Venue")
                            .font(.title3.bold())
                        if let venueName = window.venue?.name,
                           venueName != (window.venue?.orgName ?? "") {
                            Text(venueName)
                                .foregroundStyle(.secondary)
                        }
                        if let address = window.venue?.address {
                            Text(address)
                                .foregroundStyle(.secondary)
                        }
                        Text(DateTimeFormatters.formatTimeRange(start: window.startTime, end: window.endTime))
                            .font(.subheadline)
                    }

                    Section("Actions") {
                        Button(viewModel.isSaved ? "Remove from Favorites" : "Save to Favorites") {
                            Task { await viewModel.toggleSave() }
                        }
                        .buttonStyle(.borderedProminent)

                        if let website = window.venue?.website, let url = URL(string: website) {
                            Button("Open Website") { openURL(url) }
                        }

                        if let phone = window.venue?.phone,
                           let telURL = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                            Button("Call Venue") { openURL(telURL) }
                        }

                        if let lat = window.venue?.latitude,
                           let lng = window.venue?.longitude,
                           let mapsURL = URL(string: "http://maps.apple.com/?ll=\(lat),\(lng)") {
                            Button("Open in Maps") { openURL(mapsURL) }
                        }
                    }

                    Section("Offers") {
                        if window.offers.isEmpty {
                            Text("No offer details available.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(window.offers) { offer in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(offer.title ?? "Offer")
                                        .font(.headline)
                                    if let description = offer.description {
                                        Text(description)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    Section("Menus") {
                        if viewModel.menus.isEmpty {
                            Text("No menu published.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.menus) { menu in
                                NavigationLink {
                                    MenuView(menu: menu)
                                } label: {
                                    Text(menu.name)
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                Text("Venue not found.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Details")
        .task {
            await viewModel.load()
        }
    }
}
