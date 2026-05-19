const PERFECTDRAFT_TAPROOM_CARD_VERSION = "0.1.6";
// Increment this number whenever Home Assistant/browser caches need to fetch a fresh card file.
const PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER = 7;

class PerfectDraftTaproomCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("perfectdraft-taproom-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:perfectdraft-taproom-card",
      show_pump: true,
      show_details: true,
      show_controls: false,
    };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = {
      show_pump: true,
      show_details: true,
      show_controls: false,
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
    const beerTooltip = this._beerTooltip(attrs);
    const freshnessPercent = Number.isFinite(freshness) ? Math.max(0, Math.min(100, freshness / 30 * 100)) : 0;

    this.innerHTML = `
      <ha-card class="${this._config.compact ? "compact" : ""}">
        <style>${this._styles()}</style>
        <div class="card-button" role="button" tabindex="0" aria-label="Open beer details">
          <section class="hero">
            <div class="beer-art ${image ? "" : "empty"}">
              ${image ? `<img src="${this._escape(image)}" alt="">` : `<ha-icon icon="mdi:beer"></ha-icon>`}
            </div>
            <div class="beer-copy">
              <h2>${this._escape(this._config.name || beerName)}</h2>
              ${this._config.name ? `<p class="loaded">${this._escape(beerName)}</p>` : ""}
              ${subtitle ? `<p>${this._escape(subtitle)}</p>` : ""}
            </div>
          </section>

          ${this._config.show_pump ? `
            <section class="keg-stage">
            <div class="freshness" style="--freshness: ${freshnessPercent}%">
              <span>${Number.isFinite(freshness) ? Math.max(0, Math.round(freshness)) : "—"}</span>
              <small>days fresh</small>
            </div>

            <div class="machine" style="--level: ${level}%" ${beerTooltip ? `data-tooltip="${this._escape(beerTooltip)}"` : ""}>
              <div class="tap-handle"></div>
              <div class="tap-neck"></div>
              <div class="tap-spout"></div>
              <div class="machine-shell">
                <div class="machine-highlight"></div>
                <div class="display-panel">
                  <span>${this._formatNumber(currentTemp, "°", 0)}</span>
                  <small>${this._formatNumber(targetTemp, "°", 0)} target</small>
                </div>
                <div class="view-window">
                  <div class="window-fill"></div>
                  <div class="window-glass"></div>
                  <div class="level-label">
                    <strong>${this._formatNumber(level, "%", 0)}</strong>
                    <span>remaining</span>
                  </div>
                </div>
                <div class="drip-tray"></div>
              </div>
              <div class="machine-base"></div>
            </div>
            </section>
          ` : ""}

          ${this._config.show_details ? `
            <section class="stats">
              <div><span>Current</span><strong>${this._formatNumber(currentTemp, "°C", 0)}</strong></div>
              <div><span>Target</span><strong>${this._formatNumber(targetTemp, "°C", 0)}</strong></div>
            </section>
          ` : ""}

          ${this._renderControls()}
        </div>
      </ha-card>
    `;

    const cardButton = this.querySelector(".card-button");
    cardButton?.addEventListener("click", () => this._fireAction());
    cardButton?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this._fireAction();
    });
    this._bindControls();
  }

  _state(entityId) {
    return entityId ? this._hass?.states?.[entityId] : undefined;
  }

  _renderControls() {
    if (!this._config?.show_controls) return "";

    const buttons = [
      ["apply_ideal_button_entity", "Apply ideal", "mdi:thermometer-check"],
      ["refresh_metadata_button_entity", "Refresh", "mdi:refresh"],
    ].filter(([key]) => this._state(this._config[key]));

    const eco = this._state(this._config.eco_mode_entity);
    const mode = this._state(this._config.mode_select_entity);
    const targetControl = this._state(this._config.target_temperature_control_entity);
    const hasControls = buttons.length || eco || mode || targetControl;

    return `
      <section class="controls" aria-label="Taproom controls">
        ${hasControls ? "" : `<div class="control-empty">No controls configured</div>`}
        ${buttons.map(([key, label, icon]) => `
          <button class="control-button" type="button" data-button-entity="${this._escape(this._config[key])}">
            <ha-icon icon="${icon}"></ha-icon>
            <span>${label}</span>
          </button>
        `).join("")}
        ${eco ? `
          <button class="control-button" type="button" data-switch-entity="${this._escape(eco.entity_id)}">
            <ha-icon icon="${eco.state === "on" ? "mdi:leaf" : "mdi:leaf-off"}"></ha-icon>
            <span>Eco ${eco.state === "on" ? "on" : "off"}</span>
          </button>
        ` : ""}
        ${mode ? `
          <div class="control-pill">
            <ha-icon icon="mdi:tune-variant"></ha-icon>
            <span>${this._escape(this._formatState(mode))}</span>
          </div>
        ` : ""}
        ${targetControl ? `
          <div class="stepper">
            <button type="button" data-number-entity="${this._escape(targetControl.entity_id)}" data-delta="-0.5" aria-label="Decrease target temperature">
              <ha-icon icon="mdi:minus"></ha-icon>
            </button>
            <strong>${this._formatState(targetControl)}</strong>
            <button type="button" data-number-entity="${this._escape(targetControl.entity_id)}" data-delta="0.5" aria-label="Increase target temperature">
              <ha-icon icon="mdi:plus"></ha-icon>
            </button>
          </div>
        ` : ""}
      </section>
    `;
  }

  _bindControls() {
    this.querySelector(".controls")?.addEventListener("click", (event) => event.stopPropagation());
    this.querySelector(".controls")?.addEventListener("keydown", (event) => event.stopPropagation());
    this.querySelectorAll("[data-button-entity]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._hass.callService("button", "press", { entity_id: button.dataset.buttonEntity });
      });
    });
    this.querySelectorAll("[data-switch-entity]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const entityId = button.dataset.switchEntity;
        const state = this._state(entityId)?.state;
        this._hass.callService("switch", state === "on" ? "turn_off" : "turn_on", { entity_id: entityId });
      });
    });
    this.querySelectorAll("[data-number-entity]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const entity = this._state(button.dataset.numberEntity);
        const current = this._stateNumber(entity);
        const delta = Number(button.dataset.delta);
        if (!Number.isFinite(current) || !Number.isFinite(delta)) return;
        this._hass.callService("number", "set_value", {
          entity_id: entity.entity_id,
          value: current + delta,
        });
      });
    });
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

  _beerTooltip(attrs) {
    const rows = [];
    const stock = this._friendlyStock(attrs.stock_state);
    const recommended = this._attrValue(attrs.recommended_temperature || attrs.serving_temperature);
    const price = this._attrValue(attrs.price);
    const pricePerPint = this._attrValue(attrs.price_per_pint);
    const foodPairings = this._attrValue(attrs.food_pairings);
    const shortDescription = this._attrValue(attrs.short_description);
    const reviewRating = this._attrValue(attrs.review_rating);
    const reviewCount = this._attrValue(attrs.review_count);
    const lastChecked = this._attrValue(attrs.shop_last_checked);

    if (recommended) rows.push(`Serving: ${recommended}`);
    if (stock) rows.push(`Shop: ${stock.label}`);
    if (price) rows.push(`Price: ${price}${pricePerPint ? ` (${pricePerPint})` : ""}`);
    if (reviewRating) rows.push(`Rating: ${reviewRating}${reviewCount ? ` from ${reviewCount} reviews` : ""}`);
    if (foodPairings) rows.push(`Pairs with: ${foodPairings}`);
    if (shortDescription) rows.push(shortDescription);
    if (lastChecked) rows.push(`Shop checked: ${lastChecked}`);

    return rows.join("\n");
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

      .keg-stage {
        position: relative;
        min-height: 455px;
        display: grid;
        place-items: center;
        padding: 16px 0 12px;
      }

      .machine {
        width: min(68%, 250px);
        min-width: 204px;
        height: 430px;
        position: relative;
        filter: drop-shadow(0 20px 26px rgba(0, 0, 0, 0.42));
      }

      .machine[data-tooltip]::after {
        content: attr(data-tooltip);
        position: absolute;
        left: 50%;
        bottom: calc(100% - 74px);
        width: min(260px, calc(100vw - 48px));
        max-width: 260px;
        transform: translate(-50%, 8px);
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(5, 12, 13, 0.96);
        color: #f7fbfb;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.36), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        font-size: 0.74rem;
        line-height: 1.3;
        white-space: pre-line;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.16s ease, transform 0.16s ease;
        z-index: 20;
      }

      .machine[data-tooltip]:hover::after {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      .tap-handle {
        position: absolute;
        left: 50%;
        top: 2px;
        width: 24px;
        height: 70px;
        transform: translateX(-50%);
        border-radius: 11px 11px 9px 9px;
        background: linear-gradient(90deg, #050607, #5a6266 44%, #090b0c);
        border: 2px solid rgba(255, 255, 255, 0.22);
        box-shadow: inset 0 -10px 12px rgba(0, 0, 0, 0.52);
        z-index: 8;
      }

      .tap-neck {
        position: absolute;
        left: 50%;
        top: 66px;
        width: 24px;
        height: 24px;
        transform: translateX(-50%);
        border-radius: 50%;
        background: radial-gradient(circle at 45% 35%, #ffffff, #b9c3c5 48%, #5d666a 70%);
        z-index: 7;
      }

      .tap-spout {
        position: absolute;
        left: 50%;
        top: 86px;
        width: 74px;
        height: 74px;
        transform: translateX(-50%);
        border-radius: 50%;
        background:
          radial-gradient(circle at 50% 50%, #111719 0 24%, #f5fbfb 25% 34%, #7c878b 35% 48%, #20292d 49% 60%, transparent 61%),
          radial-gradient(circle at 45% 35%, #f6fbfb, #899499 54%, #172023 72%);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
        z-index: 6;
      }

      .tap-spout::after {
        content: "";
        position: absolute;
        left: 50%;
        bottom: -28px;
        width: 14px;
        height: 30px;
        transform: translateX(-50%);
        border-radius: 0 0 7px 7px;
        background: linear-gradient(90deg, #879498, #f4f8f8 45%, #6f7a7d);
      }

      .machine-shell {
        position: absolute;
        inset: 70px 0 26px;
        overflow: visible;
        border-radius: 30px 30px 22px 22px;
        background:
          linear-gradient(90deg, #060708 0 12%, #343b3f 13% 19%, transparent 20% 80%, #343b3f 81% 87%, #050607 88% 100%),
          linear-gradient(180deg, #2a3033, #080b0c);
        border: 2px solid rgba(255, 255, 255, 0.16);
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.08),
          inset 0 -36px 34px rgba(0, 0, 0, 0.48);
      }

      .machine-shell::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 16px;
        width: 154px;
        transform: translateX(-50%);
        border-radius: 3px 3px 12px 12px;
        background:
          linear-gradient(90deg, rgba(20, 24, 26, 0.20), transparent 16% 84%, rgba(20, 24, 26, 0.22)),
          linear-gradient(180deg, #e5e5e2, #bfc1bd 54%, #ecebe7);
        border-left: 2px solid rgba(0, 0, 0, 0.30);
        border-right: 2px solid rgba(0, 0, 0, 0.30);
        box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.24);
      }

      .machine-highlight {
        position: absolute;
        left: 72px;
        top: 4px;
        width: 54px;
        height: 308px;
        border-radius: 2px;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.40), rgba(255, 255, 255, 0.02));
        opacity: 0.5;
        z-index: 1;
      }

      .display-panel {
        position: absolute;
        left: 50%;
        bottom: 62px;
        width: 72px;
        height: 62px;
        transform: translateX(-50%);
        display: grid;
        place-items: center;
        align-content: center;
        clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%);
        border-radius: 8px;
        background: #071012;
        border: 1px solid rgba(91, 232, 197, 0.36);
        box-shadow: 0 0 16px rgba(69, 201, 169, 0.14), inset 0 0 10px rgba(69, 201, 169, 0.12);
        z-index: 3;
      }

      .display-panel span {
        color: #91f0dc;
        font-size: 1.45rem;
        font-weight: 800;
        line-height: 1;
      }

      .display-panel small {
        color: rgba(145, 240, 220, 0.65);
        font-size: 0.52rem;
        text-transform: uppercase;
      }

      .view-window {
        position: absolute;
        left: 50%;
        top: 140px;
        width: 44px;
        height: 132px;
        transform: translateX(-50%);
        overflow: hidden;
        border-radius: 14px 14px 8px 8px;
        background: linear-gradient(180deg, rgba(5, 12, 13, 0.8), rgba(4, 7, 8, 0.95));
        border: 3px solid #0a0f10;
        box-shadow:
          0 0 0 2px rgba(255, 255, 255, 0.13),
          inset 0 0 18px rgba(0, 0, 0, 0.72);
        z-index: 3;
      }

      .window-fill {
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: 5px;
        height: var(--level);
        min-height: 5px;
        max-height: calc(100% - 16px);
        border-radius: 8px 8px 6px 6px;
        background:
          radial-gradient(ellipse at 50% 0, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0) 18px),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.15) 0 2px, transparent 2px 10px),
          linear-gradient(180deg, #ffd260, #f1a523 48%, #c97612);
        transition: height 0.6s ease;
        box-shadow: inset 0 0 14px rgba(126, 70, 0, 0.35), 0 0 18px rgba(255, 179, 54, 0.18);
        overflow: hidden;
      }

      .window-fill::before,
      .window-fill::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 35% 95%, rgba(255, 255, 255, 0.78) 0 2px, transparent 3px),
          radial-gradient(circle at 62% 112%, rgba(255, 255, 255, 0.56) 0 1.5px, transparent 2.5px),
          radial-gradient(circle at 48% 128%, rgba(255, 255, 255, 0.68) 0 2px, transparent 3px);
        background-size: 100% 52px;
        opacity: 0.72;
        animation: taproom-bubbles 3.2s linear infinite;
        pointer-events: none;
      }

      .window-fill::after {
        background:
          radial-gradient(circle at 68% 106%, rgba(255, 255, 255, 0.62) 0 2px, transparent 3px),
          radial-gradient(circle at 28% 118%, rgba(255, 255, 255, 0.45) 0 1.5px, transparent 2.5px);
        background-size: 100% 64px;
        animation-duration: 4.6s;
        animation-delay: -1.4s;
        opacity: 0.54;
      }

      .window-glass {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(110deg, transparent 0 22%, rgba(255, 255, 255, 0.24) 24%, transparent 38%),
          radial-gradient(circle at 50% 0, rgba(255, 255, 255, 0.12), transparent 45%);
        pointer-events: none;
      }

      .level-label {
        position: absolute;
        inset: auto 0 10px;
        display: grid;
        justify-items: center;
        gap: 2px;
        color: #fff9ea;
        text-shadow: 0 1px 5px rgba(0, 0, 0, 0.52);
      }

      .level-label strong {
        font-size: 0.9rem;
        line-height: 1;
      }

      .level-label span {
        display: none;
        font-size: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0;
        font-weight: 700;
      }

      .drip-tray {
        position: absolute;
        left: 50%;
        bottom: 22px;
        width: 124px;
        height: 15px;
        transform: translateX(-50%);
        border-radius: 50%;
        background: linear-gradient(180deg, #313b40, #05090a);
        box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.16);
      }

      .machine-base {
        position: absolute;
        left: 34px;
        right: 34px;
        bottom: 0;
        height: 30px;
        border-radius: 0 0 18px 18px;
        background: linear-gradient(180deg, #151d20, #050708);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .freshness {
        position: absolute;
        left: 4px;
        bottom: 24px;
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
        z-index: 3;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
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

      .controls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      .control-button,
      .control-pill,
      .stepper {
        min-height: 42px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.07);
        color: inherit;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }

      .control-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .control-button ha-icon,
      .control-pill ha-icon {
        --mdc-icon-size: 18px;
        color: #91f0dc;
      }

      .control-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 10px;
        color: rgba(247, 251, 251, 0.78);
        font-size: 0.86rem;
      }

      .stepper {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) 38px;
        align-items: center;
        overflow: hidden;
      }

      .stepper button {
        height: 100%;
        border: 0;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        cursor: pointer;
      }

      .stepper ha-icon {
        --mdc-icon-size: 18px;
      }

      .stepper strong {
        text-align: center;
        font-size: 0.9rem;
      }

      .control-empty {
        grid-column: 1 / -1;
        padding: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(247, 251, 251, 0.62);
        font-size: 0.8rem;
        text-align: center;
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
        min-height: 360px;
      }

      ha-card.compact .machine {
        width: min(66%, 210px);
        height: 338px;
      }

      ha-card.compact .machine-shell {
        inset: 64px 0 24px;
      }

      ha-card.compact .view-window {
        top: 108px;
        width: 38px;
        height: 111px;
      }

      ha-card.compact .display-panel {
        width: 66px;
        height: 54px;
        bottom: 52px;
      }

      @media (max-width: 360px) {
        .card-button {
          padding: 14px;
        }

        .machine {
          width: 66%;
          min-width: 170px;
        }

        .freshness {
          width: 74px;
          height: 74px;
        }
      }

      @keyframes taproom-bubbles {
        from {
          transform: translateY(24px);
        }
        to {
          transform: translateY(-64px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .window-fill::before,
        .window-fill::after {
          animation: none;
          opacity: 0.38;
        }
      }
    `;
  }
}

const CARD_EDITOR_SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "beer_entity", selector: { entity: { domain: "sensor" } } },
  { name: "level_entity", selector: { entity: { domain: "sensor" } } },
  { name: "temperature_entity", selector: { entity: { domain: "sensor" } } },
  { name: "target_temperature_entity", selector: { entity: { domain: "sensor" } } },
  { name: "freshness_entity", selector: { entity: { domain: "sensor" } } },
  { name: "show_pump", selector: { boolean: {} } },
  { name: "show_details", selector: { boolean: {} } },
  { name: "compact", selector: { boolean: {} } },
  { name: "show_controls", selector: { boolean: {} } },
  { name: "apply_ideal_button_entity", selector: { entity: { domain: "button" } } },
  { name: "refresh_metadata_button_entity", selector: { entity: { domain: "button" } } },
  { name: "eco_mode_entity", selector: { entity: { domain: "switch" } } },
  { name: "mode_select_entity", selector: { entity: { domain: "select" } } },
  { name: "target_temperature_control_entity", selector: { entity: { domain: "number" } } },
];

const CARD_EDITOR_LABELS = {
  name: "Card title",
  beer_entity: "Beer entity",
  level_entity: "Keg remaining entity",
  temperature_entity: "Current temperature entity",
  target_temperature_entity: "Target temperature entity",
  freshness_entity: "Freshness entity",
  show_pump: "Show pump/keg view",
  show_details: "Show temperature row",
  compact: "Compact mode",
  show_controls: "Show controls",
  apply_ideal_button_entity: "Apply ideal temperature button",
  refresh_metadata_button_entity: "Refresh metadata button",
  eco_mode_entity: "Eco mode switch",
  mode_select_entity: "Mode select",
  target_temperature_control_entity: "Target temperature number",
};

class PerfectDraftTaproomCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      show_pump: true,
      show_details: true,
      show_controls: false,
      compact: false,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._config) return;
    this.innerHTML = `
      <style>
        .editor {
          display: block;
        }
      </style>
      <ha-form class="editor"></ha-form>
    `;

    const form = this.querySelector("ha-form");
    form.hass = this._hass;
    form.data = this._config;
    form.schema = CARD_EDITOR_SCHEMA;
    form.computeLabel = (schema) => CARD_EDITOR_LABELS[schema.name] || schema.name;
    form.addEventListener("value-changed", (event) => this._changed(event));
  }

  _changed(event) {
    const config = { ...event.detail.value };
    Object.keys(config).forEach((key) => {
      if (config[key] === "" || config[key] === undefined || config[key] === null) {
        delete config[key];
      }
    });
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

window.PerfectDraftTaproomCard = {
  version: PERFECTDRAFT_TAPROOM_CARD_VERSION,
  cacheBuster: PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER,
};

window.customCards = window.customCards || [];
window.customCards.push({
  type: "perfectdraft-taproom-card",
  name: "PerfectDraft Taproom Card",
  description: "Graphical keg card for PerfectDraft Taproom",
  documentationURL: "https://github.com/Hyperion5088/hass-perfectdraft-taproom-card",
  preview: true,
});

console.info(
  `%c PERFECTDRAFT-TAPROOM-CARD %c v${PERFECTDRAFT_TAPROOM_CARD_VERSION} cache ${PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER} `,
  "color: #102325; background: #ffc34d; font-weight: 700;",
  "color: #f7fbfb; background: #0b3f46; font-weight: 700;",
);
