// Frontend/src/canvas/cyberMapStyle.ts
// The look of the Google map: midnight teal land and water, soft pearl labels, teal roads.
export const CYBER_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#061a27' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9fb4bf' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#061a27' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Borders of countries and regions
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#4f7a8f' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#7fa3b5' }, { weight: 1.6 }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#f2f0e9' }] },

  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0b3048' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#0e3a57' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Streets and highways in teal
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#114466' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#061a27' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cfd8dc' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1f6a94' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0e3a57' }] },

  // Oceans, lakes and rivers
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#04111b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2b5f80' }] },
];