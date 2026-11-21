import XCTest
@testable import Tickle

/// Two phones and the real server code: run `npm run dev -- --port 5299` in the repository, then the tests with
/// `TEST_RUNNER_TICKLE_TEST_SERVER=http://localhost:5299 xcodebuild test …`. Skipped otherwise.
@MainActor
final class SyncTests: XCTestCase {
  private var server: URL!

  override func setUp() async throws {
    guard let value = ProcessInfo.processInfo.environment["TICKLE_TEST_SERVER"], let url = URL(string: value) else {
      throw XCTSkip("Set TICKLE_TEST_SERVER to a running dev server (npm run dev -- --port 5299)")
    }
    server = url
  }

  private func phone(_ name: String) -> Store {
    let file = FileManager.default.temporaryDirectory.appending(path: "tickle-\(name)-\(UUID().uuidString).json")
    return Store(core: Core(), server: server, file: file)
  }

  private func until(_ what: String, timeout: Duration = .seconds(10), _ condition: () -> Bool) async throws {
    let deadline = ContinuousClock.now + timeout
    while !condition() {
      guard ContinuousClock.now < deadline else { return XCTFail("timed out waiting for \(what)") }
      try await Task.sleep(for: .milliseconds(50))
    }
  }

  func testTwoPhonesShareASpaceAndCatchUpAfterBeingOffline() async throws {
    let a = phone("a")
    a.goOnline()
    try await until("the space to exist") { a.key != nil && a.connection == .online }

    let b = phone("b")
    b.join(try XCTUnwrap(a.key))
    b.goOnline()
    try await until("b to join") { b.joined && b.connection == .online }

    a.add(entry: "Pain demain 18h", defaults: EntryDefaults(listId: "rappels"))
    try await until("b to see Pain") { b.space.reminders.values.contains { $0.title == "Pain" } }

    // Offline, b keeps working; back online, its change goes out.
    b.goOffline()
    b.add(entry: "Lait", defaults: EntryDefaults(listId: "rappels"))
    XCTAssertEqual(b.pending, 1)
    b.goOnline()
    try await until("a to see Lait") { a.space.reminders.values.contains { $0.title == "Lait" } }
    try await until("b's change to be confirmed") { b.pending == 0 }

    // A phone that was closed syncs once, as on a silent push.
    b.goOffline()
    a.add(entry: "Œufs", defaults: EntryDefaults(listId: "rappels"))
    let synced = await b.syncOnce(timeout: .seconds(10))
    XCTAssertTrue(synced)
    XCTAssertTrue(b.space.reminders.values.contains { $0.title == "Œufs" })
    XCTAssertEqual(b.connection, .offline, "a background sync lets go of the socket")
  }
}
