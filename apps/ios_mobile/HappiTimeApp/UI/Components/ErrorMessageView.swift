import SwiftUI

struct ErrorMessageView: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.footnote)
            .foregroundStyle(AppTheme.Colors.danger)
            .multilineTextAlignment(.center)
    }
}
