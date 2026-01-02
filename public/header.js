// Header болон цэс нээх/хаах товч
const header = document.querySelector(".site-header");
const toggle = document.querySelector(".nav-toggle");

// Цэс нээх/хаах (mobile hamburger)
toggle.addEventListener("click", () => {
  const open = header.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
});

// Escape дарвал цэс хаах
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
});

// Цэсний холбоос дээр дарахад цэс хаах
document.querySelectorAll("#main-nav a").forEach((a) => {
  a.addEventListener("click", () => {
    header.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
});

// Section-ууд харагдахаас шалтгаалж навигацийн active link-ийг солих
const sections = document.querySelectorAll("section[id]");
const links = document.querySelectorAll(".nav-list a");

// Section-ийн id-тай таарах nav link-ийг олох
const byId = (id) =>
  [...links].find((a) => a.getAttribute("href") === `#${id}`);

// Scroll хийх үед аль section харагдаж байгаагаар active class өгнө
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const link = byId(entry.target.id);
      if (!link) return;

      if (entry.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
      }
    });
  },
  { rootMargin: "-40% 0px -50% 0px", threshold: 0.01 }
);

sections.forEach((s) => io.observe(s));

// Scroll чиглэлээс хамаарч header-ийг нуух/ил гаргах
let lastScroll = 0;
const scrollThreshold = 10;
const headerHeight = header.offsetHeight;

window.addEventListener("scroll", () => {
  const currentScroll =
    window.pageYOffset || document.documentElement.scrollTop;

  // Доош гүйлгэвэл header нуух
  if (
    currentScroll > lastScroll + scrollThreshold &&
    currentScroll > headerHeight
  ) {
    header.classList.add("hide");
  }
  // Дээш гүйлгэвэл header гаргах
  else if (currentScroll < lastScroll - scrollThreshold) {
    header.classList.remove("hide");
  }

  // lastScroll утгыг шинэчилнэ
  lastScroll = currentScroll <= 0 ? 0 : currentScroll;
});
