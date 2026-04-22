import SwiftUI

struct AuthView: View {
    @StateObject var viewModel: AuthViewModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 32)

            Text("HappiTime")
                .font(.system(size: 42, weight: .bold))
                .foregroundStyle(AppTheme.Colors.primary)

            Text("Create an Account")
                .font(.title3.weight(.bold))

            Text("Enter your email to sign in")
                .font(.subheadline)
                .foregroundStyle(AppTheme.Colors.mutedText)

            TextField("email@domain.com", text: $viewModel.email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(AppTheme.Colors.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            PrimaryButton(title: "Continue", isLoading: viewModel.isLoading) {
                Task { await viewModel.sendMagicLink() }
            }

            HStack {
                Divider()
                Text("or")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Colors.mutedText)
                Divider()
            }

            Button("Continue with Google") {
                Task { await viewModel.startOAuth(.google) }
            }
            .buttonStyle(.bordered)

            Button("Continue with Apple") {
                Task { await viewModel.startOAuth(.apple) }
            }
            .buttonStyle(.bordered)

            if let status = viewModel.statusMessage {
                Text(status)
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Colors.mutedText)
                    .multilineTextAlignment(.center)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 24)
        .background(AppTheme.Colors.background.ignoresSafeArea())
        .onChange(of: viewModel.pendingOAuthURL) { _, newValue in
            guard let newValue else { return }
            openURL(newValue)
        }
    }
}
