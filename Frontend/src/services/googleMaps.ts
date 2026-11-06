// Frontend/src/services/googleMaps.ts
// Loads the Google Maps JavaScript API once and resolves when it is ready to use.
let loading: Promise<void> | null = null;

const CALLBACK_NAME = '__fleetdashGoogleMapsReady';

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof google !== 'undefined' && google.maps && google.maps.Map) {
    return Promise.resolve();
  }
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    (window as unknown as Record<string, unknown>)[CALLBACK_NAME] = () => resolve();

    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(apiKey)}&v=weekly&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('The Google Maps script could not be loaded. Check your internet connection or ad blocker.'));
    };
    document.head.appendChild(script);
  });

  return loading;
}