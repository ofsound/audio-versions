@preconcurrency import AVFoundation
import Combine
import Foundation
@preconcurrency import MediaPlayer

struct PlaybackTrack: Equatable, Sendable {
    let id: String
    let title: String
    let artist: String
    let versionName: String
    let duration: TimeInterval
}

enum PlaybackState: Equatable, Sendable {
    case idle
    case preparing
    case playing
    case paused
    case buffering
    case ended
    case failed(String)

    var isPlayingOrWaiting: Bool {
        self == .playing || self == .buffering
    }

    var statusText: String? {
        switch self {
        case .idle, .playing, .paused, .ended:
            nil
        case .preparing:
            "Loading audio…"
        case .buffering:
            "Buffering…"
        case let .failed(message):
            message
        }
    }
}

struct PlaybackFailureContext: Sendable {
    let track: PlaybackTrack
    let resumeTime: TimeInterval
    let shouldResume: Bool
    let message: String
}

enum PlaybackTimeline {
    static func clamp(_ time: TimeInterval, duration: TimeInterval) -> TimeInterval {
        guard time.isFinite, duration.isFinite, duration > 0 else { return 0 }
        return min(max(0, time), duration)
    }
}

@MainActor
final class NativeAudioEngine: NSObject, ObservableObject {
    @Published private(set) var state: PlaybackState = .idle
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var outputRouteName = "iPhone"
    @Published private(set) var isExternalPlaybackActive = false

    var onPlaybackFailure: ((PlaybackFailureContext) -> Void)?

    private let audioSession: AVAudioSession
    private let notificationCenter: NotificationCenter
    private let commandCenter: MPRemoteCommandCenter
    private let nowPlayingCenter: MPNowPlayingInfoCenter

    private var player: AVPlayer?
    private var currentTrack: PlaybackTrack?
    private var periodicTimeObserver: Any?
    private var playerObservation: NSKeyValueObservation?
    private var itemObservations: [NSKeyValueObservation] = []
    private var audioSessionNotificationTokens: [NSObjectProtocol] = []
    private var itemNotificationTokens: [NSObjectProtocol] = []
    private var remoteCommandTokens: [(MPRemoteCommand, Any)] = []
    private var pendingStartTime: TimeInterval = 0
    private var playbackRate: Float = 1
    private var wantsPlayback = false
    private var interruptionInProgress = false
    private var resumeAfterInterruption = false
    private var playerGeneration = 0
    private var failedPlayerGeneration: Int?

    init(
        audioSession: AVAudioSession = .sharedInstance(),
        notificationCenter: NotificationCenter = .default,
        commandCenter: MPRemoteCommandCenter = .shared(),
        nowPlayingCenter: MPNowPlayingInfoCenter = .default()
    ) {
        self.audioSession = audioSession
        self.notificationCenter = notificationCenter
        self.commandCenter = commandCenter
        self.nowPlayingCenter = nowPlayingCenter
        super.init()
        installAudioSessionObservers()
        installRemoteCommands()
        updateOutputRoute()
    }

    isolated deinit {
        if let periodicTimeObserver, let player {
            player.removeTimeObserver(periodicTimeObserver)
        }
        for token in audioSessionNotificationTokens + itemNotificationTokens {
            notificationCenter.removeObserver(token)
        }
        for (command, token) in remoteCommandTokens {
            command.removeTarget(token)
        }
    }

    func load(
        track: PlaybackTrack,
        url: URL,
        autoplay: Bool,
        startTime: TimeInterval = 0
    ) {
        removePlayer()
        currentTrack = track
        currentTime = PlaybackTimeline.clamp(startTime, duration: track.duration)
        pendingStartTime = currentTime
        wantsPlayback = autoplay
        state = .preparing
        let generation = playerGeneration

        let item = AVPlayerItem(url: url)
        item.preferredForwardBufferDuration = 20
        item.canUseNetworkResourcesForLiveStreamingWhilePaused = false

        let player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause
        player.allowsExternalPlayback = true
        player.automaticallyWaitsToMinimizeStalling = true
        if #available(iOS 15.0, *) {
            player.audiovisualBackgroundPlaybackPolicy = .continuesIfPossible
        }
        self.player = player

