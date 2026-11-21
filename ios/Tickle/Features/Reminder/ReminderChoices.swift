import SwiftUI

// Choices and helpers shared by a reminder's details, the new reminder sheet and the home screen, as the web app's
// src/lib/reminderOptions.ts, src/lib/views.ts and src/lib/members.ts.

enum ReminderChoices {
  /// The repeat menu: value "freq:interval", "" for never.
  static let repeats: [(value: String, label: String)] = [
    ("", "Jamais"),
    ("daily:1", "Tous les jours"),
    ("weekdays:1", "En semaine"),
    ("weekends:1", "Le week-end"),
    ("weekly:1", "Toutes les semaines"),
    ("weekly:2", "Toutes les 2 semaines"),
    ("monthly:1", "Tous les mois"),
    ("monthly:3", "Tous les 3 mois"),
    ("monthly:6", "Tous les 6 mois"),
    ("yearly:1", "Tous les ans"),
  ]

  /// Minutes before the due time.
  static let early: [(value: Int, label: String)] = [
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

  static let priorities = ["Aucune", "Faible", "Moyenne", "Élevée"]

  static func repeatValue(_ repeat: Repeat?) -> String {
    `repeat`.map { "\($0.freq.rawValue):\($0.interval)" } ?? ""
  }

  /// A repeat from the menu's value; none for « Jamais ». Keeps the end date of the one it replaces.
  static func repeatFrom(_ value: String, previous: Repeat?) -> Repeat? {
    let parts = value.split(separator: ":")
    guard parts.count == 2, let freq = Frequency(rawValue: String(parts[0])), let interval = Int(parts[1]) else {
      return nil
    }
    return Repeat(freq: freq, interval: interval, until: previous?.until)
  }

  private static let repeatLabels: [Frequency: String] = [
    .daily: "Tous les jours", .weekdays: "En semaine", .weekends: "Le week-end",
    .weekly: "Toutes les semaines", .monthly: "Tous les mois", .yearly: "Tous les ans",
  ]

  /// "Tous les jours", "Tous les 3 mois" (repeatLabel in src/lib/views.ts).
  static func repeatLabel(_ repeat: Repeat) -> String {
    if `repeat`.interval <= 1 { return repeatLabels[`repeat`.freq] ?? "" }
    let unit: String? =
      switch `repeat`.freq {
      case .daily: "jours"
      case .weekly: "semaines"
      case .monthly: "mois"
      case .yearly: "ans"
      case .weekdays, .weekends: nil
      }
    return unit.map { "Tous les \(`repeat`.interval) \($0)" } ?? repeatLabels[`repeat`.freq] ?? ""
  }

  static func capitalized(_ text: String) -> String { text.prefix(1).uppercased() + text.dropFirst() }
}

// ---------- Dates ----------

/// Converts the household's "YYYY-MM-DD" and "HH:MM" to and from `Date`, in its time zone.
struct HouseholdDates {
  let calendar: Calendar

  init(timeZone: String) {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
    calendar.locale = Locale(identifier: "fr_FR")
    self.calendar = calendar
  }

  func date(_ iso: String, time: String? = nil) -> Date {
    let d = iso.split(separator: "-").compactMap { Int($0) }
    let t = (time ?? "09:00").split(separator: ":").compactMap { Int($0) }
    let components = DateComponents(
      year: d.first ?? 1970, month: d.count > 1 ? d[1] : 1, day: d.count > 2 ? d[2] : 1,
      hour: t.first ?? 9, minute: t.count > 1 ? t[1] : 0)
    return calendar.date(from: components) ?? Date()
  }

  func iso(_ date: Date) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
  }

  func time(_ date: Date) -> String {
    let c = calendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
  }

  func addDays(_ iso: String, _ days: Int) -> String {
    self.iso(calendar.date(byAdding: .day, value: days, to: date(iso)) ?? date(iso))
  }

  /// "4 déc. 2026, 18:30", for created and completed dates (ISO 8601 instants).
  func instantLabel(_ iso8601: String) -> String? {
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = parser.date(from: iso8601) ?? ISO8601DateFormatter().date(from: iso8601) else { return nil }
    return date.formatted(
      Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: "fr_FR"), calendar: calendar,
        timeZone: calendar.timeZone))
  }
}

// ---------- Space helpers ----------

private func fold(_ text: String) -> String {
  text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR"))
}

extension Store {
  /// Lookups on the space for the home screen and the details (namespaced, so other screens' helpers can't clash).
  var lookup: SpaceLookup { SpaceLookup(store: self) }
}

@MainActor
struct SpaceLookup {
  let store: Store
  private var space: Space { store.space }
  private var core: Core { store.core }
  private var now: LocalNow { store.now }

