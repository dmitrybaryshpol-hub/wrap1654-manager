# Stable order creation version

I added `app.stable.js` as a simplified, stable frontend focused on fixing two problems:

1. Orders should create normally
2. The save/loading state should not hang forever

## What changed in the stable version

- simplified order creation form
- removed fragile mixed logic that was breaking the current app.js
- added safe submit button state (`Сохранение...`) with reset in `finally`
- kept core actions: auth, dashboard, orders list, create order, open order, add payment, delete order

## How to test it quickly

Temporary manual switch:

1. Open `index.html`
2. Replace:

```html
<script src="./app.js"></script>
```

with:

```html
<script src="./app.stable.js"></script>
```

3. Deploy and test order creation

## Recommended next step

If this stable version works correctly, replace the broken `app.js` with `app.stable.js` content and then restore extra features step by step.
