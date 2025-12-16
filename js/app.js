// ==================== CONFIGURATION ====================
const SUPABASE_URL = 'https://xmaktksnrejxhppmesbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtYWt0a3NucmVqeGhwcG1lc2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzE5MzYsImV4cCI6MjA4MTQwNzkzNn0.xHSjuDR5XixKXwdRaRaM4XK6SiMtMD8NJvLJi1eUDuQ';
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGFuaWxvYWZrIiwiYSI6ImNtajdra3l0aTA1MXUzZXB2bzByZjVjMXUifQ.RyPdNBII88Qk9xE3j8Rijw';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Mapbox API Key
mapboxgl.accessToken = MAPBOX_TOKEN;

// ==================== DARK MODE ====================
function initDarkMode() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (event.matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    });
}

initDarkMode();

// ==================== GLOBAL STATE ====================
let deliveryData = { type: 'FeatureCollection', features: [] };
let hasData = false;
let map;
let popup;
let userLocation = null;
let userHeading = null;
let watchId = null;

// Navigation state
let isNavigating = false;
let currentNavigation = null;
let routeSteps = [];
let currentStepIndex = 0;
let isMapCentered = true;
let routeCoordinates = []; // Store full route coordinates
let isRecalculating = false; // Prevent multiple recalculations
let lastRecalculationTime = 0; // Throttle recalculations

// Markers state
let markersVisible = false;

// ==================== MAP INITIALIZATION ====================
const isDark = document.documentElement.classList.contains('dark');

map = new mapboxgl.Map({
    container: 'map',
    style: isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
    center: [-48.4650, -1.1500],
    zoom: 12
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

const geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true
});
map.addControl(geolocateControl, 'top-right');
map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

// Track user location
geolocateControl.on('geolocate', (e) => {
    userLocation = [e.coords.longitude, e.coords.latitude];
    if (e.coords.heading) {
        userHeading = e.coords.heading;
    }

    // Update navigation if active
    if (isNavigating) {
        updateNavigationProgress();
    }
});

popup = new mapboxgl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 25,
    maxWidth: '320px'
});

// Detect when user moves the map during navigation
map.on('dragstart', () => {
    if (isNavigating) {
        isMapCentered = false;
        document.getElementById('recenterFab').classList.add('visible');
    }
});

// ==================== MARKER ICON CREATION ====================
const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
const baseSize = 40;
const baseHeight = 50;
const scaledSize = baseSize * pixelRatio;
const scaledHeight = baseHeight * pixelRatio;

