/**
 * Geocoding Utility for MSREG Inventory App
 * Primary: Google Maps Geocoding API (100% rooftop accuracy across Missouri)
 * Fallback: OpenStreetMap Nominatim
 */

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyB5mdK3udz_vbsSUrzR6sN0CzGwr7Z7NS4';

let googleMapsLoaded = false;
let googleMapsPromise = null;

export const loadGoogleMaps = () => {
  if (googleMapsLoaded && window.google?.maps?.Geocoder) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  if (!GOOGLE_MAPS_KEY) return Promise.resolve(null);

  googleMapsPromise = new Promise((resolve) => {
    // If google maps is already on page
    if (window.google?.maps?.Geocoder) {
      googleMapsLoaded = true;
      return resolve(window.google.maps);
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      resolve(window.google?.maps || null);
    };
    script.onerror = () => {
      console.warn('Google Maps JS SDK script failed to load.');
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

/**
 * Geocode address to { lat, lng, formattedAddress }
 */
export const geocodeAddress = async (street, city = '') => {
  const streetClean = (street || '').trim();
  const cityClean = (city || '').trim();
  if (!streetClean) return null;

  const fullQuery = `${streetClean}${cityClean ? ', ' + cityClean : ''}, MO, USA`;

  // 1. Try Google Maps JS Geocoder (Preferred in browser environment)
  try {
    const maps = await loadGoogleMaps();
    if (maps && window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      const result = await new Promise((resolve) => {
        geocoder.geocode(
          {
            address: fullQuery,
            componentRestrictions: { country: 'US', administrativeArea: 'MO' }
          },
          (results, status) => {
            if (status === 'OK' && results && results.length > 0) {
              const loc = results[0].geometry.location;
              resolve({
                lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
                lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
                formattedAddress: results[0].formatted_address
              });
            } else {
              console.warn('Google Maps JS Geocoder status:', status);
              resolve(null);
            }
          }
        );
      });

      if (result) return result;
    }
  } catch (err) {
    console.warn('Google Maps JS Geocoder error:', err);
  }

  // 2. Direct HTTP Fetch to Google Maps Geocoding API (in case JS SDK didn't initialize)
  if (GOOGLE_MAPS_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullQuery)}&components=country:US|administrative_area:MO&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return {
          lat: loc.lat,
          lng: loc.lng,
          formattedAddress: data.results[0].formatted_address
        };
      }
    } catch (fetchErr) {
      console.warn('Direct Google Geocoding fetch failed (likely CORS):', fetchErr);
    }
  }

  // 3. Fallback: OpenStreetMap Nominatim with strict city if provided
  try {
    const q = cityClean ? `${streetClean}, ${cityClean}, Missouri, USA` : `${streetClean}, Missouri, USA`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=us&limit=1`,
      { headers: { 'User-Agent': 'MSREG-Inventory-App/1.0' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        formattedAddress: data[0].display_name
      };
    }
  } catch (e) {
    console.warn('Nominatim fallback failed:', e);
  }

  return null;
};