  /// The member a typed name refers to: an exact name first, then a prefix (findMember in src/lib/members.ts).
  func member(named name: String) -> Member? {
    let wanted = fold(name.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: ""))
    guard !wanted.isEmpty else { return nil }
    return space.members.first { $0.id == name || fold($0.name) == wanted }
      ?? space.members.first { fold($0.name).hasPrefix(wanted) }
  }

  /// This phone's member, if it said who it is and that member still exists.
  func me(_ push: Push) -> Member? { push.meId.flatMap { id in space.members.first { $0.id == id } } }

  /// Whether a reminder belongs in « Aujourd’hui » here: everything but what's assigned to someone else.
  func isForMe(_ reminder: Reminder, _ me: Member?) -> Bool {
    me == nil || reminder.assignee == nil || reminder.assignee == me?.id
  }

  private func isTopLevel(_ r: Reminder) -> Bool { r.parentId.map { space.reminders[$0] == nil } ?? true }

  /// Open top-level reminders due on or before `date`, overdue ones included (dueBy in src/lib/views.ts).
  func dueBy(_ date: String) -> [Reminder] {
    space.reminders.values
      .filter { isTopLevel($0) && !$0.completed && ($0.due.map { $0.date <= date } ?? false) }
      .sorted(by: Self.byDue)
  }

  static func byOrder(_ a: Reminder, _ b: Reminder) -> Bool {
    a.order != b.order ? a.order < b.order : a.createdAt < b.createdAt
  }

  static func byDue(_ a: Reminder, _ b: Reminder) -> Bool {
    let ad = a.due?.date ?? "9999", bd = b.due?.date ?? "9999"
    if ad != bd { return ad < bd }
    let at = a.due?.time ?? "99", bt = b.due?.time ?? "99"
    if at != bt { return at < bt }
    return byOrder(a, b)
  }

  /// Reminders matching a search in their title, notes, link or tags; open ones first.
  func search(_ query: String) -> [Reminder] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    guard !q.isEmpty else { return [] }
    return space.reminders.values
      .filter { r in ([r.title, r.notes ?? "", r.url ?? ""] + r.tags).contains { $0.lowercased().contains(q) } }
      .sorted { a, b in a.completed != b.completed ? !a.completed : Self.byDue(a, b) }
  }

  /// Tags of open reminders, alphabetically.
  var tags: [String] {
    Set(space.reminders.values.filter { !$0.completed }.flatMap(\.tags))
      .sorted { $0.compare($1, locale: Locale(identifier: "fr_FR")) == .orderedAscending }
  }

  /// Subtasks of a reminder, in order.
  func subtasks(of id: String, showCompleted: Bool = true) -> [Reminder] {
    space.reminders.values.filter { $0.parentId == id && (showCompleted || !$0.completed) }.sorted(by: Self.byOrder)
  }

  /// "Synchronisé", "Hors ligne · 2 changements en attente" (statusLabel in src/components/Sharing.tsx).
  var statusLabel: String {
    guard store.key != nil else { return "Sur cet appareil seulement · connexion…" }
    guard store.joined else { return "Connexion à l’espace partagé…" }
    let pending = store.pending
    switch store.connection {
    case .online: return pending > 0 ? "Envoi…" : "Synchronisé"
    case .connecting: return "Connexion…"
    case .offline:
      return pending > 0 ? "Hors ligne · \(pending) changement\(pending > 1 ? "s" : "") en attente" : "Hors ligne"
    }
  }

  var household: HouseholdDates { HouseholdDates(timeZone: space.timeZone) }

  /// "Aujourd’hui", "Demain, 18 h" for any due date, like the shared dueLabel.
  func dueLabel(_ due: Due) -> String {
    let day = core.dayLabel(due.date, today: now.date)
    return due.time.map { "\(day), \(core.timeLabel($0))" } ?? day
  }

  /// Deletes a reminder and its subtasks, with « Annuler » to put them back (useDeleteReminder).
  func delete(_ id: String, toaster: Toaster) {
    var removed: [Reminder] = []
    func visit(_ current: String) {
      guard let r = space.reminders[current] else { return }
      removed.append(r)
      for child in space.reminders.values where child.parentId == current { visit(child.id) }
    }
    visit(id)
    guard let first = removed.first else { return }
    let store = store
    store.dispatch(.deleteReminder(id: id))
    toaster.show("Supprimé : \(first.title)") {
      for r in removed { store.dispatch(.addReminder(r)) }
    }
  }

  /// Adds a member with a colour nobody has yet, as the web app's « Ajouter une personne ».
  @discardableResult
  func addMember(named name: String) -> Member? {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    let used = Set(space.members.map(\.color))
    let color =
      ListColor.allCases.first { $0 != .gray && !used.contains($0) }
      ?? ListColor.allCases[space.members.count % ListColor.allCases.count]
    let member = Member(id: newId(), name: trimmed, color: color)
    store.dispatch(.addMember(member))
    return member
  }
}

// ---------- Small views ----------

/// A rounded square with an SF Symbol, as in Settings and Reminders' details.
struct SymbolTile: View {
  let systemName: String
  let color: Color

  var body: some View {
    Image(systemName: systemName)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: 28, height: 28)
      .background(color, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
      .accessibilityHidden(true)
  }
}

/// A list's emoji on a tinted disc.
struct ListEmojiBadge: View {
  let list: TickleList
  var size: CGFloat = 32

  var body: some View {
    Text(list.icon)
      .font(.system(size: size * 0.53))
      .frame(width: size, height: size)
      .background(list.color.color.opacity(0.24), in: Circle())
      .accessibilityHidden(true)
  }
}

/// Lays out chips in rows, wrapping as needed.
struct ChipFlow: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(subviews, width: proposal.width ?? .infinity).size
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for (index, point) in arrange(subviews, width: bounds.width).points.enumerated() {
      subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
    }
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> (points: [CGPoint], size: CGSize) {
    var points: [CGPoint] = []
    var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += rowHeight + spacing
        rowHeight = 0
      }
      points.append(CGPoint(x: x, y: y))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
      widest = max(widest, x - spacing)
    }
    return (points, CGSize(width: widest, height: y + rowHeight))
  }
}

/// A tag or parsed-entry chip.
struct PreviewChip: View {
  let text: String
  var systemImage: String?
  var tint: Color = .accentColor
  var on = false

  var body: some View {
    HStack(spacing: 4) {
      if let systemImage { Image(systemName: systemImage).imageScale(.small) }
      Text(text)
    }
    .font(.subheadline)
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .foregroundStyle(on ? Color.white : tint)
    .background(on ? tint : tint.opacity(0.14), in: Capsule())
  }
}