function createMarkerIcon(number) {
    const svg = `
        <svg width="${scaledSize}" height="${scaledHeight}" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad${number}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#E53935;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#C62828;stop-opacity:1" />
                </linearGradient>
                <filter id="shadow${number}" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/>
                </filter>
            </defs>
            <path d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 30 20 30s20-18.954 20-30C40 8.954 31.046 0 20 0z"
                  fill="url(#grad${number})" filter="url(#shadow${number})"/>
            <circle cx="20" cy="18" r="11" fill="white"/>
            <text x="20" y="22.5" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
                  font-size="13" font-weight="700" fill="#C62828" text-anchor="middle">${number}</text>
        </svg>
    `;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

// ==================== RENDER MARKERS ====================
async function renderMarkers() {
    if (map.getLayer('delivery-markers')) map.removeLayer('delivery-markers');
    if (map.getLayer('delivery-shadows')) map.removeLayer('delivery-shadows');
    if (map.getSource('deliveries')) map.removeSource('deliveries');

    deliveryData.features.forEach(f => {
        const iconId = `marker-${f.properties.stop}`;
        if (map.hasImage(iconId)) map.removeImage(iconId);
    });

    if (deliveryData.features.length === 0) {
        updateUI();
        return;
    }

    const loadImages = deliveryData.features.map(feature => {
        return new Promise((resolve) => {
            const props = feature.properties;
            const iconId = `marker-${props.stop}`;

            const img = new Image();
            img.onload = () => {
                if (!map.hasImage(iconId)) {
                    map.addImage(iconId, img, { pixelRatio: pixelRatio });
                }
                resolve();
            };
            img.src = createMarkerIcon(props.stop);
        });
    });

    await Promise.all(loadImages);

    map.addSource('deliveries', {
        type: 'geojson',
        data: deliveryData
    });

    map.addLayer({
        id: 'delivery-shadows',
        type: 'circle',
        source: 'deliveries',
        paint: {
            'circle-radius': 8,
            'circle-color': '#000',
            'circle-opacity': 0.15,
            'circle-blur': 1,
            'circle-translate': [0, 20]
        }
    });

    map.addLayer({
        id: 'delivery-markers',
        type: 'symbol',
        source: 'deliveries',
        layout: {
            'icon-image': ['concat', 'marker-', ['to-string', ['get', 'stop']]],
            'icon-size': 1,
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true
        }
    });

    const bounds = new mapboxgl.LngLatBounds();
    deliveryData.features.forEach(f => bounds.extend(f.geometry.coordinates));
    map.fitBounds(bounds, { padding: 80 });

    markersVisible = true;
    updateToggleMarkersButton();
}

// ==================== UPDATE UI ====================
function updateUI() {
    hasData = deliveryData.features.length > 0;

    document.getElementById('emptyState').classList.toggle('hidden', hasData);

    const btn = document.getElementById('actionBtn');
    if (hasData) {
        btn.className = 'sidebar-btn clear';
        btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        btn.title = 'Limpar entregas';
    } else {
        btn.className = 'sidebar-btn upload';
        btn.innerHTML = '<i class="fas fa-file-upload"></i>';
        btn.title = 'Carregar planilha';
    }

    // Update toggle markers button
    updateToggleMarkersButton();
    updateAddressMenuButton();
}

function updateAddressMenuButton() {
    // Button is always visible - no action needed
}

function toggleAddressMenu() {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('sideMenuOverlay');
    const btn = document.getElementById('addressMenuBtn');

    if (menu.classList.contains('active')) {
        closeAddressMenu();
    } else {
        menu.classList.add('active');
        overlay.classList.add('active');
        btn.classList.add('active');
    }
}

function closeAddressMenu() {
    const menu = document.getElementById('sideMenu');
    const overlay = document.getElementById('sideMenuOverlay');
    const btn = document.getElementById('addressMenuBtn');

    menu.classList.remove('active');
    overlay.classList.remove('active');
    btn.classList.remove('active');
}

function updateToggleMarkersButton() {
    const toggleBtn = document.getElementById('toggleMarkersBtn');

    if (hasData) {
        toggleBtn.classList.add('visible');

        if (markersVisible) {
            toggleBtn.classList.remove('show-markers');
            toggleBtn.classList.add('hide-markers');
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            toggleBtn.title = 'Ocultar marcadores';
        } else {
            toggleBtn.classList.remove('hide-markers');
            toggleBtn.classList.add('show-markers');
            toggleBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
            toggleBtn.title = 'Mostrar marcadores';
        }
    } else {
        toggleBtn.classList.remove('visible', 'show-markers', 'hide-markers');
        markersVisible = false;
    }
}

function toggleMarkers() {
    if (!hasData) return;

    if (markersVisible) {
        // Hide markers
        hideMarkers();
    } else {
        // Show markers
        renderMarkers();
    }
}

function hideMarkers() {
    if (map.getLayer('delivery-markers')) map.removeLayer('delivery-markers');
    if (map.getLayer('delivery-shadows')) map.removeLayer('delivery-shadows');
    if (map.getSource('deliveries')) map.removeSource('deliveries');

    markersVisible = false;
    updateToggleMarkersButton();
}


// ==================== NAVIGATION FUNCTIONS ====================
async function navigateToStop(stop, coordinates, address) {
    if (!userLocation) {
        // Try to get user location
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000
                    });
                });
                userLocation = [position.coords.longitude, position.coords.latitude];
            } catch (error) {
                showToast('Ative a localização para navegar', 'error');
                return;
            }
        } else {
            showToast('Localização não disponível', 'error');
            return;
        }
    }

    currentNavigation = { stop, coordinates, address };
    popup.remove();

    showToast('Calculando rota...', 'info');

    try {
        // Get detailed directions with steps
        const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation[0]},${userLocation[1]};${coordinates[0]},${coordinates[1]}?geometries=geojson&overview=full&steps=true&voice_instructions=true&banner_instructions=true&language=pt&access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            showToast('Não foi possível calcular a rota', 'error');
            return;
        }

        const route = data.routes[0];
        routeSteps = route.legs[0].steps;
        currentStepIndex = 0;

        // Start navigation mode
        startNavigationMode(route, coordinates);

    } catch (error) {
        console.error('Navigation error:', error);
        showToast('Erro ao calcular rota', 'error');
    }
}

function startNavigationMode(route, destination) {
    isNavigating = true;
    isMapCentered = true;

    // Draw route on map
    drawRoute(route.geometry);

    // Update UI
    document.body.classList.add('navigating');
    document.getElementById('cancelNavFab').classList.add('visible');


    // Start location tracking
    startLocationTracking();

    // Set navigation camera view
    setNavigationCamera();
}

function drawRoute(geometry) {
    // Store route coordinates for progressive removal
    routeCoordinates = [...geometry.coordinates];

    // Remove existing route
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-outline')) map.removeLayer('route-outline');
    if (map.getLayer('route-casing')) map.removeLayer('route-casing');
    if (map.getSource('route')) map.removeSource('route');

    // Add route source
    map.addSource('route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: geometry
        }
    });

    // Find first label layer to insert route below it
    const layers = map.getStyle().layers;
    let labelLayerId;
    for (const layer of layers) {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
            labelLayerId = layer.id;
            break;
        }
    }

    // Add route casing (for 3D effect)
    map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#0D47A1',
            'line-width': 14,
            'line-opacity': 0.4
        }
    }, labelLayerId);

    // Add route outline
    map.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#1565C0',
            'line-width': 10
        }
    }, labelLayerId);

    // Add route line
    map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#42A5F5',
            'line-width': 6
        }
    }, labelLayerId);
}

