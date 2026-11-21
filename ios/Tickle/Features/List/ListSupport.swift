import SwiftUI

// What the reminder lists share: undoable actions (the web's useToggleReminder, useDeleteReminder and useUndoMove),
// ordering, the choices of the inline editor (src/lib/reminderOptions.ts) and dates in the household's time zone.

/// An order between two neighbours, for moving a reminder (src/lib/views.ts).
func orderBetween(_ before: Double?, _ after: Double?) -> Double {
  switch (before, after) {
  case (nil, let after): (after ?? 1) - 1
  case (let before?, nil): before + 1
  case (let before?, let after?): (before + after) / 2
  }
}

extension Space {
  /// A reminder and its subtasks, parents first, to put them back on undo.
  func withSubtasks(_ id: String) -> [Reminder] {
    guard let reminder = reminders[id] else { return [] }
    let children = reminders.values.filter { $0.parentId == id }.sorted { $0.order < $1.order }
    return [reminder] + children.flatMap { withSubtasks($0.id) }
  }

  /// Subtasks of a reminder, in order.
  func subtasks(of id: String, completed: Bool = true) -> [Reminder] {
    reminders.values
      .filter { $0.parentId == id && (completed || !$0.completed) }
      .sorted(by: Reminder.byOrder)
  }

  /// The reminders at the top of the tree: a subtask whose parent is gone counts as one.
  var topLevel: [Reminder] {
    reminders.values.filter { $0.parentId == nil || reminders[$0.parentId!] == nil }
  }

  var firstListId: String { lists.min { $0.order < $1.order }?.id ?? "rappels" }

  func member(_ id: String?) -> Member? { id.flatMap { id in members.first { $0.id == id } } }
}

extension Reminder {
  static func byOrder(_ a: Reminder, _ b: Reminder) -> Bool {
    a.order != b.order ? a.order < b.order : a.createdAt < b.createdAt
  }

  /// Nothing typed or set besides its place: a new reminder left empty goes away when editing ends.
  var isBlank: Bool {
    title.trimmingCharacters(in: .whitespaces).isEmpty && (notes ?? "").isEmpty && due == nil && tags.isEmpty
      && url == nil
  }
}

/// The undoable things a row does, with « Annuler » in the toast.
@MainActor
struct ReminderActions {
  let store: Store
  let toaster: Toaster

