import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    private static let releaseAPI = "https://api.github.com/repos/codeux42/Noctis-PC/releases/latest"
    private static let manifestURL = "https://noctisapp.ct.ws/version.json"

    var window: UIWindow?
    private var updateAlertShown = false

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        checkForUpdate()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - Mise à jour automatique

    private func checkForUpdate() {
        fetchJSON(SceneDelegate.releaseAPI) { [weak self] release in
            var latest = ""
            var download = ""
            var notes = "Une nouvelle version de Noctis est disponible."

            if let release = release {
                latest = SceneDelegate.version(fromTag: release["tag_name"] as? String)
                let expected = "Noctis-\(latest)-ios.ipa"
                if let assets = release["assets"] as? [[String: Any]] {
                    for asset in assets where (asset["name"] as? String) == expected {
                        download = asset["browser_download_url"] as? String ?? ""
                        break
                    }
                }
            }

            // Repli sur le manifeste du site si GitHub est indisponible.
            if download.isEmpty {
                self?.fetchJSON(SceneDelegate.manifestURL) { manifest in
                    guard let manifest = manifest,
                          let ios = manifest["ios"] as? [String: Any]
                    else { return }

                    if latest.isEmpty { latest = ios["version"] as? String ?? "" }
                    download = ios["url"] as? String ?? ""
                    if let manifestNotes = manifest["notes"] as? String,
                       !manifestNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        notes = manifestNotes
                    }
                    self?.evaluateUpdate(version: latest, url: download, notes: notes)
                }
                return
            }

            self?.evaluateUpdate(version: latest, url: download, notes: notes)
        }
    }

    private func evaluateUpdate(version: String, url: String, notes: String) {
        guard !version.isEmpty, !url.isEmpty else { return }

        let local = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        guard isNewer(version, local) else { return }
        if UserDefaults.standard.string(forKey: "noctis_skipped_ios") == version { return }

        DispatchQueue.main.async {
            self.presentUpdateAlert(version: version, url: url, notes: notes)
        }
    }

    private func fetchJSON(_ endpoint: String, completion: @escaping ([String: Any]?) -> Void) {
        let separator = endpoint.contains("?") ? "&" : "?"
        let target = endpoint + separator + "t=\(Int(Date().timeIntervalSince1970))"
        guard let url = URL(string: target) else {
            completion(nil)
            return
        }

        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                completion(nil)
                return
            }
            completion(json)
        }.resume()
    }

    private func presentUpdateAlert(version: String, url: String, notes: String) {
        guard !updateAlertShown,
              let root = window?.rootViewController,
              let downloadURL = URL(string: url) else { return }
        updateAlertShown = true

        var message = "Noctis \(version) est disponible."
        let cleanNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanNotes.isEmpty {
            message += "\n\n" + cleanNotes
        }

        let alert = UIAlertController(title: "Mise à jour disponible", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Télécharger", style: .default) { _ in
            UIApplication.shared.open(downloadURL)
        })
        alert.addAction(UIAlertAction(title: "Plus tard", style: .cancel))
        alert.addAction(UIAlertAction(title: "Ignorer cette version", style: .destructive) { _ in
            UserDefaults.standard.set(version, forKey: "noctis_skipped_ios")
        })
        root.present(alert, animated: true)
    }

    private static func version(fromTag tag: String?) -> String {
        guard let tag = tag else { return "" }
        return tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
    }

    private func isNewer(_ remote: String?, _ local: String?) -> Bool {
        guard let remote = remote, let local = local else { return false }
        let a = parts(remote)
        let b = parts(local)
        for i in 0..<3 {
            if a[i] > b[i] { return true }
            if a[i] < b[i] { return false }
        }
        return false
    }

    private func parts(_ version: String) -> [Int] {
        let components = version.split(separator: ".").map { String($0) }
        return (0..<3).map { index in
            guard index < components.count else { return 0 }
            let digits = components[index].filter { $0.isNumber }
            return Int(digits) ?? 0
        }
    }
}