// Update route to remove passed segments
function updateRouteProgress() {
    if (!userLocation || routeCoordinates.length < 2) return;

    // Find the closest point on the route to user location
    let closestIndex = 0;
    let closestDistance = Infinity;

    for (let i = 0; i < routeCoordinates.length; i++) {
        const coord = routeCoordinates[i];
        const distance = getDistance(userLocation, coord);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    // If user is too far from route (more than 50m), recalculate
    if (closestDistance > 50) {
        recalculateRoute();
        return;
    }

    // Only update if we've moved past the first point and are close to route
    if (closestIndex > 0) {
        // Create new coordinates starting from closest point
        // Interpolate to user's exact position for smooth transition
        const remainingCoords = [[...userLocation], ...routeCoordinates.slice(closestIndex + 1)];

        if (remainingCoords.length >= 2) {
            const routeSource = map.getSource('route');
            if (routeSource) {
                routeSource.setData({
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: remainingCoords
                    }
                });
            }
        }
    }
}

// Recalculate route when user goes off-route
async function recalculateRoute() {
    // Prevent multiple simultaneous recalculations
    if (isRecalculating) return;

    // Throttle: minimum 5 seconds between recalculations
    const now = Date.now();
    if (now - lastRecalculationTime < 5000) return;

    isRecalculating = true;
    lastRecalculationTime = now;

    try {
        const destination = currentNavigation.coordinates;

        const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${userLocation[0]},${userLocation[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full&steps=true&voice_instructions=true&banner_instructions=true&language=pt&access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];

            // Update route steps
            routeSteps = route.legs[0].steps;
            currentStepIndex = 0;

            // Update route coordinates
            routeCoordinates = [...route.geometry.coordinates];

            // Update the route on map
            const routeSource = map.getSource('route');
            if (routeSource) {
                routeSource.setData({
                    type: 'Feature',
                    properties: {},
                    geometry: route.geometry
                });
            }

        }
    } catch (error) {
        console.error('Error recalculating route:', error);
    } finally {
        isRecalculating = false;
    }
}



function startLocationTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            userLocation = [position.coords.longitude, position.coords.latitude];
            if (position.coords.heading) {
                userHeading = position.coords.heading;
            }

            if (isNavigating) {
                updateNavigationProgress();

                if (isMapCentered) {
                    setNavigationCamera();
                }
            }
        },
        (error) => {
            console.error('Geolocation error:', error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 5000
        }
    );
}

function setNavigationCamera() {
    if (!userLocation) return;

    map.easeTo({
        center: userLocation,
        zoom: 17,
        pitch: 60,
        bearing: userHeading || 0,
        duration: 1000
    });
}

function updateNavigationProgress() {
    if (!currentNavigation || !userLocation) return;

    const destination = currentNavigation.coordinates;
    const distanceToDestination = getDistance(userLocation, destination);

    // Check if arrived (within 30 meters)
    if (distanceToDestination < 30) {
        showArrival();
        return;
    }

    // Update route visualization (remove passed segments)
    updateRouteProgress();
}

function getDistance(coord1, coord2) {
    const R = 6371000; // Earth's radius in meters
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function recenterMap() {
    isMapCentered = true;
    document.getElementById('recenterFab').classList.remove('visible');
    setNavigationCamera();
}

function showArrival() {
    isNavigating = false;

    document.getElementById('arrivalAddress').textContent = `Parada ${currentNavigation.stop} - ${currentNavigation.address}`;
    document.getElementById('arrivalOverlay').classList.add('active');
}

function closeArrival() {
    document.getElementById('arrivalOverlay').classList.remove('active');
    cancelNavigation();
}

function cancelNavigation() {
    isNavigating = false;
    currentNavigation = null;
    routeSteps = [];
    currentStepIndex = 0;
    routeCoordinates = [];
    isRecalculating = false;
    lastRecalculationTime = 0;

    // Stop location tracking
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    // Remove route from map
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-outline')) map.removeLayer('route-outline');
    if (map.getLayer('route-casing')) map.removeLayer('route-casing');
    if (map.getSource('route')) map.removeSource('route');

    // Hide navigation UI
    document.body.classList.remove('navigating');
    document.getElementById('recenterFab').classList.remove('visible');
    document.getElementById('cancelNavFab').classList.remove('visible');

    // Reset map view
    map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 500
    });

    // Fit to all markers
    if (deliveryData.features.length > 0) {
        setTimeout(() => {
            const bounds = new mapboxgl.LngLatBounds();
            deliveryData.features.forEach(f => bounds.extend(f.geometry.coordinates));
            map.fitBounds(bounds, { padding: 80 });
        }, 600);
    }
}

