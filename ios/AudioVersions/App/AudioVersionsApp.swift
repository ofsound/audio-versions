import SwiftUI

@main
struct AudioVersionsApp: App {
    var body: some Scene {
        WindowGroup {
            AudioVersionsRootView()
        }
    }
}

@MainActor
private struct AudioVersionsRootView: View {
    @Environment(\.colorScheme) private var systemColorScheme
    @StateObject private var store: ReviewCompanionStore
    @StateObject private var appearance = AppearanceStore()
    @State private var authentication: AuthenticationStore?

    private let environment: ReviewCloudEnvironment?

    init(configuration: AppRuntimeConfiguration = AppConfiguration.load()) {
        let environment: ReviewCloudEnvironment?
        switch configuration {
        case .fixture:
            environment = nil
        case let .cloud(cloudConfiguration):
            environment = ReviewCloudEnvironment(configuration: cloudConfiguration)
        }

        self.environment = environment
        _store = StateObject(
            wrappedValue: ReviewCompanionStore(
                songs: environment == nil ? FixtureLibrary.songs : []
            )
        )
        _authentication = State(
            initialValue: environment.map { AuthenticationStore(client: $0.client) }
        )
    }

    private var palette: AppPalette {
        .forScheme(appearance.preference.resolvedScheme(systemScheme: systemColorScheme))
    }

    var body: some View {
        Group {
            if let environment, let authentication {
                cloudContent(environment: environment, authentication: authentication)
            } else {
                LibraryView()
                    .environmentObject(store)
            }
        }
        .environmentObject(appearance)
        .environment(\.palette, palette)
        .tint(palette.accent)
        .preferredColorScheme(appearance.preference.colorScheme)
        .onOpenURL { url in
            store.openSongLink(url)
        }
    }

    @ViewBuilder
    private func cloudContent(
        environment: ReviewCloudEnvironment,
        authentication: AuthenticationStore
    ) -> some View {
        if authentication.isRestoringSession {
            LibraryBootstrapView(showsTitle: true)
        } else if authentication.user == nil {
            EmailSignInView(authentication: authentication)
        } else {
            LibraryView(
                accountEmail: authentication.user?.email,
                onSignOut: {
                    Task {
                        await authentication.signOut()
                        store.useFixtureLibrary()
                    }
                }
            )
            .environmentObject(store)
            .task(id: authentication.user?.id) {
                store.configureCloud(
                    library: environment.library,
                    signedMedia: environment.signedMedia
                )
                await store.refreshCloudLibrary()
            }
        }
    }
}
