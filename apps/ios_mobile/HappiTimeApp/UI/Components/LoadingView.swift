import SwiftUI

struct LoadingView: View {
    let message: String

    init(message: String = "Loading…") {
        self.message = message
    }

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .font(.subheadline)
                .foregroundStyle(AppTheme.Colors.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.Colors.background.ignoresSafeArea())
    }
}
