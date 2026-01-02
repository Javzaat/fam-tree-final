class FamilyCard extends HTMLElement {
  constructor() {
    super();
    this._member = null;
  }

  set member(data) {
    this._member = data;
    this.render();
  }

  connectedCallback() {
    this.style.position = "absolute";
    if (this._member) this.render();
  }

  render() {
    const m = this._member;
    if (!m) return;

    // ===== ROOT CLASSES =====
    this.className =
      "family-card " +
      (m.sex === "male" ? "male " : m.sex === "female" ? "female " : "") +
      (m.collapseUp ? "collapse-up" : "");

    this.dataset.id = m.id;

    // ===== TEMPLATE =====
    this.innerHTML = `
      <!-- COLLAPSE -->
      <button class="node-btn node-btn-up" aria-label="Дээш нугалах">
        <span class="triangle-up"></span>
      </button>

      <!-- ADD -->
      <button class="node-btn node-btn-add" aria-label="Нэмэх"></button>

      <!-- ADD MENU -->
      <div class="add-menu hidden">
        <button class="add-pill">Эцэг нэмэх</button>
        <button class="add-pill">Эх нэмэх</button>
        <button class="add-pill">Хань нэмэх</button>
        <button class="add-pill">Хүүхэд нэмэх</button>
        <button class="add-pill">Дэлгэрэнгүй</button>
        <button class="add-pill">Засах</button>
        <button class="add-pill">Устгах</button>
      </div>

      <!-- AVATAR -->
      <div class="card-avatar">
        <div class="avatar-circle">
          ${
            m.photoUrl
              ? `<img src="${m.photoUrl}" class="avatar-img" />`
              : `<span class="avatar-icon"></span>`
          }
        </div>
      </div>

      <!-- NAME -->
      <div class="card-name">
        <div class="fullname">${m.name || "Нэргүй"}</div>
        ${m.age ? `<div class="card-age">${m.age} настай</div>` : ""}
      </div>
    `;

    // ===== EVENTS =====
    const btnUp = this.querySelector(".node-btn-up");
    const btnAdd = this.querySelector(".node-btn-add");

    // 🔺 COLLAPSE
    btnUp?.addEventListener("click", (e) => {
      e.stopPropagation();
      m.collapseUp = !m.collapseUp;
      window.scheduleRender?.();
      window.saveTreeToDB?.();
    });

    // ➕ ADD (menu-г family-tree.js удирдана)
    btnAdd?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.dispatchEvent(
        new CustomEvent("add-click", {
          bubbles: true,
          detail: { member: m, card: this },
        })
      );
    });
  }
}

customElements.define("family-card", FamilyCard);