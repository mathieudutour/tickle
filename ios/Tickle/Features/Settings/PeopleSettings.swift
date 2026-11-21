import SwiftUI

// Who's in the space, and who this phone is (src/components/People.tsx). There are no accounts: each phone remembers
// its member (Push.meId), and only that member's reminders, and unassigned ones, show in « Aujourd’hui ».

/// The « Personnes » rows in Réglages.
struct PeopleSection: View {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @Environment(Toaster.self) private var toaster
  @State private var adding = false
  @State private var removing: Member?

  var body: some View {
    let me = currentMember(store, push)
    ForEach(store.space.members) { member in
      PersonRow(member: member, isMe: me?.id == member.id) { removing = member }
    }
    Button {
      adding = true
    } label: {
      Label("Ajouter une personne", systemImage: "person.badge.plus")
    }
    .sheet(isPresented: $adding) { PersonSheet() }
    .confirmationDialog(
      removing.map { "Retirer \($0.name) ?" } ?? "",
      isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      titleVisibility: .visible,
      presenting: removing
    ) { member in
      Button("Retirer", role: .destructive) {
        store.dispatch(.removeMember(id: member.id))
        if push.meId == member.id { push.setMe(nil) }
        toaster.show("\(member.name) retiré·e : ses rappels ne sont plus assignés")
      }
    } message: { _ in
      Text("Ses rappels ne seront plus assignés à personne.")
    }
  }
}

private struct PersonRow: View {
  let member: Member
  let isMe: Bool
  let remove: () -> Void
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @State private var name = ""
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 12) {
      PeopleAvatar(member: member, size: 34)
      TextField("Prénom", text: $name)
        .focused($focused)
        .submitLabel(.done)
        .onSubmit(rename)
        .accessibilityLabel("Nom de \(member.name)")
      if isMe {
        Text("Moi").font(.subheadline.weight(.semibold)).foregroundStyle(.tint)
      } else {
        Button("C’est moi") { push.setMe(member.id) }
          .buttonStyle(.bordered)
          .controlSize(.small)
      }
    }
    .onAppear { name = member.name }
    .onChange(of: member.name) { _, new in if !focused { name = new } }
    .onChange(of: focused) { _, isFocused in if !isFocused { rename() } }
    .swipeActions {
      Button("Retirer", role: .destructive, action: remove)
    }
    .contextMenu {
      Button("Retirer \(member.name)", systemImage: "person.badge.minus", role: .destructive, action: remove)
    }
  }

  private func rename() {
    let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
    if trimmed.isEmpty {
      name = member.name
    } else if trimmed != member.name {
      store.dispatch(.renameMember(id: member.id, name: trimmed))
    }
  }
}

/// Adds someone to the space; « C’est moi » also makes them this phone's member.
struct PersonSheet: View {
  /// Whether « C’est moi, sur cet appareil » starts on; by default, when this phone hasn't said who it is.
  var isMe: Bool?
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var me = false
  @FocusState private var focused: Bool

  var body: some View {
    NavigationStack {
      Form {
        SwiftUI.Section {
          TextField("Prénom", text: $name)
            .textContentType(.givenName)
            .focused($focused)
            .submitLabel(.done)
            .onSubmit(add)
          Toggle("C’est moi, sur cet appareil", isOn: $me)
        } footer: {
          Text("Les rappels assignés à quelqu’un d’autre n’apparaissent pas dans ton « Aujourd’hui », et leurs alertes ne sonnent que chez cette personne.")
        }
      }
      .navigationTitle("Ajouter une personne")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Ajouter", action: add).disabled(trimmed.isEmpty)
        }
      }
      .onAppear {
        me = isMe ?? (currentMember(store, push) == nil)
        focused = true
      }
    }
    .presentationDetents([.medium])
  }

  private var trimmed: String { String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)) }

  private func add() {
    guard !trimmed.isEmpty else { return }
    // Each person gets a colour nobody has yet, so avatars tell people apart.
    let used = Set(store.space.members.map(\.color))
    let colors = ListColor.allCases
    let color = colors.first { $0 != .gray && !used.contains($0) } ?? colors[store.space.members.count % colors.count]
    let member = Member(id: newId(), name: trimmed, color: color)
    store.dispatch(.addMember(member))
    if me { push.setMe(member.id) }
    dismiss()
  }
}

/// « Qui es-tu ? »: which member this phone belongs to.
struct WhoAmISheet: View {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @Environment(\.dismiss) private var dismiss
  @State private var adding = false

  var body: some View {
    NavigationStack {
      List {
        SwiftUI.Section {
          ForEach(store.space.members) { member in
            Button {
              push.setMe(member.id)
              dismiss()
            } label: {
              HStack(spacing: 12) {
                PeopleAvatar(member: member, size: 36)
                Text(member.name).foregroundStyle(.primary)
                Spacer()
                if push.meId == member.id {
                  Image(systemName: "checkmark").foregroundStyle(.tint).fontWeight(.semibold)
                }
              }
            }
          }
          Button {
            adding = true
          } label: {
            HStack(spacing: 12) {
              Image(systemName: "plus")
                .frame(width: 36, height: 36)
                .background(Color(.tertiarySystemFill), in: Circle())
              Text("Quelqu’un d’autre…")
            }
          }
        } footer: {
          Text("Sur cet appareil, « Aujourd’hui » ne montrera que tes rappels et ceux de personne.")
        }
      }
      .navigationTitle("Qui es-tu ?")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
      }
      .sheet(isPresented: $adding, onDismiss: { if push.meId != nil, currentMember(store, push) != nil { dismiss() } }) {
        PersonSheet(isMe: true)
      }
    }
    .presentationDetents([.medium, .large])
  }
}
