/**
 * Marca de pestaña: el usuario ya completó u omitió el asistente en esta
 * sesión, así que no se le vuelve a redirigir aunque falte configuración.
 */
export const ONBOARDING_DISMISSED_KEY = "mrrobot.onboarding.dismissed";

export function dismissOnboardingForSession(): void {
  try {
    window.sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
  } catch {
    // Sin almacenamiento: el guard volverá a comprobarlo en la siguiente carga.
  }
}

export function isOnboardingDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
