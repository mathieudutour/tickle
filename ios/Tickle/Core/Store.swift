import Foundation
import Observation
import UIKit

enum Connection: Sendable { case connecting, online, offline }

/// The space on this device, kept in sync with its Durable Object (worker/space.ts) over a WebSocket, as the web app's
/// store does (src/store/store.ts). The sync state itself lives in `Core`; this opens the socket, sends what the core
/// says to send, feeds back what the server says, and saves the state after every change.
@MainActor
@Observable
final class Store {
  private(set) var space: Space = .empty
  /// Null until the space exists on the server (first launch offline).
  private(set) var key: String?
  /// Received the space at least once since joining.
  private(set) var joined = false
  /// Changes made here the server hasn't confirmed yet.
  private(set) var pending = 0
  private(set) var connection: Connection = .offline
  /// Labels of each reminder ("Demain, 18 h"), refreshed with the space and every minute.
  private(set) var labels: [String: ReminderLabels] = [:]
  /// Today and now where the household lives.
  private(set) var now = LocalNow.at()
  /// Something to tell the person (what an agent just did, a dead invitation link).
  var notice: String?

  let core: Core
  let server: URL
  private let file: URL
  private let session: URLSession
  private var socket: URLSessionWebSocketTask?
  private var attempts = 0
  private var creating = false
  private var reconnect: Task<Void, Never>?
  private var pinger: Task<Void, Never>?
  private var clock: Task<Void, Never>?
  /// Wanted connected: while on screen, or syncing in the background.
  private var wanted = false
  /// Spaces received from the server, so a background sync knows it got a fresh one.
  private var snapshots = 0
  /// The push device id this phone registered with, sent when connecting so the server doesn't wake it needlessly.
  var pushDeviceId: () -> String? = { nil }
  /// Told when the space's key changes, to register for alerts again.
  var onKeyChange: (String?) -> Void = { _ in }

  static let reconnectDelays: [Duration] = [.seconds(1), .seconds(2), .seconds(5), .seconds(10), .seconds(30)]

