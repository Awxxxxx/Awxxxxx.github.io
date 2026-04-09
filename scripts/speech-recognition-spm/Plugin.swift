import AVFoundation
import Capacitor
import Foundation
import Speech

@objc(SpeechRecognition)
public class SpeechRecognition: CAPPlugin {

    let defaultMatches = 5
    let messageMissingPermission = "Missing speech recognition permission"
    let messageAccessDenied = "User denied access to speech recognition"
    let messageRestricted = "Speech recognition is restricted on this device"
    let messageNotDetermined = "Speech recognition permission has not been requested"
    let messageAccessDeniedMicrophone = "User denied access to microphone"
    let messageOngoing = "Speech recognition is already running"

    private var speechRecognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    @objc func available(_ call: CAPPluginCall) {
        let recognizer = SFSpeechRecognizer()
        call.resolve([
            "available": recognizer?.isAvailable ?? false
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.startRecognition(call)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.cleanupRecognition(shouldDeactivateAudioSession: true)
            self.notifyListeners("listeningState", data: ["status": "stopped"])
            call.resolve()
        }
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve([
            "listening": self.audioEngine?.isRunning ?? false
        ])
    }

    @objc func getSupportedLanguages(_ call: CAPPluginCall) {
        let supportedLanguages = SFSpeechRecognizer.supportedLocales().map(\.identifier).sorted()
        call.resolve([
            "languages": supportedLanguages
        ])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        let status = SFSpeechRecognizer.authorizationStatus()
        let permission: String
        switch status {
        case .authorized:
            permission = "granted"
        case .denied, .restricted:
            permission = "denied"
        case .notDetermined:
            permission = "prompt"
        @unknown default:
            permission = "prompt"
        }
        call.resolve(["speechRecognition": permission])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                switch status {
                case .authorized:
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            call.resolve([
                                "speechRecognition": granted ? "granted" : "denied"
                            ])
                        }
                    }
                case .denied, .restricted, .notDetermined:
                    self.checkPermissions(call)
                @unknown default:
                    self.checkPermissions(call)
                }
            }
        }
    }
}

private extension SpeechRecognition {
    func startRecognition(_ call: CAPPluginCall) {
        if audioEngine?.isRunning == true {
            reject(call, message: messageOngoing, code: "ONGOING")
            return
        }

        let authorizationStatus = SFSpeechRecognizer.authorizationStatus()
        switch authorizationStatus {
        case .authorized:
            break
        case .denied:
            reject(call, message: messageAccessDenied, code: "PERMISSION_DENIED")
            return
        case .restricted:
            reject(call, message: messageRestricted, code: "RESTRICTED")
            return
        case .notDetermined:
            reject(call, message: messageNotDetermined, code: "NOT_DETERMINED")
            return
        @unknown default:
            reject(call, message: messageMissingPermission, code: "UNKNOWN_PERMISSION")
            return
        }

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                if !granted {
                    self.reject(call, message: self.messageAccessDeniedMicrophone, code: "MIC_DENIED")
                    return
                }

                self.beginAuthorizedRecognition(call)
            }
        }
    }

    func beginAuthorizedRecognition(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "en-US"
        let maxResults = call.getInt("maxResults") ?? defaultMatches
        let partialResults = call.getBool("partialResults") ?? false

        cleanupRecognition(shouldDeactivateAudioSession: true)

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) else {
            reject(call, message: "Speech recognizer is unavailable for \(language)", code: "UNAVAILABLE")
            return
        }

        if !recognizer.isAvailable {
            reject(call, message: "Speech recognizer is currently unavailable", code: "UNAVAILABLE")
            return
        }

        speechRecognizer = recognizer
        audioEngine = AVAudioEngine()
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        recognitionRequest?.shouldReportPartialResults = partialResults

        guard let audioEngine, let recognitionRequest else {
            reject(call, message: "Unable to create speech recognition request", code: "INIT_FAILED")
            return
        }

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            CAPLog.print("⚡️  [SpeechRecognition] Audio session deactivate skipped:", error.localizedDescription)
        }

        do {
            try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            reject(call, message: "Audio session setup failed: \(error.localizedDescription)", error: error, code: "AUDIO_SESSION")
            return
        }

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            recognitionRequest.append(buffer)
        }

        var didResolveStart = false

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { result, error in
            if let result {
                let matches = Array(result.transcriptions.prefix(maxResults > 0 ? maxResults : self.defaultMatches)).map(\.formattedString)
                if partialResults {
                    self.notifyListeners("partialResults", data: ["matches": matches])
                } else if !didResolveStart {
                    didResolveStart = true
                    call.resolve(["matches": matches])
                }

                if result.isFinal {
                    self.cleanupRecognition(shouldDeactivateAudioSession: true)
                    self.notifyListeners("listeningState", data: ["status": "stopped"])
                }
            }

            if let error {
                let message = "Speech recognition failed: \(error.localizedDescription)"
                CAPLog.print("⚡️  [SpeechRecognition] \(message)")
                self.cleanupRecognition(shouldDeactivateAudioSession: true)
                self.notifyListeners("listeningState", data: ["status": "stopped"])
                if !didResolveStart {
                    self.reject(call, message: message, error: error, code: "RECOGNITION_ERROR")
                }
            }
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            notifyListeners("listeningState", data: ["status": "started"])
            if partialResults {
                didResolveStart = true
                call.resolve()
            }
        } catch {
            reject(call, message: "Audio engine failed to start: \(error.localizedDescription)", error: error, code: "AUDIO_ENGINE")
        }
    }

    func cleanupRecognition(shouldDeactivateAudioSession: Bool) {
        recognitionTask?.cancel()
        recognitionTask = nil

        recognitionRequest?.endAudio()
        recognitionRequest = nil

        if let audioEngine {
            if audioEngine.isRunning {
                audioEngine.stop()
            }
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
        speechRecognizer = nil

        if shouldDeactivateAudioSession {
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                CAPLog.print("⚡️  [SpeechRecognition] Audio session deactivate failed:", error.localizedDescription)
            }
        }
    }

    func reject(_ call: CAPPluginCall, message: String, error: Error? = nil, code: String? = nil) {
        CAPLog.print("⚡️  [SpeechRecognition] \(message)")
        call.reject(message, code, error)
    }
}
