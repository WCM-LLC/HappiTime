import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject var viewModel: HomeViewModel

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.filtered.isEmpty {
                LoadingView(message: "Loading happy hours…")
            } else if let error = viewModel.errorMessage, viewModel.filtered.isEmpty {
                VStack(spacing: 12) {
                    ErrorMessageView(message: error)
                    Button("Retry") {
                        Task { await viewModel.refresh() }
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    Section {
                        TextField("Search venues", text: $viewModel.searchQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }

                    Section("Cuisine") {
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

                    if !viewModel.priceTierOptions.isEmpty {
                        Section("Price") {
                            HStack {
                                Button("All") {
                                    viewModel.selectedPriceTier = nil
                                }
                                .buttonStyle(viewModel.selectedPriceTier == nil ? .borderedProminent : .bordered)

                                ForEach(viewModel.priceTierOptions, id: \.self) { tier in
                                    Button(String(repeating: "$", count: tier)) {
                                        viewModel.selectedPriceTier = tier
                                    }
                                    .buttonStyle(viewModel.selectedPriceTier == tier ? .borderedProminent : .bordered)
                                }
                            }
                        }
                    }

                    Section("Today") {
                        if viewModel.filtered.isEmpty {
                            Text("No matching happy hours found.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.filtered) { window in
                                NavigationLink {
                                    VenueDetailView(windowID: window.id, container: container)
                                } label: {
                                    HomeWindowRow(window: window)
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable {
                    await viewModel.refresh()
                }
            }
        }
        .navigationTitle("HappiTime")
        .task {
            await viewModel.load()
        }
    }
}

private struct HomeWindowRow: View {
    let window: HappyHourWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(window.venue?.orgName ?? window.venue?.name ?? window.name ?? "Happy Hour")
                .font(.headline)
            if let venueName = window.venue?.name, venueName != (window.venue?.orgName ?? "") {
                Text(venueName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let address = window.venue?.address {
                Text(address)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Text(DateTimeFormatters.formatTimeRange(start: window.startTime, end: window.endTime))
                .font(.footnote)
        }
        .padding(.vertical, 4)
    }
}
