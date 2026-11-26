(function () {
  'use strict';

  // ================= Settings =================
  var BUILT_IN = window.GROCERY_CATEGORIES;
  var CATALOG = window.GROCERY_CATALOG;
  var TRAVEL_CATS = window.TRAVEL_CATEGORIES;
  var TRAVEL_CATALOG = window.TRAVEL_CATALOG;
  var STORES = ['Biedronka', 'Carrefour', 'Rossmann', 'Hebe', 'Auchan'];
  var CUSTOM_STYLE = { icon: '📌', h: 210, s: '20%' };
  var QUICK_QTY = ['1x', '2x', '3x', '4x', '6x', '250g', '500g', '1kg', '1l'];
  var QUICK_QTY_TRAVEL = ['1x', '2x', '3x', '4x', '5x', '6x', '7x'];
  // A list named like this starts out as a packing list.
  var TRIP_WORDS = 'travel trip vacation holiday packing journey getaway camping wakacje urlop wyjazd podroz ferie majowka wycieczka';

  // Shopping lists (Groceries, recipes, your own lists) and travel packing lists
  // look and behave differently. These are the words each one uses.
  var WORDS = {
    grocery: {
      done: 'In Cart', clear: 'Clear Cart', doneHint: 'Tap an item to put it back on the list.',
      allDone: ['🎉', 'All done!', 'Everything is in your cart.'],
      empty: ['🧺', 'Nothing here yet', 'Tap ＋ Add item to start your list.'],
      placeholder: 'Add item, e.g. 2x milk', tap: 'Got it: ', untap: 'Put back: ',
      tip: 'Tip: press and hold an item to change its amount, category or store.',
      newCat: 'e.g. Baby, Pets', catHint: 'Make your own categories, like Baby for nappies, wipes and baby food.'
    },
    travel: {
      done: 'Packed', clear: 'Unpack All', doneHint: 'Tap an item to unpack it.',
      allDone: ['🏝️', 'All packed!', 'Have a great trip.'],
      empty: ['🧳', 'Nothing to pack yet', 'Tap ＋ Add item to start packing.'],
      placeholder: 'Add item, e.g. passport', tap: 'Packed: ', untap: 'Unpack: ',
      tip: 'Tip: press and hold an item to change its amount or category.',
      newCat: 'e.g. Camping, Kids', catHint: 'Make your own packing categories, like Camping for the tent and sleeping bags.'
    }
  };

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

  // ================= Quantities =================
  // Understands "2x milk", "milk 2x", "500 g chicken", "Salmon - 300g", "1 1/2 cups flour",
  // "2–3 cloves garlic", "1 can (400 ml) coconut milk", "a pinch of salt", "2 łyżki oliwy"…
  var FRAC = '½¼¾⅓⅔⅛';
  var NUM_RE = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s?[' + FRAC + ']?|[' + FRAC + '])';
  var RANGE_RE = NUM_RE + '(?:\\s*(?:-|–|—|to|or|do)\\s*' + NUM_RE + ')?';
  var UNIT_CANON = {
    tbsp: 'tablespoons tablespoon tbsps tbsp tbs tbl łyżki łyżka łyżek lyzki lyzka lyzek',
    tsp: 'teaspoons teaspoon tsps tsp łyżeczki łyżeczka łyżeczek lyzeczki lyzeczka lyzeczek',
    kg: 'kilograms kilogram kilos kilo kg',
    g: 'grams gram gr g',
    dag: 'dag dkg',
    ml: 'milliliters millilitres milliliter millilitre ml',
    l: 'liters litres liter litre l',
    oz: 'ounces ounce oz',
    lb: 'pounds pound lbs lb',
    x: 'x ×',
    pcs: 'pieces piece pcs pc szt sztuki sztuka sztuk'
  };
  var OTHER_UNITS = 'cups cup pinches pinch dashes dash cloves clove cans can tins tin jars jar packs pack packets packet packages package bunches bunch handfuls handful slices slice stalks stalk sprigs sprig heads head sticks stick sheets sheet bottles bottle bags bag boxes box knobs knob drops drop szklanki szklanka szklanek szczypta szczypty ząbki ząbek ząbków puszka puszki puszek opakowanie opakowania garść garści pęczek pęczki plaster plastry plasterki kostka kostki arkusz arkusze arkuszy arkuszach listek listki listków płat płaty płatów';
  var unitMap = {};
  Object.keys(UNIT_CANON).forEach(function (c) { UNIT_CANON[c].split(' ').forEach(function (u) { unitMap[u] = c; }); });
  OTHER_UNITS.split(' ').forEach(function (u) { unitMap[u] = u; });
  var UNIT_RE = '(?:' + Object.keys(unitMap).sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\.?(?![\\p{L}])';
  var LEAD = new RegExp('^(' + RANGE_RE + ')(?:\\s*(' + UNIT_RE + '))?(?:\\s*\\(([^)]*\\d[^)]*)\\))?\\s+(?:of\\s+)?(.+)$', 'iu');
  var LEAD_A = new RegExp('^(?:a|an|one)\\s+(' + UNIT_RE + ')\\s+(?:of\\s+)?(.+)$', 'iu');
  var LEAD_UNIT = new RegExp('^(' + UNIT_RE + ')\\s+(?:of\\s+)?(.+)$', 'iu');
  var UNIT_OF = new RegExp('^(' + UNIT_RE + ')\\s+of\\s+(.+)$', 'iu');
  var TRAIL = new RegExp('^(.+?)(?:\\s*[-–—:,]\\s*|\\s+)\\(?(' + RANGE_RE + ')(?:\\s*(' + UNIT_RE + '))?\\)?$', 'iu');
  var TRAIL_X = /^(.+?)\s+[x×]\s*(\d+)$/i;
  var ONLY_QTY = new RegExp('^(' + RANGE_RE + ')(?:\\s*(' + UNIT_RE + '))?$', 'iu');
  var SLASH_ALT = new RegExp('^(' + NUM_RE + '\\s*' + UNIT_RE + ')\\s*\\/\\s*' + NUM_RE + '\\s*' + UNIT_RE, 'iu');
  var METRIC = { g: 1, kg: 1, ml: 1, l: 1, dag: 1, x: 1 };

  function canonUnit(u) { u = u.toLowerCase().replace(/\.$/, ''); return unitMap[u] || u; }
  function fmtQty(num, unit, paren) {
    var q = String(num).replace(/\s*(?:-|–|—|\bto\b|\bor\b|\bdo\b)\s*/i, '–').replace(/(\d)\s+([½¼¾⅓⅔⅛])/, '$1$2').trim();
    if (unit) { var u = canonUnit(unit); q += (METRIC[u] ? '' : ' ') + u; }
    if (paren) q += ' (' + paren.trim() + ')';
    return q;
  }
  function splitQty(text) {
    var t = String(text || '').trim().replace(/\s+/g, ' ');
    var qty = '', m, guard = 0;
    while (guard++ < 3) {
      if ((m = t.match(LEAD))) { qty = (qty ? qty + ' ' : '') + fmtQty(m[1], m[2], m[3]); t = m[4].trim(); continue; }
      if (!qty && (m = t.match(LEAD_A))) { qty = fmtQty('1', m[1]); t = m[2].trim(); continue; }
      break;
    }
    if (qty && (m = t.match(LEAD_UNIT))) { qty += ' ' + canonUnit(m[1]); t = m[2].trim(); } // "2x 400g cans tomatoes"
    if (!qty && (m = t.match(UNIT_OF))) { qty = '1 ' + canonUnit(m[1]); t = m[2].trim(); }    // "Pinch of salt"
    if (!qty && (m = t.match(TRAIL))) { qty = fmtQty(m[2], m[3]); t = m[1].trim(); }
    if (!qty && (m = t.match(TRAIL_X))) { qty = m[2] + 'x'; t = m[1].trim(); }
    return { qty: qty, name: t };
  }
  // The add box: a pasted "• milk 2x" loses its bullet (a leading number stays, it's the amount).
  function parseQty(text) {
    var t = String(text || '');
    return splitQty(/^\s*\d/.test(t) ? t : t.replace(BULLET_RE, ''));
  }

  // ================= Reading one ingredient line =================
  var PREP_WORDS = ('finely roughly thinly freshly coarsely very chopped diced sliced grated shredded crushed peeled deseeded seeded ' +
    'pitted halved quartered softened melted beaten cooked uncooked raw fresh boneless skinless ripe large medium small big ' +
    'extra-large heaped heaping level rounded generous good quality good-quality organic about approx approximately around ' +
    'chilled cold trimmed washed drained rinsed torn picked ' +
    'pokrojony pokrojona pokrojone pokrojonych posiekany posiekana posiekane posiekanej drobno grubo cienko ' +
    'starty starta starte startego obrany obrana obrane umyty umyta umyte ugotowany ugotowana ugotowane ' +
    'roztopiony roztopiona roztopione świeży świeża świeże świeżo duży duża duże mały mała małe średni średnia średnie').split(' ');
  var NOTE_RE = /\s*\b(to taste|as needed|as required|if needed|for serving|to serve|for garnish|to garnish|for decoration|for topping|for frying|for greasing|for brushing|for dusting|optional|plus extra|plus more|or more|divided|at room temperature|room temperature|or to taste|according to taste|do smaku|opcjonalnie|do podania|do dekoracji|do smażenia)\b.*$/i;

  // List markers copied along with the text: symbols, checkboxes, "1." and the
  // word "bullet" that some sites and apps paste in place of the dot.
  var BULLET_RE = /^\s*(?:(?:bullet(?:\s*point)?s?(?=[\s:.]|$)[\s:.]*)|[-–—‐‑‒―•‣⁃∙⦁·*+~>»›▪▫■□◦○●◉◎◆◇❖►▸▶▹▷➤➢➔→⇒✓✔✗✘☐☑☒▢❏❑❒✦✧♦◘◙ ‣]+\s*|\[[ xX]?\]\s*|\d+[.)]\s+|\d+[.)](?=[A-Za-zÀ-ž]))+/i;

  function cleanLine(l) {
    return String(l || '')
      .replace(BULLET_RE, '')
      .replace(/^#+\s*/, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  }

  function stripPrep(name) {
    var words = name.split(' ');
    while (words.length > 1) {
      var whole = aliasMap[norm(words.join(' '))];
      // "chopped tomatoes", "smoked salmon" are products of their own; "large eggs" are just eggs
      if (whole && whole !== aliasMap[norm(words.slice(1).join(' '))]) break;
      var w = words[0].toLowerCase().replace(/[,.]$/, '');
      if (w === 'a' || w === 'an' || w === 'of') { words.shift(); continue; }
      if (w === 'minced' && /^(beef|pork|turkey|chicken|lamb|meat)/i.test(words[1])) break;
      if (w === 'minced' || PREP_WORDS.indexOf(w) !== -1) { words.shift(); continue; }
      break;
    }
    while (words.length > 1) {
      var last = words[words.length - 1].toLowerCase();
      if (last === 'minced' || PREP_WORDS.indexOf(last) !== -1) words.pop(); else break;
    }
    return words.join(' ');
  }

  // Splits "milk, eggs; bread" at commas/semicolons, but not inside brackets
  // ("1 can (400 ml, drained)") or between digits ("1,5 kg").
  function splitTopLevel(t) {
    var out = [], cur = '', depth = 0;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === '(' || ch === '[') depth++;
      else if ((ch === ')' || ch === ']') && depth) depth--;
      if (!depth && (ch === ';' || (ch === ',' && !(/\d/.test(t[i - 1] || '') && /\d/.test(t[i + 1] || ''))))) {
        out.push(cur); cur = ''; continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // After a comma: "finely chopped", "to taste", "drained", "500g" describe the item before it;
  // "eggs", "2 onions", "za'atar" are items of their own.
  var NOTE_START = ('to for or and plus about approx approximately around ca roughly at in into cut such see if ' +
    'with without juice zest only optional divided preferably ideally e.g. eg i.e. ie w bez lub albo').split(' ');
  // "finely", "sliced", "toasted", "minced": words that describe how something is prepared
  function isPrepWord(w) {
    w = String(w || '').toLowerCase().replace(/[^\p{L}-]/gu, '');
    return PREP_WORDS.indexOf(w) !== -1 || w === 'minced' || /ly$/.test(w) || (w.length > 4 && /ed$/.test(w) && !/seed$/.test(w));
  }
  function isNoteChunk(c) {
    var t = c.replace(/^\s*(about|approx\.?|approximately|around|ca\.?|roughly)\s+/i, '');
    if (ONLY_QTY.test(t)) return true;
    if (splitQty(c).qty) return false;
    if (aliasMap[norm(c)]) return false;
    if (/^\s*(\w+\s*)?(to taste|as needed|as required|if needed|for serving|to serve|for garnish|optional|do smaku|opcjonalnie)\b/i.test(c)) return true;
    var words = c.trim().split(/\s+/);
    var first = words[0].toLowerCase().replace(/[^\p{L}.]/gu, '');
    if (NOTE_START.indexOf(first) !== -1) return true;
    if (isPrepWord(first)) {
      // "finely chopped", "peeled and grated", "soaked in water" describe the item before;
      // "shredded nori", "toasted sesame seeds", "sliced green onions" are items of their own.
      while (words.length && (isPrepWord(words[0]) || /^(and|&)$/i.test(words[0]))) words.shift();
      if (!words.length || NOTE_START.indexOf(words[0].toLowerCase()) !== -1) return true;
      return !matchEntry(norm(words.join(' ')));
    }
    // "skin removed", "hard boiled", "toasted": a short description that ends with how it's prepared
    return words.length <= 3 && isPrepWord(words[words.length - 1]);
  }
  function allPrep(c) {
    var n = splitQty(c).name;
    return !!n && n.split(' ').every(function (w) { return PREP_WORDS.indexOf(w.toLowerCase()) !== -1; });
  }

  // "2 garlic cloves, finely chopped" → [{ name: "Garlic cloves", qty: "2" }]
  // "salt, pepper, olive oil"        → three items
  function parseIngredient(raw) {
    var t = cleanLine(raw).replace(SLASH_ALT, '$1');
    if (!t) return [];
    // "Sauce: soy sauce, honey, garlic", "Garnish: nori strips" — a label in front of the items
    // (but "Rice: 2 cups, cooked" is an item followed by its amount)
    var lm = t.match(/^([^:\d]{1,30}):\s*(.+)$/);
    if (lm && wordCount(lm[1]) <= 3 && !aliasMap[norm(lm[1])] && !ONLY_QTY.test(splitTopLevel(lm[2])[0] || '')) {
      var groupLabel = SUB_HEAD_RE.test(lm[1].trim()) || /^(for|to|do|na)\s/i.test(lm[1].trim());
      if (groupLabel || splitTopLevel(lm[2]).length > 1) t = lm[2];
    }
    var chunks = splitTopLevel(t);
    // "boneless, skinless chicken thighs": the first part is only a description, keep going
    while (chunks.length > 1 && allPrep(chunks[0])) chunks.splice(0, 2, chunks[0] + ' ' + chunks[1]);
    var out = [];
    chunks.forEach(function (c, i) {
      if (i > 0 && isNoteChunk(c)) {
        var last = out[out.length - 1];
        var pm = c.replace(/^\s*(about|approx\.?|approximately|around|ca\.?|roughly)\s+/i, '').match(ONLY_QTY);
        if (last && !last.qty && pm) last.qty = fmtQty(pm[1], pm[2]);
        return;
      }
      out = out.concat(parseOne(c));
    });
    return out;
  }

  function parseOne(t) {
    var jm = t.match(/^(?:the\s+)?(?:juice|zest|juice and zest|zest and juice)\s+(?:of\s+)?(\d+|a|an|one|half|½)\s+(.+)$/i);
    if (jm) t = (/^\d+$/.test(jm[1]) ? jm[1] : /half|½/i.test(jm[1]) ? '½' : '1') + ' ' + jm[2];
    var s = splitQty(t);
    var qty = s.qty;
    var name = s.name.replace(/\(([^)]*)\)/g, function (_, inner) {
      if (!qty && /\d/.test(inner)) qty = inner.trim();
      return ' ';
    });
    var parts = name.split(/\s+[-–—]\s+/);
    name = parts[0];
    if (!qty && parts[1]) {
      var pm = parts[1].trim().match(ONLY_QTY);
      if (pm) qty = fmtQty(pm[1], pm[2]);
    }
    name = name.replace(/^\s*(optional|opcjonalnie)\s*:?\s+/i, ''); // "Optional nori" is nori
    name = name.replace(NOTE_RE, '').split(/\s+(?:or|lub|albo)\s+/i)[0];
    name = stripPrep(name.replace(/\s+/g, ' ').trim());
    name = name.replace(/^[\s.,:;*\-–—]+|[\s.,:;*\-–—]+$/g, '').trim();
    if (name.length < 2) {
      // too little left after cleaning (e.g. "1 (optional)"): keep the line as typed
      var fallback = t.replace(/^[\s.,:;*\-–—]+|[\s.,:;*\-–—]+$/g, '').trim();
      return fallback.length >= 2 && fallback !== qty ? [{ name: cap(fallback).slice(0, 60), qty: '' }] : [];
    }
    if (/^(sea\s+)?salt\s*(and|&|\+)\s*(black\s+)?pepper$|^s[oó]l\s*(i|&)\s*pieprz$/i.test(name)) {
      return [{ name: 'Salt', qty: '' }, { name: 'Black pepper', qty: '' }];
    }
    // "Sesame seeds and nori", "2 onions & 3 carrots": two things to buy.
    // ("Sweet and sour sauce", "Mac and cheese" stay as one.)
    var pair = aliasMap[norm(name)] ? [] : name.split(/\s+(?:and|&|\+|i)\s+/i);
    if (pair.length === 2) {
      var both = pair.map(function (p, i) {
        var ps = splitQty(p);
        var n = stripPrep(ps.name);
        return aliasMap[norm(n)] ? { name: cap(n).slice(0, 60), qty: ps.qty || (i === 0 ? qty : '') } : null;
      });
      if (both[0] && both[1]) return both;
    }
    return [{ name: cap(name).slice(0, 60), qty: qty }];
  }

  // ================= Reading a whole pasted recipe =================
  var STEP_WORDS = ('add heat cook stir mix combine place put bake boil bring pour serve preheat season whisk fry saute sauté cut ' +
    'remove transfer let leave simmer drain rinse wash top garnish sprinkle divide arrange spread roll fold blend marinate ' +
    'meanwhile repeat enjoy set cover reduce toss return using use once when while then next finally first start make prepare ' +
    'grill roast steam soak cool chill refrigerate squeeze scatter slice chop dice peel grate mash knead shape line grease spoon ' +
    'ladle assemble store keep you this these it if we my our your in on into at after before until during wait check taste ' +
    'adjust allow turn flip continue finish note tip dodaj wymieszaj gotuj smaż pokrój podawaj piecz wlej rozgrzej ugotuj ' +
    'odcedź posyp przełóż wstaw obierz umyj').split(' ');
  // Recipe-page details like "Serves 4", "Prep time: 10 min", "Print recipe" (but not "Cooking spray" or "Diet cola").
  var META_RE = /^(prep|preparation|cook|cooking|total|active|ready in|portions?|porcje|porcji|liczba porcji|calories|kcal|difficulty|course|cuisine|author|rating|ratings|reviews?|nutrition|czas|kalorie|trudność|keywords?|diet|equipment|published|updated)(\s+time)?\s*(:|\d|$)|^(serves|servings?|yield|makes)\b|^(print|pin|save|jump to|share)(\s+(this\s+)?recipe)?$|^by\s+\S+(\s+\S+){0,2}$|^\d+\s*(min|mins|minutes|minut|hours?|hrs?|h|godz)\b|\b\d+\s*(min|mins|minutes|minut)\.?$|^https?:|www\.|[★☆]|^\d+(\.\d+)?\s*(from|out of|\/)\s*\d+(\.\d+)?\s*(stars?|votes?|ratings?|reviews?|\(.*\))?$|^\d+\s*(votes|reviews|comments|ratings)/i;
  var ING_HEAD_RE = /^(ingredients?|ingredient list|składniki|what you('|’)?ll need|what you need|you('|’)?ll need|you will need|shopping list|lista zakupów)\b/i;
  var END_HEAD_RE = /^(method|instructions?|directions?|steps?|preparation(?!\s+time)|how to (make|cook|prepare)( it)?|przygotowanie|sposób przygotowania|wykonanie|notes?|recipe notes|tips?|nutrition|nutritional info(rmation)?|serving suggestions?|equipment|video|storage|faq|comments?|related recipes|you may also like)\b/i;

  function wordCount(t) { return String(t).split(/\s+/).filter(Boolean).length; }
  function headText(t) { return String(t).replace(/^[#*\s]+|[:：*#=_\s]+$/g, '').trim(); }
  function isIngHeader(t) { var h = headText(cleanLine(t)); return wordCount(h) <= 6 && ING_HEAD_RE.test(h); }
  function isEndHeader(t) { var h = headText(cleanLine(t)); return wordCount(h) <= 6 && END_HEAD_RE.test(h); }
  // Group names inside an ingredient list, often written without a colon: "Toppings", "To serve".
  var SUB_HEAD_RE = /^(optional\s+)?(toppings?|garnish(es)?|to (serve|garnish|finish|assemble|decorate)|serving|optional|extras|add-?ins|sauce|dressing|marinade|filling|glaze|assembly|dodatki|do podania|opcjonalnie|sos|marynata|nadzienie|farsz|posypka)(\s*\((optional|opcjonalnie)\))?$/i;
  function isSubHeader(t) {
    if (splitQty(t).qty) return false;
    if (/:\s*$/.test(t) && wordCount(t) <= 6) return true;
    if (SUB_HEAD_RE.test(headText(t))) return true;
    return /^(for|do|na)\s+(the\s+)?[\p{L}\s-]+$/iu.test(t) && wordCount(t) <= 5;
  }
  function isStepLike(raw, asTitle) {
    var s = String(raw).replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+[.)])\s*/i, '');
    var numbered = s !== String(raw).trim();
    var first = (s.toLowerCase().match(/^[\p{L}']+/u) || [''])[0];
    var wc = wordCount(s);
    if (STEP_WORDS.indexOf(first) !== -1 && !(asTitle && wc <= 3)) return true; // "Stir fry" can be a dish name
    if (wc > 12) return true;
    if (/[.!?]$/.test(s) && wc > 5) return true;
    if (numbered && wc > 6 && !splitQty(s).qty) return true;
    return /\b(minutes|until|degrees|°c|°f|oven|frying pan|skillet|saucepan)\b/i.test(s) && wc > 5;
  }
  function isTitleLike(t) {
    var h = headText(cleanLine(t));
    if (h.length < 2 || wordCount(h) > 10 || /[.!?]$/.test(h)) return false;
    if (META_RE.test(h) || isIngHeader(h) || isEndHeader(h) || isStepLike(h, true) || splitQty(h).qty) return false;
    return !/^(recipe|print recipe|jump to recipe|save recipe|pin recipe|home)$/i.test(h);
  }

  function isHeaderLine(t) {
    t = cleanLine(t);
    return !t || isIngHeader(t) || isEndHeader(t) || isSubHeader(t) || META_RE.test(t);
  }
  // "1 sheet nori, cut into strips with scissors or crumbled by hand." is still an ingredient:
  // it starts with an amount or a known item, and the long part after the comma is only a note.
  function startsLikeIngredient(t) {
    var first = (splitTopLevel(t)[0] || '').replace(/[.!?]+$/, '');
    if (!first || wordCount(first) > 6 || META_RE.test(first)) return false;
    var fw = (first.toLowerCase().match(/^[\p{L}']+/u) || [''])[0];
    if (STEP_WORDS.indexOf(fw) !== -1) return false;
    var s = splitQty(first);
    if (s.qty) return true;
    var name = stripPrep(s.name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
    return wordCount(name) <= 3 && !!matchEntry(norm(name));
  }
  // A full sentence (a note or a cooking step), not something to buy.
  function isSentence(t) {
    var wc = wordCount(t);
    if (wc <= 40 && startsLikeIngredient(t)) return false;
    if (wc > 14 || (/[.!?]$/.test(t) && wc > 6)) return true;
    // "Serve hot." — a short step ending with a full stop
    return /[.!?]$/.test(t) && wc > 1 && STEP_WORDS.indexOf((t.toLowerCase().match(/^[\p{L}']+/u) || [''])[0]) !== -1;
  }

  // null = not an ingredient line (a header, recipe details, a cooking step).
  // Every other line is kept, whether or not the app knows the item —
  // unknown items simply land in "Other".
  // inList: the line sits in an ingredient list, so only headers and sentences are skipped;
  // otherwise (free text with no headings) lines that read like cooking steps are skipped too.
  function ingredientFrom(line, inList) {
    var t = cleanLine(line);
    if (isHeaderLine(t)) return null;
    if (inList ? isSentence(t) : isStepLike(t)) return null;
    return parseIngredient(t);
  }

  function finishDishes(dishes) {
    return dishes.map(function (d) {
      var seen = {}, items = [];
      d.items.forEach(function (i) {
        var k = norm(niceName(i.name));
        if (!k) return;
        if (seen[k]) {
          if (i.qty) seen[k].qty = seen[k].qty ? seen[k].qty + ' + ' + i.qty : i.qty;
          return;
        }
        seen[k] = { name: i.name, qty: i.qty || '' };
        items.push(seen[k]);
      });
      return { name: d.name, items: items, from: d.from || '' };
    }).filter(function (d) { return d.items.length; });
  }

  // "Salmon Donburi (Japanese Salmon Rice Bowl) | Food Blog" → "Salmon Donburi"
  function dishTitle(t) {
    var s = headText(cleanLine(t || 'Recipe')).replace(/\s*[|•–—]\s.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return cap(s).slice(0, 60) || 'Recipe';
  }

  // Recipes with an "Ingredients" heading: only that section is read.
  var SECTION_BREAK = {};
  function sectionMode(lines) {
    var dishes = [], cur = null, inSection = false, before = [];
    lines.forEach(function (l) {
      if (!l) return;
      if (isIngHeader(l)) {
        if (!(inSection && cur)) {
          // The dish name comes before any "Equipment" or "Notes" block that sits above the ingredients.
          var cut = before.indexOf(SECTION_BREAK);
          var titles = (cut === -1 ? before : before.slice(0, cut)).filter(isTitleLike);
          if (!titles.length) titles = before.filter(function (b) { return b !== SECTION_BREAK && isTitleLike(b); });
          cur = { name: dishTitle(dishes.length ? titles[titles.length - 1] : titles[0]), items: [] };
          dishes.push(cur);
        }
        inSection = true;
        before = [];
        return;
      }
      if (isEndHeader(l)) {
        if (inSection) before = []; // the method starts: the next dish name comes after it
        else before.push(SECTION_BREAK);
        inSection = false;
        return;
      }
      if (inSection) {
        var got = ingredientFrom(l, true);
        if (got) cur.items = cur.items.concat(got);
      } else {
        before.push(l);
      }
    });
    return finishDishes(dishes);
  }

  // Simple lists: dish name, then one ingredient per line (blank line between dishes).
  function simpleMode(lines) {
    var blocks = [], b = [];
    lines.forEach(function (l) { if (l) b.push(l); else if (b.length) { blocks.push(b); b = []; } });
    if (b.length) blocks.push(b);
    var dishes = [];
    for (var i = 0; i < blocks.length; i++) {
      var bl = blocks[i], start = 0, dish;
      // "milk" on the first line is an item, not the name of a dish
      var titled = bl.length > 1 && isTitleLike(bl[0]) && !aliasMap[norm(cleanLine(bl[0]))] && splitTopLevel(cleanLine(bl[0])).length === 1;
      if (titled) { dish = { name: dishTitle(bl[0]), items: [] }; dishes.push(dish); start = 1; }
      else if (dishes.length) dish = dishes[dishes.length - 1];
      else { dish = { name: 'Recipe', items: [] }; dishes.push(dish); }
      for (var j = start; j < bl.length; j++) {
        if (isEndHeader(bl[j])) return null; // "Instructions:" follows: read it as a full recipe
        var got = ingredientFrom(bl[j], true);
        if (got === null) {
          if (isHeaderLine(bl[j])) continue; // "For the sauce:" between ingredients
          return null;                       // a cooking step: this isn't a simple list
        }
        dish.items = dish.items.concat(got);
      }
    }
    return finishDishes(dishes);
  }

  // Anything else: keep every line except headers, recipe details and cooking steps.
  function looseMode(lines) {
    var title = null, items = [], ended = false;
    lines.forEach(function (l) {
      if (!l || ended) return;
      if (isEndHeader(l)) { ended = items.length > 0; return; } // "Instructions:" — the rest is the method
      if (!items.length && !title && isTitleLike(l) && !aliasMap[norm(cleanLine(l))] && splitTopLevel(cleanLine(l)).length === 1) { title = l; return; }
      var got = ingredientFrom(l, false);
      if (got) items = items.concat(got);
    });
    return finishDishes([{ name: dishTitle(title), items: items }]);
  }

  function parseRecipeText(text) {
    var lines = String(text).replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n').map(function (l) {
      return l.replace(/[\t\u00A0\u2007\u202F\u200B\uFEFF]/g, ' ').trim();
    }).filter(function (l) {
      return !l || cleanLine(l); // a bullet on its own line ("•" then the ingredient below) is dropped
    });
    if (lines.some(isIngHeader)) return sectionMode(lines);
    return simpleMode(lines) || looseMode(lines);
  }

  // ================= Catalog index =================
  function buildIndex(catalog) {
    var idx = { entries: [], aliasMap: {} };
    Object.keys(catalog).forEach(function (cat) {
      catalog[cat].forEach(function (line) {
        var p = line.split('|');
        var e = { icon: p[0], name: p[1], category: cat, key: norm(p[1]), aliases: [] };
        [p[1]].concat(p[2] ? p[2].split(',') : []).forEach(function (a) {
          var k = norm(a);
          if (!k) return;
          e.aliases.push(k);
          if (!idx.aliasMap[k]) idx.aliasMap[k] = e;
        });
        idx.entries.push(e);
      });
    });
    return idx;
  }
  var GROCERY_INDEX = buildIndex(CATALOG);
  var TRAVEL_INDEX = buildIndex(TRAVEL_CATALOG);
  var aliasMap = GROCERY_INDEX.aliasMap; // the recipe reader only knows groceries
  function indexFor(kind) { return kind === 'travel' ? TRAVEL_INDEX : GROCERY_INDEX; }

  // Finds the best catalog item inside a name: "salmon fillet" → Salmon,
  // "chicken broth" → Stock (the last word usually says what it is).
  function matchEntry(k, kind) {
    if (!k) return null;
    var map = indexFor(kind).aliasMap;
    if (map[k]) return map[k];
    var w = k.split(' '), best = null, score = -1;
    for (var i = 0; i < w.length; i++) {
      for (var j = i + 1; j <= w.length; j++) {
        var e = map[w.slice(i, j).join(' ')];
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
      counts: {},  // how often you added each item
      travel: blankTravel() // the same three things, for packing lists
    };
  }
  function blankTravel() { return { customCats: [], learned: {}, counts: {} }; }

  function load() {
    var d = read(KEY, null);
    if (d && d.v === 2 && Array.isArray(d.items) && Array.isArray(d.lists)) {
      d.customCats = Array.isArray(d.customCats) ? d.customCats : [];
      d.learned = d.learned || {};
      d.counts = d.counts || {};
      if (!d.lists.some(function (l) { return l.id === 'main'; })) d.lists.unshift(blankData().lists[0]);
      var firstTime = !d.travel;
      d.travel = d.travel || blankTravel();
      d.travel.customCats = Array.isArray(d.travel.customCats) ? d.travel.customCats : [];
      d.travel.learned = d.travel.learned || {};
      d.travel.counts = d.travel.counts || {};
      if (firstTime) {
        // Lists you already made for a trip become packing lists.
        data = d;
        d.lists.forEach(function (l) { if (l.type === 'custom' && looksLikeTrip(l.name)) setKind(l, 'travel'); });
        write(KEY, d);
      }
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
  // kind is 'grocery' (the default) or 'travel'. Each has its own categories,
  // ready-made items, corrections and frequent items.
  function memory(kind) { return kind === 'travel' ? data.travel : data; }
  function builtIn(kind) { return kind === 'travel' ? TRAVEL_CATS : BUILT_IN; }
  function allCats(kind) {
    return builtIn(kind).concat(memory(kind).customCats.map(function (n) {
      return { name: n, icon: CUSTOM_STYLE.icon, h: CUSTOM_STYLE.h, s: CUSTOM_STYLE.s, custom: true };
    }));
  }
  function hasCat(name, kind) { return allCats(kind).some(function (c) { return c.name === name; }); }
  function catInfo(name, kind) {
    var b = builtIn(kind);
    return allCats(kind).find(function (c) { return c.name === name; }) || b[b.length - 1];
  }
  function tint(ci) { return '--h:' + ci.h + ';--s:' + ci.s; }

  // Singular "pepper" in a recipe means black pepper; "peppers" means bell peppers.
  var RAW_OVERRIDES = { pepper: 'black pepper', pieprz: 'black pepper' };
  function rawOverride(name, kind) {
    return kind === 'travel' ? null : RAW_OVERRIDES[String(name || '').trim().toLowerCase()];
  }
  function entryFor(name, kind) {
    var o = rawOverride(name, kind);
    if (o) return aliasMap[norm(o)];
    return matchEntry(norm(name), kind);
  }
  function detectCategory(name, kind) {
    var k = norm(name);
    var mem = memory(kind);
    if (mem.learned[k] && hasCat(mem.learned[k], kind)) return mem.learned[k];
    var c = mem.counts[k];
    if (c && c.category && hasCat(c.category, kind)) return c.category;
    var e = entryFor(name, kind);
    return e ? e.category : 'Other';
  }
  function iconFor(name, category, kind) {
    var k = norm(name);
    var map = indexFor(kind).aliasMap;
    if (map[k] && !rawOverride(name, kind)) return map[k].icon;
    var e = entryFor(name, kind);
    if (e && e.category === category) return e.icon;
    return catInfo(category, kind).icon;
  }
  // "egg" → "Eggs", but "chicken breast" stays as you typed it.
  function niceName(raw, kind) {
    var k = norm(raw);
    var e = indexFor(kind).aliasMap[k];
    return e && e.key === k ? e.name : cap(raw);
  }
  function learn(name, category, kind) {
    var k = norm(name);
    var mem = memory(kind);
    mem.learned[k] = category;
    if (mem.counts[k]) mem.counts[k].category = category;
  }

  function addCustomCategory(raw, kind) {
    var name = cap(String(raw || '').slice(0, 30));
    if (!name) return null;
    var found = allCats(kind).find(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
    if (found) return found.name;
    memory(kind).customCats.push(name);
    save();
    return name;
  }
  function removeCustomCategory(name, kind) {
    var mem = memory(kind);
    var items = data.items.filter(function (i) { return i.category === name && kindOf(listById(i.listId)) === kind; });
    if (!confirm('Remove “' + name + '”?' + (items.length ? ' Its ' + items.length + ' item(s) will move to Other.' : ''))) return false;
    mem.customCats = mem.customCats.filter(function (c) { return c !== name; });
    items.forEach(function (i) { i.category = 'Other'; });
    Object.keys(mem.learned).forEach(function (k) { if (mem.learned[k] === name) delete mem.learned[k]; });
    Object.keys(mem.counts).forEach(function (k) { if (mem.counts[k].category === name) mem.counts[k].category = 'Other'; });
    save();
    renderMain();
    return true;
  }

  // ================= Lists =================
  function currentList() {
    return data.lists.find(function (l) { return l.id === currentId; }) || data.lists[0];
  }
  function listById(id) { return data.lists.find(function (l) { return l.id === id; }); }
  function listItems(list) { return data.items.filter(function (i) { return i.listId === list.id; }); }
  function kindOf(list) { return list && list.type === 'travel' ? 'travel' : 'grocery'; }
  function words(list) { return WORDS[kindOf(list)]; }
  // Store tabs are for shopping lists only (not recipes or packing lists).
  function usesStores(list) { return list.type !== 'recipe' && list.type !== 'travel'; }
  function looksLikeTrip(name) {
    var trip = TRIP_WORDS.split(' ');
    return norm(name).split(' ').some(function (w) { return trip.indexOf(w) !== -1; });
  }
  // Turns your own list into a packing list or back into a shopping list,
  // moving its items into the matching categories.
  function setKind(list, kind) {
    var from = kindOf(list);
    list.type = kind === 'travel' ? 'travel' : 'custom';
    if (from === kind) return;
    listItems(list).forEach(function (i) {
      var c = detectCategory(i.name, kind);
      // Not recognised: keep it in your own category, if it was in one.
      if (c === 'Other' && memory(from).customCats.indexOf(i.category) !== -1) c = addCustomCategory(i.category, kind);
      i.category = c;
    });
  }
  function matchesFilter(item, list, f) {
    if (!usesStores(list)) return true;
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
  function listIcon(l) { return l.type === 'main' ? '🛒' : l.type === 'recipe' ? '🍽️' : l.type === 'travel' ? '🧳' : '📝'; }

  // ================= Item actions =================
  function addItem(o) {
    var list = o.list || currentList();
    var kind = kindOf(list);
    var existing = findOnList(o.name, list);
    var store = o.store != null ? o.store : (usesStores(list) && filter !== 'All' ? filter : '');
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
      if (!o.silent) toast('Added ' + iconFor(o.name, o.category, kind) + ' ' + o.name);
    }
    if (o.manual) {
      var k = norm(o.name);
      var counts = memory(kind).counts;
      var c = counts[k] || { n: 0 };
      c.name = o.name; c.n += 1; c.category = o.category; c.last = Date.now();
      counts[k] = c;
    }
    save();
    renderMain();
  }

  function toggleItem(id) {
    var item = data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    item.inCart = !item.inCart;
    var type = currentList().type;
    if (item.inCart) item.cartAt = Date.now();
    else if (type !== 'recipe' && type !== 'travel') item.addedAt = Date.now(); // unpacked items go back to their spot
    save();
    renderMain();
  }

  // Packing lists are kept for the next trip: this puts everything back on the list.
  function unpackAll(list) {
    var packed = listItems(list).filter(function (i) { return i.inCart; });
    if (!packed.length) return;
    packed.forEach(function (i) { i.inCart = false; });
    save();
    renderMain();
    toast('Unpacked ' + packed.length + ' item' + (packed.length === 1 ? '' : 's') + ', ready for the next trip', 'Undo', function () {
      packed.forEach(function (i) { i.inCart = true; });
      save();
      renderMain();
    });
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
    storesNav.hidden = !usesStores(list);
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

  // One line on the list: ○ Turkey breast 🦃 ........ 500g
  function itemRow(item, list) {
    var kind = kindOf(list);
    var ci = catInfo(item.category, kind);
    var b = el('button', {
      type: 'button', class: 'row' + (item.inCart ? ' done' : ''), style: tint(ci),
      'aria-label': (item.inCart ? words(list).untap : words(list).tap) + item.name + (item.qty ? ', ' + item.qty : '')
    }, [
      el('span', { class: 'check', 'aria-hidden': 'true' }),
      el('span', { class: 'row-main' }, [
        el('span', { class: 'row-line' }, [
          el('span', { class: 'row-name', text: item.name }),
          el('span', { class: 'row-emoji', 'aria-hidden': 'true', text: iconFor(item.name, item.category, kind) })
        ]),
        item.store && usesStores(list) ? el('span', { class: 'row-store', text: item.store }) : null
      ]),
      item.qty ? el('span', { class: 'row-qty', text: item.qty }) : null
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
        el('div', { class: 'dish-text' }, [el('h2', { text: list.name }), el('p', { text: sub })]),
        items.length ? el('button', {
          type: 'button', class: 'pill-btn accent dish-send', text: '🛒 Add All to Groceries',
          onclick: function () { addAllToMain(list); }
        }) : null
      ]));
    }

    // Shopping lists (recipes included) are grouped by grocery category, packing lists by travel category.
    var kind = kindOf(list);
    var w = words(list);
    allCats(kind).forEach(function (c) {
      var group = active.filter(function (i) {
        return (hasCat(i.category, kind) ? i.category : 'Other') === c.name;
      }).sort(function (a, b) { return a.addedAt - b.addedAt; });
      if (!group.length) return;
      content.append(el('section', { class: 'group' }, [
        el('h3', { class: 'group-title' }, [c.icon + ' ' + c.name, el('span', { class: 'group-count', text: String(group.length) })]),
        el('div', { class: 'rows' }, group.map(function (i) { return itemRow(i, list); }))
      ]));
    });

    if (!active.length) {
      var anyInCart = items.some(function (i) { return i.inCart && matchesFilter(i, list); });
      var msg = anyInCart ? w.allDone : w.empty;
      content.append(el('div', { class: 'empty' }, [
        el('div', { class: 'empty-icon', text: msg[0] }), el('p', { class: 'empty-title', text: msg[1] }), el('p', { text: msg[2] })
      ]));
    }
    tipEl.textContent = w.tip;
    tipEl.hidden = !active.length || !!read(TIP_KEY, false);
  }

  function renderCart() {
    var list = currentList();
    var w = words(list);
    var cart = listItems(list).filter(function (i) { return i.inCart && matchesFilter(i, list); })
      .sort(function (a, b) { return b.cartAt - a.cartAt; });
    cartSection.hidden = !cart.length;
    $('cart-title').textContent = w.done;
    $('cart-hint').textContent = w.doneHint;
    $('clear-cart').textContent = w.clear;
    $('clear-cart').classList.toggle('danger', kindOf(list) !== 'travel'); // unpacking deletes nothing
    $('clear-cart').classList.toggle('accent', kindOf(list) === 'travel');
    cartCount.textContent = cart.length ? String(cart.length) : '';
    cartGrid.replaceChildren.apply(cartGrid, cart.map(function (i) { return itemRow(i, list); }));
  }

  function renderMain() {
    renderLists();
    renderStores();
    renderContent();
    renderCart();
  }

  $('clear-cart').addEventListener('click', function () {
    var list = currentList();
    if (kindOf(list) === 'travel') { unpackAll(list); return; }
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
    // skip empty parts (e.g. buttons that only show in some cases)
    body.append = function () {
      Element.prototype.append.apply(body, Array.prototype.filter.call(arguments, function (x) { return x != null && x !== false; }));
    };
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
  function browseItems(kind) {
    var seen = {};
    var out = indexFor(kind).entries.map(function (e) {
      seen[e.key] = true;
      return { name: e.name, key: e.key, aliases: e.aliases, icon: e.icon, category: detectCategory(e.name, kind) };
    });
    var counts = memory(kind).counts;
    Object.keys(counts).forEach(function (k) {
      if (seen[k]) return;
      var c = counts[k];
      var cat = hasCat(c.category, kind) ? c.category : detectCategory(c.name, kind);
      out.push({ name: c.name, key: k, aliases: [k], icon: iconFor(c.name, cat, kind), category: cat, mine: true });
    });
    return out;
  }

  function openAdd() {
    var state = { tab: 'all', override: null };
    var typing = false;
    // Adding to a recipe list: when you're done, offer to put the new items on Groceries too.
    var startList = currentList();
    var kind = kindOf(startList);
    var before = {};
    listItems(startList).forEach(function (i) { before[i.id] = true; });
    function onDone() {
      if (startList.type !== 'recipe') return;
      var fresh = listItems(startList).filter(function (i) { return !before[i.id] && !i.inCart; });
      if (fresh.length) setTimeout(function () { askAddToMain(fresh); }, 0);
    }

    var input = el('input', {
      class: 'search-input', type: 'text', placeholder: words(startList).placeholder,
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
    var sheet = openSheet({ full: true, head: head, label: 'Add items', onClose: onDone });
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
      var name = niceName(p.name, kind);
      var cat = currentOverride(name) || detectCategory(name, kind);
      var ci = catInfo(cat, kind);
      var existing = findOnList(name);
      suggest.replaceChildren(
        el('div', { class: 'suggest-card', style: tint(ci) }, [
          el('div', { class: 'suggest-main' }, [
            el('div', { class: 'suggest-name' }, [
              name,
              el('span', { class: 'suggest-icon', 'aria-hidden': 'true', text: iconFor(name, cat, kind) }),
              p.qty ? el('span', { class: 'qty-pill', text: p.qty }) : null
            ]),
            el('button', {
              type: 'button', class: 'cat-chip', 'aria-label': 'Category: ' + ci.name + '. Tap to change',
              onclick: function () {
                openCategoryPicker(cat, function (c) {
                  state.override = { key: norm(name), cat: c };
                  update();
                }, kind);
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
      var name = niceName(p.name, kind);
      var override = currentOverride(name);
      if (override) learn(name, override, kind);
      addItem({ name: name, qty: p.qty, category: override || detectCategory(name, kind), manual: true });
      input.value = '';
      state.override = null;
      update();
      input.focus();
    }
    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTyped(); }
    });

    // Tapping an item asks for the amount first (unless you already typed one).
    function pickTile(it, qty, extra) {
      var on = findOnList(it.name);
      var active = on && !on.inCart ? on : null;
      var b = el('button', {
        type: 'button', class: 'pick' + (active ? ' on' : ''), style: tint(catInfo(it.category, kind)),
        'aria-pressed': active ? 'true' : 'false', 'aria-label': it.name + (active && active.qty ? ', ' + active.qty : '')
      }, [
        el('span', { class: 'pick-check', 'aria-hidden': 'true', text: '✓' }),
        el('span', { class: 'pick-name', text: it.name }),
        el('span', { class: 'pick-emoji', 'aria-hidden': 'true', text: it.icon }),
        extra || (active && active.qty) ? el('span', { class: 'pick-count', text: extra || active.qty }) : null
      ]);
      b.addEventListener('click', function () {
        var cur = findOnList(it.name);
        var curActive = cur && !cur.inCart ? cur : null;
        function after() {
          if (b.isConnected) b.replaceWith(pickTile(it, qty, extra));
          if (typing) { input.value = ''; update(); }
        }
        if (qty && !curActive) {
          addItem({ name: it.name, qty: qty, category: it.category, manual: true });
          after();
          return;
        }
        openQtyPicker(it, curActive, function (choice) {
          if (choice === null) {
            removeItems([curActive.id], 'Removed ' + curActive.name);
          } else if (curActive) {
            curActive.qty = choice;
            save();
            renderMain();
            toast(choice ? it.name + ': ' + choice : 'Amount removed');
          } else {
            addItem({ name: it.name, qty: choice, category: it.category, manual: true });
          }
          after();
        }, kind);
      });
      return b;
    }

    function renderMatches(p) {
      var q = norm(p.name);
      var exact = norm(niceName(p.name, kind));
      var found = browseItems(kind).filter(function (it) {
        if (it.key === exact) return false;
        return it.aliases.some(function (a) { return a.indexOf(q) === 0 || a.indexOf(' ' + q) !== -1; });
      }).slice(0, 30);
      body.replaceChildren();
      if (found.length) {
        body.append(label('Suggestions'), el('div', { class: 'picks' }, found.map(function (it) { return pickTile(it, p.qty); })));
      }
    }

    function renderBrowse() {
      seg.replaceChildren(
        el('button', { type: 'button', role: 'tab', class: state.tab === 'all' ? 'on' : '', 'aria-selected': String(state.tab === 'all'), text: 'All items', onclick: function () { state.tab = 'all'; renderBrowse(); } }),
        el('button', { type: 'button', role: 'tab', class: state.tab === 'freq' ? 'on' : '', 'aria-selected': String(state.tab === 'freq'), text: '⭐ My frequent', onclick: function () { state.tab = 'freq'; renderBrowse(); } })
      );
      body.replaceChildren();

      if (state.tab === 'freq') {
        var counts = memory(kind).counts;
        var freq = Object.keys(counts).map(function (k) { return counts[k]; })
          .sort(function (a, b) { return b.n - a.n || b.last - a.last; }).slice(0, 30);
        if (!freq.length) {
          body.append(el('div', { class: 'empty' }, [
            el('div', { class: 'empty-icon', text: '⭐' }),
            el('p', { class: 'empty-title', text: 'No favorites yet' }),
            el('p', { text: 'The things you add most often will show up here.' })
          ]));
          return;
        }
        body.append(label('Most added'), el('div', { class: 'picks' }, freq.map(function (c) {
          var cat = hasCat(c.category, kind) ? c.category : detectCategory(c.name, kind);
          return pickTile({ name: c.name, icon: iconFor(c.name, cat, kind), category: cat }, '', '×' + c.n);
        })));
        return;
      }

      var items = browseItems(kind);
      allCats(kind).forEach(function (c) {
        var group = items.filter(function (i) { return i.category === c.name; });
        group.sort(function (a, b) { return (b.mine ? 1 : 0) - (a.mine ? 1 : 0); });
        if (!group.length) return;
        body.append(el('section', { class: 'group' }, [
          el('h3', { class: 'group-title' }, [c.icon + ' ' + c.name]),
          el('div', { class: 'picks' }, group.map(function (i) { return pickTile(i, ''); }))
        ]));
      });
    }

    update();
    input.focus();
  }

  // ---------- Amount picker ----------
  var QTY_PRESETS = {
    'Meat': ['250g', '500g', '750g', '1kg', '1x', '2x'],
    'Fish': ['200g', '300g', '500g', '1kg', '1x', '2x'],
    'Dairy': ['1x', '2x', '3x', '4x', '200g', '500g'],
    'Eggs': ['6x', '10x', '12x', '15x', '20x', '30x'],
    'Veggies': ['1x', '2x', '3x', '500g', '1kg', '1 bunch'],
    'Fruits': ['1x', '2x', '4x', '6x', '500g', '1kg'],
    'Pantry': ['1x', '2x', '3x', '250g', '500g', '1kg'],
    'Drinks': ['1x', '2x', '6x', '1l', '1.5l', '2l'],
    'Clothes': ['1x', '2x', '3x', '4x', '5x', '7x']
  };
  var DEFAULT_PRESETS = ['1x', '2x', '3x', '4x', '5x', '6x'];

  // done(amount) — '' means no amount, null means remove from the list
  function openQtyPicker(it, active, done, kind) {
    var ci = catInfo(it.category, kind);
    var sheet = openSheet({ title: it.name + ' ' + it.icon });
    var finished = false;
    function finish(v) {
      if (finished) return;
      finished = true;
      if (v) {
        var m = v.match(ONLY_QTY);
        v = m ? fmtQty(m[1], m[2]) : v.slice(0, 20);
      }
      closeSheet(sheet);
      done(v);
    }
    var custom = el('input', {
      class: 'input', type: 'text', placeholder: 'Other amount, e.g. 750g', 'aria-label': 'Other amount',
      value: active && active.qty ? active.qty : '', maxlength: '20', enterkeyhint: 'done', inputmode: 'text'
    });
    custom.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(custom.value.trim()); } });

    sheet.body.append(
      el('p', { class: 'hint', text: active ? 'Already on your list. Change the amount:' : 'How much?' }),
      el('div', { class: 'qty-grid' }, (QTY_PRESETS[it.category] || DEFAULT_PRESETS).map(function (q) {
        return el('button', {
          type: 'button', class: 'qty-option' + (active && active.qty === q ? ' selected' : ''), style: tint(ci), text: q,
          onclick: function () { finish(q); }
        });
      })),
      label('Other amount'),
      el('div', { class: 'inline-form' }, [
        custom,
        el('button', { type: 'button', class: 'primary-btn', text: active ? 'Update' : 'Add', onclick: function () { finish(custom.value.trim()); } })
      ]),
      el('button', { type: 'button', class: 'secondary-btn wide', text: active ? 'No amount' : 'Add without amount', onclick: function () { finish(''); } }),
      active ? el('button', { type: 'button', class: 'danger-btn', text: 'Remove from list', onclick: function () { finish(null); } }) : null
    );
  }

  // ---------- Category picker ----------
  function askCategoryName(kind) {
    return addCustomCategory(prompt('Name your new category (' + WORDS[kind].newCat + '):'), kind);
  }
  function openCategoryPicker(current, onPick, kind) {
    var sheet = openSheet({ title: 'Choose category' });
    function draw() {
      sheet.body.replaceChildren(el('div', { class: 'cat-grid' },
        allCats(kind).map(function (c) {
          return el('button', {
            type: 'button', class: 'cat-option' + (c.name === current ? ' selected' : ''), style: tint(c),
            onclick: function () { onPick(c.name); closeSheet(sheet); }
          }, [el('span', { class: 'cat-option-icon', text: c.icon }), el('span', { text: c.name })]);
        }).concat([el('button', {
          type: 'button', class: 'cat-option new',
          onclick: function () {
            var name = askCategoryName(kind);
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
    var kind = kindOf(list);
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
      var ci = catInfo(item.category, kind);
      hero.setAttribute('style', tint(ci));
      heroIcon.textContent = iconFor(item.name, item.category, kind);
    }
    function drawQty() {
      qtyChips.replaceChildren.apply(qtyChips, (kind === 'travel' ? QUICK_QTY_TRAVEL : QUICK_QTY).map(function (q) {
        return el('button', {
          type: 'button', class: 'mini-chip' + (item.qty === q ? ' selected' : ''), text: q,
          onclick: function () { item.qty = item.qty === q ? '' : q; qtyInput.value = item.qty; persist(); drawQty(); }
        });
      }));
    }
    function drawCats() {
      catChips.replaceChildren.apply(catChips, allCats(kind).map(function (c) {
        return el('button', {
          type: 'button', class: 'cat-option' + (c.name === item.category ? ' selected' : ''), style: tint(c),
          onclick: function () {
            if (item.category === c.name) return;
            item.category = c.name;
            learn(item.name, c.name, kind);
            persist(); drawCats(); drawHero();
            toast('Got it: ' + item.name + ' goes in ' + c.name + ' from now on');
          }
        }, [el('span', { class: 'cat-option-icon', text: c.icon }), el('span', { text: c.name })]);
      }).concat([el('button', {
        type: 'button', class: 'cat-option new',
        onclick: function () {
          var name = askCategoryName(kind);
          if (!name) return;
          item.category = name; learn(item.name, name, kind); persist(); drawCats(); drawHero();
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
      usesStores(list) ? label('Store') : null,
      usesStores(list) ? storeChips : null,
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
        list.id !== 'main' && kindOf(list) === 'grocery' ? row('🛒', 'Add all to Groceries', addAllToMain) : null,
        list.id !== 'main' ? row('✏️', 'Rename list', renameList) : null,
        list.type === 'custom' ? row('🧳', 'Make it a packing list', function () { changeKind('travel'); }) : null,
        list.type === 'travel' ? row('📝', 'Make it a shopping list', function () { changeKind('grocery'); }) : null
      ]),
      el('div', { class: 'menu-group' }, [
        row('🏷️', 'My categories', openCategories),
        row('⭐', 'Reset my frequent items', resetFrequent)
      ]),
      list.id !== 'main' ? el('div', { class: 'menu-group' }, [row('🗑️', 'Delete this list', deleteList, true)]) : null
    );
  }

  var LIST_KINDS = [
    { kind: 'grocery', name: 'Shopping', icon: '🛒', h: 120, s: '45%' },
    { kind: 'travel', name: 'Packing for a trip', icon: '🧳', h: 215, s: '60%' }
  ];
  function newList() {
    var kind = 'grocery', picked = false;
    var sheet = openSheet({ title: 'New list' });
    var input = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Trip to Rome, Party', 'aria-label': 'List name', maxlength: '40', enterkeyhint: 'done' });
    var kinds = el('div', { class: 'cat-grid' });
    function draw() {
      kinds.replaceChildren.apply(kinds, LIST_KINDS.map(function (k) {
        var on = k.kind === kind;
        return el('button', {
          type: 'button', class: 'cat-option' + (on ? ' selected' : ''), style: tint(k), 'aria-pressed': on ? 'true' : 'false',
          onclick: function () { kind = k.kind; picked = true; draw(); }
        }, [el('span', { class: 'cat-option-icon', text: k.icon }), el('span', { text: k.name })]);
      }));
    }
    function create() {
      var name = cap(input.value);
      if (!name) { input.focus(); return; }
      var id = uid();
      data.lists.push({ id: id, name: name.slice(0, 40), type: kind === 'travel' ? 'travel' : 'custom', createdAt: Date.now() });
      save();
      closeSheet(sheet);
      switchList(id);
    }
    // "Trip to Rome", "Wakacje"… picks packing for you, until you choose yourself.
    input.addEventListener('input', function () {
      if (picked) return;
      kind = looksLikeTrip(input.value) ? 'travel' : 'grocery';
      draw();
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    sheet.body.append(
      label('Name'), input,
      label('What is it for?'), kinds,
      el('button', { type: 'button', class: 'primary-btn wide', text: 'Create list', onclick: create })
    );
    draw();
    input.focus();
  }
  function changeKind(kind) {
    var list = currentList();
    setKind(list, kind);
    save();
    renderMain();
    toast(kind === 'travel' ? '🧳 ' + list.name + ' is now a packing list' : '📝 ' + list.name + ' is now a shopping list');
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
  // Copies items onto the main Groceries list, skipping ones already on it.
  function addToMain(items) {
    var main = data.lists.find(function (l) { return l.id === 'main'; });
    var added = 0;
    items.forEach(function (i) {
      var ex = findOnList(i.name, main);
      if (ex && !ex.inCart) return;
      addItem({ list: main, name: i.name, qty: i.qty, category: i.category, store: '', silent: true });
      added++;
    });
    toast(added ? 'Added ' + added + ' item' + (added === 1 ? '' : 's') + ' to Groceries' : 'Everything is already on Groceries');
  }
  function addAllToMain(list) {
    list = list && list.id ? list : currentList();
    addToMain(listItems(list).filter(function (i) { return !i.inCart; }));
  }

  // After ingredients go into a recipe list: also put them on Groceries?
  function askAddToMain(items) {
    if (!items.length) return;
    var sheet = openSheet({ title: 'Add to Groceries?' });
    var main = data.lists.find(function (l) { return l.id === 'main'; });
    var already = items.filter(function (i) { var ex = findOnList(i.name, main); return ex && !ex.inCart; }).length;
    sheet.body.append(
      el('p', { class: 'ask-text', text: 'Also add these ingredients to your main Groceries list?' }),
      el('p', { class: 'hint', text: items.length + ' ingredient' + (items.length === 1 ? '' : 's') +
        (already ? ' · ' + already + ' already on Groceries (won’t be added twice)' : '') }),
      el('button', {
        type: 'button', class: 'primary-btn wide', text: 'Yes, Add to Groceries',
        onclick: function () { closeSheet(sheet); addToMain(items); }
      }),
      el('button', {
        type: 'button', class: 'secondary-btn wide', text: 'Recipe List Only',
        onclick: function () { closeSheet(sheet); }
      })
    );
  }
  function resetFrequent() {
    var travel = kindOf(currentList()) === 'travel';
    if (!confirm(travel ? 'Forget how often you packed each item?' : 'Forget how often you added each item?')) return;
    memory(travel ? 'travel' : 'grocery').counts = {};
    save();
    toast('Frequent items reset');
  }

  // Shopping lists and packing lists each have their own categories.
  function openCategories() {
    var kind = kindOf(currentList());
    var sheet = openSheet({ title: kind === 'travel' ? 'My packing categories' : 'My categories' });
    var input = el('input', { class: 'input', type: 'text', placeholder: WORDS[kind].newCat, 'aria-label': 'New category name', maxlength: '30', enterkeyhint: 'done' });
    var listEl = el('div', { class: 'chip-row' });
    function draw() {
      var mine = memory(kind).customCats;
      listEl.replaceChildren();
      if (!mine.length) listEl.append(el('p', { class: 'hint', text: 'You haven’t made any yet.' }));
      mine.forEach(function (n) {
        listEl.append(el('span', { class: 'mini-chip removable' }, [
          CUSTOM_STYLE.icon + ' ' + n,
          el('button', { type: 'button', text: '✕', 'aria-label': 'Remove ' + n, onclick: function () { if (removeCustomCategory(n, kind)) draw(); } })
        ]));
      });
    }
    function add() {
      var name = addCustomCategory(input.value, kind);
      if (!name) return;
      input.value = '';
      draw();
      toast('Added category ' + name);
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    sheet.body.append(
      el('p', { class: 'hint', text: WORDS[kind].catHint }),
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
    var items = [];
    raw.forEach(function (x) {
      if (typeof x === 'string') { items = items.concat(parseIngredient(x)); return; }
      if (x && typeof x === 'object' && x.name) {
        var qty = x.qty != null ? String(x.qty) : (x.amount != null ? String(x.amount) + (x.unit ? ' ' + x.unit : '') : '');
        items.push({ name: cap(String(x.name).trim()).slice(0, 60), qty: qty.trim() });
      }
    });
    return finishDishes([{ name: dishTitle(String(o.dish || o.name || o.title || 'Recipe')), items: items, from: o.from || o.app || '' }]);
  }

  function parseImport(text) {
    text = String(text || '').trim();
    if (!text) return [];
    var m = text.match(/#import=([A-Za-z0-9_\-]+=*)/);
    if (m) { try { text = b64decode(m[1]); } catch (e) { /* not a link */ } }
    if (/^[[{]/.test(text)) {
      try { return fromJson(JSON.parse(text)); } catch (e) { /* not JSON, read as text */ }
    }
    return parseRecipeText(text);
  }

  function importDishes(dishes, source) {
    var firstId = null, created = [];
    var t = Date.now();
    dishes.forEach(function (d) {
      var id = uid();
      if (!firstId) firstId = id;
      data.lists.push({ id: id, name: d.name, type: 'recipe', from: d.from || source || '', createdAt: t });
      d.items.forEach(function (ing, i) {
        var name = niceName(ing.name);
        var item = {
          id: uid(), listId: id, name: name, qty: ing.qty || '', category: detectCategory(name),
          store: '', inCart: false, addedAt: t + i, cartAt: 0
        };
        data.items.push(item);
        created.push(item);
      });
      t += 1000;
    });
    save();
    return { id: firstId, items: created };
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

    // Preview: rename the dish or remove any line before importing.
    function show() {
      preview.replaceChildren.apply(preview, dishes.map(function (d, di) {
        var title = el('input', { class: 'dish-input', type: 'text', value: d.name, 'aria-label': 'Dish name', maxlength: '60', enterkeyhint: 'done' });
        title.addEventListener('input', function () { d.name = cap(title.value) || 'Recipe'; });
        return el('div', { class: 'preview-dish' }, [
          el('div', { class: 'preview-title' }, [el('span', { 'aria-hidden': 'true', text: '🍽️' }), title]),
          el('div', { class: 'rows' }, d.items.map(function (i, ii) {
            var n = niceName(i.name);
            return el('div', { class: 'row static', style: tint(catInfo(detectCategory(n))) }, [
              el('span', { class: 'row-main' }, [el('span', { class: 'row-line' }, [
                el('span', { class: 'row-name', text: n }),
                el('span', { class: 'row-emoji', 'aria-hidden': 'true', text: iconFor(n, detectCategory(n)) })
              ])]),
              i.qty ? el('span', { class: 'row-qty', text: i.qty }) : null,
              el('button', {
                type: 'button', class: 'x-btn', text: '✕', 'aria-label': 'Remove ' + n,
                onclick: function () {
                  d.items.splice(ii, 1);
                  if (!d.items.length) dishes.splice(di, 1);
                  show();
                }
              })
            ]);
          }))
        ]);
      }));
      var total = dishes.reduce(function (a, d) { return a + d.items.length; }, 0);
      go.disabled = !total;
      go.textContent = !total ? 'Import' : dishes.length > 1
        ? 'Import ' + dishes.length + ' recipes'
        : 'Import ' + total + ' ingredient' + (total === 1 ? '' : 's');
    }

    ta.addEventListener('input', function () { dishes = parseImport(ta.value); show(); });
    go.addEventListener('click', function () {
      if (!dishes.length) return;
      var res = importDishes(dishes, source);
      closeSheet(sheet);
      if (onImported) onImported();
      switchList(res.id);
      toast(dishes.length > 1 ? 'Imported ' + dishes.length + ' recipes' : 'Imported ' + dishes[0].name);
      askAddToMain(res.items);
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
        el('p', { class: 'hint', text: 'Copy a whole recipe from anywhere and paste it here. Only the ingredients are kept. Check the list, remove anything you don’t need, then import.' }),
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
  window.__grocery = { parseQty: parseQty, parseIngredient: parseIngredient, detectCategory: detectCategory, parseImport: parseImport, niceName: niceName };
})();
