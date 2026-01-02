const CARD_W = 150; // картын өргөн
const CARD_H = 190; // картын өндөр
const H_GAP = 60;   // хэвтээ зай
const V_GAP = 60;   // босоо зай

let members = [];   // гишүүдийн жагсаалт
let nextId = 1;     // дараагийн ID

let pendingDeleteMember = null; // устгах хүн
let pendingMediaDelete = null;  // устгах медиа

window.members = members;       // глобалд гаргана
window.getMembers = () => members;

let renderQueued = false; // render давхардахгүй
let saveTimer = null;     // хадгалах таймер
let saving = false;       // хадгалж байна
// -- DATA MODEL --
class FamilyMember {
  constructor({
    id,
    name,
    age,
    sex,
    level,
    photoUrl,

    familyName,
    fatherName,
    birthDate,
    deathDate,
    birthPlace,
    major,
    education,
    position,
    achievements,
    images,
    videos,
  }) {
    this.id = id;           // гишүүний ID
    this.name = name || ""; // нэр
    this.age = age || "";   // нас
    this.sex = sex || "";   // хүйс
    this.level = level;     // үеийн түвшин

    this.x = 0;             // tree дээрх X байрлал
    this.y = 0;             // tree дээрх Y байрлал

    this.parents = [];      // эцэг, эхийн ID-ууд
    this.children = [];     // хүүхдүүдийн ID-ууд
    this.spouseId = null;   // хань ижил

    this.photoUrl = photoUrl || ""; // профайл зураг

    this.familyName = familyName || ""; // овог
    this.fatherName = fatherName || ""; // эцгийн нэр
    this.birthDate = birthDate || "";   // төрсөн огноо
    this.deathDate = deathDate || "";   // нас барсан огноо
    this.birthPlace = birthPlace || ""; // төрсөн газар

    this.education = education || "";   // боловсрол
    this.position = position || "";     // албан тушаал
    this.achievements = achievements || []; // амжилтууд

    this.images = images || [];          // нэмэлт зургууд
    this.videos = videos || [];          // видеонууд

    this.collapseUp = false;             // дээд үе нуух эсэх
  }
}

function scheduleRender() {
  if (renderQueued) return; // давхар render-ээс сэргийлнэ
  renderQueued = true;

  requestAnimationFrame(() => {
    renderQueued = false;   // render хийхийг зөвшөөрнө
    layoutTree();           // байрлалыг тооцоолно
    renderTree();           // модыг зурна
  });
}

window.addEventListener("beforeunload", () => {
  // хуудас хаагдаж магадгүй үед ажиллана
  // өгөгдөл алдагдахаас сэргийлж хадгална
  if (typeof window.saveTreeNow === "function") {
    window.saveTreeNow(); // шууд хадгалалт
  }
});

async function saveTreeToDB() {
  const user = window.auth?.currentUser;
  if (!user) return; // нэвтрээгүй бол хадгалахгүй

  clearTimeout(saveTimer); // өмнөх хадгалалтыг цуцална

  saveTimer = setTimeout(async () => {
    if (saving) return; // давхар хадгалалт хийхгүй
    saving = true;

    try {
      // хэрэглэгчийн auth token авна
      const token = await user.getIdToken();

      // tree өгөгдлийг серверт хадгална
      const res = await fetch("/api/tree/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ members }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("SAVE FAILED:", text); // серверийн алдаа
      }
    } catch (err) {
      console.error("SAVE ERROR:", err); // сүлжээ эсвэл кодын алдаа
    } finally {
      saving = false; // хадгалалт дууссан
    }
  }, 600); // 600мс debounce
}

async function saveTreeNow() {
  const user = window.auth?.currentUser;
  if (!user) return; // нэвтрээгүй бол хадгалахгүй

  try {
    const token = await user.getIdToken(); // auth token авна

    // debounce-гүйгээр шууд хадгална
    const res = await fetch("/api/tree/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-uid": user.uid,            // хэрэглэгчийн ID
        Authorization: `Bearer ${token}`,  // auth шалгалт
      },
      body: JSON.stringify({ members }),  // tree өгөгдөл
    });

    if (!res.ok) {
      console.error("SAVE NOW FAILED:", await res.text()); // серверийн алдаа
    }
  } catch (err) {
    console.error("SAVE NOW ERROR:", err); // сүлжээ эсвэл кодын алдаа
  }
}


window.saveTreeNow = saveTreeNow; // функцийг глобалд гаргана

let treeRoot, nodesLayer, svg; // tree-ийн үндсэн DOM элементүүд
let posMap = new Map();       // хүн бүрийн байрлал (id - x, y)
// -- ZOOM / PAN STATE --
const zoomState = {
  userScale: 1,   // хэрэглэгчийн zoom хэмжээ
  panX: 0,        // хэвтээ зөөлт
  panY: 0,        // босоо зөөлт
  min: 0.45,      // хамгийн бага zoom
  max: 2.8,       // хамгийн их zoom
  step: 0.12      // zoom нэмэх/хасах алхам
};

