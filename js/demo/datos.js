// DATOS INVENTADOS para la versión de demostración. No son datos reales de la iglesia.
const IG = 'ig-demo';
const hoyD = new Date(); hoyD.setHours(12, 0, 0, 0);
const dia = (n) => { const d = new Date(hoyD); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ts = (n = 0) => new Date(hoyD.getTime() + n * 86400000).toISOString();
const base = (o) => ({ iglesia_id: IG, archivado: false, creado_por: 'u-demo', creado_en: ts(-90), actualizado_en: ts(-90), ...o });

export function crearDatos() {
  const nombres = [
    ['Roberto', 'Aguirre', '1968-04-12'], ['Marta', 'Benítez', '1971-09-03'], ['Carlos', 'Cabrera', '1975-01-22'], ['Lucía', 'Domínguez', '1980-06-30'],
    ['Esteban', 'Escobar', '1983-11-15'], ['Graciela', 'Ferreyra', '1957-02-08'], ['Héctor', 'Giménez', '1962-07-19'], ['Silvia', 'Herrera', '1966-12-01'],
    ['Pablo', 'Ibarra', '1990-03-27'], ['Natalia', 'Juárez', '1992-08-14'], ['Federico', 'Luna', '1988-05-05'], ['Camila', 'Maldonado', '2001-10-21'],
    ['Joaquín', 'Núñez', '2003-02-17'], ['Valeria', 'Ortiz', '1985-09-09'], ['Ramón', 'Paz', '1950-12-25'], ['Elena', 'Quiroga', '1954-04-04'],
    ['Tomás', 'Ríos', '2010-07-07'], ['Abril', 'Sosa', '2012-11-30'], ['Gustavo', 'Toledo', '1978-01-18'], ['Mónica', 'Vega', '1974-06-12'],
    ['Daniel', 'Acosta', '1995-09-29'], ['Julieta', 'Bravo', '1998-03-03'], ['Oscar', 'Correa', '1960-10-10'], ['Rosa', 'Medina', '1948-05-20'],
  ];
  const personas = nombres.map(([nombre, apellido, nac], i) => base({
    id: `p${i + 1}`, nombre, apellido, dni: String(20000000 + i * 1371234).slice(0, 8), fecha_nacimiento: nac,
    telefono: `11 5${String(100 + i).padStart(3, '0')}-${String(1000 + i * 37).slice(0, 4)}`, email: `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@ejemplo.org`,
    direccion: `Calle de Ejemplo ${100 + i * 12}`, observaciones: null,
  }));
  const estados = ['activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'activo', 'inactivo', 'activo', 'activo', 'activo', 'en_proceso', 'activo', 'activo', 'trasladado', 'inactivo', 'activo'];
  const miembros = personas.map((p, i) => base({
    id: `m${i + 1}`, persona_id: p.id, estado: estados[i], fecha_ingreso: `${2008 + (i % 17)}-0${1 + (i % 9)}-15`, forma_ingreso: ['Bautismo', 'Traslado', 'Profesión de fe'][i % 3], observaciones: null,
  }));
  const cargos = [['p1', 'pastor', 'Pastor'], ['p2', 'comision', 'Presidente'], ['p3', 'comision', 'Vicepresidente'], ['p4', 'comision', 'Secretario/a'], ['p5', 'comision', 'Tesorero/a'],
    ['p6', 'comision', 'Revisor/a de cuentas'], ['p7', 'comision', 'Vocal titular'], ['p8', 'comision', 'Vocal titular'], ['p9', 'comision', 'Vocal suplente']];
  const autoridades = cargos.map(([persona_id, tipo, cargo], i) => base({ id: `a${i + 1}`, persona_id, tipo, cargo, fecha_inicio: '2025-03-01', fecha_fin: null, observaciones: null }));

  const reuniones = [
    base({ id: 'r1', tipo: 'comision', fecha: dia(-75), hora: '20:00:00', lugar: 'Salón de reuniones', temas: 'Presupuesto del año, mantenimiento del techo', responsable_id: 'p2', estado: 'realizada', observaciones: null }),
    base({ id: 'r2', tipo: 'comision', fecha: dia(-45), hora: '20:00:00', lugar: 'Salón de reuniones', temas: 'Campaña de recolección, cronograma de visitas', responsable_id: 'p2', estado: 'realizada', observaciones: null }),
    base({ id: 'r3', tipo: 'asamblea', fecha: dia(-30), hora: '11:30:00', lugar: 'Templo', temas: 'Balance anual y elección de vocales', responsable_id: 'p1', estado: 'realizada', observaciones: null }),
    base({ id: 'r4', tipo: 'comision', fecha: dia(-12), hora: '20:00:00', lugar: 'Salón de reuniones', temas: 'Compra de equipo de sonido, retiro de jóvenes', responsable_id: 'p2', estado: 'realizada', observaciones: null }),
    base({ id: 'r5', tipo: 'comision', fecha: dia(6), hora: '20:00:00', lugar: 'Salón de reuniones', temas: 'Seguimiento de decisiones, actividades de fin de año', responsable_id: 'p2', estado: 'programada', observaciones: null }),
    base({ id: 'r6', tipo: 'ministerial', fecha: dia(14), hora: '19:30:00', lugar: 'Oficina pastoral', temas: 'Planificación del bautismo', responsable_id: 'p1', estado: 'programada', observaciones: null }),
  ];
  const reunion_participantes = reuniones.slice(0, 4).flatMap((r) => ['p1', 'p2', 'p3', 'p4', 'p5', 'p7'].map((persona_id) => ({ reunion_id: r.id, persona_id, iglesia_id: IG })));

  const ordenes = ['1. Lectura del acta anterior\n2. Informe de tesorería\n3. Asuntos varios', '1. Oración inicial\n2. Cronograma de visitas\n3. Cierre'];
  const actas = [
    base({ id: 'ac1', numero: 1, fecha: dia(-75), hora_inicio: '20:00:00', hora_fin: '21:40:00', lugar: 'Salón de reuniones', tipo: 'comision', reunion_id: 'r1', orden_del_dia: ordenes[0], temas_tratados: 'Se aprobó el presupuesto del año. Se resolvió reparar el techo del salón y se designó a un responsable.', observaciones: null, estado: 'aprobada', aprobada_por: 'u-demo', aprobada_en: ts(-74) }),
    base({ id: 'ac2', numero: 2, fecha: dia(-45), hora_inicio: '20:00:00', hora_fin: '21:15:00', lugar: 'Salón de reuniones', tipo: 'comision', reunion_id: 'r2', orden_del_dia: ordenes[1], temas_tratados: 'Se organizó la campaña de recolección de alimentos y el cronograma de visitas a familias.', observaciones: null, estado: 'aprobada', aprobada_por: 'u-demo', aprobada_en: ts(-44) }),
    base({ id: 'ac3', numero: 3, fecha: dia(-30), hora_inicio: '11:30:00', hora_fin: '13:00:00', lugar: 'Templo', tipo: 'asamblea', reunion_id: 'r3', orden_del_dia: ordenes[0], temas_tratados: 'Se presentó el balance anual, que fue aprobado por unanimidad. Se eligieron dos vocales.', observaciones: null, estado: 'aprobada', aprobada_por: 'u-demo', aprobada_en: ts(-29) }),
    base({ id: 'ac4', numero: 4, fecha: dia(-12), hora_inicio: '20:00:00', hora_fin: '21:30:00', lugar: 'Salón de reuniones', tipo: 'comision', reunion_id: 'r4', orden_del_dia: ordenes[1], temas_tratados: 'Se decidió comprar un equipo de sonido nuevo y organizar el retiro de jóvenes.', observaciones: null, estado: 'aprobada', aprobada_por: 'u-demo', aprobada_en: ts(-11) }),
    base({ id: 'ac5', numero: 5, fecha: dia(-2), hora_inicio: '19:00:00', hora_fin: null, lugar: 'Oficina pastoral', tipo: 'otras', reunion_id: null, orden_del_dia: '1. Agenda de visitas', temas_tratados: 'Borrador en elaboración.', observaciones: null, estado: 'borrador', aprobada_por: null, aprobada_en: null }),
  ];
  const acta_asistentes = actas.flatMap((a) => ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8'].map((persona_id) => ({ acta_id: a.id, persona_id, iglesia_id: IG })));
  const acta_firmas = actas.slice(0, 4).flatMap((a, i) => [['p4', 'Secretario/a'], ['p2', 'Presidente']].map(([persona_id, cargo], k) => ({ id: `f${i}${k}`, acta_id: a.id, persona_id, iglesia_id: IG, cargo })));

  const decisiones = [
    base({ id: 'd1', descripcion: 'Reparar el techo del salón de reuniones', fecha: dia(-75), acta_id: 'ac1', responsable_id: 'p7', fecha_limite: dia(-20), estado: 'completada', observaciones: null, completada_en: ts(-22) }),
    base({ id: 'd2', descripcion: 'Realizar la campaña de recolección de alimentos', fecha: dia(-45), acta_id: 'ac2', responsable_id: 'p3', fecha_limite: dia(-10), estado: 'completada', observaciones: null, completada_en: ts(-12) }),
    base({ id: 'd3', descripcion: 'Comprar equipo de sonido nuevo para el templo', fecha: dia(-12), acta_id: 'ac4', responsable_id: 'p5', fecha_limite: dia(20), estado: 'en_proceso', observaciones: 'Se piden tres presupuestos.', completada_en: null }),
    base({ id: 'd4', descripcion: 'Organizar el retiro de jóvenes', fecha: dia(-12), acta_id: 'ac4', responsable_id: 'p9', fecha_limite: dia(35), estado: 'pendiente', observaciones: null, completada_en: null }),
    base({ id: 'd5', descripcion: 'Renovar el seguro del edificio', fecha: dia(-30), acta_id: 'ac3', responsable_id: 'p5', fecha_limite: dia(3), estado: 'pendiente', observaciones: null, completada_en: null }),
    base({ id: 'd6', descripcion: 'Pintar el frente del templo', fecha: dia(-45), acta_id: 'ac2', responsable_id: 'p8', fecha_limite: dia(-5), estado: 'pendiente', observaciones: 'Falta definir fecha.', completada_en: null }),
  ];

  const e = (id, titulo, categoria, n, hora, lugar, extra = {}) => base({ id, titulo, categoria, fecha: dia(n), hora, hora_fin: null, lugar, descripcion: null, privado: false, estado: 'programado', fija_id: null, ...extra });
  const eventos = [
    e('e1', 'Retiro de jóvenes (preparación)', 'joven', 4, '18:00:00', 'Salón'), e('e2', 'Estudio bíblico de matrimonios', 'estudio', 8, '20:00:00', 'Casa de la familia Ibarra'),
    e('e3', 'Visita pastoral a familias', 'pastoral', 2, '16:00:00', null, { privado: true, descripcion: 'Agenda privada del pastor.' }), e('e4', 'Cena de aniversario de la iglesia', 'especial', 18, '20:30:00', 'Salón', { descripcion: 'Cena para toda la congregación.' }),
    e('e5', 'Bautismo', 'especial', 25, '11:00:00', 'Templo'), e('e6', 'Reunión de comisión', 'comision', 6, '20:00:00', 'Salón de reuniones'),
  ];
  const fijas = [
    { id: 'f1', titulo: 'Culto general', categoria: 'culto', dia_semana: 0, hora: '10:30:00', hora_fin: null, lugar: null, variante_titulo: 'Santa Cena', variante_hora: '10:00:00', activa: true },
    { id: 'f2', titulo: 'Reunión de jóvenes', categoria: 'joven', dia_semana: 6, hora: '19:00:00', hora_fin: null, lugar: null, variante_titulo: null, variante_hora: null, activa: true },
    { id: 'f3', titulo: 'Reunión de oración', categoria: 'oracion', dia_semana: 4, hora: '18:30:00', hora_fin: null, lugar: null, variante_titulo: null, variante_hora: null, activa: true },
    { id: 'f4', titulo: 'Estudio bíblico', categoria: 'estudio', dia_semana: 3, hora: '20:00:00', hora_fin: null, lugar: null, variante_titulo: null, variante_hora: null, activa: true },
  ].map((r) => base(r));

  const anioN = hoyD.getFullYear();
  const notas = [
    base({ id: 'n1', tipo: 'general', anio: anioN, numero: 1, fecha: dia(-20), lugar: 'Ciudad', destinatario: 'Municipalidad\nDirección de Cultos', asunto: 'Solicitud de habilitación para evento', cuerpo: 'Nos dirigimos a Ud. para solicitar la habilitación del evento especial que se realizará en nuestro templo. Quedamos a su disposición para cualquier información adicional.', datos: { destinatario: 'Municipalidad\nDirección de Cultos', asunto: 'Solicitud de habilitación para evento' }, firmantes: [{ nombre: 'Marta Benítez', cargo: 'Secretario/a' }], persona_id: null, estado: 'emitida', emitida_por: 'u-demo', emitida_en: ts(-20) }),
    base({ id: 'n2', tipo: 'bautismo', anio: anioN, numero: 1, fecha: dia(-10), lugar: 'Ciudad', destinatario: null, asunto: null, cuerpo: 'Se certifica que Joaquín Núñez, habiendo confesado a Jesucristo como su Señor y Salvador, fue bautizado en nuestro templo.', datos: { nombre: 'Joaquín Núñez', fecha_bautismo: dia(-400), lugar_bautismo: 'Templo', oficiante: 'Pastor Roberto Aguirre' }, firmantes: [{ nombre: 'Marta Benítez', cargo: 'Secretario/a' }, { nombre: 'Roberto Aguirre', cargo: 'Pastor' }], persona_id: 'p13', estado: 'emitida', emitida_por: 'u-demo', emitida_en: ts(-10) }),
  ];

  const bien = (n, id, nombre, categoria, cantidad, ubicacion, estado, extra = {}) => base({ id, codigo: `INV-${String(n).padStart(4, '0')}`, nombre, descripcion: null, categoria, cantidad, ubicacion, ubicacion_detalle: null, estado, fecha_adquisicion: `${2019 + (n % 6)}-05-10`, forma_adquisicion: n % 3 ? 'compra' : 'donacion', responsable_id: 'p7', observaciones: null, foto_miniatura: null, foto_drive_id: null, foto_url: null, foto_nombre: null, baja_fecha: null, baja_motivo: null, ...extra });
  const inventario_bienes = [
    bien(1, 'b1', 'Consola de sonido 16 canales', 'sonido', 1, 'Cabina del sonido', 'bueno'), bien(2, 'b2', 'Parlantes del templo', 'sonido', 4, 'Salón', 'bueno'), bien(3, 'b3', 'Proyector', 'sonido', 1, 'Salón', 'regular', { observaciones: 'La lámpara está por cambiarse.' }),
    bien(4, 'b4', 'Guitarra acústica', 'instrumentos', 2, 'Salón', 'bueno'), bien(5, 'b5', 'Teclado', 'instrumentos', 1, 'Salón', 'bueno'), bien(6, 'b6', 'Sillas plásticas', 'mobiliario', 120, 'Salón', 'bueno'),
    bien(7, 'b7', 'Mesas plegables', 'mobiliario', 12, 'Patio', 'regular'), bien(8, 'b8', 'Heladera', 'electrodomesticos', 1, 'Otros', 'bueno'), bien(9, 'b9', 'Anafe industrial', 'cocina', 1, 'Otros', 'en_reparacion'),
    bien(10, 'b10', 'Ollas grandes', 'cocina', 6, 'Otros', 'bueno'), bien(11, 'b11', 'Aspiradora', 'limpieza', 1, 'Baños', 'malo'), bien(12, 'b12', 'Micrófonos inalámbricos', 'sonido', 4, 'Cabina del sonido', 'bueno'),
  ];
  const inventario_prestamos = [
    base({ id: 'pr1', bien_id: 'b7', cantidad: 4, prestado_a: 'Familia Ortiz', contacto: '11 5555-0101', fecha_prestamo: dia(-6), fecha_devolucion_prevista: dia(2), devuelto_en: null, obs_devolucion: null, observaciones: 'Para un cumpleaños.' }),
    base({ id: 'pr2', bien_id: 'b3', cantidad: 1, prestado_a: 'Iglesia hermana del barrio', contacto: null, fecha_prestamo: dia(-30), fecha_devolucion_prevista: dia(-20), devuelto_en: dia(-19), obs_devolucion: null, observaciones: null }),
  ];
  const inventario_movimientos = [
    ...inventario_bienes.map((b) => ({ id: `mv-${b.id}`, iglesia_id: IG, bien_id: b.id, tipo: 'alta', fecha: b.fecha_adquisicion, detalle: `Alta en el inventario (${b.cantidad} u.)`, creado_por: 'u-demo', creado_en: ts(-80) })),
    { id: 'mv-x1', iglesia_id: IG, bien_id: 'b9', tipo: 'reparacion', fecha: dia(-9), detalle: 'Se envió a reparar el regulador de gas.', creado_por: 'u-demo', creado_en: ts(-9) },
    { id: 'mv-x2', iglesia_id: IG, bien_id: 'b7', tipo: 'prestamo', fecha: dia(-6), detalle: 'Prestado a Familia Ortiz (4 u.)', creado_por: 'u-demo', creado_en: ts(-6) },
  ];

  const doc = (id, titulo, categoria, n, descripcion, extra = {}) => base({ id, titulo, categoria, fecha_documento: dia(n), descripcion, etiquetas: [], origen: 'enlace', url: 'https://example.org/documento-de-ejemplo', drive_id: null, nombre_archivo: null, mime: null, tamano: null, vence_el: null, restringido: false, ...extra });
  const documentos = [
    doc('dc1', 'Estatuto de la iglesia', 'estatutos', -900, 'Estatuto vigente.'), doc('dc2', 'Póliza de seguro del edificio', 'seguros', -330, 'Cobertura integral del templo.', { vence_el: dia(25), etiquetas: ['seguro'] }),
    doc('dc3', 'Habilitación municipal', 'seguros', -700, null, { vence_el: dia(210) }), doc('dc4', 'Contrato de alquiler del salón anexo', 'legales', -400, null, { vence_el: dia(-8) }),
    doc('dc5', 'Plano del templo', 'inmuebles', -2000, null), doc('dc6', 'Factura del proyector', 'facturas', -500, null),
  ];

  return {
    iglesias: [{ id: IG, nombre: 'Iglesia de Ejemplo', creado_en: ts(-200) }],
    perfiles: [{ id: 'u-demo', iglesia_id: IG, nombre: 'Visitante', email: 'demo@ejemplo.org', rol: 'pastor', activo: true, creado_en: ts(-200) }],
    personas, miembros, autoridades, reuniones, reunion_participantes, actas, acta_asistentes, acta_firmas, decisiones,
    archivos_drive: [], audit_log: [], actividades_fijas: fijas, eventos, notas, inventario_bienes, inventario_prestamos, inventario_movimientos, documentos,
    tesoreria_config: [], tesoreria_movimientos: [], tesoreria_planillas: [], tesoreria_porcentajes: [],
  };
}
