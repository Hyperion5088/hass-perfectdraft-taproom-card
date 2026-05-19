class PerfectDraftTaproomCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("perfectdraft-taproom-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:perfectdraft-taproom-card",
      show_details: true,
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = {
      show_details: true,
      compact: false,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config?.compact ? 4 : 5;
  }

  _entity(configKey, matchers, rejects = []) {
    const configured = this._config?.[configKey];
    if (configured && this._hass?.states?.[configured]) {
      return this._hass.states[configured];
    }
    return this._findEntity(matchers, rejects);
  }

  _findEntity(matchers, rejects = []) {
    if (!this._hass?.states) return undefined;
    const matches = Array.isArray(matchers) ? matchers : [matchers];
    const blocked = Array.isArray(rejects) ? rejects : [rejects];
    return Object.values(this._hass.states).find((entity) => {
      if (!entity?.entity_id?.startsWith("sensor.")) return false;
      const name = `${entity.entity_id} ${entity.attributes?.friendly_name || ""}`.toLowerCase();
      if (!name.includes("perfectdraft") && !name.includes("taproom")) return false;
      if (blocked.some((matcher) => name.includes(matcher))) return false;
      return matches.every((matcher) => name.includes(matcher));
    });
  }

  _stateNumber(entity, fallback = undefined) {
    if (!entity || entity.state === "unknown" || entity.state === "unavailable") {
      return fallback;
    }
    const value = Number(entity.state);
    return Number.isFinite(value) ? value : fallback;
  }

  _formatNumber(value, suffix = "", precision = 0) {
    if (!Number.isFinite(value)) return "—";
    return `${value.toFixed(precision)}${suffix}`;
  }

  _formatState(entity, fallback = "—") {
    if (!entity || entity.state === "unknown" || entity.state === "unavailable") {
      return fallback;
    }
    return this._hass?.formatEntityState ? this._hass.formatEntityState(entity) : entity.state;
  }

  _fireAction() {
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: this._entity("beer_entity", ["beer"], ["favorite", "available"])?.entity_id },
    });
    this.dispatchEvent(event);
  }

  _render() {
    if (!this._hass || !this._config) return;

    const beer = this._entity("beer_entity", ["beer"], ["favorite", "available"]);
    const levelEntity = this._entity("level_entity", ["keg", "remaining"]);
    const tempEntity = this._entity("temperature_entity", ["temperature"], ["target", "eco", "ideal"]);
    const targetEntity = this._entity("target_temperature_entity", ["target", "temperature"]);
    const freshnessEntity = this._entity("freshness_entity", ["keg", "freshness"]);

    const level = Math.max(0, Math.min(100, this._stateNumber(levelEntity, 0)));
    const currentTemp = this._stateNumber(tempEntity);
    const targetTemp = this._stateNumber(targetEntity);
    const freshness = this._stateNumber(freshnessEntity);
    const beerName = this._formatState(beer, "No beer loaded");
    const attrs = beer?.attributes || {};
    const image = attrs.entity_picture || attrs.image_url;
    const subtitle = [this._attrValue(attrs.brewery), this._attrValue(attrs.style), this._attrValue(attrs.abv)]
      .filter(Boolean)
      .join(" • ");
    const stock = this._friendlyStock(attrs.stock_state);
    const freshnessPercent = Number.isFinite(freshness) ? Math.max(0, Math.min(100, freshness / 30 * 100)) : 0;
    const delta = Number.isFinite(currentTemp) && Number.isFinite(targetTemp)
      ? currentTemp - targetTemp
      : undefined;
    const tempClass = !Number.isFinite(delta)
      ? "unknown"
      : Math.abs(delta) <= 1
        ? "ready"
        : delta > 0
          ? "warm"
          : "cold";

    this.innerHTML = `
      <ha-card class="${this._config.compact ? "compact" : ""}">
        <style>${this._styles()}</style>
        <button class="card-button" type="button" aria-label="Open beer details">
          <section class="hero">
            <div class="beer-art ${image ? "" : "empty"}">
              ${image ? `<img src="${this._escape(image)}" alt="">` : `<ha-icon icon="mdi:beer"></ha-icon>`}
            </div>
            <div class="beer-copy">
              <h2>${this._escape(this._config.name || beerName)}</h2>
              ${this._config.name ? `<p class="loaded">${this._escape(beerName)}</p>` : ""}
              ${subtitle ? `<p>${this._escape(subtitle)}</p>` : ""}
              ${stock ? `<span class="stock ${stock.key}">${stock.label}</span>` : ""}
            </div>
          </section>

          <section class="keg-stage">
            <div class="freshness" style="--freshness: ${freshnessPercent}%">
              <span>${Number.isFinite(freshness) ? Math.max(0, Math.round(freshness)) : "—"}</span>
              <small>days fresh</small>
            </div>

            <div class="keg" style="--level: ${level}%">
              <div class="keg-top"></div>
              <div class="keg-body">
                <div class="beer-fill"></div>
                <div class="shine"></div>
                <div class="level-label">
                  <strong>${this._formatNumber(level, "%", 0)}</strong>
                  <span>remaining</span>
                </div>
                <div class="temperature ${tempClass}">
                  <span class="current">${this._formatNumber(currentTemp, "°", 0)}</span>
                  <span class="divider"></span>
                  <span class="target">${this._formatNumber(targetTemp, "°", 0)}</span>
                </div>
              </div>
              <div class="keg-base"></div>
            </div>
          </section>

          ${this._config.show_details ? `
            <section class="stats">
              <div><span>Current</span><strong>${this._formatNumber(currentTemp, "°C", 0)}</strong></div>
              <div><span>Target</span><strong>${this._formatNumber(targetTemp, "°C", 0)}</strong></div>
              <div><span>Freshness</span><strong>${Number.isFinite(freshness) ? `${Math.max(0, Math.round(freshness))} d` : "—"}</strong></div>
            </section>
          ` : ""}
        </button>
      </ha-card>
    `;

    this.querySelector(".card-button")?.addEventListener("click", () => this._fireAction());
  }

  _attrValue(value) {
    if (!value) return undefined;
    if (typeof value === "object" && value.value) return String(value.value);
    return String(value);
  }

  _friendlyStock(value) {
    if (value === "in_stock") return { key: "in", label: "In stock" };
    if (value === "out_of_stock") return { key: "out", label: "Out of stock" };
    if (value) return { key: "unknown", label: String(value).replace(/_/g, " ") };
    return undefined;
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _styles() {
    return `
      :host {
        display: block;
      }

      ha-card {
        overflow: hidden;
        background:
          radial-gradient(circle at 85% 15%, rgba(69, 201, 169, 0.20), transparent 32%),
          linear-gradient(145deg, var(--ha-card-background, var(--card-background-color, #102325)), #071618 72%);
        color: var(--primary-text-color, #f7fbfb);
        border-radius: var(--ha-card-border-radius, 8px);
      }

      .card-button {
        width: 100%;
        display: block;
        padding: 18px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .hero {
        display: grid;
        grid-template-columns: 76px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
      }

      .beer-art {
        width: 76px;
        height: 76px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      }

      .beer-art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .beer-art ha-icon {
        --mdc-icon-size: 42px;
        color: #ffc34d;
      }

      h2 {
        margin: 0;
        color: inherit;
        font-size: 1.15rem;
        line-height: 1.2;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      p {
        margin: 4px 0 0;
        color: rgba(247, 251, 251, 0.72);
        font-size: 0.86rem;
        line-height: 1.25;
      }

      .loaded {
        color: rgba(247, 251, 251, 0.88);
      }

      .stock {
        display: inline-flex;
        margin-top: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: capitalize;
      }

      .stock.in {
        background: rgba(88, 214, 141, 0.18);
        color: #91f0b6;
      }

      .stock.out {
        background: rgba(255, 118, 117, 0.18);
        color: #ffb1ad;
      }

      .stock.unknown {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(247, 251, 251, 0.78);
      }

      .keg-stage {
        position: relative;
        min-height: 250px;
        display: grid;
        place-items: center;
        padding: 16px 0 8px;
      }

      .keg {
        width: min(66%, 210px);
        min-width: 168px;
        position: relative;
        filter: drop-shadow(0 18px 22px rgba(0, 0, 0, 0.35));
      }

      .keg-top,
      .keg-base {
        height: 34px;
        border-radius: 50%;
        background: linear-gradient(180deg, #66757b, #243034);
        border: 2px solid rgba(255, 255, 255, 0.28);
        position: relative;
        z-index: 2;
      }

      .keg-base {
        margin-top: -19px;
        background: linear-gradient(180deg, #182225, #090f10);
      }

      .keg-body {
        height: 212px;
        margin: -18px 7px 0;
        position: relative;
        overflow: hidden;
        border-radius: 0 0 22px 22px;
        background: linear-gradient(90deg, #1d292d 0%, #536168 16%, #c9d0d1 28%, #56646a 42%, #172125 100%);
        border-left: 2px solid rgba(255, 255, 255, 0.22);
        border-right: 2px solid rgba(0, 0, 0, 0.42);
      }

      .beer-fill {
        position: absolute;
        left: 14%;
        right: 14%;
        bottom: 10px;
        height: var(--level);
        min-height: 6px;
        max-height: calc(100% - 24px);
        border-radius: 12px 12px 18px 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0) 14px),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.16) 0 2px, transparent 2px 12px),
          linear-gradient(180deg, #ffd260, #f1a523 48%, #c97612);
        transition: height 0.6s ease;
        box-shadow: inset 0 0 16px rgba(126, 70, 0, 0.35);
      }

      .shine {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35) 21%, transparent 38%);
        pointer-events: none;
      }

      .level-label {
        position: absolute;
        inset: auto 0 30px;
        display: grid;
        justify-items: center;
        gap: 2px;
        color: #fff9ea;
        text-shadow: 0 1px 5px rgba(0, 0, 0, 0.52);
      }

      .level-label strong {
        font-size: 2.05rem;
        line-height: 1;
      }

      .level-label span {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0;
        font-weight: 700;
      }

      .temperature {
        position: absolute;
        top: 18px;
        right: 11px;
        display: grid;
        place-items: center;
        width: 46px;
        min-height: 88px;
        border-radius: 24px;
        background: rgba(5, 15, 17, 0.72);
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
        overflow: hidden;
      }

      .temperature::before {
        content: "";
        position: absolute;
        inset: auto 6px 6px;
        height: 50%;
        border-radius: 14px;
        background: #45c9a9;
        opacity: 0.9;
      }

      .temperature.warm::before {
        background: #ffb84d;
      }

      .temperature.cold::before {
        background: #79b8ff;
      }

      .temperature.unknown::before {
        background: rgba(255, 255, 255, 0.28);
      }

      .temperature span {
        position: relative;
        z-index: 1;
        font-weight: 800;
        font-size: 0.8rem;
      }

      .temperature .target {
        color: rgba(255, 255, 255, 0.76);
        font-size: 0.72rem;
      }

      .divider {
        width: 22px;
        height: 1px;
        background: rgba(255, 255, 255, 0.28);
      }

      .freshness {
        position: absolute;
        left: 0;
        bottom: 20px;
        width: 86px;
        height: 86px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        align-content: center;
        background:
          radial-gradient(circle at center, #102325 58%, transparent 60%),
          conic-gradient(#45c9a9 var(--freshness), rgba(255, 255, 255, 0.15) 0);
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
      }

      .freshness span {
        font-size: 1.45rem;
        line-height: 1;
        font-weight: 800;
      }

      .freshness small {
        color: rgba(247, 251, 251, 0.68);
        font-size: 0.65rem;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      .stats div {
        min-width: 0;
        padding: 9px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.07);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }

      .stats span {
        display: block;
        color: rgba(247, 251, 251, 0.62);
        font-size: 0.7rem;
        line-height: 1.2;
      }

      .stats strong {
        display: block;
        margin-top: 3px;
        color: inherit;
        font-size: 0.98rem;
        line-height: 1.1;
      }

      ha-card.compact .card-button {
        padding: 14px;
      }

      ha-card.compact .hero {
        grid-template-columns: 58px minmax(0, 1fr);
      }

      ha-card.compact .beer-art {
        width: 58px;
        height: 58px;
      }

      ha-card.compact .keg-stage {
        min-height: 205px;
      }

      ha-card.compact .keg-body {
        height: 170px;
      }

      @media (max-width: 360px) {
        .card-button {
          padding: 14px;
        }

        .keg {
          width: 72%;
          min-width: 150px;
        }

        .freshness {
          width: 74px;
          height: 74px;
        }
      }
    `;
  }
}

class PerfectDraftTaproomCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { show_details: true, compact: false, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config) return;
    const fields = [
      ["name", "Name", "text"],
      ["beer_entity", "Beer entity", "entity"],
      ["level_entity", "Keg remaining entity", "entity"],
      ["temperature_entity", "Current temperature entity", "entity"],
      ["target_temperature_entity", "Target temperature entity", "entity"],
      ["freshness_entity", "Freshness entity", "entity"],
      ["show_details", "Show detail row", "checkbox"],
      ["compact", "Compact mode", "checkbox"],
    ];
    this.innerHTML = `
      <style>
        .editor {
          display: grid;
          gap: 12px;
        }
        label {
          display: grid;
          gap: 4px;
          color: var(--primary-text-color);
        }
        span {
          font-size: 0.86rem;
          color: var(--secondary-text-color);
        }
        ha-textfield,
        ha-entity-picker {
          width: 100%;
        }
        .toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
      </style>
      <div class="editor">
        ${fields.map(([key, label, type]) => this._field(key, label, type)).join("")}
      </div>
    `;
    this.querySelectorAll("ha-entity-picker").forEach((picker) => {
      picker.hass = this._hass;
    });
    this.querySelectorAll("[data-config-key]").forEach((input) => {
      input.addEventListener("value-changed", (event) => this._changed(input, event));
      input.addEventListener("change", (event) => this._changed(input, event));
    });
  }

  _field(key, label, type) {
    const value = this._config[key] ?? "";
    if (type === "checkbox") {
      return `
        <label class="toggle">
          <span>${label}</span>
          <ha-switch data-config-key="${key}" ${value ? "checked" : ""}></ha-switch>
        </label>
      `;
    }
    if (type === "entity") {
      return `
        <label>
          <span>${label}</span>
          <ha-entity-picker
            data-config-key="${key}"
            value="${value}"
            allow-custom-entity>
          </ha-entity-picker>
        </label>
      `;
    }
    return `
      <label>
        <span>${label}</span>
        <ha-textfield data-config-key="${key}" value="${value}"></ha-textfield>
      </label>
    `;
  }

  _changed(input, event) {
    const key = input.dataset.configKey;
    const value = input.tagName.toLowerCase() === "ha-switch"
      ? input.checked
      : event.detail?.value ?? input.value;
    const config = { ...this._config };
    if (value === "" || value === undefined || value === null) {
      delete config[key];
    } else {
      config[key] = value;
    }
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define("perfectdraft-taproom-card", PerfectDraftTaproomCard);
customElements.define("perfectdraft-taproom-card-editor", PerfectDraftTaproomCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "perfectdraft-taproom-card",
  name: "PerfectDraft Taproom Card",
  description: "Graphical keg card for PerfectDraft Taproom",
  preview: true,
});
