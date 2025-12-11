// ======================================================
// routes.js — Modo Navegação, Roteamento e Recalcular Rota
// (Parte 7/8)
// ======================================================

import { AppState } from "./app.js";
import { showToast, debounce } from "./utils.js";

// ======================================================
// DIRECTIONS SERVICE
// ======================================================

let directionsService = null;

// Polylines da rota ativa
AppState.routePolylines = [];

// ======================================================
// INICIAR SISTEMA DE ROTAS
// ======================================================

export function setupRoutes() {
    directionsService = new google.maps.DirectionsService();

    document.getElementById("btnToggleRoute").onclick = startRouteMode;
    document.getElementById("btnClearRoute").onclick = clearRoutes;
    document.getElementById("btnStopNavigation").onclick = stopNavigationMode;

    console.log("📍 Routes system loaded.");
}

// ======================================================
// MODO ROTA (ativa marcadores e permite navegar)
// ======================================================

function startRouteMode() {
    const map = AppState.map;

    showToast("Modo rota ativado", "Buscando marcadores...", "info");

    document.getElementById("btnToggleRoute").style.display = "none";
    document.getElementById("btnClearRoute").style.display = "flex";

    // Marcadores já carregados na Parte 6
    // Em projetos reais chamaríamos algo como loadDeliveryMarkers()
    // O fluxo original fazia isso aqui.

    showToast("Toque em um marcador para navegar", "", "success");
}

// ======================================================
// LIMPAR TODAS AS ROTAS
// ======================================================

function clearRoutes() {
    for (const poly of AppState.routePolylines) {
        poly.setMap(null);
    }
    AppState.routePolylines = [];

    document.getElementById("btnToggleRoute").style.display = "flex";
    document.getElementById("btnClearRoute").style.display = "none";

    showToast("Rotas limpas", "", "info");
}

// ======================================================
// INICIAR NAVEGAÇÃO ATÉ UM PONTO
// ======================================================

export function navigateToPoint(lat, lng, title = "Destino") {
    const map = AppState.map;

    if (!AppState.gps || !AppState.gps.position) {
        showToast("GPS não disponível", "", "error");
        return;
    }

    const origin = AppState.gps.position;
    const dest = { lat, lng };

    showToast("Calculando rota...", "", "info");

    directionsService.route(
        {
            origin,
            destination: dest,
            travelMode: google.maps.TravelMode.DRIVING
        },
        (result, status) => {
            if (status !== "OK") {
                showToast("Erro ao calcular rota", status, "error");
                return;
            }

            drawRoute(result);
            startNavigationMode(dest, title);

            showToast("Rota pronta!", "", "success");
        }
    );
}

// ======================================================
// DESENHAR ROTA AZUL
// ======================================================

function drawRoute(result) {
    clearRoutes();

    const path = result.routes[0].overview_path;

    const poly = new google.maps.Polyline({
        map: AppState.map,
        path,
        strokeColor: "#4285F4",
        strokeOpacity: 0.8,
        strokeWeight: 6
    });

    AppState.routePolylines.push(poly);

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    AppState.map.fitBounds(bounds);
}

// ======================================================
// MODO NAVEGAÇÃO — SEGUIR O GPS
// ======================================================

let navLoop = null;

function startNavigationMode(destination, name) {
    AppState.navigationActive = true;

    document.getElementById("btnStopNavigation").style.display = "flex";
    document.getElementById("btn-add-client").style.display = "none";

    const map = AppState.map;

    showToast(`Navegando até ${name}`, "", "success");

    let animationFrame = null;

    const loop = () => {
        if (!AppState.navigationActive) return;

        const gps = AppState.gps;
        if (!gps || !gps.position) return;

        const pos = gps.position;

        map.panTo(pos);
        if (map.getZoom() < 16) map.setZoom(17);

        map.setTilt(45);
        map.setHeading(0);

        // Chegou ao destino (menos de 30m)
        if (distanceMeters(pos, destination) < 30) {
            showToast("Você chegou!", name, "success");
            stopNavigationMode();
            return;
        }

        animationFrame = requestAnimationFrame(loop);
    };

    navLoop = requestAnimationFrame(loop);
}

// ======================================================
// PARAR NAVEGAÇÃO
// ======================================================

function stopNavigationMode() {
    AppState.navigationActive = false;

    if (navLoop) cancelAnimationFrame(navLoop);
    navLoop = null;

    const map = AppState.map;
    map.setTilt(0);
    map.setHeading(0);

    document.getElementById("btnStopNavigation").style.display = "none";
    document.getElementById("btn-add-client").style.display = "flex";

    showToast("Navegação encerrada", "", "info");
}

// ======================================================
// DISTÂNCIA EM METROS
// ======================================================

function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;

    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ======================================================
// EXPOR FUNÇÃO PARA MARCADORES
// ======================================================

export function navigateToMarker(marker, label = "Destino") {
    const pos = marker.position || marker.getPosition();
    navigateToPoint(pos.lat, pos.lng, label);
}