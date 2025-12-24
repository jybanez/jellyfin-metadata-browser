export function setBreadcrumbs(html) {
  const el = document.getElementById("breadcrumbs");
  if (el) el.innerHTML = html || "";
}

export function clearBreadcrumbs() {
  const el = document.getElementById("breadcrumbs");
  if (el) el.innerHTML = "";
}
