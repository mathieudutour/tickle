import SwiftUI

/// « Nouveau rappel » from the home screen (NewReminderSheet.tsx): type it in French, pick a list.
struct NewReminderSheet: View {
  /// The list it goes in; nil for the first list.
  var listId: String? = nil

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  @Environment(\.dismiss) private var dismiss

  @State private var text = ""
  @State private var list = ""
  @State private var section = ""
  @FocusState private var focused: Bool

  private var entry: Core.QuickEntry? {
    text.trimmingCharacters(in: .whitespaces).isEmpty ? nil : store.core.parse(text, now: store.now)
  }
  private var canAdd: Bool { !(entry?.title.isEmpty ?? true) }
  private var chosenList: TickleList? { store.list(list) }

  var body: some View {
    NavigationStack {
      Form {
        SwiftUI.Section {
          TextField("Que faut-il faire ?", text: $text, axis: .vertical)
            .font(.title3)
            .focused($focused)
            .submitLabel(.done)
            // Return adds, as in a single-line field; the text only wraps to show it all.
            .onChange(of: text) { _, value in
              guard value.contains("\n") else { return }
              text = value.replacingOccurrences(of: "\n", with: "")
              add(details: false)
            }
            .accessibilityLabel("Rappel")
          if let entry, !chips(entry).isEmpty {
            ChipFlow(spacing: 6) {
              ForEach(chips(entry), id: \.text) { chip in
                PreviewChip(text: chip.text, systemImage: chip.icon, tint: chosenList?.color.color ?? .accentColor)
              }
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
          }
        } footer: {
          Text(
            "Écris comme tu parles : « Sortir les poubelles tous les mardis 20h », « Pain demain #courses », « Appeler Léa !! @Tom »."
          )
        }

        SwiftUI.Section {
          Picker(selection: $list) {
            ForEach(store.lists) { l in
              Text("\(l.icon) \(l.name)").tag(l.id)
            }
          } label: {
            Label {
              Text("Liste")
            } icon: {
              SymbolTile(systemName: "list.bullet", color: chosenList?.color.color ?? .blue)
            }
          }
          if let chosenList, !chosenList.sections.isEmpty {
            Picker(selection: $section) {
              Text("Aucune").tag("")
              ForEach(chosenList.sections.sorted { $0.order < $1.order }) { s in
                Text(s.name).tag(s.id)
              }
            } label: {
              Label {
                Text("Section")
              } icon: {
                SymbolTile(systemName: "rectangle.split.1x2", color: .gray)
              }
            }
          }
        }

        SwiftUI.Section {
          Button("Ajouter et détailler…") { add(details: true) }
            .disabled(!canAdd)
        }
      }
      .navigationTitle("Nouveau rappel")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Ajouter") { add(details: false) }
            .fontWeight(.semibold)
            .disabled(!canAdd)
        }
      }
      .onChange(of: list) { _, _ in section = "" }
    }
    .tint(chosenList?.color.color ?? .accentColor)
    .onAppear {
      if list.isEmpty {
        list = listId.flatMap { id in store.list(id)?.id } ?? store.lists.first?.id ?? ""
      }
      focused = true
    }
  }

  private struct ChipInfo {
    var icon: String
    var text: String
  }

  /// What the parser understood: date, repeat, priority, tags and person (EntryPreview in QuickAdd.tsx).
  private func chips(_ entry: Core.QuickEntry) -> [ChipInfo] {
    var chips: [ChipInfo] = []
    if let due = entry.due { chips.append(ChipInfo(icon: "calendar", text: store.lookup.dueLabel(due))) }
    if let r = entry.repeat { chips.append(ChipInfo(icon: "repeat", text: ReminderChoices.repeatLabel(r))) }
    if entry.priority > 0, entry.priority < ReminderChoices.priorities.count {
      chips.append(ChipInfo(icon: "exclamationmark", text: ReminderChoices.priorities[entry.priority]))
    }
    for tag in entry.tags { chips.append(ChipInfo(icon: "tag", text: tag)) }
    if let name = entry.assignee, let member = store.lookup.member(named: name) {
      chips.append(ChipInfo(icon: "person", text: member.name))
    }
    return chips
  }

  private func add(details: Bool) {
    guard canAdd, let title = entry?.title, !list.isEmpty else { return }
    let defaults = EntryDefaults(listId: list, sectionId: section.isEmpty ? nil : section)
    guard let id = store.add(entry: text, defaults: defaults) else { return }
    dismiss()
    if details {
      // The details open once this sheet is gone: a sheet can't open over one that's closing.
      Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(450))
        router.selectedReminder = id
      }
    } else {
      toaster.show("Ajouté : \(title)")
    }
  }
}