// Person modal state
let modalMode = null; // "add-father" | "add-mother" | "add-spouse" | "add-child" | "edit"
let modalTarget = null; // modal дээр ажиллах хүн
// ============== INIT ==============
window.addEventListener("DOMContentLoaded", () => {
  // tree-д хэрэгтэй DOM элементүүдийг авна
  treeRoot = document.getElementById("tree-root");
  nodesLayer = document.getElementById("tree-nodes");
  svg = document.getElementById("tree-lines-svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); // SVG тохиргоо

  setupPersonModal();      // хүн нэмэх/засах modal
  setupThemeButton();      // theme солих товч
  setupTreeZoomAndPan();   // zoom, pan тохиргоо

  // auth төлөв шалгаад tree ачаална
  waitForAuthAndLoadTree();
});

function clearSVG() {
  // SVG доторх бүх шугамыг цэвэрлэнэ
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}


function createDefaultRoot() {
  // анхны root хүн үүсгэнэ
  const me = new FamilyMember({
    id: nextId++,                 // шинэ ID
    name: "Би",                   // үндсэн хүн
    age: "",                      // нас
    sex: "male",                  // анхдагч хүйс
    level: 0,                     // root түвшин
    photoUrl: defaultPhotoBySex("male"), // анхдагч зураг
  });

  // гишүүдийн жагсаалтад нэмнэ
  members.push(me);
}

// -- HELPERS --
function childFamilyKey(child) {
  // эцэг эхгүй бол тухайн хүүхдэд тусгай key өгнө
  if (!Array.isArray(child.parents) || child.parents.length === 0) {
    return `single-${child.id}`;
  }

  // эцэг эхийн ID-уудаар тогтвортой key үүсгэнэ
  return child.parents
    .slice()                // эх массивыг өөрчлөхгүй
    .sort((a, b) => a - b)  // дарааллыг тогтмол болгоно
    .join("-");             // нэг key болгон нийлүүлнэ
}


function parentFamilyCenterX(child) {
  // эцэг эхгүй бол төв цэг байхгүй
  if (!Array.isArray(child.parents) || child.parents.length === 0) return null;

  // эцэг эх бүрийн гэр бүлийн төв X-ийг авна
  const centers = child.parents
    .map(pid => familyCenterX(pid))
    .filter(v => typeof v === "number"); // зөвхөн тоонууд

  // хүчинтэй төв олдохгүй бол null
  if (!centers.length) return null;

  // бүх төвийн дунджийг буцаана
  return centers.reduce((a, b) => a + b, 0) / centers.length;
}
function showWarning(message) {
  // анхааруулгын modal-д хэрэгтэй элементүүд
  const backdrop = document.getElementById("warn-backdrop");
  const modal = document.getElementById("warn-modal");
  const text = document.getElementById("warn-text");
  const ok = document.getElementById("warn-ok");

  // элемент олдохгүй бол зогсоно
  if (!backdrop || !modal || !text || !ok) return;

  // харуулах мессежийг оруулна
  text.textContent = message;

  // modal-ийг ил харагдуулна
  backdrop.hidden = false;
  modal.hidden = false;

  // CSS-ийг албадан харуулна
  backdrop.style.display = "block";
  modal.style.display = "flex";

  // OK дархад modal хаагдана
  ok.onclick = () => {
    backdrop.hidden = true;
    modal.hidden = true;
    backdrop.style.display = "";
    modal.style.display = "";
  };
}
function hasActiveSearch() {
  // ямар нэг хайлтын filter идэвхтэй эсэхийг шалгана
  return (
    searchState.name ||        // нэрээр хайж байна
    searchState.family ||      // эцгийн нэрээр хайж байна
    searchState.clan ||        // овгоор хайж байна
    searchState.education      // боловсролоор хайж байна
  );
}
function defaultPhotoBySex(sex) {
  if (sex === "male") return "img/profileman.avif";
  if (sex === "female") return "img/profilewoman.jpg";
  return "img/profileson.jpg";
}

function getTreeBounds(visibleMembers) {
  // tree дээр харагдаж байгаа бүх хүмүүсийн
  // хамгийн зүүн, баруун, дээд, доод хязгаарыг олно

  let minX = Infinity, // хамгийн зүүн X
      minY = Infinity; // хамгийн дээд Y
  let maxX = -Infinity, // хамгийн баруун X
      maxY = -Infinity; // хамгийн доод Y

  // хүн бүрийн картын бодит хэмжээг тооцож
  // нийт tree-ийн хүрээг тодорхойлно
  visibleMembers.forEach((m) => {
    // картын зүүн ирмэг
    minX = Math.min(minX, m.x - CARD_W / 2);

    // картын баруун ирмэг
    maxX = Math.max(maxX, m.x + CARD_W / 2);

    // картын дээд ирмэг
    minY = Math.min(minY, m.y - CARD_H / 2);

    // картын доод ирмэг
    maxY = Math.max(maxY, m.y + CARD_H / 2);
  });

  // SVG шугам, холбоос тасрахгүй байлгахын тулд
  // хүрээн дээр нэмэлт padding өгнө
  const PAD_X = 40; // хэвтээ нэмэлт зай
  const PAD_Y = 40; // босоо нэмэлт зай

  // tree-ийн нийт харагдах хязгаарыг буцаана
  // (zoom, center хийхэд ашиглагдана)
  return {
    minX: minX - PAD_X,
    minY: minY - PAD_Y,
    maxX: maxX + PAD_X,
    maxY: maxY + PAD_Y,
  };
}

function getParentBySex(child, sex) {
  // хүүхдийн parents массивыг авна (байхгүй бол хоосон)
  return (
    (child.parents || [])
      // эцэг эхийн ID-уудыг бодит member объект болгоно
      .map((pid) => findMember(pid))
      // өгөгдсөн хүйстэй (male / female) эхний хүнийг олно
      .find((p) => p && p.sex === sex) || null // олдохгүй бол null
  );
}

function normalizeParents(child) {
  // parents байхгүй эсвэл буруу байвал хоосон массив болгоно
  if (!Array.isArray(child.parents)) child.parents = [];

  // давхардсан, null / undefined ID-уудыг цэвэрлэнэ
  const uniq = [];
  for (const pid of child.parents) {
    if (!pid) continue;           // хоосон ID алгасна
    if (!uniq.includes(pid)) {
      uniq.push(pid);             // давхардалгүй хадгална
    }
  }

  // эцэг, эхийг хүйсээр нь ялгаж олох
  let father = null;
  let mother = null;
  const unknown = [];             // хүйс тодорхойгүй эсвэл илүүдэл эцэг эх

  for (const pid of uniq) {
    const p = findMember(pid);
    if (!p) continue;             // устсан хүн байвал алгасна

    if (p.sex === "male" && !father) {
      father = pid;               // эхний эр хүнийг эцэг гэж авна
    } else if (p.sex === "female" && !mother) {
      mother = pid;               // эхний эм хүнийг эх гэж авна
    } else {
      unknown.push(pid);          // бусдыг түр хадгална
    }
  }

  // эцэг эсвэл эх дутуу бол unknown-оос нөхөж өгнө
  // (өгөгдөл алдагдуулахгүй)
  if (!father && unknown.length) father = unknown.shift();
  if (!mother && unknown.length) mother = unknown.shift();

  // canonical дараалал: [эцэг, эх]
  const next = [];
  if (father) next[0] = father;
  if (mother) next[1] = mother;

  // үлдсэн unknown-уудыг хадгална (ховор тохиолдол)
  for (const pid of unknown) {
    if (!next.includes(pid)) next.push(pid);
  }

  // эцсийн цэвэрлэгдсэн parents массив
  child.parents = next;
}
function repairTreeData() {
  // бүх гишүүдийг ID-гаар хурдан олох Map
  const byId = new Map(members.map((m) => [m.id, m]));

  // 1) parents → children холбоосыг засна
  //    (эцэг эх дээр хүүхэд нь заавал бүртгэлтэй байх ёстой)
  members.forEach((child) => {
    (child.parents || []).forEach((pid) => {
      const p = byId.get(pid);
      if (!p) return;                 // устсан эцэг эх бол алгасна
      if (!p.children) p.children = [];
      if (!p.children.includes(child.id)) {
        p.children.push(child.id);    // хүүхдийг эцэг эхэд нь нэмнэ
      }
    });
  });

  // 2) spouse холбоог хоёр талд нь ижил болгоно
  members.forEach((m) => {
    if (!m.spouseId) return;
    const s = byId.get(m.spouseId);
    if (!s) {
      m.spouseId = null;              // байхгүй spouse-ийг цэвэрлэнэ
      return;
    }
    if (s.spouseId !== m.id) {
      s.spouseId = m.id;              // spouse холбоог симметрик болгоно
    }
  });

  // 3) level-ийг эцэг эхээс нь дахин тооцоолно
  //    (өгөгдөл алдагдуулахгүй, зөөлөн засвар)
  members.forEach((m) => {
    const pids = (m.parents || []).filter((pid) => byId.has(pid));
    if (!pids.length) return;         // эцэг эхгүй бол оролдохгүй

    const parentLevels = pids
      .map((pid) => byId.get(pid).level)
      .filter((v) => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const target = Math.min(...parentLevels) + 1;
    if (m.level !== target) {
      m.level = target;               // зөв level болгож засна
    }
  });

  // 4) бүх гишүүдийн parents массивыг canonical хэлбэрт оруулна
  //    (эцэг, эх дараалал, давхардалгүй)
  members.forEach((m) => normalizeParents(m));
}

let authListenerAttached = false; // auth listener давхар холбогдохоос сэргийлнэ

function waitForAuthAndLoadTree() {
  // auth объект бэлэн болтол давтамжтай шалгана
  const authWait = setInterval(() => {
    // auth хараахан бэлэн биш эсвэл listener аль хэдийн холбогдсон бол хүлээнэ
    if (!window.auth || authListenerAttached) return;

    // auth олдмогц interval-ийг зогсооно
    clearInterval(authWait);
    authListenerAttached = true; // давхар listener нэмэгдэхээс сэргийлнэ

    // auth төлөв өөрчлөгдөх бүрт ажиллана
    window.auth.onAuthStateChanged((user) => {
      // одоогийн tree өгөгдлийг цэвэрлэнэ
      members.length = 0;
      posMap.clear();
      nextId = 1;

      if (user) {
        // нэвтэрсэн бол tree-г DB-ээс ачаална
        loadTreeFromDB();
      } else {
        // нэвтрээгүй бол анхны root-оор tree үүсгэнэ
        createDefaultRoot();
        scheduleRender();
      }
    });
  }, 50); // 50мс тутам шалгана
}

function familyCenterX(memberId) {
  // өгөгдсөн ID-тай хүнийг олно
  const m = findMember(memberId);
  if (!m) return null; // хүн олдохгүй бол төв байхгүй

  // тухайн хүний картын байрлалын мэдээлэл
  const r = cardRect(memberId);
  if (!r) return null;

  // ханьгүй бол тухайн хүний төв X-ийг буцаана
  if (!m.spouseId) return r.cx;

  // ханьтай бол ханийх нь картын мэдээллийг авна
  const sr = cardRect(m.spouseId);
  if (!sr) return r.cx;

  // эхнэр, нөхрийн төв X-үүдийн дунджийг буцаана
  return (r.cx + sr.cx) / 2;
}

function cardRect(id) {
  // өгөгдсөн ID-тай хүнийг олно
  const m = findMember(id);
  if (!m) return null; // хүн олдохгүй бол null

  // m.x, m.y нь layoutTree() дээр тооцсон
  // тухайн хүний картын төв координат (tree space)
  const left = m.x - CARD_W / 2;   // картын зүүн ирмэг
  const right = m.x + CARD_W / 2;  // картын баруун ирмэг
  const top = m.y - CARD_H / 2;    // картын дээд ирмэг
  const bottom = m.y + CARD_H / 2; // картын доод ирмэг

  // картын геометр мэдээллийг буцаана
  return {
    cx: m.x,   // картын төв X
    top,       // дээд Y
    bottom,    // доод Y
    left,      // зүүн X
    right,     // баруун X
  };
}

function findMember(id) {
  // өгөгдсөн ID-тай гишүүнийг members массиваас олно
  return members.find((m) => m.id === id);
}

// ---- ancestors hidden set (collapseUp) ----
function buildHiddenAncestorSet() {
  // хайлт идэвхтэй үед ancestor нуухгүй
  if (typeof hasActiveSearch === "function" && hasActiveSearch()) {
    return new Set(); // бүгд харагдана
  }

  const hidden = new Set();        // нуух ёстой гишүүд
  const protectedSet = new Set(); // заавал харагдах гишүүд
  const byId = new Map(members.map(m => [m.id, m])); // ID → member

  // сонгосон хүнээс доош (хүүхдүүд, хань) бүгдийг хамгаална
  function protectDescendants(startId) {
    const q = [startId];
    while (q.length) {
      const id = q.shift();
      if (!id || protectedSet.has(id)) continue;
      protectedSet.add(id);

      const m = byId.get(id);
      if (!m) continue;

      if (m.spouseId) protectedSet.add(m.spouseId);
      (m.children || []).forEach(cid => q.push(cid));
    }
  }

  // тухайн зангилаанаас доош бүх салбарыг нууна
  // (гэхдээ protectedSet-д байгаа бол нуухгүй)
  function hideSubtree(startId) {
    const q = [startId];
    while (q.length) {
      const id = q.shift();
      if (!id || hidden.has(id) || protectedSet.has(id)) continue;

      hidden.add(id);
      const m = byId.get(id);
      if (!m) continue;

      if (m.spouseId && !protectedSet.has(m.spouseId)) {
        hidden.add(m.spouseId);
      }

      (m.children || []).forEach(cid => q.push(cid));
    }
  }

  // ================= ҮНДСЭН ЛОГИК =================
  members.forEach(m => {
    if (!m.collapseUp) return; // collapseUp идэвхгүй бол алгасна

    // тухайн хүн болон доошхи салбарыг хамгаална
    protectDescendants(m.id);
    protectedSet.add(m.id);
    if (m.spouseId) protectedSet.add(m.spouseId);

    // эцэг эх рүү дээш алхаж ancestor-уудыг нуух
    const stack = [...(m.parents || [])];

    while (stack.length) {
      const pid = stack.pop();
      const parent = byId.get(pid);
      if (!parent) continue;

      // ancestor-г нуух
      if (!protectedSet.has(parent.id)) {
        hidden.add(parent.id);
      }

      // ancestor-ийн бусад хүүхдүүдийн салбарыг нууна
      (parent.children || []).forEach(cid => {
        if (cid !== m.id) hideSubtree(cid);
      });

      // дараагийн шатны ancestor-ууд руу өгсөнө
      (parent.parents || []).forEach(ppid => {
        if (!protectedSet.has(ppid)) stack.push(ppid);
      });
    }
  });

  // хамгаалагдсан гишүүдийг хэзээ ч нуухгүй
  protectedSet.forEach(id => hidden.delete(id));

  // нуух ancestor-уудын Set-ийг буцаана
  return hidden;
}



// -- LAYOUT --
function layoutTree() {
  if (!treeRoot) return; // tree container байхгүй бол зогсоно

  // collapseUp логикоор нуух ancestor-уудыг олно
  const hiddenAnc = buildHiddenAncestorSet();

  // харагдах гишүүдийг шүүнэ
  const visibleMembers = members.filter((m) => !hiddenAnc.has(m.id));
  if (!visibleMembers.length) return;

  /* =================================================
     1) ROOT-ийг тогтвортой тодорхойлох
     (өгөгдлийн дарааллаас хамаарахгүй)
  ================================================= */
  const root =
    visibleMembers.find((m) => m.level === 0 && m.name === "Би") ||
    visibleMembers.find((m) => m.level === 0) ||
    visibleMembers.reduce((best, m) =>
      m.level < best.level ? m : best
    );

  /* =================================================
     2) УГСААНЫ ТАЛ
     эцэг = зүүн (-1), эх = баруун (+1)
  ================================================= */
  const sideOf = new Map(); // id → -1 | 0 | +1
  visibleMembers.forEach((m) => sideOf.set(m.id, 0));

  const rootFather = getParentBySex(root, "male");
  const rootMother = getParentBySex(root, "female");

  // ancestor-уудын талыг рекурсив байдлаар тэмдэглэнэ
  function markAncestors(startId, side) {
    const q = [startId];
    const seen = new Set();
    while (q.length) {
      const id = q.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);

      sideOf.set(id, side);
      const m = findMember(id);
      if (!m?.parents) continue;

      m.parents.forEach((pid) => pid && q.push(pid));
    }
  }

  if (rootFather) markAncestors(rootFather.id, -1);
  if (rootMother) markAncestors(rootMother.id, +1);

  /* =================================================
     3) ТОГТВОРТОЙ SORT ТУСЛАХУУД
     (insertion order-оос хамаарахгүй)
  ================================================= */
  function personKey(p) {
    const bd = (p.birthDate || "").trim();
    const nm = (p.name || "").trim().toLowerCase();
    const sx = (p.sex || "").trim();
    return `${bd}__${nm}__${sx}__${String(p.id).padStart(10, "0")}`;
  }

  // хоёр хүн эцэг эхээ хуваалцдаг эсэх
  function sharedParent(a, b) {
    if (!a?.parents?.length || !b?.parents?.length) return false;
    return a.parents.some((pid) => b.parents.includes(pid));
  }

  // тухайн хос дараагийн мөрөнд хамтарсан хүүхэдтэй эсэх
  function coupleHasChild(a, b, nextRow) {
    return nextRow.some(
      (c) =>
        Array.isArray(c.parents) &&
        c.parents.includes(a.id) &&
        c.parents.includes(b.id)
    );
  }

  /* =================================================
     4) LEVEL-ЭЭР БҮЛЭГЛЭХ
  ================================================= */
  const levelMap = new Map();
  visibleMembers.forEach((m) => {
    if (!levelMap.has(m.level)) levelMap.set(m.level, []);
    levelMap.get(m.level).push(m);
  });

  const levels = [...levelMap.keys()].sort((a, b) => a - b);

  const paddingTop = 80;                 // дээд зайн padding
  const rowGap = CARD_H + V_GAP;         // мөр хоорондын зай
  const newPosMap = new Map();            // шинэ координатууд

  levels.forEach((level, rowIndex) => {
    const row = (levelMap.get(level) || []).slice();
    const nextRow = levelMap.get(level + 1) || [];

    // тухайн мөрийг тогтвортой эрэмбэлнэ
    row.sort((a, b) => personKey(a).localeCompare(personKey(b)));

    const y = paddingTop + rowIndex * rowGap;

    const used = new Set(); // аль хэдийн байршуулсан ID-ууд
    const units = [];      // single эсвэл family блокууд

    /* =================================================
       5) ХОСУУДЫГ БАЙГУУЛАХ
       (өгөгдлийн дарааллаас үл хамаарна)
    ================================================= */
    const couples = [];
    row.forEach((m) => {
      if (!m.spouseId) return;
      const s = findMember(m.spouseId);
      if (!s || s.level !== level) return;
      if (!row.some((x) => x.id === s.id)) return;

      const a = m.id < s.id ? m : s;
      const b = m.id < s.id ? s : m;
      const key = `${a.id}-${b.id}`;

      if (!couples.some((c) => c.key === key)) {
        couples.push({ key, a, b });
      }
    });

    // хосуудыг тал + personKey-р тогтвортой sort хийнэ
    couples.sort((c1, c2) => {
      const s1 = (sideOf.get(c1.a.id) || 0) + (sideOf.get(c1.b.id) || 0);
      const s2 = (sideOf.get(c2.a.id) || 0) + (sideOf.get(c2.b.id) || 0);
      if (s1 !== s2) return s1 - s2;
      return (
        personKey(c1.a) + personKey(c1.b)
      ).localeCompare(personKey(c2.a) + personKey(c2.b));
    });

    // хос бүрийг family unit болгон хувиргана
    couples.forEach(({ a, b }) => {
      if (used.has(a.id) || used.has(b.id)) return;

      let husband = a.sex === "male" ? a : b.sex === "male" ? b : a;
      let wife = a.sex === "female" ? a : b.sex === "female" ? b : b;

      const confirmed = coupleHasChild(husband, wife, nextRow);

      used.add(husband.id);
      used.add(wife.id);

      const husbandSibs = [];
      const wifeSibs = [];

      // хүүхэдтэй хос бол ах дүүсийг нь хамтад нь байрлуулна
      if (confirmed) {
        row.forEach((x) => {
          if (used.has(x.id)) return;
          if (x.spouseId) return;
          if (sharedParent(x, husband)) {
            husbandSibs.push(x);
            used.add(x.id);
          }
        });

        row.forEach((x) => {
          if (used.has(x.id)) return;
          if (x.spouseId) return;
          if (sharedParent(x, wife)) {
            wifeSibs.push(x);
            used.add(x.id);
          }
        });
      }

      husbandSibs.sort((a, b) =>
        personKey(a).localeCompare(personKey(b))
      );
      wifeSibs.sort((a, b) =>
        personKey(a).localeCompare(personKey(b))
      );

      units.push({
        type: "family",
        husband,
        wife,
        husbandSibs,
        wifeSibs,
      });
    });

    /* =================================================
       6) ҮЛДСЭН ГАНЦ БИЕ ГИШҮҮД
    ================================================= */
    row
      .filter((m) => !used.has(m.id))
      .sort((a, b) => {
        const sa = sideOf.get(a.id) || 0;
        const sb = sideOf.get(b.id) || 0;
        if (sa !== sb) return sa - sb;
        return personKey(a).localeCompare(personKey(b));
      })
      .forEach((m) => units.push({ type: "single", member: m }));

    /* =================================================
       7) UNIT-ҮҮДИЙГ ЗҮҮН / ТӨВ / БАРУУН ЭРЭМБЭЛЭХ
    ================================================= */
    function unitSide(u) {
      if (u.type === "single") return sideOf.get(u.member.id) || 0;
      return (
        (sideOf.get(u.husband.id) || 0) +
        (sideOf.get(u.wife.id) || 0)
      );
    }

    const left = [], center = [], right = [];
    units.forEach((u) => {
      const s = unitSide(u);
      if (s < 0) left.push(u);
      else if (s > 0) right.push(u);
      else center.push(u);
    });

    const orderedUnits = [...left, ...center, ...right];

    /* =================================================
       8) UNIT-ҮҮДИЙГ ТӨВД ТААРУУЛЖ БАЙРЛУУЛАХ
    ================================================= */
    const GAP = CARD_W + H_GAP;

    const widths = orderedUnits.map((u) =>
      u.type === "single"
        ? GAP
        : (u.husbandSibs.length + u.wifeSibs.length + 2) * GAP
    );

    const totalW =
      widths.reduce((a, b) => a + b, 0) +
      (orderedUnits.length - 1) * H_GAP;

    let cursorX = -totalW / 2;

    orderedUnits.forEach((u) => {
      if (u.type === "single") {
        newPosMap.set(u.member.id, { x: cursorX + GAP / 2, y });
        cursorX += GAP + H_GAP;
        return;
      }

      let x = cursorX;

      u.husbandSibs.forEach((s) => {
        newPosMap.set(s.id, { x: x + GAP / 2, y });
        x += GAP;
      });

      newPosMap.set(u.husband.id, { x: x + GAP / 2, y });
      x += GAP;

      newPosMap.set(u.wife.id, { x: x + GAP / 2, y });
      x += GAP;

      u.wifeSibs.forEach((s) => {
        newPosMap.set(s.id, { x: x + GAP / 2, y });
        x += GAP;
      });

      cursorX +=
        (u.husbandSibs.length + u.wifeSibs.length + 2) * GAP +
        H_GAP;
    });
  });

  /* =================================================
     9) ТООЦООЛСОН БАЙРЛАЛЫГ APPLY ХИЙХ
  ================================================= */
  members.forEach((m) => {
    const p = newPosMap.get(m.id);
    if (p) {
      m.x = p.x;
      m.y = p.y;
    }
  });

  posMap = newPosMap; // сүүлийн координатууд
}

// -- RENDER --
function layoutVisibleMembers() {
  // collapseUp логикоор нуух ancestor-уудыг олно
  const hiddenAnc = buildHiddenAncestorSet();

  // нуухгүй гишүүдийг буцаана
  return members.filter((m) => !hiddenAnc.has(m.id));
}

function renderTree() {
  // шаардлагатай DOM элементүүд байхгүй бол зогсооно
  if (!nodesLayer || !treeRoot || !svg) return;

  const scaleBox = document.getElementById("tree-scale");
  if (!scaleBox) {
    console.error("#tree-scale element not found (renderTree)");
    return;
  }

  // өмнөх картуудыг цэвэрлэнэ
  nodesLayer.innerHTML = "";

  // collapseUp-г тооцоод харагдах гишүүдийг авна
  const visibleMembers = layoutVisibleMembers();
  if (!visibleMembers.length) return;

  // 1) Гишүүн бүрийн картыг tree space дээр зурна
  visibleMembers.forEach((m) => {
    const card = createFamilyCard(m); // хүн бүрийн card

    // layoutTree() дээр бодсон координатыг ашиглана
    card.style.left = m.x - CARD_W / 2 + "px";
    card.style.top  = m.y - CARD_H / 2 + "px";

    nodesLayer.appendChild(card);
  });

  // DOM бүрэн зурсан дараа transform + SVG-г тохируулна
  requestAnimationFrame(() => {
    // tree-ийн бодит хүрээг олно
    const bounds = getTreeBounds(visibleMembers);

    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;

    const viewW = treeRoot.clientWidth;
    const viewH = treeRoot.clientHeight;
    if (treeW <= 0 || treeH <= 0) return;

    // tree-г дэлгэцэнд багтаах scale
    const fitScale = Math.min(viewW / treeW, viewH / treeH, 1);

    // хэрэглэгчийн zoom-той нийлүүлсэн scale
    const finalScale = fitScale * zoomState.userScale;

    // төвд байрлуулах offset
    const offsetX = (viewW - treeW * finalScale) / 2;
    const offsetY = (viewH - treeH * finalScale) / 2;

    // pan + zoom + tree space шилжилт
    scaleBox.style.transform =
      `translate(${offsetX + zoomState.panX}px, ${
        offsetY + zoomState.panY
      }px) ` +
      `scale(${finalScale}) ` +
      `translate(${-bounds.minX}px, ${-bounds.minY}px)`;

    // SVG нь картуудтай ижил tree space-д байх ёстой
    svg.setAttribute("width", treeW);
    svg.setAttribute("height", treeH);
    svg.setAttribute("viewBox", `0 0 ${treeW} ${treeH}`);

    svg.style.position = "absolute";
    svg.style.left = "0px";
    svg.style.top = "0px";

    // эцэг–эх, хань, хүүхдийн шугамуудыг зурна
    drawLines(visibleMembers);
  });
}



// -- CARD COMPONENT --
function createFamilyCard(member) {
  // family-card custom element үүсгэнэ
  const card = document.createElement("family-card");

  // үндсэн class ба ID-г dataset-д хадгална
  card.classList.add("family-card");
  card.dataset.id = member.id;

  // хүйсээр нь өнгө / стиль ялгана
  if (member.sex === "male") card.classList.add("male");
  else if (member.sex === "female") card.classList.add("female");

  // дээд үеийг нуух (collapse) төлөв
  if (member.collapseUp) card.classList.add("collapse-up");

  // Web Component-д өгөгдлийг дамжуулж render хийлгэнэ
  card.member = member;

  // + товч дархад гарах add-menu
  // family-card.js-с ирдэг CustomEvent
  card.addEventListener("add-click", (e) => {
    const { card } = e.detail;
    const menu = card.querySelector(".add-menu");
    toggleMenu(menu, card);
  });

  /* ===== CLICK ЛОГИК ===== */

  let clickTimer = null;

  // SINGLE CLICK → хүний мэдээлэл засах
  card.addEventListener("click", (e) => {
    // товч, menu дээр дарсан бол ignore
    if (
      e.target.closest(".node-btn") ||
      e.target.closest(".add-menu") ||
      e.target.closest("button")
    ) return;

    e.stopPropagation();
    if (clickTimer) clearTimeout(clickTimer);

    // double click-тэй зөрчилдөхгүй байлгах delay
    clickTimer = setTimeout(() => {
      openPersonModal("edit", member);
      clickTimer = null;
    }, 280);
  });

  // DOUBLE CLICK → profile дэлгэрэнгүй харах
  card.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    openProfileView(member);
  });

  // MOBILE: double tap → profile
  let lastTap = 0;
  card.addEventListener("touchend", () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      openProfileView(member);
    }
    lastTap = now;
  });

  // бэлэн болсон картыг буцаана
  return card;
}


