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
    @StateObject private var store: ReviewCompanionStore
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
        _store = StateObject(wrappedValue: ReviewCompanionStore())
        _authentication = State(
            initialValue: environment.map { AuthenticationStore(client: $0.client) }
        )
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
        .tint(.orange)
    }

    @ViewBuilder
    private func cloudContent(
        environment: ReviewCloudEnvironment,
        authentication: AuthenticationStore
    ) -> some View {
        if authentication.isRestoringSession {
            ProgressView("Restoring your library…")
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
