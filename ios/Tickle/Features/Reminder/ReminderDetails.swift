import SwiftUI

/// Every detail of a reminder, edited in place: changes sync as they're made (ReminderSheet.tsx). A sheet on iPhone,
/// the inspector beside the list on iPad.
struct ReminderDetails: View {
  let reminderId: String

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster

  // Typed text is saved when the field is left or the details close, rather than on every key.
  @State private var title = ""
  @State private var notes = ""
  @State private var url = ""
  @State private var loaded = false
  @State private var tag = ""
  @State private var subtask = ""
  @State private var showDatePicker = false
  @State private var showTimePicker = false
  @State private var confirmDelete = false
  @State private var addingPerson = false
  @State private var personName = ""
  @FocusState private var focus: Field?

  private enum Field { case title, notes, url, tag, subtask }

  private var reminder: Reminder? { store.space.reminders[reminderId] }

  var body: some View {
    NavigationStack {
      Group {
        if let reminder {
          form(reminder)
        } else {
          ContentUnavailableView(
            "Rappel introuvable", systemImage: "questionmark.circle", description: Text("Ce rappel a été supprimé."))
        }
      }
      .navigationTitle("Détails")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("OK", action: close).fontWeight(.semibold)
        }
      }
    }
    .tint(reminder.flatMap { store.list($0.listId)?.color.color } ?? .accentColor)
    .onAppear(perform: load)
    .onDisappear(perform: leave)
    .onChange(of: focus) { old, _ in if old != nil { flush() } }
    .alert("Ajouter une personne", isPresented: $addingPerson) {
      TextField("Prénom", text: $personName)
      Button("Annuler", role: .cancel) { personName = "" }
      Button("Ajouter") {
        // A new person, assigned to this reminder.
        if let member = store.lookup.addMember(named: personName) {
          var patch = ReminderPatch()
          patch.assignee = .set(member.id)
          store.update(reminderId, patch)
        }
        personName = ""
      }
    }
  }

  // ---------- Form ----------

  @ViewBuilder private func form(_ reminder: Reminder) -> some View {
    let list = store.list(reminder.listId)
    let parent = reminder.parentId.flatMap { store.space.reminders[$0] }
    let children = store.lookup.subtasks(of: reminder.id)
    Form {
      if let parent {
        SwiftUI.Section {
          Button {
            open(parent.id)
          } label: {
            Label("Sous-tâche de « \(parent.title) »", systemImage: "chevron.left")
          }
        }
      }

      SwiftUI.Section {
        TextField("Titre", text: $title, axis: .vertical)
          .font(.title3.weight(.semibold))
          .focused($focus, equals: .title)
          .submitLabel(.done)
          .onChange(of: title) { _, value in
            // Return leaves the title, as in a single-line field.
            guard value.contains("\n") else { return }
            title = value.replacingOccurrences(of: "\n", with: "")
            focus = nil
          }
          .accessibilityLabel("Titre")
        TextField("Notes", text: $notes, axis: .vertical)
          .lineLimit(1...10)
          .focused($focus, equals: .notes)
        HStack {
          TextField("URL", text: $url)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focus, equals: .url)
            .onSubmit(flush)
          if let link = URL(string: url.trimmingCharacters(in: .whitespaces)), link.scheme?.hasPrefix("http") == true {
            Link(destination: link) { Image(systemName: "arrow.up.right.square") }
              .accessibilityLabel("Ouvrir le lien")
          }
        }
      }

      when(reminder)

      SwiftUI.Section {
        Picker(selection: priority(reminder)) {
          ForEach(ReminderChoices.priorities.indices, id: \.self) { value in
            Text(ReminderChoices.priorities[value]).tag(value)
          }
        } label: {
          Label { Text("Priorité") } icon: { SymbolTile(systemName: "exclamationmark", color: .red) }
        }
        Picker(selection: assignee(reminder)) {
          Text("Personne").tag("")
          ForEach(store.space.members) { m in Text(m.name).tag(m.id) }
          Text("Ajouter une personne…").tag(Self.addPerson)
        } label: {
          Label {
            Text("Assigné à")
          } icon: {
            SymbolTile(
              systemName: "person.fill",
              color: store.space.members.first { $0.id == reminder.assignee }?.color.color ?? .gray)
          }
        }
        if parent == nil {
          Picker(selection: listBinding(reminder)) {
            ForEach(store.lists) { l in Text("\(l.icon) \(l.name)").tag(l.id) }
          } label: {
            Label { Text("Liste") } icon: { SymbolTile(systemName: "list.bullet", color: list?.color.color ?? .blue) }
          }
          if let list, !list.sections.isEmpty {
            Picker(selection: sectionBinding(reminder)) {
              Text("Aucune").tag("")
              ForEach(list.sections.sorted { $0.order < $1.order }) { s in Text(s.name).tag(s.id) }
            } label: {
              Label { Text("Section") } icon: { SymbolTile(systemName: "rectangle.split.1x2", color: .gray) }
            }
          }
        }
      }

      tags(reminder)

      if parent == nil {
        SwiftUI.Section("Sous-tâches") {
          ForEach(children) { child in
            SubtaskRow(reminder: child, tint: list?.color.color ?? .accentColor) { open(child.id) }
          }
          HStack(spacing: 12) {
            Image(systemName: "plus.circle.fill").foregroundStyle(.secondary).font(.title3)
            TextField("Ajouter une sous-tâche", text: $subtask)
              .focused($focus, equals: .subtask)
              .submitLabel(.next)
              .onSubmit {
                if store.add(entry: subtask, defaults: EntryDefaults(listId: reminder.listId, parentId: reminder.id))
                  != nil
                {
                  subtask = ""
                }
                // Keep the field open for the next one.
                focus = .subtask
              }
          }
        }
      }

      SwiftUI.Section {
        Button("Supprimer le rappel", role: .destructive) { confirmDelete = true }
          .frame(maxWidth: .infinity)
      } footer: {
        info(reminder)
      }
      .confirmationDialog(
        children.isEmpty ? "Supprimer ce rappel ?" : "Supprimer avec ses \(children.count) sous-tâches ?",
        isPresented: $confirmDelete, titleVisibility: .visible
      ) {
        Button("Supprimer le rappel", role: .destructive) {
          close()
          store.lookup.delete(reminderId, toaster: toaster)
        }
      }
    }
    .environment(\.locale, Locale(identifier: "fr_FR"))
  }

  // ---------- Date, time, alert, repeat ----------

  @ViewBuilder private func when(_ reminder: Reminder) -> some View {
    let dates = store.lookup.household
    SwiftUI.Section {
      switchRow(
        icon: "calendar", color: .red, title: "Date",
        value: reminder.due.map { ReminderChoices.capitalized(store.core.dayLabel($0.date, today: store.now.date)) },
        isOn: Binding(
          get: { reminder.due != nil },
          set: { on in
            var patch = ReminderPatch()
            patch.due = on ? .set(Due(date: store.now.date)) : .clear
            store.update(reminderId, patch)
            // Turning it on goes straight to choosing, as on iOS.
            showDatePicker = on
            if !on { showTimePicker = false }
          }),
        expanded: $showDatePicker)
      if let due = reminder.due, showDatePicker {
        DatePicker(
          "Date",
          selection: Binding(
            get: { dates.date(due.date) },
            set: { value in
              var patch = ReminderPatch()
              patch.due = .set(Due(date: dates.iso(value), time: reminder.due?.time))
              store.update(reminderId, patch)
            }),
          displayedComponents: .date
        )
        .datePickerStyle(.graphical)
        .environment(\.timeZone, dates.calendar.timeZone)
        .environment(\.calendar, dates.calendar)
      }

      if let due = reminder.due {
        switchRow(
          icon: "clock.fill", color: .blue, title: "Heure",
          value: due.time.map { store.core.timeLabel($0) },
          isOn: Binding(
            get: { reminder.due?.time != nil },
            set: { on in
              var patch = ReminderPatch()
              patch.due = .set(Due(date: due.date, time: on ? "09:00" : nil))
              store.update(reminderId, patch)
              showTimePicker = on
            }),
          expanded: $showTimePicker)
        if let time = due.time, showTimePicker {
          DatePicker(
            "Heure",
            selection: Binding(
              get: { dates.date(due.date, time: time) },
              set: { value in
                var patch = ReminderPatch()
                patch.due = .set(Due(date: due.date, time: dates.time(value)))
                store.update(reminderId, patch)
              }),
            displayedComponents: .hourAndMinute
          )
          .datePickerStyle(.wheel)
          .labelsHidden()
          .frame(maxWidth: .infinity)
          .environment(\.timeZone, dates.calendar.timeZone)
          .environment(\.calendar, dates.calendar)
        }

        Picker(selection: early(reminder)) {
          ForEach(earlyOptions(reminder), id: \.value) { option in Text(option.label).tag(option.value) }
        } label: {
          Label { Text("Alerte") } icon: { SymbolTile(systemName: "bell.fill", color: .purple) }
        }

        Picker(selection: repeatBinding(reminder)) {
          ForEach(repeatOptions(reminder), id: \.value) { option in Text(option.label).tag(option.value) }
        } label: {
          Label { Text("Répéter") } icon: { SymbolTile(systemName: "repeat", color: .gray) }
        }

        if let current = reminder.repeat {
          Toggle(isOn: Binding(
            get: { current.until != nil },
            set: { on in
              var next = current
              next.until = on ? dates.addDays(due.date, 30) : nil
              var patch = ReminderPatch()
              patch.repeat = .set(next)
              store.update(reminderId, patch)
            })
          ) {
            Text("Fin de la répétition").padding(.leading, 40)
          }
          if let until = current.until {
            DatePicker(
              "Jusqu’au",
              selection: Binding(
                get: { dates.date(until) },
                set: { value in
                  var next = current
                  next.until = dates.iso(value)
                  var patch = ReminderPatch()
                  patch.repeat = .set(next)
                  store.update(reminderId, patch)
                }),
              in: dates.date(due.date)...,
              displayedComponents: .date
            )
            .padding(.leading, 40)
            .environment(\.timeZone, dates.calendar.timeZone)
            .environment(\.calendar, dates.calendar)
          }
        }
      }
    }
  }

  /// A date or time row as in Reminders: a switch turns it on, the value shows in the tint under the title, and a tap
  /// on it opens the picker.
  private func switchRow(
    icon: String, color: Color, title: String, value: String?, isOn: Binding<Bool>, expanded: Binding<Bool>
  ) -> some View {
    Toggle(isOn: isOn.animation(.snappy)) {
      Label {
        VStack(alignment: .leading, spacing: 1) {
          Text(title)
          if let value {
            Button(value) { withAnimation(.snappy) { expanded.wrappedValue.toggle() } }
              .font(.footnote)
              .buttonStyle(.borderless)
              .accessibilityLabel("Changer : \(title.lowercased()), \(value)")
          }
        }
      } icon: {
        SymbolTile(systemName: icon, color: color)
      }
    }
  }

  // ---------- Tags ----------

  @ViewBuilder private func tags(_ reminder: Reminder) -> some View {
    SwiftUI.Section {
      VStack(alignment: .leading, spacing: 10) {
        Label { Text("Tags") } icon: { SymbolTile(systemName: "tag.fill", color: .gray) }
        if !reminder.tags.isEmpty {
          ChipFlow(spacing: 6) {
            ForEach(reminder.tags, id: \.self) { t in
              Button {
                var patch = ReminderPatch()
                patch.tags = .set(reminder.tags.filter { $0 != t })
                store.update(reminderId, patch)
              } label: {
                PreviewChip(text: "#\(t) ✕", on: true)
              }
              .buttonStyle(.plain)
              .accessibilityLabel("Retirer le tag \(t)")
            }
          }
        }
        TextField("Ajouter un tag", text: $tag)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .focused($focus, equals: .tag)
          .submitLabel(.done)
          .onSubmit { addTag(reminder) }
          .onChange(of: tag) { _, value in
            // A space or a comma ends a tag, as in the web app.
            if value.hasSuffix(" ") || value.hasSuffix(",") { addTag(reminder) }
          }
      }
      .padding(.vertical, 4)
    }
  }

  private func addTag(_ reminder: Reminder) {
    let value = tag.trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ",")))
      .replacingOccurrences(of: "^#", with: "", options: .regularExpression)
      .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
    tag = ""
    guard !value.isEmpty, !reminder.tags.contains(value) else { return }
    var patch = ReminderPatch()
    patch.tags = .set(reminder.tags + [value])
    store.update(reminderId, patch)
  }

  // ---------- Info ----------

  @ViewBuilder private func info(_ reminder: Reminder) -> some View {
    let dates = store.lookup.household
    VStack(alignment: .leading, spacing: 2) {
      if let created = dates.instantLabel(reminder.createdAt) { Text("Créé le \(created)") }
      if reminder.completed, let at = reminder.completedAt.flatMap(dates.instantLabel) { Text("Terminé le \(at)") }
    }
    .padding(.top, 8)
  }

  // ---------- Bindings ----------

  private static let addPerson = "__add-person__"

  private func priority(_ reminder: Reminder) -> Binding<Int> {
    Binding(
      get: { reminder.priority },
      set: { value in
        var patch = ReminderPatch()
        patch.priority = .set(value)
        store.update(reminderId, patch)
      })
  }

  private func assignee(_ reminder: Reminder) -> Binding<String> {
    Binding(
      get: { reminder.assignee ?? "" },
      set: { value in
        if value == Self.addPerson { return addingPerson = true }
        var patch = ReminderPatch()
        patch.assignee = value.isEmpty ? .clear : .set(value)
        store.update(reminderId, patch)
      })
  }

  private func listBinding(_ reminder: Reminder) -> Binding<String> {
    Binding(
      get: { reminder.listId },
      set: { value in
        guard value != reminder.listId else { return }
        // Its subtasks follow it (the reducer moves them).
        var patch = ReminderPatch()
        patch.listId = .set(value)
        patch.sectionId = .clear
        store.update(reminderId, patch)
      })
  }

  private func sectionBinding(_ reminder: Reminder) -> Binding<String> {
    Binding(
      get: { reminder.sectionId ?? "" },
      set: { value in
        var patch = ReminderPatch()
        patch.sectionId = value.isEmpty ? .clear : .set(value)
        store.update(reminderId, patch)
      })
  }

  private func earlyOptions(_ reminder: Reminder) -> [(value: Int, label: String)] {
    let current = reminder.early ?? 0
    return ReminderChoices.early.contains { $0.value == current }
      ? ReminderChoices.early : ReminderChoices.early + [(current, "\(current) min avant")]
  }

  private func early(_ reminder: Reminder) -> Binding<Int> {
    Binding(
      get: { reminder.early ?? 0 },
      set: { value in
        var patch = ReminderPatch()
        patch.early = value == 0 ? .clear : .set(value)
        store.update(reminderId, patch)
      })
  }

  /// The menu's choices, plus the reminder's own repeat when it isn't one of them (set by an agent).
  private func repeatOptions(_ reminder: Reminder) -> [(value: String, label: String)] {
    let current = ReminderChoices.repeatValue(reminder.repeat)
    guard let r = reminder.repeat, !ReminderChoices.repeats.contains(where: { $0.value == current }) else {
      return ReminderChoices.repeats
    }
    return ReminderChoices.repeats + [(current, ReminderChoices.repeatLabel(r))]
  }

  private func repeatBinding(_ reminder: Reminder) -> Binding<String> {
    Binding(
      get: { ReminderChoices.repeatValue(reminder.repeat) },
      set: { value in
        var patch = ReminderPatch()
        patch.repeat = ReminderChoices.repeatFrom(value, previous: reminder.repeat).map { .set($0) } ?? .clear
        store.update(reminderId, patch)
      })
  }

  // ---------- Lifecycle ----------

  private func load() {
    guard !loaded, let reminder else { return }
    loaded = true
    title = reminder.title
    notes = reminder.notes ?? ""
    url = reminder.url ?? ""
  }

  /// Saves the typed text.
  private func flush() {
    guard let reminder else { return }
    var patch = ReminderPatch()
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty, trimmed != reminder.title { patch.title = .set(trimmed) }
    if notes != (reminder.notes ?? "") { patch.notes = notes.isEmpty ? .clear : .set(notes) }
    let link = url.trimmingCharacters(in: .whitespacesAndNewlines)
    if link != (reminder.url ?? "") { patch.url = link.isEmpty ? .clear : .set(link) }
    store.update(reminderId, patch)
  }

  /// Leaving the details: save, and drop a reminder that never got a title.
  private func leave() {
    flush()
    guard let reminder, reminder.title.trimmingCharacters(in: .whitespaces).isEmpty,
      title.trimmingCharacters(in: .whitespaces).isEmpty
    else { return }
    store.dispatch(.deleteReminder(id: reminderId))
  }

  private func close() {
    flush()
    router.selectedReminder = nil
  }

  private func open(_ id: String) {
    flush()
    router.selectedReminder = id
  }
}

/// A subtask in the details: its checkbox and title; a tap opens it.
private struct SubtaskRow: View {
  @Environment(Store.self) private var store
  let reminder: Reminder
  let tint: Color
  let open: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button {
        store.setCompleted(reminder.id, !reminder.completed)
      } label: {
        Image(systemName: reminder.completed ? "largecircle.fill.circle" : "circle")
          .font(.title3)
          .foregroundStyle(reminder.completed ? tint : Color.secondary.opacity(0.6))
      }
      .buttonStyle(.borderless)
      .accessibilityLabel(reminder.completed ? "Rouvrir \(reminder.title)" : "Terminer \(reminder.title)")
      Button(action: open) {
        HStack {
          Text(reminder.title).foregroundStyle(reminder.completed ? .secondary : .primary)
          Spacer()
          Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
  }
}
