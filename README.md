# PerfectDraft Taproom Card

A Lovelace card for [PerfectDraft Taproom](https://github.com/Hyperion5088/hass-perfectdraft-taproom).

The card presents the loaded beer as a PerfectDraft-style pump with a front viewing window. The beer level drops with the estimated keg remaining sensor, while current and target temperatures are shown as part of the pump face.

[![Add this repository to HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Hyperion5088&repository=hass-perfectdraft-taproom-card&category=plugin)

## Features

- PerfectDraft-style pump graphic with a front beer-level viewing window
- Current and target temperature displayed as part of the pump face
- Freshness days remaining
- Loaded beer name, image, brewery/style/ABV attributes
- Hover beer metadata on the pump for stock, price, serving notes, reviews, and pairings
- Last pour value with timestamp, keg empty ETA, temperature status, and pour history
- Metric or imperial volume display using litre/mL or pint entities
- Freshness warning colours
- Optional pump/keg view and optional controls section
- Auto-discovery for Taproom entities, with manual YAML overrides available
- Visual card editor
- Theme-aware styling

## Installation

### HACS

1. Add this repository to HACS as a Dashboard repository:
   - `https://github.com/Hyperion5088/hass-perfectdraft-taproom-card`
2. Install **PerfectDraft Taproom Card**.
3. Refresh your browser after HACS adds the dashboard resource.

HACS serves the card from:

```text
/hacsfiles/hass-perfectdraft-taproom-card/perfectdraft-taproom-card.js?v=11
```

The trailing `v=11` is intentional. Increment it when updating the card if Home Assistant or the browser keeps serving an older cached copy.

### Manual

Copy `perfectdraft-taproom-card.js` to your Home Assistant `www` directory and add it as a dashboard resource:

```yaml
url: /local/perfectdraft-taproom-card.js?v=11
type: module
```

## Card Type

```yaml
type: custom:perfectdraft-taproom-card
```

## Configuration

The visual editor uses auto-discovery and only exposes display switches. For unusual setups, entities can still be overridden in YAML:

```yaml
type: custom:perfectdraft-taproom-card
beer_entity: sensor.perfectdraft_pro_beer
level_entity: sensor.perfectdraft_pro_keg_remaining
keg_volume_entity: sensor.perfectdraft_pro_keg_volume
pints_remaining_entity: sensor.perfectdraft_pro_pints_remaining
temperature_entity: sensor.perfectdraft_pro_temperature
target_temperature_entity: sensor.perfectdraft_pro_target_temperature
freshness_entity: sensor.perfectdraft_pro_keg_freshness
last_pour_entity: sensor.perfectdraft_pro_last_pour
last_pour_pints_entity: sensor.perfectdraft_pro_last_pour_pints
```

Optional display settings:

```yaml
compact: false
volume_unit: metric
show_pump: true
show_details: true
show_remaining: true
show_freshness: true
show_last_pour: true
show_empty_eta: true
show_temperature_status: true
show_pour_history: true
show_beer_tooltip: true
color_freshness_warning: true
show_controls: false
name: PerfectDraft Taproom
```

Optional control entities are also auto-discovered when `show_controls` is enabled. YAML overrides remain available:

```yaml
apply_ideal_button_entity: button.perfectdraft_pro_apply_ideal_temperature
refresh_metadata_button_entity: button.perfectdraft_pro_refresh_metadata
eco_mode_entity: switch.perfectdraft_pro_eco_mode
mode_select_entity: select.perfectdraft_pro_mode
target_temperature_control_entity: number.perfectdraft_pro_target_temperature
```

## Entity Notes

The Beer sensor can provide useful attributes such as `image_url`, `brewery`, `style`, `abv`, `stock_state`, and `shop_last_checked`. The card uses those when present and still works without them.

## HACS Compatibility

This repository is structured as a HACS Dashboard plugin. `hacs.json` points HACS at `perfectdraft-taproom-card.js`, which lives in the repository root.

When releasing a visual/card update, bump both:

- The `?v=11` query string shown in the resource URL examples.
- `PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER` near the top of `perfectdraft-taproom-card.js`.
