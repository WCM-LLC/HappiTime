import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject var viewModel: SearchViewModel

    var body: some View {
        List {
            Section {
                TextField("Search by venue, org, or city", text: $viewModel.query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Search") {
                    Task { await viewModel.search() }
                }
                .buttonStyle(.borderedProminent)
            }

            if viewModel.loading {
                Section {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            } else if let error = viewModel.errorMessage {
                Section {
                    ErrorMessageView(message: error)
                }
            } else {
                Section("Results") {
                    if viewModel.results.isEmpty {
                        Text("No results yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.results) { item in
                            NavigationLink {
                                VenueDetailView(windowID: item.id, container: container)
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(item.venue?.orgName ?? item.venue?.name ?? item.name ?? "Venue")
                                        .font(.headline)
                                    Text(item.venue?.address ?? item.venue?.city ?? "")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Search")
        .task {
            await viewModel.search()
        }
    }
}
