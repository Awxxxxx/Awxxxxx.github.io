const fs = require('fs');
const path = require('path');

const packageRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
);

const packageSwiftPath = path.join(packageRoot, 'Package.swift');
const bridgeSwiftPath = path.join(packageRoot, 'ios', 'Plugin', 'SpeechRecognitionSPMBridge.swift');

const packageSwift = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorCommunitySpeechRecognition",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorCommunitySpeechRecognition",
            targets: ["SpeechRecognitionPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SpeechRecognitionPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Plugin",
            exclude: ["Info.plist", "Plugin.h", "Plugin.m"])
    ]
)
`;

const bridgeSwift = `import Capacitor

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
`;

if (!fs.existsSync(packageRoot)) {
  console.warn('[speech-recognition-spm] Package not installed, skipping SPM shim.');
  process.exit(0);
}

fs.writeFileSync(packageSwiftPath, packageSwift);
fs.writeFileSync(bridgeSwiftPath, bridgeSwift);
console.log('[speech-recognition-spm] Ensured Package.swift for @capacitor-community/speech-recognition');
