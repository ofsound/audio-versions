import SwiftUI

struct OfflineDownloadControl: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    let version: AudioVersion
    var compact = false

    var body: some View {
        if store.isCloudConfigured {
            Group {
                if store.downloadingVersionIDs.contains(version.id) {
                    Button {
                        store.cancelDownload(versionID: version.id)
                    } label: {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            if !compact { Text("Cancel download") }
                            Image(systemName: "xmark")
                        }
                    }
                    .accessibilityLabel("Cancel download of \(version.name)")
                } else if store.downloadedVersionIDs.contains(version.id) {
                    Menu {
                        Button("Remove download", systemImage: "trash", role: .destructive) {
                            store.removeDownload(versionID: version.id)
                        }
                    } label: {
                        Label("Downloaded", systemImage: "checkmark.circle.fill")
                            .labelStyle(DownloadLabelStyle(compact: compact))
                    }
                    .accessibilityLabel("\(version.name) is available offline. Download options")
                } else {
                    Button {
                        store.downloadVersion(version)
                    } label: {
                        Label("Download for offline", systemImage: "arrow.down.circle")
                            .labelStyle(DownloadLabelStyle(compact: compact))
                    }
                    .disabled(store.isOffline)
                    .accessibilityLabel("Download \(version.name) for offline listening")
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(palette.accentText)
            .frame(minWidth: 36, minHeight: 36)
        }
    }
}

private struct DownloadLabelStyle: LabelStyle {
    let compact: Bool
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon
            if !compact { configuration.title }
        }
    }
}

struct OfflineSyncStatusView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette
    @State private var showsSyncDetails = false

    var body: some View {
        if store.isCloudConfigured,
           store.isOffline || store.isUsingCachedLibrary || !store.pendingAnnotationWrites.isEmpty {
            Button { showsSyncDetails = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: store.isOffline ? "wifi.slash" : "arrow.triangle.2.circlepath")
                    Text(status)
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .font(.footnote)
                .foregroundStyle(palette.textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(palette.surface)
            }
            .sheet(isPresented: $showsSyncDetails) {
                OfflineSyncDetailsView()
            }
        }
    }

    private var status: String {
        let count = store.pendingAnnotationWrites.count
        let prefix = store.isOffline ? "Offline" : store.isUsingCachedLibrary ? "Saved library" : "Annotation sync"
        guard count > 0 else { return "\(prefix) · \(store.downloadedVersionIDs.count) downloads" }
        let conflicts = store.pendingAnnotationWrites.contains { $0.conflictMessage != nil }
        if conflicts { return "\(prefix) · Changes need review" }
        return "\(prefix) · \(count) \(count == 1 ? "change" : "changes") \(store.isSynchronizingAnnotations ? "syncing" : "waiting to sync")"
    }
}

private struct OfflineSyncDetailsView: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.dismiss) private var dismiss
    @State private var discardingAnnotationID: String?

    private var writes: [PendingAnnotationWrite] {
        var seen: Set<String> = []
        return store.pendingAnnotationWrites.filter { seen.insert($0.annotation.id).inserted }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Downloaded audio and your saved library stay available after closing the app. Marker and range changes are saved on this iPhone first and sync when a connection is available.")
                    Text("Signing out removes downloads and any changes that have not synced.")
                        .foregroundStyle(.secondary)
                    Button("Sync now", systemImage: "arrow.clockwise") {
                        store.synchronizeAnnotations()
                    }
                    .disabled(store.isOffline || store.isSynchronizingAnnotations)
                    if let error = store.annotationSyncError {
                        Text("Changes are saved on this iPhone. Sync will retry: \(error)")
                            .font(.footnote)
                    }
                }
                Section("Pending changes") {
                    if writes.isEmpty { Text("All annotation changes have synced.") }
                    ForEach(writes) { write in
                        let latest = store.pendingAnnotationWrites.last {
                            $0.annotation.id == write.annotation.id
                        } ?? write
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.version(id: write.versionID)?.name ?? "Unavailable version")
                                .font(.headline)
                            Text(latest.annotation.detail.isEmpty ? latest.annotation.timeLabel : latest.annotation.detail)
                            if let conflict = write.conflictMessage {
                                Text(conflict).font(.footnote).foregroundStyle(.secondary)
                                Text("Your local edit is kept here. Copy any text you want to keep before using the cloud version.")
                                    .font(.footnote)
                                Button("Use cloud version", role: .destructive) {
                                    discardingAnnotationID = write.annotation.id
                                }
                            } else {
                                Text(latest.operation == .delete ? "Deletion waiting to sync" : "Waiting to sync")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        .textSelection(.enabled)
                    }
                }
            }
            .navigationTitle("Offline & Sync")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .confirmationDialog("Discard local changes to this marker or range?", isPresented: Binding(
                get: { discardingAnnotationID != nil },
                set: { if !$0 { discardingAnnotationID = nil } }
            ), titleVisibility: .visible) {
                Button("Use cloud version", role: .destructive) {
                    if let id = discardingAnnotationID {
                        Task { await store.useCloudAnnotation(annotationID: id) }
                    }
                    discardingAnnotationID = nil
                }
            }
        }
    }
}
