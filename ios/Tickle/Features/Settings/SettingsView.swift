import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// Réglages (src/views/Settings.tsx): alerts, people, sharing, agents, and the keyboard shortcuts on iPad.
struct SettingsView: View {
  @Environment(Store.self) private var store

  var body: some View {
    Form {
      SwiftUI.Section {
        AlertsSection()
      } header: {
        SettingsSectionHeader(title: "Alertes", art: .alerts)
      } footer: {
        TimeZoneFooter()
      }

      SwiftUI.Section {
        PeopleSection()
      } header: {
        SettingsSectionHeader(title: "Personnes")
      } footer: {
        Text("Assigne un rappel à quelqu’un : il n’apparaît que dans son « Aujourd’hui », et seule cette personne reçoit l’alerte.")
      }

      SharingSection()

      SwiftUI.Section {
        if let key = store.key {
          AgentsSection(spaceKey: key)
        } else {
          Text("Disponible dès que l’appareil est en ligne.").foregroundStyle(.secondary)
        }
      } header: {
        SettingsSectionHeader(title: "Agents IA", art: .agents)
      } footer: {
        Text("Un agent IA qui tourne hors de l’app (comme Hermes) peut gérer tes rappels pour toi : en ajouter, les cocher, les reprogrammer. Chaque agent a son propre accès, que tu peux révoquer.")
      }

      if UIDevice.current.userInterfaceIdiom == .pad {
        ShortcutsSection()
      }

      AboutSection()
    }
    .navigationTitle("Réglages")
  }
}

// ---------- Alertes ----------

private struct AlertsSection: View {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @Environment(Toaster.self) private var toaster
  @Environment(\.openURL) private var openURL
  @State private var busy = false

  var body: some View {
    Text(text).foregroundStyle(.secondary)
    switch push.state {
    case .off, .unknown:
      Button("Activer les alertes") {
        busy = true
        Task {
          let enabled = await push.enable()
          busy = false
          toaster.show(enabled ? "Alertes activées sur cet appareil" : "Alertes non activées")
        }
      }
      .disabled(busy || store.key == nil)
    case .denied:
      Button("Ouvrir les réglages de l’iPhone") { openNotificationSettings() }
    case .on:
      MorningSummaryRows()
      Button("Gérer les notifications") { openNotificationSettings() }
    }
  }

  private var text: String {
    switch push.state {
    case .off, .unknown:
      "Reçois une alerte à l’heure de chaque rappel, sur cet appareil, même quand Tickle est fermé."
    case .denied:
      "Les notifications sont bloquées pour Tickle : autorise-les dans les réglages de l’iPhone."
    case .on:
      "Cet appareil reçoit une alerte à l’heure de chaque rappel."
    }
  }

  private func openNotificationSettings() {
    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
  }
}

/// Opt-in, per phone: « 3 rappels aujourd’hui, dont 1 en retard » each morning, at its time.
private struct MorningSummaryRows: View {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push

  static let times = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"]

  var body: some View {
    Toggle(isOn: Binding(get: { push.summaryAt != nil }, set: { push.setSummaryAt($0 ? "08:00" : nil) })) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Résumé du matin")
        Text("Les rappels du jour et ceux en retard").font(.footnote).foregroundStyle(.secondary)
      }
    }
    if let at = push.summaryAt {
      Picker("Heure", selection: Binding(get: { at }, set: { push.setSummaryAt($0) })) {
        ForEach(Self.times.contains(at) ? Self.times : [at] + Self.times, id: \.self) { time in
          Text(store.core.timeLabel(time)).tag(time)
        }
      }
    }
  }
}

/// Alerts follow the household's time zone, not the phone's.
private struct TimeZoneFooter: View {
  @Environment(Store.self) private var store

  var body: some View {
    let zone = store.space.timeZone
    let device = TimeZone.current.identifier
    VStack(alignment: .leading, spacing: 6) {
      Text("Fuseau horaire des alertes : **\(zone.replacingOccurrences(of: "_", with: " "))**")
      if zone != device {
        Button("Utiliser \(device.replacingOccurrences(of: "_", with: " "))") {
          store.dispatch(.setTimeZone(device))
        }
        .font(.footnote.weight(.semibold))
      }
    }
  }
}

// ---------- Partage ----------

private struct SharingSection: View {
  @Environment(Store.self) private var store
  @Environment(Toaster.self) private var toaster
  @State private var joining = false
  @State private var confirmLeave = false