function openMediaDeleteConfirm({ member, type, index }) {
  // устгах гэж буй медиа-г түр хадгална
  // (баталгаажуулалт дээр ашиглагдана)
  pendingMediaDelete = { member, type, index };

  // устгах баталгаажуулах modal-ийг харуулна
  document.getElementById("media-delete-backdrop").hidden = false;
  document.getElementById("media-delete-modal").hidden = false;

  // зураг уу, видео юу гэдгээс шалтгаалж текст сонгоно
  const text =
    type === "image"
      ? "Зургийг устгах уу?"
      : "Видеог устгах уу?";

  // modal дээрх анхааруулах текстийг солино
  document.getElementById("media-delete-text").textContent = text;
}

function closeMediaDeleteConfirm() {
  // устгах гэж байсан медиа-г цэвэрлэнэ
  pendingMediaDelete = null;

  // устгах баталгаажуулах modal-ийг хаана
  document.getElementById("media-delete-backdrop").hidden = true;
  document.getElementById("media-delete-modal").hidden = true;
}
// -- MENU HELPERS --
function toggleMenu(menu, card) {
  closeAllMenus();

  // body руу зөөнө
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }
  menu.onclick = (e) => e.stopPropagation(); //  ЭНЭ Л АЛХАМ 1

  menu.classList.remove("hidden");

  // ===== POSITION =====
  const cardRect = card.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top = cardRect.top - menuRect.height - 8;
  let left = cardRect.right - menuRect.width;

  if (top < 8) top = cardRect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  // =====  RE-BIND MENU ACTIONS HERE =====
  const memberId = Number(card.dataset.id);
  const member = findMember(memberId);
  if (!member) return;

  const buttons = menu.querySelectorAll("button");

  const [
    btnFather,
    btnMother,
    btnSpouse,
    btnChild,
    btnDetail,
    btnEdit,
    btnDelete,
  ] = buttons;

  btnFather.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-father", member, {
      sex: "male",
      name: "Эцэг",
      photoUrl: "img/profileman.avif",
    });
    closeAllMenus();
  };

  btnMother.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-mother", member, {
      sex: "female",
      name: "Эх",
      photoUrl: "img/profilewoman.jpg",
    });
    closeAllMenus();
  };

  btnSpouse.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-spouse", member, {
      name: "Хань",
      sex: "",
      photoUrl: "",
    });
    closeAllMenus();
  };

  btnChild.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("add-child", member, {
      name: "Хүүхэд",
      photoUrl: "img/profileson.jpg",
    });
    closeAllMenus();
  };

  btnDetail.onclick = (e) => {
    e.stopPropagation();
    openProfileView(member);
    closeAllMenus();
  };

  btnEdit.onclick = (e) => {
    e.stopPropagation();
    openPersonModal("edit", member);
    closeAllMenus();
  };

  btnDelete.onclick = (e) => {
    e.stopPropagation();
    openDeleteConfirm(member);
    closeAllMenus();
  };
}

