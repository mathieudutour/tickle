import BackgroundTasks
import UIKit
import UserNotifications

/// Background work: silent pushes and background refresh sync the space while the app is closed, and alerts can be
/// completed straight from the notification.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  static let refreshTask = "me.dutour.mathieu.tickle.refresh"
  static let reminderCategory = "reminder"
  static let doneAction = "done"

  let store = Store()
  let push = Push()
  let router = Router()

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    push.attach(store)
    #if DEBUG
      router.openFromLaunchArguments(store)
    #endif
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: Self.reminderCategory,
        actions: [UNNotificationAction(identifier: Self.doneAction, title: "Fait", options: [])],
        intentIdentifiers: []
      ),
    ])
    BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshTask, using: nil) { task in
      Task { @MainActor in self.refresh(task as! BGAppRefreshTask) }
    }
    return true
  }

  // ---------- Background sync ----------

  /// Asks iOS to wake the app now and then to sync, in case a silent push didn't come through.
  func scheduleRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: Self.refreshTask)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }

  private func refresh(_ task: BGAppRefreshTask) {
    scheduleRefresh()
    let work = Task { await store.syncOnce(timeout: .seconds(20)) }
    task.expirationHandler = { work.cancel() }
    Task {
      let synced = await work.value
      task.setTaskCompleted(success: synced)
    }
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    push.tokenReceived(deviceToken)
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {}

  /// A silent push: something changed in the space while this phone wasn't connected.
  func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any]
  ) async -> UIBackgroundFetchResult {
    let before = store.space
    let synced = await store.syncOnce(timeout: .seconds(20))
    if !synced { return .failed }
    return store.space == before ? .noData : .newData
  }

  // ---------- Notifications ----------

  /// Alerts show even with the app open, as they do in the web app.
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
  ) async {
    let info = response.notification.request.content.userInfo
    let reminderId = info["reminderId"] as? String
    let url = info["url"] as? String
    let action = response.actionIdentifier
    await MainActor.run {
      if action == Self.doneAction, let reminderId {
        // Done from the notification: complete it and send it before iOS suspends the app again.
        store.setCompleted(reminderId, true)
        Task { await store.syncOnce(timeout: .seconds(15)) }
      } else if let reminderId {
        router.open(reminder: reminderId, in: store)
      } else if url?.contains("aujourdhui") == true {
        router.show(.today)
      }
    }
  }
}
