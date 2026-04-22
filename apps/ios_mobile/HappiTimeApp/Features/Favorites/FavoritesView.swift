import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject var viewModel: FavoritesViewModel

    var body: some View {
        List {
            Section {
                Picker("Tab", selection: $viewModel.selectedTab) {
                    Text("Favorites").tag(FavoritesViewModel.Tab.favorites)
                    Text("History").tag(FavoritesViewModel.Tab.history)
                    Text("Itineraries").tag(FavoritesViewModel.Tab.lists)
                }
                .pickerStyle(.segmented)
            }

            if viewModel.loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else if let error = viewModel.errorMessage {
                Section { ErrorMessageView(message: error) }
            } else {
                switch viewModel.selectedTab {
                case .favorites:
                    Section("Saved Venues") {
                        if viewModel.favoriteWindows.isEmpty {
                            Text("No saved venues yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.favoriteWindows) { window in
                                NavigationLink {
                                    VenueDetailView(windowID: window.id, container: container)
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(window.venue?.orgName ?? window.venue?.name ?? "Venue")
                                        Text(window.venue?.address ?? "")
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                case .history:
                    Section("History") {
                        if viewModel.history.isEmpty {
                            Text("No history yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.history) { entry in
                                VStack(alignment: .leading) {
                                    Text(entry.venue?.name ?? "Unknown venue")
                                    Text(entry.eventType)
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                case .lists:
                    Section("Itineraries") {
                        if viewModel.lists.isEmpty {
                            Text("No itineraries yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.lists) { list in
                                VStack(alignment: .leading) {
                                    Text(list.name)
                                    if let description = list.description {
                                        Text(description)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Favorites")
        .task {
            await viewModel.load()
        }
        .refreshable {
            await viewModel.load()
        }
    }
}
