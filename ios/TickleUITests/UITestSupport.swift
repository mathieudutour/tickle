import XCTest

/// Launches the app offline (an unreachable server) on a known space: `seed.json`, with its dates relative to today.
func launchTickle(open: String) -> XCUIApplication {
  let app = XCUIApplication()
  app.launchArguments = ["-TickleServer", "http://127.0.0.1:9", "-TickleOpen", open]
  app.launchEnvironment["TICKLE_SEED"] = seedSpace()
  app.launch()
  return app
}

private final class Bundle_ {}

private func seedSpace() -> String {
  let url = Bundle(for: Bundle_.self).url(forResource: "seed", withExtension: "json")!
  var text = try! String(contentsOf: url, encoding: .utf8)
  let formatter = DateFormatter()
  formatter.dateFormat = "yyyy-MM-dd"
  formatter.timeZone = TimeZone(identifier: "Europe/Paris")
  for (name, days) in [("yesterday", -1), ("today", 0), ("tomorrow", 1)] {
    let date = Calendar.current.date(byAdding: .day, value: days, to: Date())!
    text = text.replacingOccurrences(of: "{{\(name)}}", with: formatter.string(from: date))
  }
  return text
}

/// The element whose label starts with `text`: a row reads « Title, date… ».
func element(_ app: XCUIApplication, _ text: String) -> XCUIElement {
  app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", text)).firstMatch
}

extension XCTestCase {
  /// A screenshot kept with the test results.
  func screenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
