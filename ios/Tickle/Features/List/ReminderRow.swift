import SwiftUI

/// What a reminder made by pressing Return while editing another gets from the screen it's shown on: Today's date,
/// a tag. Without it, Return just ends editing.
struct ContinueDefaults {
  var due: Due?
  var tag: String?
}

/// A reminder, like a row in Reminders: its round checkbox, title and details (src/components/ReminderRow.tsx). On an
/// iPhone a tap edits it in place; on an iPad it selects it, for the details beside the list.
struct ReminderRow: View {
  let reminder: Reminder
  /// Shown where reminders of several lists mix (Today, tags).
  var showList = false
  /// Today shows only the time of reminders due today: the day is the screen's title.
  var timeOnly = false
  var depth = 0
  var expanded = false
  var onToggleExpand: () -> Void = {}
  var continueWith: ContinueDefaults?
  var linger: Linger?

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  @Environment(\.wideLayout) private var wideLayout

  private var list: TickleList? { store.list(reminder.listId) }
  private var tint: Color { list?.tint ?? .accentColor }
  private var actions: ReminderActions { ReminderActions(store: store, toaster: toaster) }
  private var wide: Bool { wideLayout }
  private var editing: Bool { router.editingReminder == reminder.id && !wide }

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      CheckButton(completed: reminder.completed, tint: tint, title: reminder.title) {
        if !reminder.completed { linger?.hold(reminder.id) }
        actions.toggle(reminder)
      }
      if editing {
        InlineEditor(reminder: reminder, tint: tint, continueWith: continueWith)
      } else {
        content
          .contentShape(Rectangle())
          .onTapGesture { startEditing() }
      }
    }
    .padding(.leading, CGFloat(depth) * 30)
    .padding(.vertical, 2)
    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
      if !editing {
        Button(role: .destructive) { actions.delete(reminder.id) } label: { Label("Supprimer", systemImage: "trash") }
        Button { openDetails() } label: { Label("Détails", systemImage: "info.circle") }
          .tint(.gray)
      }
    }
  }

  private var content: some View {
    HStack(alignment: .top, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        title
        if let notes = reminder.notes, !notes.isEmpty {
          Text(notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
        }
        if let meta {
          meta.font(.subheadline).foregroundStyle(.secondary)
        }
        if let url = reminder.url, !url.isEmpty {
          Text(url.replacingOccurrences(of: #"^https?://(www\.)?"#, with: "", options: .regularExpression))
            .font(.subheadline).foregroundStyle(Color.accentColor).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isButton)
      .accessibilityHint(wide ? "" : "Modifier")
      if let member = store.space.member(reminder.assignee) {
        Avatar(member: member)
      }
      let children = store.space.subtasks(of: reminder.id)
      if !children.isEmpty {
        let open = children.filter { !$0.completed }.count
        Button(action: onToggleExpand) {
          HStack(spacing: 2) {
            Text(open > 0 ? "\(open)" : "✓")
            Image(systemName: "chevron.right")
              .font(.caption.weight(.bold))
              .rotationEffect(.degrees(expanded ? 90 : 0))
          }
          .font(.subheadline)
          .foregroundStyle(Color.secondary)
          .frame(minWidth: 44, minHeight: 32)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("\(open) sous-tâche\(open > 1 ? "s" : "")")
        .accessibilityValue(expanded ? "ouvertes" : "fermées")
      }
    }
  }

  private var title: some View {
    var text = AttributedString()
    if reminder.priority > 0 {
      var mark = AttributedString(ReminderOptions.priorityMarks[min(reminder.priority, 3)] + " ")
      mark.foregroundColor = tint
      mark.inlinePresentationIntent = .stronglyEmphasized
      text += mark
    }
    text += AttributedString(reminder.title.isEmpty ? " " : reminder.title)
    return Text(text)
      .foregroundStyle(reminder.completed ? .secondary : .primary)
  }

  /// « Courses · Demain, 9 h 🔔 · ↻ Toutes les semaines #maison »: parts separated by dots, then the tags.
  private var meta: Text? {
    let labels = store.labels[reminder.id]
    var parts: [Text] = []
    if showList, let list { parts.append(Text(list.name)) }
    let due: String? = timeOnly && reminder.due?.date == store.now.date ? labels?.time : labels?.due
    if let due {
      let bell = reminder.early != nil ? Text(" \(Image(systemName: "bell.fill"))").font(.caption) : Text("")
      parts.append(Text("\(Text(due))\(bell)").foregroundStyle(labels?.overdue == true ? Color.red : Color.secondary))
    }
    if let repeatLabel = labels?.repeat {
      parts.append(Text("\(Image(systemName: "repeat")) \(repeatLabel)"))
    }
    var text: Text?
    for part in parts { text = text.map { Text("\($0) · \(part)") } ?? part }
    for tag in reminder.tags {
      let chip = Text("#\(tag)").foregroundStyle(Color.accentColor)
      text = text.map { Text("\($0) \(chip)") } ?? chip
    }
    return text
  }

  private func startEditing() {
    if wide {
      router.selectedReminder = reminder.id
    } else {
      router.editingReminder = reminder.id
    }
  }

  private func openDetails() {
    router.editingReminder = nil
    router.selectedReminder = reminder.id
  }
}

/// The round checkbox, in the list's colour.
struct CheckButton: View {
  let completed: Bool
  let tint: Color
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle()
          .strokeBorder(completed ? tint : Color(.systemGray3), lineWidth: 1.5)
        if completed {
          Circle().fill(tint).padding(4)
        }
      }
      .frame(width: 24, height: 24)
      .frame(width: 30, height: 30)
      .contentShape(Rectangle())
    }
    .buttonStyle(.borderless)
    .sensoryFeedback(.success, trigger: completed) { _, now in now }
    .animation(.snappy(duration: 0.2), value: completed)
    .accessibilityLabel(completed ? "Rouvrir \(title)" : "Terminer \(title)")
    .accessibilityAddTraits(completed ? .isSelected : [])
  }
}

