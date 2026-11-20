(function () {
  // ---- Fixed lists ----
  const STORES = ['Biedronka', 'Carrefour', 'Rossmann', 'Hebe', 'Auchan'];
  const BUILT_IN = [
    { name: 'Meat', icon: '🥩' },
    { name: 'Fish', icon: '🐟' },
    { name: 'Dairy', icon: '🥛' },
    { name: 'Eggs', icon: '🥚' },
    { name: 'Veggies', icon: '🥦' },
    { name: 'Fruits', icon: '🍎' },
    { name: 'Kitchen stuff', icon: '🍳' },
    { name: 'Bathroom stuff', icon: '🧴' },
    { name: 'Cleaning', icon: '🧽' },
    { name: 'Other', icon: '🛒' }
  ];
  const CUSTOM_ICON = '📌';
  const NEW_CAT = '__new__';

  // ---- Storage keys ----
  const ITEMS_KEY = 'groceryItems';
  const CATS_KEY = 'groceryCustomCategories';
  const FILTER_KEY = 'groceryFilter';
  const OLD_KEY = 'myListItems'; // from the first "My List" version

  // ---- Elements ----
  const $ = function (id) { return document.getElementById(id); };
  const tabsEl = $('tabs');
  const form = $('add-form');
  const nameEl = $('name');
  const qtyEl = $('qty');
  const catEl = $('category');
  const storeEl = $('store');
  const activeEl = $('active');
  const emptyEl = $('empty');
  const cartSection = $('cart-section');
  const cartEl = $('cart');
  const cartCount = $('cart-count');
  const clearBtn = $('clear-cart');
  const catForm = $('cat-form');
  const catNameEl = $('cat-name');
  const catList = $('cat-list');

  // ---- Storage helpers ----
  function read(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function loadItems() {
    const items = read(ITEMS_KEY, null);
    if (Array.isArray(items)) return items;

    // First run of the grocery version: bring over items from "My List".
    const old = read(OLD_KEY, []);
    const migrated = Array.isArray(old) ? old.map(function (o, i) {
      return {
        id: o.id || uid(),
        name: String(o.text || ''),
        qty: '',
        category: 'Other',
        store: '',
        inCart: false,
        addedAt: Date.now() + i,
        cartAt: 0
      };
    }).filter(function (o) { return o.name; }) : [];
    write(ITEMS_KEY, migrated);
    return migrated;
  }

  let items = loadItems();
  let customCats = read(CATS_KEY, []);
  if (!Array.isArray(customCats)) customCats = [];
  let filter = read(FILTER_KEY, 'All');
  if (filter !== 'All' && STORES.indexOf(filter) === -1) filter = 'All';

  function saveItems() { write(ITEMS_KEY, items); }
  function saveCats() { write(CATS_KEY, customCats); }

  // ---- Categories ----
  function allCategories() {
    return BUILT_IN.concat(customCats.map(function (n) { return { name: n, icon: CUSTOM_ICON }; }));
  }
  function iconFor(name) {
    const c = allCategories().find(function (c) { return c.name === name; });
    return c ? c.icon : CUSTOM_ICON;
  }
  function categoryExists(name) {
    return allCategories().some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
  }
  function addCustomCategory(raw) {
    const name = (raw || '').trim().slice(0, 30);
    if (!name) return null;
    const existing = allCategories().find(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
    if (existing) return existing.name;
    customCats.push(name);
    saveCats();
    return name;
  }
  function removeCustomCategory(name) {
    const used = items.filter(function (i) { return i.category === name; }).length;
    const msg = used
      ? 'Remove “' + name + '”? Its ' + used + ' item(s) will move to Other.'
      : 'Remove “' + name + '”?';
    if (!confirm(msg)) return;
    customCats = customCats.filter(function (c) { return c !== name; });
    items.forEach(function (i) { if (i.category === name) i.category = 'Other'; });
    saveCats();
    saveItems();
    renderCategorySelect(catEl.value === name ? 'Other' : catEl.value);
    render();
  }

  // ---- Filtering ----
  // Items with no store ("Any store") show up in every store tab.
  function matchesFilter(item, f) {
    return f === 'All' || !item.store || item.store === f;
  }

  // ---- Form selects ----
  function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function renderCategorySelect(selected) {
    catEl.replaceChildren();
    allCategories().forEach(function (c) {
      catEl.append(option(c.name, c.icon + ' ' + c.name));
    });
    catEl.append(option(NEW_CAT, '+ New category…'));
    catEl.value = selected && categoryExists(selected) ? selected : BUILT_IN[0].name;
    catEl.dataset.last = catEl.value;
  }

  function renderStoreSelect() {
    storeEl.replaceChildren();
    storeEl.append(option('', 'Any store'));
    STORES.forEach(function (s) { storeEl.append(option(s, s)); });
    storeEl.value = filter === 'All' ? '' : filter;
  }

  catEl.addEventListener('change', function () {
    if (catEl.value !== NEW_CAT) {
      catEl.dataset.last = catEl.value;
      return;
    }
    const name = addCustomCategory(prompt('New category name (e.g. Travel):'));
    renderCategorySelect(name || catEl.dataset.last);
    renderCustomList();
  });

  // ---- Rendering ----
  function renderTabs() {
    tabsEl.replaceChildren();
    ['All'].concat(STORES).forEach(function (f) {
      const n = items.filter(function (i) { return !i.inCart && matchesFilter(i, f); }).length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (f === filter ? ' active' : '');
      b.setAttribute('aria-pressed', f === filter ? 'true' : 'false');
      b.textContent = f;
      if (n) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = n;
        b.append(badge);
      }
      b.addEventListener('click', function () {
        filter = f;
        write(FILTER_KEY, filter);
        storeEl.value = filter === 'All' ? '' : filter;
        render();
      });
      tabsEl.append(b);
    });
  }

  function itemRow(item) {
    const li = document.createElement('li');
    li.className = 'item' + (item.inCart ? ' done' : '');

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'item-main';
    main.setAttribute('aria-label', (item.inCart ? 'Put back on list: ' : 'Add to cart: ') + item.name);

    const check = document.createElement('span');
    check.className = 'check';
    check.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'item-body';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.name;
    body.append(name);

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    if (item.qty) {
      const q = document.createElement('span');
      q.className = 'qty';
      q.textContent = item.qty;
      meta.append(q);
    }
    if (item.store) {
      const s = document.createElement('span');
      s.className = 'store-tag';
      s.textContent = item.store;
      meta.append(s);
    }
    if (item.inCart) {
      const c = document.createElement('span');
      c.className = 'cat-tag';
      c.textContent = iconFor(item.category) + ' ' + item.category;
      meta.append(c);
    }
    if (meta.childNodes.length) body.append(meta);

    main.append(check, body);
    main.addEventListener('click', function () { toggle(item.id); });
    li.append(main);

    if (!item.inCart) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Delete ' + item.name);
      del.addEventListener('click', function () { remove(item.id); });
      li.append(del);
    }
    return li;
  }

  function renderActive() {
    activeEl.replaceChildren();
    const active = items.filter(function (i) { return !i.inCart && matchesFilter(i, filter); });

    allCategories().forEach(function (c) {
      const group = active
        .filter(function (i) { return i.category === c.name; })
        .sort(function (a, b) { return a.addedAt - b.addedAt; });
      if (!group.length) return;

      const wrap = document.createElement('div');
      wrap.className = 'group';
      const h = document.createElement('h3');
      h.textContent = c.icon + ' ' + c.name;
      const ul = document.createElement('ul');
      ul.className = 'list';
      group.forEach(function (i) { ul.append(itemRow(i)); });
      wrap.append(h, ul);
      activeEl.append(wrap);
    });

    emptyEl.hidden = active.length > 0;
  }

  function renderCart() {
    const cart = items
      .filter(function (i) { return i.inCart && matchesFilter(i, filter); })
      .sort(function (a, b) { return b.cartAt - a.cartAt; });
    cartEl.replaceChildren();
    cart.forEach(function (i) { cartEl.append(itemRow(i)); });
    cartCount.textContent = cart.length ? '(' + cart.length + ')' : '';
    cartSection.hidden = cart.length === 0;
  }

  function renderCustomList() {
    catList.replaceChildren();
    customCats.forEach(function (name) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = CUSTOM_ICON + ' ' + name;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Remove category ' + name);
      del.addEventListener('click', function () { removeCustomCategory(name); });
      li.append(label, del);
      catList.append(li);
    });
  }

  function render() {
    renderTabs();
    renderActive();
    renderCart();
    renderCustomList();
  }

  // ---- Actions ----
  function toggle(id) {
    const item = items.find(function (i) { return i.id === id; });
    if (!item) return;
    item.inCart = !item.inCart;
    if (item.inCart) {
      item.cartAt = Date.now();
    } else {
      item.addedAt = Date.now(); // goes to the end of its category group
    }
    saveItems();
    render();
  }

  function remove(id) {
    items = items.filter(function (i) { return i.id !== id; });
    saveItems();
    render();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    const category = catEl.value === NEW_CAT ? 'Other' : catEl.value;

    items.push({
      id: uid(),
      name: name,
      qty: qtyEl.value.trim(),
      category: category,
      store: storeEl.value,
      inCart: false,
      addedAt: Date.now(),
      cartAt: 0
    });
    saveItems();
    render();

    // Keep category and store so adding several similar items is quick.
    nameEl.value = '';
    qtyEl.value = '';
    nameEl.focus();
  });

  clearBtn.addEventListener('click', function () {
    const toClear = items.filter(function (i) { return i.inCart && matchesFilter(i, filter); });
    if (!toClear.length) return;
    const where = filter === 'All' ? '' : ' for ' + filter;
    if (!confirm('Remove ' + toClear.length + ' item(s) from the cart' + where + '?')) return;
    const ids = toClear.map(function (i) { return i.id; });
    items = items.filter(function (i) { return ids.indexOf(i.id) === -1; });
    saveItems();
    render();
  });

  catForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const name = addCustomCategory(catNameEl.value);
    if (!name) return;
    catNameEl.value = '';
    renderCategorySelect(name);
    renderCustomList();
  });

  // ---- Start ----
  renderCategorySelect();
  renderStoreSelect();
  render();
})();
