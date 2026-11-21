import SwiftUI

/// A row of a reminder list: a section's title, a reminder (or a subtask, deeper), or a section's « Nouveau rappel ».
/// They're one flat sequence so a reminder can be dragged from one section into another.
enum ListItem: Identifiable, Hashable {
  case header(String)
  case reminder(String, depth: Int)
  case quickAdd(String?)

  var id: String {
    switch self {
    case .header(let id): "h:\(id)"
    case .reminder(let id, _): "r:\(id)"
    case .quickAdd(let section): "q:\(section ?? "")"
    }
  }

  var reminderId: String? { if case .reminder(let id, _) = self { id } else { nil } }
}

/// A reminder's row followed by its subtasks when they're shown.
@MainActor
func reminderItems(
  _ reminder: Reminder, in space: Space, depth: Int = 0, expanded: Set<String>, showCompleted: Bool, linger: Linger
) -> [ListItem] {
  var items: [ListItem] = [.reminder(reminder.id, depth: depth)]
  guard expanded.contains(reminder.id) else { return items }
  for child in space.subtasks(of: reminder.id) where showCompleted || !child.completed || linger.contains(child.id) {
    items += reminderItems(child, in: space, depth: depth + 1, expanded: expanded, showCompleted: showCompleted, linger: linger)
  }
  return items
}

/// Lists whose completed reminders are shown, remembered on this device as the web app does.
struct ShowCompleted: DynamicProperty {
  @AppStorage("tickle.showCompleted") private var stored = ""

  func contains(_ listId: String) -> Bool { stored.split(separator: ",").contains { $0 == listId } }

  func set(_ listId: String, _ show: Bool) {
    var ids = Set(stored.split(separator: ",").map(String.init))
    if show { ids.insert(listId) } else { ids.remove(listId) }
    stored = ids.sorted().joined(separator: ",")
  }
}

/// One list, with its sections (src/views/ListView.tsx). Reminders move within and between sections with a long
/// press; the ⋯ menu edits the list, adds a section, and shows or clears completed reminders.
struct ListScreen: View {
  let listId: String

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  @Environment(\.wideLayout) private var wideLayout
  @State private var linger = Linger()
  @State private var expanded: Set<String> = []
  @State private var editingList = false
  @State private var newReminder = false
  @State private var titleHidden = false
  /// A section just added from the menu, whose name field takes focus.
  @State private var freshSection: String?
  private let showCompleted = ShowCompleted()

  private var actions: ReminderActions { ReminderActions(store: store, toaster: toaster) }

  var body: some View {
    if let list = store.list(listId) {
      content(list)
    } else {
      ContentUnavailableView("Cette liste n’existe plus.", systemImage: "list.bullet")
        .onAppear {
          if router.path.last == .list(listId) { router.path.removeLast() }
          if router.selection == .list(listId) { router.selection = .today }
        }
    }
  }

  // ---------- Content ----------

  private func items(_ list: TickleList, all: [Reminder], show: Bool) -> [ListItem] {
    let space = store.space
    let visible = all.filter { show || !$0.completed || linger.contains($0.id) }
    let sections = list.sections.sorted { $0.order < $1.order }
    let sectionOf = { (r: Reminder) -> String? in
      r.sectionId.flatMap { id in sections.contains { $0.id == id } ? id : nil }
    }
    var items: [ListItem] = []
    let loose = visible.filter { sectionOf($0) == nil }
    // The part without a section only shows when it has reminders, or when there are no sections.
    if !loose.isEmpty || sections.isEmpty {
      for r in loose { items += reminderItems(r, in: space, expanded: expanded, showCompleted: show, linger: linger) }
      items.append(.quickAdd(nil))
    }
    for section in sections {
      items.append(.header(section.id))
      for r in visible where sectionOf(r) == section.id {
        items += reminderItems(r, in: space, expanded: expanded, showCompleted: show, linger: linger)
      }
      items.append(.quickAdd(section.id))
    }
    return items
  }

