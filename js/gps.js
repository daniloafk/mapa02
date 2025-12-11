// ============================================
// gps.js — Rastreamento de Localização
// (Parte 4/8)
// ============================================

import { updateStatus } from "./map.js";
import { AppState } from "./app.js";

// FPS alvo para animar o marcador suavemente
const UPDATE_INTERVAL = 120; // ms → ~8FPS (suave + econômico)

// Classe do marcador GPS
export class GPSTracker {
    constructor(map) {
        this.map = map;
        this.marker = null;
        this.position = null;
        this.accuracy = null;
        this.lastUpdate = 0;
        this.markerEl = null;
        this.animationFrame = null;
        this.smoothing = { lat: null, lng: null, variance: 10 };

        this.watchId = null;
    }

    // ============================================
    // INICIAR RASTREAMENTO GPS
    // ============================================
    start() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject("Geolocalização não suportada.");
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    this._createMarker(pos);
                    this._startWatch();
                    resolve(this.position);
                },
                (err) => reject(err),
                { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
            );
        });
    }

    // ============================================
    // CRIA O MARCADOR AZUL
    // ============================================
    _createMarker(pos) {
        const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        };

        this.position = coords;
        this.accuracy = pos.coords.accuracy;

        // container
        const div = document.createElement("div");
        div.className = "location-marker active";

        const pulse = document.createElement("div");
        pulse.className = "location-marker-pulse";

        const dot = document.createElement("div");
        dot.className = "location-marker-dot";

        div.appendChild(pulse);
        div.appendChild(dot);
        this.markerEl = div;

        // Advanced Marker
        this.marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.map,
            position: coords,
            content: div
        });

        // contra-rotação
        this.map.addListener("heading_changed", () => {
            const h = this.map.getHeading() || 0;
            pulse.style.transform = `translate(-50%,-50%) rotate(${-h}deg)`;
            dot.style.transform = `translate(-50%,-50%) rotate(${-h}deg)`;
        });

        // registrar marcador no estado
        AppState.gps = this;
    }

    // ============================================
    // INICIAR WATCH
    // ============================================
    _startWatch() {
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this._onPosition(pos),
            (err) => console.warn("GPS error:", err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
    }

    // ============================================
    // PROCESSAÇÃO DA NOVA POSIÇÃO
    // ============================================
    _onPosition(pos) {
        const now = performance.now();
        if (now - this.lastUpdate < UPDATE_INTERVAL) return; // throttle
        this.lastUpdate = now;

        const newPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        };

        this.accuracy = pos.coords.accuracy;
        updateStatus(`📍 Precisão: ${Math.round(this.accuracy)}m`, true);

        // aplicar filtro Kalman
        const smooth = this._kalman(newPos);

        // animar movimento
        this._animateTo(smooth);
    }

    // ============================================
    // FILTRO KALMAN SIMPLIFICADO (SUAVE E RÁPIDO)
    // ============================================
    _kalman(measure) {
        const { lat, lng } = measure;

        if (this.smoothing.lat === null) {
            this.smoothing.lat = lat;
            this.smoothing.lng = lng;
            return measure;
        }

        const K = 0.15; // ganho leve → suave sem lag

        this.smoothing.lat = this.smoothing.lat + K * (lat - this.smoothing.lat);
        this.smoothing.lng = this.smoothing.lng + K * (lng - this.smoothing.lng);

        return { lat: this.smoothing.lat, lng: this.smoothing.lng };
    }

    // ============================================
    // ANIMAÇÃO DO MARCADOR (requestAnimationFrame)
    // ============================================
    _animateTo(target) {
        if (!this.marker) return;
        if (!this.position) {
            this.position = target;
            this.marker.position = target;
            return;
        }

        const start = this.position;
        const end = target;
        const duration = 300;
        const startTime = performance.now();

        const step = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3); // easing suave

            const current = {
                lat: start.lat + (end.lat - start.lat) * ease,
                lng: start.lng + (end.lng - start.lng) * ease
            };

            this.marker.position = current;

            if (progress < 1) {
                this.animationFrame = requestAnimationFrame(step);
            } else {
                this.position = end;
            }
        };

        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = requestAnimationFrame(step);
    }

    // ============================================
    // PARAR GPS
    // ============================================
    stop() {
        navigator.geolocation.clearWatch(this.watchId);
        cancelAnimationFrame(this.animationFrame);
    }
}

// ============================================
// INICIAR GPS (função pública)
// ============================================

export async function startGPS(map) {
    const gps = new GPSTracker(map);

    try {
        await gps.start();
        return gps;
    } catch (err) {
        console.error("Erro ao iniciar GPS:", err);
        return null;
    }
}