import SwiftUI

/// The open reminders of every list with a tag (src/views/TagView.tsx). Reminders added here get the tag.
struct TagScreen: View {
  let tag: String

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(\.wideLayout) private var wideLayout
  @State private var linger = Linger()
  @State private var expanded: Set<String> = []
  @State private var newReminder = false
  @State private var titleHidden = false

  var body: some View {
    let tagged = store.space.reminders.values
      .filter { $0.tags.contains(tag) && $0.parentId == nil && (!$0.completed || linger.contains($0.id)) }
      .sorted(by: Reminder.byOrder)
    let items = tagged.flatMap { reminderItems($0, in: store.space, expanded: expanded, showCompleted: false, linger: linger) }
    List(selection: selection) {
      Text("#\(tag)")
        .font(.largeTitle.bold())
        .foregroundStyle(.gray)
        .listRowSeparator(.hidden)
        .selectionDisabled()
        .onScrollVisibilityChange(threshold: 0.2) { visible in titleHidden = !visible }
        .accessibilityAddTraits(.isHeader)
      ForEach(items) { item in
        if case .reminder(let id, let depth) = item, let reminder = store.space.reminders[id] {
          ReminderRow(
            reminder: reminder, showList: depth == 0, depth: depth, expanded: expanded.contains(id),
            onToggleExpand: {
              withAnimation(.snappy) { if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) } }
            },
            continueWith: ContinueDefaults(tag: tag), linger: linger)
        }
      }
      QuickAddRow(defaults: EntryDefaults(listId: store.space.firstListId, tag: tag), tint: .gray)
        .selectionDisabled()
      if tagged.isEmpty {
        EmptyState(art: .noResults, text: "Aucun rappel avec ce tag")
          .listRowSeparator(.hidden)
          .selectionDisabled()
      }
    }
    .listStyle(.plain)
    .tint(.gray)
    .navigationTitle(titleHidden ? "#\(tag)" : "")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $newReminder) { NewReminderSheet() }
    .reminderKeyboard(reminders: items.compactMap(\.reminderId), newReminder: $newReminder)
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
