const fs = require('fs');
const path = require('path');

const templateRoot = path.join(__dirname, 'speech-recognition-spm');
const packageRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'speech-recognition',
);

const packageSwiftPath = path.join(packageRoot, 'Package.swift');
const bridgeSwiftPath = path.join(packageRoot, 'ios', 'Plugin', 'SpeechRecognitionSPMBridge.swift');
const pluginSwiftPath = path.join(packageRoot, 'ios', 'Plugin', 'Plugin.swift');

if (!fs.existsSync(packageRoot)) {
  console.warn('[speech-recognition-spm] Package not installed, skipping SPM shim.');
  process.exit(0);
}

fs.copyFileSync(path.join(templateRoot, 'Package.swift'), packageSwiftPath);
fs.copyFileSync(path.join(templateRoot, 'SpeechRecognitionSPMBridge.swift'), bridgeSwiftPath);
fs.copyFileSync(path.join(templateRoot, 'Plugin.swift'), pluginSwiftPath);
console.log('[speech-recognition-spm] Ensured SPM shim and patched iOS plugin for @capacitor-community/speech-recognition');