  init(core: Core = Core(), server: URL = Store.defaultServer, file: URL = Store.defaultFile, session: URLSession = .shared) {
    self.core = core
    self.server = server
    self.file = file
    self.session = session
    core.load(try? String(contentsOf: file, encoding: .utf8), timeZone: TimeZone.current.identifier)
    update(save: false)
    clock = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(30))
        self?.tick()
      }
    }
  }

  static var defaultServer: URL {
    let configured = Bundle.main.object(forInfoDictionaryKey: "TickleServer") as? String
    return URL(string: configured ?? "https://tickle.mathieu-3e7.workers.dev")!
  }

  static var defaultFile: URL {
    let folder = URL.applicationSupportDirectory
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    return folder.appending(path: "tickle.json")
  }

  var inviteLink: URL? { key.map { URL(string: "\(server.absoluteString)/#rejoindre=\($0)")! } }

  // ---------- Changes ----------

  func dispatch(_ action: SpaceAction) { apply(core.dispatch(action)) }

  /// An action the shared code built: quick entry, completing a reminder.
  func dispatch(raw action: String) { apply(core.dispatch(raw: action)) }

  /// Adds a reminder typed in quick entry (« Pain demain 18h #courses @Léa »). Returns its id.
  @discardableResult
  func add(entry text: String, defaults: EntryDefaults) -> String? {
    guard let action = core.entryAction(text, defaults: defaults, now: now) else { return nil }
    dispatch(raw: action)
    struct Added: Decodable { struct R: Decodable { var id: String }; var reminder: R }
    return (try? JSONDecoder().decode(Added.self, from: Data(action.utf8)))?.reminder.id
  }

  func setCompleted(_ id: String, _ completed: Bool) {
    if let action = core.completeAction(id, completed: completed) { dispatch(raw: action) }
  }

  func update(_ id: String, _ patch: ReminderPatch) {
    guard !patch.isEmpty else { return }
    dispatch(.updateReminder(id: id, patch: patch))
  }

  private func apply(_ effects: Core.Effects) {
    send(effects.outbox)
    if let notice = effects.notice { self.notice = notice }
    update()
    if effects.unknown == true {
      onKeyChange(nil)
      Task { await createSpace() }
    }
  }

  private func update(save: Bool = true) {
    if let snapshot = core.snapshot() {
      if space != snapshot.space { space = snapshot.space }
      let keyChanged = key != snapshot.key
      key = snapshot.key
      joined = snapshot.joined
      pending = snapshot.pending
      if keyChanged { onKeyChange(key) }
    }
    labels = core.labels(now: now)
    if save { try? core.persisted().write(to: file, atomically: true, encoding: .utf8) }
  }

  private func tick() {
    let current = LocalNow.at(in: TimeZone(identifier: space.timeZone) ?? .current)
    guard current != now else { return }
    now = current
    labels = core.labels(now: now)
  }

  // ---------- Sharing ----------

  /// Replaces this device's space with a shared one, once it arrives.
  func join(_ key: String) {
    guard key != self.key else { return }
    disconnect()
    core.join(key)
    update()
    if wanted { connect() }
  }

  /// Stops sharing: this device keeps a copy, which becomes a new space of its own.
  func leave() {
    disconnect()
    core.leave()
    update()
    Task { await createSpace() }
  }

  /// Puts this device's space on the server, so it can alert, be shared and be used by agents.
  func createSpace() async {
    guard key == nil, !creating else { return }
    creating = true
    defer { creating = false }
    var request = URLRequest(url: server.appending(path: "api/spaces"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = Data("{\"space\":\(core.spaceToCreate())}".utf8)
    struct Created: Decodable { var key: String; var version: Int }
    guard let (data, response) = try? await session.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 201,
      let created = try? JSONDecoder().decode(Created.self, from: data), key == nil
    else { return }
    core.created(key: created.key, version: created.version)
    update()
    if wanted { connect() }
  }

  // ---------- Connection ----------

  /// Stay connected while the app is on screen.
  func goOnline() {
    wanted = true
    if key == nil { Task { await createSpace() } } else if socket == nil { connect() } else { ping() }
  }

  /// Off screen: let go of the socket, so the server wakes this phone with a push instead.
  func goOffline() {
    wanted = false
    disconnect()
  }

  /// Connects just long enough to send what's pending and get the latest space, for background refresh and silent
  /// pushes. Returns whether it got there in time.
  @discardableResult
  func syncOnce(timeout: Duration = .seconds(20)) async -> Bool {
    if key == nil { await createSpace() }
    guard key != nil else { return false }
    let wasWanted = wanted
    let start = snapshots
    wanted = true
    if socket == nil { connect() } else { apply(core.opened()) }
    let deadline = ContinuousClock.now + timeout
    var done = false
    while ContinuousClock.now < deadline, !Task.isCancelled {
      // A fresh copy of the space arrived, and the server confirmed everything this phone sent.
      if snapshots > start && pending == 0 && connection == .online {
        done = true
        break
      }
      try? await Task.sleep(for: .milliseconds(150))
    }
    if !wasWanted { goOffline() }
    return done
  }

  private func connect() {
    guard let key, socket == nil else { return }
    var components = URLComponents(url: server.appending(path: "api/spaces/\(key)/sync"), resolvingAgainstBaseURL: false)!
    components.scheme = server.scheme == "https" ? "wss" : "ws"
    if let device = pushDeviceId() { components.queryItems = [URLQueryItem(name: "device", value: device)] }
    let socket = session.webSocketTask(with: components.url!)
    self.socket = socket
    setConnection(.connecting)
    socket.resume()
    apply(core.opened())
    listen(socket)
    pinger?.cancel()
    pinger = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(20))
        self?.ping()
      }
    }
  }

  private func listen(_ socket: URLSessionWebSocketTask) {
    Task { [weak self] in
      while true {
        guard let message = try? await socket.receive() else {
          self?.drop(socket)
          return
        }
        guard let self, self.socket === socket else { return }
        switch message {
        case .string(let text): self.receive(text)
        case .data(let data): self.receive(String(decoding: data, as: UTF8.self))
        @unknown default: break
        }
      }
    }
  }

  private func receive(_ text: String) {
    if text == "pong" { return }
    if text.hasPrefix("{\"t\":\"snapshot\"") {
      attempts = 0
      snapshots += 1
      connection = .online
    }
    apply(core.receive(text))
  }

  private func send(_ outbox: [JSONValue]) {
    guard let socket, !outbox.isEmpty else { return }
    for message in outbox {
      socket.send(.string(message.text)) { _ in }
    }
  }

  /// A dropped signal often leaves a socket that looks open: ping, and reconnect without an answer.
  private func ping() {
    guard let socket else { return }
    socket.sendPing { [weak self] error in
      guard error != nil else { return }
      Task { @MainActor in self?.drop(socket) }
    }
  }

  private func drop(_ socket: URLSessionWebSocketTask) {
    guard self.socket === socket else { return }
    self.socket = nil
    pinger?.cancel()
    socket.cancel(with: .goingAway, reason: nil)
    setConnection(.offline)
    guard wanted else { return }
    let delay = Self.reconnectDelays[min(attempts, Self.reconnectDelays.count - 1)]
    attempts += 1
    reconnect?.cancel()
    reconnect = Task { [weak self] in
      try? await Task.sleep(for: delay)
      guard !Task.isCancelled else { return }
      self?.connect()
    }
  }

  private func disconnect() {
    reconnect?.cancel()
    pinger?.cancel()
    socket?.cancel(with: .normalClosure, reason: nil)
    socket = nil
    attempts = 0
    setConnection(.offline)
  }

  private func setConnection(_ connection: Connection) {
    guard self.connection != connection else { return }
    self.connection = connection
  }

  /// Back on screen or back online: reconnect right away rather than waiting for the next attempt.
  func retryNow() {
    guard wanted, socket == nil else { return }
    attempts = 0
    connect()
  }
}

extension Store {
  var lists: [TickleList] { space.lists.sorted { $0.order < $1.order } }

  func list(_ id: String) -> TickleList? { space.lists.first { $0.id == id } }

  /// Open reminders of the list, top level only.
  func openCount(_ listId: String) -> Int {
    space.reminders.values.filter { $0.listId == listId && !$0.completed && $0.parentId == nil }.count
  }
}
