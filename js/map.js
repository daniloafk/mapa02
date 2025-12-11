// ==========================================
// MAP.JS — Controle do Google Maps
// (Parte 3/8)
// ==========================================

import { showToast } from "./utils.js";
import { AppState } from "./app.js";

// Promessa para saber quando o mapa está realmente pronto
let mapResolve;
export const mapReady = () =>
  new Promise((res) => (mapResolve = res));

// ===============================
// CONFIGURAÇÕES
// ===============================
const MAP_ID = "ebb7ca4503045feabc75b373";

// ===============================
// INICIALIZAR MAPA
// ===============================

export async function initMap() {
  return new Promise((resolve) => {
    const map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: -23.5505, lng: -46.6333 },
      zoom: 17,
      tilt: 0,
      heading: 0,
      mapId: MAP_ID,
      gestureHandling: "greedy",
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      minZoom: 3,
      maxZoom: 22,
    });

    AppState.map = map;

    // Quando os tiles carregarem, mapa está pronto
    google.maps.event.addListenerOnce(map, "tilesloaded", () => {
      mapResolve();
      resolve(map);
    });

    setup3DToggle(map);
    addGPSButton(map);

    return map;
  });
}

// ===============================
// BOTÃO 3D
// ===============================

function setup3DToggle(map) {
  const btn = document.getElementById("btnToggle3D");
  let active = false;
  let animating = false;

  function animateValue(start, end, duration, update, finish) {
    const startTime = performance.now();
    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      update(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(frame);
      else finish && finish();
    }
    requestAnimationFrame(frame);
  }

  btn.addEventListener("click", () => {
    if (animating) return;
    animating = true;

    btn.classList.add("loading");

    if (!active) {
      active = true;

      animateValue(map.getTilt(), 67, 600, (v) => map.setTilt(v));
      animateValue(map.getHeading(), 45, 600, (v) => map.setHeading(v), () => {
        btn.classList.remove("loading");
        btn.classList.add("active");
        btn.textContent = "2D";
        animating = false;
        showToast("Modo 3D ativado", "Arraste para rotacionar", "success");
      });
    } else {
      active = false;

      animateValue(map.getTilt(), 0, 600, (v) => map.setTilt(v));
      animateValue(map.getHeading(), 0, 600, (v) => map.setHeading(v), () => {
        btn.classList.remove("loading", "active");
        btn.textContent = "3D";
        animating = false;
        showToast("Modo 2D ativado", "", "success");
      });
    }
  });
}

// ===============================
// BOTÃO CENTRALIZAR GPS
// ===============================

function addGPSButton(map) {
  const gpsBtn = document.createElement("button");
  gpsBtn.className = "gps-center-button";
  gpsBtn.title = "Centralizar na minha localização";

  const icon = document.createElement("i");
  icon.className = "material-icons";
  icon.textContent = "gps_fixed";
  gpsBtn.appendChild(icon);

  gpsBtn.onclick = () => {
    const gps = AppState.gps;
    if (!gps || !gps.position) {
      showToast("GPS não disponível", "Aguarde o rastreamento", "warning");
      return;
    }

    map.panTo(gps.position);
    map.setZoom(17);
    gpsBtn.classList.add("active");

    setTimeout(() => gpsBtn.classList.remove("active"), 1800);
  };

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(gpsBtn);
}

// ===============================
// STATUS BAR
// ===============================

export function updateStatus(text, active = true) {
  document.getElementById("status-text").textContent = text;
  const ind = document.getElementById("status-indicator");

  if (active) ind.classList.remove("inactive");
  else ind.classList.add("inactive");
}