  private func content(_ list: TickleList) -> some View {
    let all = store.space.topLevel.filter { $0.listId == list.id }.sorted(by: Reminder.byOrder)
    let show = showCompleted.contains(list.id)
    let completedCount = all.filter(\.completed).count
    let items = items(list, all: all, show: show)
    let visibleCount = items.filter { $0.reminderId != nil }.count

    return List(selection: selection) {
      Text(list.name)
        .font(.largeTitle.bold())
        .foregroundStyle(list.tint)
        .listRowSeparator(.hidden)
        .selectionDisabled()
        .onScrollVisibilityChange(threshold: 0.2) { visible in titleHidden = !visible }
        .accessibilityAddTraits(.isHeader)
      ForEach(items) { item in
        row(item, list: list, show: show)
          .listRowSeparator(.hidden, edges: item == items.first ? .top : [])
      }
      .onMove { from, to in move(items: items, from: from, to: to, list: list) }
      if visibleCount == 0 && list.sections.isEmpty {
        Group {
          if completedCount > 0 {
            EmptyState(art: .allDone, text: "Tout est fait 🎉")
          } else {
            EmptyState(art: .emptyList, text: "Aucun rappel pour l’instant")
          }
        }
        .listRowSeparator(.hidden)
        .selectionDisabled()
      }
    }
    .listStyle(.plain)
    .tint(list.tint)
    .navigationTitle(titleHidden ? list.name : "")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Menu {
          Button { editingList = true } label: { Label("Modifier la liste…", systemImage: "pencil") }
          Button { addSection(list) } label: { Label("Ajouter une section", systemImage: "rectangle.stack.badge.plus") }
          Button {
            showCompleted.set(list.id, !show)
          } label: {
            Label(
              show
                ? "Masquer les terminés"
                : completedCount > 0 ? "Afficher les terminés (\(completedCount))" : "Afficher les terminés",
              systemImage: show ? "eye.slash" : "eye")
          }
          if completedCount > 0 {
            Button(role: .destructive) { clearCompleted(list) } label: {
              Label("Effacer les terminés", systemImage: "trash")
            }
          }
        } label: {
          Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("Options de la liste")
      }
    }
    .sheet(isPresented: $editingList) { ListEditor(listId: list.id) }
    .sheet(isPresented: $newReminder) { NewReminderSheet(listId: list.id) }
    .reminderKeyboard(
      reminders: items.compactMap(\.reminderId), siblings: { siblings(of: $0, list: list) }, newReminder: $newReminder)
    #if DEBUG
      .onAppear {
        // `-TickleEdit ID`: start editing a reminder in place, to check the editor in the simulator.
        if let id = UserDefaults.standard.string(forKey: "TickleEdit"), store.space.reminders[id] != nil {
          router.editingReminder = id
        }
      }
    #endif
  }

  /// iPad: the selected reminder shows in the inspector. iPhone: no selection (a tap edits in place).
  private var selection: Binding<String?> {
    Binding(
      get: { wideLayout ? router.selectedReminder.map { "r:\($0)" } : nil },
      set: { id in
        guard wideLayout, let id, id.hasPrefix("r:") else { return }
        router.selectedReminder = String(id.dropFirst(2))
      })
  }

  @ViewBuilder
  private func row(_ item: ListItem, list: TickleList, show: Bool) -> some View {
    switch item {
    case .header(let id):
      if let section = list.sections.first(where: { $0.id == id }) {
        SectionHeader(listId: list.id, section: section, tint: list.tint, fresh: $freshSection) {
          deleteSection(section, list: list)
        }
        .selectionDisabled()
        .listRowSeparator(.hidden, edges: .top)
      }
    case .reminder(let id, let depth):
      if let reminder = store.space.reminders[id] {
        ReminderRow(
          reminder: reminder, depth: depth, expanded: expanded.contains(id),
          onToggleExpand: {
            withAnimation(.snappy) { if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) } }
          },
          continueWith: ContinueDefaults(), linger: linger
        )
      }
    case .quickAdd(let section):
      QuickAddRow(defaults: EntryDefaults(listId: list.id, sectionId: section), tint: list.tint)
        .selectionDisabled()
    }
  }

  // ---------- Moving ----------

  /// A reminder dropped somewhere in the flat sequence: its section is the nearest title above it, its order between
  /// the reminders around it in that section. Titles, subtasks and « Nouveau rappel » rows can be lifted too (rows that
  /// can't move would stop reminders from crossing them) but go back where they were.
  private func move(items: [ListItem], from: IndexSet, to: Int, list: TickleList) {
    guard let source = from.first, case .reminder(let id, 0) = items[source], let reminder = store.space.reminders[id]
    else { return }
    var arranged = items
    arranged.move(fromOffsets: from, toOffset: to)
    guard arranged != items, let index = arranged.firstIndex(of: items[source]) else { return }
    var section: String?
    var before: Reminder?
    for item in arranged[..<index].reversed() {
      if case .header(let s) = item {
        section = s
        break
      }
      if case .reminder(let r, 0) = item, before == nil { before = store.space.reminders[r] }
    }
    var after: Reminder?
    for item in arranged[(index + 1)...] {
      if case .header = item { break }
      if case .reminder(let r, 0) = item {
        after = store.space.reminders[r]
        break
      }
    }
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    actions.move(reminder, sectionId: section.map { .set($0) } ?? .clear, order: orderBetween(before?.order, after?.order))
  }

  /// The reminders a keyboard move steps through: its section's, in order.
  private func siblings(of reminder: Reminder, list: TickleList) -> [Reminder] {
    let show = showCompleted.contains(list.id)
    return store.space.topLevel
      .filter { $0.listId == list.id && $0.sectionId == reminder.sectionId && (show || !$0.completed) }
      .sorted(by: Reminder.byOrder)
  }

  // ---------- Menu ----------

  private func addSection(_ list: TickleList) {
    let id = newId()
    store.dispatch(
      .addSection(listId: list.id, section: ListSection(id: id, name: "Nouvelle section", order: Double(list.sections.count))))
    freshSection = id
  }

  private func deleteSection(_ section: ListSection, list: TickleList) {
    let inside = store.space.reminders.values.filter { $0.sectionId == section.id }
    store.dispatch(.deleteSection(listId: list.id, id: section.id))
    toaster.show("Section supprimée : \(section.name)") {
      store.dispatch(.addSection(listId: list.id, section: section))
      for r in inside {
        var patch = ReminderPatch()
        patch.sectionId = .set(section.id)
        store.update(r.id, patch)
      }
    }
  }

  /// Deletes the list's completed reminders; « Annuler » puts them back, parents before their subtasks.
  private func clearCompleted(_ list: TickleList) {
    let space = store.space
    func depth(_ r: Reminder) -> Int { r.parentId.flatMap { space.reminders[$0] }.map { 1 + depth($0) } ?? 0 }
    let removed = space.reminders.values.filter { $0.completed && $0.listId == list.id }.sorted { depth($0) < depth($1) }
    store.dispatch(.clearCompleted(listId: list.id))
    let n = removed.count
    let s = n > 1 ? "s" : ""
    toaster.show("\(n) terminé\(s) effacé\(s)") {
      for r in removed { store.dispatch(.addReminder(r)) }
    }
  }
}

