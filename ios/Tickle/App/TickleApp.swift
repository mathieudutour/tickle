import SwiftUI

@main
struct TickleApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @Environment(\.scenePhase) private var phase

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(delegate.store)
        .environment(delegate.push)
        .environment(delegate.router)
        .onOpenURL { delegate.router.handle($0) }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
          if let url = activity.webpageURL { delegate.router.handle(url) }
        }
    }
    .onChange(of: phase) { _, phase in
      switch phase {
      case .active:
        delegate.store.goOnline()
        Task { await delegate.push.refreshState() }
      case .background:
        // Send what's pending before letting go of the socket; the server then wakes this phone with silent pushes.
        let task = UIApplication.shared.beginBackgroundTask()
        Task {
          if delegate.store.pending > 0 { await delegate.store.syncOnce(timeout: .seconds(10)) }
          delegate.store.goOffline()
          delegate.scheduleRefresh()
          UIApplication.shared.endBackgroundTask(task)
        }
      default:
        break
      }
    }
  }
}