// ==================== MAP EVENTS ====================
map.on('load', async () => {
    await loadFromSupabase();

    map.on('mouseenter', 'delivery-markers', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'delivery-markers', () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('click', 'delivery-markers', (e) => {
        if (isNavigating) return; // Don't show popup during navigation

        const feature = e.features[0];
        const props = feature.properties;
        const coordinates = feature.geometry.coordinates.slice();

        const html = `
            <div class="popup-content">
                <div class="popup-header">
                    <div class="popup-stop">${props.stop}</div>
                    <div>
                        <div class="popup-title">Parada ${props.stop}</div>
                        <div class="popup-subtitle">Sequência de entrega</div>
                    </div>
                </div>
                <div class="popup-address">${props.address}</div>
                <div class="popup-footer">
                    <span class="popup-tag location">📍 ${props.bairro || 'Sem bairro'}</span>
                    <span class="popup-tag packages">📦 ${props.packages} pacote${props.packages > 1 ? 's' : ''}</span>
                </div>
                <div class="popup-actions">
                    <button class="popup-btn navigate" onclick="navigateToStop(${props.stop}, [${coordinates}], '${props.address.replace(/'/g, "\\'")}')">
                        <i class="fas fa-directions"></i>
                        Iniciar Navegação
                    </button>
                </div>
            </div>
        `;

        popup.setLngLat(coordinates).setHTML(html).addTo(map);
    });

    // Trigger geolocation on load
    setTimeout(() => geolocateControl.trigger(), 1000);
});

// ==================== SUPABASE FUNCTIONS ====================
async function loadFromSupabase() {
    try {
        showToast('Carregando dados...', 'info');

        const { data, error } = await supabase
            .from('deliveries')
            .select('*')
            .order('stop', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            deliveryData.features = data.map(row => ({
                type: 'Feature',
                properties: {
                    stop: row.stop,
                    address: row.address,
                    bairro: row.bairro,
                    packages: row.packages
                },
                geometry: {
                    type: 'Point',
                    coordinates: [row.lng, row.lat]
                }
            }));

            updateUI();
            showToast(`${data.length} entregas carregadas!`, 'success');
        } else {
            updateUI();
        }
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        showToast('Erro ao carregar dados', 'error');
        updateUI();
    }
}

async function saveToSupabase(stops) {
    try {
        await supabase.from('deliveries').delete().neq('id', 0);
        const { error } = await supabase.from('deliveries').insert(stops);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        throw error;
    }
}

async function clearSupabase() {
    try {
        const { error } = await supabase.from('deliveries').delete().neq('id', 0);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error clearing Supabase:', error);
        throw error;
    }
}

// ==================== FILE PROCESSING ====================
async function processFile(file) {
    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
        showToast('Processando planilha...', 'info');

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            throw new Error('Planilha vazia');
        }

        // Store raw data for QR code lookup
        window.rawSpreadsheetData = jsonData;

        // Pre-process data for faster list loading
        preprocessSpreadsheetData();

        const stopsMap = new Map();
        jsonData.forEach(row => {
            const stop = row['Stop'] || row['stop'];
            if (!stopsMap.has(stop)) {
                stopsMap.set(stop, {
                    stop: stop,
                    lat: row['Latitude'] || row['latitude'] || row['lat'],
                    lng: row['Longitude'] || row['longitude'] || row['lng'],
                    address: row['Destination Address'] || row['address'] || row['endereco'] || '',
                    bairro: row['Bairro'] || row['bairro'] || row['neighborhood'] || '',
                    packages: 1
                });
            } else {
                stopsMap.get(stop).packages++;
            }
        });

        const stops = Array.from(stopsMap.values());
        const validStops = stops.filter(s => s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng));

        if (validStops.length === 0) {
            throw new Error('Nenhum endereço válido encontrado');
        }

        showToast('Salvando no banco de dados...', 'info');
        await saveToSupabase(validStops);

        deliveryData.features = validStops.map(s => ({
            type: 'Feature',
            properties: {
                stop: s.stop,
                address: s.address,
                bairro: s.bairro,
                packages: s.packages
            },
            geometry: {
                type: 'Point',
                coordinates: [parseFloat(s.lng), parseFloat(s.lat)]
            }
        }));

        updateUI();
        showToast(`${validStops.length} entregas carregadas!`, 'success');

    } catch (error) {
        console.error('Error processing file:', error);
        showToast(error.message || 'Erro ao processar planilha', 'error');
    } finally {
        btn.disabled = false;
        updateUI();
    }
}

// ==================== EVENT HANDLERS ====================
document.getElementById('actionBtn').addEventListener('click', () => {
    if (hasData) {
        document.getElementById('confirmModal').classList.remove('hidden');
    } else {
        document.getElementById('fileInput').click();
    }
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
        e.target.value = '';
    }
});

function closeModal() {
    document.getElementById('confirmModal').classList.add('hidden');
}

async function confirmClear() {
    closeModal();

    const btn = document.getElementById('actionBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
        showToast('Limpando dados...', 'info');
        await clearSupabase();

        deliveryData.features = [];
        markersVisible = false;
        popup.remove();
        cancelNavigation();

        if (map.getLayer('delivery-markers')) map.removeLayer('delivery-markers');
        if (map.getLayer('delivery-shadows')) map.removeLayer('delivery-shadows');
        if (map.getSource('deliveries')) map.removeSource('deliveries');

        updateUI();
        showToast('Dados limpos com sucesso!', 'success');

    } catch (error) {
        showToast('Erro ao limpar dados', 'error');
    } finally {
        btn.disabled = false;
        updateUI();
    }
}

