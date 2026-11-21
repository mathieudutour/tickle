import SwiftUI

/// The web app's illustrations (src/assets/art), for empty states and settings.
enum ArtName: String {
  case agents, alerts, sharing
  case allDone = "all-done"
  case emptyList = "empty-list"
  case noResults = "no-results"
}

struct Art: View {
  let name: ArtName
  var size: CGFloat = 160

  var body: some View {
    Image("art-\(name.rawValue)")
      .resizable()
      .scaledToFit()
      .frame(maxWidth: size, maxHeight: size)
      .accessibilityHidden(true)
  }
}

/// An illustration and a line of text, for a screen with nothing to show.
struct EmptyState: View {
  let art: ArtName
  let text: String

  var body: some View {
    VStack(spacing: 12) {
      Art(name: art)
      Text(text).font(.headline).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 32)
  }
}
