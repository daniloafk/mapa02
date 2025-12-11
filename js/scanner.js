// ============================================
// scanner.js — Leitura de QR Code
// (Parte 5/8)
// ============================================

import { supabase } from "./app.js";
import { showToast, escapeHtml } from "./utils.js";

// DOM — Scanner do Cliente
const qrCamera = document.getElementById("qr-camera-container");
const qrVideo = document.getElementById("qr-video");
const qrCanvas = document.getElementById("qr-canvas");
const qrStatus = document.getElementById("qr-status");
const btnStopCamera = document.getElementById("btn-stop-camera");
const btnSwitchCamera = document.getElementById("btn-switch-camera");

// DOM — Scanner do Pacote
const pkgCamera = document.getElementById("qr-package-camera-container");
const pkgVideo = document.getElementById("qr-package-video");
const pkgCanvas = document.getElementById("qr-package-canvas");
const pkgStatus = document.getElementById("qr-package-status");
const pkgResult = document.getElementById("scan-result");
const pkgResultText = document.getElementById("scan-result-text");
const btnPkgStop = document.getElementById("btn-package-stop-camera");
const btnPkgSwitch = document.getElementById("btn-package-switch-camera");

// FPS / resolução / ROI
const SCAN_INTERVAL = 120; // ms → ~8 FPS
const PROCESS_SIZE = 320; // 320x320 → perfeito em mobile

// Estado câmera
let streamClient = null;
let streamPackage = null;

// tracking
let lastCode = null;
let consecutive = 0;

// ===============================
// CARREGAR jsQR SOB DEMANDA
// ===============================

async function ensureJsQR() {
    if (!window.jsQR) {
        await import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js");
        console.log("jsQR carregado!");
    }
}

// ===============================
// CAMERA HELPERS
// ===============================

async function startCamera(videoEl, facingMode = "environment") {
    await ensureJsQR();

    const constraints = {
        video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;

    await new Promise((res) => {
        videoEl.onloadedmetadata = async () => {
            await videoEl.play();
            res();
        };
    });

    return stream;
}

function stopCamera(videoEl) {
    const stream = videoEl.srcObject;
    if (stream) {
        stream.getTracks().forEach((t) => t.stop());
    }
    videoEl.srcObject = null;
}

// ===============================
// FUNÇÃO DE SCAN
// ===============================

function scanFrame(video, canvas, statusEl, onDecode) {
    if (!video.srcObject) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const w = PROCESS_SIZE;
    const h = PROCESS_SIZE;

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(video, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const result = jsQR(img.data, w, h, {
        inversionAttempts: "attemptBoth"
    });

    if (!result) {
        consecutive = 0;
        statusEl.textContent = "Procurando QR Code...";
        return;
    }

    const code = result.data.trim();

    if (code === lastCode) consecutive++;
    else {
        lastCode = code;
        consecutive = 1;
    }

    statusEl.textContent = `Lendo... (${consecutive}/2)`;

    if (consecutive >= 2) {
        consecutive = 0;
        lastCode = null;
        onDecode(code);
    }
}

// ===============================
// SCANNER DO CLIENTE
// ===============================

export function setupClientScanner(AppState) {
    if (!qrCamera) return;

    let mode = "environment";

    const openModal = () => {
        qrCamera.classList.add("active");

        startCamera(qrVideo, mode)
            .then((stream) => {
                streamClient = stream;
                loopScanClient();
            })
            .catch(() =>
                showToast("Erro", "Não foi possível acessar câmera", "error")
            );
    };

    const loopScanClient = () => {
        if (!streamClient) return;

        scanFrame(qrVideo, qrCanvas, qrStatus, (code) => {
            qrStatus.textContent = "QR Code detectado!";
            processClientQRCode(code);
            setTimeout(() => closeScanner(), 600);
        });

        setTimeout(loopScanClient, SCAN_INTERVAL);
    };

    const closeScanner = () => {
        qrCamera.classList.remove("active");
        stopCamera(qrVideo);
        streamClient = null;
    };

    // botões
    btnStopCamera.onclick = closeScanner;
    btnSwitchCamera.onclick = () => {
        mode = mode === "environment" ? "user" : "environment";
        stopCamera(qrVideo);
        openModal();
    };

    // expor função global
    window.openClientScanner = openModal;
}

// ===============================
// PROCESSAR QR DO CLIENTE
// ===============================

async function processClientQRCode(code) {
    console.log("QR Cliente:", code);

    let { data, error } = await supabase
        .from("delivery_data")
        .select("*")
        .eq("spx_tn", code)
        .single();

    if (error && error.code !== "PGRST116") {
        showToast("Erro", "Falha ao buscar endereço", "error");
        return;
    }

    if (!data) {
        showToast("QR não cadastrado", code, "warning");
        return;
    }

    // Preencher modal automaticamente
    const address = data.destination_address || "";
    document.getElementById("address-display").classList.add("active");
    document.getElementById("address-text").textContent = address;

    showToast("Endereço encontrado!", "", "success");
}

// ===============================
// SCANNER DO PACOTE
// ===============================

export function setupPackageScanner(AppState) {
    if (!pkgCamera) return;

    let mode = "environment";

    const openPackage = () => {
        pkgCamera.classList.add("active");

        startCamera(pkgVideo, mode)
            .then((stream) => {
                streamPackage = stream;
                loopScanPackage();
            })
            .catch(() =>
                showToast("Erro", "Não foi possível acessar câmera", "error")
            );
    };

    const loopScanPackage = () => {
        if (!streamPackage) return;

        scanFrame(pkgVideo, pkgCanvas, pkgStatus, (code) => {
            pkgStatus.textContent = "Código detectado!";
            processPackageQRCode(code, AppState);
            setTimeout(() => closePackage(), 800);
        });

        setTimeout(loopScanPackage, SCAN_INTERVAL);
    };

    const closePackage = () => {
        pkgCamera.classList.remove("active");
        stopCamera(pkgVideo);
        streamPackage = null;
    };

    // botões
    btnPkgStop.onclick = closePackage;
    btnPkgSwitch.onclick = () => {
        mode = mode === "environment" ? "user" : "environment";
        stopCamera(pkgVideo);
        openPackage();
    };

    // expor função
    window.openPackageScanner = openPackage;
}

// ===============================
// PROCESSAR QR DO PACOTE
// ===============================

async function processPackageQRCode(code, AppState) {
    console.log("QR Pacote:", code);

    const { data, error } = await supabase
        .from("delivery_data")
        .select("*")
        .eq("spx_tn", code)
        .single();

    if (error) {
        showToast("Erro ao buscar pacote", "", "error");
        return;
    }

    if (!data) {
        pkgResult.classList.add("active");
        pkgResultText.innerHTML = `
            <strong>❌ Pacote não encontrado</strong><br>
            Código: <code>${escapeHtml(code)}</code>
        `;
        return;
    }

    pkgResult.classList.add("active");
    pkgResultText.innerHTML = `
        <strong>Cliente encontrado!</strong><br>
        Endereço:<br>
        ${escapeHtml(data.destination_address || "Sem endereço")}
    `;

    showToast("Pacote encontrado!", "", "success");
}