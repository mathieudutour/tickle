import XCTest
@testable import Tickle

/// The shared logic, run through JavaScriptCore as the app runs it.
@MainActor
final class CoreTests: XCTestCase {
  private var core: Core!

  override func setUp() async throws {
    core = Core()
    core.load(nil, timeZone: "Europe/Paris")
  }

  func testAQuickEntryBecomesAReminderWithItsDate() throws {
    let now = LocalNow(date: "2026-11-21", time: "10:00")
    let action = try XCTUnwrap(core.entryAction("Pain demain 18h #courses", defaults: EntryDefaults(listId: "rappels"), now: now))
    _ = core.dispatch(raw: action)
    let reminder = try XCTUnwrap(core.snapshot()?.space.reminders.values.first)
    XCTAssertEqual(reminder.title, "Pain")
    XCTAssertEqual(reminder.due, Due(date: "2026-11-22", time: "18:00"))
    XCTAssertEqual(reminder.tags, ["courses"])
    XCTAssertEqual(core.labels(now: now)[reminder.id]?.due, "Demain, 18 h")
  }

  func testActionsWaitForTheServerAndReplayAfterARestart() throws {
    core.created(key: "key-123", version: 0)
    let effects = core.dispatch(.addMember(Member(id: "m1", name: "Léa", color: .pink)))
    XCTAssertEqual(effects.outbox.count, 1)
    XCTAssertEqual(core.snapshot()?.pending, 1)

    let saved = core.persisted()
    core.load(saved, timeZone: "Europe/Paris")
    XCTAssertEqual(core.snapshot()?.space.members.map(\.name), ["Léa"])
    let snapshot = #"{"t":"snapshot","version":3,"state":{"lists":[],"reminders":{},"members":[],"timeZone":"Europe/Paris"}}"#
    let resent = core.receive(snapshot)
    XCTAssertEqual(resent.outbox.count, 1, "the pending action goes out again")
    XCTAssertEqual(core.snapshot()?.space.members.map(\.name), ["Léa"])
  }

  func testPatchesSendOnlyWhatChangesAndNullToClear() throws {
    var patch = ReminderPatch()
    XCTAssertTrue(patch.isEmpty)
    patch.title = .set("Lait")
    patch.due = .clear
    let json = String(decoding: try JSONEncoder().encode(SpaceAction.updateReminder(id: "r1", patch: patch)), as: UTF8.self)
    XCTAssertTrue(json.contains(#""due":null"#))
    XCTAssertTrue(json.contains(#""title":"Lait""#))
    XCTAssertFalse(json.contains("notes"))
  }

  func testCompletingARepeatingReminderMovesItOn() throws {
    let now = LocalNow(date: "2026-11-21", time: "10:00")
    _ = core.dispatch(raw: try XCTUnwrap(core.entryAction("Arroser tous les jours 9h", defaults: EntryDefaults(listId: "rappels"), now: now)))
    let id = try XCTUnwrap(core.snapshot()?.space.reminders.keys.first)
    _ = core.dispatch(raw: try XCTUnwrap(core.completeAction(id, completed: true)))
    let reminders = try XCTUnwrap(core.snapshot()?.space.reminders)
    XCTAssertEqual(reminders.count, 2, "a completed copy stays")
    XCTAssertEqual(reminders[id]?.completed, false)
  }
}
