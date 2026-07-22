import Foundation

struct CloudConfiguration: Equatable, Sendable {
    let supabaseURL: URL
    let supabasePublishableKey: String
    let apiBaseURL: URL
}

enum AppRuntimeConfiguration: Equatable, Sendable {
    case fixture
    case cloud(CloudConfiguration)
}

enum AppConfiguration {
    static let supabaseURLKey = "AVSupabaseURL"
    static let supabasePublishableKeyKey = "AVSupabasePublishableKey"
    static let apiBaseURLKey = "AVAPIBaseURL"

    static func load(bundle: Bundle = .main) -> AppRuntimeConfiguration {
        resolve(infoDictionary: bundle.infoDictionary ?? [:])
    }

    static func resolve(infoDictionary: [String: Any]) -> AppRuntimeConfiguration {
        guard
            let supabaseURLString = configuredString(
                infoDictionary[supabaseURLKey]
            ),
            let supabaseURL = URL(string: supabaseURLString),
            supabaseURL.scheme == "https",
            let publishableKey = configuredString(
                infoDictionary[supabasePublishableKeyKey]
            ),
            !publishableKey.localizedCaseInsensitiveContains("publishable-key")
        else {
            return .fixture
        }

        let apiBaseURL = configuredString(infoDictionary[apiBaseURLKey])
            .flatMap(URL.init(string:))
            ?? URL(string: "https://audio-versions.vercel.app")!

        return .cloud(
            CloudConfiguration(
                supabaseURL: supabaseURL,
                supabasePublishableKey: publishableKey,
                apiBaseURL: apiBaseURL
            )
        )
    }

    private static func configuredString(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !trimmed.isEmpty,
            !trimmed.contains("$("),
            !trimmed.localizedCaseInsensitiveContains("your-project")
        else { return nil }
        return trimmed
    }
}
