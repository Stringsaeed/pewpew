import ExpoModulesCore
import GameKit

/// Game Center for PewPew. Three jobs: sign the local player in, push best scores to leaderboards, and present the
/// native leaderboard sheet. Everything else (which boards exist, what to submit) lives in TypeScript.
public class GameCenterModule: Module {
  /// Keeps the sheet's delegate alive while it is on screen.
  private var sheetDelegate: SheetDelegate?
  /// GameKit calls the handler once at launch and again whenever the player signs in or out.
  private var handlerInstalled = false
  private var pendingAuth: [Promise] = []

  public func definition() -> ModuleDefinition {
    Name("GameCenter")

    Events("onAuth")

    Property("isAuthenticated") {
      GKLocalPlayer.local.isAuthenticated
    }

    /// Resolves with the signed-in player, or null when the player declined or Game Center is unavailable.
    /// GameKit shows its own sign-in sheet the first time this runs; a dismissed sheet does not come back until relaunch.
    AsyncFunction("authenticate") { (promise: Promise) in
      if GKLocalPlayer.local.isAuthenticated {
        promise.resolve(Self.playerRecord())
        return
      }
      self.pendingAuth.append(promise)
      if self.handlerInstalled { return }
      self.handlerInstalled = true
      GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
        guard let self else { return }
        if let viewController, let host = self.appContext?.utilities?.currentViewController() {
          host.present(viewController, animated: true)
          return
        }
        let record = Self.playerRecord()
        self.sendEvent("onAuth", ["player": record as Any])
        let waiting = self.pendingAuth
        self.pendingAuth = []
        waiting.forEach { $0.resolve(record) }
      }
    }.runOnQueue(.main)

    /// Submits one value to every listed leaderboard. Game Center keeps each player's best, so resubmitting is harmless.
    AsyncFunction("submit") { (value: Int, boards: [String]) async throws in
      guard GKLocalPlayer.local.isAuthenticated else { throw NotSignedIn() }
      try await GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: boards)
    }

    /// The local player's all-time global rank on one board, or null when they have no entry yet.
    AsyncFunction("localEntry") { (board: String) async throws -> [String: Any]? in
      guard GKLocalPlayer.local.isAuthenticated else { throw NotSignedIn() }
      guard let leaderboard = try await GKLeaderboard.loadLeaderboards(IDs: [board]).first else { return nil }
      let (local, _, total) = try await leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: 1))
      guard let local else { return nil }
      return ["rank": local.rank, "score": local.score, "total": total]
    }

    /// Presents the native Game Center sheet on one leaderboard, or the leaderboards tab when `board` is null.
    AsyncFunction("show") { (board: String?) in
      guard let host = self.appContext?.utilities?.currentViewController() else { throw NoWindow() }
      let sheet = board.map { GKGameCenterViewController(leaderboardID: $0, playerScope: .global, timeScope: .allTime) }
        ?? GKGameCenterViewController(state: .leaderboards)
      let delegate = SheetDelegate { [weak self] in self?.sheetDelegate = nil }
      self.sheetDelegate = delegate
      sheet.gameCenterDelegate = delegate
      host.present(sheet, animated: true)
    }.runOnQueue(.main)
  }

  private static func playerRecord() -> [String: Any]? {
    let player = GKLocalPlayer.local
    guard player.isAuthenticated else { return nil }
    return ["id": player.gamePlayerID, "displayName": player.displayName, "alias": player.alias]
  }
}

private final class SheetDelegate: NSObject, GKGameCenterControllerDelegate {
  private let onDismiss: () -> Void
  init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
  func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) {
    controller.dismiss(animated: true) { self.onDismiss() }
  }
}

private final class NotSignedIn: Exception {
  override var reason: String { "The player is not signed in to Game Center" }
}

private final class NoWindow: Exception {
  override var reason: String { "No view controller is available to present Game Center" }
}