// ==================== TOAST NOTIFICATION ====================
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `<i class="fas ${icons[type]}"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== QR CODE SCANNER (jsQR Optimized) ====================
let qrVideo = null;
let qrCanvas = null;
let qrCanvasContext = null;
let qrStream = null;
let qrAnimationFrame = null;
let isScanning = false;
let scannedData = null;
let registeredAddresses = [];

// Otimização 1: Resolução reduzida para processamento (640x480)
const PROCESS_WIDTH = 640;
const PROCESS_HEIGHT = 480;

// Otimização 2: Região de Interesse (ROI) - área central menor
const SCAN_SIZE = 300; // Área de 300x300 pixels no centro

function openQrScanner() {
    const modal = document.getElementById('qrModalOverlay');
    modal.classList.add('active');

    // Reset state
    scannedData = null;
    document.getElementById('qrResult').style.display = 'none';
    document.getElementById('qrConfirmBtn').disabled = true;
    document.getElementById('qrStatus').textContent = 'Iniciando câmera...';
    document.getElementById('qrStatus').className = 'qr-status';

    // Initialize scanner
    startQrScanner();
}

function closeQrScanner() {
    const modal = document.getElementById('qrModalOverlay');
    modal.classList.remove('active');

    // Stop scanner
    stopQrScanner();
}

async function startQrScanner() {
    try {
        qrVideo = document.getElementById('qrVideo');
        qrCanvas = document.getElementById('qrCanvas');
        qrCanvasContext = qrCanvas.getContext('2d', { willReadFrequently: true });

        // Solicitar acesso à câmera traseira
        qrStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        qrVideo.srcObject = qrStream;
        qrVideo.setAttribute('playsinline', true);

        await qrVideo.play();

        // Configurar canvas com resolução otimizada (Otimização 1)
        qrCanvas.width = PROCESS_WIDTH;
        qrCanvas.height = PROCESS_HEIGHT;

        isScanning = true;
        document.getElementById('qrStatus').textContent = 'Posicione o QR Code no centro';
        document.getElementById('qrStatus').className = 'qr-status';

        // Iniciar loop de processamento
        tick();

    } catch (err) {
        console.error('Error starting QR scanner:', err);
        document.getElementById('qrStatus').textContent = 'Erro ao acessar câmera. Verifique as permissões.';
        document.getElementById('qrStatus').className = 'qr-status error';
    }
}

function stopQrScanner() {
    isScanning = false;

    // Cancelar animation frame
    if (qrAnimationFrame) {
        cancelAnimationFrame(qrAnimationFrame);
        qrAnimationFrame = null;
    }

    // Parar stream de vídeo
    if (qrStream) {
        qrStream.getTracks().forEach(track => track.stop());
        qrStream = null;
    }

    // Limpar vídeo
    if (qrVideo) {
        qrVideo.srcObject = null;
    }
}

function tick() {
    if (!isScanning || !qrVideo || qrVideo.readyState !== qrVideo.HAVE_ENOUGH_DATA) {
        if (isScanning) {
            qrAnimationFrame = requestAnimationFrame(tick);
        }
        return;
    }

    // Desenhar frame do vídeo no canvas com resolução reduzida (Otimização 1)
    const processHeight = (qrVideo.videoHeight / qrVideo.videoWidth) * PROCESS_WIDTH;
    qrCanvas.width = PROCESS_WIDTH;
    qrCanvas.height = processHeight;

    qrCanvasContext.drawImage(qrVideo, 0, 0, PROCESS_WIDTH, processHeight);

    // Otimização 2: Capturar apenas a Região de Interesse (ROI) - centro da imagem
    const centerX = PROCESS_WIDTH / 2;
    const centerY = processHeight / 2;

    // Calcular área de scan proporcional
    const scanWidth = Math.min(SCAN_SIZE, PROCESS_WIDTH * 0.8);
    const scanHeight = Math.min(SCAN_SIZE, processHeight * 0.8);

    const roiX = Math.max(0, centerX - scanWidth / 2);
    const roiY = Math.max(0, centerY - scanHeight / 2);

    // Capturar apenas o centro da imagem (Otimização 2)
    const imageData = qrCanvasContext.getImageData(
        roiX,
        roiY,
        scanWidth,
        scanHeight
    );

    // Processar com jsQR - Otimização 3: attemptBoth para códigos invertidos
    const code = jsQR(imageData.data, scanWidth, scanHeight, {
        inversionAttempts: 'attemptBoth'  // Permite leitura de QR codes invertidos
    });

    if (code) {
        // QR Code encontrado!
        onQrCodeDetected(code.data);
    } else {
        // Continuar escaneando
        qrAnimationFrame = requestAnimationFrame(tick);
    }
}

function onQrCodeDetected(decodedText) {
    // Parar scanner
    stopQrScanner();

    // Vibrar para feedback (se disponível)
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }

    // Extract SPX code from QR data
    const spxCode = extractSpxCode(decodedText);

    if (spxCode) {
        // Search for address in delivery data
        const addressData = findAddressBySpxCode(spxCode);

        if (addressData) {
            scannedData = {
                spxCode: spxCode,
                address: addressData.address,
                stop: addressData.stop,
                bairro: addressData.bairro
            };

            document.getElementById('qrCodeValue').textContent = spxCode;
            document.getElementById('qrAddressValue').textContent = addressData.address;
            document.getElementById('qrResult').style.display = 'block';
            document.getElementById('qrStatus').textContent = 'QR Code lido com sucesso!';
            document.getElementById('qrStatus').className = 'qr-status success';
            document.getElementById('qrConfirmBtn').disabled = false;
        } else {
            document.getElementById('qrStatus').textContent = 'Código SPX não encontrado na planilha';
            document.getElementById('qrStatus').className = 'qr-status error';

            // Reiniciar scanner após 2 segundos
            setTimeout(() => {
                if (document.getElementById('qrModalOverlay').classList.contains('active')) {
                    document.getElementById('qrStatus').textContent = 'Posicione o QR Code no centro';
                    document.getElementById('qrStatus').className = 'qr-status';
                    startQrScanner();
                }
            }, 2000);
        }
    } else {
        document.getElementById('qrStatus').textContent = 'QR Code inválido. Tente novamente.';
        document.getElementById('qrStatus').className = 'qr-status error';

        // Reiniciar scanner após 2 segundos
        setTimeout(() => {
            if (document.getElementById('qrModalOverlay').classList.contains('active')) {
                document.getElementById('qrStatus').textContent = 'Posicione o QR Code no centro';
                document.getElementById('qrStatus').className = 'qr-status';
                startQrScanner();
            }
        }, 2000);
    }
}

function extractSpxCode(text) {
    // Look for SPX TN pattern (e.g., "BR2548334621214")
    // SPX TN codes start with BR followed by alphanumeric characters
    const patterns = [
        /BR[A-Z0-9]{10,}/i,     // BR + at least 10 alphanumeric chars
        /SPX[A-Z0-9]+/i,         // SPX pattern
        /SPXBR[A-Z0-9]+/i,       // SPXBR pattern
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[0].toUpperCase();
        }
    }

    // If no pattern found, return the whole text if it looks like a code (15 chars typical for SPX TN)
    const trimmedText = text.trim();
    if (trimmedText.length >= 10 && trimmedText.length <= 30 && /^[A-Z0-9]+$/i.test(trimmedText)) {
        return trimmedText.toUpperCase();
    }

    return null;
}

function findAddressBySpxCode(spxCode) {
    // Search in the raw spreadsheet data
    if (window.rawSpreadsheetData) {
        for (const row of window.rawSpreadsheetData) {
            // Check SPX TN column (primary) and other common column names
            const trackingNumber = row['SPX TN'] || row['TN'] || row['Tracking Number'] ||
                                  row['SPX'] || row['tracking_number'] || row['Código'] ||
                                  row['codigo'] || row['Package ID'] || row['package_id'];

            if (trackingNumber) {
                const tnUpper = trackingNumber.toString().toUpperCase();
                const spxUpper = spxCode.toUpperCase();

                // Exact match or contains match
                if (tnUpper === spxUpper || tnUpper.includes(spxUpper) || spxUpper.includes(tnUpper)) {
                    return {
                        address: row['Destination Address'] || row['address'] || row['endereco'] || '',
                        stop: row['Stop'] || row['stop'],
                        bairro: row['Bairro'] || row['bairro'] || row['neighborhood'] || '',
                        sequence: row['Sequence'] || row['sequence'],
                        city: row['City'] || row['city'] || ''
                    };
                }
            }
        }
    }

    return null;
}

function confirmRegistration() {
    if (!scannedData) return;

    // Add to registered addresses list (only address, name and phone for later editing)
    registeredAddresses.push({
        address: scannedData.address,
        bairro: scannedData.bairro,
        stop: scannedData.stop,
        spxCode: scannedData.spxCode, // Keep internally for tracking but don't display
        name: '', // Empty - to be edited later
        phone: '', // Empty - to be edited later
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    // Update the address list UI
    updateAddressList();

    // Close the scanner
    closeQrScanner();

    // Show success message
    showToast('Endereço cadastrado com sucesso!', 'success');
}

function updateAddressList() {
    const emptyState = document.getElementById('addressEmptyState');
    const listContainer = document.getElementById('addressList');

    if (registeredAddresses.length === 0) {
        emptyState.style.display = 'flex';
        listContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    listContainer.style.display = 'flex';

    listContainer.innerHTML = registeredAddresses.map((item, index) => `
        <div class="address-item editable" onclick="openEditModal(${index})">
            <div class="address-item-header">
                <span class="address-item-time">${item.timestamp}</span>
            </div>
            <div class="address-item-text">${item.address}</div>
            <div class="address-item-details">
                <div class="address-item-detail ${item.name ? '' : 'empty'}">
                    <i class="fas fa-user"></i>
                    <span>${item.name || 'Toque para adicionar nome'}</span>
                </div>
                <div class="address-item-detail ${item.phone ? '' : 'empty'}">
                    <i class="fas fa-phone"></i>
                    <span>${item.phone || 'Toque para adicionar telefone'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ==================== EDIT ADDRESS FUNCTIONS ====================
let currentEditIndex = -1;

function openEditModal(index) {
    if (index < 0 || index >= registeredAddresses.length) return;

    currentEditIndex = index;
    const item = registeredAddresses[index];

    // Populate modal with current data
    document.getElementById('editAddressDisplay').innerHTML = `<p>${item.address}</p>`;
    document.getElementById('editName').value = item.name || '';
    document.getElementById('editPhone').value = item.phone || '';

    // Show modal
    document.getElementById('editModalOverlay').classList.add('active');

    // Focus on name field
    setTimeout(() => {
        document.getElementById('editName').focus();
    }, 300);
}

function closeEditModal() {
    document.getElementById('editModalOverlay').classList.remove('active');
    currentEditIndex = -1;
}

function saveEditedAddress() {
    if (currentEditIndex < 0 || currentEditIndex >= registeredAddresses.length) return;

    const name = document.getElementById('editName').value.trim();
    const phone = document.getElementById('editPhone').value.trim();

    // Update the address data
    registeredAddresses[currentEditIndex].name = name;
    registeredAddresses[currentEditIndex].phone = phone;

    // Update the UI
    updateAddressList();

    // Close modal
    closeEditModal();

    // Show success message
    showToast('Dados atualizados com sucesso!', 'success');
}

// Phone input formatting
document.getElementById('editPhone').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 0) {
        if (value.length <= 2) {
            value = `(${value}`;
        } else if (value.length <= 7) {
            value = `(${value.slice(0,2)}) ${value.slice(2)}`;
        } else {
            value = `(${value.slice(0,2)}) ${value.slice(2,7)}-${value.slice(7)}`;
        }
    }
    e.target.value = value;
});

