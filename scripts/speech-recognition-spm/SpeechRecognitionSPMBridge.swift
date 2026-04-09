import Capacitor

extension SpeechRecognition: CAPBridgedPlugin {
    public var identifier: String { "SpeechRecognition" }
    public var jsName: String { "SpeechRecognition" }
    public var pluginMethods: [CAPPluginMethod] {
        [
            CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "removeAllListeners", returnType: CAPPluginReturnPromise)
        ]
    }
}
