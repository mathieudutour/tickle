import XCTest

final class DragUITests: XCTestCase {
  private func drag(_ list: String, _ from: String, _ to: String) -> Bool {
    let app = launchTickle(open: list)
    _ = element(app, from).waitForExistence(timeout: 5)
    element(app, from).press(forDuration: 0.8, thenDragTo: element(app, to))
    return element(app, "Déplacé").waitForExistence(timeout: 3)
  }
  func testShortInRappels() { XCTAssertTrue(drag("list:rappels", "!! Payer la facture", "Acheter du pain")) }
  func testLongInRappels() { XCTAssertTrue(drag("list:rappels", "Préparer le voyage", "Appeler maman")) }
  func testDownInRappels() { XCTAssertTrue(drag("list:rappels", "Appeler maman", "!! Payer la facture")) }
  func testLooseInCourses() { XCTAssertTrue(drag("list:courses", "Piles AA", "Yaourts")) }
}