function closeAllMenus() {
  // нээлттэй байгаа бүх add-menu-г олж
  // hidden class нэмж бүгдийг нь хаана
  document
    .querySelectorAll(".add-menu")
    .forEach((m) => m.classList.add("hidden"));
}

function setupPersonModal() {
  // modal-д хэрэгтэй DOM элементүүдийг авна
  const backdrop = document.getElementById("person-backdrop");
  const modal = document.getElementById("person-modal");
  const form = document.getElementById("person-form");
  const btnCancel = document.getElementById("person-cancel");

  // аль нэг нь байхгүй бол setup хийхгүй
  if (!backdrop || !modal || !form || !btnCancel) return;

  // cancel товч болон backdrop дархад modal хаана
  btnCancel.addEventListener("click", closePersonModal);
  backdrop.addEventListener("click", closePersonModal);

  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  // === ХҮЙС ↔ ЗУРАГ АВТО СИНК ===
  if (sexSelect && photoInput) {
    sexSelect.addEventListener("change", () => {
      const sex = normalizeSex(sexSelect.value);

      // хэрэглэгч өөрийн зураг оруулсан эсэхийг шалгана
      const isCustom =
        photoInput.value &&
        ![
          "img/profileman.avif",
          "img/profilewoman.jpg",
          "img/profileson.jpg",
          "img/profilespouse.jpg",
        ].includes(photoInput.value);

      // custom зураг биш бол хүйсээр нь default зураг солино
      if (!isCustom) {
        photoInput.value = defaultPhotoBySex(sex);
      }
    });
  }

  // form submit хийхэд page reload хийхгүй
  // өөрийн submit логикийг ажиллуулна
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitPersonForm();
  });
}

function openPersonModal(mode, targetMember, preset = {}) {
  // modal-ийн ажиллах горим ба зорилтот хүнийг хадгална
  modalMode = mode;
  modalTarget = targetMember;

  // modal-д хэрэгтэй DOM элементүүд
  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");
  const title = document.getElementById("person-modal-title");
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo"); // зураг URL

  // === EDIT MODE ===
  // тухайн хүний одоогийн мэдээллийг бөглөнө
  if (mode === "edit" && targetMember) {
    title.textContent = "Хүн засах";
    nameInput.value = targetMember.name || "";
    ageInput.value = targetMember.age || "";
    sexSelect.value = targetMember.sex || "";
    if (photoInput) {
      photoInput.value = targetMember.photoUrl || "";
    }
  }
  // === ADD MODE ===
  // preset өгөгдлөөр form-ийг урьдчилж бөглөнө
  else {
    title.textContent = "Хүн нэмэх";
    nameInput.value = preset.name || "";
    ageInput.value = "";
    sexSelect.value = preset.sex || "";
    if (photoInput) {
      photoInput.value = preset.photoUrl || "";
    }
  }

  // modal ба backdrop-ийг харуулна
  backdrop.hidden = false;
  modal.hidden = false;

  // CSS animation ажиллуулахын тулд дараагийн frame дээр class нэмнэ
  requestAnimationFrame(() => {
    modal.classList.add("show");
  });
}

function closePersonModal() {
  // modal болон backdrop DOM элементүүд
  const modal = document.getElementById("person-modal");
  const backdrop = document.getElementById("person-backdrop");

  // show class-ийг авч animation эхлүүлнэ
  modal.classList.remove("show");

  // animation дууссаны дараа бүрэн нуух
  setTimeout(() => {
    modal.hidden = true;
    backdrop.hidden = true;
  }, 180); // CSS transition-тэй тааруулсан хугацаа
}
function submitPersonForm() {
  // form дээрх input-уудыг авна
  const nameInput = document.getElementById("person-name");
  const ageInput = document.getElementById("person-age");
  const sexSelect = document.getElementById("person-sex");
  const photoInput = document.getElementById("person-photo");

  // form-оос ирсэн өгөгдлийг нэг объект болгоно
  const data = {
    name: nameInput.value.trim(),        // нэр
    age: ageInput.value.trim(),          // нас
    sex: sexSelect.value.trim(),          // хүйс
    photoUrl: photoInput ? photoInput.value.trim() : "", // зураг
  };

  let success = true; // нэмэх/засах амжилттай эсэх

  // modal-ийн горимоос шалтгаалж өөр логик ажиллуулна
  switch (modalMode) {
    case "edit":
      // одоо байгаа хүнийг засах
      if (modalTarget) editPersonWithData(modalTarget, data);
      break;

    case "add-father":
      // эцэг нэмэх (амжилтгүй бол false буцна)
      if (modalTarget) {
        success = addFatherWithData(modalTarget, data) !== false;
      }
      break;

    case "add-mother":
      // эх нэмэх
      if (modalTarget) {
        success = addMotherWithData(modalTarget, data) !== false;
      }
      break;

    case "add-spouse":
      // хань нэмэх
      if (modalTarget) {
        success = addSpouseWithData(modalTarget, data) !== false;
      }
      break;

    case "add-child":
      // хүүхэд нэмэх
      if (modalTarget) addChildWithData(modalTarget, data);
      break;
  }

  // warning гарсан бол modal хаахгүй
  if (!success) return;

  // өөрчлөлтийг DB-д хадгална
  saveTreeToDB();

  // modal хааж tree-г дахин зурна
  closePersonModal();
  scheduleRender();
}

// -- ADD / EDIT / DELETE --
function normalizeSex(str) {
  // орж ирсэн утгыг жижиг үсэг болгоно (null-safe)
  const s = (str || "").toLowerCase();

  // эр хүний бүх боломжит бичвэрийг "male" болгоно
  if (s === "male" || s === "эр" || s === "эрэгтэй") return "male";

  // эм хүний бүх боломжит бичвэрийг "female" болгоно
  if (s === "female" || s === "эм" || s === "эмэгтэй") return "female";

  // тодорхойгүй бол хоосон утга
  return "";
}
function addFatherWithData(child, data) {
  // тухайн хүүхдэд аль хэдийн эцэг байгаа эсэхийг шалгана
  const existingFather = getParentBySex(child, "male");
  if (existingFather) {
    showWarning("Эцэг аль хэдийн бүртгэлтэй байна.");
    return false; // давхар эцэг нэмэхийг зөвшөөрөхгүй
  }

  // эцэг нь хүүхдээс нэг үе дээгүүр байрлана
  const level = child.level - 1;

  // шинэ эцэг гишүүн үүсгэнэ
  const father = new FamilyMember({
    id: nextId++,                         // шинэ ID
    name: data.name || "Эцэг",            // нэр
    age: data.age,                        // нас
    sex: "male",                          // хүйс
    level,                                // үе
    photoUrl: data.photoUrl || "img/profileman.avif", // зураг
  });

  // эцэг ↔ хүүхдийн холбоос
  father.children.push(child.id); // эцэгт хүүхэд нэмнэ
  child.parents.push(father.id);  // хүүхдэд эцэг нэмнэ

  // хэрвээ эх аль хэдийн байвал эцэг, эхийг spouse болгоно
  const mother = getParentBySex(child, "female");
  if (mother) {
    father.spouseId = mother.id;
    mother.spouseId = father.id;
  }

  // шинэ эцгийг нийт гишүүдэд нэмнэ
  members.push(father);

  // parents массивыг canonical хэлбэрт оруулна
  members.forEach((m) => normalizeParents(m));
}

function addMotherWithData(child, data) {
  // тухайн хүүхдэд аль хэдийн эх байгаа эсэхийг шалгана
  const existingMother = getParentBySex(child, "female");
  if (existingMother) {
    showWarning("Эх аль хэдийн бүртгэлтэй байна.");
    return; // давхар эх нэмэхийг зөвшөөрөхгүй
  }

  // эх нь хүүхдээс нэг үе дээгүүр байрлана
  const level = child.level - 1;

  // шинэ эх гишүүн үүсгэнэ
  const mother = new FamilyMember({
    id: nextId++,                          // шинэ ID
    name: data.name || "Эх",               // нэр
    age: data.age,                         // нас
    sex: "female",                         // хүйс
    level,                                 // үе
    photoUrl: data.photoUrl || "img/profilewoman.jpg", // зураг
  });

  // эх ↔ хүүхдийн холбоос
  mother.children.push(child.id); // эхэд хүүхэд нэмнэ
  child.parents.push(mother.id);  // хүүхдэд эх нэмнэ

  // хэрвээ эцэг аль хэдийн байвал эх, эцгийг spouse болгоно
  const father = getParentBySex(child, "male");
  if (father) {
    mother.spouseId = father.id;
    father.spouseId = mother.id;
  }

  // шинэ эхийг нийт гишүүдэд нэмнэ
  members.push(mother);

  // parents массивыг canonical хэлбэрт оруулж засна
  members.forEach((m) => normalizeParents(m));
}

function addSpouseWithData(person, data) {
  // тухайн хүнд аль хэдийн хань байгаа эсэхийг шалгана
  if (person.spouseId) {
    showWarning("Хань аль хэдийн бүртгэлтэй байна.");
    return; // давхар хань нэмэхийг зөвшөөрөхгүй
  }

  // === ХҮЙС ТОГТООХ ===
  // ихэнх тохиолдолд эсрэг хүйсээр нь автоматаар онооно
  let spouseSex;
  if (person.sex === "male") spouseSex = "female";
  else if (person.sex === "female") spouseSex = "male";
  else spouseSex = normalizeSex(data.sex); // тодорхойгүй бол хэрэглэгчийн оруулснаар

  // шинэ хань гишүүн үүсгэнэ
  const spouse = new FamilyMember({
    id: nextId++,                 // шинэ ID
    name: data.name || "Хань",    // нэр
    age: data.age,                // нас
    sex: spouseSex,               // хүйс
    level: person.level,          // ижил үе
    // зураг: хэрэглэгч custom оруулаагүй бол хүйсээр default авна
    photoUrl:
      data.photoUrl && data.photoUrl.trim()
        ? data.photoUrl.trim()
        : defaultPhotoBySex(spouseSex),
  });

  // spouse ↔ spouse холбоос
  spouse.spouseId = person.id;
  person.spouseId = spouse.id;

  // === ХҮҮХДҮҮДТЭЙ ХОЛБООС СИНК ===
  // тухайн хүний хүүхдүүдийг шинэ ханьд холбож өгнө
  person.children.forEach((cid) => {
    const child = findMember(cid);
    if (!child) return;

    // ханийн children массивт нэмнэ
    if (!spouse.children.includes(child.id)) {
      spouse.children.push(child.id);
    }

    // тухайн хүүхдэд эцэг/эх дутуу байвал нөхнө
    const hasMale = getParentBySex(child, "male");
    const hasFemale = getParentBySex(child, "female");

    if (spouseSex === "male" && !hasMale) {
      child.parents.push(spouse.id);
    }
    if (spouseSex === "female" && !hasFemale) {
      child.parents.push(spouse.id);
    }
  });

  // шинэ ханийг нийт гишүүдэд нэмнэ
  members.push(spouse);

  // parents массивуудыг canonical хэлбэрт оруулж засна
  members.forEach((m) => normalizeParents(m));
}

