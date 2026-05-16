import ExpoModulesCore

public final class HappiTimeIOSUIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HappiTimeIOSUI")

    View(HappiTimePermissionEducationView.self) {
      Events("onPrimaryPress", "onSecondaryPress")

      Prop("variant") { (view: HappiTimePermissionEducationView, variant: String) in
        view.variant = variant
      }

      Prop("title") { (view: HappiTimePermissionEducationView, title: String) in
        view.title = title
      }

      Prop("message") { (view: HappiTimePermissionEducationView, message: String) in
        view.message = message
      }

      Prop("primaryTitle") { (view: HappiTimePermissionEducationView, primaryTitle: String) in
        view.primaryTitle = primaryTitle
      }

      Prop("secondaryTitle") { (view: HappiTimePermissionEducationView, secondaryTitle: String) in
        view.secondaryTitle = secondaryTitle
      }

      Prop("loading") { (view: HappiTimePermissionEducationView, loading: Bool) in
        view.isLoading = loading
      }

      OnViewDidUpdateProps { view in
        view.updateContent()
      }
    }
  }
}