/// A member's initial in their colour (the web's Avatar).
struct Avatar: View {
  let member: Member
  var size: CGFloat = 24

  var body: some View {
    Text(String(member.name.prefix(1)).uppercased())
      .font(.system(size: size * 0.5, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: size, height: size)
      .background(member.color.color, in: Circle())
      .accessibilityLabel("Assigné à \(member.name)")
  }
}

/// « Déplacer vers » a list, or a section of it. A long press drags a reminder instead (a context menu would get in
/// its way), so this is a chip of the inline editor.
struct MoveMenu: View {
  let reminder: Reminder
  let tint: Color
  @Environment(Store.self) private var store
  @Environment(Toaster.self) private var toaster

  var body: some View {
    Menu {
      ForEach(store.lists) { list in
        if list.sections.isEmpty {
          Button(list.icon + " " + list.name) { move(to: list, section: nil) }
            .disabled(list.id == reminder.listId && reminder.sectionId == nil)
        } else {
          Menu(list.icon + " " + list.name) {
            Button("Sans section") { move(to: list, section: nil) }
              .disabled(list.id == reminder.listId && reminder.sectionId == nil)
            ForEach(list.sections.sorted { $0.order < $1.order }) { section in
              Button(section.name) { move(to: list, section: section.id) }
                .disabled(list.id == reminder.listId && reminder.sectionId == section.id)
            }
          }
        }
      }
    } label: {
      Chip(icon: "folder", text: nil, set: false, tint: tint)
    }
    .accessibilityLabel("Déplacer vers")
  }

  private func move(to list: TickleList, section: String?) {
    let last = store.space.reminders.values.filter { $0.listId == list.id }.map(\.order).max() ?? 0
    ReminderActions(store: store, toaster: toaster).move(
      reminder, listId: list.id, sectionId: section.map { .set($0) } ?? .clear, order: last + 1,
      text: "Déplacé dans \(list.name) : \(reminder.title)")
  }
}
