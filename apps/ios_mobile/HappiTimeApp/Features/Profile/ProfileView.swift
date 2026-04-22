import SwiftUI

struct ProfileView: View {
    @StateObject var viewModel: ProfileViewModel
    @EnvironmentObject private var sessionStore: SessionStore

    var body: some View {
        Form {
            Section("Account") {
                if let email = sessionStore.session?.user.email {
                    Text(email)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                TextField("Display name", text: $viewModel.displayName)
                TextField("Handle", text: $viewModel.handle)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Bio", text: $viewModel.bio, axis: .vertical)

                Toggle("Public profile", isOn: $viewModel.isPublic)
            }

            Section("Home") {
                TextField("City", text: $viewModel.homeCity)
                TextField("State", text: $viewModel.homeState)
                    .textInputAutocapitalization(.characters)
            }

            Section("Notifications") {
                Toggle("Push", isOn: $viewModel.notificationsPush)
                Toggle("Happy hour reminders", isOn: $viewModel.notificationsHappyHours)
                Toggle("Venue updates", isOn: $viewModel.notificationsVenueUpdates)
                Toggle("Friend activity", isOn: $viewModel.notificationsFriendActivity)
                Toggle("Product updates", isOn: $viewModel.notificationsProduct)
            }

            Section {
                Button(viewModel.saving ? "Saving…" : "Save") {
                    Task { await viewModel.saveProfileAndPreferences() }
                }
                .disabled(viewModel.saving)

                Button("Sign out", role: .destructive) {
                    Task { await sessionStore.signOut() }
                }
            }

            if let status = viewModel.statusMessage {
                Section {
                    Text(status)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle("Profile")
        .task {
            await viewModel.load()
        }
    }
}
