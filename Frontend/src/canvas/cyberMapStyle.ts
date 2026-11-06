// Frontend/src/canvas/cyberMapStyle.ts
// The "cyber" look of the Google map: dark navy land and water, cyan borders, roads and labels.
export const CYBER_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#06111f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#67e8f9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#020617' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Borders of countries and regions
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#22d3ee' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#22d3ee' }, { weight: 1.8 }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a5f3fc' }] },

  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#071a2e' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#08263a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Streets and highways glow in cyan
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#0e7490' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#06111f' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a5f3fc' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22d3ee' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0891b2' }] },

  // Oceans, lakes and rivers
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020b18' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#155e75' }] },
];