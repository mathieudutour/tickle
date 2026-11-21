import Foundation
import SwiftUI

// The space as `src/shared/space.ts` defines it. These types only read and describe it: every change goes through a
// `SpaceAction`, applied by the shared reducer in JavaScriptCore (Core.swift).

enum ListColor: String, Codable, CaseIterable, Sendable {
  case red, orange, yellow, green, teal, blue, indigo, purple, pink, brown, gray

  var color: Color {
    switch self {
    case .red: .red
    case .orange: .orange
    case .yellow: .yellow
    case .green: .green
    case .teal: .teal
    case .blue: .blue
    case .indigo: .indigo
    case .purple: .purple
    case .pink: .pink
    case .brown: .brown
    case .gray: .gray
    }
  }

  var name: String {
    switch self {
    case .red: "Rouge"
    case .orange: "Orange"
    case .yellow: "Jaune"
    case .green: "Vert"
    case .teal: "Turquoise"
    case .blue: "Bleu"
    case .indigo: "Indigo"
    case .purple: "Violet"
    case .pink: "Rose"
    case .brown: "Marron"
    case .gray: "Gris"
    }
  }
}

struct ListSection: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var name: String
  var order: Double
}

struct TickleList: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var name: String
  var color: ListColor
  /// An emoji.
  var icon: String
  var order: Double
  var sections: [ListSection]
}

struct Due: Codable, Hashable, Sendable {
  /// YYYY-MM-DD, in the household's time zone.
  var date: String
  /// HH:MM, absent for an all-day reminder.
  var time: String?
}

enum Frequency: String, Codable, CaseIterable, Sendable {
  case daily, weekdays, weekends, weekly, monthly, yearly
}

struct Repeat: Codable, Hashable, Sendable {
  var freq: Frequency
  var interval: Int
  /// Last date it can repeat on.
  var until: String?
}

struct Reminder: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var listId: String
  var sectionId: String?
  var parentId: String?
  var title: String
  var notes: String?
  var url: String?
  var due: Due?
  /// Alert this many minutes before the due time.
  var early: Int?
  var `repeat`: Repeat?
  /// 0 none, 1 low, 2 medium, 3 high.
  var priority: Int
  var tags: [String]
  var assignee: String?
  var completed: Bool
  var completedAt: String?
  var createdAt: String
  var order: Double
}

struct Member: Codable, Hashable, Identifiable, Sendable {
  var id: String
  var name: String
  var color: ListColor
}

struct Space: Codable, Equatable, Sendable {
  var lists: [TickleList]
  var reminders: [String: Reminder]
  var members: [Member]
  var timeZone: String

  static let empty = Space(lists: [], reminders: [:], members: [], timeZone: TimeZone.current.identifier)
}

// ---------- Actions ----------

/// A field of a patch: left alone, set, or cleared (sent as `null`).
enum Field<Value: Encodable & Sendable>: Sendable {
  case keep
  case set(Value)
  case clear
}

/// What `updateReminder` changes. Fields left as `.keep` aren't sent.
struct ReminderPatch: Encodable, Sendable {
  var title: Field<String> = .keep
  var notes: Field<String> = .keep
  var url: Field<String> = .keep
  var due: Field<Due> = .keep
  var early: Field<Int> = .keep
  var `repeat`: Field<Repeat> = .keep
  var priority: Field<Int> = .keep
  var tags: Field<[String]> = .keep
  var assignee: Field<String> = .keep
  var listId: Field<String> = .keep
  var sectionId: Field<String> = .keep
  var parentId: Field<String> = .keep
  var order: Field<Double> = .keep

  private enum Key: String, CodingKey {
    case title, notes, url, due, early, `repeat`, priority, tags, assignee, listId, sectionId, parentId, order
  }

  var isEmpty: Bool { (try? JSONEncoder().encode(self)).map { $0 == Data("{}".utf8) } ?? true }

  func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    func put<V>(_ field: Field<V>, _ key: Key) throws {
      switch field {
      case .keep: break
      case .set(let value): try c.encode(value, forKey: key)
      case .clear: try c.encodeNil(forKey: key)
      }
    }
    try put(title, .title)
    try put(notes, .notes)
    try put(url, .url)
    try put(due, .due)
    try put(early, .early)
    try put(`repeat`, .repeat)
    try put(priority, .priority)
    try put(tags, .tags)
    try put(assignee, .assignee)
    try put(listId, .listId)
    try put(sectionId, .sectionId)
    try put(parentId, .parentId)
    try put(order, .order)
  }
}

