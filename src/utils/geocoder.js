/**
 * Geocoding Utility for MSREG Inventory App
 * Priority 1: Google Maps Geocoding API (100% rooftop accuracy)
 * Priority 2: OpenStreetMap Nominatim with Missouri bias (free fallback)
 */

let googleMapsLoaded = false;
let googleMapsPromise = null;

export const loadGoogleMaps = () => {
  if (googleMapsLoaded && window.google?.maps?.Geocoder) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.resolve(null);

  googleMapsPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      resolve(window.google?.maps || null);
    };
    script.onerror = () => {
      console.warn('Google Maps JS script failed to load.');
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

// Main geocode function
export const geocodeAddress = async (street, city = '') => {
  const streetClean = (street || '').trim();
  const cityClean = (city || '').trim();
  if (!streetClean) return null;

  const fullQuery = `${streetClean}${cityClean ? ', ' + cityClean : ''}, MO, USA`;

  // 1. Try Google Maps Geocoder first if API key is present
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
                lat: loc.lat(),
                lng: loc.lng(),
                formattedAddress: results[0].formatted_address
              });
            } else {
              console.warn('Google Geocoder status:', status);
              resolve(null);
            }
          }
        );
      });

      if (result) return result;
    }
  } catch (err) {
    console.warn('Google Geocoder error:', err);
  }

  // 2. Fallback: OpenStreetMap Nominatim
  try {
    const queries = [
      `${streetClean}${cityClean ? ', ' + cityClean : ''}, Missouri, USA`,
      `${streetClean}, Missouri, USA`
    ];

    for (const q of queries) {
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
    }
  } catch (e) {
    console.warn('Nominatim fallback failed:', e);
  }

  return null;
};