// Close modal when clicking overlay
document.getElementById('editModalOverlay').addEventListener('click', function(e) {
    if (e.target === this) {
        closeEditModal();
    }
});

// ==================== MANUAL ADDRESS SELECTION ====================
let manualSelectionActive = false;

function toggleManualSelection() {
    const listContainer = document.getElementById('manualAddressList');
    const videoContainer = document.getElementById('qrVideoContainer');
    const statusElement = document.getElementById('qrStatus');
    const manualBtn = document.getElementById('manualSelectBtn');
    const isVisible = listContainer.style.display !== 'none';

    if (isVisible) {
        // Fechar seleção manual - voltar para QR scanner
        listContainer.style.display = 'none';
        manualBtn.innerHTML = '<i class="fas fa-list-ol"></i> Selecionar Manualmente';
        manualSelectionActive = false;

        // Só mostrar QR scanner se não houver endereço selecionado
        if (!scannedData) {
            videoContainer.style.display = 'block';
            statusElement.textContent = 'Posicione o QR Code no centro';
            statusElement.className = 'qr-status';
            startQrScanner();
        }
    } else {
        // Abrir seleção manual - esconder QR scanner
        stopQrScanner();
        videoContainer.style.display = 'none';
        statusElement.textContent = 'Selecione um endereço da lista';
        statusElement.className = 'qr-status';
        manualBtn.innerHTML = '<i class="fas fa-qrcode"></i> Voltar para QR Code';
        manualSelectionActive = true;

        populateManualAddressList();
        listContainer.style.display = 'block';
    }
}

