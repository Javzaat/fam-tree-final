// ===============================
// SIMPLE HASH ROUTER (FULL)
// Route → Section scroll / Page redirect
// ===============================

function getRoute() {
  // "#/home" → "/home"
  return location.hash.replace("#", "") || "/home";
}

function scrollToSection(route) {
  // route → section id
  const map = {
    "/home": "family",
    "/what": "what",
    "/importance": "importance",
    "/instructions": "instructions",
    "/payment": "payment",
  };

  const sectionId = map[route];
  if (!sectionId) return;

  const el = document.getElementById(sectionId);
  if (!el) return;

  el.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function onRouteChange() {
  const route = getRoute();
  console.log("🔀 ROUTE CHANGED:", route);

  // 🔥 SPECIAL ROUTE: FAMILY TREE PAGE
  if (route === "/tree") {
    window.location.href = "family-tree.html";
    return;
  }

  // Default: scroll inside index.html
  scrollToSection(route);
}

// ===============================
// EVENTS
// ===============================

// Initial load
window.addEventListener("DOMContentLoaded", () => {
  onRouteChange();
});

// Hash change
window.addEventListener("hashchange", () => {
  onRouteChange();
});