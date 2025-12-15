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

    updateUI();
}

// ==================== UPDATE UI ====================
function updateUI() {
    hasData = deliveryData.features.length > 0;
    const totalPackages = deliveryData.features.reduce((sum, f) => sum + f.properties.packages, 0);

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
}

// ==================== MANEUVER ICONS ====================
function getManeuverIcon(type, modifier) {
    const icons = {
        'turn': {
            'left': 'fa-arrow-left',
            'right': 'fa-arrow-right',
            'slight left': 'fa-arrow-up rotate-left',
            'slight right': 'fa-arrow-up rotate-right',
            'sharp left': 'fa-arrow-left',
            'sharp right': 'fa-arrow-right',
            'uturn': 'fa-arrow-rotate-left'
        },
        'merge': 'fa-compress-arrows-alt',
        'depart': 'fa-play',
        'arrive': 'fa-flag-checkered',
        'fork': modifier === 'left' ? 'fa-code-branch flip-h' : 'fa-code-branch',
        'roundabout': 'fa-rotate-right',
        'rotary': 'fa-rotate-right',
        'exit roundabout': 'fa-arrow-up',
        'end of road': modifier === 'left' ? 'fa-arrow-left' : 'fa-arrow-right',
        'continue': 'fa-arrow-up',
        'new name': 'fa-arrow-up',
        'notification': 'fa-info-circle'
    };

    if (type === 'turn' && modifier) {
        return icons.turn[modifier] || 'fa-arrow-up';
    }

    return icons[type] || 'fa-arrow-up';
}

function formatDistance(meters) {
    if (meters < 1000) {
        return Math.round(meters) + ' m';
    }
    return (meters / 1000).toFixed(1) + ' km';
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return '< 1';
    }
    return Math.round(seconds / 60);
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
    document.getElementById('navHeader').classList.add('active');
    document.getElementById('cancelNavFab').classList.add('visible');


    // Update current step
    updateCurrentStep();

    // Start location tracking
    startLocationTracking();

    // Set navigation camera view
    setNavigationCamera();
}

function drawRoute(geometry) {
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


function updateCurrentStep() {
    if (currentStepIndex >= routeSteps.length) return;

    const step = routeSteps[currentStepIndex];
    const iconClass = getManeuverIcon(step.maneuver.type, step.maneuver.modifier);

    // Update maneuver icon
    const iconEl = document.getElementById('navManeuverIcon');
    iconEl.innerHTML = `<i class="fas ${iconClass}"></i>`;

    // Update distance and instruction
    document.getElementById('navDistanceToTurn').textContent = formatDistance(step.distance);
    document.getElementById('navInstructionText').textContent = step.maneuver.instruction || 'Siga em frente';

    // Update next step
    if (currentStepIndex + 1 < routeSteps.length) {
        const nextStep = routeSteps[currentStepIndex + 1];
        document.getElementById('navNextStep').style.display = 'flex';
        document.getElementById('navNextText').textContent = `Depois: ${nextStep.maneuver.instruction || 'Continue'}`;
    } else {
        document.getElementById('navNextStep').style.display = 'none';
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

    // Check if we passed current step
    if (currentStepIndex < routeSteps.length) {
        const step = routeSteps[currentStepIndex];
        const stepEnd = step.maneuver.location;
        const distanceToStep = getDistance(userLocation, stepEnd);

        // Update distance to turn
        document.getElementById('navDistanceToTurn').textContent = formatDistance(distanceToStep);

        // If within 20 meters of step end, move to next step
        if (distanceToStep < 20 && currentStepIndex < routeSteps.length - 1) {
            currentStepIndex++;
            updateCurrentStep();
        }
    }
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
    document.getElementById('navHeader').classList.remove('active');
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

            await renderMarkers();
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

        await renderMarkers();
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