/// A section's name, renamed in place; its menu deletes it.
struct SectionHeader: View {
  let listId: String
  let section: ListSection
  let tint: Color
  @Binding var fresh: String?
  let onDelete: () -> Void

  @Environment(Store.self) private var store
  @State private var name = ""
  @FocusState private var focused: Bool

  var body: some View {
    TextField("Nouvelle section", text: $name)
      .font(.title3.bold())
      .foregroundStyle(tint)
      .focused($focused)
      .submitLabel(.done)
      .onSubmit(save)
      .onChange(of: focused) { _, focused in if !focused { save() } }
      .onAppear {
        name = section.name
        if fresh == section.id {
          // A new section's placeholder name is replaced as soon as one is typed.
          name = ""
          focused = true
          fresh = nil
        }
      }
      .onChange(of: section.name) { _, new in if !focused { name = new } }
      .padding(.top, 14)
      .contextMenu {
        Button { focused = true } label: { Label("Renommer", systemImage: "pencil") }
        Button(role: .destructive, action: onDelete) { Label("Supprimer la section", systemImage: "trash") }
      }
      .accessibilityLabel("Nom de la section")
  }

  private func save() {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty {
      name = section.name
    } else if trimmed != section.name {
      store.dispatch(.renameSection(listId: listId, id: section.id, name: trimmed))
    }
  }
}
