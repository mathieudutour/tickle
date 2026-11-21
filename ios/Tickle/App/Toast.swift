import Observation
import SwiftUI

/// Short messages at the bottom of the screen, with « Annuler » when the change can be undone (the web app's toast).
@MainActor
@Observable
final class Toaster {
  struct Toast: Identifiable, Equatable {
    let id = UUID()
    var text: String
    var actionLabel: String?
    var action: (@MainActor () -> Void)?

    static func == (a: Toast, b: Toast) -> Bool { a.id == b.id }
  }

  private(set) var current: Toast?
  private var hide: Task<Void, Never>?

  func show(_ text: String, undo: (@MainActor () -> Void)? = nil) {
    show(Toast(text: text, actionLabel: undo == nil ? nil : "Annuler", action: undo))
  }

  func show(_ toast: Toast) {
    current = toast
    hide?.cancel()
    hide = Task { [weak self] in
      try? await Task.sleep(for: .seconds(toast.action == nil ? 3 : 5))
      guard !Task.isCancelled else { return }
      self?.current = nil
    }
  }

  func dismiss() { current = nil }
}

struct ToastOverlay: View {
  @Environment(Toaster.self) private var toaster

  var body: some View {
    if let toast = toaster.current {
      HStack(spacing: 14) {
        Text(toast.text).lineLimit(2)
        if let label = toast.actionLabel, let action = toast.action {
          Button(label) {
            action()
            toaster.dismiss()
          }
          .fontWeight(.semibold)
          .tint(.accentColor)
        }
      }
      .font(.subheadline)
      .foregroundStyle(.white)
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .background(Color(white: 0.11), in: Capsule())
      .padding(.bottom, 24)
      .transition(.move(edge: .bottom).combined(with: .opacity))
      .id(toast.id)
      .animation(.snappy, value: toaster.current)
      .accessibilityElement(children: .combine)
    }
  }
}
