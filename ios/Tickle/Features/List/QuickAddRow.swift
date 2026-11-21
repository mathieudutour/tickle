import SwiftUI

/// The « Nouveau rappel » row at the end of a list or section (src/components/QuickAdd.tsx). Return adds the reminder
/// and keeps the field open for the next one; dates, repeats, tags, priority and people typed in French are picked up
/// (« Sortir les poubelles tous les mardis 20h #maison @Léa »).
struct QuickAddRow: View {
  let defaults: EntryDefaults
  var tint: Color = .accentColor
  var label = "Nouveau rappel"

  @Environment(Store.self) private var store
  @State private var open = false
  @State private var text = ""
  @FocusState private var focused: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: open ? "circle" : "plus.circle.fill")
        .font(.system(size: 22))
        .foregroundStyle(open ? Color(.systemGray3) : tint)
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
      if open {
        VStack(alignment: .leading, spacing: 4) {
          TextField("Ex. : Pain demain 9h", text: $text)
            .focused($focused)
            .submitLabel(.done)
            .onSubmit {
              add()
              focused = true
            }
            .accessibilityLabel(label)
          EntryPreview(text: text)
        }
        .padding(.top, 4)
      } else {
        Text(label)
          .foregroundStyle(tint)
          .padding(.top, 4)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("quick-add")
      }
    }
    .contentShape(Rectangle())
    .onTapGesture {
      guard !open else { return }
      open = true
      focused = true
    }
    .onChange(of: focused) { _, focused in
      guard !focused else { return }
      add()
      open = false
    }
    .accessibilityAddTraits(open ? [] : .isButton)
  }

  private func add() {
    guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
    store.add(entry: text, defaults: defaults)
    text = ""
  }
}

/// What quick entry understood, shown under the field as it's typed.
struct EntryPreview: View {
  let text: String
  @Environment(Store.self) private var store

  var body: some View {
    let chips = self.chips
    if !text.trimmingCharacters(in: .whitespaces).isEmpty, !chips.isEmpty {
      HStack(spacing: 10) {
        ForEach(chips, id: \.1) { icon, label in
          Label(label, systemImage: icon).labelStyle(.titleAndIcon)
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      .accessibilityElement(children: .combine)
    }
  }

  private var chips: [(String, String)] {
    guard let entry = store.core.parse(text, now: store.now) else { return [] }
    var chips: [(String, String)] = []
    if let due = entry.due {
      let day = store.core.dayLabel(due.date, today: store.now.date)
      chips.append(("calendar", due.time.map { "\(day), \(store.core.timeLabel($0))" } ?? day))
    }
    if let label = ReminderOptions.repeatLabel(entry.repeat) { chips.append(("repeat", label)) }
    if entry.priority > 0 { chips.append(("exclamationmark", ReminderOptions.priorities[min(entry.priority, 3)])) }
    for tag in entry.tags { chips.append(("tag", tag)) }
    if let name = entry.assignee,
      let member = store.space.members.first(where: { $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).hasPrefix(name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)) })
    {
      chips.append(("person", member.name))
    }
    return chips
  }
}
