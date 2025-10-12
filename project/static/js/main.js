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