  /// Checks or unchecks a reminder. A repeating one moves on to its next date, leaving a completed copy.
  func toggle(_ reminder: Reminder) {
    let completed = !reminder.completed
    let before = store.space.withSubtasks(reminder.id)
    guard let raw = store.core.completeAction(reminder.id, completed: completed) else { return }
    struct Completed: Decodable {
      var at: String
      var copyId: String?
      var nextDue: Due?
    }
    let action = try? JSONDecoder().decode(Completed.self, from: Data(raw.utf8))
    store.dispatch(raw: raw)
    if completed { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    let at = action?.at ?? ISO8601DateFormatter().string(from: Date())

    if completed, action?.nextDue != nil {
      let label = store.labels[reminder.id]?.repeat?.lowercased() ?? ""
      toaster.show("\(reminder.title) : prochaine fois \(label)") {
        if let copy = action?.copyId { store.dispatch(.deleteReminder(id: copy)) }
        var patch = ReminderPatch()
        patch.due = reminder.due.map { .set($0) } ?? .clear
        store.update(reminder.id, patch)
      }
    } else if completed {
      toaster.show("Fait : \(reminder.title)") {
        for r in before where !r.completed { setCompleted(r.id, false, at: at) }
      }
    } else {
      toaster.show("Rouvert : \(reminder.title)") {
        setCompleted(reminder.id, true, at: reminder.completedAt ?? at)
      }
    }
  }

  private func setCompleted(_ id: String, _ completed: Bool, at: String) {
    let at = at.replacingOccurrences(of: "\"", with: "")
    store.dispatch(raw: #"{"type":"setCompleted","id":"\#(id)","completed":\#(completed),"at":"\#(at)"}"#)
  }

  /// Deletes a reminder and its subtasks.
  func delete(_ id: String) {
    let removed = store.space.withSubtasks(id)
    guard let first = removed.first else { return }
    store.dispatch(.deleteReminder(id: id))
    toaster.show("Supprimé : \(first.title.isEmpty ? "Rappel" : first.title)") {
      for r in removed { store.dispatch(.addReminder(r)) }
    }
  }

  /// Moves a reminder to a list, section and place; « Annuler » puts it back where it was.
  func move(_ reminder: Reminder, listId: String? = nil, sectionId: Field<String>, order: Double, text: String? = nil) {
    var patch = ReminderPatch()
    if let listId, listId != reminder.listId { patch.listId = .set(listId) }
    patch.sectionId = sectionId
    patch.order = .set(order)
    store.update(reminder.id, patch)
    toaster.show(text ?? "Déplacé : \(reminder.title)") {
      var back = ReminderPatch()
      back.listId = .set(reminder.listId)
      back.sectionId = reminder.sectionId.map { .set($0) } ?? .clear
      back.order = .set(reminder.order)
      store.update(reminder.id, back)
    }
  }

  /// Moves a reminder one place up or down among its siblings, for the keyboard.
  @discardableResult
  func step(_ reminder: Reminder, among siblings: [Reminder], by: Int) -> Bool {
    guard let index = siblings.firstIndex(where: { $0.id == reminder.id }) else { return false }
    let target = index + by
    guard target >= 0, target < siblings.count else { return false }
    let others = siblings.filter { $0.id != reminder.id }
    let order = orderBetween(target > 0 ? others[target - 1].order : nil, target < others.count ? others[target].order : nil)
    move(
      reminder, sectionId: reminder.sectionId.map { .set($0) } ?? .clear, order: order,
      text: "Déplacé \(by < 0 ? "vers le haut" : "vers le bas") : \(reminder.title)")
    return true
  }

  /// Saves what was typed in place. An erased title deletes the reminder, with « Annuler »; a new reminder never
  /// given a title goes away quietly.
  func finishEditing(_ id: String, title: String, notes: String) {
    guard let reminder = store.space.reminders[id] else { return }
    let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if title.isEmpty {
      let blank = reminder.title.isEmpty && notes.isEmpty && reminder.isBlank
      if blank && store.space.subtasks(of: id).isEmpty {
        store.dispatch(.deleteReminder(id: id))
      } else {
        delete(id)
      }
      return
    }
    var patch = ReminderPatch()
    if title != reminder.title { patch.title = .set(title) }
    if notes != (reminder.notes ?? "") { patch.notes = notes.isEmpty ? .clear : .set(notes) }
    store.update(id, patch)
  }

  /// Return while editing: a new reminder just after this one (same list, section and parent), with what the screen
  /// adds (Today's date, a tag). Returns its id, to edit it.
  func addAfter(_ reminder: Reminder, due: Due? = nil, tag: String? = nil) -> String {
    let siblings = store.space.reminders.values
      .filter { $0.listId == reminder.listId && $0.sectionId == reminder.sectionId && $0.parentId == reminder.parentId }
      .sorted(by: Reminder.byOrder)
    let next = siblings.first { $0.order > reminder.order }
    let id = newId()
    store.dispatch(
      .addReminder(
        Reminder(
          id: id, listId: reminder.listId, sectionId: reminder.sectionId, parentId: reminder.parentId, title: "",
          due: due, priority: 0, tags: tag.map { [$0] } ?? [], completed: false,
          createdAt: ISO8601DateFormatter.withFraction.string(from: Date()),
          order: orderBetween(reminder.order, next?.order))))
    return id
  }
}

extension ISO8601DateFormatter {
  /// "2026-11-21T10:00:00.000Z", as JavaScript writes dates.
  @MainActor static let withFraction: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}

/// Keeps just-completed reminders on screen for a moment, as Reminders does (src/lib/useLinger.ts).
@MainActor
@Observable
final class Linger {
  private(set) var ids: Set<String> = []

  func hold(_ id: String, for duration: Duration = .milliseconds(1800)) {
    ids.insert(id)
    Task { [weak self] in
      try? await Task.sleep(for: duration)
      self?.ids.remove(id)
    }
  }

  func contains(_ id: String) -> Bool { ids.contains(id) }
}

// ---------- Choices (src/lib/reminderOptions.ts) ----------

enum ReminderOptions {
  static let repeats: [(Repeat?, String)] = [
    (nil, "Jamais"),
    (Repeat(freq: .daily, interval: 1), "Tous les jours"),
    (Repeat(freq: .weekdays, interval: 1), "En semaine"),
    (Repeat(freq: .weekends, interval: 1), "Le week-end"),
    (Repeat(freq: .weekly, interval: 1), "Toutes les semaines"),
    (Repeat(freq: .weekly, interval: 2), "Toutes les 2 semaines"),
    (Repeat(freq: .monthly, interval: 1), "Tous les mois"),
    (Repeat(freq: .monthly, interval: 3), "Tous les 3 mois"),
    (Repeat(freq: .monthly, interval: 6), "Tous les 6 mois"),
    (Repeat(freq: .yearly, interval: 1), "Tous les ans"),
  ]

  static let early: [(Int, String)] = [
    (0, "À l’heure"),
    (5, "5 min avant"),
    (15, "15 min avant"),
    (30, "30 min avant"),
    (60, "1 h avant"),
    (120, "2 h avant"),
    (1440, "La veille"),
    (2880, "2 jours avant"),
    (10080, "1 semaine avant"),
  ]

  static let priorities = ["", "Faible", "Moyenne", "Élevée"]
  static let priorityMarks = ["", "!", "!!", "!!!"]

  /// A repeat chosen from the menu, keeping the end date of the one it replaces.
  static func repeatFrom(_ choice: Repeat?, previous: Repeat?) -> Repeat? {
    guard var choice else { return nil }
    choice.until = previous?.until
    return choice
  }

  static func sameRepeat(_ a: Repeat?, _ b: Repeat?) -> Bool {
    a?.freq == b?.freq && (a?.interval ?? 0) == (b?.interval ?? 0)
  }

  /// Labels of a repeat, as src/lib/views.ts writes them.
  static func repeatLabel(_ r: Repeat?) -> String? {
    guard let r else { return nil }
    let base: [Frequency: String] = [
      .daily: "Tous les jours", .weekdays: "En semaine", .weekends: "Le week-end", .weekly: "Toutes les semaines",
      .monthly: "Tous les mois", .yearly: "Tous les ans",
    ]
    if r.interval <= 1 { return base[r.freq] }
    let unit: [Frequency: String] = [.daily: "jours", .weekly: "semaines", .monthly: "mois", .yearly: "ans"]
    return unit[r.freq].map { "Tous les \(r.interval) \($0)" } ?? base[r.freq]
  }
}

// ---------- Dates in the household's time zone ----------

enum LocalDates {
  static func calendar(_ timeZone: String) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
    calendar.locale = Locale(identifier: "fr_FR")
    calendar.firstWeekday = 2
    return calendar
  }

  /// "2026-11-21" at noon, so a picker never lands on the wrong day.
  static func date(_ iso: String, time: String? = nil, timeZone: String) -> Date {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    let clock = (time ?? "12:00").split(separator: ":").compactMap { Int($0) }
    let components = DateComponents(
      year: parts.first, month: parts.count > 1 ? parts[1] : 1, day: parts.count > 2 ? parts[2] : 1,
      hour: clock.first ?? 12, minute: clock.count > 1 ? clock[1] : 0)
    return calendar(timeZone).date(from: components) ?? Date()
  }

  static func iso(_ date: Date, timeZone: String) -> String {
    let c = calendar(timeZone).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
  }

  static func time(_ date: Date, timeZone: String) -> String {
    let c = calendar(timeZone).dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
  }

  static func addDays(_ iso: String, _ days: Int, timeZone: String) -> String {
    let cal = calendar(timeZone)
    return self.iso(cal.date(byAdding: .day, value: days, to: date(iso, timeZone: timeZone)) ?? Date(), timeZone: timeZone)
  }

  /// Saturday of this week, or today at the weekend.
  static func weekend(from today: String, timeZone: String) -> String {
    let weekday = calendar(timeZone).component(.weekday, from: date(today, timeZone: timeZone))
    // Sunday 1 … Saturday 7.
    let toSaturday = weekday == 1 ? 0 : 7 - weekday
    return addDays(today, toSaturday, timeZone: timeZone)
  }

  /// Next Monday.
  static func nextWeek(from today: String, timeZone: String) -> String {
    let weekday = calendar(timeZone).component(.weekday, from: date(today, timeZone: timeZone))
    let toMonday = weekday == 2 ? 7 : (9 - weekday) % 7
    return addDays(today, toMonday == 0 ? 7 : toMonday, timeZone: timeZone)
  }
}

extension String {
  /// « aujourd’hui » → « Aujourd’hui »
  var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

/// The colour of a list, or the app's tint.
extension TickleList {
  var tint: Color { color.color }
}