// Cache for available addresses data
let availableAddressesCache = [];
let sortedSpreadsheetData = []; // Pre-sorted data cache

// Pre-process spreadsheet data when loaded
function preprocessSpreadsheetData() {
    if (!window.rawSpreadsheetData || window.rawSpreadsheetData.length === 0) {
        sortedSpreadsheetData = [];
        return;
    }
    // Sort once when data is loaded
    sortedSpreadsheetData = [...window.rawSpreadsheetData].sort((a, b) => {
        const seqA = a['Sequence'] || a['sequence'] || 0;
        const seqB = b['Sequence'] || b['sequence'] || 0;
        return seqA - seqB;
    });
}

function populateManualAddressList() {
    const listContent = document.getElementById('manualListContent');

    if (sortedSpreadsheetData.length === 0) {
        listContent.innerHTML = '<div class="manual-list-empty"><i class="fas fa-file-excel"></i><p>Nenhuma planilha carregada</p></div>';
        return;
    }

    // Show loading state immediately
    listContent.innerHTML = '<div class="manual-list-empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando...</p></div>';

    // Use requestAnimationFrame to not block the UI
    requestAnimationFrame(() => {
        // Filter out already registered addresses
        const registeredSpxCodes = new Set(registeredAddresses.map(a => a.spxCode.toUpperCase()));
        availableAddressesCache = sortedSpreadsheetData.filter(row => {
            const spx = row['SPX TN'] || row['TN'] || '';
            return !registeredSpxCodes.has(spx.toString().toUpperCase());
        });

        if (availableAddressesCache.length === 0) {
            listContent.innerHTML = '<div class="manual-list-empty"><i class="fas fa-check-circle"></i><p>Todos os endereços já foram cadastrados</p></div>';
            return;
        }

        // Build HTML string (faster for large lists)
        let html = '';
        for (let i = 0; i < availableAddressesCache.length; i++) {
            const row = availableAddressesCache[i];
            const sequence = row['Sequence'] || row['sequence'] || '-';
            const spxTn = row['SPX TN'] || row['TN'] || '';
            const address = row['Destination Address'] || row['address'] || row['endereco'] || '';
            const bairro = row['Bairro'] || row['bairro'] || '';

            html += `<div class="manual-address-item" data-index="${i}"><div class="manual-item-sequence">${sequence}</div><div class="manual-item-info"><div class="manual-item-spx">${spxTn}</div><div class="manual-item-address">${address}</div>${bairro ? `<div class="manual-item-bairro">📍 ${bairro}</div>` : ''}</div></div>`;
        }

        listContent.innerHTML = html;
    });
}

// Event delegation for manual address selection
document.getElementById('manualListContent').addEventListener('click', function(e) {
    const item = e.target.closest('.manual-address-item');
    if (item && item.dataset.index !== undefined) {
        selectManualAddressByIndex(parseInt(item.dataset.index));
    }
});

