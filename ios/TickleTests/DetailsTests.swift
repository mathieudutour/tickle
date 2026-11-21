import XCTest
@testable import Tickle

/// The home screen's and the details' helpers: today's count, search, repeats, deleting with undo.
@MainActor
final class DetailsTests: XCTestCase {
  private func store(with reminders: [Reminder], members: [Member] = []) -> Store {
    let file = FileManager.default.temporaryDirectory.appending(path: "details-\(UUID().uuidString).json")
    let space = Space(
      lists: [TickleList(id: "rappels", name: "Rappels", color: .pink, icon: "📋", order: 0, sections: [])],
      reminders: Dictionary(uniqueKeysWithValues: reminders.map { ($0.id, $0) }),
      members: members, timeZone: "Europe/Paris")
    let data = try! JSONEncoder().encode(["space": space])
    try! data.write(to: file)
    return Store(server: URL(string: "http://127.0.0.1:9")!, file: file)
  }

  private func reminder(_ id: String, _ title: String, due: String? = nil, parent: String? = nil, assignee: String? = nil)
    -> Reminder
  {
    Reminder(
      id: id, listId: "rappels", parentId: parent, title: title, due: due.map { Due(date: $0) }, priority: 0, tags: [],
      assignee: assignee, completed: false, createdAt: "2026-11-18T09:00:00.000Z", order: 1)
  }

  func testTodayCountsOverdueAndTodayButNotSubtasksNorOthersReminders() {
    let store = store(
      with: [
        reminder("a", "Hier", due: "2026-11-20"), reminder("b", "Aujourd’hui", due: "2026-11-21"),
        reminder("c", "Demain", due: "2026-11-22"), reminder("d", "Sous-tâche", due: "2026-11-21", parent: "b"),
        reminder("e", "Pour Léa", due: "2026-11-21", assignee: "lea"),
      ],
      members: [Member(id: "lea", name: "Léa", color: .red), Member(id: "me", name: "Moi", color: .blue)])
    let due = store.lookup.dueBy("2026-11-21")
    XCTAssertEqual(Set(due.map(\.id)), ["a", "b", "e"])
    let me = store.space.members.first { $0.id == "me" }
    XCTAssertEqual(Set(due.filter { store.lookup.isForMe($0, me) }.map(\.id)), ["a", "b"])
    XCTAssertEqual(store.lookup.member(named: "@lea")?.id, "lea")
  }

  func testSearchFindsTitlesAndTags() {
    var tagged = reminder("t", "Payer")
    tagged.tags = ["école"]
    let store = store(with: [reminder("a", "Lait"), tagged])
    XCTAssertEqual(store.lookup.search("éco").map(\.id), ["t"])
    XCTAssertEqual(store.lookup.search("  ").count, 0)
    XCTAssertEqual(store.lookup.tags, ["école"])
  }

  func testRepeatChoicesKeepTheEndDate() {
    let previous = Repeat(freq: .weekly, interval: 1, until: "2027-01-01")
    let next = ReminderChoices.repeatFrom("monthly:3", previous: previous)
    XCTAssertEqual(next, Repeat(freq: .monthly, interval: 3, until: "2027-01-01"))
    XCTAssertNil(ReminderChoices.repeatFrom("", previous: previous))
    XCTAssertEqual(ReminderChoices.repeatLabel(next!), "Tous les 3 mois")
  }

  func testDeletingTakesSubtasksAlongAndUndoBringsThemBack() {
    let store = store(with: [reminder("p", "Vacances"), reminder("c", "Train", parent: "p")])
    let toaster = Toaster()
    store.lookup.delete("p", toaster: toaster)
    XCTAssertTrue(store.space.reminders.isEmpty)
    toaster.current?.action?()
    XCTAssertEqual(Set(store.space.reminders.keys), ["p", "c"])
    XCTAssertEqual(store.space.reminders["c"]?.parentId, "p")
  }
}
