import SwiftUI

struct AddView: View {
    @StateObject var viewModel: AddViewModel

    var body: some View {
        Form {
            Section {
                Picker("Create", selection: $viewModel.mode) {
                    Text("Suggest Venue").tag(AddViewModel.Mode.venueSuggestion)
                    Text("New Itinerary").tag(AddViewModel.Mode.itinerary)
                }
                .pickerStyle(.segmented)
            }

            switch viewModel.mode {
            case .venueSuggestion:
                Section("Venue Suggestion") {
                    TextField("Venue name", text: $viewModel.venueName)
                    TextField("Address", text: $viewModel.venueAddress)
                    TextField("City", text: $viewModel.venueCity)
                    TextField("State", text: $viewModel.venueState)
                    TextField("Notes", text: $viewModel.venueNotes, axis: .vertical)
                }
            case .itinerary:
                Section("New Itinerary") {
                    TextField("List name", text: $viewModel.listName)
                    TextField("Description", text: $viewModel.listDescription, axis: .vertical)
                }
            }

            Section {
                Button(viewModel.saving ? "Saving…" : "Submit") {
                    Task { await viewModel.submit() }
                }
                .disabled(viewModel.saving)
            }

            if let status = viewModel.statusMessage {
                Section {
                    Text(status)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle("Create")
    }
}
