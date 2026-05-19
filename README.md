# PerfectDraft Taproom Card

A Lovelace card for [PerfectDraft Taproom](https://github.com/Hyperion5088/hass-perfectdraft-taproom).

The card presents the loaded beer as a PerfectDraft-style pump with a front viewing window. The beer level drops with the estimated keg remaining sensor, while current and target temperatures are shown as part of the pump face.

[![Add this repository to HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Hyperion5088&repository=hass-perfectdraft-taproom-card&category=plugin)

## Features

- PerfectDraft-style pump graphic with a front beer-level viewing window
- Current and target temperature displayed as part of the pump face
- Freshness days remaining
- Loaded beer name, image, brewery/style/ABV attributes
- Auto-discovery for Taproom entities, with manual entity overrides
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
/hacsfiles/hass-perfectdraft-taproom-card/perfectdraft-taproom-card.js?v=2
```

The trailing `v=2` is intentional. Increment it when updating the card if Home Assistant or the browser keeps serving an older cached copy.

### Manual

Copy `perfectdraft-taproom-card.js` to your Home Assistant `www` directory and add it as a dashboard resource:

```yaml
url: /local/perfectdraft-taproom-card.js?v=2
type: module
```

## Card Type

```yaml
type: custom:perfectdraft-taproom-card
```

## Configuration

The card can auto-discover entities created by the Taproom integration. For a precise setup, configure the entities explicitly:

```yaml
type: custom:perfectdraft-taproom-card
beer_entity: sensor.perfectdraft_pro_beer
level_entity: sensor.perfectdraft_pro_keg_remaining
temperature_entity: sensor.perfectdraft_pro_temperature
target_temperature_entity: sensor.perfectdraft_pro_target_temperature
freshness_entity: sensor.perfectdraft_pro_keg_freshness
```

Optional display settings:

```yaml
compact: false
show_details: true
name: PerfectDraft Taproom
```

## Entity Notes

The Beer sensor can provide useful attributes such as `image_url`, `brewery`, `style`, `abv`, `stock_state`, and `shop_last_checked`. The card uses those when present and still works without them.

## HACS Compatibility

This repository is structured as a HACS Dashboard plugin. `hacs.json` points HACS at `perfectdraft-taproom-card.js`, which lives in the repository root.

When releasing a visual/card update, bump both:

- The `?v=2` query string shown in the resource URL examples.
- `PERFECTDRAFT_TAPROOM_CARD_CACHE_BUSTER` near the top of `perfectdraft-taproom-card.js`.