function addChildWithData(parent, data) {
  // хүйсийг стандарт хэлбэрт оруулна
  const sex = normalizeSex(data.sex);

  // шинэ хүүхэд гишүүн үүсгэнэ
  const child = new FamilyMember({
    id: nextId++,                 // шинэ ID
    name: data.name || "Хүүхэд",  // нэр
    age: data.age,                // нас
    sex,                           // хүйс
    level: parent.level + 1,      // эцэг/эхээс нэг үе доор
    photoUrl:
      data.photoUrl && data.photoUrl.trim()
        ? data.photoUrl.trim()
        : "img/profileson.jpg",   // зураг (default байж болно)
  });

  /* ===== ЭЦЭГ/ЭХ-ТЭЙ ХОЛБОХ ===== */

  // эхлээд эцэг/эхийн жагсаалтыг цэвэр эхлүүлнэ
  child.parents = [];
  child.parents.push(parent.id); // тухайн parent-ийг нэмнэ

  // parent-ийн children-д энэ хүүхдийг нэмнэ
  if (!parent.children.includes(child.id)) {
    parent.children.push(child.id);
  }

  // хэрвээ parent ханьтай бол (мөн ижил түвшинд байвал)
  // ханийг автоматаар хоёр дахь эцэг/эх болгоно
  if (parent.spouseId) {
    const spouse = findMember(parent.spouseId);
    if (spouse && spouse.level === parent.level) {
      if (!spouse.children.includes(child.id)) {
        spouse.children.push(child.id);
      }
      if (!child.parents.includes(spouse.id)) {
        child.parents.push(spouse.id);
      }
    }
  }

  /* ===== LINEAGE SIDE ТОДОРХОЙЛОХ =====
     Энэ хүүхэд аль талын (эцгийн / эхийн) салбарынх вэ
  */

  child._lineageSide = null;

  // тухайн parent-ийн өмнөх хүүхдүүд (ах, эгч, дүү нар)
  const siblings = parent.children
    .map((cid) => findMember(cid))
    .filter((m) => m && m.id !== child.id);

  // өмнө нь гэрлэсэн ах (эрэгтэй) байгаа эсэх
  const husbandSibling = siblings.find((s) => s.sex === "male" && s.spouseId);

  // өмнө нь гэрлэсэн эгч (эмэгтэй) байгаа эсэх
  const wifeSibling = siblings.find((s) => s.sex === "female" && s.spouseId);

  if (husbandSibling) {
    // эцгийн талын салбар
    child._lineageSide = "left";
  } else if (wifeSibling) {
    // эхийн талын салбар
    child._lineageSide = "right";
  }

  // шинэ хүүхдийг нийт гишүүдэд нэмнэ
  members.push(child);

  // parents массивуудыг canonical хэлбэрт оруулж цэгцэлнэ
  members.forEach((m) => normalizeParents(m));
}

function editPersonWithData(member, data) {
  let sexChanged = false; // хүйс өөрчлөгдсөн эсэхийг тэмдэглэнэ

  // === НЭР ===
  // хоосон биш бол нэрийг шинэчилнэ
  if (data.name?.trim()) {
    member.name = data.name.trim();
  }

  // === НАС ===
  // string бөгөөд хоосон биш үед л солино
  if (typeof data.age === "string" && data.age.trim() !== "") {
    member.age = data.age.trim();
  }

  // === ХҮЙС ===
  if (data.sex?.trim()) {
    const newSex = normalizeSex(data.sex);
    // хүйс өөрчлөгдсөн үед тэмдэглэнэ
    if (newSex && newSex !== member.sex) {
      member.sex = newSex;
      sexChanged = true;
    }
  }

  // хэрэглэгч өөрийн зураг оруулсан эсэхийг шалгана
  const hasCustomPhoto =
    member.photoUrl &&
    ![
      "img/profileman.avif",
      "img/profilewoman.jpg",
      "img/profileson.jpg",
      "img/profilespouse.jpg",
    ].includes(member.photoUrl);

  // === ЗУРАГ ===
  if (data.photoUrl?.trim()) {
    // хэрэглэгч шинэ зураг оруулсан бол шууд солино
    member.photoUrl = data.photoUrl.trim();
  } 
  // хэрвээ хүйс солигдсон ба custom зураггүй бол
  // хүйсэд тохирсон default зураг тавина
  else if (sexChanged && !hasCustomPhoto) {
    member.photoUrl = defaultPhotoBySex(member.sex);
  }
}

function deletePerson(member) {
  // ганцхан үлдсэн үндсэн "Би" node-ийг устгахыг хориглоно
  if (member.level === 0 && members.length === 1) {
    alert("Үндсэн 'Би' node-ийг устгах боломжгүй.");
    return;
  }

  const id = member.id;

  // 1) тухайн гишүүнийг members массиваас устгана
  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) {
    members.splice(idx, 1);
  }

  // 2) бусад гишүүдээс холбоосуудыг цэвэрлэнэ
  //    - children / parents дотроос ID-г авна
  //    - spouse холбоог салгана
  members.forEach((m) => {
    m.children = (m.children || []).filter((cid) => cid !== id);
    m.parents = (m.parents || []).filter((pid) => pid !== id);
    if (m.spouseId === id) m.spouseId = null;
  });

  // 3) эцэг/эх нь устсан хүүхдүүдийн level-ийг дахин тооцоолно
  //    боломжит үлдсэн parent-ууд дээр үндэслэнэ
  const byId = new Map(members.map((m) => [m.id, m]));

  members.forEach((child) => {
    const pids = (child.parents || []).filter((pid) => byId.has(pid));
    if (!pids.length) return; // parent үлдээгүй бол level-г өөрчлөхгүй

    const parentLevels = pids
      .map((pid) => byId.get(pid).level)
      .filter((v) => typeof v === "number" && isFinite(v));

    if (!parentLevels.length) return;

    const targetLevel = Math.min(...parentLevels) + 1;
    if (child.level !== targetLevel) child.level = targetLevel;
  });

  // 4) parents массивуудыг canonical хэлбэрт оруулж цэгцэлнэ
  members.forEach((m) => normalizeParents(m));

  // өөрчлөлтийг хадгалаад tree-г дахин зурна
  saveTreeToDB();
  scheduleRender();
}
function openDeleteConfirm(member) {
  // устгах гэж буй хүнийг түр хадгална
  pendingDeleteMember = member;

  // устгах баталгаажуулах modal-ийн элементүүд
  const backdrop = document.getElementById("delete-backdrop");
  const modal = document.getElementById("delete-modal");

  // modal ба backdrop-ийг харуулна
  backdrop.hidden = false;
  modal.hidden = false;

  // CSS hidden-ийг хүчээр override хийж,
  // logout / delete шиг яг харагдуулна
  backdrop.style.display = "block";
  modal.style.display = "flex";
}

function closeDeleteConfirm() {
  // устгах гэж байсан хүнийг цэвэрлэнэ
  pendingDeleteMember = null;

  // устгах баталгаажуулах modal-ийг хаана
  document.getElementById("delete-backdrop").hidden = true;
  document.getElementById("delete-modal").hidden = true;
}

// -- THEME BUTTON --
function setupThemeButton() {
  // theme солих товчийг авна
  const btnTheme = document.getElementById("btn-theme");
  if (!btnTheme) return; // товч байхгүй бол зогсоно

  // дархад dark theme-ийг асаах / унтраах
  btnTheme.addEventListener("click", (e) => {
    e.stopPropagation(); // гадна click-д баригдахгүй
    document.body.classList.toggle("dark");
  });
}

function safeLine(svg, x1, y1, x2, y2) {
  // бүх координат тоо мөн эсэх, NaN/Infinity биш эсэхийг шалгана
  // (алдаатай өгөгдлөөс болж SVG эвдрэхээс сэргийлнэ)
  if (![x1, y1, x2, y2].every((v) => typeof v === "number" && isFinite(v))) {
    return;
  }

  // SVG орчинд шинэ line элемент үүсгэнэ
  const line = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );

  // шугамын эхлэл ба төгсгөлийн координатууд
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);

  // шугамын харагдах байдал
  line.setAttribute("stroke", "#8a6a4a"); // өнгө
  line.setAttribute("stroke-width", "2"); // зузаан
  line.setAttribute("stroke-linecap", "round"); // үзүүрийг дугуй

  // бэлэн болсон шугамыг SVG-д нэмнэ
  svg.appendChild(line);
}
function drawLines(visibleMembers) {
  // SVG байхгүй бол зурахгүй
  if (!svg) return;

  // өмнөх бүх шугамыг цэвэрлэнэ
  svg.innerHTML = "";

  // харагдаж байгаа гишүүдийн ID-ууд
  const visibleIds = new Set(visibleMembers.map((m) => m.id));
  const GAP = 18; // parent → child хоорондын босоо зай

  /* ===== ХАНЬ (ХЭВТЭЭ ШУГАМ) ===== */
  visibleMembers.forEach((m) => {
    // ханьгүй эсвэл харагдахгүй бол алгасна
    if (!m.spouseId || !visibleIds.has(m.spouseId)) return;

    // давхар зурахаас сэргийлнэ
    if (m.id > m.spouseId) return;

    const a = cardRect(m.id);
    const b = cardRect(m.spouseId);
    if (!a || !b) return;

    // хоёр картын дунд шугам
    const y = (a.top + a.bottom) / 2;
    safeLine(svg, a.right, y, b.left, y);
  });

  /* ===== ХҮҮХЭД ↔ ЭЦЭГ/ЭХ (ЦЭГЦТЭЙ, ТЭНЦВЭРТЭЙ) ===== */
  visibleMembers.forEach((child) => {
    // харагдаж байгаа parent-уудын cardRect-ууд
    const parentRects = (child.parents || [])
      .map((pid) => findMember(pid))
      .filter((p) => p && visibleIds.has(p.id))
      .map((p) => cardRect(p.id))
      .filter(Boolean);

    if (!parentRects.length) return;

    const c = cardRect(child.id);
    if (!c) return;

    // === PARENT FAMILY CENTER ===
    // 2 parent байвал хосын төвийг авна
    let parentsCenterX = null;

    if (child.parents?.length === 2) {
      const [p1, p2] = child.parents;
      const c1 = familyCenterX(p1);
      const c2 = familyCenterX(p2);

      // хосуудын familyCenterX ихэнхдээ адил
      parentsCenterX = c1 ?? c2;
    }

    // fallback: бүх parent-ын дундаж
    if (parentsCenterX == null) {
      parentsCenterX =
        parentRects.reduce((s, p) => s + p.cx, 0) / parentRects.length;
    }

    // parent-уудын хамгийн доод y (overlap-аас сэргийлнэ)
    const parentsBottomY = Math.max(...parentRects.map((p) => p.bottom));

    // === FAMILY-SPECIFIC OFFSET ===
    // нэг гэр бүлийн шугамууд давхцахаас хамгаална
    let familyKey = "single";
    if (child.parents?.length) {
      familyKey = child.parents.slice().sort((a, b) => a - b).join("-");
    }

    // deterministic offset (тогтвортой байрлал)
    const familyOffset =
      (Array.from(familyKey).reduce((s, c) => s + c.charCodeAt(0), 0) % 3) * 12;

    const midY = parentsBottomY + GAP + familyOffset;

    // 1) parent бүрээс доош босоо шугам
    parentRects.forEach((p) => {
      safeLine(svg, p.cx, p.bottom, p.cx, midY);
    });

    // 2) олон parent байвал дунд нь хэвтээ холбоос
    if (parentRects.length > 1) {
      const minX = Math.min(...parentRects.map((p) => p.cx));
      const maxX = Math.max(...parentRects.map((p) => p.cx));
      safeLine(svg, minX, midY, maxX, midY);
    }

    // 3) parent төвөөс хүүхэд рүү доош буулгана
    const childTopY = c.top;
    const jointY = childTopY - 6; // жижиг зангилаа

    safeLine(svg, parentsCenterX, midY, parentsCenterX, jointY);
    safeLine(svg, parentsCenterX, jointY, c.cx, jointY);
    safeLine(svg, c.cx, jointY, c.cx, childTopY);
  });
}

