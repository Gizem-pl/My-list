# My List

A simple list app made with plain HTML, CSS and JavaScript. Items are saved on your device (in the browser's local storage), so they're still there after you close the app.

## Try it on your computer

Open `index.html` in a browser, or run a tiny local server from this folder:

```
python3 -m http.server
```

Then visit http://localhost:8000

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `my-list`).
2. Upload all the files in this folder to it (or push them with git).
3. In the repository, go to **Settings → Pages**.
4. Under **Build and deployment**, pick **Deploy from a branch**, choose `main` and `/ (root)`, then **Save**.
5. After a minute your app is live at `https://YOUR-USERNAME.github.io/my-list/`.

## Add it to your iPhone Home Screen

1. Open your GitHub Pages link in **Safari** on your iPhone.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Tap **Add**. Open it from the new icon and it runs full-screen, like an app.

**Note:** On iPhone, the Home Screen app keeps its own saved items, separate from Safari. Add your items from inside the Home Screen app.

## Files

- `index.html`: the page
- `style.css`: the look
- `app.js`: adding, deleting and saving items
- `manifest.json`, `icon-*.png`, `icon.svg`: app name and icons for the Home Screen
