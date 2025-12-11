// ======================================
// spreadsheet.js — Upload da Planilha
// ======================================

import { supabase } from "./app.js";
import { showToast } from "./utils.js";

const modal = document.getElementById("modal-upload-spreadsheet");
const btnUpload = document.getElementById("btnUploadSpreadsheet");
const btnClose = document.getElementById("modal-upload-close");
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const uploadProgress = document.getElementById("upload-progress");
const progressBar = document.getElementById("progress-bar");
const resultBox = document.getElementById("upload-result");
const resultText = document.getElementById("result-text");

// ======================================
// INICIAR
// ======================================

export function setupSpreadsheetUpload() {
  btnUpload.onclick = () => modal.classList.add("active");
  btnClose.onclick = () => closeModal();

  uploadArea.onclick = () => fileInput.click();
  fileInput.onchange = (e) => handleFile(e.target.files[0]);

  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  };

  uploadArea.ondragleave = () => uploadArea.classList.remove("dragover");

  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    handleFile(e.dataTransfer.files[0]);
  };
}

// ======================================
// FECHAR MODAL
// ======================================

function closeModal() {
  modal.classList.remove("active");
  fileInput.value = "";
}

// ======================================
// PROCESSAR ARQUIVO
// ======================================

async function handleFile(file) {
  if (!file) return;

  uploadProgress.style.display = "block";
  resultBox.style.display = "none";
  progressBar.style.width = "20%";

  try {
    const data = await file.arrayBuffer();
    progressBar.style.width = "40%";

    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    progressBar.style.width = "60%";

    await saveSpreadsheet(rows);

    progressBar.style.width = "100%";

    resultText.textContent = "Planilha carregada com sucesso!";
    resultBox.style.display = "block";
    showToast("Planilha atualizada!", "", "success");
  } catch (e) {
    console.error(e);
    showToast("Erro ao processar planilha", e.message, "error");
  }
}

// ======================================
// SALVAR NO SUPABASE
// ======================================

async function saveSpreadsheet(rows) {
  await supabase.from("delivery_data").delete().neq("id", "");

  const formatted = rows.map((r) => ({
    spx_tn: r["SPX TN"] || r["QR Code"] || "",
    destination_address: r["Destination Address"] || "",
    bairro: r["Bairro"] || "",
    city: r["City"] || "",
    zipcode: r["Zipcode"] || "",
    latitude: Number(r["Latitude"]) || null,
    longitude: Number(r["Longitude"]) || null,
    sequence: Number(r["Sequence"]) || null,
    status: "pending"
  }));

  await supabase.from("delivery_data").insert(formatted);
}