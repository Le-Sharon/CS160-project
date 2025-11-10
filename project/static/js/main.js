// Initialize maps
let map = L.map('map').setView([37.3387, -121.8853], 13);
let csvMap = L.map('csvMap').setView([37.3387, -121.8853], 13);
let compareMap = L.map('compareMap').setView([37.3387, -121.8853], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(csvMap);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(compareMap);

// Fix Leaflet map visibility on tab switch
document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
  tab.addEventListener('shown.bs.tab', function (event) {
    if (map) map.invalidateSize();
    if (csvMap) csvMap.invalidateSize();
    if (compareMap) compareMap.invalidateSize();
  });
});

let csvLayer = null;

function showMsg(el, html, kind = "info") {
  el.innerHTML = `<div class="alert alert-${kind} py-2 mb-0" role="alert">${html}</div>`;
}

async function drawCsvLayer(layerName) {
  const resp = await fetch(`/getLayer?layer=${encodeURIComponent(layerName)}`);
  const geo = await resp.json();
  if (!resp.ok || geo.error) throw new Error(geo.error || `Failed to load ${layerName}`);

  if (csvLayer) { try { csvMap.removeLayer(csvLayer); } catch(_) {} csvLayer = null; }
  csvLayer = L.geoJSON(geo, {
    onEachFeature: (f, layer) => {
      const id = f.properties?.id ?? "";
      const name = f.properties?.name ?? "";
      layer.bindPopup(name || `ID ${id}`);
    }
  }).addTo(csvMap);

  try { csvMap.fitBounds(csvLayer.getBounds(), { padding: [20, 20] }); } catch(_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("csvForm");
  if (!form) return; 

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("csvFile");
    const layerInput = document.getElementById("layerName");
    const msgEl = document.getElementById("uploadMsg");
    const btn = document.getElementById("btnUpload");

    if (!fileInput.files.length) {
      showMsg(msgEl, "Please choose a CSV file.", "warning");
      return;
    }

    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    const name = (layerInput?.value || "").trim();
    if (name) fd.append("layer", name);

    btn.disabled = true; btn.textContent = "Uploading…";
    try {
      const res = await fetch("/importCSV", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);

      showMsg(msgEl, `Imported <strong>${data.rows}</strong> rows into layer <code>${data.layer}</code>.`, "success");
      await drawCsvLayer(data.layer);

      // Point the Export button (if present) at the new layer
      const dl = document.getElementById("downloadCSV");
      if (dl) dl.href = `/exportCSV?layer=${encodeURIComponent(data.layer)}`;
    } catch (err) {
      showMsg(msgEl, `${err.message}`, "danger");
    } finally {
      btn.disabled = false; btn.textContent = "Upload";
    }
  });
});