// ======================================
// clients.js — Sidebar e CRUD
// ======================================

import { supabase } from "./app.js";
import { showToast, escapeHtml } from "./utils.js";

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebar-overlay");
const btnOpen = document.getElementById("btnOpenSidebar");
const btnClose = document.getElementById("sidebar-close");
const clientsList = document.getElementById("clients-list");
const searchInput = document.getElementById("search-input");
const clientCount = document.getElementById("client-count");

let allClients = [];

// ======================================
// CARREGAR LISTA
// ======================================

export async function loadClientsSidebar() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    showToast("Erro ao carregar clientes", error.message, "error");
    return;
  }

  allClients = data;
  clientCount.textContent = data.length;
  renderClients(data);
}

// ======================================
// RENDER
// ======================================

function renderClients(list) {
  if (!list.length) {
    clientsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">Nenhum cliente encontrado</div>
      </div>`;
    return;
  }

  clientsList.innerHTML = list
    .map(
      (c) => `
    <div class="client-card" data-id="${c.id}">
      <div class="client-card-header">
        <div class="client-name">👤 ${escapeHtml(c.name)}</div>
        <div class="client-actions">
          <button class="client-action-btn navigate-btn" data-id="${c.id}">🧭</button>
          <button class="client-action-btn edit-btn" data-id="${c.id}">✏️</button>
          <button class="client-action-btn delete-btn" data-id="${c.id}">🗑️</button>
        </div>
      </div>
      <div class="client-info phone-info">
        <span>📞 ${escapeHtml(c.phone || "Sem telefone")}</span>
        <div class="phone-actions">
          <a class="phone-action-btn call-btn" href="tel:${c.phone?.replace(/\D/g,"") || ""}">📞</a>
          <a class="phone-action-btn whatsapp-btn" target="_blank"
             href="https://wa.me/55${c.phone?.replace(/\D/g,"") || ""}">
            💬
          </a>
        </div>
      </div>
      <div class="client-info">
        <span>📍 ${escapeHtml(c.address)}</span>
      </div>
    </div>`
    )
    .join("");

  attachCardActions();
}

// ======================================
// EVENTOS DOS CARDS
// ======================================

function attachCardActions() {
  document.querySelectorAll(".navigate-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openClient(btn.dataset.id);
    })
  );

  document.querySelectorAll(".edit-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      editClient(btn.dataset.id);
    })
  );

  document.querySelectorAll(".delete-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteClient(btn.dataset.id);
    })
  );
}

// ======================================
// AÇÕES
// ======================================

function openClient(id) {
  const client = allClients.find((c) => c.id == id);
  if (!client) return;

  showToast("Cliente selecionado", client.name, "info");

  if (client.latitude && client.longitude) {
    const pos = { lat: client.latitude, lng: client.longitude };
    window.navigateToMarker?.({ position: pos }, client.name);
  }
}

function editClient(id) {
  showToast("Editar cliente", "Abrindo formulário…", "info");
  // Seu modal de edição original pode ser conectado aqui
}

async function deleteClient(id) {
  if (!confirm("Excluir cliente permanentemente?")) return;

  await supabase.from("clients").delete().eq("id", id);

  showToast("Cliente excluído", "", "success");
  await loadClientsSidebar();
}

// ======================================
// SIDEBAR
// ======================================

export function setupClientActions() {
  btnOpen.onclick = () => {
    sidebar.classList.add("open");
    overlay.classList.add("active");
  };

  btnClose.onclick =
    overlay.onclick =
    () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("active");
    };

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.toLowerCase().trim();
    const filtered = allClients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.address.toLowerCase().includes(term) ||
        (c.phone || "").toLowerCase().includes(term)
    );
    renderClients(filtered);
  });
}