        installPlayerObservers(player: player, item: item, generation: generation)
        installTimeObserver(player: player, generation: generation)
        setRemoteCommandsEnabled(true)
        updateNowPlayingInfo()
    }

    func togglePlayback() {
        wantsPlayback ? pause() : play()
    }

    func isLoaded(trackID: String) -> Bool {
        currentTrack?.id == trackID && player != nil
    }

    func play() {
        guard let player, let item = player.currentItem else { return }
        if interruptionInProgress {
            resumeAfterInterruption = true
            return
        }
        if state == .ended {
            seek(to: 0)
        }
        wantsPlayback = true

        do {
            try activateAudioSession()
        } catch {
            fail(with: "Audio output could not be activated: \(error.localizedDescription)")
            return
        }

        guard item.status == .readyToPlay else {
            state = .preparing
            return
        }

        player.playImmediately(atRate: playbackRate)
        state = player.timeControlStatus == .waitingToPlayAtSpecifiedRate ? .buffering : .playing
        updateNowPlayingPlaybackState()
    }

    func pause() {
        if interruptionInProgress {
            resumeAfterInterruption = false
        }
        wantsPlayback = false
        player?.pause()
        if currentTrack != nil, state != .ended {
            state = .paused
        }
        updateNowPlayingPlaybackState()
    }

    func stop() {
        wantsPlayback = false
        interruptionInProgress = false
        resumeAfterInterruption = false
        removePlayer()
        currentTrack = nil
        currentTime = 0
        state = .idle
        nowPlayingCenter.nowPlayingInfo = nil
        nowPlayingCenter.playbackState = .stopped
        setRemoteCommandsEnabled(false)
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
    }

    func seek(to time: TimeInterval) {
        guard let player, let track = currentTrack else { return }
        let generation = playerGeneration
        let clampedTime = PlaybackTimeline.clamp(time, duration: track.duration)
        currentTime = clampedTime
        let tolerance = CMTime(seconds: 0.02, preferredTimescale: 1_000)
        player.seek(
            to: CMTime(seconds: clampedTime, preferredTimescale: 1_000),
            toleranceBefore: tolerance,
            toleranceAfter: tolerance
        ) { [weak self] finished in
            guard finished else { return }
            Task { @MainActor [weak self] in
                guard let self, generation == playerGeneration else { return }
                updateNowPlayingPlaybackState()
            }
        }
    }

    func skip(by interval: TimeInterval) {
        seek(to: currentTime + interval)
    }

    func setPlaybackRate(_ rate: Double) {
        playbackRate = Float(min(max(rate, 0.5), 2))
        if wantsPlayback, player?.timeControlStatus == .playing {
            player?.rate = playbackRate
        }
        updateNowPlayingPlaybackState()
    }

    private func activateAudioSession() throws {
        try audioSession.setCategory(
            .playback,
            mode: .default,
            options: []
        )
        try audioSession.setActive(true)
        updateOutputRoute()
    }

    private func installPlayerObservers(
        player: AVPlayer,
        item: AVPlayerItem,
        generation: Int
    ) {
        playerObservation = player.observe(\.timeControlStatus, options: [.initial, .new]) {
            [weak self] player, _ in
            Task { @MainActor [weak self] in
                self?.handleTimeControlStatus(player.timeControlStatus, generation: generation)
            }
        }

        itemObservations = [
            item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    self?.handleItemStatus(item, generation: generation)
                }
            },
            item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
                guard item.isPlaybackBufferEmpty else { return }
                Task { @MainActor [weak self] in
                    guard
                        let self,
                        generation == playerGeneration,
                        self.player?.currentItem === item,
                        wantsPlayback
                    else { return }
                    state = .buffering
                }
            },
            item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
                guard item.isPlaybackLikelyToKeepUp else { return }
                Task { @MainActor [weak self] in
                    guard
                        let self,
                        generation == playerGeneration,
                        self.player?.currentItem === item,
                        wantsPlayback
                    else { return }
                    self.player?.playImmediately(atRate: playbackRate)
                }
            }
        ]

        itemNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVPlayerItem.didPlayToEndTimeNotification,
                object: item,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handlePlaybackEnded(generation: generation)
                }
            }
        )
        itemNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVPlayerItem.failedToPlayToEndTimeNotification,
                object: item,
                queue: .main
            ) { [weak self] notification in
                let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
                Task { @MainActor [weak self] in
                    self?.fail(
                        with: error?.localizedDescription ?? "Audio playback stopped unexpectedly.",
                        generation: generation
                    )
                }
            }
        )
        itemNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVPlayerItem.playbackStalledNotification,
                object: item,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, generation == playerGeneration, wantsPlayback else { return }
                    state = .buffering
                }
            }
        )
    }

    private func installTimeObserver(player: AVPlayer, generation: Int) {
        periodicTimeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 1_000),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor [weak self] in
                guard
                    let self,
                    generation == playerGeneration,
                    let track = currentTrack,
                    time.seconds.isFinite
                else { return }
                currentTime = PlaybackTimeline.clamp(time.seconds, duration: track.duration)
                updateNowPlayingElapsedTime()
            }
        }
    }

    private func removePlayer() {
        playerGeneration += 1
        failedPlayerGeneration = nil
        playerObservation = nil
        itemObservations.removeAll()
        if let periodicTimeObserver, let player {
            player.removeTimeObserver(periodicTimeObserver)
        }
        periodicTimeObserver = nil
        player?.pause()
        player = nil
        itemNotificationTokens.removeAll { token in
            notificationCenter.removeObserver(token)
            return true
        }
    }

    private func handleItemStatus(_ item: AVPlayerItem, generation: Int) {
        guard generation == playerGeneration, player?.currentItem === item else { return }
        switch item.status {
        case .unknown:
            state = .preparing
        case .readyToPlay:
            let startTime = pendingStartTime
            pendingStartTime = 0
            if startTime > 0 {
                seek(to: startTime)
            }
            if wantsPlayback {
                play()
            } else {
                state = .paused
            }
        case .failed:
            fail(
                with: item.error?.localizedDescription ?? "Audio could not be loaded.",
                generation: generation
            )
        @unknown default:
            fail(with: "Audio entered an unsupported playback state.", generation: generation)
        }
    }

    private func handleTimeControlStatus(_ status: AVPlayer.TimeControlStatus, generation: Int) {
        guard generation == playerGeneration, currentTrack != nil else { return }
        switch status {
        case .paused:
            if wantsPlayback, state != .preparing, state.failureMessage == nil {
                state = .buffering
            } else if state != .preparing, state != .ended, state.failureMessage == nil {
                state = .paused
            }
        case .waitingToPlayAtSpecifiedRate:
            if wantsPlayback {
                state = .buffering
            }
        case .playing:
            state = .playing
        @unknown default:
            break
        }
        isExternalPlaybackActive = player?.isExternalPlaybackActive ?? false
        updateNowPlayingPlaybackState()
    }

    private func handlePlaybackEnded(generation: Int) {
        guard generation == playerGeneration else { return }
        wantsPlayback = false
        if let track = currentTrack {
            currentTime = track.duration
        }
        state = .ended
        updateNowPlayingPlaybackState()
    }

    private func fail(with message: String, generation: Int? = nil) {
        let generation = generation ?? playerGeneration
        guard
            generation == playerGeneration,
            failedPlayerGeneration != generation
        else { return }
        failedPlayerGeneration = generation
        let shouldResume = wantsPlayback
        wantsPlayback = false
        player?.pause()
        state = .failed(message)
        updateNowPlayingPlaybackState()
        guard let currentTrack else { return }
        onPlaybackFailure?(
            PlaybackFailureContext(
                track: currentTrack,
                resumeTime: currentTime,
                shouldResume: shouldResume,
                message: message
            )
        )
    }

    private func installAudioSessionObservers() {
        audioSessionNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: audioSession,
                queue: .main
            ) { [weak self] notification in
                let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
                Task { @MainActor [weak self] in
                    self?.handleInterruption(rawType: rawType, rawOptions: rawOptions)
                }
            }
        )
        audioSessionNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: audioSession,
                queue: .main
            ) { [weak self] notification in
                let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
                Task { @MainActor [weak self] in self?.handleRouteChange(rawReason: rawReason) }
            }
        )
        audioSessionNotificationTokens.append(
            notificationCenter.addObserver(
                forName: AVAudioSession.mediaServicesWereResetNotification,
                object: audioSession,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor [weak self] in self?.handleMediaServicesReset() }
            }
        )
    }

    private func handleInterruption(rawType: UInt?, rawOptions: UInt?) {
        guard
            let rawType,
            let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return }

        switch type {
        case .began:
            interruptionInProgress = true
            resumeAfterInterruption = wantsPlayback
            wantsPlayback = false
            player?.pause()
            if currentTrack != nil {
                state = .paused
            }
            updateNowPlayingPlaybackState()
        case .ended:
            let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions ?? 0)
            interruptionInProgress = false
            if resumeAfterInterruption, options.contains(.shouldResume) {
                play()
            }
            resumeAfterInterruption = false
        @unknown default:
            break
        }
    }

    private func handleRouteChange(rawReason: UInt?) {
        updateOutputRoute()
        guard
            let rawReason,
            AVAudioSession.RouteChangeReason(rawValue: rawReason) == .oldDeviceUnavailable
        else { return }

        pause()
    }

    private func handleMediaServicesReset() {
        fail(with: "iOS reset its audio services. Reconnecting playback…")
    }

    private func updateOutputRoute() {
        let output = audioSession.currentRoute.outputs.first
        outputRouteName = output?.portName ?? "iPhone"
        isExternalPlaybackActive = player?.isExternalPlaybackActive ?? false
    }

    private func installRemoteCommands() {
        addRemoteTarget(to: commandCenter.playCommand) { [weak self] _ in
            Task { @MainActor [weak self] in self?.play() }
            return .success
        }

        addRemoteTarget(to: commandCenter.pauseCommand) { [weak self] _ in
            Task { @MainActor [weak self] in self?.pause() }
            return .success
        }

        addRemoteTarget(to: commandCenter.togglePlayPauseCommand) { [weak self] _ in
            Task { @MainActor [weak self] in self?.togglePlayback() }
            return .success
        }

        commandCenter.skipForwardCommand.preferredIntervals = [10]
        addRemoteTarget(to: commandCenter.skipForwardCommand) { [weak self] event in
            let interval = (event as? MPSkipIntervalCommandEvent)?.interval ?? 10
            Task { @MainActor [weak self] in self?.skip(by: interval) }
            return .success
        }

        commandCenter.skipBackwardCommand.preferredIntervals = [10]
        addRemoteTarget(to: commandCenter.skipBackwardCommand) { [weak self] event in
            let interval = (event as? MPSkipIntervalCommandEvent)?.interval ?? 10
            Task { @MainActor [weak self] in self?.skip(by: -interval) }
            return .success
        }

        addRemoteTarget(to: commandCenter.changePlaybackPositionCommand) { [weak self] event in
            guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            let position = positionEvent.positionTime
            Task { @MainActor [weak self] in self?.seek(to: position) }
            return .success
        }

        commandCenter.changePlaybackRateCommand.supportedPlaybackRates = [0.75, 1, 1.25, 1.5]
        addRemoteTarget(to: commandCenter.changePlaybackRateCommand) { [weak self] event in
            guard let rateEvent = event as? MPChangePlaybackRateCommandEvent else {
                return .commandFailed
            }
            let rate = Double(rateEvent.playbackRate)
            Task { @MainActor [weak self] in self?.setPlaybackRate(rate) }
            return .success
        }

        commandCenter.nextTrackCommand.isEnabled = false
        commandCenter.previousTrackCommand.isEnabled = false
        commandCenter.stopCommand.isEnabled = false
        setRemoteCommandsEnabled(false)
    }

    private func setRemoteCommandsEnabled(_ isEnabled: Bool) {
        commandCenter.playCommand.isEnabled = isEnabled
        commandCenter.pauseCommand.isEnabled = isEnabled
        commandCenter.togglePlayPauseCommand.isEnabled = isEnabled
        commandCenter.skipForwardCommand.isEnabled = isEnabled
        commandCenter.skipBackwardCommand.isEnabled = isEnabled
        commandCenter.changePlaybackPositionCommand.isEnabled = isEnabled
        commandCenter.changePlaybackRateCommand.isEnabled = isEnabled
    }

    private func addRemoteTarget(
        to command: MPRemoteCommand,
        handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
        let token = command.addTarget(handler: handler)
        remoteCommandTokens.append((command, token))
    }

    private func updateNowPlayingInfo() {
        guard let track = currentTrack else {
            nowPlayingCenter.nowPlayingInfo = nil
            return
        }
        nowPlayingCenter.nowPlayingInfo = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artist,
            MPMediaItemPropertyAlbumTitle: track.versionName,
            MPMediaItemPropertyPlaybackDuration: track.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: wantsPlayback ? playbackRate : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: playbackRate,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]
        updateNowPlayingPlaybackState()
    }

    private func updateNowPlayingElapsedTime() {
        guard var info = nowPlayingCenter.nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        nowPlayingCenter.nowPlayingInfo = info
    }

    private func updateNowPlayingPlaybackState() {
        guard var info = nowPlayingCenter.nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        info[MPNowPlayingInfoPropertyPlaybackRate] = wantsPlayback ? playbackRate : 0
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = playbackRate
        nowPlayingCenter.nowPlayingInfo = info
        nowPlayingCenter.playbackState = wantsPlayback ? .playing : .paused
    }
}

private extension PlaybackState {
    var failureMessage: String? {
        guard case let .failed(message) = self else { return nil }
        return message
    }
}
