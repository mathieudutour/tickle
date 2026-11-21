import SwiftUI

/// The lists screen (src/views/Home.tsx): search, « Aujourd’hui », « Mes listes » and tags. In edit mode, lists are
/// reordered and deleted. On iPad it's the sidebar, its selection the screen beside it.
struct HomeView: View {
  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Push.self) private var push
  @Environment(Toaster.self) private var toaster
  @Environment(\.wideLayout) private var sidebar

  @State private var query = ""
  @State private var editMode: EditMode = .inactive
  @State private var sheet: HomeSheet?
  @State private var listToDelete: TickleList?

  private enum HomeSheet: Identifiable {
    case newReminder(listId: String?)
    case newList
    case editList(String)

    var id: String {
      switch self {
      case .newReminder: "new-reminder"
      case .newList: "new-list"
      case .editList(let id): "edit-\(id)"
      }
    }
  }

  var body: some View {
    @Bindable var router = router
    Group {
      if sidebar {
        List(selection: $router.selection) { content }
          .listStyle(.sidebar)
      } else {
        List { content }
          .listStyle(.insetGrouped)
      }
    }
    .searchable(
      text: $query, placement: sidebar ? .sidebar : .navigationBarDrawer(displayMode: .always), prompt: "Rechercher")
    .navigationTitle("Listes")
    .navigationBarTitleDisplayMode(.inline)
    .environment(\.editMode, $editMode)
    .toolbar { toolbar }
    .sheet(item: $sheet) { sheet in
      switch sheet {
      case .newReminder(let listId): NewReminderSheet(listId: listId)
      case .newList: ListEditor(listId: nil, onCreated: { id in show(.list(id)) })
      case .editList(let id): ListEditor(listId: id)
      }
    }
    .confirmationDialog(
      deleteTitle, isPresented: Binding(get: { listToDelete != nil }, set: { if !$0 { listToDelete = nil } }),
      titleVisibility: .visible, presenting: listToDelete
    ) { list in
      Button("Supprimer la liste", role: .destructive) { delete(list) }
    }
  }

  // ---------- Content ----------

  @ViewBuilder private var content: some View {
    let me = store.lookup.me(push)
    if !store.space.members.isEmpty && me == nil && query.isEmpty {
      SwiftUI.Section { WhoAmIBanner() }
    }
    // Sync is silent while it works; this only shows when changes can't reach the others.
    if store.connection == .offline && store.joined && query.isEmpty {
      SwiftUI.Section {
        Label(store.lookup.statusLabel, systemImage: "icloud.slash")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
    if query.trimmingCharacters(in: .whitespaces).isEmpty {
      lists(me: me)
    } else {
      results
    }
  }

  @ViewBuilder private func lists(me: Member?) -> some View {
    SwiftUI.Section {
      NavigationLink(value: Route.today) {
        HStack(spacing: 12) {
          Image(systemName: "calendar")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 32, height: 32)
            .background(Color.accentColor, in: Circle())
          Text("Aujourd’hui").font(.body.weight(.semibold))
          Spacer()
          Text("\(store.lookup.dueBy(store.now.date).filter { store.lookup.isForMe($0, me) }.count)")
            .foregroundStyle(.secondary)
            .monospacedDigit()
        }
      }
      .tag(Route.today)
    }

    SwiftUI.Section("Mes listes") {
      ForEach(store.lists) { list in
        listRow(list)
      }
      .onMove { from, to in
        var ids = store.lists.map(\.id)
        ids.move(fromOffsets: from, toOffset: to)
        store.dispatch(.reorderLists(ids: ids))
      }
      .onDelete { offsets in
        guard store.space.lists.count > 1, let index = offsets.first else { return }
        listToDelete = store.lists[index]
      }
      .deleteDisabled(store.space.lists.count <= 1)
    }

    let tags = store.lookup.tags
    if !tags.isEmpty {
      SwiftUI.Section("Tags") {
        ChipFlow(spacing: 8) {
          ForEach(tags, id: \.self) { tag in
            Button {
              show(.tag(tag))
            } label: {
              PreviewChip(text: "#\(tag)", on: router.current == .tag(tag))
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.vertical, 4)
      }
    }
  }

  @ViewBuilder private func listRow(_ list: TickleList) -> some View {
    if editMode.isEditing {
      HStack(spacing: 12) {
        ListEmojiBadge(list: list)
        Text(list.name)
        Spacer()
        Button {
          sheet = .editList(list.id)
        } label: {
          Image(systemName: "info.circle").font(.title3)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Modifier \(list.name)")
      }
    } else {
      NavigationLink(value: Route.list(list.id)) {
        HStack(spacing: 12) {
          ListEmojiBadge(list: list)
          Text(list.name)
          Spacer()
          Text("\(store.openCount(list.id))").foregroundStyle(.secondary).monospacedDigit()
        }
      }
      .tag(Route.list(list.id))
      .contextMenu {
        Button("Modifier la liste…", systemImage: "info.circle") { sheet = .editList(list.id) }
        if store.space.lists.count > 1 {
          Button("Supprimer la liste", systemImage: "trash", role: .destructive) { listToDelete = list }
        }
      }
    }
  }

  @ViewBuilder private var results: some View {
    let found = store.lookup.search(query)
    if found.isEmpty {
      SwiftUI.Section {
        EmptyState(art: .noResults, text: "Aucun résultat pour « \(query.trimmingCharacters(in: .whitespaces)) »")
          .listRowBackground(Color.clear)
      }
    } else {
      SwiftUI.Section {
        ForEach(found) { reminder in
          SearchResultRow(reminder: reminder)
        }
      }
    }
  }

  // ---------- Toolbar ----------

  @ToolbarContentBuilder private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      if !editMode.isEditing {
        Button {
          show(.settings)
        } label: {
          Image(systemName: "gearshape")
        }
        .accessibilityLabel("Réglages et partage")
      }
      Button(editMode.isEditing ? "OK" : "Modifier") {
        withAnimation { editMode = editMode.isEditing ? .inactive : .active }
      }
      .fontWeight(editMode.isEditing ? .semibold : .regular)
    }
    ToolbarItemGroup(placement: .bottomBar) {
      Button {
        // A new reminder goes to the list showing beside the sidebar.
        if sidebar, case .list(let id) = router.current {
          sheet = .newReminder(listId: id)
        } else {
          sheet = .newReminder(listId: nil)
        }
      } label: {
        // Toolbars show a Label's icon only: the title is spelled out, as in Reminders. The sidebar is too narrow for
        // both titles, so there it's the icon alone.
        HStack(spacing: 6) {
          Image(systemName: "plus.circle.fill").font(.title2)
          if !sidebar { Text("Nouveau rappel").fontWeight(.semibold) }
        }
      }
      .accessibilityLabel("Nouveau rappel")
      Spacer()
      Button("Ajouter une liste") { sheet = .newList }
    }
  }

  // ---------- Actions ----------

  private func show(_ route: Route) {
    if sidebar { router.selection = route } else { router.path.append(route) }
  }

  private var deleteTitle: String {
    guard let list = listToDelete else { return "" }
    let count = store.space.reminders.values.filter { $0.listId == list.id }.count
    return count > 0
      ? "Supprimer « \(list.name) » et ses \(count) rappel\(count > 1 ? "s" : "") ?"
      : "Supprimer « \(list.name) » ?"
  }

  private func delete(_ list: TickleList) {
    guard store.space.lists.count > 1 else { return }
    store.dispatch(.deleteList(id: list.id))
    router.path.removeAll { $0 == .list(list.id) }
    if router.selection == .list(list.id) { router.selection = .today }
    toaster.show("Liste supprimée : \(list.name)")
    listToDelete = nil
  }
}

/// A reminder found by the search: its checkbox, title, list and date. A tap opens its details.
private struct SearchResultRow: View {
  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  let reminder: Reminder

  var body: some View {
    let list = store.list(reminder.listId)
    let labels = store.labels[reminder.id]
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Button {
        store.setCompleted(reminder.id, !reminder.completed)
      } label: {
        Image(systemName: reminder.completed ? "largecircle.fill.circle" : "circle")
          .font(.title2)
          .foregroundStyle(reminder.completed ? (list?.color.color ?? .accentColor) : Color.secondary.opacity(0.6))
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(reminder.completed ? "Rouvrir \(reminder.title)" : "Terminer \(reminder.title)")

      Button {
        router.selectedReminder = reminder.id
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(reminder.title)
            .foregroundStyle(reminder.completed ? .secondary : .primary)
          HStack(spacing: 6) {
            if let list {
              Text("\(list.icon) \(list.name)").foregroundStyle(list.color.color)
            }
            if let due = labels?.due {
              Text(due).foregroundStyle(labels?.overdue == true ? .red : .secondary)
            }
            if let repeatLabel = labels?.repeat {
              Image(systemName: "repeat").foregroundStyle(.secondary).accessibilityLabel(repeatLabel)
            }
          }
          .font(.footnote)
          .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
  }
}
