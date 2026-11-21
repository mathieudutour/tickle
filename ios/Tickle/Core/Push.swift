import Foundation
import Observation
import UIKit
import UserNotifications

/// Alerts on this phone. The space's Durable Object keeps the phone's APNs token and sends due reminders and the
/// morning summary to it (worker/space.ts), and a silent push after changes made elsewhere, so the app syncs in the
/// background. Mirrors the web app's src/lib/push.ts.
@MainActor
@Observable
final class Push {
  enum State { case unknown, off, denied, on }

  private(set) var state: State = .unknown
  /// This phone's member in the space: alerts for someone else's reminders skip it.
  private(set) var meId: String? = UserDefaults.standard.string(forKey: Keys.me)
  /// When this phone wants the morning summary (HH:MM), if it does.
  private(set) var summaryAt: String? = UserDefaults.standard.string(forKey: Keys.summary)

  private var token: String?
  private var registering = false
  private weak var store: Store?

  private enum Keys {
    static let me = "tickle.me"
    static let summary = "tickle.summaryAt"
    static let registered = "tickle.push"
  }

  /// The space and device id this phone is registered with, and what it said then.
  private struct Registered: Codable, Equatable {
    var key: String
    var id: String
    var token: String
    var memberId: String?
    var summaryAt: String?
  }

  private var registered: Registered? {
    get { UserDefaults.standard.data(forKey: Keys.registered).flatMap { try? JSONDecoder().decode(Registered.self, from: $0) } }
    set { UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: Keys.registered) }
  }

  /// The id the server knows this phone by, for its current space.
  var deviceId: String? { registered.flatMap { $0.key == store?.key ? $0.id : nil } }

  func attach(_ store: Store) {
    self.store = store
    store.pushDeviceId = { [weak self] in self?.deviceId }
    store.onKeyChange = { [weak self] _ in Task { await self?.sync() } }
    Task { await refreshState() }
  }

  func refreshState() async {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    switch settings.authorizationStatus {
    case .authorized, .provisional, .ephemeral:
      state = .on
      UIApplication.shared.registerForRemoteNotifications()
    case .denied: state = .denied
    default: state = .off
    }
  }

  /// Asks for permission, then registers with Apple; `tokenReceived` follows.
  @discardableResult
  func enable() async -> Bool {
    let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    await refreshState()
    return granted
  }

  func tokenReceived(_ data: Data) {
    token = data.map { String(format: "%02x", $0) }.joined()
    Task { await sync() }
  }

  func setMe(_ id: String?) {
    meId = id
    UserDefaults.standard.set(id, forKey: Keys.me)
    Task { await sync() }
  }

  func setSummaryAt(_ time: String?) {
    summaryAt = time
    UserDefaults.standard.set(time, forKey: Keys.summary)
    Task { await sync() }
  }

  /// Registers this phone with its space (again) when its token, space, member or summary time changed.
  func sync() async {
    guard let store, let key = store.key, let token, state == .on, !registering else { return }
    let wanted = Registered(key: key, id: "", token: token, memberId: meId.flatMap { id in store.space.members.contains { $0.id == id } ? id : nil }, summaryAt: summaryAt)
    if let current = registered, current.key == wanted.key, current.token == wanted.token,
      current.memberId == wanted.memberId, current.summaryAt == wanted.summaryAt
    {
      return
    }
    registering = true
    defer { registering = false }
    // Leave the previous space's list of devices.
    if let previous = registered, previous.key != key { await unregister(previous) }
    var request = URLRequest(url: store.server.appending(path: "api/spaces/\(key)/push"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    var body: [String: Any] = ["apns": ["token": token, "sandbox": Self.sandbox]]
    if let memberId = wanted.memberId { body["memberId"] = memberId }
    if let summaryAt { body["summaryAt"] = summaryAt }
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    struct Created: Decodable { var id: String }
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 201,
      let created = try? JSONDecoder().decode(Created.self, from: data)
    else { return }
    var saved = wanted
    saved.id = created.id
    // A server-side copy replaced by this one, under the same token, is dropped there.
    registered = saved
  }

  private func unregister(_ previous: Registered) async {
    guard let store else { return }
    var request = URLRequest(url: store.server.appending(path: "api/spaces/\(previous.key)/push/\(previous.id)"))
    request.httpMethod = "DELETE"
    _ = try? await URLSession.shared.data(for: request)
    registered = nil
  }

  /// Builds installed from Xcode get development tokens, which only Apple's sandbox accepts. TestFlight and App Store
  /// builds have no provisioning profile in the bundle and use production.
  static let sandbox: Bool = {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let text = String(data: data, encoding: .isoLatin1)
    else { return false }
    return text.range(of: #"<key>aps-environment</key>\s*<string>development</string>"#, options: .regularExpression) != nil
  }()
}
