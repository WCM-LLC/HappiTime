import SwiftUI

struct MenuView: View {
    let menu: Menu

    var body: some View {
        List {
            if menu.sections.isEmpty {
                Text("No sections published.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(menu.sections) { section in
                    Section(section.name) {
                        if section.items.isEmpty {
                            Text("No items published.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(section.items) { item in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(item.name)
                                        Spacer()
                                        if let price = item.price {
                                            Text(price)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    if let description = item.description {
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
        .navigationTitle(menu.name)
    }
}
