import SwiftUI

/// Today's reminders from every list, as in Reminders (src/views/TodayView.tsx): overdue first, then all-day,
/// morning, afternoon and evening. Only this phone's member's reminders and the unassigned ones.
struct TodayScreen: View {
  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Push.self) private var push
  @Environment(\.wideLayout) private var wideLayout
  @State private var linger = Linger()
  @State private var expanded: Set<String> = []
  @State private var newReminder = false
  @State private var titleHidden = false

  private struct Group: Identifiable {
    var id: String
    var title: String
    var late = false
    var reminders: [Reminder]
  }

  private var me: Member? { store.space.member(push.meId) }

  /// Everything but what's assigned to someone else (src/lib/me.ts).
  private func isForMe(_ r: Reminder) -> Bool { me == nil || r.assignee == nil || r.assignee == me?.id }

  private var groups: [Group] {
    let today = store.now.date
    let space = store.space
    let reminders = space.topLevel.filter { r in
      guard let due = r.due, due.date <= today else { return false }
      // Just-completed reminders stay where they were for a moment.
      return (!r.completed && isForMe(r)) || (r.completed && linger.contains(r.id))
    }
    .sorted { a, b in
      let x = a.due!.date + (a.due!.time ?? ""), y = b.due!.date + (b.due!.time ?? "")
      return x != y ? x < y : a.order < b.order
    }
    let onToday = reminders.filter { $0.due!.date == today }
    return [
      Group(id: "late", title: "En retard", late: true, reminders: reminders.filter { $0.due!.date < today }),
      Group(id: "all-day", title: "Toute la journée", reminders: onToday.filter { $0.due!.time == nil }),
      Group(id: "morning", title: "Matin", reminders: onToday.filter { ($0.due!.time ?? "") != "" && $0.due!.time! < "12:00" }),
      Group(
        id: "afternoon", title: "Après-midi",
        reminders: onToday.filter { $0.due!.time.map { $0 >= "12:00" && $0 < "18:00" } ?? false }),
      Group(id: "evening", title: "Soir", reminders: onToday.filter { $0.due!.time.map { $0 >= "18:00" } ?? false }),
    ].filter { !$0.reminders.isEmpty }
  }

  var body: some View {
    let groups = groups
    let today = store.now.date
    let ids = groups.flatMap { $0.reminders.map(\.id) }
    List(selection: selection) {
      Text("Aujourd’hui")
        .font(.largeTitle.bold())
        .foregroundStyle(Color.accentColor)
        .listRowSeparator(.hidden)
        .selectionDisabled()
        .onScrollVisibilityChange(threshold: 0.2) { visible in titleHidden = !visible }
        .accessibilityAddTraits(.isHeader)
      if !store.space.members.isEmpty && me == nil {
        WhoAmIBanner()
          .listRowSeparator(.hidden)
          .selectionDisabled()
      }
      ForEach(groups) { group in
        SwiftUI.Section {
          ForEach(group.reminders.flatMap { reminderItems($0, in: store.space, expanded: expanded, showCompleted: false, linger: linger) }) { item in
            if case .reminder(let id, let depth) = item, let reminder = store.space.reminders[id] {
              ReminderRow(
                reminder: reminder, showList: depth == 0, timeOnly: true, depth: depth, expanded: expanded.contains(id),
                onToggleExpand: { toggle(id) }, continueWith: ContinueDefaults(due: Due(date: today)), linger: linger)
            }
          }
        } header: {
          Text(group.title)
            .font(.title3.bold())
            .foregroundStyle(group.late ? Color.red : Color.primary)
            .textCase(nil)
        }
      }
      SwiftUI.Section {
        QuickAddRow(defaults: EntryDefaults(listId: store.space.firstListId, date: today))
          .selectionDisabled()
      }
      if groups.isEmpty {
        EmptyState(art: .allDone, text: "Rien d’autre pour aujourd’hui")
          .listRowSeparator(.hidden)
          .selectionDisabled()
      }
    }
    .listStyle(.plain)
    .navigationTitle(titleHidden ? "Aujourd’hui" : "")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $newReminder) { NewReminderSheet() }
    .reminderKeyboard(reminders: ids, newReminder: $newReminder)
  }

  private func toggle(_ id: String) {
    withAnimation(.snappy) { if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) } }
  }

  private var selection: Binding<String?> {
    Binding(
      get: { wideLayout ? router.selectedReminder.map { "r:\($0)" } : nil },
      set: { id in
        guard wideLayout, let id, id.hasPrefix("r:") else { return }
        router.selectedReminder = String(id.dropFirst(2))
      })
  }
}