// Optimized function using cached data
function selectManualAddressByIndex(index) {
    const row = availableAddressesCache[index];
    if (!row) return;

    const spxCode = row['SPX TN'] || row['TN'] || '';
    const address = row['Destination Address'] || row['address'] || row['endereco'] || '';
    const stop = row['Stop'] || row['stop'] || '';
    const bairro = row['Bairro'] || row['bairro'] || '';

    // Stop QR scanner if running
    stopQrScanner();

    // Set scanned data
    scannedData = {
        spxCode: spxCode,
        address: address,
        stop: stop,
        bairro: bairro
    };

    // Update UI - keep video hidden since selection was made manually
    document.getElementById('qrVideoContainer').style.display = 'none';
    document.getElementById('qrCodeValue').textContent = spxCode;
    document.getElementById('qrAddressValue').textContent = address;
    document.getElementById('qrResult').style.display = 'block';
    document.getElementById('qrStatus').textContent = 'Endereço selecionado!';
    document.getElementById('qrStatus').className = 'qr-status success';
    document.getElementById('qrConfirmBtn').disabled = false;

    // Hide manual list and reset button
    document.getElementById('manualAddressList').style.display = 'none';
    document.getElementById('manualSelectBtn').innerHTML = '<i class="fas fa-list-ol"></i> Selecionar Manualmente';
    manualSelectionActive = false;

    // Vibrate for feedback
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

// Legacy function for backwards compatibility
function selectManualAddress(index, spxTn) {
    selectManualAddressByIndex(index);
}

// ==================== MAP PIN SELECTION (DRAGGABLE MARKER) ====================
let isSelectingMapPin = false;
let draggableMarker = null;
let selectedPinCoordinates = null;

function startMapPinSelection() {
    // Close the QR modal
    closeQrScanner();

    // Set selecting mode
    isSelectingMapPin = true;
    document.body.classList.add('pin-selecting');

    // Get current map center or user location
    const center = userLocation || map.getCenter().toArray();

    // Create draggable marker element (simple pin without shadow)
    const markerEl = document.createElement('div');
    markerEl.className = 'draggable-pin-marker';
    markerEl.innerHTML = `
        <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="pinGradDrag" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#FF9800;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#F57C00;stop-opacity:1" />
                </linearGradient>
            </defs>
            <path d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 30 20 30s20-18.954 20-30C40 8.954 31.046 0 20 0z"
                  fill="url(#pinGradDrag)"/>
            <circle cx="20" cy="18" r="8" fill="white"/>
        </svg>
    `;

    // Create the draggable marker
    draggableMarker = new mapboxgl.Marker({
        element: markerEl,
        draggable: true,
        anchor: 'bottom'
    })
    .setLngLat(center)
    .addTo(map);

    // Store initial coordinates
    selectedPinCoordinates = center;

    // Update coordinates when marker is dragged
    draggableMarker.on('dragend', () => {
        const lngLat = draggableMarker.getLngLat();
        selectedPinCoordinates = [lngLat.lng, lngLat.lat];

        // Vibrate for feedback
        if (navigator.vibrate) {
            navigator.vibrate(30);
        }
    });

    // Show controls
    document.getElementById('mapPinControls').classList.add('active');

    // Center map on marker
    map.flyTo({
        center: center,
        zoom: 17,
        duration: 500
    });

    showToast('Arraste o marcador para o local desejado', 'info');
}

function cancelMapPinSelection() {
    // Remove marker
    if (draggableMarker) {
        draggableMarker.remove();
        draggableMarker = null;
    }

    // Reset state
    isSelectingMapPin = false;
    selectedPinCoordinates = null;
    document.body.classList.remove('pin-selecting');

    // Hide controls
    document.getElementById('mapPinControls').classList.remove('active');

    // Reopen QR scanner
    openQrScanner();
}

function confirmMapPinSelection() {
    if (!selectedPinCoordinates) {
        showToast('Posicione o marcador no mapa', 'error');
        return;
    }

    if (!scannedData) {
        showToast('Selecione primeiro um endereço da planilha', 'error');
        cancelMapPinSelection();
        return;
    }

    // Vibrate for feedback
    if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
    }

    // Add to registered addresses with custom coordinates
    registeredAddresses.push({
        address: scannedData.address,
        bairro: scannedData.bairro,
        stop: scannedData.stop,
        spxCode: scannedData.spxCode,
        name: '',
        phone: '',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        customCoordinates: {
            lng: selectedPinCoordinates[0],
            lat: selectedPinCoordinates[1]
        }
    });

    // Update the address list UI
    updateAddressList();

    // Remove marker
    if (draggableMarker) {
        draggableMarker.remove();
        draggableMarker = null;
    }

    // Reset state
    isSelectingMapPin = false;
    selectedPinCoordinates = null;
    scannedData = null;
    document.body.classList.remove('pin-selecting');

    // Hide controls
    document.getElementById('mapPinControls').classList.remove('active');

    // Show success message
    showToast('Endereço cadastrado com ponto personalizado!', 'success');
}

// Modify startMapPinSelection to work with selected address
function startMapPinSelectionWithAddress() {
    if (!scannedData) {
        showToast('Primeiro selecione um endereço', 'error');
        return;
    }
    startMapPinSelection();
}
