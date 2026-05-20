const PERFECTDRAFT_TAPROOM_CARD_VERSION = "0.2.0";
// Increment this number whenever Home Assistant/browser caches need to fetch a fresh card file.
const PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER = 11;

class PerfectDraftTaproomCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("perfectdraft-taproom-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:perfectdraft-taproom-card",
      volume_unit: "metric",
      show_pump: true,
      show_details: true,
      show_remaining: true,
      show_freshness: true,
      show_last_pour: true,
      show_empty_eta: true,
      show_temperature_status: true,
      show_pour_history: true,
      show_beer_tooltip: true,
      color_freshness_warning: true,
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
      show_remaining: true,
      show_freshness: true,
      show_last_pour: true,
      show_empty_eta: true,
      show_temperature_status: true,
      show_pour_history: true,
      show_beer_tooltip: true,
      color_freshness_warning: true,
      show_controls: false,
      volume_unit: "metric",
      compact: false,
      ...config,
    };
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config?.compact ? 4 : 5;
  }

  _entity(configKey, matchers, rejects = [], domain = "sensor") {
    const configured = this._config?.[configKey];
    if (configured && this._hass?.states?.[configured]) {
      return this._hass.states[configured];
    }
    return this._findEntity(matchers, rejects, domain);
  }

  _findEntity(matchers, rejects = [], domain = "sensor") {
    if (!this._hass?.states) return undefined;
    const matches = Array.isArray(matchers) ? matchers : [matchers];
    const blocked = Array.isArray(rejects) ? rejects : [rejects];
    return Object.values(this._hass.states).find((entity) => {
      if (!entity?.entity_id?.startsWith(`${domain}.`)) return false;
      const name = `${entity.entity_id} ${entity.attributes?.friendly_name || ""}`.toLowerCase();
      if (!name.includes("perfectdraft") && !name.includes("taproom")) return false;
      if (blocked.some((matcher) => name.includes(matcher))) return false;
      return matches.every((matcher) => name.includes(matcher));
    });
  }

  _controlEntity(configKey, domain, matchers, rejects = []) {
    return this._entity(configKey, matchers, rejects, domain);
  }

  _stateSignature() {
    if (!this._hass?.states) return "";
    return Object.values(this._hass.states)
      .filter((entity) => {
        const name = `${entity.entity_id} ${entity.attributes?.friendly_name || ""}`.toLowerCase();
        return name.includes("perfectdraft") || name.includes("taproom");
      })
      .map((entity) => [
        entity.entity_id,
        entity.state,
        entity.last_changed,
        entity.attributes?.friendly_name,
        entity.attributes?.entity_picture,
        entity.attributes?.image_url,
        entity.attributes?.keg_inserted_at,
        entity.attributes?.stock_state,
        entity.attributes?.price,
        entity.attributes?.price_per_pint,
        entity.attributes?.unit_of_measurement,
        entity.attributes?.review_rating,
        entity.attributes?.review_count,
      ].join("|"))
      .join(";");
  }

  _stateNumber(entity, fallback = undefined) {
    if (!entity || entity.state === "unknown" || entity.state === "unavailable") {
      return fallback;
    }
    const value = Number(entity.state);
    return Number.isFinite(value) ? value : fallback;
  }

  _volumeUnit() {
    return this._config?.volume_unit === "imperial" ? "imperial" : "metric";
  }

  _volumeEntity(type) {
    const imperial = this._volumeUnit() === "imperial";
    if (type === "remaining") {
      return imperial
        ? this._entity("pints_remaining_entity", ["pints", "remaining"], [], "sensor")
          || this._entity("keg_volume_entity", ["keg", "volume"], [], "sensor")
        : this._entity("keg_volume_entity", ["keg", "volume"], [], "sensor")
          || this._entity("pints_remaining_entity", ["pints", "remaining"], [], "sensor");
    }
    if (type === "last_pour") {
      return imperial
        ? this._entity("last_pour_pints_entity", ["last", "pour", "pints"], [], "sensor")
          || this._entity("last_pour_entity", ["last", "pour"], ["pints"], "sensor")
        : this._entity("last_pour_entity", ["last", "pour"], ["pints"], "sensor")
          || this._entity("last_pour_pints_entity", ["last", "pour", "pints"], [], "sensor");
    }
    return undefined;
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

  _formatDateTime(entity, fallback = "—") {
    if (!entity?.last_changed) return fallback;
    const value = new Date(entity.last_changed);
    if (Number.isNaN(value.getTime())) return fallback;
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(value);
  }

  _temperatureStatus(currentTemp, targetTemp, modeEntity) {
    const mode = this._formatState(modeEntity, "").toLowerCase();
    if (mode.includes("eco")) return { label: "Eco mode", icon: "mdi:leaf", key: "eco" };
    if (!Number.isFinite(currentTemp) || !Number.isFinite(targetTemp)) {
      return { label: "Temp unknown", icon: "mdi:thermometer-alert", key: "unknown" };
    }
    const delta = currentTemp - targetTemp;
    if (Math.abs(delta) <= 0.5) return { label: "At target", icon: "mdi:check-circle", key: "ok" };
    if (delta > 0.5) return { label: "Cooling", icon: "mdi:snowflake", key: "cooling" };
    return { label: "Below target", icon: "mdi:thermometer-low", key: "low" };
  }

  _emptyEta(level, freshnessEntity) {
    if (!Number.isFinite(level) || level <= 0) return "Empty";
    const insertedAt = freshnessEntity?.attributes?.keg_inserted_at;
    const inserted = insertedAt ? new Date(insertedAt) : undefined;
    const elapsedMs = inserted && !Number.isNaN(inserted.getTime()) ? Date.now() - inserted.getTime() : undefined;
    const elapsedDays = Number.isFinite(elapsedMs) ? Math.max(0.25, elapsedMs / 86400000) : undefined;
    const used = Math.max(0, 100 - level);
    if (!elapsedDays || used <= 1) return "Learning";
    const dailyUse = used / elapsedDays;
    if (dailyUse <= 0) return "Learning";
    const days = Math.max(0, level / dailyUse);
    if (days < 1) return "Today";
    if (days < 2) return "Tomorrow";
    return `${Math.round(days)} days`;
  }

  _freshnessKey(freshness) {
    if (!Number.isFinite(freshness)) return "normal";
    if (freshness <= 3) return "danger";
    if (freshness <= 7) return "warn";
    return "normal";
  }

  _pourHistory(lastPourEntity) {
    const attrs = lastPourEntity?.attributes || {};
    const source = attrs.pour_history || attrs.recent_pours || attrs.history || attrs.pours;
    const values = Array.isArray(source)
      ? source.map((item) => Number(typeof item === "object" ? item.volume ?? item.value ?? item.ml : item))
      : [this._stateNumber(lastPourEntity)].filter(Number.isFinite);
    return values.filter(Number.isFinite).slice(-8);
  }

  _renderPourHistory(lastPourEntity) {
    if (!this._config.show_pour_history) return "";
    const values = this._pourHistory(lastPourEntity);
    if (!values.length) return "";
    const max = Math.max(...values, 1);
    return `
      <section class="pour-history" aria-label="Pour history">
        <span>Pour history</span>
        <div>
          ${values.map((value) => `
            <i style="--bar: ${Math.max(8, Math.min(100, value / max * 100))}%"></i>
          `).join("")}
        </div>
      </section>
    `;
  }

  _renderStats({
    currentTemp,
    targetTemp,
    temperatureStatus,
    emptyEta,
    lastPourEntity,
    remainingVolumeEntity,
    level,
    freshness,
  }) {
    const rows = [];
    if (this._config.show_details) {
      rows.push(`<div><span>Current</span><strong>${this._formatNumber(currentTemp, "°C", 1)}</strong></div>`);
      rows.push(`<div><span>Target</span><strong>${this._formatNumber(targetTemp, "°C", 1)}</strong></div>`);
    }
    if (!this._config.show_pump && this._config.show_remaining) {
      rows.push(`<div><span>Remaining</span><strong>${this._escape(this._formatState(remainingVolumeEntity, this._formatNumber(level, "%", 0)))}</strong></div>`);
    }
    if (!this._config.show_pump && this._config.show_freshness) {
      rows.push(`<div><span>Freshness</span><strong>${Number.isFinite(freshness) ? `${Math.max(0, Math.round(freshness))} d` : "—"}</strong></div>`);
    }
    if (this._config.show_temperature_status) {
      rows.push(`
        <div class="status-${temperatureStatus.key}">
          <span>Status</span>
          <strong><ha-icon icon="${temperatureStatus.icon}"></ha-icon>${temperatureStatus.label}</strong>
        </div>
      `);
    }
    if (this._config.show_empty_eta) {
      rows.push(`<div><span>Keg empty</span><strong>${this._escape(emptyEta)}</strong></div>`);
    }
    if (this._config.show_last_pour) {
      rows.push(`
        <div>
          <span>Last pour</span>
          <strong>${this._escape(this._formatState(lastPourEntity))}</strong>
          <small>${this._escape(this._formatDateTime(lastPourEntity))}</small>
        </div>
      `);
    }
    return rows.length ? `<section class="stats">${rows.join("")}</section>` : "";
  }

  _fireAction() {
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: this._entity("beer_entity", ["beer"], ["favorite", "available"])?.entity_id },
    });
    this.dispatchEvent(event);
  }

  _render(force = false) {
    if (!this._hass || !this._config) return;

    const renderKey = JSON.stringify({
      config: this._config,
      states: this._stateSignature(),
    });
    if (!force && renderKey === this._renderKey) return;
    this._renderKey = renderKey;

    const beer = this._entity("beer_entity", ["beer"], ["favorite", "available"]);
    const levelEntity = this._entity("level_entity", ["keg", "remaining"]);
    const tempEntity = this._entity("temperature_entity", ["temperature"], ["target", "eco", "ideal"]);
    const targetEntity = this._entity("target_temperature_entity", ["target", "temperature"]);
    const freshnessEntity = this._entity("freshness_entity", ["keg", "freshness"]);
    const lastPourEntity = this._volumeEntity("last_pour");
    const remainingVolumeEntity = this._volumeEntity("remaining");
    const modeEntity = this._entity("mode_entity", ["mode"]);

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
    const beerTooltip = this._config.show_beer_tooltip ? this._beerTooltip(attrs) : "";
    const freshnessPercent = Number.isFinite(freshness) ? Math.max(0, Math.min(100, freshness / 30 * 100)) : 0;
    const freshnessKey = this._freshnessKey(freshness);
    const temperatureStatus = this._temperatureStatus(currentTemp, targetTemp, modeEntity);
    const emptyEta = this._emptyEta(level, freshnessEntity);

    this.innerHTML = `
      <ha-card class="${this._config.compact ? "compact" : ""} freshness-${this._config.color_freshness_warning ? freshnessKey : "normal"}">
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
                  <span>${this._formatNumber(currentTemp, "°", 1)}</span>
                  <small>${this._formatNumber(targetTemp, "°", 1)} target</small>
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

          ${this._renderStats({
            currentTemp,
            targetTemp,
            temperatureStatus,
            emptyEta,
            lastPourEntity,
            remainingVolumeEntity,
            level,
            freshness,
          })}

          ${this._renderPourHistory(lastPourEntity)}
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
      ["apply_ideal_button_entity", "button", ["apply", "ideal"], "Apply ideal", "mdi:thermometer-check"],
      ["refresh_metadata_button_entity", "button", ["refresh"], "Refresh", "mdi:refresh"],
    ].map(([key, domain, matchers, label, icon]) => [
      this._controlEntity(key, domain, matchers),
      label,
      icon,
    ]).filter(([entity]) => entity);

    const eco = this._controlEntity("eco_mode_entity", "switch", ["eco"]);
    const mode = this._controlEntity("mode_select_entity", "select", ["mode"]);
    const targetControl = this._controlEntity("target_temperature_control_entity", "number", ["target", "temperature"]);
    const hasControls = buttons.length || eco || mode || targetControl;

    return `
      <section class="controls" aria-label="Taproom controls">
        ${hasControls ? "" : `<div class="control-empty">No controls configured</div>`}
        ${buttons.map(([entity, label, icon]) => `
          <button class="control-button" type="button" data-button-entity="${this._escape(entity.entity_id)}">
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

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      ha-card {
        --freshness-color: #45c9a9;
        overflow: hidden;
        background:
          radial-gradient(circle at 85% 15%, rgba(69, 201, 169, 0.20), transparent 32%),
          linear-gradient(145deg, var(--ha-card-background, var(--card-background-color, #102325)), #071618 72%);
        color: var(--primary-text-color, #f7fbfb);
        border-radius: var(--ha-card-border-radius, 8px);
      }

      ha-card.freshness-warn {
        --freshness-color: #ffc34d;
      }

      ha-card.freshness-danger {
        --freshness-color: #ff6b6b;
      }

      .card-button {
        width: 100%;
        max-width: 100%;
        display: block;
        padding: 18px;
        overflow: hidden;
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
          conic-gradient(var(--freshness-color) var(--freshness), rgba(255, 255, 255, 0.15) 0);
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
        min-height: 78px;
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
        display: flex;
        align-items: center;
        margin-top: 3px;
        color: inherit;
        font-size: 0.98rem;
        line-height: 1.1;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .stats strong ha-icon {
        --mdc-icon-size: 16px;
        margin-right: 5px;
        vertical-align: -2px;
      }

      .status-ok strong,
      .status-eco strong {
        color: #91f0dc;
      }

      .status-cooling strong {
        color: #9fd7ff;
      }

      .status-low strong,
      .status-unknown strong {
        color: #ffc34d;
      }

      .stats small {
        display: block;
        margin-top: 3px;
        color: rgba(247, 251, 251, 0.58);
        font-size: 0.68rem;
        line-height: 1.15;
      }

      .pour-history {
        margin-top: 10px;
        padding: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }

      .pour-history > span {
        display: block;
        margin-bottom: 8px;
        color: rgba(247, 251, 251, 0.62);
        font-size: 0.7rem;
        line-height: 1.2;
      }

      .pour-history div {
        height: 42px;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        align-items: end;
        gap: 5px;
      }

      .pour-history i {
        display: block;
        height: var(--bar);
        min-height: 5px;
        border-radius: 4px 4px 2px 2px;
        background: linear-gradient(180deg, #ffd260, #f1a523 55%, #c97612);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
      }

      .controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      .control-button,
      .control-pill,
      .stepper {
        min-height: 42px;
        min-width: 0;
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
        overflow: hidden;
      }

      .control-button span,
      .control-pill span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        min-width: 0;
      }

      .stepper {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) 38px;
        align-items: center;
        overflow: hidden;
        min-width: 0;
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
  {
    name: "volume_unit",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "metric", label: "Metric (litres / mL)" },
          { value: "imperial", label: "Imperial (pints)" },
        ],
      },
    },
  },
  { name: "show_pump", selector: { boolean: {} } },
  { name: "show_details", selector: { boolean: {} } },
  { name: "show_remaining", selector: { boolean: {} } },
  { name: "show_freshness", selector: { boolean: {} } },
  { name: "show_last_pour", selector: { boolean: {} } },
  { name: "show_empty_eta", selector: { boolean: {} } },
  { name: "show_temperature_status", selector: { boolean: {} } },
  { name: "show_pour_history", selector: { boolean: {} } },
  { name: "show_beer_tooltip", selector: { boolean: {} } },
  { name: "color_freshness_warning", selector: { boolean: {} } },
  { name: "compact", selector: { boolean: {} } },
  { name: "show_controls", selector: { boolean: {} } },
];

const CARD_EDITOR_LABELS = {
  name: "Card title",
  volume_unit: "Volume display",
  show_pump: "Show pump/keg view",
  show_details: "Show temperature row",
  show_remaining: "Show remaining when pump is hidden",
  show_freshness: "Show freshness when pump is hidden",
  show_last_pour: "Show last pour",
  show_empty_eta: "Show keg empty ETA",
  show_temperature_status: "Show temperature status",
  show_pour_history: "Show pour history",
  show_beer_tooltip: "Show beer hover details",
  color_freshness_warning: "Colour freshness warning",
  compact: "Compact mode",
  show_controls: "Show controls",
};

class PerfectDraftTaproomCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = {
      volume_unit: "metric",
      show_pump: true,
      show_details: true,
      show_remaining: true,
      show_freshness: true,
      show_last_pour: true,
      show_empty_eta: true,
      show_temperature_status: true,
      show_pour_history: true,
      show_beer_tooltip: true,
      color_freshness_warning: true,
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
