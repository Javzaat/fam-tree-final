// Theme (dark / light) солих логик
(function () {
  const btnTheme = document.getElementById("btn-theme");
  const icon = document.getElementById("theme-icon");
  if (!btnTheme) return;

  // Icon-ыг одоогийн theme-тэй тааруулах
  function syncThemeIcon() {
    const isDark = document.body.classList.contains("dark");
    if (!icon) return;
    icon.src = isDark ? "img/sun.png" : "img/moon.png";
    icon.alt = isDark ? "Sun icon" : "Moon icon";
  }

  // localStorage-оос theme унших
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }

  // Эхний icon тохиргоо
  syncThemeIcon();

  // Theme солих товч
  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation();

    // Dark / light toggle
    document.body.classList.toggle("dark");

    // Theme хадгалах
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // Icon шинэчлэх
    syncThemeIcon();
  });
})();
