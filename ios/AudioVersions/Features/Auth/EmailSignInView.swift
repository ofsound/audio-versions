import SwiftUI

struct EmailSignInView: View {
    @Bindable var authentication: AuthenticationStore

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .onSubmit(signIn)
                }

                if let errorMessage = authentication.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: signIn) {
                        HStack {
                            Spacer()
                            if authentication.isWorking {
                                ProgressView()
                            } else {
                                Text("Sign In")
                            }
                            Spacer()
                        }
                    }
                    .disabled(authentication.isWorking || email.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("Audio Versions")
        }
    }

    private func signIn() {
        Task {
            await authentication.signIn(email: email, password: password)
        }
    }
}
