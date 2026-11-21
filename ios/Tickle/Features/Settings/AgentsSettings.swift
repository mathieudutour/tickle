import SwiftUI

// Connects AI agents that run outside the app, like Hermes, through the space's remote MCP endpoint
// (src/components/Agents.tsx). Each agent gets its own token, shown once, which can be revoked without touching the
// sharing link.

private struct Agent: Decodable, Identifiable {
  var id: String
  var label: String
  var createdAt: String
  var lastUsedAt: String?

  var lastUsed: String {
    guard let lastUsedAt, let date = parseISODate(lastUsedAt) else { return "jamais utilisé" }
    let days = Int(Date().timeIntervalSince(date) / 86_400)
    return days < 1 ? "utilisé aujourd’hui" : days == 1 ? "utilisé hier" : "utilisé il y a \(days) jours"
  }
}

/// A server timestamp (`toISOString()`, with milliseconds).
private func parseISODate(_ text: String) -> Date? {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
}

/// The « Agents IA » rows in Réglages.
struct AgentsSection: View {
  let spaceKey: String
  @Environment(Store.self) private var store
  @Environment(Toaster.self) private var toaster
  @State private var agents: [Agent]?
  @State private var label = "Hermes"
  @State private var adding = false
  @State private var created: (label: String, token: String)?
  @State private var revoking: Agent?

  private var base: URL { store.server.appending(path: "api/spaces/\(spaceKey)/agents") }
  private var endpoint: String { store.server.appending(path: "api/mcp").absoluteString }

  var body: some View {
    Group {
      if let created {
        createdRow(created)
      }
      ForEach(agents ?? []) { agent in
        HStack(spacing: 12) {
          Text("🤖").font(.title2)
          VStack(alignment: .leading, spacing: 2) {
            Text(agent.label)
            Text(agent.lastUsed).font(.footnote).foregroundStyle(.secondary)
          }
          Spacer()
          Button("Révoquer", role: .destructive) { revoking = agent }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
      }
      if adding {
        HStack {
          TextField("Nom de l’agent", text: $label)
            .submitLabel(.done)
            .onSubmit { Task { await create() } }
          Button("Créer l’accès") { Task { await create() } }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .disabled(label.trimmingCharacters(in: .whitespaces).isEmpty)
        }
      } else {
        Button {
          adding = true
        } label: {
          Label("Connecter un agent", systemImage: "cpu")
        }
      }
    }
    .task(id: spaceKey) { await load() }
    .confirmationDialog(
      revoking.map { "Révoquer l’accès de \($0.label) ?" } ?? "",
      isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
      titleVisibility: .visible,
      presenting: revoking
    ) { agent in
      Button("Révoquer", role: .destructive) { Task { await revoke(agent) } }
    } message: { _ in
      Text("L’agent ne pourra plus utiliser tes listes.")
    }
  }

  private func createdRow(_ created: (label: String, token: String)) -> some View {
    let config = """
      mcp_servers:
        tickle:
          url: "\(endpoint)"
          headers:
            Authorization: "Bearer \(created.token)"
      """
    return VStack(alignment: .leading, spacing: 10) {
      (Text(created.label).bold() + Text(" est prêt. Copie sa configuration maintenant : le jeton ne sera plus affiché."))
      Text(config)
        .font(.system(.caption, design: .monospaced))
        .textSelection(.enabled)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
      HStack {
        Button("Copier la configuration") { copyToClipboard(config, toaster) }
          .buttonStyle(.borderedProminent)
        Button("Copier le jeton") { copyToClipboard(created.token, toaster) }
          .buttonStyle(.bordered)
      }
      .controlSize(.small)
      Text("Pour Hermes, ajoute ces lignes à `~/.hermes/config.yaml`. Pour un autre agent : serveur MCP « HTTP », adresse `\(endpoint)`, en-tête `Authorization: Bearer` suivi du jeton.")
        .font(.footnote)
        .foregroundStyle(.secondary)
      Button("C’est fait") { self.created = nil }
        .font(.subheadline.weight(.semibold))
    }
    .buttonStyle(.borderless)
    .padding(.vertical, 4)
  }

  private func load() async {
    guard let (data, response) = try? await URLSession.shared.data(from: base),
      (response as? HTTPURLResponse)?.statusCode == 200
    else { return }
    // Offline: the list shows again once back online.
    agents = try? JSONDecoder().decode([Agent].self, from: data)
  }

  private func create() async {
    let name = label.trimmingCharacters(in: .whitespaces)
    guard !name.isEmpty else { return }
    var request = URLRequest(url: base)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["label": name])
    struct Created: Decodable { var label: String; var token: String }
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse)?.statusCode == 201,
      let agent = try? JSONDecoder().decode(Created.self, from: data)
    else {
      return toaster.show("Impossible de connecter l’agent : vérifie ta connexion")
    }
    created = (agent.label, agent.token)
    adding = false
    await load()
  }

  private func revoke(_ agent: Agent) async {
    var request = URLRequest(url: base.appending(path: agent.id))
    request.httpMethod = "DELETE"
    guard let (_, response) = try? await URLSession.shared.data(for: request),
      (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) == true
    else {
      return toaster.show("Impossible de révoquer : vérifie ta connexion")
    }
    revoking = nil
    toaster.show("Accès révoqué")
    await load()
  }
}
