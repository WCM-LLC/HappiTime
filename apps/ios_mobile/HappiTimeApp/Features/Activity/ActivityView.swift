import SwiftUI

struct ActivityView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject var viewModel: ActivityViewModel

    var body: some View {
        List {
            Section {
                Picker("Activity", selection: $viewModel.selectedTab) {
                    Text("Friends").tag(ActivityViewModel.Tab.friends)
                    Text("Venues").tag(ActivityViewModel.Tab.venues)
                }
                .pickerStyle(.segmented)
            }

            if viewModel.loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else if let error = viewModel.errorMessage {
                Section { ErrorMessageView(message: error) }
            } else {
                switch viewModel.selectedTab {
                case .friends:
                    Section("Followers") {
                        if viewModel.followers.isEmpty {
                            Text("No followers yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.followers) { follower in
                                VStack(alignment: .leading) {
                                    Text(follower.profile?.displayName ?? follower.profile?.handle ?? follower.followerID)
                                    Text("Follows you")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                case .venues:
                    Section("Saved venue updates") {
                        if viewModel.venueUpdates.isEmpty {
                            Text("No venue updates yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(viewModel.venueUpdates) { window in
                                NavigationLink {
                                    VenueDetailView(windowID: window.id, container: container)
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(window.venue?.name ?? window.venue?.orgName ?? "Venue")
                                        Text(window.label ?? "Happy hour updated")
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
        .navigationTitle("Activity")
        .task {
            await viewModel.load()
        }
    }
}
