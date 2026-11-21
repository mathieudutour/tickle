import SwiftUI

/// Asked when an invitation link opens the app (`JoinSheet` in Sharing.tsx).
struct JoinSheet: View {
  let joinKey: String
  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  /// Optional: the root view presents this sheet, and may do so outside the toaster's environment.
  @Environment(Toaster.self) private var toaster: Toaster?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 16) {
          Art(name: .sharing, size: 180)
          Text("Tu vas partager les listes et les rappels de la personne qui t’a invité·e, en direct.")
            .font(.body)
            .multilineTextAlignment(.center)
          Text(replacedText(store))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          VStack(spacing: 8) {
            Button {
              store.join(joinKey)
              router.joinKey = nil
              toaster?.show("Bienvenue ! Les listes partagées arrivent…")
            } label: {
              Text("Rejoindre").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button {
              router.joinKey = nil
            } label: {
              Text("Pas maintenant").frame(maxWidth: .infinity)
            }
            .controlSize(.large)
          }
          .padding(.top, 8)
        }
        .padding(24)
      }
      .navigationTitle("Rejoindre des listes partagées")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { router.joinKey = nil } }
      }
    }
    .presentationDetents([.large])
    .onAppear {
      // The link of the space this phone already shares: nothing to do.
      if joinKey == store.key {
        router.joinKey = nil
        toaster?.show("Tu partages déjà ces listes")
      }
    }
  }
}

/// Joins from a pasted invitation link (`JoinWithLinkSheet` in Sharing.tsx): for links received somewhere they
/// don't open the app.
struct JoinWithLinkSheet: View {
  @Environment(Store.self) private var store
  @Environment(Toaster.self) private var toaster
  @Environment(\.dismiss) private var dismiss
  @State private var link = ""
  @FocusState private var focused: Bool

  var body: some View {
    let key = inviteKey(from: link)
    NavigationStack {
      Form {
        SwiftUI.Section {
          TextField("Colle le lien d’invitation", text: $link)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .focused($focused)
            .submitLabel(.join)
            .onSubmit(join)
            .accessibilityLabel("Lien d’invitation")
          PasteButton(payloadType: String.self) { strings in
            if let text = strings.first { link = text }
          }
          .labelStyle(.titleAndIcon)
        } footer: {
          Text(replacedText(store))
        }
      }
      .navigationTitle("Rejoindre avec un lien")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Rejoindre", action: join).disabled(key == nil)
        }
      }
      .onAppear { focused = true }
    }
    .presentationDetents([.medium])
  }

  private func join() {
    guard let key = inviteKey(from: link) else { return }
    dismiss()
    if key == store.key { return toaster.show("Tu partages déjà ces listes") }
    store.join(key)
    toaster.show("Bienvenue ! Les listes partagées arrivent…")
  }
}
