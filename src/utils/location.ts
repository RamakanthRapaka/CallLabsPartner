export async function captureArrivalLocation(): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const Location = await import('expo-location')
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== 'granted') return { latitude: null, longitude: null }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude }
  } catch {
    // Location is an enhancement; arrival and OTP must remain usable when GPS is unavailable.
    return { latitude: null, longitude: null }
  }
}
