import XCTest
@testable import Tickle

/// Helpers of the reminder lists.
@MainActor
final class ListTests: XCTestCase {
  private func reminder(_ id: String, parent: String? = nil, order: Double) -> Reminder {
    Reminder(
      id: id, listId: "rappels", parentId: parent, title: id, priority: 0, tags: [], completed: false,
      createdAt: "2026-11-21T10:00:00.000Z", order: order)
  }

  func testOrderBetweenNeighbours() {
    XCTAssertEqual(orderBetween(nil, 3), 2)
    XCTAssertEqual(orderBetween(3, nil), 4)
    XCTAssertEqual(orderBetween(1, 2), 1.5)
    XCTAssertEqual(orderBetween(nil, nil), 0)
  }

  func testSubtasksComeBackAfterTheirParent() {
    var space = Space.empty
    for r in [reminder("a", order: 1), reminder("b", parent: "a", order: 2), reminder("c", parent: "b", order: 1), reminder("d", parent: "a", order: 1)] {
      space.reminders[r.id] = r
    }
    XCTAssertEqual(space.withSubtasks("a").map(\.id), ["a", "d", "b", "c"])
    XCTAssertEqual(space.topLevel.map(\.id), ["a"])
  }

  func testQuickDates() {
    // Saturday 21 November 2026.
    XCTAssertEqual(LocalDates.weekend(from: "2026-11-21", timeZone: "Europe/Paris"), "2026-11-21")
    XCTAssertEqual(LocalDates.weekend(from: "2026-11-18", timeZone: "Europe/Paris"), "2026-11-21")
    XCTAssertEqual(LocalDates.nextWeek(from: "2026-11-21", timeZone: "Europe/Paris"), "2026-11-23")
    XCTAssertEqual(LocalDates.nextWeek(from: "2026-11-23", timeZone: "Europe/Paris"), "2026-11-30")
    XCTAssertEqual(LocalDates.addDays("2026-12-31", 1, timeZone: "Europe/Paris"), "2027-01-01")
    let date = LocalDates.date("2026-03-29", time: "09:30", timeZone: "Europe/Paris")
    XCTAssertEqual(LocalDates.iso(date, timeZone: "Europe/Paris"), "2026-03-29")
    XCTAssertEqual(LocalDates.time(date, timeZone: "Europe/Paris"), "09:30")
  }

  func testRepeatLabelsMatchTheWebApp() {
    XCTAssertEqual(ReminderOptions.repeatLabel(Repeat(freq: .weekly, interval: 1)), "Toutes les semaines")
    XCTAssertEqual(ReminderOptions.repeatLabel(Repeat(freq: .monthly, interval: 3)), "Tous les 3 mois")
    XCTAssertEqual(ReminderOptions.repeatLabel(Repeat(freq: .weekdays, interval: 2)), "En semaine")
    XCTAssertNil(ReminderOptions.repeatLabel(nil))
    let kept = ReminderOptions.repeatFrom(Repeat(freq: .daily, interval: 1), previous: Repeat(freq: .weekly, interval: 1, until: "2027-01-01"))
    XCTAssertEqual(kept?.until, "2027-01-01")
  }
}
