import ExpoModulesCore
import SwiftUI
import UIKit

public final class HappiTimePermissionEducationView: ExpoView {
  let onPrimaryPress = EventDispatcher()
  let onSecondaryPress = EventDispatcher()

  var variant = "location" {
    didSet { updateContent() }
  }

  var title = "Use iPhone permissions" {
    didSet { updateContent() }
  }

  var message = "Enable this when it makes HappiTime more useful." {
    didSet { updateContent() }
  }

  var primaryTitle = "Continue" {
    didSet { updateContent() }
  }

  var secondaryTitle = "Not now" {
    didSet { updateContent() }
  }

  var isLoading = false {
    didSet { updateContent() }
  }

  private var hostingController: UIHostingController<PermissionEducationContent>?

  required public init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
    mountHostingController()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  func updateContent() {
    hostingController?.rootView = makeContent()
  }

  private func mountHostingController() {
    let controller = UIHostingController(rootView: makeContent())
    controller.view.backgroundColor = .clear
    controller.view.translatesAutoresizingMaskIntoConstraints = false
    addSubview(controller.view)
    NSLayoutConstraint.activate([
      controller.view.topAnchor.constraint(equalTo: topAnchor),
      controller.view.bottomAnchor.constraint(equalTo: bottomAnchor),
      controller.view.leadingAnchor.constraint(equalTo: leadingAnchor),
      controller.view.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])
    hostingController = controller
  }

  private func makeContent() -> PermissionEducationContent {
    PermissionEducationContent(
      variant: PermissionEducationVariant(rawValue: variant) ?? .location,
      title: title,
      message: message,
      primaryTitle: primaryTitle,
      secondaryTitle: secondaryTitle,
      isLoading: isLoading,
      onPrimaryPress: { [weak self] in
        self?.onPrimaryPress()
      },
      onSecondaryPress: { [weak self] in
        self?.onSecondaryPress()
      }
    )
  }
}

private enum PermissionEducationVariant: String {
  case location
  case notifications
  case settings

  var symbolName: String {
    switch self {
    case .location:
      return "location.fill"
    case .notifications:
      return "bell.badge.fill"
    case .settings:
      return "gearshape.fill"
    }
  }

  var accentColor: Color {
    switch self {
    case .location:
      return Color(red: 0.07, green: 0.43, blue: 0.68)
    case .notifications:
      return Color(red: 0.76, green: 0.35, blue: 0.13)
    case .settings:
      return Color(red: 0.28, green: 0.31, blue: 0.36)
    }
  }
}

private struct PermissionEducationContent: View {
  let variant: PermissionEducationVariant
  let title: String
  let message: String
  let primaryTitle: String
  let secondaryTitle: String
  let isLoading: Bool
  let onPrimaryPress: () -> Void
  let onSecondaryPress: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 12) {
        ZStack {
          Circle()
            .fill(variant.accentColor.opacity(0.14))
          Image(systemName: variant.symbolName)
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(variant.accentColor)
        }
        .frame(width: 44, height: 44)
        .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: 6) {
          Text(title)
            .font(.headline)
            .foregroundStyle(Color(uiColor: .label))
            .fixedSize(horizontal: false, vertical: true)

          Text(message)
            .font(.subheadline)
            .foregroundStyle(Color(uiColor: .secondaryLabel))
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      HStack(spacing: 10) {
        Button(action: onSecondaryPress) {
          Text(secondaryTitle)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .disabled(isLoading)

        Button(action: onPrimaryPress) {
          HStack(spacing: 8) {
            if isLoading {
              ProgressView()
                .controlSize(.small)
                .tint(.white)
            }
            Text(primaryTitle)
          }
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.regular)
        .tint(variant.accentColor)
        .disabled(isLoading)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(Color(uiColor: .secondarySystemGroupedBackground))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(Color(uiColor: .separator).opacity(0.45), lineWidth: 1)
    )
    .accessibilityElement(children: .contain)
  }
}
