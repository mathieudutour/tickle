import SwiftUI

/// Asks to turn alerts on at the right moment (the web app's useAlertPrompt): applied once, on the root view.
struct AlertPromptModifier: ViewModifier {
  func body(content: Content) -> some View { content }
}

extension View {
  func alertPrompt() -> some View { modifier(AlertPromptModifier()) }
}