// -- PROFILE VIEW --

function openProfileView(member) {
  // одоо нээгдэж буй профайлын хүнийг хадгална
  currentProfileMember = member;

  // profile view болон backdrop элементүүд
  const backdrop = document.getElementById("profile-backdrop");
  const view = document.getElementById("profile-view");

  // DOM элемент олдохгүй бол зогсоно
  if (!view || !backdrop) {
    console.warn("Profile view elements not found");
    return;
  }

  // helper: хоосон эсвэл null утгыг "—" болгоно
  const v = (x) => (x && String(x).trim() ? x : "—");

  // текст, зураг харуулах элементүүд
  const imgEl = document.getElementById("profile-img");
  const nameEl = document.getElementById("profile-name");
  const familyEl = document.getElementById("profile-family");
  const sexEl = document.getElementById("profile-sex");
  const birthEl = document.getElementById("profile-birth");
  const deathEl = document.getElementById("profile-death");
  const placeEl = document.getElementById("profile-place");
  const eduEl = document.getElementById("profile-education");
  const posEl = document.getElementById("profile-position");
  const listEl = document.getElementById("profile-achievements");

  /* ===== ЗУРАГ ===== */
  if (imgEl) {
    imgEl.src = member.photoUrl || "img/profileson.jpg";
    imgEl.alt = member.name || "Profile";
  }

  /* ===== НЭР ===== */
  if (nameEl) {
    nameEl.textContent = member.name || "Нэргүй";
  }

  /* ===== ОВОГ / ЭЦГИЙН НЭР ===== */
  if (familyEl) {
    const fam = [member.familyName, member.fatherName]
      .filter((x) => x && x.trim())
      .join(" ");
    familyEl.textContent = fam || "—";
  }

  /* ===== ХҮЙС ===== */
  if (sexEl) {
    sexEl.textContent =
      "Хүйс: " +
      (member.sex === "male"
        ? "Эр"
        : member.sex === "female"
        ? "Эм"
        : "—");
  }

  /* ===== ТӨРСӨН / НАС БАРСАН / ГАЗАР ===== */
  if (birthEl) birthEl.textContent = "Төрсөн: " + v(member.birthDate);
  if (deathEl) deathEl.textContent = "Нас барсан: " + v(member.deathDate);
  if (placeEl) placeEl.textContent = "Төрсөн газар: " + v(member.birthPlace);

  /* ===== БОЛОВСРОЛ / АЖИЛ ===== */
  if (eduEl) eduEl.textContent = v(member.education);
  if (posEl) posEl.textContent = v(member.position);

  /* ===== ШАГНАЛ, АМЖИЛТ ===== */
  if (listEl) {
    listEl.innerHTML = "";

    if (Array.isArray(member.achievements) && member.achievements.length) {
      member.achievements.forEach((a) => {
        const li = document.createElement("li");
        li.textContent = a;
        listEl.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "—";
      listEl.appendChild(li);
    }
  }

  /* ===== MEDIA (ЗУРАГ & ВИДЕО) ===== */
  const mediaBox = document.getElementById("profile-media");
  if (mediaBox) {
    mediaBox.innerHTML = "";

    // --- ЗУРГУУД ---
    if (Array.isArray(member.images)) {
      member.images.forEach((url, i) => {
        const wrap = document.createElement("div");
        wrap.className = "media-item";

        const img = document.createElement("img");
        img.src = url;
        img.style.width = "140px";
        img.style.borderRadius = "12px";
        img.style.cursor = "zoom-in";

        // зураг дээр дарахад fullscreen нээнэ
        img.onclick = (e) => {
          e.stopPropagation(); // profile хаагдахаас сэргийлнэ
          openImageFullscreen(url);
        };

        // зураг устгах товч
        const del = document.createElement("button");
        del.className = "media-delete";
        del.textContent = "✕";
        del.onclick = (e) => {
          e.stopPropagation();
          openMediaDeleteConfirm({
            member,
            type: "image",
            index: i,
          });
        };

        wrap.append(img, del);
        mediaBox.appendChild(wrap);
      });
    }

    // --- ВИДЕОНУУД ---
    if (Array.isArray(member.videos)) {
      member.videos.forEach((url, i) => {
        const wrap = document.createElement("div");
        wrap.className = "media-item";

        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.style.width = "220px";
        video.style.borderRadius = "12px";

        // видео устгах товч
        const del = document.createElement("button");
        del.className = "media-delete";
        del.textContent = "✕";
        del.onclick = (e) => {
          e.stopPropagation();
          openMediaDeleteConfirm({
            member,
            type: "video",
            index: i,
          });
        };

        wrap.append(video, del);
        mediaBox.appendChild(wrap);
      });
    }

    // зураг, видео хоёулаа байхгүй үед
    if (
      (!member.images || member.images.length === 0) &&
      (!member.videos || member.videos.length === 0)
    ) {
      mediaBox.textContent = "—";
    }
  }

  // profile view-г харуулна
  backdrop.hidden = false;
  view.hidden = false;
}

function closeProfileView() {
  // profile view болон backdrop элементүүдийг авна
  const view = document.getElementById("profile-view");
  const backdrop = document.getElementById("profile-backdrop");

  // profile modal-ийг хаана
  if (view) view.hidden = true;

  // backdrop-ийг мөн нууж өгнө
  if (backdrop) backdrop.hidden = true;
}

// close handlers (safe)
// profile хаах товч дархад profile view-г хаана
document
  .getElementById("profile-close")
  ?.addEventListener("click", closeProfileView);

// backdrop дээр дархад profile view-г хаана
document
  .getElementById("profile-backdrop")
  ?.addEventListener("click", closeProfileView);

// одоо нээгдсэн profile-ийн гишүүнийг хадгална
let currentProfileMember = null;


// 
// profile засварлах үеийн зурагнуудыг түр хадгална
let editImages = [];

// profile засварлах үеийн видеонуудыг түр хадгална
let editVideos = [];

// profile edit хэсгийг хаана
function closeProfileEdit() {
  const edit = document.getElementById("profile-edit");
  if (edit) edit.hidden = true;
}

// profile edit хаах товч
document
  .getElementById("profile-edit-close")
  ?.addEventListener("click", closeProfileEdit);

// profile edit backdrop дархад хаана
document
  .getElementById("profile-edit-backdrop")
  ?.addEventListener("click", closeProfileEdit);

// ===== PROFILE EDIT SAVE =====
document
  .getElementById("profile-edit-save")
  ?.addEventListener("click", () => {
    // profile нээгдээгүй бол хадгалахгүй
    if (!currentProfileMember) return;

    // === PROFILE ЗУРАГ ===
    // preview байвал түүнийг үндсэн зураг болгоно
    const previewEl = document.getElementById("photo-preview");
    if (previewEl && !previewEl.hidden && previewEl.src) {
      currentProfileMember.photoUrl = previewEl.src;
    }

    // === BASIC INFO ===
    currentProfileMember.familyName = document
      .getElementById("edit-familyName")
      .value.trim();

    currentProfileMember.fatherName = document
      .getElementById("edit-fatherName")
      .value.trim();

    currentProfileMember.birthDate =
      document.getElementById("edit-birthDate").value;

    currentProfileMember.deathDate =
      document.getElementById("edit-deathDate").value;

    currentProfileMember.education = document
      .getElementById("edit-education")
      .value.trim();

    currentProfileMember.position = document
      .getElementById("edit-position")
      .value.trim();

    // === ACHIEVEMENTS ===
    // мөр мөрөөр нь массив болгоно
    currentProfileMember.achievements = document
      .getElementById("edit-achievements")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    // === BIRTH PLACE LOGIC ===
    // Монгол / Гадаад гэдгээр ялгана
    const country = document.getElementById("edit-country")?.value;
    const province = document.getElementById("edit-province")?.value;
    const soum = document.getElementById("edit-soum")?.value;
    const foreign = document.getElementById("edit-foreign-place")?.value;

    if (country === "MN") {
      // Монгол бол Аймаг, Сум нийлүүлнэ
      currentProfileMember.birthPlace = [province, soum]
        .filter(Boolean)
        .join(", ");
    } else if (country === "OTHER") {
      // Гадаад бол free text
      currentProfileMember.birthPlace = foreign?.trim() || "";
    }

    // === MEDIA SAVE ===
    // edit үед хадгалсан зураг, видеонуудыг онооно
    currentProfileMember.images = [...editImages];
    currentProfileMember.videos = [...editVideos];

    // өөрчлөлтийг DB-д хадгална
    saveTreeToDB();

    // profile view-г шинэ өгөгдлөөр дахин нээнэ
    openProfileView(currentProfileMember);

    // edit modal-ийг хаана
    closeProfileEdit();
  });

// -- PROFILE EDIT BUTTON --
// profile edit товч дархад тухайн хүний profile edit-ийг нээнэ
document.getElementById("profile-edit-btn")?.addEventListener("click", () => {
  if (currentProfileMember) {
    openProfileEdit(currentProfileMember);
  }
});


// -- BIRTH PLACE DROPDOWN LOGIC --
// төрсөн улсын сонголт
const countrySelect = document.getElementById("edit-country");

// Монголын аймаг сонгох select
const provinceSelect = document.getElementById("edit-province");

// Монголын сум сонгох select
const soumSelect = document.getElementById("edit-soum");

// гадаад орны төрсөн газрыг чөлөөтэй бичих input
const foreignInput = document.getElementById("edit-foreign-place");

// Монголын талбаруудыг агуулсан блок
const mongoliaBlock = document.getElementById("mongolia-fields");

// Гадаад орны талбаруудыг агуулсан блок
const foreignBlock = document.getElementById("foreign-fields");

if (countrySelect) {
  // улс солигдоход төрсөн газрын талбаруудыг тохируулна
  countrySelect.addEventListener("change", () => {
    const val = countrySelect.value;

    // === МОНГОЛ ===
    if (val === "MN") {
      // Монголын талбаруудыг харуулж, гадаад талбарыг нуух
      mongoliaBlock.hidden = false;
      foreignBlock.hidden = true;

      // аймаг, сумын select-үүдийг идэвхжүүлэх
      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // аймгуудын жагсаалтыг дахин бөглөнө
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");

      // сумын жагсаалтыг цэвэрлэнэ
      soumSelect.innerHTML = `<option value="">— Сонгох —</option>`;
    }

    // === ГАДААД УЛС ===
    else if (val === "OTHER") {
      // гадаад орны input-ийг харуулж, Монголын талбаруудыг нуух
      mongoliaBlock.hidden = true;
      foreignBlock.hidden = false;

      // Монголын сонголтуудыг цэвэрлэнэ
      provinceSelect.value = "";
      soumSelect.value = "";
    }

    // === УЛС СОНГООГҮЙ ===
    else {
      // аль алиныг нь нууж, цэвэр төлөвт оруулна
      mongoliaBlock.hidden = true;
      foreignBlock.hidden = true;
    }
  });
}

// Аймаг - Сум
// аймаг солигдоход тухайн аймгийн сумуудыг бөглөнө
provinceSelect?.addEventListener("change", () => {
  const province = provinceSelect.value;

  // сонгосон аймгийн сумуудын жагсаалтыг авна
  const soums = window.MONGOLIA[province] || [];

  // сумын select-ийг дахин бөглөнө
  soumSelect.innerHTML =
    `<option value="">— Сонгох —</option>` +
    soums
      .map((s) => `<option value="${s}">${s}</option>`)
      .join("");
});

function syncBirthPlaceUI(member) {
  // төрсөн газрын form элементүүд
  const countrySelect = document.getElementById("edit-country");
  const provinceSelect = document.getElementById("edit-province");
  const soumSelect = document.getElementById("edit-soum");
  const foreignInput = document.getElementById("edit-foreign-place");
  const mongoliaBlock = document.getElementById("mongolia-fields");
  const foreignBlock = document.getElementById("foreign-fields");

  // country select байхгүй бол зогсоно
  if (!countrySelect) return;

  /* ===== RESET ===== */
  // эхлээд бүх блокийг нууж, select-үүдийг идэвхгүй болгоно
  mongoliaBlock.hidden = true;
  foreignBlock.hidden = true;

  provinceSelect.disabled = true;
  soumSelect.disabled = true;

  /* ===== МОНГОЛ ЭСЭХИЙГ ШАЛГАХ ===== */
  if (member.birthPlace) {
    // "Аймаг, Сум" хэлбэрийг задлана
    const parts = member.birthPlace.split(",").map((x) => x.trim());

    // эхний хэсэг нь Монголын аймаг мөн эсэх
    if (parts.length >= 1 && window.MONGOLIA[parts[0]]) {
      countrySelect.value = "MN";
      mongoliaBlock.hidden = false;

      // аймаг, сум сонгох боломжтой болгоно
      provinceSelect.disabled = false;
      soumSelect.disabled = false;

      // аймгуудын жагсаалтыг бөглөнө
      provinceSelect.innerHTML =
        `<option value="">— Сонгох —</option>` +
        Object.keys(window.MONGOLIA)
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");

      // аймгийг сонгож өгнө
      provinceSelect.value = parts[0];

      // сумын жагсаалтыг бөглүүлэхийн тулд change event үүсгэнэ
      provinceSelect.dispatchEvent(new Event("change"));

      // хэрвээ сум байгаа бол сонгож өгнө
      if (parts[1]) {
        soumSelect.value = parts[1];
      }
      return;
    }
  }

  /* ===== ГАДААД УЛС ===== */
  if (member.birthPlace) {
    countrySelect.value = "OTHER";
    foreignBlock.hidden = false;

    // гадаад орны төрсөн газрыг шууд бичнэ
    foreignInput.value = member.birthPlace;
  }
}

function openProfileEdit(member) {
  // одоо засварлаж буй profile-ийн гишүүнийг хадгална
  currentProfileMember = member;

  /* ===== MEDIA PRELOAD ===== */
  // edit горимд зураг, видеонуудыг түр хуулж авна
  editImages = [...(member.images || [])];
  editVideos = [...(member.videos || [])];

  // edit хэсэгт media-г дахин зурна
  renderEditMedia();

  /* ===== TEXT FIELDS ===== */
  // profile-ийн одоогийн мэдээллээр form-ийг бөглөнө
  document.getElementById("edit-familyName").value = member.familyName || "";
  document.getElementById("edit-fatherName").value = member.fatherName || "";
  document.getElementById("edit-birthDate").value = member.birthDate || "";
  document.getElementById("edit-deathDate").value = member.deathDate || "";
  document.getElementById("edit-education").value = member.education || "";
  document.getElementById("edit-position").value = member.position || "";
  document.getElementById("edit-achievements").value = (
    member.achievements || []
  ).join("\n"); // мөр мөрөөр нь харуулна

  /* ===== ТӨРСӨН ГАЗАР UI ===== */
  // Монгол / Гадаад UI-г birthPlace-д тааруулж синк хийнэ
  syncBirthPlaceUI(member);

  /* ===== EDIT VIEW SHOW ===== */
  // edit backdrop-ийг нууж, edit хэсгийг харуулна
  const el = document.getElementById("profile-edit-backdrop");
  if (el) el.hidden = true;
  document.getElementById("profile-edit").hidden = false;

  /* ===== PROFILE ЗУРАГ PRELOAD ===== */
  // preview, placeholder, URL input элементүүд
  const previewEl = document.getElementById("photo-preview");
  const placeholderEl = document.getElementById("photo-placeholder");
  const urlInputEl = document.getElementById("edit-photo-url");

  if (previewEl && placeholderEl && urlInputEl) {
    if (member.photoUrl) {
      // зураг байгаа бол preview харуулна
      previewEl.src = member.photoUrl;
      previewEl.hidden = false;
      placeholderEl.hidden = true;

      // зөвхөн http URL байвал input-д бөглөнө
      urlInputEl.value = member.photoUrl.startsWith("http")
        ? member.photoUrl
        : "";
    } else {
      // зураг байхгүй бол placeholder харуулна
      previewEl.hidden = true;
      placeholderEl.hidden = false;
      urlInputEl.value = "";
    }
  }
}
function renderEditMedia() {
  // edit хэсгийн зураг, видео контейнерүүд
  const imgBox = document.getElementById("edit-images");
  const vidBox = document.getElementById("edit-videos");

  // аль нэг нь байхгүй бол зогсоно
  if (!imgBox || !vidBox) return;

  // өмнөх media-г цэвэрлэнэ
  imgBox.innerHTML = "";
  vidBox.innerHTML = "";

  /* ===== ЗУРГУУД ===== */
  editImages.forEach((url, i) => {
    const img = document.createElement("img");
    img.src = url;
    img.style.width = "100px";
    img.style.margin = "4px";
    img.style.borderRadius = "8px";
    img.style.objectFit = "cover";
    img.title = "Дарж устгана";

    // зураг дээр дархад жагсаалтаас устгана
    img.onclick = () => {
      editImages.splice(i, 1);
      renderEditMedia(); // дахин зурна
    };

    imgBox.appendChild(img);
  });

  /* ===== ВИДЕОНУУД ===== */
  editVideos.forEach((url, i) => {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.style.width = "140px";
    v.style.margin = "4px";
    v.title = "Дарж устгана";

    // видео дээр дархад жагсаалтаас устгана
    v.onclick = () => {
      editVideos.splice(i, 1);
      renderEditMedia(); // дахин зурна
    };

    vidBox.appendChild(v);
  });
}
// зураг нэмэх товч дархад file chooser нээнэ
document.getElementById("add-image")?.addEventListener("click", () => {
  // түр file input үүсгэнэ
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*"; // зөвхөн зураг

  // файл сонгогдсоны дараах логик
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      // Cloudflare R2 руу upload хийнэ
      const url = await uploadFileToR2(file);

      // upload хийсэн зургийн URL-г түр хадгална
      editImages.push(url);

      // edit media preview-г дахин зурна
      renderEditMedia();
    } catch (err) {
      // upload алдаа гарвал анхааруулна
      alert("Зураг upload амжилтгүй");
      console.error(err);
    }
  };

  // file chooser-ийг нээнэ
  input.click();
});
// видео нэмэх товч дархад file chooser нээнэ
document.getElementById("add-video")?.addEventListener("click", () => {
  // түр file input үүсгэнэ
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*"; // зөвхөн видео

  // файл сонгогдсоны дараах логик
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      // Cloudflare R2 руу видео upload хийнэ
      const url = await uploadFileToR2(file);

      // upload хийсэн видеоны URL-г түр хадгална
      editVideos.push(url);

      // edit media preview-г дахин зурна
      renderEditMedia();
    } catch (err) {
      // upload алдаа гарвал анхааруулна
      alert("Видео upload амжилтгүй");
      console.error(err);
    }
  };

  // file chooser-ийг нээнэ
  input.click();
});
// -- PROFILE PHOTO LOGIC --
// зураг drop хийх хэсэг
const drop = document.getElementById("photo-drop");

