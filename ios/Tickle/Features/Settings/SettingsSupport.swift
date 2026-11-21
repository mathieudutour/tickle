import SwiftUI
import UIKit

// Small pieces the settings, sharing and joining screens share (src/components/Sharing.tsx and People.tsx).

/// How this phone stands with the server, as the web app words it (`statusLabel` in Sharing.tsx).
@MainActor
func syncStatusText(_ store: Store) -> String {
  guard store.key != nil else { return "Sur cet appareil seulement · connexion…" }
  guard store.joined else { return "Connexion à l’espace partagé…" }
  switch store.connection {
  case .online: return store.pending > 0 ? "Envoi…" : "Synchronisé"
  case .connecting: return "Connexion…"
  case .offline:
    let n = store.pending
    return n > 0 ? "Hors ligne · \(n) changement\(n > 1 ? "s" : "") en attente" : "Hors ligne"
  }
}

/// The space key in an invitation link (…/#rejoindre=KEY), or a key on its own (`keyFromLink` in Sharing.tsx).
func inviteKey(from text: String) -> String? {
  let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
  let key: String
  if let match = value.firstMatch(of: /rejoindre=([\w-]+)/) {
    key = String(match.1)
  } else {
    key = value
  }
  return key.wholeMatch(of: /[\w-]{20,}/) != nil ? key : nil
}

/// What joining does to this phone's own reminders.
@MainActor
func replacedText(_ store: Store) -> String {
  let count = store.space.reminders.values.filter { !$0.completed }.count
  return count > 0
    ? "Les \(count) rappel\(count > 1 ? "s" : "") enregistré\(count > 1 ? "s" : "") sur cet appareil seront remplacés par les listes partagées."
    : "Ce qui est enregistré sur cet appareil sera remplacé par les listes partagées."
}

/// This phone's member, if it said who it is and that member still exists (`useMe` in src/lib/me.ts).
@MainActor
func currentMember(_ store: Store, _ push: Push) -> Member? {
  push.meId.flatMap { id in store.space.members.first { $0.id == id } }
}

/// Copies to the clipboard and says so, as the web app's `copy`.
@MainActor
func copyToClipboard(_ text: String, _ toaster: Toaster) {
  UIPasteboard.general.string = text
  toaster.show("Copié")
}

/// A member's initial on their colour, as Reminders shows who a reminder is assigned to.
struct PeopleAvatar: View {
  let member: Member
  var size: CGFloat = 32

  var body: some View {
    Text(member.name.first.map { String($0).uppercased() } ?? "?")
      .font(.system(size: size * 0.45, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: size, height: size)
      .background(member.color.color, in: Circle())
      .accessibilityLabel(member.name)
  }
}

/// A settings section's title with its illustration, like the web app's cards.
struct SettingsSectionHeader: View {
  let title: String
  var art: ArtName?

  var body: some View {
    HStack(alignment: .bottom) {
      Text(title)
        .font(.title3.bold())
        .foregroundStyle(Color.primary)
        .textCase(nil)
      Spacer()
      if let art { Art(name: art, size: 64) }
    }
    .padding(.bottom, 4)
  }
}
