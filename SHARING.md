# Sending ingredients to the Grocery List

How the cooking apps (batch cooking, cook with what's in my fridge) hand recipes to this app. Every method works without internet.

Each dish becomes its own list in the Grocery List app. The dish name is the title and its ingredients are listed under it in the order given. The app sorts each ingredient into a category on its own.

## The recipe format

```json
{
  "app": "Batch Cooking",
  "dishes": [
    {
      "dish": "Salmon donburi",
      "items": [
        { "name": "Salmon", "qty": "300g" },
        { "name": "Sushi rice", "qty": "2 cups" },
        "1 avocado",
        "soy sauce"
      ]
    }
  ]
}
```

- A single dish can be sent without the `dishes` wrapper: `{ "dish": "...", "items": [...] }`.
- `items` (or `ingredients`) can be plain text like `"2 tbsp soy sauce"`, or objects with `name` and either `qty` or `amount` plus `unit`.
- `app` (or `from`) is shown under the dish name, e.g. "from Batch Cooking".

## Ways to send it

1. **Copy and paste.** This is the main method and works everywhere, including separate Home Screen apps on iPhone.
   The cooking app copies the recipe to the clipboard, either as the JSON above or as plain text:
   ```
   Salmon donburi
   300g salmon
   2 cups sushi rice
   1 avocado
   ```
   Then in Grocery List: tap ••• → **Import a recipe** → **Paste from clipboard** → **Import**. Leave a blank line between dishes to send several at once.

2. **Link.** Open `<grocery app address>/#import=<data>`, where `<data>` is the JSON encoded as UTF-8 and then as base64url. The app shows the recipe and asks before importing. On iPhone, links open in Safari rather than the Home Screen app, so this suits Safari or a computer.

3. **Shared inbox.** When both apps run on the same website address and in the same browser storage (for example both in Safari, under `gizem-pl.github.io`), the cooking app can add recipes to the `kitchenShare` key in `localStorage`. That key holds an array of recipe objects in the format above. The Grocery List shows a "recipes waiting" banner and clears the inbox after importing. iPhone Home Screen apps each have their own storage, so this doesn't work between them; use copy and paste there.
