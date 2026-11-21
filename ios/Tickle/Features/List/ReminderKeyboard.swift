import SwiftUI

/// Keyboard shortcuts on an iPad with a keyboard, as in Reminders on a Mac (src/components/useKeyboardShortcuts.tsx):
/// N or ⌘N adds a reminder, ↑ ↓ move between them, Space checks one, ⌫ deletes it, ⌥↑ ⌥↓ move it within its section
/// and Esc closes its details. They act on the reminder shown in the details beside the list.
struct ReminderKeyboard: ViewModifier {
  /// The reminders on screen, in order.
  let reminders: [String]
  /// The reminders a keyboard move steps through (its section's); empty where reminders don't move.
  let siblings: (Reminder) -> [Reminder]
  @Binding var newReminder: Bool

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  @Environment(\.wideLayout) private var wideLayout
  /// Keyboard focus on this list once a reminder is picked in it: the sidebar would otherwise keep it, and its arrows.
  @FocusState private var focused: Bool
  /// Where the selected reminder was, for when it leaves the list.
  @State private var lastIndex: Int?

  func body(content: Content) -> some View {
    content
      .background {
        // Hidden buttons, so the shortcuts work wherever the focus is; text being typed takes the keys first.
        Group {
          Button("Nouveau rappel") { newReminder = true }
            .keyboardShortcut("n", modifiers: .command)
          if wideLayout {
            Button("Nouveau rappel") { newReminder = true }.keyboardShortcut("n", modifiers: [])
            Button("Suivant") { select(by: 1) }.keyboardShortcut(.downArrow, modifiers: [])
            Button("Précédent") { select(by: -1) }.keyboardShortcut(.upArrow, modifiers: [])
            Button("Descendre") { step(by: 1) }.keyboardShortcut(.downArrow, modifiers: .option)
            Button("Monter") { step(by: -1) }.keyboardShortcut(.upArrow, modifiers: .option)
            Button("Terminer") { toggle() }.keyboardShortcut(.space, modifiers: [])
            Button("Supprimer") { delete() }.keyboardShortcut(.delete, modifiers: [])
            Button("Fermer") { router.selectedReminder = nil }.keyboardShortcut(.escape, modifiers: [])
          }
        }
        .hidden()
        .accessibilityHidden(true)
      }
      .focusable(wideLayout)
      .focusEffectDisabled()
      .focused($focused)
      .onChange(of: router.selectedReminder) { _, id in
        if wideLayout, let id, reminders.contains(id) { focused = true }
      }
      .onChange(of: index, initial: true) { _, index in
        if let index { lastIndex = index }
      }
      // A focused list takes the arrows for its own focus before the shortcuts above see them.
      .onKeyPress(keys: [.upArrow, .downArrow]) { press in
        guard wideLayout else { return .ignored }
        let by = press.key == .downArrow ? 1 : -1
        if press.modifiers.contains(.option) { step(by: by) } else { select(by: by) }
        return .handled
      }
  }

  private var actions: ReminderActions { ReminderActions(store: store, toaster: toaster) }
  private var current: Reminder? { router.selectedReminder.flatMap { store.space.reminders[$0] } }
  private var index: Int? { current.flatMap { c in reminders.firstIndex(of: c.id) } }

  private func select(by: Int) {
    guard !reminders.isEmpty else { return }
    // A selected reminder that just left (completed, deleted) steps on from where it was.
    let base = index ?? lastIndex.map { by > 0 ? $0 - 1 : $0 }
    let next = base.map { min(reminders.count - 1, max(0, $0 + by)) } ?? (by > 0 ? 0 : reminders.count - 1)
    router.selectedReminder = reminders[next]
  }

  private func step(by: Int) {
    guard let current else { return }
    actions.step(current, among: siblings(current), by: by)
  }

  private func toggle() {
    if let current { actions.toggle(current) }
  }

  private func delete() {
    guard let current, let index else { return }
    let neighbour = index + 1 < reminders.count ? reminders[index + 1] : index > 0 ? reminders[index - 1] : nil
    actions.delete(current.id)
    router.selectedReminder = neighbour
  }
}

extension View {
  func reminderKeyboard(
    reminders: [String], siblings: @escaping (Reminder) -> [Reminder] = { _ in [] }, newReminder: Binding<Bool>
  ) -> some View {
    modifier(ReminderKeyboard(reminders: reminders, siblings: siblings, newReminder: newReminder))
  }
}
