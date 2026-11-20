# Grocery List

A grocery shopping app made with plain HTML, CSS and JavaScript. Everything is saved on your device, and once it's opened from GitHub Pages it works without internet.

## Using it

- **Add items:** tap **＋ Add item**. Pick from the ready-made items, or type your own, like `2x milk` or `chicken 500g`. The app picks the category for you.
- **Wrong category?** Tap the category on the suggestion, or press and hold an item on your list and pick another. The app remembers your choice next time.
- **My frequent:** inside **＋ Add item**, the **⭐ My frequent** tab shows what you add most often.
- **Shopping:** tap an item to put it in **In Cart**. Tap it there to put it back on the list. **Clear Cart** empties the cart, and you can undo it.
- **Stores:** filter by Biedronka, Carrefour, Rossmann, Hebe or Auchan. Press and hold an item to tag it with a store. Items with "Any store" show up under every store.
- **Lists:** tap **＋ List** for extra lists, like Travel. Your own categories are under ••• → **My categories**.
- **Recipes:** copy a whole recipe from any website or app, then tap ••• → **Import a recipe** → **Paste from clipboard**. Only the ingredients are kept, with clean names and amounts. You can rename the dish or remove lines before importing, and each dish becomes its own list. See [SHARING.md](SHARING.md) for how the cooking apps send recipes.

## Try it on your computer

```
python3 -m http.server
```

Then visit http://localhost:8000

## Publishing an update

```
git add -A
git commit -m "describe what you changed"
git push
```

When you change any app file, also raise the version in `sw.js` (for example `grocery-v3` to `grocery-v4`). That tells phones to download the new files. The update shows up the second time you open the app.

## Add it to your iPhone Home Screen

1. Open your GitHub Pages link in **Safari** on your iPhone.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open it once while online. After that it works offline too.

**Note:** On iPhone, the Home Screen app keeps its own saved items, separate from Safari.

## Files

- `index.html`: the page
- `style.css`: the look
- `catalog.js`: categories and the ready-made items
- `app.js`: everything the app does
- `sw.js`: offline support
- `manifest.json`, `icon-*.png`, `icon.svg`: app name and icons for the Home Screen
