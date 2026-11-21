import Foundation
import Observation

/// A screen of the app, as the web app's routes (src/lib/router.ts).
enum Route: Hashable, Sendable {
  case today
  case list(String)
  case tag(String)
  case settings
}

/// Where the app is. On iPhone, `path` is the navigation stack above the lists; on iPad, `selection` is the screen
/// beside the sidebar and `selectedReminder` the one in the inspector.
@MainActor
@Observable
final class Router {
  var path: [Route] = []
  var selection: Route? = .today
  /// The reminder whose details are open: a sheet on iPhone, the inspector on iPad.
  var selectedReminder: String?
  /// The reminder being edited in place in its row (iPhone).
  var editingReminder: String?
  /// An invitation link opened in the app, waiting for confirmation.
  var joinKey: String?

  /// The screen on top: the last pushed on iPhone, the selected one on iPad.
  var current: Route? { path.last ?? selection }

  func show(_ route: Route) {
    path = [route]
    selection = route
  }

  /// Opens a reminder from a notification: its list, then its details.
  func open(reminder id: String, in store: Store) {
    guard let reminder = store.space.reminders[id] else { return }
    show(.list(reminder.listId))
    selectedReminder = id
  }

  #if DEBUG
    /// Opens a screen at launch, for checking it in the simulator: `-TickleOpen today`, `list:ID`, `tag:NAME`,
    /// `settings`, `reminder:ID`.
    func openFromLaunchArguments(_ store: Store) {
      guard let target = UserDefaults.standard.string(forKey: "TickleOpen") else { return }
      let parts = target.split(separator: ":", maxSplits: 1).map(String.init)
      switch parts.first {
      case "today": show(.today)
      case "settings": show(.settings)
      case "list" where parts.count == 2: show(.list(parts[1]))
      case "tag" where parts.count == 2: show(.tag(parts[1]))
      case "reminder" where parts.count == 2: open(reminder: parts[1], in: store)
      default: break
      }
    }
  #endif

  /// Invitation links: https://…/#rejoindre=KEY (universal link) or tickle://rejoindre/KEY.
  func handle(_ url: URL) {
    let fragment = url.fragment ?? ""
    if fragment.hasPrefix("rejoindre=") {
      joinKey = String(fragment.dropFirst("rejoindre=".count))
    } else if url.scheme == "tickle", url.host == "rejoindre", let key = url.pathComponents.dropFirst().first {
      joinKey = key
    }
  }
}
