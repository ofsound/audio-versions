import SwiftUI

struct EmailSignInView: View {
    @Environment(\.palette) private var palette
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
                .listRowBackground(palette.surface)

                if let errorMessage = authentication.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(palette.danger)
                    }
                    .listRowBackground(palette.surface)
                }

                Section {
                    Button(action: signIn) {
                        HStack {
                            Spacer()
                            if authentication.isWorking {
                                ProgressView()
                                    .tint(palette.accent)
                            } else {
                                Text("Sign In")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(authentication.isWorking || email.isEmpty || password.isEmpty)
                }
                .listRowBackground(palette.surface)
            }
            .scrollContentBackground(.hidden)
            .appCanvas()
            .navigationTitle("Audio Versions")
        }
    }

    private func signIn() {
        Task {
            await authentication.signIn(email: email, password: password)
        }
    }
}