/// The actions of `src/shared/space.ts`, encoded as the reducer expects them.
enum SpaceAction: Encodable, Sendable {
  case addList(TickleList)
  case updateList(id: String, name: String? = nil, color: ListColor? = nil, icon: String? = nil)
  case deleteList(id: String)
  case reorderLists(ids: [String])
  case addSection(listId: String, section: ListSection)
  case renameSection(listId: String, id: String, name: String)
  case deleteSection(listId: String, id: String)
  case addReminder(Reminder)
  case updateReminder(id: String, patch: ReminderPatch)
  case deleteReminder(id: String)
  case addMember(Member)
  case renameMember(id: String, name: String)
  case removeMember(id: String)
  case clearCompleted(listId: String?)
  case setTimeZone(String)

  private enum Key: String, CodingKey {
    case type, list, id, name, color, icon, ids, listId, section, reminder, patch, member, timeZone
  }

  func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: Key.self)
    switch self {
    case .addList(let list):
      try c.encode("addList", forKey: .type)
      try c.encode(list, forKey: .list)
    case .updateList(let id, let name, let color, let icon):
      try c.encode("updateList", forKey: .type)
      try c.encode(id, forKey: .id)
      try c.encodeIfPresent(name, forKey: .name)
      try c.encodeIfPresent(color, forKey: .color)
      try c.encodeIfPresent(icon, forKey: .icon)
    case .deleteList(let id):
      try c.encode("deleteList", forKey: .type)
      try c.encode(id, forKey: .id)
    case .reorderLists(let ids):
      try c.encode("reorderLists", forKey: .type)
      try c.encode(ids, forKey: .ids)
    case .addSection(let listId, let section):
      try c.encode("addSection", forKey: .type)
      try c.encode(listId, forKey: .listId)
      try c.encode(section, forKey: .section)
    case .renameSection(let listId, let id, let name):
      try c.encode("renameSection", forKey: .type)
      try c.encode(listId, forKey: .listId)
      try c.encode(id, forKey: .id)
      try c.encode(name, forKey: .name)
    case .deleteSection(let listId, let id):
      try c.encode("deleteSection", forKey: .type)
      try c.encode(listId, forKey: .listId)
      try c.encode(id, forKey: .id)
    case .addReminder(let reminder):
      try c.encode("addReminder", forKey: .type)
      try c.encode(reminder, forKey: .reminder)
    case .updateReminder(let id, let patch):
      try c.encode("updateReminder", forKey: .type)
      try c.encode(id, forKey: .id)
      try c.encode(patch, forKey: .patch)
    case .deleteReminder(let id):
      try c.encode("deleteReminder", forKey: .type)
      try c.encode(id, forKey: .id)
    case .addMember(let member):
      try c.encode("addMember", forKey: .type)
      try c.encode(member, forKey: .member)
    case .renameMember(let id, let name):
      try c.encode("renameMember", forKey: .type)
      try c.encode(id, forKey: .id)
      try c.encode(name, forKey: .name)
    case .removeMember(let id):
      try c.encode("removeMember", forKey: .type)
      try c.encode(id, forKey: .id)
    case .clearCompleted(let listId):
      try c.encode("clearCompleted", forKey: .type)
      try c.encodeIfPresent(listId, forKey: .listId)
    case .setTimeZone(let timeZone):
      try c.encode("setTimeZone", forKey: .type)
      try c.encode(timeZone, forKey: .timeZone)
    }
  }
}

/// Labels the shared code computes for each reminder at a given moment.
struct ReminderLabels: Decodable, Hashable, Sendable {
  /// "Demain, 18 h", "Hier", "jeu. 4 déc."
  var due: String?
  /// "18 h 30"
  var time: String?
  var overdue: Bool
  /// "Tous les jours"
  var `repeat`: String?
}

/// A short id, like the web app's (`newId` in src/lib/views.ts).
func newId() -> String { String(UUID().uuidString.lowercased().prefix(12)) }

/// "Now" in the household's time zone, as the shared code takes it.
struct LocalNow: Codable, Hashable, Sendable {
  var date: String
  var time: String

  static func at(_ instant: Date = Date(), in zone: TimeZone = .current) -> LocalNow {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: instant)
    return LocalNow(
      date: String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1),
      time: String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    )
  }
}
