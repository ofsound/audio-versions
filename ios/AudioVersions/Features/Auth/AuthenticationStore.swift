import Foundation
import Observation
@preconcurrency import Supabase

struct AuthenticatedUser: Equatable, Sendable {
    let id: UUID
    let email: String
}

@MainActor
@Observable
final class AuthenticationStore {
    private(set) var user: AuthenticatedUser?
    private(set) var isRestoringSession = true
    private(set) var isWorking = false
    private(set) var errorMessage: String?

    @ObservationIgnored
    private let client: SupabaseClient

    @ObservationIgnored
    private var authStateTask: Task<Void, Never>?

    init(client: SupabaseClient) {
        self.client = client
        if let session = client.auth.currentSession {
            apply(session)
        }
        observeAuthState()
    }

    deinit {
        authStateTask?.cancel()
    }

    func signIn(email: String, password: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter both your email address and password."
            return
        }

        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            _ = try await client.auth.signIn(email: email, password: password)
            apply(client.auth.currentSession)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            try await client.auth.signOut()
            apply(nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearError() {
        errorMessage = nil
    }

    private func observeAuthState() {
        authStateTask?.cancel()
        authStateTask = Task { [weak self, client] in
            for await (_, session) in client.auth.authStateChanges {
                guard !Task.isCancelled else { return }
                self?.apply(session)
            }
        }
    }

    private func apply(_ session: Session?) {
        if let session {
            user = AuthenticatedUser(
                id: session.user.id,
                email: session.user.email ?? "Signed-in account"
            )
        } else {
            user = nil
        }
        isRestoringSession = false
    }
}
