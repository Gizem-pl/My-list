(function () {
  'use strict';

  // ================= Settings =================
  var BUILT_IN = window.GROCERY_CATEGORIES;
  var CATALOG = window.GROCERY_CATALOG;
  var STORES = ['Biedronka', 'Carrefour', 'Rossmann', 'Hebe', 'Auchan'];
  var CUSTOM_STYLE = { icon: '📌', h: 210, s: '20%' };
  var QUICK_QTY = ['1x', '2x', '3x', '4x', '6x', '250g', '500g', '1kg', '1l'];

  var KEY = 'groceryAppData';          // everything the app saves
  var LIST_KEY = 'groceryCurrentList'; // which list is open
  var FILTER_KEY = 'groceryFilter';    // which store tab is open
  var TIP_KEY = 'groceryTipSeen';
  var INBOX_KEY = 'kitchenShare';      // recipes left here by the cooking apps (see SHARING.md)

  // ================= Small helpers =================
  function $(id) { return document.getElementById(id); }
  function read(k, fallback) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function cap(s) { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (a) {
      var v = attrs[a];
      if (v == null || v === false) return;
      if (a === 'class') n.className = v;
      else if (a === 'text') n.textContent = v;
      else if (a.indexOf('on') === 0) n.addEventListener(a.slice(2), v);
      else n.setAttribute(a, v === true ? '' : v);
    });
    (kids || []).forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(function (x) { if (x) n.append(x); });
      else n.append(k);
    });
    return n;
  }

  // ================= Text matching =================
  // Turns "Tomatoes!" and "tomato" into the same key so they match.
  function stem(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(oes|ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ł/g, 'l')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .split(' ').filter(Boolean).map(stem).join(' ');
  }

  // Quantity like "2x milk", "milk 2x", "500g chicken", "Salmon - 300 g", "2 tbsp soy sauce"
  var NUM = '(?:\\d+(?:[.,/]\\d+)?|[½¼¾⅓⅔])';
  var UNIT = '(?:x|×|pcs?|szt\\.?|kg|g|gr|mg|l|ml|cl|dl|oz|lbs?|tbsp|tsp|cups?|cloves?|cans?|tins?|packs?|packets?|bunch(?:es)?|slices?|pieces?|bottles?|bags?|jars?|handfuls?)';
  var QTY = '(?:' + NUM + '\\s*' + UNIT + '?\\.?|[x×]\\s*\\d+)';
  var LEAD = new RegExp('^(' + QTY + ')\\s+(?:of\\s+)?(.+)$', 'i');
  var PAREN = new RegExp('^(.+?)\\s*\\((' + QTY + ')\\)$', 'i');
  var TRAIL = new RegExp('^(.+?)\\s*[-–—:,]?\\s+(' + QTY + ')$', 'i');

  function tidyQty(q) { return q.trim().replace(/^(\d+)\s+([x×])$/i, '$1x').replace(/^[x×]\s*(\d+)$/i, '$1x').replace(/×/g, 'x'); }
  function parseQty(text) {
    var t = String(text || '').trim().replace(/\s+/g, ' ');
    var m;
    if ((m = t.match(LEAD))) return { qty: tidyQty(m[1]), name: m[2].trim() };
    if ((m = t.match(PAREN))) return { qty: tidyQty(m[2]), name: m[1].trim() };
    if ((m = t.match(TRAIL))) return { qty: tidyQty(m[2]), name: m[1].trim() };
    return { qty: '', name: t };
  }

  // ================= Catalog index =================
  var entries = [];
  var aliasMap = {};
  Object.keys(CATALOG).forEach(function (cat) {
    CATALOG[cat].forEach(function (line) {
      var p = line.split('|');
      var e = { icon: p[0], name: p[1], category: cat, key: norm(p[1]), aliases: [] };
      [p[1]].concat(p[2] ? p[2].split(',') : []).forEach(function (a) {
        var k = norm(a);
        if (!k) return;
        e.aliases.push(k);
        if (!aliasMap[k]) aliasMap[k] = e;
      });
      entries.push(e);
    });
  });

  // Finds the best catalog item inside a name: "salmon fillet" → Salmon,
  // "chicken broth" → Stock (the last word usually says what it is).
  function matchEntry(k) {
    if (!k) return null;
    if (aliasMap[k]) return aliasMap[k];
    var w = k.split(' '), best = null, score = -1;
    for (var i = 0; i < w.length; i++) {
      for (var j = i + 1; j <= w.length; j++) {
        var e = aliasMap[w.slice(i, j).join(' ')];
        if (e) {
          var sc = (j - i) * 100 + j;
          if (sc > score) { score = sc; best = e; }
        }
      }
    }
    return best;
  }

  // ================= Saved data =================
  function blankData() {
    return {
      v: 2,
      lists: [{ id: 'main', name: 'Groceries', type: 'main', createdAt: 0 }],
      items: [],
      customCats: [],
      learned: {}, // corrections you made: item → category
      counts: {}   // how often you added each item
    };
  }

  function load() {
    var d = read(KEY, null);
    if (d && d.v === 2 && Array.isArray(d.items) && Array.isArray(d.lists)) {
      d.customCats = Array.isArray(d.customCats) ? d.customCats : [];
      d.learned = d.learned || {};
      d.counts = d.counts || {};
      if (!d.lists.some(function (l) { return l.id === 'main'; })) d.lists.unshift(blankData().lists[0]);
      return d;
    }

    // Bring over everything from the earlier versions of the app.
    d = blankData();
    var cats = read('groceryCustomCategories', []);
    if (Array.isArray(cats)) d.customCats = cats.filter(function (c) { return typeof c === 'string' && c; });
    var prev = read('groceryItems', null);
    var old = read('myListItems', []);
    var source = Array.isArray(prev) ? prev : (Array.isArray(old) ? old.map(function (o) { return { id: o.id, name: o.text }; }) : []);
    source.forEach(function (p, i) {
      var name = String(p.name || '').trim();
      if (!name) return;
      d.items.push({
        id: p.id || uid(), listId: 'main', name: name, qty: p.qty || '',
        category: p.category || 'Other', store: p.store || '',
        inCart: !!p.inCart, addedAt: p.addedAt || Date.now() + i, cartAt: p.cartAt || 0
      });
    });
    data = d;
    // Items that ended up in "Other" before now get a proper category.
    d.items.forEach(function (it) { if (it.category === 'Other') it.category = detectCategory(it.name); });
    write(KEY, d);
    return d;
  }

  var data = null;
  data = load();
  function save() { write(KEY, data); }

  var currentId = read(LIST_KEY, 'main');
  var filter = read(FILTER_KEY, 'All');
  if (filter !== 'All' && STORES.indexOf(filter) === -1) filter = 'All';

  // ================= Categories =================
  function allCats() {
    return BUILT_IN.concat(data.customCats.map(function (n) {
      return { name: n, icon: CUSTOM_STYLE.icon, h: CUSTOM_STYLE.h, s: CUSTOM_STYLE.s, custom: true };
    }));
  }
  function hasCat(name) { return allCats().some(function (c) { return c.name === name; }); }
  function catInfo(name) {
    return allCats().find(function (c) { return c.name === name; }) || BUILT_IN[BUILT_IN.length - 1];
  }
  function tint(ci) { return '--h:' + ci.h + ';--s:' + ci.s; }

  function detectCategory(name) {
    var k = norm(name);
    if (data.learned[k] && hasCat(data.learned[k])) return data.learned[k];
    var c = data.counts[k];
    if (c && c.category && hasCat(c.category)) return c.category;
    var e = matchEntry(k);
    return e ? e.category : 'Other';
  }
  function iconFor(name, category) {
    var k = norm(name);
    if (aliasMap[k]) return aliasMap[k].icon;
    var e = matchEntry(k);
    if (e && e.category === category) return e.icon;
    return catInfo(category).icon;
  }
  // "egg" → "Eggs", but "chicken breast" stays as you typed it.
  function niceName(raw) {
    var k = norm(raw);
    var e = aliasMap[k];
    return e && e.key === k ? e.name : cap(raw);
  }
  function learn(name, category) {
    var k = norm(name);
    data.learned[k] = category;
    if (data.counts[k]) data.counts[k].category = category;
  }

  function addCustomCategory(raw) {
    var name = cap(String(raw || '').slice(0, 30));
    if (!name) return null;
    var found = allCats().find(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
    if (found) return found.name;
    data.customCats.push(name);
    save();
    return name;
  }
  function removeCustomCategory(name) {
    var used = data.items.filter(function (i) { return i.category === name; }).length;
    if (!confirm('Remove “' + name + '”?' + (used ? ' Its ' + used + ' item(s) will move to Other.' : ''))) return false;
    data.customCats = data.customCats.filter(function (c) { return c !== name; });
    data.items.forEach(function (i) { if (i.category === name) i.category = 'Other'; });
    Object.keys(data.learned).forEach(function (k) { if (data.learned[k] === name) delete data.learned[k]; });
    Object.keys(data.counts).forEach(function (k) { if (data.counts[k].category === name) data.counts[k].category = 'Other'; });
    save();
    renderMain();
    return true;
  }

  // ================= Lists =================
  function currentList() {
    return data.lists.find(function (l) { return l.id === currentId; }) || data.lists[0];
  }
  function listItems(list) { return data.items.filter(function (i) { return i.listId === list.id; }); }
  function matchesFilter(item, list, f) {
    if (list.type === 'recipe') return true;
    f = f || filter;
    return f === 'All' || !item.store || item.store === f;
  }
  function findOnList(name, list) {
    var k = norm(name);
    list = list || currentList();
    return data.items.find(function (i) { return i.listId === list.id && norm(i.name) === k; });
  }
  function switchList(id) {
    currentId = id;
    write(LIST_KEY, id);
    renderMain();
    window.scrollTo(0, 0);
  }
  function listIcon(l) { return l.type === 'main' ? '🛒' : l.type === 'recipe' ? '🍽️' : '📝'; }

  // ================= Item actions =================
  function addItem(o) {
    var list = o.list || currentList();
    var existing = findOnList(o.name, list);
    var store = o.store != null ? o.store : (list.type !== 'recipe' && filter !== 'All' ? filter : '');
    if (existing) {
      var wasInCart = existing.inCart;
      existing.inCart = false;
      if (wasInCart) existing.addedAt = Date.now();
      if (o.qty) existing.qty = o.qty;
      if (o.category) existing.category = o.category;
      if (!o.silent) toast(wasInCart ? 'Moved back to your list' : (o.qty ? 'Updated ' + existing.name : existing.name + ' is already on your list'));
    } else {
      data.items.push({
        id: uid(), listId: list.id, name: o.name, qty: o.qty || '', category: o.category,
        store: store, inCart: false, addedAt: Date.now(), cartAt: 0
      });
      if (!o.silent) toast('Added ' + iconFor(o.name, o.category) + ' ' + o.name);
    }
    if (o.manual) {
      var k = norm(o.name);
      var c = data.counts[k] || { n: 0 };
      c.name = o.name; c.n += 1; c.category = o.category; c.last = Date.now();
      data.counts[k] = c;
    }
    save();
    renderMain();
  }

  function toggleItem(id) {
    var item = data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    item.inCart = !item.inCart;
    if (item.inCart) item.cartAt = Date.now();
    else if (currentList().type !== 'recipe') item.addedAt = Date.now();
    save();
    renderMain();
  }

  function removeItems(ids, message) {
    var removed = data.items.filter(function (i) { return ids.indexOf(i.id) !== -1; });
    if (!removed.length) return;
    data.items = data.items.filter(function (i) { return ids.indexOf(i.id) === -1; });
    save();
    renderMain();
    toast(message, 'Undo', function () {
      data.items = data.items.concat(removed);
      save();
      renderMain();
    });
  }

  // ================= Toast =================
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    toastEl.replaceChildren(el('span', { text: msg }));
    if (actionLabel) {
      toastEl.append(el('button', {
        type: 'button', class: 'toast-action', text: actionLabel,
        onclick: function () { hideToast(); action(); }
      }));
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 1800);
  }
  function hideToast() { toastEl.classList.remove('show'); }

  // ================= Press & hold =================
  function bindPress(node, onTap, onHold) {
    var timer = null, held = false, sx = 0, sy = 0;
    function cancel() { clearTimeout(timer); node.classList.remove('pressing'); }
    node.addEventListener('pointerdown', function (e) {
      held = false; sx = e.clientX; sy = e.clientY;
      clearTimeout(timer);
      node.classList.add('pressing');
      timer = setTimeout(function () { held = true; node.classList.remove('pressing'); onHold(); }, 450);
    });
    node.addEventListener('pointermove', function (e) {
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) cancel();
    });
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointercancel', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (!held) { cancel(); held = true; onHold(); }
    });
    node.addEventListener('click', function (e) {
      if (held) { held = false; e.preventDefault(); return; }
      onTap();
    });
  }

  // ================= Main screen =================
  var listsNav = $('lists');
  var storesNav = $('stores');
  var content = $('content');
  var cartSection = $('cart');
  var cartGrid = $('cart-grid');
  var cartCount = $('cart-count');
  var tipEl = $('tip');

  function badge(n) { return n ? el('span', { class: 'badge', text: String(n) }) : null; }

  function renderLists() {
    var main = data.lists.filter(function (l) { return l.id === 'main'; });
    var others = data.lists.filter(function (l) { return l.id !== 'main'; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    listsNav.replaceChildren();
    main.concat(others).forEach(function (l) {
      var n = listItems(l).filter(function (i) { return !i.inCart; }).length;
      var on = l.id === currentList().id;
      listsNav.append(el('button', {
        type: 'button', class: 'chip' + (on ? ' active' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { switchList(l.id); }
      }, [listIcon(l) + ' ' + l.name, badge(n)]));
    });
    listsNav.append(el('button', { type: 'button', class: 'chip ghost', text: '＋ List', 'aria-label': 'New list', onclick: newList }));
    var active = listsNav.querySelector('.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderStores() {
    var list = currentList();
    storesNav.hidden = list.type === 'recipe';
    if (storesNav.hidden) return;
    storesNav.replaceChildren();
    ['All'].concat(STORES).forEach(function (f) {
      var n = listItems(list).filter(function (i) { return !i.inCart && matchesFilter(i, list, f); }).length;
      var on = f === filter;
      storesNav.append(el('button', {
        type: 'button', class: 'chip small' + (on ? ' active' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { filter = f; write(FILTER_KEY, f); renderMain(); }
      }, [f, badge(n)]));
    });
  }

  function itemTile(item, list) {
    var ci = catInfo(item.category);
    var b = el('button', {
      type: 'button', class: 'tile' + (item.inCart ? ' done' : ''), style: tint(ci),
      'aria-label': (item.inCart ? 'Put back: ' : 'Got it: ') + item.name + (item.qty ? ', ' + item.qty : '')
    }, [
      el('span', { class: 'tile-icon', text: iconFor(item.name, item.category) }),
      el('span', { class: 'tile-name', text: item.name }),
      item.qty ? el('span', { class: 'tile-qty', text: item.qty }) : null,
      item.store && list.type !== 'recipe' ? el('span', { class: 'tile-store', text: item.store }) : null,
      item.inCart ? el('span', { class: 'tile-check', text: '✓' }) : null
    ]);
    bindPress(b, function () { toggleItem(item.id); }, function () { openEdit(item.id); });
    return b;
  }

  function renderContent() {
    var list = currentList();
    var items = listItems(list);
    var active = items.filter(function (i) { return !i.inCart && matchesFilter(i, list); });
    content.replaceChildren();

    if (list.type === 'recipe') {
      var sub = items.length + ' ingredient' + (items.length === 1 ? '' : 's') + (list.from ? ' · from ' + list.from : '');
      content.append(el('div', { class: 'dish-head' }, [
        el('span', { class: 'dish-icon', text: '🍽️' }),
        el('div', {}, [el('h2', { text: list.name }), el('p', { text: sub })])
      ]));
      if (active.length) {
        active.sort(function (a, b) { return a.addedAt - b.addedAt; });
        content.append(el('div', { class: 'grid' }, active.map(function (i) { return itemTile(i, list); })));
      }
    } else {
      allCats().forEach(function (c) {
        var group = active.filter(function (i) {
          return (hasCat(i.category) ? i.category : 'Other') === c.name;
        }).sort(function (a, b) { return a.addedAt - b.addedAt; });
        if (!group.length) return;
        content.append(el('section', { class: 'group' }, [
          el('h3', { class: 'group-title' }, [c.icon + ' ' + c.name, el('span', { class: 'group-count', text: String(group.length) })]),
          el('div', { class: 'grid' }, group.map(function (i) { return itemTile(i, list); }))
        ]));
      });
    }

    if (!active.length) {
      var anyInCart = items.some(function (i) { return i.inCart && matchesFilter(i, list); });
      content.append(el('div', { class: 'empty' }, anyInCart
        ? [el('div', { class: 'empty-icon', text: '🎉' }), el('p', { class: 'empty-title', text: 'All done!' }), el('p', { text: 'Everything is in your cart.' })]
        : [el('div', { class: 'empty-icon', text: '🧺' }), el('p', { class: 'empty-title', text: 'Nothing here yet' }), el('p', { text: 'Tap ＋ Add item to start your list.' })]
      ));
    }
    tipEl.hidden = !active.length || !!read(TIP_KEY, false);
  }

  function renderCart() {
    var list = currentList();
    var cart = listItems(list).filter(function (i) { return i.inCart && matchesFilter(i, list); })
      .sort(function (a, b) { return b.cartAt - a.cartAt; });
    cartSection.hidden = !cart.length;
    cartCount.textContent = cart.length ? String(cart.length) : '';
    cartGrid.replaceChildren.apply(cartGrid, cart.map(function (i) { return itemTile(i, list); }));
  }

  function renderMain() {
    renderLists();
    renderStores();
    renderContent();
    renderCart();
  }

  $('clear-cart').addEventListener('click', function () {
    var list = currentList();
    var ids = listItems(list).filter(function (i) { return i.inCart && matchesFilter(i, list); }).map(function (i) { return i.id; });
    removeItems(ids, 'Cart cleared');
  });
  $('add-btn').addEventListener('click', function () { openAdd(); });
  $('menu-btn').addEventListener('click', function () { openMenu(); });

  // ================= Sheets (pop-up panels) =================
  var backdrop = $('backdrop');
  var stack = [];

  function openSheet(opts) {
    var sheet = el('section', { class: 'sheet' + (opts.full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || opts.label || '' });
    sheet.append(el('div', { class: 'grabber' }));
    if (opts.head) sheet.append(opts.head);
    else if (opts.title != null) {
      sheet.append(el('div', { class: 'sheet-title' }, [
        el('h2', { text: opts.title }),
        el('button', { type: 'button', class: 'link-btn', text: 'Done', onclick: function () { closeSheet(sheet); } })
      ]));
    }
    var body = el('div', { class: 'sheet-body' });
    sheet.append(body);
    sheet.body = body;
    document.body.append(sheet);
    stack.push({ node: sheet, onClose: opts.onClose });
    sheet.style.zIndex = String(100 + stack.length * 2);
    backdrop.style.zIndex = String(99 + stack.length * 2);
    backdrop.classList.add('show');
    document.documentElement.classList.add('locked');
    void sheet.offsetHeight; // let the slide-up animation start
    sheet.classList.add('open');
    return sheet;
  }

  function closeSheet(sheet) {
    var i = stack.findIndex(function (s) { return s.node === sheet; });
    if (i < 0) return;
    var s = stack.splice(i, 1)[0];
    sheet.classList.remove('open');
    setTimeout(function () { sheet.remove(); }, 320);
    if (!stack.length) {
      backdrop.classList.remove('show');
      document.documentElement.classList.remove('locked');
    } else {
      backdrop.style.zIndex = String(99 + stack.length * 2);
    }
    if (s.onClose) s.onClose();
  }
  backdrop.addEventListener('click', function () { if (stack.length) closeSheet(stack[stack.length - 1].node); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && stack.length) closeSheet(stack[stack.length - 1].node);
  });

  function label(text) { return el('h3', { class: 'field-label', text: text }); }

  // ---------- Add items ----------
  function browseItems() {
    var seen = {};
    var out = entries.map(function (e) {
      seen[e.key] = true;
      return { name: e.name, key: e.key, aliases: e.aliases, icon: e.icon, category: detectCategory(e.name) };
    });
    Object.keys(data.counts).forEach(function (k) {
      if (seen[k]) return;
      var c = data.counts[k];
      var cat = hasCat(c.category) ? c.category : detectCategory(c.name);
      out.push({ name: c.name, key: k, aliases: [k], icon: iconFor(c.name, cat), category: cat, mine: true });
    });
    return out;
  }

  function openAdd() {
    var state = { tab: 'all', override: null };
    var typing = false;

    var input = el('input', {
      class: 'search-input', type: 'text', placeholder: 'Add item, e.g. 2x milk',
      'aria-label': 'Item name', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done'
    });
    var clearQ = el('button', {
      type: 'button', class: 'clear-q', text: '✕', 'aria-label': 'Clear', hidden: true,
      onclick: function () { input.value = ''; update(); input.focus(); }
    });
    var head = el('div', { class: 'add-head' }, [
      el('label', { class: 'search' }, [el('span', { class: 'search-icon', text: '🔍' }), input, clearQ]),
      el('button', { type: 'button', class: 'link-btn', text: 'Done', onclick: function () { closeSheet(sheet); } })
    ]);
    var seg = el('div', { class: 'seg', role: 'tablist' });
    var suggest = el('div', { class: 'suggest' });
    var body = el('div', { class: 'add-body' });
    var sheet = openSheet({ full: true, head: head, label: 'Add items' });
    sheet.body.append(seg, suggest, body);

    function currentOverride(name) {
      return state.override && state.override.key === norm(name) ? state.override.cat : null;
    }

    function update() {
      var p = parseQty(input.value);
      clearQ.hidden = !input.value;
      typing = !!p.name;
      seg.hidden = typing;
      if (!typing) { suggest.replaceChildren(); renderBrowse(); return; }
      renderSuggest(p);
      renderMatches(p);
    }

    function renderSuggest(p) {
      var name = niceName(p.name);
      var cat = currentOverride(name) || detectCategory(name);
      var ci = catInfo(cat);
      var existing = findOnList(name);
      suggest.replaceChildren(
        el('div', { class: 'suggest-card', style: tint(ci) }, [
          el('span', { class: 'suggest-icon', text: iconFor(name, cat) }),
          el('div', { class: 'suggest-main' }, [
            el('div', { class: 'suggest-name' }, [name, p.qty ? el('span', { class: 'qty-pill', text: p.qty }) : null]),
            el('button', {
              type: 'button', class: 'cat-chip', 'aria-label': 'Category: ' + ci.name + '. Tap to change',
              onclick: function () {
                openCategoryPicker(cat, function (c) {
                  state.override = { key: norm(name), cat: c };
                  update();
                });
              }
            }, [ci.icon + ' ' + ci.name, el('span', { class: 'chev', text: '▾' })])
          ]),
          el('button', { type: 'button', class: 'add-btn', text: existing && !existing.inCart ? 'Update' : 'Add', onclick: addTyped })
        ]),
        el('p', { class: 'hint', text: 'Wrong category? Tap it to change. The app will remember.' })
      );
    }

    function addTyped() {
      var p = parseQty(input.value);
      if (!p.name) return;
      var name = niceName(p.name);
      var override = currentOverride(name);
      if (override) learn(name, override);
      addItem({ name: name, qty: p.qty, category: override || detectCategory(name), manual: true });
      input.value = '';
      state.override = null;
      update();
      input.focus();
    }
    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTyped(); }
    });

    function pickTile(it, qty, extra) {
      var on = findOnList(it.name);
      var b = el('button', {
        type: 'button', class: 'tile small' + (on && !on.inCart ? ' on' : ''), style: tint(catInfo(it.category)),
        'aria-pressed': on && !on.inCart ? 'true' : 'false', 'aria-label': it.name
      }, [
        el('span', { class: 'tile-icon', text: it.icon }),
        el('span', { class: 'tile-name', text: it.name }),
        extra ? el('span', { class: 'tile-qty', text: extra }) : null,
        el('span', { class: 'tile-check', text: '✓' })
      ]);
      b.addEventListener('click', function () {
        var cur = findOnList(it.name);
        if (cur && !cur.inCart) {
          removeItems([cur.id], 'Removed ' + cur.name);
          b.classList.remove('on');
          b.setAttribute('aria-pressed', 'false');
        } else {
          addItem({ name: it.name, qty: qty || '', category: it.category, manual: true });
          b.classList.add('on');
          b.setAttribute('aria-pressed', 'true');
        }
        if (typing) { input.value = ''; update(); input.focus(); }
      });
      return b;
    }

    function renderMatches(p) {
      var q = norm(p.name);
      var exact = norm(niceName(p.name));
      var found = browseItems().filter(function (it) {
        if (it.key === exact) return false;
        return it.aliases.some(function (a) { return a.indexOf(q) === 0 || a.indexOf(' ' + q) !== -1; });
      }).slice(0, 30);
      body.replaceChildren();
      if (found.length) {
        body.append(label('Suggestions'), el('div', { class: 'grid small' }, found.map(function (it) { return pickTile(it, p.qty); })));
      }
    }

    function renderBrowse() {
      seg.replaceChildren(
        el('button', { type: 'button', role: 'tab', class: state.tab === 'all' ? 'on' : '', 'aria-selected': String(state.tab === 'all'), text: 'All items', onclick: function () { state.tab = 'all'; renderBrowse(); } }),
        el('button', { type: 'button', role: 'tab', class: state.tab === 'freq' ? 'on' : '', 'aria-selected': String(state.tab === 'freq'), text: '⭐ My frequent', onclick: function () { state.tab = 'freq'; renderBrowse(); } })
      );
      body.replaceChildren();

      if (state.tab === 'freq') {
        var freq = Object.keys(data.counts).map(function (k) { return data.counts[k]; })
          .sort(function (a, b) { return b.n - a.n || b.last - a.last; }).slice(0, 30);
        if (!freq.length) {
          body.append(el('div', { class: 'empty' }, [
            el('div', { class: 'empty-icon', text: '⭐' }),
            el('p', { class: 'empty-title', text: 'No favorites yet' }),
            el('p', { text: 'The things you add most often will show up here.' })
          ]));
          return;
        }
        body.append(label('Most added'), el('div', { class: 'grid small' }, freq.map(function (c) {
          var cat = hasCat(c.category) ? c.category : detectCategory(c.name);
          return pickTile({ name: c.name, icon: iconFor(c.name, cat), category: cat }, '', '×' + c.n);
        })));
        return;
      }

      var items = browseItems();
      allCats().forEach(function (c) {
        var group = items.filter(function (i) { return i.category === c.name; });
        group.sort(function (a, b) { return (b.mine ? 1 : 0) - (a.mine ? 1 : 0); });
        if (!group.length) return;
        body.append(el('section', { class: 'group' }, [
          el('h3', { class: 'group-title' }, [c.icon + ' ' + c.name]),
          el('div', { class: 'grid small' }, group.map(function (i) { return pickTile(i, ''); }))
        ]));
      });
    }

    update();
    input.focus();
  }

  // ---------- Category picker ----------
  function openCategoryPicker(current, onPick) {
    var sheet = openSheet({ title: 'Choose category' });
    function draw() {
      sheet.body.replaceChildren(el('div', { class: 'cat-grid' },
        allCats().map(function (c) {
          return el('button', {
            type: 'button', class: 'cat-option' + (c.name === current ? ' selected' : ''), style: tint(c),
            onclick: function () { onPick(c.name); closeSheet(sheet); }
          }, [el('span', { class: 'cat-option-icon', text: c.icon }), el('span', { text: c.name })]);
        }).concat([el('button', {
          type: 'button', class: 'cat-option new',
          onclick: function () {
            var name = addCustomCategory(prompt('Name your new category (e.g. Travel):'));
            if (name) { onPick(name); closeSheet(sheet); }
          }
        }, [el('span', { class: 'cat-option-icon', text: '＋' }), el('span', { text: 'New category' })])])
      ));
    }
    draw();
  }

  // ---------- Edit an item ----------
  function openEdit(id) {
    var item = data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    write(TIP_KEY, true);
    var list = currentList();
    var sheet = openSheet({ title: 'Edit item', onClose: renderMain });

    var heroIcon = el('span', { class: 'hero-icon' });
    var nameInput = el('input', { class: 'hero-name', type: 'text', value: item.name, 'aria-label': 'Item name', maxlength: '60', enterkeyhint: 'done' });
    var hero = el('div', { class: 'hero' }, [heroIcon, nameInput]);
    var qtyInput = el('input', { class: 'input', type: 'text', value: item.qty, placeholder: 'e.g. 2x, 500g', 'aria-label': 'Quantity', maxlength: '20', enterkeyhint: 'done' });
    var qtyChips = el('div', { class: 'chip-row' });
    var catChips = el('div', { class: 'cat-grid compact' });
    var storeChips = el('div', { class: 'chip-row' });

    function persist() { save(); }
    function drawHero() {
      var ci = catInfo(item.category);
      hero.setAttribute('style', tint(ci));
      heroIcon.textContent = iconFor(item.name, item.category);
    }
    function drawQty() {
      qtyChips.replaceChildren.apply(qtyChips, QUICK_QTY.map(function (q) {
        return el('button', {
          type: 'button', class: 'mini-chip' + (item.qty === q ? ' selected' : ''), text: q,
          onclick: function () { item.qty = item.qty === q ? '' : q; qtyInput.value = item.qty; persist(); drawQty(); }
        });
      }));
    }
    function drawCats() {
      catChips.replaceChildren.apply(catChips, allCats().map(function (c) {
        return el('button', {
          type: 'button', class: 'cat-option' + (c.name === item.category ? ' selected' : ''), style: tint(c),
          onclick: function () {
            if (item.category === c.name) return;
            item.category = c.name;
            learn(item.name, c.name);
            persist(); drawCats(); drawHero();
            toast('Got it: ' + item.name + ' goes in ' + c.name + ' from now on');
          }
        }, [el('span', { class: 'cat-option-icon', text: c.icon }), el('span', { text: c.name })]);
      }).concat([el('button', {
        type: 'button', class: 'cat-option new',
        onclick: function () {
          var name = addCustomCategory(prompt('Name your new category (e.g. Travel):'));
          if (!name) return;
          item.category = name; learn(item.name, name); persist(); drawCats(); drawHero();
        }
      }, [el('span', { class: 'cat-option-icon', text: '＋' }), el('span', { text: 'New' })])]));
    }
    function drawStores() {
      storeChips.replaceChildren.apply(storeChips, [''].concat(STORES).map(function (s) {
        return el('button', {
          type: 'button', class: 'mini-chip' + ((item.store || '') === s ? ' selected' : ''), text: s || 'Any store',
          onclick: function () { item.store = s; persist(); drawStores(); }
        });
      }));
    }

    nameInput.addEventListener('change', function () {
      var v = cap(nameInput.value);
      if (!v) { nameInput.value = item.name; return; }
      item.name = v; persist(); drawHero();
    });
    qtyInput.addEventListener('input', function () { item.qty = qtyInput.value.trim(); persist(); drawQty(); });
    [nameInput, qtyInput].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
    });

    sheet.body.append(
      hero,
      label('Quantity'), qtyInput, qtyChips,
      label('Category'), catChips,
      list.type !== 'recipe' ? label('Store') : null,
      list.type !== 'recipe' ? storeChips : null,
      el('button', {
        type: 'button', class: 'danger-btn', text: 'Delete item',
        onclick: function () { closeSheet(sheet); removeItems([item.id], 'Deleted ' + item.name); }
      })
    );
    drawHero(); drawQty(); drawCats(); drawStores();
  }

  // ---------- Menu ----------
  function openMenu() {
    var list = currentList();
    var sheet = openSheet({ title: listIcon(list) + ' ' + list.name });
    function row(icon, text, fn, danger) {
      return el('button', {
        type: 'button', class: 'menu-row' + (danger ? ' danger' : ''),
        onclick: function () { closeSheet(sheet); setTimeout(fn, 0); }
      }, [el('span', { class: 'menu-icon', text: icon }), el('span', { text: text })]);
    }
    sheet.body.append(
      el('div', { class: 'menu-group' }, [
        row('📥', 'Import a recipe', function () { openImport(); }),
        row('📝', 'New list', newList),
        list.id !== 'main' ? row('🛒', 'Add all to Groceries', addAllToMain) : null,
        list.id !== 'main' ? row('✏️', 'Rename list', renameList) : null
      ]),
      el('div', { class: 'menu-group' }, [
        row('🏷️', 'My categories', openCategories),
        row('⭐', 'Reset my frequent items', resetFrequent)
      ]),
      list.id !== 'main' ? el('div', { class: 'menu-group' }, [row('🗑️', 'Delete this list', deleteList, true)]) : null
    );
  }

  function newList() {
    var name = cap(prompt('Name your new list (e.g. Travel, Party):') || '');
    if (!name) return;
    var id = uid();
    data.lists.push({ id: id, name: name.slice(0, 40), type: 'custom', createdAt: Date.now() });
    save();
    switchList(id);
  }
  function renameList() {
    var list = currentList();
    var name = cap(prompt('Rename list:', list.name) || '');
    if (!name) return;
    list.name = name.slice(0, 40);
    save();
    renderMain();
  }
  function deleteList() {
    var list = currentList();
    if (list.id === 'main') return;
    var n = listItems(list).length;
    if (!confirm('Delete “' + list.name + '”' + (n ? ' and its ' + n + ' item(s)' : '') + '?')) return;
    data.items = data.items.filter(function (i) { return i.listId !== list.id; });
    data.lists = data.lists.filter(function (l) { return l.id !== list.id; });
    save();
    switchList('main');
    toast('List deleted');
  }
  function addAllToMain() {
    var list = currentList();
    var main = data.lists.find(function (l) { return l.id === 'main'; });
    var todo = listItems(list).filter(function (i) { return !i.inCart; });
    var added = 0;
    todo.forEach(function (i) {
      var ex = findOnList(i.name, main);
      if (ex && !ex.inCart) return;
      addItem({ list: main, name: i.name, qty: i.qty, category: i.category, store: '', silent: true });
      added++;
    });
    toast(added ? 'Added ' + added + ' item(s) to Groceries' : 'Everything is already on Groceries');
  }
  function resetFrequent() {
    if (!confirm('Forget how often you added each item?')) return;
    data.counts = {};
    save();
    toast('Frequent items reset');
  }

  function openCategories() {
    var sheet = openSheet({ title: 'My categories' });
    var input = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Travel', 'aria-label': 'New category name', maxlength: '30', enterkeyhint: 'done' });
    var listEl = el('div', { class: 'chip-row' });
    function draw() {
      listEl.replaceChildren();
      if (!data.customCats.length) listEl.append(el('p', { class: 'hint', text: 'You haven’t made any yet.' }));
      data.customCats.forEach(function (n) {
        listEl.append(el('span', { class: 'mini-chip removable' }, [
          CUSTOM_STYLE.icon + ' ' + n,
          el('button', { type: 'button', text: '✕', 'aria-label': 'Remove ' + n, onclick: function () { if (removeCustomCategory(n)) draw(); } })
        ]));
      });
    }
    function add() {
      var name = addCustomCategory(input.value);
      if (!name) return;
      input.value = '';
      draw();
      toast('Added category ' + name);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    sheet.body.append(
      el('p', { class: 'hint', text: 'Make your own categories, like Travel for passport, charger and iPad.' }),
      el('div', { class: 'inline-form' }, [input, el('button', { type: 'button', class: 'primary-btn', text: 'Add', onclick: add })]),
      label('Your categories'), listEl
    );
    draw();
  }

  // ================= Importing recipes =================
  function b64decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function fromJson(o) {
    if (Array.isArray(o)) return o.reduce(function (a, x) { return a.concat(fromJson(x)); }, []);
    if (!o || typeof o !== 'object') return [];
    if (Array.isArray(o.dishes)) return fromJson(o.dishes.map(function (d) { return Object.assign({ from: o.from || o.app }, d); }));
    if (Array.isArray(o.recipes)) return fromJson(o.recipes.map(function (d) { return Object.assign({ from: o.from || o.app }, d); }));
    var raw = o.items || o.ingredients;
    if (!Array.isArray(raw)) return [];
    var items = raw.map(function (x) {
      if (typeof x === 'string') return parseQty(x);
      if (x && typeof x === 'object' && x.name) {
        var qty = x.qty != null ? String(x.qty) : (x.amount != null ? String(x.amount) + (x.unit ? ' ' + x.unit : '') : '');
        return { name: String(x.name).trim(), qty: qty.trim() };
      }
      return null;
    }).filter(function (x) { return x && x.name; });
    if (!items.length) return [];
    return [{ name: cap(String(o.dish || o.name || o.title || 'Recipe')).slice(0, 60), items: items, from: o.from || o.app || '' }];
  }

  function cleanLine(l) {
    return l.replace(/^\s*(?:[-–—•*·▪◦☐☑✓✔]|\[[ xX]?\]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').trim();
  }

  function fromText(text) {
    var dishes = [];
    text.replace(/\r/g, '').split(/\n\s*\n/).forEach(function (block) {
      var raw = block.split('\n').filter(function (l) { return l.trim(); });
      var lines = raw.map(cleanLine).filter(function (l) { return l && !/^ingredients?:?$/i.test(l); });
      if (!lines.length) return;
      var startsWithTitle = /^\s*#/.test(raw[0]) || lines.length > 1;
      if (!startsWithTitle && dishes.length) {
        dishes[dishes.length - 1].items.push(parseQty(lines[0]));
        return;
      }
      var title = startsWithTitle ? lines.shift().replace(/:$/, '') : 'Recipe';
      dishes.push({ name: cap(title).slice(0, 60), items: lines.map(parseQty).filter(function (x) { return x.name; }), from: '' });
    });
    return dishes.filter(function (d) { return d.items.length; });
  }

  function parseImport(text) {
    text = String(text || '').trim();
    if (!text) return [];
    var m = text.match(/#import=([A-Za-z0-9_\-]+=*)/);
    if (m) { try { text = b64decode(m[1]); } catch (e) { /* not a link */ } }
    if (/^[[{]/.test(text)) {
      try { return fromJson(JSON.parse(text)); } catch (e) { /* not JSON, read as text */ }
    }
    return fromText(text);
  }

  function importDishes(dishes, source) {
    var firstId = null;
    var t = Date.now();
    dishes.forEach(function (d) {
      var id = uid();
      if (!firstId) firstId = id;
      data.lists.push({ id: id, name: d.name, type: 'recipe', from: d.from || source || '', createdAt: t });
      d.items.forEach(function (ing, i) {
        var name = niceName(ing.name);
        data.items.push({
          id: uid(), listId: id, name: name, qty: ing.qty || '', category: detectCategory(name),
          store: '', inCart: false, addedAt: t + i, cartAt: 0
        });
      });
      t += 1000;
    });
    save();
    return firstId;
  }

  function openImport(preset, source, onImported) {
    var sheet = openSheet({ title: 'Import a recipe' });
    var dishes = preset || [];
    var ta = el('textarea', {
      class: 'import-text', rows: '7', 'aria-label': 'Recipe text',
      placeholder: 'Paste a recipe here, for example:\n\nSalmon donburi\n300g salmon\n2 cups sushi rice\n1 avocado\nsoy sauce'
    });
    var preview = el('div', { class: 'import-preview' });
    var go = el('button', { type: 'button', class: 'primary-btn wide', text: 'Import', disabled: true });

    function show() {
      preview.replaceChildren.apply(preview, dishes.map(function (d) {
        return el('div', { class: 'preview-dish' }, [
          el('h3', { text: '🍽️ ' + d.name }),
          el('div', { class: 'chip-row' }, d.items.map(function (i) {
            var n = niceName(i.name);
            return el('span', { class: 'mini-chip' }, [iconFor(n, detectCategory(n)) + ' ' + n + (i.qty ? ' · ' + i.qty : '')]);
          }))
        ]);
      }));
      go.disabled = !dishes.length;
      go.textContent = dishes.length > 1 ? 'Import ' + dishes.length + ' recipes' : 'Import';
    }

    ta.addEventListener('input', function () { dishes = parseImport(ta.value); show(); });
    go.addEventListener('click', function () {
      if (!dishes.length) return;
      var id = importDishes(dishes, source);
      closeSheet(sheet);
      if (onImported) onImported();
      switchList(id);
      toast(dishes.length > 1 ? 'Imported ' + dishes.length + ' recipes' : 'Imported ' + dishes[0].name);
    });

    if (preset) {
      sheet.body.append(el('p', { class: 'hint', text: 'Each dish becomes its own list with its ingredients.' }), preview, go);
    } else {
      var paste = el('button', {
        type: 'button', class: 'secondary-btn wide', text: '📋 Paste from clipboard',
        onclick: function () {
          if (!navigator.clipboard || !navigator.clipboard.readText) { ta.focus(); toast('Press and hold the box, then tap Paste'); return; }
          navigator.clipboard.readText().then(function (t) {
            ta.value = t;
            dishes = parseImport(t);
            show();
            if (!dishes.length) toast('Couldn’t find a recipe in what you copied');
          }).catch(function () { ta.focus(); toast('Press and hold the box, then tap Paste'); });
        }
      });
      sheet.body.append(
        el('p', { class: 'hint', text: 'In a cooking app, copy the recipe, then paste it here. First line is the dish name, then one ingredient per line.' }),
        paste, ta, preview, go
      );
    }
    show();
  }

  // Recipes sent by link: ...index.html#import=<data>
  function checkHash() {
    var m = location.hash.match(/^#import=(.+)$/);
    if (!m) return;
    var dishes = [];
    try { dishes = fromJson(JSON.parse(b64decode(m[1]))); } catch (e) { /* broken link */ }
    history.replaceState(null, '', location.pathname + location.search);
    if (dishes.length) openImport(dishes, 'link');
    else toast('That import link didn’t work');
  }

  // Recipes waiting in the shared inbox (when apps share storage, e.g. in Safari).
  var inboxEl = $('inbox');
  var inboxSnoozed = false;
  function checkInbox() {
    var inbox = read(INBOX_KEY, []);
    var dishes = Array.isArray(inbox) ? fromJson(inbox) : [];
    if (!dishes.length || inboxSnoozed) { inboxEl.hidden = true; return; }
    inboxEl.replaceChildren(
      el('span', { class: 'banner-text', text: '📥 ' + dishes.length + ' recipe' + (dishes.length > 1 ? 's' : '') + ' waiting from your cooking app' }),
      el('button', { type: 'button', class: 'primary-btn small', text: 'Review', onclick: function () {
        openImport(dishes, '', function () { write(INBOX_KEY, []); checkInbox(); });
      } }),
      el('button', { type: 'button', class: 'link-btn', text: 'Later', onclick: function () { inboxSnoozed = true; checkInbox(); } })
    );
    inboxEl.hidden = false;
  }

  // ================= Start =================
  renderMain();
  checkInbox();
  checkHash();
  window.addEventListener('hashchange', checkHash);
  window.addEventListener('storage', function (e) {
    if (e.key === INBOX_KEY) checkInbox();
    if (e.key === KEY) { data = load(); renderMain(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkInbox(); });

  // Works offline once opened (needs https, e.g. GitHub Pages).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode unavailable */ });
  }

  // For automated checks only.
  window.__grocery = { parseQty: parseQty, detectCategory: detectCategory, parseImport: parseImport, niceName: niceName };
})();
