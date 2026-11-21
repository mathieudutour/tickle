import SwiftUI

/// A reminder edited in place, as in Reminders on an iPhone (src/components/InlineEditor.tsx): its title and a note,
/// and chips for the date (then its time, alert and repeat), tags and who it's for. Typed text is saved when editing
/// ends: Return, a tap elsewhere, or (i) for all the details.
struct InlineEditor: View {
  let reminder: Reminder
  let tint: Color
  var continueWith: ContinueDefaults?

  @Environment(Store.self) private var store
  @Environment(Router.self) private var router
  @Environment(Toaster.self) private var toaster

  private enum Field: Hashable { case title, notes }
  @FocusState private var focus: Field?
  @State private var title: String
  @State private var notes: String
  @State private var choosingDate = false
  @State private var choosingTime = false
  @State private var newTag = false
  @State private var tagText = ""
  @State private var leaving: Task<Void, Never>?

  init(reminder: Reminder, tint: Color, continueWith: ContinueDefaults?) {
    self.reminder = reminder
    self.tint = tint
    self.continueWith = continueWith
    _title = State(initialValue: reminder.title)
    _notes = State(initialValue: reminder.notes ?? "")
  }

  private var actions: ReminderActions { ReminderActions(store: store, toaster: toaster) }
  private var zone: String { store.space.timeZone }
  /// While one of its own pickers is open, the editor stays.
  private var picking: Bool { choosingDate || choosingTime || newTag }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      TextField("Titre", text: $title)
        .focused($focus, equals: .title)
        .submitLabel(continueWith == nil ? .done : .next)
        .onSubmit(submit)
        .accessibilityLabel("Titre")
      TextField("Ajouter une note", text: $notes, axis: .vertical)
        .focused($focus, equals: .notes)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .lineLimit(1...6)
      tools
    }
    .onAppear {
      // In the same tap, so the keyboard comes up.
      focus = .title
    }
    .onChange(of: focus) { _, focus in
      leaving?.cancel()
      guard focus == nil else { return }
      // A tap elsewhere ends editing; menus and pickers of the editor itself don't.
      leaving = Task {
        try? await Task.sleep(for: .milliseconds(400))
        guard !Task.isCancelled, self.focus == nil, !picking, router.editingReminder == reminder.id else { return }
        router.editingReminder = nil
      }
    }
    .onDisappear {
      leaving?.cancel()
      actions.finishEditing(reminder.id, title: title, notes: notes)
    }
    .sheet(isPresented: $choosingDate, onDismiss: refocus) { DueSheet(reminder: reminder, mode: .date) }
    .sheet(isPresented: $choosingTime, onDismiss: refocus) { DueSheet(reminder: reminder, mode: .time) }
    .alert("Nouveau tag", isPresented: $newTag) {
      TextField("tag", text: $tagText)
        .textInputAutocapitalization(.never)
      Button("Ajouter") { addTag() }
      Button("Annuler", role: .cancel) { tagText = "" }
    }
  }

  private func refocus() { focus = .title }

  /// Return: on to a new reminder just after this one, as in Reminders. On an empty title, or where there's nothing
  /// to continue with, Return ends editing.
  private func submit() {
    guard let continueWith, !title.trimmingCharacters(in: .whitespaces).isEmpty else {
      router.editingReminder = nil
      return
    }
    actions.finishEditing(reminder.id, title: title, notes: notes)
    let current = store.space.reminders[reminder.id] ?? reminder
    router.editingReminder = actions.addAfter(current, due: continueWith.due, tag: continueWith.tag)
  }

  private func update(_ change: (inout ReminderPatch) -> Void) {
    var patch = ReminderPatch()
    change(&patch)
    store.update(reminder.id, patch)
  }

  private func addTag() {
    let value = tagText.trimmingCharacters(in: .whitespaces)
      .replacingOccurrences(of: "^#", with: "", options: .regularExpression)
      .replacingOccurrences(of: #"\s+"#, with: "-", options: .regularExpression)
    tagText = ""
    let current = store.space.reminders[reminder.id]?.tags ?? reminder.tags
    if !value.isEmpty, !current.contains(value) { update { $0.tags = .set(current + [value]) } }
  }

  // ---------- Chips ----------

  private var tools: some View {
    let live = store.space.reminders[reminder.id] ?? reminder
    let today = store.now.date
    return ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        if let due = live.due {
          Menu {
            dateChoices(today: today, due: due)
            Divider()
            Button(role: .destructive) { update { $0.due = .clear } } label: {
              Label("Retirer la date", systemImage: "xmark")
            }
          } label: {
            Chip(icon: "calendar", text: store.core.dayLabel(due.date, today: today).capitalizedFirst, set: true, tint: tint)
          }
          Menu {
            Button("Sans heure") { update { $0.due = .set(Due(date: due.date)) } }
            ForEach(["09:00", "12:00", "14:00", "18:00", "20:00"], id: \.self) { time in
              Button(store.core.timeLabel(time)) { update { $0.due = .set(Due(date: due.date, time: time)) } }
            }
            Button("Autre heure…") { choosingTime = true }
          } label: {
            Chip(icon: "clock", text: due.time.map { store.core.timeLabel($0) } ?? "Heure", set: due.time != nil, tint: tint)
          }
          Menu {
            Picker("Alerte", selection: Binding(get: { live.early ?? 0 }, set: { minutes in update { $0.early = minutes > 0 ? .set(minutes) : .clear } })) {
              ForEach(ReminderOptions.early, id: \.0) { Text($0.1).tag($0.0) }
            }
          } label: {
            Chip(icon: "bell", text: ReminderOptions.early.first { $0.0 == live.early }?.1, set: live.early != nil, tint: tint)
          }
          .accessibilityLabel("Alerte")
          Menu {
            ForEach(ReminderOptions.repeats.indices, id: \.self) { i in
              let (choice, label) = ReminderOptions.repeats[i]
              Button {
                update { $0.repeat = ReminderOptions.repeatFrom(choice, previous: live.repeat).map { .set($0) } ?? .clear }
              } label: {
                if ReminderOptions.sameRepeat(choice, live.repeat) { Label(label, systemImage: "checkmark") } else { Text(label) }
              }
            }
          } label: {
            Chip(icon: "repeat", text: ReminderOptions.repeatLabel(live.repeat), set: live.repeat != nil, tint: tint)
          }
          .accessibilityLabel("Répéter")
        } else {
          Menu {
            dateChoices(today: today, due: nil)
          } label: {
            Chip(icon: "calendar", text: nil, set: false, tint: tint)
          }
          .accessibilityLabel("Ajouter une date")
        }
        Menu {
          let tags = Set(store.space.reminders.values.filter { !$0.completed }.flatMap(\.tags)).union(live.tags)
          ForEach(tags.sorted { $0.localizedCompare($1) == .orderedAscending }, id: \.self) { tag in
            Button {
              update { $0.tags = .set(live.tags.contains(tag) ? live.tags.filter { $0 != tag } : live.tags + [tag]) }
            } label: {
              if live.tags.contains(tag) { Label("#\(tag)", systemImage: "checkmark") } else { Text("#\(tag)") }
            }
          }
          Button("Nouveau tag…") { newTag = true }
        } label: {
          Chip(icon: "tag", text: live.tags.isEmpty ? nil : "\(live.tags.count)", set: !live.tags.isEmpty, tint: tint)
        }
        .accessibilityLabel("Tags")
        if !store.space.members.isEmpty {
          Menu {
            Picker("Assigné à", selection: Binding(get: { live.assignee ?? "" }, set: { id in update { $0.assignee = id.isEmpty ? .clear : .set(id) } })) {
              Text("Personne").tag("")
              ForEach(store.space.members) { Text($0.name).tag($0.id) }
            }
          } label: {
            Chip(icon: "person", text: store.space.member(live.assignee)?.name, set: live.assignee != nil, tint: tint)
          }
          .accessibilityLabel("Assigné à")
        }
        if live.parentId == nil { MoveMenu(reminder: live, tint: tint) }
        Button {
          router.editingReminder = nil
          router.selectedReminder = reminder.id
        } label: {
          Image(systemName: "info.circle").font(.title3).foregroundStyle(tint)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Tous les détails")
      }
      .padding(.vertical, 2)
    }
  }

  @ViewBuilder
  private func dateChoices(today: String, due: Due?) -> some View {
    let time = due?.time
    Button("Aujourd’hui") { update { $0.due = .set(Due(date: today, time: time)) } }
    Button("Demain") { update { $0.due = .set(Due(date: LocalDates.addDays(today, 1, timeZone: zone), time: time)) } }
    Button("Ce week-end") { update { $0.due = .set(Due(date: LocalDates.weekend(from: today, timeZone: zone), time: time)) } }
    Button("La semaine prochaine") {
      update { $0.due = .set(Due(date: LocalDates.nextWeek(from: today, timeZone: zone), time: time)) }
    }
    Button("Choisir une date…") { choosingDate = true }
  }
}

