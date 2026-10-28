import SwiftUI

struct GalleryViewer: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.dismiss) private var dismiss
    let scope: GalleryScope
    @State var selectedID: String
    @State private var removing = false
    @State private var confirmRemoval = false
    @State private var error: String?

    private struct Entry: Identifiable {
        var image: GalleryImage
        var scope: GalleryScope
        var id: String { image.id }
    }
    private var entries: [Entry] {
        let songScope = GalleryScope(songId: scope.songId)
        var result = store.galleryImages(in: songScope).map { Entry(image: $0, scope: songScope) }
        if scope.audioFileId != nil { result += store.galleryImages(in: scope).map { Entry(image: $0, scope: scope) } }
        return result
    }
    private var current: Entry? { entries.first { $0.id == selectedID } ?? entries.first }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if !entries.isEmpty {
                    TabView(selection: $selectedID) {
                        ForEach(entries) { entry in
                            ZoomableGalleryImage(image: entry.image, scope: entry.scope)
                                .tag(entry.id)
                        }
                    }.tabViewStyle(.page(indexDisplayMode: .automatic))
                    ScrollView(.horizontal) {
                        HStack(spacing: 8) {
                            ForEach(entries) { entry in
                                Button { selectedID = entry.id } label: {
                                    GalleryImageView(image: entry.image, scope: entry.scope, thumbnail: true)
                                        .frame(width: 72, height: 54).clipped()
                                        .padding(3)
                                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(selectedID == entry.id ? Color.accentColor : .clear, lineWidth: 2))
                                }.accessibilityLabel("View \(entry.image.name)")
                            }
                        }.padding(.horizontal)
                    }
                    if let current {
                        Text(current.scope.audioFileId == nil ? "Song gallery" : "File gallery").font(.subheadline).foregroundStyle(.secondary)
                        Text(current.image.name).font(.caption).lineLimit(2).padding(.horizontal)
                    }
                }
                if removing { ProgressView("Removing image…") }
                if let error { Text(error).font(.subheadline).foregroundStyle(.red).padding(.horizontal) }
            }
            .padding(.bottom)
            .appCanvas()
            .navigationTitle("Image Gallery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button("Remove image", systemImage: "trash", role: .destructive) { confirmRemoval = true }
                        .disabled(removing || current == nil || !store.isCloudConfigured || store.isOffline)
                }
            }
            .confirmationDialog("Remove this image from the gallery on all devices?", isPresented: $confirmRemoval, titleVisibility: .visible) {
                Button("Remove image", role: .destructive) {
                    guard let entry = current else { return }
                    removing = true
                    error = nil
                    Task {
                        defer { removing = false }
                        do { try await store.removeGalleryImage(entry.image, scope: entry.scope) }
                        catch { self.error = error.localizedDescription }
                    }
                }
            }
            .onChange(of: entries.map(\.id)) { _, ids in
                if ids.isEmpty { dismiss() }
                else if !ids.contains(selectedID), let first = ids.first { selectedID = first }
            }
        }
    }
}

/// UIScrollView provides bounded zoom and panning without stealing horizontal
/// page swipes when the image is fitted to the screen.
private struct ZoomableGalleryImage: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    let image: GalleryImage
    let scope: GalleryScope
    @State private var loaded: UIImage?
    @State private var error: String?
    @State private var retry = 0
    var body: some View {
        Group {
            if let loaded { GalleryZoomView(image: loaded) }
            else if let error { VStack(spacing: 12) { Text(error); Button("Retry image") { retry += 1 } }.padding() }
            else { ProgressView("Loading image…") }
        }
        .task(id: "\(image.id)-\(retry)") {
            error = nil
            do {
                let data = try await store.galleryData(image, scope: scope, thumbnail: false)
                guard !Task.isCancelled else { return }
                guard let decoded = UIImage(data: data) else { throw GalleryError.invalidImage }
                loaded = decoded
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}

private struct GalleryZoomView: UIViewRepresentable {
    let image: UIImage
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> ZoomScrollView {
        let scroll = ZoomScrollView()
        scroll.minimumZoomScale = 1
        scroll.maximumZoomScale = 5
        scroll.delegate = context.coordinator
        scroll.imageView.image = image
        scroll.imageView.contentMode = .scaleAspectFit
        scroll.addSubview(scroll.imageView)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        tap.numberOfTapsRequired = 2
        scroll.addGestureRecognizer(tap)
        scroll.accessibilityLabel = "Image. Pinch or double-tap to zoom."
        return scroll
    }
    func updateUIView(_ scroll: ZoomScrollView, context: Context) { scroll.imageView.image = image }
    final class ZoomScrollView: UIScrollView {
        let imageView = UIImageView()
        private var previousSize: CGSize = .zero
        override func layoutSubviews() {
            super.layoutSubviews()
            if bounds.size != previousSize {
                previousSize = bounds.size
                zoomScale = 1
                imageView.frame = CGRect(origin: .zero, size: bounds.size)
                contentSize = bounds.size
            }
        }
    }
    final class Coordinator: NSObject, UIScrollViewDelegate {
        func viewForZooming(in scrollView: UIScrollView) -> UIView? { (scrollView as? ZoomScrollView)?.imageView }
        @objc func doubleTap(_ gesture: UITapGestureRecognizer) {
            guard let scroll = gesture.view as? UIScrollView else { return }
            scroll.setZoomScale(scroll.zoomScale > 1 ? 1 : 3, animated: true)
        }
    }
}
