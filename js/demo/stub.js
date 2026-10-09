// Cliente de Supabase SIMULADO en memoria, solo para la versión de demostración (demo.html). Solo lectura.
import { crearDatos } from './datos.js';
const UID = 'u-demo';
const db = crearDatos();
let nInv = 0;
const mov = (bien_id, tipo, detalle, fecha) => db.inventario_movimientos.push({ id: crypto.randomUUID(), iglesia_id: 'ig1', bien_id, tipo, fecha: fecha || new Date().toISOString().slice(0, 10), detalle, creado_en: new Date().toISOString() });
let nActa = 0;
const err = (message, code) => ({ message, code });
const EMB = {
  miembros: { persona: { table: 'personas', fk: 'persona_id', type: 'one' } },
  reuniones: { reunion_participantes: { table: 'reunion_participantes', fk: 'reunion_id', type: 'many' } },
};
const now = () => new Date().toISOString();

function audit(tabla, accion, row, cambios) {
  db.audit_log.push({ id: db.audit_log.length + 1, iglesia_id: 'ig1', tabla, registro_id: row.id, accion, usuario_id: UID, fecha: now(), cambios, antes: null, despues: row });
}

class Q {
  constructor(t) { this.t = t; this.op = 'select'; this.f = []; this.ord = []; this.sel = '*'; this.lim = null; this.rng = null; this.one = null; this.count = null; this.head = false; this.ret = false; }
  select(c = '*', o = {}) { this.sel = c; this.count = o.count; this.head = o.head; if (this.op !== 'select') this.ret = true; return this; }
  insert(v) { this.op = 'insert'; this.vals = Array.isArray(v) ? v : [v]; return this; }
  update(v) { this.op = 'update'; this.vals = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, a) { this.f.push((r) => a.includes(r[c])); return this; }
  is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
  not(c, op, v) { this.f.push((r) => (op === 'is' ? (r[c] ?? null) !== v : true)); return this; }
  neq(c, v) { this.f.push((r) => r[c] !== v); return this; }
  lte(c, v) { this.f.push((r) => r[c] != null && r[c] <= v); return this; }
  gte(c, v) { this.f.push((r) => r[c] != null && r[c] >= v); return this; }
  lt(c, v) { this.f.push((r) => r[c] != null && r[c] < v); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false, o.nullsFirst]); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }

  base() {
    if (this.t === 'personas_basico') return db.personas.map(({ id, iglesia_id, nombre, apellido, archivado }) => ({ id, iglesia_id, nombre, apellido, archivado }));
    return db[this.t];
  }
  embed(row) {
    const out = { ...row };
    const spec = EMB[this.t] || {};
    const re = /(?:(\w+):)?(\w+)\(([^)]*)\)/g; let m;
    while ((m = re.exec(this.sel))) {
      const alias = m[1] || m[2]; const key = m[2];
      const e = Object.values(spec).find((s, i) => Object.keys(spec)[i] === alias || s.table === key);
      if (!e) continue;
      if (e.type === 'one') out[alias] = db[e.table].find((x) => x.id === row[e.fk]) || null;
      else out[alias] = db[e.table].filter((x) => x[e.fk] === row.id);
    }
    return out;
  }
  run() {
    const t = this.t;
    if (this.op !== 'select') return { data: null, error: err('Esta es una versión de demostración: solo se puede mirar. Los cambios no se guardan.', 'DEMO') };
    try {
      if (this.op === 'insert') {
        const rows = this.vals.map((v) => {
          const r = { ...v };
          if (t === 'perfiles' || t === 'audit_log') return r;
          if (!['reunion_participantes', 'acta_asistentes', 'acta_firmas'].includes(t) || true) r.id = r.id || crypto.randomUUID();
          if (['personas','miembros','autoridades','reuniones','actas','decisiones','archivos_drive','eventos','actividades_fijas','notas','inventario_bienes','inventario_prestamos','documentos'].includes(t)) {
            r.iglesia_id = 'ig1'; r.creado_por = UID; r.creado_en = now(); r.actualizado_en = now(); r.archivado = r.archivado ?? false;
          }
          if (t === 'personas') {
            if (r.dni && db.personas.some((p) => p.dni === r.dni)) throw err('duplicate key value violates unique constraint "personas_dni_unico"', '23505');
          }
          if (t === 'actas') { r.numero = ++nActa; r.estado = 'borrador'; r.aprobada_por = null; r.aprobada_en = null; }
          if (t === 'eventos') {
            r.estado = r.estado || 'programado'; r.privado = r.privado ?? false;
            if (r.fija_id && db.eventos.some((x) => x.fija_id === r.fija_id && x.fecha === r.fecha && !x.archivado)) throw err('duplicate key value violates unique constraint "eventos_fija_fecha_uq"', '23505');
          }
          if (t === 'notas') { r.estado = 'borrador'; r.numero = null; r.anio = null; r.archivado = false; }
          if (t === 'inventario_bienes') { r.codigo = 'INV-' + String(++nInv).padStart(4, '0'); r.archivado = false; r.foto_miniatura = r.foto_miniatura ?? null; setTimeout(() => mov(r.id, 'alta', 'Alta en el inventario (' + r.cantidad + ' u.) en ' + r.ubicacion), 0); }
          if (t === 'inventario_prestamos') { r.devuelto_en = null; const b = db.inventario_bienes.find((x) => x.id === r.bien_id); const ab = db.inventario_prestamos.filter((x) => x.bien_id === r.bien_id && !x.devuelto_en).reduce((a, x) => a + x.cantidad, 0); if (r.cantidad > b.cantidad - ab) throw err('Solo quedan ' + (b.cantidad - ab) + ' unidad(es) disponibles para prestar.', 'P0001'); mov(r.bien_id, 'prestamo', 'Prestado a ' + r.prestado_a + ' (' + r.cantidad + ' u.). Devolución prevista: ' + r.fecha_devolucion_prevista); }
          if (t === 'documentos') { if (!/^https?:\/\//i.test(r.url || '')) throw err('new row for relation "documentos" violates check constraint "documentos_url_check"', '23514'); r.etiquetas = r.etiquetas || []; r.restringido = r.restringido ?? false; if (r.origen === 'enlace') { r.drive_id = null; r.tamano = null; } }
          if (t === 'inventario_movimientos') { r.creado_en = now(); r.iglesia_id = 'ig1'; }
          if (t === 'actividades_fijas') { r.activa = r.activa ?? true; }
          if (t.startsWith('tesoreria_')) { r.iglesia_id = 'ig1'; r.creado_por = UID; r.creado_en = now(); r.actualizado_en = now(); }
          if (t === 'tesoreria_movimientos') {
            r.anulado = r.anulado ?? false; r.sin_pastor = r.sin_pastor ?? false;
            if (!(Number(r.monto) > 0)) throw err('new row violates check constraint "tesoreria_movimientos_monto_check"', '23514');
            if (r.origen_id && db.tesoreria_movimientos.some((x) => x.origen_id === r.origen_id)) throw err('duplicate key value violates unique constraint "tes_mov_origen_uq"', '23505');
          }
          if (t === 'tesoreria_planillas' && db.tesoreria_planillas.some((x) => x.mes === r.mes)) throw err('duplicate key value violates unique constraint', '23505');
          if (t === 'decisiones') { r.estado = r.estado || 'pendiente'; }
          if (['acta_asistentes', 'acta_firmas'].includes(t)) {
            const a = db.actas.find((x) => x.id === r.acta_id);
            if (a && a.estado !== 'borrador') throw err('El acta está ' + a.estado + ' y no admite cambios en asistentes o firmas.', 'P0001');
          }
          for (const k of ['iglesia_id']) r[k] = r[k] ?? 'ig1';
          return r;
        });
        rows.forEach((r) => { db[t].push(r); audit(t, 'INSERT', r, null); });
        return this.fin(rows);
      }
      if (this.op === 'update') {
        const rows = db[t].filter((r) => this.f.every((fn) => fn(r)));
        rows.forEach((r) => {
          if (t === 'inventario_bienes') {
            if (r.estado === 'baja' && this.vals.estado === 'baja') throw err('Este bien está dado de baja. Reactivalo si fue un error.', 'P0001');
            if (this.vals.estado === 'baja') { if (db.inventario_prestamos.some((x) => x.bien_id === r.id && !x.devuelto_en)) throw err('No se puede dar de baja: tiene un préstamo sin devolver.', 'P0001'); this.vals.archivado = true; mov(r.id, 'baja', 'Dado de baja. Motivo: ' + this.vals.baja_motivo); }
            else if (r.estado === 'baja') { this.vals.archivado = false; this.vals.baja_motivo = null; this.vals.baja_fecha = null; mov(r.id, 'reactivacion', 'Reactivado en el inventario'); }
            else if (this.vals.ubicacion && this.vals.ubicacion !== r.ubicacion) mov(r.id, 'ubicacion', 'Ubicación: ' + r.ubicacion + ' → ' + this.vals.ubicacion);
          }
          if (t === 'documentos') {
            if (r.archivado && this.vals.archivado) throw err('Este documento está archivado. Restauralo para modificarlo.', 'P0001');
            if (r.origen === 'archivo') { delete this.vals.url; delete this.vals.drive_id; }
          }
          if (t === 'inventario_prestamos') {
            if (r.devuelto_en) throw err('Este préstamo ya fue devuelto y no se puede modificar.', 'P0001');
            if (this.vals.devuelto_en) mov(r.bien_id, 'devolucion', 'Devuelto por ' + r.prestado_a, this.vals.devuelto_en);
          }
          if (t === 'notas' && r.estado === 'archivada' && ['borrador', 'emitida'].includes(this.vals.estado)) {
            if ((r.numero == null) !== (this.vals.estado === 'borrador')) throw err('Una nota con número se restaura como emitida; un borrador descartado, como borrador.', 'P0001');
            this.vals.archivado = false;
          } else if (t === 'notas') {
            if (r.estado === 'archivada') throw err('Esta nota está archivada y no se puede modificar.', 'P0001');
            if (r.estado === 'emitida' && this.vals.estado !== 'archivada') throw err('La nota N° ' + r.numero + '/' + r.anio + ' está emitida y no se puede modificar.', 'P0001');
            if (r.estado === 'borrador' && this.vals.estado === 'emitida') {
              const fecha = this.vals.fecha || r.fecha; const serie = ['bautismo', 'casamiento', 'presentacion'].includes(r.tipo) ? r.tipo : 'nota';
              const anio = Number(fecha.slice(0, 4));
              const mismas = db.notas.filter((x) => x.numero && x.anio === anio && (['bautismo', 'casamiento', 'presentacion'].includes(x.tipo) ? x.tipo : 'nota') === serie);
              this.vals.anio = anio; this.vals.numero = mismas.length + 1;
            }
          }
          if (t === 'tesoreria_movimientos') {
            if (r.anulado && this.vals.anulado) throw err('Este movimiento está anulado. Restauralo para modificarlo.', 'P0001');
            if (this.vals.anulado && !String(this.vals.motivo_anulacion || '').trim()) throw err('new row violates check constraint "tesoreria_movimientos_check2"', '23514');
            if (r.anulado && this.vals.anulado === false) this.vals.motivo_anulacion = null;
          }
          if (t === 'actas') {
            if (r.estado === 'archivada') throw err('El acta N° ' + r.numero + ' está archivada y no se puede modificar.', 'P0001');
            if (r.estado === 'aprobada' && !(this.vals.estado === 'archivada')) throw err('El acta N° ' + r.numero + ' está aprobada y no se puede modificar.', 'P0001');
            if (this.vals.estado === 'aprobada') { this.vals.aprobada_por = UID; this.vals.aprobada_en = now(); }
          }
          const cambios = Object.keys(this.vals).filter((k) => JSON.stringify(r[k]) !== JSON.stringify(this.vals[k]));
          Object.assign(r, this.vals, { actualizado_en: now() });
          if (cambios.length) audit(t, 'UPDATE', r, cambios);
        });
        return this.fin(rows);
      }
      if (this.op === 'delete') {
        if (['personas', 'miembros', 'actas', 'decisiones', 'reuniones', 'autoridades', 'eventos', 'actividades_fijas', 'notas', 'inventario_bienes', 'inventario_prestamos', 'inventario_movimientos', 'documentos'].includes(t)) throw err('permission denied for table ' + t, '42501');
        if (t === 'acta_asistentes' || t === 'acta_firmas') {
          const hit = db[t].filter((r) => this.f.every((fn) => fn(r)));
          for (const r of hit) { const a = db.actas.find((x) => x.id === r.acta_id); if (a && a.estado !== 'borrador') throw err('El acta está ' + a.estado + ' y no admite cambios en asistentes o firmas.', 'P0001'); }
        }
        db[t] = db[t].filter((r) => !this.f.every((fn) => fn(r)));
        return { data: null, error: null };
      }
      // select
      let rows = this.base().filter((r) => this.f.every((fn) => fn(r)));
      for (const [c, asc, nf] of [...this.ord].reverse()) {
        rows = [...rows].sort((a, b) => {
          const va = a[c], vb = b[c];
          if (va == null && vb == null) return 0;
          if (va == null) return nf ? -1 : 1;
          if (vb == null) return nf ? 1 : -1;
          return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      const total = rows.length;
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      rows = rows.map((r) => this.embed(r));
      if (this.head) return { data: null, count: total, error: null };
      if (this.one) {
        if (rows.length > 1) return { data: null, error: err('multiple rows') };
        if (!rows.length) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: err('no rows') };
        return { data: rows[0], error: null };
      }
      return { data: rows, count: total, error: null };
    } catch (e) { return { data: null, error: e }; }
  }
  fin(rows) {
    if (!this.ret && !this.one) return { data: null, error: null };
    const out = rows.map((r) => ({ ...r }));
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}

const session = { user: { id: UID, email: 'demo@ejemplo.org' } }; const subs = [];
export function createClient() {
  return {
    from: (t) => new Q(t),
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange(cb) { subs.push(cb); setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        if (password === 'mal') return { error: { message: 'Invalid login credentials' } };
        subs.forEach((cb) => cb('SIGNED_IN', session)); return { data: { session }, error: null };
      },
      async signUp() { return { data: { session: null }, error: null }; },
      async signOut() { return { error: null }; },
      async updateUser() { return { error: null }; },
      async resetPasswordForEmail() { return { error: null }; },
      async signInWithOAuth() { return { error: null }; },
    },
  };
}
