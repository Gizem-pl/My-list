(function () {
  const STORAGE_KEY = 'myListItems';

  const form = document.getElementById('add-form');
  const input = document.getElementById('item-input');
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');

  let items = load();

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      // Storage unavailable (e.g. private mode) — the list still works for this session.
    }
  }

  function render() {
    list.replaceChildren();

    items.forEach(function (item) {
      const li = document.createElement('li');

      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = item.text;

      const del = document.createElement('button');
      del.className = 'delete';
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete ' + item.text);
      del.addEventListener('click', function () {
        items = items.filter(function (i) { return i.id !== item.id; });
        save();
        render();
      });

      li.append(text, del);
      list.append(li);
    });

    empty.hidden = items.length > 0;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), text: text });
    save();
    render();

    input.value = '';
    input.focus();
  });

  render();
})();
