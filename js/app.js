// ===============================
// APP.JS — Núcleo da Aplicação
// (Parte 2/8)
// ===============================

// 🔥 IMPORTA TODOS OS MÓDULOS
import { initMap, mapReady } from './map.js';
import { startGPS } from './gps.js';
import { setupClientScanner } from './scanner.js';
import { setupPackageScanner } from './scanner.js';
import { setupMarkers } from './markers.js';
import { setupRoutes } from './routes.js';
import { loadClientsSidebar, setupClientActions } from './clients.js';
import { setupSpreadsheetUpload } from './spreadsheet.js';
import { showToast } from './utils.js';

// ===============================
// CONFIGURAÇÃO SUPABASE
// ===============================

export const supabase = window.supabase.createClient(
    "https://dctlgztkqtktxnmiuqgr.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdGxnenRrcXRrdHhubWl1cWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MzMwNDIsImV4cCI6MjA4MDIwOTA0Mn0.Ctlx8A4QBFxa7Iu6fObw_OthHfA2XrzY47UiMMIhbIU"
);

// ===============================
// ESTADOS GLOBAIS
// ===============================

export const AppState = {
    map: null,
    gps: null,
    deliveryMarkers: {},
    clientMarkers: {},
    matchedMarkers: {},
    routePolylines: [],
    navigationActive: false
};

// ===============================
// INICIALIZAÇÃO PRINCIPAL
// ===============================

window.initMap = async function () {
    console.log("🗺️ Inicializando mapa...");

    // inicia Google Maps
    AppState.map = await initMap();

    // aguarda mapa pronto
    await mapReady();

    // inicia GPS
    AppState.gps = await startGPS(AppState.map);

    // inicializa módulos
    setupClientScanner(AppState);
    setupPackageScanner(AppState);
    setupMarkers(AppState);
    setupRoutes(AppState);
    setupClientActions(AppState);
    setupSpreadsheetUpload(AppState);

    // carregar lista de clientes na sidebar
    await loadClientsSidebar(AppState);

    // remove tela de loading
    document.getElementById("loading-screen").classList.add("hidden");

    showToast("Mapa carregado!", "Sistema pronto.", "success", 3000);
};

// ===============================
// EVENTOS GLOBAIS
// ===============================

// Evitar seleções acidentais
document.addEventListener("mousedown", () => {
    document.body.classList.remove("text-select");
});

// Reset ao voltar de telefone/whatsapp
window.addEventListener("pageshow", () => {
    document.activeElement?.blur();
});