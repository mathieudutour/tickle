import SwiftUI

/// Creates a list (no `listId`) or edits one: name, colour, icon and sections, and deletes it (ListEditor.tsx).
struct ListEditor: View {
  /// nil creates a new list.
  let listId: String?
  /// Called with the new list's id, to open it.
  var onCreated: ((String) -> Void)? = nil

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster
  @Environment(\.dismiss) private var dismiss

  @State private var name = ""
  @State private var color: ListColor = .blue
  @State private var icon = "📋"
  @State private var newSection = ""
  @State private var confirmDelete = false
  @State private var loaded = false
  @FocusState private var nameFocused: Bool

  static let icons =
    "📋 ✅ 🛒 🏠 💼 🎓 💊 🏃 🍽️ 🎁 ✈️ 🚗 💡 📚 🎵 🎮 🐶 🌱 🧹 🔧 💰 ❤️ ⭐ 🎉 👶 📞 🖥️ 📦 🧺 🏖️"
    .split(separator: " ").map(String.init)

  private var existing: TickleList? { listId.flatMap(store.list) }
  private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

  var body: some View {
    NavigationStack {
      Form {
        SwiftUI.Section {
          VStack(spacing: 16) {
            Text(icon)
              .font(.system(size: 44))
              .frame(width: 84, height: 84)
              .background(color.color.opacity(0.24), in: Circle())
              .accessibilityHidden(true)
            TextField("Nom de la liste", text: $name)
              .font(.title2.weight(.bold))
              .multilineTextAlignment(.center)
              .foregroundStyle(color.color)
              .padding(.vertical, 10)
              .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
              .focused($nameFocused)
              .submitLabel(.done)
              .onSubmit(save)
              .onChange(of: name) { _, value in if value.count > 60 { name = String(value.prefix(60)) } }
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
        }

        SwiftUI.Section {
          LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
            ForEach(ListColor.allCases, id: \.self) { c in
              Button {
                color = c
              } label: {
                Circle()
                  .fill(c.color)
                  .frame(width: 36, height: 36)
                  .overlay(Circle().strokeBorder(Color(.systemBackground), lineWidth: c == color ? 3 : 0).padding(3))
                  .overlay(Circle().strokeBorder(c == color ? c.color : .clear, lineWidth: 2))
              }
              .buttonStyle(.plain)
              .accessibilityLabel(c.name)
              .accessibilityAddTraits(c == color ? .isSelected : [])
            }
          }
          .padding(.vertical, 6)
        }

        SwiftUI.Section {
          LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
            ForEach(Self.icons, id: \.self) { i in
              Button {
                icon = i
              } label: {
                Text(i)
                  .font(.system(size: 22))
                  .frame(width: 40, height: 40)
                  .background(i == icon ? Color(.tertiarySystemFill) : .clear, in: Circle())
              }
              .buttonStyle(.plain)
              .accessibilityAddTraits(i == icon ? .isSelected : [])
            }
          }
          .padding(.vertical, 6)
          LabeledContent("Autre emoji") {
            TextField("😀", text: Binding(get: { Self.icons.contains(icon) ? "" : icon }, set: { value in
              if let first = value.trimmingCharacters(in: .whitespaces).first { icon = String(first) }
            }))
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 80)
          }
        }

        if let existing {
          SwiftUI.Section {
            ForEach(existing.sections) { section in
              SectionNameField(listId: existing.id, section: section)
            }
            .onDelete { offsets in
              for index in offsets {
                store.dispatch(.deleteSection(listId: existing.id, id: existing.sections[index].id))
              }
            }
            TextField("Nouvelle section", text: $newSection)
              .submitLabel(.done)
              .onSubmit {
                let value = newSection.trimmingCharacters(in: .whitespaces)
                guard !value.isEmpty else { return }
                store.dispatch(
                  .addSection(
                    listId: existing.id,
                    section: ListSection(id: newId(), name: value, order: Double(existing.sections.count))))
                newSection = ""
              }
          } header: {
            Text("Sections")
          } footer: {
            Text("Les rappels d’une section supprimée restent dans la liste.")
          }

          if store.space.lists.count > 1 {
            SwiftUI.Section {
              Button("Supprimer la liste", role: .destructive) { confirmDelete = true }
                .frame(maxWidth: .infinity)
            }
          }
        }
      }
      .navigationTitle(existing == nil ? "Nouvelle liste" : "Modifier la liste")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(existing == nil ? "Créer" : "OK", action: save)
            .fontWeight(.semibold)
            .disabled(trimmed.isEmpty)
        }
      }
      .confirmationDialog(deleteTitle, isPresented: $confirmDelete, titleVisibility: .visible) {
        Button("Supprimer la liste", role: .destructive, action: delete)
      }
    }
    .tint(color.color)
    .onAppear {
      guard !loaded else { return }
      loaded = true
      if let existing {
        name = existing.name
        color = existing.color
        icon = existing.icon
      } else {
        nameFocused = true
      }
    }
  }

  private var deleteTitle: String {
    guard let existing else { return "" }
    let count = store.space.reminders.values.filter { $0.listId == existing.id }.count
    return count > 0 ? "Supprimer la liste et ses \(count) rappel\(count > 1 ? "s" : "") ?" : "Supprimer la liste ?"
  }

  private func save() {
    guard !trimmed.isEmpty else { return }
    if let existing {
      store.dispatch(.updateList(id: existing.id, name: trimmed, color: color, icon: icon))
    } else {
      let id = newId()
      let order = (store.space.lists.map(\.order).max() ?? -1) + 1
      store.dispatch(.addList(TickleList(id: id, name: trimmed, color: color, icon: icon, order: order, sections: [])))
      onCreated?(id)
    }
    dismiss()
  }

  private func delete() {
    guard let existing, store.space.lists.count > 1 else { return }
    store.dispatch(.deleteList(id: existing.id))
    router.path.removeAll { $0 == .list(existing.id) }
    if router.selection == .list(existing.id) { router.selection = .today }
    toaster.show("Liste supprimée : \(existing.name)")
    dismiss()
  }
}

/// A section's name, renamed when the field is left.
private struct SectionNameField: View {
  let listId: String
  let section: ListSection
  @Environment(Store.self) private var store
  @State private var name = ""
  @FocusState private var focused: Bool

  var body: some View {
    TextField("Nom de la section", text: $name)
      .focused($focused)
      .onAppear { name = section.name }
      .onSubmit(rename)
      .onChange(of: focused) { _, focused in if !focused { rename() } }
      .accessibilityLabel("Nom de la section \(section.name)")
  }

  private func rename() {
    let value = name.trimmingCharacters(in: .whitespaces)
    guard !value.isEmpty, value != section.name else { return }
    store.dispatch(.renameSection(listId: listId, id: section.id, name: value))
  }
}
