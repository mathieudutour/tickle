import Foundation
import JavaScriptCore

/// The logic shared with the web app and the server (`src/native/core.ts`, bundled into `core.js` by
/// `npm run build:native`): the reducer, the sync algorithm, quick entry and the French labels. It holds this device's
/// sync state; `Store` does the I/O around it. JavaScriptCore isn't thread-safe, so it lives on the main actor.
@MainActor
final class Core {
  struct Effects: Decodable {
    /// Messages to send to the server, if the socket is open.
    var outbox: [JSONValue]
    var notice: String?
    /// The space is gone from the server: this device now has its own, to create.
    var unknown: Bool?
  }

  struct Snapshot: Decodable {
    var space: Space
    var key: String?
    var joined: Bool
    var pending: Int
  }

  /// A reminder typed in quick entry, as the shared parser reads it.
  struct QuickEntry: Decodable, Equatable {
    var title: String
    var due: Due?
    var `repeat`: Repeat?
    var priority: Int
    var tags: [String]
    var assignee: String?
  }

  private let context: JSContext
  private let api: JSValue
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  init(script: String? = nil) {
    guard let context = JSContext() else { fatalError("JavaScriptCore unavailable") }
    self.context = context
    context.exceptionHandler = { _, exception in
      assertionFailure("core.js: \(exception?.toString() ?? "unknown error")")
    }
    let uuid: @convention(block) () -> String = { UUID().uuidString.lowercased() }
    context.setObject(uuid, forKeyedSubscript: "__nativeUUID" as NSString)
    let source =
      script
      ?? Bundle.main.url(forResource: "core", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    guard let source else { fatalError("core.js is missing from the app bundle: run `npm run build:native`") }
    context.evaluateScript(source)
    api = context.objectForKeyedSubscript("TickleCore")
  }

  private func call(_ name: String, _ arguments: [Any] = []) -> String {
    api.invokeMethod(name, withArguments: arguments)?.toString() ?? "null"
  }

  private func json(_ value: some Encodable) -> String {
    (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? "null"
  }

  private func decode<T: Decodable>(_ type: T.Type, _ text: String) -> T? {
    try? decoder.decode(T.self, from: Data(text.utf8))
  }

  // ---------- Sync state ----------

  func load(_ persisted: String?, timeZone: String) {
    api.invokeMethod("init", withArguments: [persisted ?? NSNull(), timeZone])
  }

  func persisted() -> String { call("persisted") }

  func snapshot() -> Snapshot? { decode(Snapshot.self, call("snapshot")) }

  func dispatch(_ action: SpaceAction) -> Effects {
    decode(Effects.self, call("dispatch", [json(action), newId()])) ?? Effects(outbox: [])
  }

  /// Dispatches an action the shared code built (quick entry, completing).
  func dispatch(raw action: String) -> Effects {
    decode(Effects.self, call("dispatch", [action, newId()])) ?? Effects(outbox: [])
  }

  func opened() -> Effects { decode(Effects.self, call("opened")) ?? Effects(outbox: []) }

  func receive(_ message: String) -> Effects {
    decode(Effects.self, call("onMessage", [message])) ?? Effects(outbox: [])
  }

  func spaceToCreate() -> String { call("spaceToCreate") }
  func created(key: String, version: Int) { api.invokeMethod("created", withArguments: [key, version]) }
  func join(_ key: String) { api.invokeMethod("join", withArguments: [key]) }
  func leave() { api.invokeMethod("leave", withArguments: []) }

  // ---------- Helpers ----------

  /// The action adding a reminder typed in quick entry, or nil when it has no title.
  func entryAction(_ text: String, defaults: EntryDefaults, now: LocalNow) -> String? {
    let action = call("entryAction", [text, json(defaults), json(now)])
    return action == "null" ? nil : action
  }

  func parse(_ text: String, now: LocalNow) -> QuickEntry? {
    decode(QuickEntry.self, call("parse", [text, json(now)]))
  }

  /// The action completing (or reopening) a reminder: a repeating one moves on to its next date.
  func completeAction(_ id: String, completed: Bool) -> String? {
    let action = call("complete", [id, completed])
    return action == "null" ? nil : action
  }

  func labels(now: LocalNow) -> [String: ReminderLabels] {
    decode([String: ReminderLabels].self, call("labels", [json(now)])) ?? [:]
  }

  /// "Aujourd’hui", "Demain", "jeudi", "jeu. 4 déc."
  func dayLabel(_ date: String, today: String) -> String { call("day", [date, today]) }

  /// "18 h 30"
  func timeLabel(_ time: String) -> String { call("time", [time]) }
}

/// What the screen a reminder is added from implies (src/lib/entry.ts).
struct EntryDefaults: Encodable, Sendable {
  var listId: String
  var sectionId: String?
  var parentId: String?
  var date: String?
  var tag: String?
}

/// Any JSON, for messages passed through untouched.
enum JSONValue: Codable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  init(from decoder: any Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null }
    else if let b = try? c.decode(Bool.self) { self = .bool(b) }
    else if let n = try? c.decode(Double.self) { self = .number(n) }
    else if let s = try? c.decode(String.self) { self = .string(s) }
    else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
    else { self = .object(try c.decode([String: JSONValue].self)) }
  }

  func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let b): try c.encode(b)
    case .number(let n): try c.encode(n)
    case .string(let s): try c.encode(s)
    case .array(let a): try c.encode(a)
    case .object(let o): try c.encode(o)
    }
  }

  var text: String { (try? JSONEncoder().encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? "null" }
}