/// One of the inline editor's chips: an icon, and its value once set.
struct Chip: View {
  let icon: String
  let text: String?
  let set: Bool
  let tint: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: icon)
      if let text { Text(text).lineLimit(1) }
    }
    .font(.subheadline)
    .padding(.horizontal, 10)
    .frame(minHeight: 30)
    .foregroundStyle(set ? tint : .secondary)
    .background(set ? tint.opacity(0.14) : Color(.tertiarySystemFill), in: Capsule())
  }
}

/// The phone's own date or time picker, for a date the menus don't offer.
struct DueSheet: View {
  enum Mode { case date, time }
  let reminder: Reminder
  let mode: Mode

  @Environment(Store.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var value = Date()

  var body: some View {
    let zone = store.space.timeZone
    NavigationStack {
      Group {
        if mode == .date {
          DatePicker("Date", selection: $value, displayedComponents: .date)
            .datePickerStyle(.graphical)
        } else {
          DatePicker("Heure", selection: $value, displayedComponents: .hourAndMinute)
            .datePickerStyle(.wheel)
            .labelsHidden()
        }
      }
      .environment(\.locale, Locale(identifier: "fr_FR"))
      .environment(\.timeZone, TimeZone(identifier: zone) ?? .current)
      .padding()
      .navigationTitle(mode == .date ? "Date" : "Heure")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("OK") {
            let live = store.space.reminders[reminder.id] ?? reminder
            let date = mode == .date ? LocalDates.iso(value, timeZone: zone) : live.due?.date ?? store.now.date
            let time = mode == .time ? LocalDates.time(value, timeZone: zone) : live.due?.time
            var patch = ReminderPatch()
            patch.due = .set(Due(date: date, time: time))
            store.update(reminder.id, patch)
            dismiss()
          }
        }
      }
    }
    .presentationDetents(mode == .date ? [.medium, .large] : [.height(320)])
    .onAppear {
      let due = reminder.due
      value = LocalDates.date(due?.date ?? store.now.date, time: due?.time ?? (mode == .time ? "09:00" : nil), timeZone: zone)
    }
  }
}
