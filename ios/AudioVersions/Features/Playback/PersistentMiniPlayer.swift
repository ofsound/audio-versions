import SwiftUI

extension View {
    func persistentMiniPlayer() -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            PersistentMiniPlayer()
        }
    }
}

/// Shares the native transport; navigating or opening the full player never reloads audio.
private struct PersistentMiniPlayer: View {
    @EnvironmentObject private var store: ReviewCompanionStore
    @Environment(\.palette) private var palette

    var body: some View {
        if let version = store.activePlaybackVersion, let song = store.activePlaybackSong {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    Button(action: store.showCurrentPlayer) {
                        HStack(spacing: 12) {
                            Image(systemName: "waveform")
                                .font(.title3)
                                .foregroundStyle(palette.accentText)
                                .frame(width: 36, height: 36)
                                .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(song.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(palette.textPrimary)
                                Text(store.isPlaybackLoading ? "Loading audio…" : store.playbackErrorMessage != nil ? "Playback unavailable" : version.name)
                                    .font(.caption)
                                    .foregroundStyle(palette.textSecondary)
                            }
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.up")
                                .font(.caption)
                                .foregroundStyle(palette.textTertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open player for \(song.title), \(version.name)")

                    Button {
                        if store.playbackErrorMessage != nil {
                            store.retryPlayback(for: version)
                        } else {
                            store.togglePlayback(for: version, preservePlaylistQueue: true)
                        }
                    } label: {
                        Group {
                            if store.isPlaybackLoading {
                                ProgressView().tint(palette.accentText)
                            } else {
                                Image(systemName: store.playbackErrorMessage != nil
                                      ? "arrow.clockwise" : store.isPlaying ? "pause.fill" : "play.fill")
                            }
                        }
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(palette.accentText)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.isPlaybackLoading)
                    .accessibilityLabel(store.isPlaybackLoading ? "Loading audio" : store.playbackErrorMessage != nil
                                        ? "Retry playback" : store.isPlaying ? "Pause playback" : "Resume playback")
                }
                ProgressView(value: PlaybackTimeline.clamp(store.currentTime, duration: version.duration),
                             total: max(0.01, version.duration))
                    .tint(palette.accent)
                    .accessibilityLabel("Playback progress")
                    .accessibilityValue("\(store.currentTime.playbackTimestamp) of \(version.duration.playbackTimestamp)")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(palette.surface)
            .overlay(alignment: .top) {
                Rectangle().fill(palette.hairline).frame(height: 1)
            }
            .accessibilityIdentifier("persistent-mini-player")
        }
    }
}
