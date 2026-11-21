import SwiftUI

/// The first time a reminder gets a date or a time on a phone without alerts, offers to turn them on, right when they
/// make sense (« Être prévenu à 18 h ? »), instead of only in Réglages (the web app's useAlertPrompt). Asked once.
/// Applied once, on the root view.
struct AlertPromptModifier: ViewModifier {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  /// The due time each reminder had, to notice one that gets a new one.
  @State private var times: [String: String] = [:]
  /// A time waiting for the reminder's details to close, so the question isn't hidden behind them.
  @State private var waiting: String?

  static let askedKey = "tickle.alertsAsked"
  /// All-day reminders alert in the morning (`ALL_DAY_TIME` in src/lib/alerts.ts).
  static let allDayTime = "09:00"

  func body(content: Content) -> some View {
    content
      .onAppear { times = dueTimes(store.space) }
      .onChange(of: store.space) { _, space in
        let next = dueTimes(space)
        defer { times = next }
        // Only this phone's own changes: they wait for the server's confirmation in `pending`.
        guard store.pending > 0 else { return }
        let changed = next.first { id, time in times[id] != time && space.reminders[id]?.completed == false }
        if let time = changed?.value { offer(time) }
      }
      .onChange(of: router.selectedReminder) { _, selected in
        if selected == nil, let time = waiting {
          waiting = nil
          ask(time)
        }
      }
  }

  private func dueTimes(_ space: Space) -> [String: String] {
    space.reminders.compactMapValues { r in r.due.map { $0.time ?? Self.allDayTime } }
  }

  private func offer(_ time: String) {
    guard store.key != nil, push.state == .off, !UserDefaults.standard.bool(forKey: Self.askedKey) else { return }
    UserDefaults.standard.set(true, forKey: Self.askedKey)
    // On iPhone the details are a sheet, over the toast: ask once it closes.
    if router.selectedReminder != nil && UIDevice.current.userInterfaceIdiom == .phone {
      waiting = time
    } else {
      ask(time)
    }
  }

  private func ask(_ time: String) {
    let label = store.core.timeLabel(time)
    toaster.show(
      Toaster.Toast(text: "Être prévenu à \(label) ?", actionLabel: "Activer") { [push, toaster] in
        Task { @MainActor in
          toaster.show(await push.enable() ? "Alertes activées sur cet appareil" : "Alertes non activées")
        }
      }
    )
  }
}

extension View {
  func alertPrompt() -> some View { modifier(AlertPromptModifier()) }
}
