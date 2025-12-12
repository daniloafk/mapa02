import { setupMap } from "./map.js";
import { setupGPS } from "./gps.js";
import { setupScanner } from "./scanner.js";
import { setupMarkers } from "./markers.js";
import { setupRoutes } from "./routes.js";
import { setupClientActions } from "./clients.js";
import { setupSpreadsheetUpload } from "./spreadsheet.js";

export const AppState = {
  map: null,
  gps: null,
  navigationActive: false,
  routePolylines: []
};

window.initMap = async function () {
  console.log("Inicializando sistema...");

  // 1. Start map
  AppState.map = setupMap();

  // 2. GPS real-time
  setupGPS();

  // 3. Scanner (QR)
  setupScanner();

  // 4. Markers (carrega da planilha / supabase)
  setupMarkers();

  // 5. Routes (navegação)
  setupRoutes();

  // 6. Sidebar clientes
  setupClientActions();

  // 7. Upload de planilha
  setupSpreadsheetUpload();

  console.log("Sistema pronto!");
};