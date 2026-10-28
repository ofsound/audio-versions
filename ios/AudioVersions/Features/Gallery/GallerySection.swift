import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation

struct GallerySection: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var selectedImage: GalleryImage?
    @State private var importTask: Task<Void, Never>?
    @State private var pending: [GalleryImport] = []
    @State private var progress: String?
    @State private var error: String?
    let scope: GalleryScope

    private var images: [GalleryImage] { store.galleryImages(in: scope) }
    private var title: String { scope.audioFileId == nil ? "Song gallery" : "File gallery" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(title, systemImage: "photo.on.rectangle").font(.headline)
                if !images.isEmpty { Text("\(images.count)").foregroundStyle(.secondary) }
                Spacer()
                Menu {
                    Button("Take Photo", systemImage: "camera") {
                        Task {
                            if await AVCaptureDevice.requestAccess(for: .video) { showCamera = true }
                            else { error = "Allow camera access in Settings to take photos." }
                        }
                    }
                        .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))
                    Button("Photo Library", systemImage: "photo.on.rectangle") { showPhotos = true }
                    Button("Choose Files", systemImage: "folder") { showFiles = true }
                } label: { Label("Add", systemImage: "plus") }
                .disabled(progress != nil || !store.isCloudConfigured || store.isOffline)
                .accessibilityLabel("Add images to \(title.lowercased())")
            }
            if images.isEmpty {
                Text(store.isCloudConfigured ? "Add photos, screenshots, or reference images." : "Connect your cloud library to add images.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(images) { image in
                            Button { selectedImage = image } label: {
                                GalleryImageView(image: image, scope: scope, thumbnail: true)
                                    .frame(width: 100, height: 76).clipped().background(palette.surface)
                            }
                            .accessibilityLabel("View \(image.name)")
                            .disabled(progress != nil)
                        }
                    }
                }
            }
            if let progress { HStack { ProgressView(); Text(progress).font(.subheadline) }.accessibilityElement(children: .combine) }
            if let error {
                Text(error).font(.subheadline).foregroundStyle(.red)
                if !pending.isEmpty && progress == nil { Button("Retry remaining images") { runImports() } }
            }
        }
        .padding(16).appCard()
        .photosPicker(isPresented: $showPhotos, selection: $selectedPhotos, maxSelectionCount: 20, matching: .images)
        .onChange(of: selectedPhotos) { _, items in
            guard !items.isEmpty else { return }
            pending = items.enumerated().map { GalleryImport(source: .photo($0.element), name: "Photo \($0.offset + 1)") }
            runImports()
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.image], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls): pending = urls.map { GalleryImport(source: .file($0), name: $0.lastPathComponent) }; runImports()
            case .failure(let failure): error = failure.localizedDescription
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            GalleryCamera { data in
                showCamera = false
                if let data { pending = [GalleryImport(source: .data(data), name: "Camera photo")]; runImports() }
            }.ignoresSafeArea()
        }
        .fullScreenCover(item: $selectedImage) { image in
            GalleryViewer(scope: scope, selectedID: image.id)
        }
        .onDisappear { importTask?.cancel() }
        .task(id: scope) {
            while !Task.isCancelled {
                if !store.isOffline && progress == nil { await store.refreshCloudLibrary() }
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refreshCloudLibrary() } }
        }
    }

    private func runImports() {
        importTask?.cancel()
        error = nil
        importTask = Task { @MainActor in
            defer { progress = nil }
            let total = pending.count
            var completed = 0
            while !pending.isEmpty {
                do {
                    try Task.checkCancellation()
                    progress = "Preparing image \(completed + 1) of \(total)…"
                    if pending[0].prepared == nil {
                        let data = try await pending[0].read()
                        let name = pending[0].name
                        pending[0].prepared = try await Task.detached { try PreparedGalleryImage.prepare(data, name: name) }.value
                    }
                    try Task.checkCancellation()
                    guard let prepared = pending[0].prepared else { throw GalleryError.invalidImage }
                    if pending[0].uploaded == nil {
                        progress = "Uploading image \(completed + 1) of \(total)…"
                        pending[0].uploaded = try await store.uploadGalleryImage(prepared, scope: scope)
                    }
                    guard let uploaded = pending[0].uploaded else { throw GalleryError.invalidImage }
                    progress = "Saving image \(completed + 1) of \(total)…"
                    try await store.saveGalleryImage(uploaded, scope: scope)
                    pending.removeFirst()
                    completed += 1
                } catch is CancellationError { return }
                catch { self.error = "\(pending.first?.name ?? "Image"): \(error.localizedDescription)"; return }
            }
            selectedPhotos = []
        }
    }
}

private struct GalleryImport {
    enum Source { case photo(PhotosPickerItem), file(URL), data(Data) }
    var source: Source
    var name: String
    var prepared: PreparedGalleryImage?
    var uploaded: GalleryImage?

    func read() async throws -> Data {
        switch source {
        case .photo(let item):
            guard let data = try await item.loadTransferable(type: Data.self) else { throw GalleryError.invalidImage }
            return data
        case .data(let data): return data
        case .file(let url):
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= 25 * 1024 * 1024 else { throw GalleryError.tooLarge }
            return try Data(contentsOf: url)
        }
    }
}

struct GalleryImageView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    let image: GalleryImage
    let scope: GalleryScope
    var thumbnail = false
    @State private var loaded: UIImage?
    @State private var error: String?
    @State private var retry = 0

    var body: some View {
        Group {
            if let loaded { Image(uiImage: loaded).resizable().scaledToFit() }
            else if let error {
                VStack { Image(systemName: "photo"); if !thumbnail { Text(error).font(.caption) }; Button("Retry") { retry += 1 } }
            } else { ProgressView() }
        }
        .task(id: "\(image.id)-\(thumbnail)-\(retry)") {
            error = nil
            do {
                let data = try await store.galleryData(image, scope: scope, thumbnail: thumbnail)
                guard !Task.isCancelled else { return }
                guard let decoded = UIImage(data: data) else { throw GalleryError.invalidImage }
                loaded = decoded
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}

private struct GalleryCamera: UIViewControllerRepresentable {
    var completion: (Data?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController()
        controller.sourceType = .camera
        controller.delegate = context.coordinator
        return controller
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        var completion: (Data?) -> Void
        init(completion: @escaping (Data?) -> Void) { self.completion = completion }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            completion((info[.originalImage] as? UIImage)?.jpegData(compressionQuality: 0.9))
        }
    }
}
