import SwiftUI

/// iPhone: the lists, with screens pushed over them and a reminder's details in a sheet. iPad: the lists in a sidebar,
/// the screen beside them and the selected reminder's details on the right, like the web app's wide layout.
struct RootView: View {
  @Environment(\.horizontalSizeClass) private var size
  @Environment(Router.self) private var router
  @Environment(Store.self) private var store
  @State private var toaster = Toaster()

  var body: some View {
    @Bindable var router = router
    Group {
      if size == .regular { SplitRoot() } else { StackRoot() }
    }
    .alertPrompt()
    .overlay(alignment: .bottom) { ToastOverlay() }
    .sheet(item: Binding(get: { router.joinKey.map(JoinKey.init) }, set: { router.joinKey = $0?.id })) { join in
      JoinSheet(joinKey: join.id)
    }
    // Below the sheet, so the sheet's content can show toasts too.
    .environment(toaster)
    .onChange(of: store.notice) { _, notice in
      guard let notice else { return }
      toaster.show(notice)
      store.notice = nil
    }
  }

  private struct JoinKey: Identifiable { var id: String }
}

/// One screen of the app.
struct RouteView: View {
  let route: Route

  var body: some View {
    switch route {
    case .today: TodayScreen()
    case .list(let id): ListScreen(listId: id)
    case .tag(let tag): TagScreen(tag: tag)
    case .settings: SettingsView()
    }
  }
}

private struct StackRoot: View {
  @Environment(Router.self) private var router

  var body: some View {
    @Bindable var router = router
    NavigationStack(path: $router.path) {
      HomeView()
        .navigationDestination(for: Route.self) { RouteView(route: $0) }
    }
    .sheet(item: Binding(get: { router.selectedReminder.map(ReminderID.init) }, set: { router.selectedReminder = $0?.id })) {
      ReminderDetails(reminderId: $0.id)
    }
  }
}

private struct SplitRoot: View {
  @Environment(Router.self) private var router
  /// All three columns, even in portrait, where iOS would otherwise show only the details.
  @State private var columns = NavigationSplitViewVisibility.all

  var body: some View {
    NavigationSplitView(columnVisibility: $columns) {
      HomeView()
    } content: {
      NavigationStack {
        RouteView(route: router.selection ?? .today)
      }
    } detail: {
      if let id = router.selectedReminder {
        ReminderDetails(reminderId: id).id(id)
      } else {
        ContentUnavailableView("Aucun rappel sélectionné", systemImage: "checklist", description: Text("Choisis un rappel pour voir ses détails."))
      }
    }
    .environment(\.wideLayout, true)
  }
}

struct ReminderID: Identifiable, Hashable { var id: String }

extension EnvironmentValues {
  /// Set on the iPad's split layout: Home is the sidebar, and a tap selects a reminder for the details beside the list
  /// instead of editing it in place. (Inside a split view's columns the size class is compact, so they can't tell.)
  @Entry var wideLayout = false
}