// зураг файл сонгох input
const fileInput = document.getElementById("photo-file");

// сонгосон зургийн preview
const preview = document.getElementById("photo-preview");

// зураг байхгүй үед харагдах placeholder
const placeholder = document.getElementById("photo-placeholder");

// зураг URL гараар оруулах input
const urlInput = document.getElementById("edit-photo-url");

if (drop) {
  // drop area дээр дархад file chooser нээнэ
  drop.addEventListener("click", () => fileInput.click());

  // файл чирч оруулж байх үед (hover эффект)
  drop.addEventListener("dragover", (e) => {
    e.preventDefault(); // drop зөвшөөрөх
    drop.style.borderColor = "var(--brand)";
  });

  // drag-ээс гарахад border-ийг буцаана
  drop.addEventListener("dragleave", () => {
    drop.style.borderColor = "var(--border)";
  });

  // файл drop хийх үед
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.style.borderColor = "var(--border)";

    // эхний drop хийсэн файлыг авна
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file); // зургийг уншиж preview болгоно
  });
}

// file selected
// file chooser-оос зураг сонгогдоход
fileInput?.addEventListener("change", () => {
  if (fileInput.files[0]) {
    // сонгосон зургийг preview болгоно
    loadImageFile(fileInput.files[0]);
  }
});

// === ЗУРГИЙН URL INPUT ===
// === ЗУРГИЙН URL INPUT ===
// URL гараар оруулахад preview-г шууд шинэчилнэ
urlInput?.addEventListener("input", () => {
  const url = urlInput.value.trim();

  if (url) {
    // URL оруулбал preview-д харуулна
    preview.src = url;
    preview.hidden = false;
    placeholder.hidden = true;
  }
});

// === FILE-ЭЭС ЗУРАГ УНШИХ & UPLOAD ===
async function loadImageFile(file) {
  try {
    // зургийг Cloudflare R2-д upload хийнэ
    const url = await uploadFileToR2(file);

    // upload амжилттай бол preview шинэчилнэ
    preview.src = url;
    preview.hidden = false;
    placeholder.hidden = true;

    // URL input-д хадгална (дараа save хийхэд ашиглана)
    urlInput.value = url;
  } catch (err) {
    // upload алдаа
    alert("Зураг upload амжилтгүй");
    console.error(err);
  }
}

// === TREE-Г DB-ЭЭС АЧААЛАХ ===
async function loadTreeFromDB() {
  // одоогийн login хийсэн хэрэглэгч
  const user = window.auth?.currentUser;
  if (!user) return;

  try {
    // Firebase auth token авна (заавал шаардлагатай)
    const token = await user.getIdToken();

    // backend руу tree load request илгээнэ
    const res = await fetch("/api/tree/load", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // auth шалгалтанд хэрэглэнэ
      },
    });

    // === LOAD АМЖИЛТГҮЙ ===
    if (!res.ok) {
      console.error("LOAD FAILED:", res.status, await res.text());

      // members массивын reference-г хадгалж, дотрыг нь цэвэрлэнэ
      members.length = 0;

      // default root үүсгээд tree-г сэргээнэ
      createDefaultRoot();
      repairTreeData();

      // дараагийн ID-г зөв тооцоолно
      nextId = members.reduce((mx, m) => Math.max(mx, m.id), 0) + 1;

      // дахин зурна
      scheduleRender();
      return;
    }

    // === LOAD АМЖИЛТТАЙ ===
    const data = await res.json();

    const rawMembers = Array.isArray(data?.members) ? data.members : [];

    // members массивын reference-г хадгалж, дахин бөглөнө
    members.length = 0;

    rawMembers.forEach((raw) => {
      // raw өгөгдлөөс FamilyMember үүсгэнэ
      const m = new FamilyMember(raw);

      // parents / children-г заавал массив болгоно
      m.parents = Array.isArray(raw.parents) ? raw.parents.slice() : [];
      m.children = Array.isArray(raw.children) ? raw.children.slice() : [];

      // spouse болон collapse төлөв
      m.spouseId = raw.spouseId ?? null;
      m.collapseUp = !!raw.collapseUp;

      members.push(m);
    });

    // DB хоосон бол default root үүсгэнэ
    if (!members.length) createDefaultRoot();

    // tree-ийн холбоос, level-үүдийг засна
    repairTreeData();

    // дараагийн ID-г шинэчилнэ
    nextId = members.reduce((max, m) => (m.id > max ? m.id : max), 0) + 1;

    // UI-г дахин зурна
    scheduleRender();
  } catch (err) {
    // === NETWORK / OTHER ERROR ===
    console.error("DB-ээс tree ачааллахад алдаа:", err);

    // members reference-г хадгалж, reset хийнэ
    members.length = 0;

    // default tree үүсгэнэ
    createDefaultRoot();
    repairTreeData();

    // ID-г дахин тохируулна
    nextId = members.reduce((mx, m) => Math.max(mx, m.id), 0) + 1;

    // дахин зурна
    scheduleRender();
  }
}

