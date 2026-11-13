// Shared core: used by server.js (Node) and inlined into the standalone HTML.
const DMSCore = (function () {
  const COLS = ['patients', 'appointments', 'treatments', 'labs', 'labPayments', 'suppliers', 'labOrders', 'supplierPayments', 'purchases', 'stockItems', 'stockAdj', 'patientDocs'];
  const VIEWM = { patients: ['patients', 'appts', 'treat', 'receipts', 'reports'], appointments: ['appts'], treatments: ['treat', 'receipts', 'reports'], labs: ['labs', 'vpay', 'treat', 'reports'], labPayments: ['labs', 'vpay', 'reports'], labOrders: ['labs', 'reports'], suppliers: ['suppliers', 'vpay'], supplierPayments: ['vpay'], purchases: ['suppliers', 'stock', 'treat'], stockItems: ['stock', 'suppliers', 'treat'], stockAdj: ['stock', 'treat'], patientDocs: ['patients'] };
  const WRITEM = { patients: ['patients'], appointments: ['appts'], treatments: ['treat', 'receipts'], labs: ['labs'], labPayments: ['labs', 'vpay'], labOrders: ['labs'], suppliers: ['suppliers'], supplierPayments: ['vpay'], purchases: ['suppliers'], stockItems: ['stock', 'suppliers'], stockAdj: ['stock'], patientDocs: ['patients'] };
  const MODS = ['dash', 'patients', 'appts', 'treat', 'labs', 'suppliers', 'stock', 'receipts', 'vpay', 'reports', 'audit', 'settings'];
  const ALL = v => Object.fromEntries(MODS.map(m => [m, v]));
  const n = x => Number(x) || 0;
  const err = (code, msg) => { throw { code, msg }; };
  const pub = u => { const { pass, ...r } = u; return r; };
  const nm = x => (x && (x.name || x.procedure || x.username || x.reason || x.work || x.ref)) || '';

  function create(init, o) {
    const fresh = () => ({
      users: [{ id: 'u1', username: 'admin', name: 'Administrator', role: 'r1', active: true, pass: o.hash('admin123') }],
      roles: [
        { id: 'r1', name: 'Admin', perms: ALL('edit') },
        { id: 'r2', name: 'Dentist', perms: { ...ALL('none'), dash: 'view', patients: 'edit', appts: 'edit', treat: 'edit', labs: 'view' } },
        { id: 'r3', name: 'Receptionist', perms: { ...ALL('none'), dash: 'view', patients: 'edit', appts: 'edit', receipts: 'edit' } },
        { id: 'r4', name: 'Accountant', perms: { ...ALL('none'), dash: 'view', patients: 'view', treat: 'edit', labs: 'edit', suppliers: 'edit', receipts: 'edit', vpay: 'edit', stock: 'view', reports: 'view' } }],
      settings: { clinicName: 'My Dental Clinic', tva: '', lsc: '', phone: '', email: '', address: '', usdRate: 89500, defaultCurrency: 'USD', footer: '', i18n: { en: {}, ar: {} }, lists: {}, rateHistory: [] },
      audit: [], ...Object.fromEntries(COLS.map(c => [c, []]))
    });
    let db;
    const mig = () => { db.users.forEach((u, i) => { u.id = u.id || 'u' + (i + 1); u.role = u.role || 'r1'; u.name = u.name || u.username; u.active = u.active !== false; });
      db.roles.forEach(r => { r.perms = r.perms || {}; if (r.id == 'r1') r.perms = ALL('edit'); if (r.id == 'r3' && r.perms.receipts === undefined) r.perms.receipts = 'edit'; if (r.id == 'r4') { if (r.perms.receipts === undefined) r.perms.receipts = 'edit'; if (r.perms.vpay === undefined) r.perms.vpay = 'edit'; if (r.perms.stock === undefined) r.perms.stock = 'view'; if (r.perms.reports === undefined) r.perms.reports = 'view'; } MODS.forEach(m => { if (!r.perms[m]) r.perms[m] = 'none'; }); }); };
    db = { ...fresh(), ...(init || {}) }; mig(); if (db.settings.idleMin === undefined) db.settings.idleMin = 15;
    const sv = () => o.save(db);
    const lvl = (u, m) => ((db.roles.find(r => r.id == u.role) || { perms: {} }).perms[m]) || 'none';
    const need = (u, m, l) => { const v = lvl(u, m); if (!(v == 'edit' || (l == 'view' && v == 'view'))) err(403, 'Forbidden: no permission'); };
    const needM = (u, ms, l) => { if (!ms.some(m => { const v = lvl(u, m); return l == 'edit' ? v == 'edit' : v != 'none'; })) err(403, 'Forbidden: no permission'); };
    const log = (u, action, col, id, info) => { db.audit.unshift({ t: new Date().toISOString(), user: u ? u.username : '-', action, col, id, info: info || '' }); if (db.audit.length > 5000) db.audit.length = 5000; };

    function login(un, pw) {
      const u = db.users.find(x => x.username == un && x.active && x.pass == o.hash(pw || ''));
      log(u || { username: String(un).slice(0, 40) }, u ? 'login' : 'login FAILED', 'users', u && u.id); sv();
      if (!u) err(401, 'Invalid login'); return u.username;
    }

    function handle(un, m, parts, b) {
      b = b || {}; const [, col, id] = parts, now = new Date().toISOString();
      const u = db.users.find(x => x.username == un && x.active); if (!u) err(401, 'Unauthorized');
      if (col == 'ping') return { ok: 1 };
      if (col == 'all') {
        const g = c => VIEWM[c].some(m => lvl(u, m) != 'none') ? db[c] : [];
        return { ...Object.fromEntries(COLS.map(c => [c, g(c)])), patientDocs: g('patientDocs').map(({ data, ...d }) => d), settings: db.settings, roles: db.roles,
          audit: lvl(u, 'audit') != 'none' ? db.audit : [], users: lvl(u, 'settings') != 'none' ? db.users.map(pub) : [],
          dentists: db.users.filter(x => x.active && (x.dentist !== undefined ? x.dentist : x.role == 'r2')).map(x => ({ id: x.id, name: x.name })),
          me: { ...pub(u), perms: db.roles.find(r => r.id == u.role).perms } };
      }
      if (col == 'backup') { need(u, 'settings', 'edit'); log(u, 'backup download', 'system'); sv(); return db; }
      if (col == 'restore') { need(u, 'settings', 'edit'); db = { ...fresh(), ...b }; mig(); log(u, 'RESTORE', 'system'); sv(); return { ok: 1 }; }
      if (col == 'reset') {
        need(u, 'settings', 'edit');
        if (b.confirm1 !== true || b.confirm2 !== 'DELETE') err(422, 'Two confirmations required (type DELETE)');
        const keep = { users: db.users, roles: db.roles }; db = { ...fresh(), ...keep };
        log(u, 'RESET ALL DATA', 'system'); sv(); return { ok: 1 };
      }
      if (col == 'password') {
        if (u.pass != o.hash(b.old || '') || !b.new || b.new.length < 6) err(422, 'Invalid password');
        u.pass = o.hash(b.new); log(u, 'password change', 'users', u.id); sv(); return { ok: 1 };
      }
      if (col == 'settings' && m == 'PUT') {
        need(u, 'settings', 'edit');
        if (n(b.usdRate) != n(db.settings.usdRate)) b.rateHistory = [...(db.settings.rateHistory || []), { rate: n(b.usdRate), t: now, by: u.username }];
        db.settings = { ...db.settings, ...b }; log(u, 'update', 'settings', null, 'rate ' + db.settings.usdRate); sv(); return db.settings;
      }
      if (col == 'users') {
        need(u, 'settings', 'edit');
        if (m == 'POST') {
          if (!b.username || !b.password || b.password.length < 6) err(422, 'Username and password (6+) required');
          if (db.users.some(x => x.username == b.username)) err(422, 'Username already exists');
          const x = { id: o.uuid(), username: b.username, name: b.name || b.username, role: b.role, dentist: !!b.dentist, active: b.active !== false, pass: o.hash(b.password) };
          db.users.push(x); log(u, 'create', 'users', x.id, x.username); sv(); return pub(x);
        }
        const x = db.users.find(y => y.id == id); if (!x) err(404, 'Not found');
        if (m == 'PUT') {
          if (b.username && b.username != x.username && db.users.some(y => y.username == b.username)) err(422, 'Username already exists');
          if (x.id == u.id && b.active === false) err(422, 'You cannot disable yourself');
          Object.assign(x, { username: b.username || x.username, name: b.name, role: b.role, dentist: !!b.dentist, active: b.active !== false });
          if (b.password) { if (b.password.length < 6) err(422, 'Password too short'); x.pass = o.hash(b.password); }
          log(u, 'update', 'users', x.id, x.username); sv(); return pub(x);
        }
        if (m == 'DELETE') { if (x.id == u.id) err(422, 'You cannot delete yourself'); db.users = db.users.filter(y => y != x); log(u, 'delete', 'users', x.id, x.username); sv(); return { ok: 1 }; }
      }
      if (col == 'roles') {
        need(u, 'settings', 'edit');
        if (m == 'POST') { const x = { id: o.uuid(), name: b.name, perms: b.perms }; db.roles.push(x); log(u, 'create', 'roles', x.id, x.name); sv(); return x; }
        const x = db.roles.find(y => y.id == id); if (!x) err(404, 'Not found');
        if (m == 'PUT') { if (x.id == 'r1') err(422, 'Admin role is fixed'); x.name = b.name; x.perms = b.perms; log(u, 'update', 'roles', x.id, x.name); sv(); return x; }
        if (m == 'DELETE') { if (x.id == 'r1' || db.users.some(y => y.role == x.id)) err(422, 'Role is protected or in use'); db.roles = db.roles.filter(y => y != x); log(u, 'delete', 'roles', x.id, x.name); sv(); return { ok: 1 }; }
      }
      if (!COLS.includes(col)) err(404, 'Not found');
      const a = db[col];
      if (m == 'GET') { needM(u, VIEWM[col], 'view'); return id ? a.find(x => x.id == id) : a; }
      needM(u, WRITEM[col], 'edit');
      if (m == 'POST') { const x = { ...b, id: o.uuid(), createdAt: now }; a.push(x); log(u, 'create', col, x.id, nm(x)); sv(); return x; }
      const i = a.findIndex(x => x.id == id); if (i < 0) err(404, 'Not found');
      if (m == 'PUT') { a[i] = { ...b, id, createdAt: a[i].createdAt, updatedAt: now }; log(u, 'update', col, id, nm(b)); sv(); return a[i]; }
      if (m == 'DELETE') { const x = a.splice(i, 1)[0]; log(u, 'delete', col, id, nm(x)); sv(); return { ok: 1 }; }
      err(405, 'Method not allowed');
    }
    return { login, handle, idle: () => n(db.settings.idleMin === undefined ? 15 : db.settings.idleMin) };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = DMSCore;
