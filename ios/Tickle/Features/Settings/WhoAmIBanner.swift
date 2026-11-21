import SwiftUI

/// Asks once the space has members and this phone hasn't said who it is (`WhoAmIBanner` in People.tsx).
struct WhoAmIBanner: View {
  @Environment(Store.self) private var store
  @Environment(Push.self) private var push
  @State private var choosing = false

  var body: some View {
    if !store.space.members.isEmpty, currentMember(store, push) == nil {
      Button {
        choosing = true
      } label: {
        HStack(spacing: 12) {
          (Text("Qui es-tu ? ").bold() + Text("Choisis ton nom pour ne voir que tes rappels dans « Aujourd’hui »."))
            .font(.subheadline)
            .foregroundStyle(.primary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
          Text("Choisir")
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(.tint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
      .sheet(isPresented: $choosing) { WhoAmISheet() }
    }
  }
}