// ================= SEARCH STATE =================
// хайлтын одоогийн төлөв (filter утгууд)
const searchState = {
  name: "",        // нэрээр хайх
  family: "",      // эцгийн нэрээр хайх
  clan: "",        // ургийн овгоор хайх
  education: "",   // боловсролоор хайх
};

// ================= SEARCH FILTER =================
function searchMembers(list) {
  // өгөгдсөн гишүүдийн жагсаалтыг хайлтын нөхцлөөр шүүнэ
  return list.filter(m => {

    // НЭР
    if (
      searchState.name &&
      !m.name?.toLowerCase().includes(searchState.name)
    ) return false;

    // ОВОГ (эцгийн нэр)
    if (
      searchState.family &&
      !m.fatherName?.toLowerCase().includes(searchState.family)
    ) return false;

    // УРГИЙН ОВОГ (familyName)
    if (
      searchState.clan &&
      !m.familyName?.toLowerCase().includes(searchState.clan)
    ) return false;

    // БОЛОВСРОЛ (яг тэнцэх)
    if (
      searchState.education &&
      m.education !== searchState.education
    ) return false;

    // бүх шалгуурыг давбал харагдана
    return true;
  });
}
function renderSearchList() {
  // хайлтын үр дүн харуулах ul элемент
  const ul = document.getElementById("search-result-list");
  if (!ul) return;

  // өмнөх үр дүнг цэвэрлэнэ
  ul.innerHTML = "";

  // ямар нэг хайлтын нөхцөл байгаа эсэх
  const hasFilter =
    searchState.name ||
    searchState.family ||
    searchState.clan ||
    searchState.education;

  // filter байхгүй бол
  // модон дээрх highlight-ийг reset хийнэ
  if (!hasFilter) {
    applyTreeHighlight();
    return;
  }

  // бүх гишүүдээс хайлтад таарахыг шүүнэ
  const results = searchMembers(members);

  // хайлтын үр дүн бүрийг жагсаалтанд харуулна
  results.forEach(m => {
    const li = document.createElement("li");

    // нэр, нас, хүйсийн товч мэдээлэл
    li.innerHTML = `
      <div class="search-result-name">
        ${m.familyName || ""} ${m.name || ""}
      </div>
      <div class="search-result-meta">
        ${m.age ? m.age + " настай · " : ""}
        ${m.sex === "male" ? "Эр" : m.sex === "female" ? "Эм" : ""}
      </div>
    `;

    // үр дүн дээр дархад тухайн хүний profile-ийг нээнэ
    li.addEventListener("click", () => {
      openProfileView(m);
    });

    ul.appendChild(li);
  });

  // модон дээр хайлтад таарсан гишүүдийг highlight хийнэ
  applyTreeHighlight();
}
function applyTreeHighlight() {
  // 1) одоогийн хайлтад таарах гишүүдийг олно
  const matched = searchMembers(members);
  const matchedIds = new Set(matched.map(m => m.id));

  // 2) ямар нэг filter идэвхтэй эсэхийг шалгана
  const hasFilter =
    searchState.name ||
    searchState.family ||
    searchState.clan ||
    searchState.education;

  // модон дээрх бүх family-card-уудыг шалгана
  document.querySelectorAll(".family-card").forEach(card => {
    const id = Number(card.dataset.id);

    // өмнөх highlight class-уудыг цэвэрлэнэ
    card.classList.remove("search-hit", "search-dim");

    // filter байхгүй бол цааш шалгахгүй
    if (!hasFilter) return;

    // хайлтад таарвал онцолно
    if (matchedIds.has(id)) {
      card.classList.add("search-hit");
    }
    // таарахгүй бол бүдгэрүүлнэ
    else {
      card.classList.add("search-dim");
    }
  });
}

// Нэрээр хайх input
document.getElementById("search-name")?.addEventListener("input", e => {
  // нэрийн filter-д оруулж, жижиг үсгээр жигдрүүлнэ
  searchState.name = e.target.value.trim().toLowerCase();
  renderSearchList(); // хайлтын үр дүн + tree highlight шинэчилнэ
});

// Эцгийн нэр (family) хайх input
document.getElementById("search-family")?.addEventListener("input", e => {
  // эцгийн нэрээр filter хийнэ
  searchState.family = e.target.value.trim().toLowerCase();
  renderSearchList();
});

// Ургийн овог (clan) хайх input
document.getElementById("search-clan")?.addEventListener("input", e => {
  // овгоор filter хийнэ
  searchState.clan = e.target.value.trim().toLowerCase();
  renderSearchList();
});

// Боловсрол сонгох (select)
document.getElementById("search-education")?.addEventListener("change", e => {
  // сонгосон боловсролын утгыг хадгална
  searchState.education = e.target.value;
  renderSearchList();
});

// Хуудасны хоосон хэсэг дээр дарахад menu-уудыг хаах
document.addEventListener("click", () => {
  const deleteModal = document.getElementById("delete-modal");

  // delete modal нээгдээгүй үед л add-menu-уудыг хаана
  if (!deleteModal || deleteModal.hidden) {
    closeAllMenus();
  }
});

async function uploadFileToR2(file) {
  // multipart/form-data үүсгэнэ
  const fd = new FormData();
  fd.append("file", file); // сервер рүү илгээх файл

  // backend /api/upload руу файл илгээнэ
  const res = await fetch("/api/upload", {
    method: "POST",
    body: fd, // FormData тул Content-Type гараар заахгүй
  });

  // сервер амжилтгүй бол алдаа шиднэ
  if (!res.ok) {
    throw new Error(await res.text());
  }

  // серверээс буцсан JSON (R2 public URL агуулна)
  const data = await res.json();

  // Cloudflare R2 дээрх public URL буцаана
  return data.url;
}
// ===== Fullscreen Image Viewer (FINAL & CLEAN) =====
let imageViewer = null;     // fullscreen зураг харах контейнер (overlay)
let imageViewerImg = null; // fullscreen дээр харагдах <img> элемент

window.addEventListener("DOMContentLoaded", () => {
  // fullscreen image viewer DOM-уудыг авна
  imageViewer = document.getElementById("image-viewer");
  imageViewerImg = document.getElementById("image-viewer-img");

  // ✕ товч дарвал fullscreen-ийг хаана
  document
    .getElementById("image-close")
    ?.addEventListener("click", closeImageFullscreen);

  // overlay-ийн хоосон хэсэг дээр дарвал хаана
  imageViewer?.addEventListener("click", (e) => {
    if (e.target === imageViewer) {
      closeImageFullscreen();
    }
  });
});

function openImageFullscreen(src) {
  // viewer бэлэн биш бол зогсооно
  if (!imageViewer || !imageViewerImg) return;

  // profile modal-ыг түр нуух (давхар харагдахгүйн тулд)
  const profileView = document.getElementById("profile-view");
  const profileBackdrop = document.getElementById("profile-backdrop");

  if (profileView) profileView.style.display = "none";
  if (profileBackdrop) profileBackdrop.style.display = "none";

  // fullscreen зураг харуулна
  imageViewerImg.src = src;
  imageViewer.classList.remove("hidden");
}

function closeImageFullscreen() {
  // viewer бэлэн биш бол зогсооно
  if (!imageViewer || !imageViewerImg) return;

  // fullscreen зураг хаана
  imageViewer.classList.add("hidden");
  imageViewerImg.src = "";

  // profile modal-ыг буцааж харуулна
  const profileView = document.getElementById("profile-view");
  const profileBackdrop = document.getElementById("profile-backdrop");

  if (profileView) profileView.style.display = "";
  if (profileBackdrop) profileBackdrop.style.display = "";
}
// -- DELETE CONFIRM LOGIC --
// ===== PERSON DELETE CONFIRM =====

// "Цуцлах" товч → delete modal хаана
document.getElementById("delete-cancel")?.addEventListener("click", () => {
  closeDeleteConfirm();
});

// backdrop дарвал → delete modal хаана
document.getElementById("delete-backdrop")?.addEventListener("click", () => {
  closeDeleteConfirm();
});

// "Устгах" товч → хүнийг устгана
document.getElementById("delete-confirm")?.addEventListener("click", () => {
  if (!pendingDeleteMember) return; // устгах хүн байхгүй бол зогсооно

  deletePerson(pendingDeleteMember); // хүнийг устгана
  pendingDeleteMember = null;        // state цэвэрлэнэ
  closeDeleteConfirm();              // modal хаана
});


// ===== MEDIA DELETE CONFIRM =====

// медиа устгах "Цуцлах" товч
document.getElementById("media-delete-cancel")
  ?.addEventListener("click", closeMediaDeleteConfirm);

// медиа delete backdrop дарвал хаана
document.getElementById("media-delete-backdrop")
  ?.addEventListener("click", closeMediaDeleteConfirm);

// медиа "Устгах" баталгаажуулалт
document.getElementById("media-delete-confirm")
  ?.addEventListener("click", () => {
    if (!pendingMediaDelete) return; // устгах медиа байхгүй

    const { member, type, index } = pendingMediaDelete;

    // image эсвэл video-оос устгана
    if (type === "image") {
      member.images.splice(index, 1);
    } else if (type === "video") {
      member.videos.splice(index, 1);
    }

    saveTreeToDB();              // өөрчлөлтийг хадгална
    openProfileView(member);     // profile-ийг дахин нээнэ
    closeMediaDeleteConfirm();   // modal хаана
  });

// утгыг a–b хооронд барина (min/max хязгаар)
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function setupTreeZoomAndPan() {
  const scaleBox = document.getElementById("tree-scale");
  if (!treeRoot || !scaleBox) return; // tree бэлэн биш бол зогсооно

  const btnIn = document.getElementById("btn-zoom-in");
  const btnOut = document.getElementById("btn-zoom-out");
  const btnReset = document.getElementById("btn-zoom-reset");

  // layout дахин тооцоолохгүй, зөвхөн харагдацыг шинэчилнэ
  const apply = () => {
    renderTree();
  };

  // zoom нэмэх
  btnIn?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = clamp(
      zoomState.userScale + zoomState.step,
      zoomState.min,
      zoomState.max
    );
    apply();
  });

  // zoom багасгах
  btnOut?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = clamp(
      zoomState.userScale - zoomState.step,
      zoomState.min,
      zoomState.max
    );
    apply();
  });

  // zoom + pan reset
  btnReset?.addEventListener("click", (e) => {
    e.stopPropagation();
    zoomState.userScale = 1;
    zoomState.panX = 0;
    zoomState.panY = 0;
    apply();
  });

  // ===== DRAG PAN (mouse / touch) =====
  let dragging = false;
  let startX = 0, startY = 0;
  let basePanX = 0, basePanY = 0;

  treeRoot.addEventListener("pointerdown", (e) => {
    // карт, товч, input дээр дарахад pan эхлүүлэхгүй
    if (
      e.target.closest(".family-card") ||
      e.target.closest(".tree-zoom") ||
      e.target.closest("button") ||
      e.target.closest("input") ||
      e.target.closest("select") ||
      e.target.closest("textarea")
    ) {
      return;
    }

    dragging = true;
    treeRoot.setPointerCapture(e.pointerId); // pointer-ийг барина
    startX = e.clientX;
    startY = e.clientY;
    basePanX = zoomState.panX;
    basePanY = zoomState.panY;
  });

  treeRoot.addEventListener("pointermove", (e) => {
    if (!dragging) return;

    // mouse/touch зөөгдсөн хэмжээгээр pan хийдэг
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    zoomState.panX = basePanX + dx;
    zoomState.panY = basePanY + dy;

    renderTree();
  });

  treeRoot.addEventListener("pointerup", (e) => {
    dragging = false;
    try {
      treeRoot.releasePointerCapture(e.pointerId);
    } catch {}
  });

  treeRoot.addEventListener("pointercancel", () => {
    dragging = false;
  });
}