// Гэр бүлийн гишүүний картыг дүрслэх custom element
class FamilyCard extends HTMLElement {
  constructor() {
    super();
    // Тухайн карттай холбогдох гишүүний өгөгдөл
    this._member = null;
  }

  // Гишүүний өгөгдөл оноох
  set member(data) {
    this._member = data;
    this.render();
  }

  // Element DOM-д холбогдох үед
  connectedCallback() {
    this.style.position = "absolute";
    if (this._member) this.render();
  }

  // Картын харагдах байдал
  render() {
    const m = this._member;
    if (!m) return;

    // Хүйс болон collapse төлвөөс хамаарсан class-ууд
    this.className =
      "family-card " +
      (m.sex === "male" ? "male " : m.sex === "female" ? "female " : "") +
      (m.collapseUp ? "collapse-up" : "");

    // Гишүүний id-г dataset-д хадгална
    this.dataset.id = m.id;

    // Картын HTML бүтэц
    this.innerHTML = `
      <!-- Дээш нугалах -->
      <button class="node-btn node-btn-up">
        <span class="triangle-up"></span>
      </button>

      <!-- Нэмэх -->
      <button class="node-btn node-btn-add"></button>

      <!-- Нэмэх цэс -->
      <div class="add-menu hidden">
        <button class="add-pill">Эцэг нэмэх</button>
        <button class="add-pill">Эх нэмэх</button>
        <button class="add-pill">Хань нэмэх</button>
        <button class="add-pill">Хүүхэд нэмэх</button>
        <button class="add-pill">Дэлгэрэнгүй</button>
        <button class="add-pill">Засах</button>
        <button class="add-pill">Устгах</button>
      </div>

      <!-- Аватар -->
      <div class="card-avatar">
        <div class="avatar-circle">
          ${
            m.photoUrl
              ? `<img src="${m.photoUrl}" class="avatar-img" />`
              : `<span class="avatar-icon"></span>`
          }
        </div>
      </div>

      <!-- Нэр, нас -->
      <div class="card-name">
        <div class="fullname">${m.name || "Нэргүй"}</div>
        ${m.age ? `<div class="card-age">${m.age} настай</div>` : ""}
      </div>
    `;

    const btnUp = this.querySelector(".node-btn-up");
    const btnAdd = this.querySelector(".node-btn-add");

    // Дээш нугалах үйлдэл
    btnUp?.addEventListener("click", (e) => {
      e.stopPropagation();
      m.collapseUp = !m.collapseUp;
      window.scheduleRender?.();
      window.saveTreeToDB?.();
    });

    // Нэмэх товчны event
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

// Custom element бүртгэх
customElements.define("family-card", FamilyCard);
