import L from "leaflet";

export const REPORT_PIN_ICON = L.divIcon({
  className: "cp-marker",
  html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#0e7c79;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);color:#fff;font-weight:800;font-size:16px">+</span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -26],
});