  var body: some View {
    SwiftUI.Section {
      Label {
        Text(syncStatusText(store))
      } icon: {
        Circle().fill(statusColor).frame(width: 9, height: 9)
      }
      .accessibilityElement(children: .combine)
      if let link = store.inviteLink {
        HStack(alignment: .center, spacing: 16) {
          QRCode(text: link.absoluteString)
            .frame(width: 112, height: 112)
            .accessibilityLabel("QR code du lien d’invitation")
          Text("Pour partager toutes tes listes avec quelqu’un, fais-lui scanner ce code ou envoie-lui le lien. Vous verrez et cocherez les mêmes rappels, en direct.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        ShareLink(item: link, message: Text("Rejoins mes listes sur Tickle :")) {
          Label("Envoyer le lien", systemImage: "square.and.arrow.up")
        }
        Button {
          copyToClipboard(link.absoluteString, toaster)
        } label: {
          Label("Copier le lien", systemImage: "doc.on.doc")
        }
      } else {
        Text("Le lien de partage apparaît dès que l’appareil est en ligne.").foregroundStyle(.secondary)
      }
      Button {
        joining = true
      } label: {
        Label("Rejoindre avec un lien", systemImage: "link")
      }
      if store.key != nil {
        Button("Arrêter de partager sur cet appareil", role: .destructive) { confirmLeave = true }
      }
    } header: {
      SettingsSectionHeader(title: "Partage", art: .sharing)
    } footer: {
      Text("Toute personne qui a ce lien voit et modifie tes listes : ne l’envoie qu’à qui tu veux.")
    }
    .sheet(isPresented: $joining) { JoinWithLinkSheet() }
    .confirmationDialog("Arrêter de partager sur cet appareil ?", isPresented: $confirmLeave, titleVisibility: .visible) {
      Button("Arrêter de partager", role: .destructive) {
        store.leave()
        toaster.show("Tu as quitté l’espace partagé. Cet appareil garde une copie de tes listes.")
      }
    } message: {
      Text("Les autres ne verront plus tes changements. Cet appareil garde une copie de tes listes.")
    }
  }

  private var statusColor: Color {
    guard store.key != nil, store.joined else { return .orange }
    switch store.connection {
    case .online: return .green
    case .connecting: return .orange
    case .offline: return .gray
    }
  }
}

/// The invitation link as a QR code, drawn crisp at any size.
private struct QRCode: View {
  let text: String

  var body: some View {
    if let image = Self.image(text) {
      Image(uiImage: image)
        .interpolation(.none)
        .resizable()
        .scaledToFit()
        .padding(6)
        .background(.white, in: RoundedRectangle(cornerRadius: 8))
    }
  }

  static func image(_ text: String) -> UIImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(text.utf8)
    filter.correctionLevel = "M"
    guard let output = filter.outputImage,
      let cgImage = CIContext().createCGImage(output, from: output.extent)
    else { return nil }
    return UIImage(cgImage: cgImage)
  }
}

// ---------- Raccourcis clavier ----------

private struct ShortcutsSection: View {
  static let shortcuts: [(String, String)] = [
    ("N", "Nouveau rappel"),
    ("↑ ↓", "Passer d’un rappel à l’autre"),
    ("Espace", "Cocher ou décocher"),
    ("⌫", "Supprimer (avec « Annuler »)"),
    ("⌥↑ ⌥↓", "Déplacer dans la liste"),
    ("Échap", "Fermer les détails"),
  ]

  var body: some View {
    SwiftUI.Section {
      ForEach(Self.shortcuts, id: \.0) { keys, what in
        HStack {
          Text(what)
          Spacer()
          Text(keys)
            .font(.callout.monospaced())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 6))
        }
      }
    } header: {
      SettingsSectionHeader(title: "Raccourcis clavier")
    }
  }
}

// ---------- À propos ----------

private struct AboutSection: View {
  var body: some View {
    SwiftUI.Section {
      LabeledContent("Version", value: version)
    } header: {
      SettingsSectionHeader(title: "À propos")
    } footer: {
      Text("Tickle : tes rappels et tes listes, partagés en direct, avec des alertes à l’heure.")
    }
  }

  private var version: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? "?"
    let build = info?["CFBundleVersion"] as? String ?? "?"
    return "\(short) (\(build))"
  }
}
