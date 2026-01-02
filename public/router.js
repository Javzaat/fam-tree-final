// ===============================
// Энгийн hash router
// Hash route-оор section руу scroll хийх эсвэл тусдаа хуудас руу шилжих
// ===============================

function getRoute() {
  // "#/home" зэрэг hash-ийг route болгон буцаана (hash байхгүй бол default "/home")
  return location.hash.replace("#", "") || "/home";
}

function scrollToSection(route) {
  // Route-ыг section-ийн id-тай зураглаж холбох
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

  // Тухайн section руу smooth scroll хийнэ
  el.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function onRouteChange() {
  const route = getRoute();
  console.log("ROUTE CHANGED:", route);

  // Тусгай route: ургийн модны хуудас руу үсрэх
  if (route === "/tree") {
    window.location.href = "family-tree.html";
    return;
  }

  // Эсрэг тохиолдолд index.html дотор section руу scroll хийнэ
  scrollToSection(route);
}

// ===============================
// Event-үүд
// ===============================

// Анх ачааллах үед route-оо уншаад ажиллуулна
window.addEventListener("DOMContentLoaded", () => {
  onRouteChange();
});

// Hash өөрчлөгдөх бүрт route шинэчилнэ
window.addEventListener("hashchange", () => {
  onRouteChange();
});
