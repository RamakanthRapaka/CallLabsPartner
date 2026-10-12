import { getCrashlytics, recordError, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics'

export function initCrashReporting() {
  try { void setCrashlyticsCollectionEnabled(getCrashlytics(), true) } catch { /* Expo Go has no native module. */ }
}

export function reportError(error: unknown) {
  try { recordError(getCrashlytics(), error instanceof Error ? error : new Error(String(error))) } catch { /* Never interrupt the app. */ }
}
