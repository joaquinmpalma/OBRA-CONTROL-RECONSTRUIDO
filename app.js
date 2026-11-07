/* =====================================================================
   OBRA CONTROL v1 · Sistema de Supervisión, Calidad y Prevención de Obras
   HTML + CSS + JavaScript puro · Persistencia en localStorage
   ---------------------------------------------------------------------
   Índice del archivo
     1. Constantes y catálogos
     2. Utilidades
     3. Datos (localStorage, datos demo)
     4. Lógica de negocio (alertas, semáforo, riesgo de nido de piedra, indicadores)
     5. Componentes de interfaz (badges, tablas, modal, toasts)
     6. Vistas (dashboard, proyectos, ficha, DH/NCR, inspecciones, etc.)
     7. Formularios y acciones
     8. Enrutador y arranque
   Estructuras preparadas para ampliar: frentes de trabajo/viviendas
   (project.frentes con lat/lng/qr) para mapa y códigos QR.
   ===================================================================== */
'use strict';

/* ============ 1. CONSTANTES ============ */
const KEY = 'obracontrol_v1';
const BACKUP_KEY = 'obracontrol_v1_backup';
const ESTADOS = ['Detectado', 'En evaluación', 'En corrección', 'Pendiente de verificación', 'Cerrado'];
const CRITICIDADES = ['Menor', 'Mayor', 'Crítica'];
const ESPECIALIDADES = ['Hormigón', 'Estructura', 'Terminaciones', 'Instalaciones', 'Obras exteriores', 'Otra'];
const CAUSAS = ['Mano de obra', 'Método / procedimiento', 'Materiales', 'Equipos', 'Diseño / proyecto', 'Control / supervisión', 'Otra'];
const ESTADOS_PROY = ['Planificación', 'En ejecución', 'Suspendido', 'Terminado'];
const MOMENTOS = ['ANTES', 'DURANTE', 'DESPUÉS'];
const TIPOS_EV = ['Fotografía', 'Documento', 'Video', 'Informe de laboratorio', 'Otro'];
const METODOS = ['Bomba', 'Camión mixer directo (chute)', 'Balde con grúa', 'Carretilla', 'Otro'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const TIPO_INSP = 'Control preventivo de hormigonado';

/* Checklist del control preventivo de hormigonado: [clave, texto] */
const CHECKLIST = [
  { g: 'Enfierradura', items: [['diam', 'Diámetros correctos'], ['sep', 'Separación correcta'], ['rec', 'Recubrimiento correcto'], ['fij', 'Armadura correctamente fijada'], ['interf', 'No existen interferencias importantes'], ['accesoV', 'Existe acceso suficiente para el vibrador']] },
  { g: 'Moldaje', items: [['firme', 'Moldaje firme'], ['perd', 'Sin pérdidas importantes'], ['cotas', 'Cotas verificadas'], ['limp', 'Limpieza correcta']] },
  { g: 'Hormigón', items: [['proy', 'Hormigón correspondiente al proyecto'], ['recep', 'Recepción verificada'], ['tiempo', 'Tiempo controlado'], ['segreg', 'No existe segregación visible']] },
  { g: 'Vibración', items: [['vdisp', 'Vibrador disponible'], ['voper', 'Vibrador operativo'], ['vdiam', 'Diámetro adecuado'], ['opdisp', 'Operador disponible'], ['accesoA', 'Acceso entre armaduras'], ['plan', 'Plan de vibrado definido']] }
];
const TODAS_CLAVES = CHECKLIST.flatMap(g => g.items.map(i => i[0]));
const TEXTO_ITEM = {};
CHECKLIST.forEach(g => g.items.forEach(i => TEXTO_ITEM[i[0]] = i[1]));

/* Pesos del riesgo de nido de piedra (una respuesta "No" suma el peso) */
const PESOS = { accesoV: 5, accesoA: 5, vdisp: 4, voper: 4, opdisp: 3, interf: 3, segreg: 3, plan: 2, vdiam: 2, tiempo: 1, sep: 1, recep: 1 };
const MSG_RIESGO = {
  accesoV: 'Acceso insuficiente del vibrador.',
  accesoA: 'Sin acceso del vibrador entre armaduras.',
  vdisp: 'Vibrador no disponible.',
  voper: 'Vibrador no operativo.',
  opdisp: 'Operador de vibrado no disponible.',
  interf: 'Congestión de armadura: existen interferencias importantes.',
  segreg: 'Segregación visible en el hormigón.',
  plan: 'Plan de vibrado / control de compactación no definido.',
  vdiam: 'Diámetro de vibrador inadecuado.',
  tiempo: 'Tiempo del hormigón no controlado.',
  sep: 'Separación de armadura incorrecta.',
  recep: 'Recepción del hormigón no verificada.'
};

/* ============ 2. UTILIDADES ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoy = () => ymd(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const fmtFecha = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
const fmtCorta = s => { if (!s) return ''; const [, m, d] = s.split('-'); return d + ' ' + MESES[+m - 1]; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const enc = encodeURIComponent;

/* ============ 3. DATOS ============ */
let DB;
const ROLES = ['Administrador Praxis','Supervisor / ITO','Encargado de Calidad','Jefe de Obra','Consulta'];
let CURRENT_ROLE = localStorage.getItem('obracontrol_role') || 'Supervisor / ITO';
const USER_KEY = 'obracontrol_users_v1';
const SESSION_KEY = 'obracontrol_session_v1';
const USER_ROLES = ['Trabajador de obra','Trabajador común','Administrador','Supervisor','Jefe de obra','Jefe de terreno','Jefe de oficina técnica','Encargado de Calidad','Gerente de obra','Gerente de proyecto'];
const CREW_KEY = 'obracontrol_crews_v1';
let CREWS = [];
let GENERATED_WORKER_CREDENTIALS = [];
let AUTH_USERS = [];
let CURRENT_USER = null;
let AUTH_ERROR = '';
const UI = { f: {}, list: null }; // estado de interfaz (filtros, refresco de listas)
let CLOUD_USER = null, CLOUD_SYNC_READY = false, CLOUD_SAVE_TIMER = null, CLOUD_LAST_ERROR = '';

function save() {
  try {
    const serialized = JSON.stringify(DB);
    const previous = localStorage.getItem(KEY);
    if (previous) { try { localStorage.setItem(BACKUP_KEY, previous); } catch (backupError) { /* la copia previa no debe impedir guardar el estado actual */ } }
    localStorage.setItem(KEY, serialized);
    scheduleCloudSave();
    return true;
  } catch (e) { toast('No se pudo guardar en este navegador. Exporta una copia de seguridad y revisa el espacio disponible.', 'err'); return false; }
}
function load() {
  try { const raw = localStorage.getItem(KEY); DB = raw ? JSON.parse(raw) : null; } catch (e) { DB = null; }
  if (!DB) { try { const backup = localStorage.getItem(BACKUP_KEY); if (backup) { DB = JSON.parse(backup); toast('Se recuperaron los últimos datos disponibles desde la copia local.', 'ok'); } } catch (e) { DB = null; } }
  if (!DB) { DB = demoData(); save(); }
  ['projects', 'records', 'inspections', 'evidences', 'lessons', 'dis', 'trainings', 'recurrenceReviews', 'holdPoints', 'toolChecks', 'toolboxTalks', 'enhancedControls', 'inventoryItems', 'inventoryMovements', 'riskMatrix', 'integrationLinks'].forEach(k => { if (!Array.isArray(DB[k])) DB[k] = []; });
  // Registros de ejemplo para demostración; tickets y datos comerciales son ficticios y están rotulados como simulación.
  const DEMO_PREVENT_TAG = 'DEMO-PREVENT-ARAUCO-2026';
  if (!DB.holdPoints.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.holdPoints.push({id:'demo-hold-v04',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',elemento:'V-04 · Casa piloto · radier',partida:'Antes de hormigonar',responsable:'Supervisor de calidad (ejemplo)',observacion:'PUNTO DE DETENCIÓN: verificar enfierradura, recubrimientos, moldaje, limpieza, accesibilidad y operatividad del vibrador. No liberar el vaciado hasta completar controles y autorización.',fecha:hoy(),estado:'Pendiente',checks:{},historial:[{fecha:hoy(),estado:'Pendiente',actor:'Supervisor de calidad (ejemplo)'}]});
  if (!DB.toolChecks.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.toolChecks.push(
    {id:'demo-tool-vib',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',herramienta:'Vibrador de inmersión para hormigón',marca:'ENAR',modelo:'DINGO (referencia ilustrativa)',identificador:'EQ-HOR-004',elemento:'V-04 · Estación de trabajo · hormigonado',ubicacionEstado:'En estación de trabajo',ticketCompra:'SIM-BOLETA-2026-008741',proveedor:'Ferretería Industrial del Biobío (proveedor ficticio)',montoCompra:289990,fechaCompra:'2026-09-18',inspector:'Encargado de equipos (ejemplo)',resultado:'Apto',estado:'Apto',observacion:'Ejemplo de inspección: cable y enchufe sin daño visible, carcasa íntegra y prueba funcional previa registrada. Verificar manual y datos reales antes de usar.',fecha:hoy()},
    {id:'demo-tool-esm',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',herramienta:'Esmeril angular 4½ pulgadas',marca:'Bosch',modelo:'GWS 700 (referencia ilustrativa)',identificador:'EQ-COR-012',elemento:'Bodega de herramientas · estante B-02',ubicacionEstado:'En almacén',ticketCompra:'SIM-BOLETA-2026-009106',proveedor:'Suministros Técnicos Arauco (proveedor ficticio)',montoCompra:74990,fechaCompra:'2026-09-22',inspector:'Encargado de equipos (ejemplo)',resultado:'Observado',estado:'Observado',observacion:'Ejemplo: revisar guarda y estado del cable antes de asignar a una cuadrilla. Mantener identificado y no entregar hasta verificar.',fecha:hoy()});
  if (!DB.inventoryItems.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.inventoryItems.push(
    {id:'inv-vib-004',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',codigo:'EQ-HOR-004',nombre:'Vibrador de inmersión',categoria:'Equipo eléctrico',marca:'ENAR',modelo:'DINGO (referencia ilustrativa)',serie:'SIM-ENAR-004',estado:'Disponible',condicion:'Apto sujeto a inspección previa',ubicacion:'Estación de trabajo V-04',cuadrilla:'Cuadrilla piloto de hormigonado',responsable:'Encargado de equipos (ejemplo)',documentoCompra:'SIM-BOLETA-2026-008741',proveedor:'Proveedor ficticio · demostración',monto:289990,fechaCompra:'2026-09-18',ultimaInspeccion:hoy(),proximaInspeccion:addDays(7),mantencionProxima:addDays(30),notas:'Ejemplo ficticio. Confirmar manual del fabricante, alimentación eléctrica y condiciones reales antes de usar.'},
    {id:'inv-esm-012',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',codigo:'EQ-COR-012',nombre:'Esmeril angular 4½ pulgadas',categoria:'Herramienta eléctrica',marca:'Bosch',modelo:'GWS 700 (referencia ilustrativa)',serie:'SIM-BOSCH-012',estado:'Bloqueado',condicion:'Pendiente de revisión de guarda y cable',ubicacion:'Almacén · estante B-02',cuadrilla:'Sin asignar',responsable:'Encargado de equipos (ejemplo)',documentoCompra:'SIM-BOLETA-2026-009106',proveedor:'Proveedor ficticio · demostración',monto:74990,fechaCompra:'2026-09-22',ultimaInspeccion:hoy(),proximaInspeccion:addDays(1),mantencionProxima:'',notas:'No entregar a cuadrilla hasta verificar y registrar condición segura.'}
  );
  if (!DB.inventoryMovements.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.inventoryMovements.push({id:'inv-mov-demo-1',demoTag:DEMO_PREVENT_TAG,itemId:'inv-vib-004',codigo:'EQ-HOR-004',fecha:hoy(),tipo:'Asignación',origen:'Almacén',destino:'Estación de trabajo V-04',responsable:'Encargado de equipos (ejemplo)',recibe:'Jefe de cuadrilla piloto',motivo:'Preparación del hormigonado',observacion:'Movimiento ficticio de demostración.'});
  if (!DB.riskMatrix.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.riskMatrix.push(
    {id:'risk-demo-1',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',actividad:'Hormigonado de radier',peligro:'Acceso insuficiente del vibrador y compactación deficiente',consecuencia:'Nido de piedra, retrabajo y posible incumplimiento técnico',probabilidad:3,severidad:4,controles:'Plan de hormigonado, inspección previa, operador instruido y punto de detención',jerarquia:'Ingeniería / técnica',medida:'Verificar acceso físico antes del vaciado; definir secuencia y equipo alternativo compatible',responsable:'Supervisor de calidad (ejemplo)',plazo:addDays(1),estado:'En control',residualProbabilidad:2,residualSeveridad:3},
    {id:'risk-demo-2',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',actividad:'Uso de esmeril angular',peligro:'Disco dañado, guarda ausente o proyección de partículas',consecuencia:'Lesión ocular, cortes o atrapamiento',probabilidad:3,severidad:5,controles:'Inspección preuso, guarda instalada, accesorio compatible, área delimitada y EPP',jerarquia:'Eliminación / sustitución cuando sea viable',medida:'Bloquear equipo observado; no entregar hasta revisión y registro conforme',responsable:'Encargado de equipos (ejemplo)',plazo:addDays(1),estado:'Acción pendiente',residualProbabilidad:1,residualSeveridad:5},
    {id:'risk-demo-3',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',actividad:'Trabajo en altura en techumbre',peligro:'Caída desde borde o superficie frágil',consecuencia:'Lesión grave o fatal',probabilidad:3,severidad:5,controles:'Plan de trabajo, acceso seguro, protección colectiva y sistema personal cuando corresponda',jerarquia:'Ingeniería / protección colectiva',medida:'No iniciar sin evaluación del lugar, protecciones instaladas, sistema compatible y personal instruido',responsable:'Jefe de terreno (ejemplo)',plazo:addDays(1),estado:'En control',residualProbabilidad:1,residualSeveridad:5},
    {id:'risk-demo-4',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',actividad:'Instalaciones eléctricas temporales',peligro:'Cable deteriorado, humedad o contacto con partes energizadas',consecuencia:'Choque eléctrico, quemaduras o incendio',probabilidad:3,severidad:5,controles:'Inspección visual, protección adecuada, conexión protegida y personal autorizado',jerarquia:'Ingeniería / técnica',medida:'Retirar de servicio lo defectuoso, proteger conexiones y verificar condiciones según procedimiento y normativa aplicable',responsable:'Supervisor eléctrico (ejemplo)',plazo:addDays(1),estado:'En control',residualProbabilidad:1,residualSeveridad:5}
  );
  if (!DB.toolboxTalks.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.toolboxTalks.push({id:'demo-talk-vib',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',tarea:'Vaciado de radier: acceso del vibrador, segregación y orden de colocación',relator:'Prevencionista / supervisor (ejemplo)',participantes:'Cuadrilla de hormigonado · asistencia de demostración sin firmas reales',riesgos:'Nido de piedra por compactación insuficiente; tropiezos con mangueras; contacto con equipos eléctricos en ambiente húmedo.',controles:'Revisar vibrador y alimentación, acordar secuencia y recorrido, mantener área despejada, controlar descarga y detener si falla un control crítico.',comprension:'Confirmación verbal registrada (ejemplo)',observacion:'CHARLA DE DEMOSTRACIÓN. No acredita asistencia real ni sustituye una charla impartida en terreno.',fecha:hoy(),fechaHoraCreacion:new Date().toISOString(),estado:'Registrada · ejemplo',codigoAsistencia:'000000',asistenciaAbierta:false,firmas:[],ubicacionCharla:null});
  if (!DB.enhancedControls.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.enhancedControls.push({id:'demo-followup-ncr1',demoTag:DEMO_PREVENT_TAG,projectId:'1735-48-LR26',elemento:'V-04 · Radier · control de compactación/vibrado',ncrId:'r-ncr1',cantidad:3,responsable:'Supervisor de calidad (ejemplo)',fechaObjetivo:addDays(7),criterio:'En las próximas tres ejecuciones, verificar antes del vaciado: acceso del vibrador a sectores congestionados, equipo operativo, operador asignado, secuencia de colocación y registro fotográfico. Registrar cada resultado; si hay desviación, detener y corregir.',fechaCreacion:hoy(),resultados:[],estado:'Activo'});
  if (!DB.trainings.some(x => x.demoTag === DEMO_PREVENT_TAG)) DB.trainings.push({id:'demo-academy-vib',demoTag:DEMO_PREVENT_TAG,nombre:'Camila Rojas',cargo:'Trabajadora de hormigonado',empresa:'PRAXIS Edificaciones · datos ficticios',projectId:'1735-48-LR26',elemento:'V-04 · Casa piloto · radier',manualId:'m02',ncrId:'r-ncr1',destinatarioTipo:'Trabajador',responsable:'Jefe de cuadrilla piloto',fechaAsignacion:hoy(),estado:'Pendiente',nota:'Asignación de demostración: revisar vibrado, acceso entre armaduras y prevención de nidos de piedra.',intentos:0,resultado:null});
  if (!DB.integrationLinks.length) DB.integrationLinks.push(
    {id:'link-demo-ncr-gantt',demoTag:DEMO_PREVENT_TAG,entityType:'record',entityId:'r-ncr1',taskId:'V-04-t8',houseId:'V-04',projectId:'1735-48-LR26',relacion:'Reparación y verificación NCR-001',creadoPor:'Sistema · demostración',creadoEn:new Date().toISOString()},
    {id:'link-demo-risk-gantt',demoTag:DEMO_PREVENT_TAG,entityType:'risk',entityId:'risk-demo-1',taskId:'V-04-t4',houseId:'V-04',projectId:'1735-48-LR26',relacion:'Control previo al hormigonado',creadoPor:'Sistema · demostración',creadoEn:new Date().toISOString()},
    {id:'link-demo-asset-gantt',demoTag:DEMO_PREVENT_TAG,entityType:'asset',entityId:'inv-vib-004',taskId:'V-04-t5',houseId:'V-04',projectId:'1735-48-LR26',relacion:'Equipo requerido para la partida',creadoPor:'Sistema · demostración',creadoEn:new Date().toISOString()},
    {id:'link-demo-training-gantt',demoTag:DEMO_PREVENT_TAG,entityType:'training',entityId:'demo-academy-vib',taskId:'V-04-t5',houseId:'V-04',projectId:'1735-48-LR26',relacion:'Capacitación previa de la cuadrilla',creadoPor:'Sistema · demostración',creadoEn:new Date().toISOString()}
  );
  DB.records.forEach(r => { if (r.medidaPreventiva == null) r.medidaPreventiva = r.accionPreventiva || ''; if (r.elementoConstructivo == null) r.elementoConstructivo = r.partida || r.sector || ''; if (r.familiaProblema == null) r.familiaProblema = ''; if (r.manualAcademyId == null) r.manualAcademyId = ''; });
  const ncr1 = DB.records.find(r => r.code === 'NCR-001' && r.tipo === 'NCR');
  DB.records.forEach(r => {
    if (!r.solucionPropuesta) r.solucionPropuesta = r.accionCorrectiva || '';
    if (r.materialSolucion == null) r.materialSolucion = '';
    if (r.procedimientoSolucion == null) r.procedimientoSolucion = '';
    if (r.observacionSolucion == null) r.observacionSolucion = '';
    if (r.costoNoCalidad == null) r.costoNoCalidad = 0;
    if (r.horasNoCalidad == null) r.horasNoCalidad = 0;
  });
  if (ncr1) { if (!ncr1.solucionInnovadora) ncr1.solucionInnovadora = defaultNcr1Solution(); if (!ncr1.condicionesContribuyentes) ncr1.condicionesContribuyentes = 'Congestión de armaduras y dificultad de acceso del vibrador en el sector revisado.'; save(); }
  // Migración de la aplicación: el proyecto real Arauco es el proyecto maestro.
  DB.projects = DB.projects.filter(p => p.id === '1735-48-LR26');
  const master = DB.projects[0];
  if (master) {
    master.programa = master.programa || 'DS10-PHR';
    master.modalidad = master.modalidad || 'Construcción en Sitio Residente';
    master.financiamiento = master.financiamiento || 'SERVIU Biobío';
    master.unidadMandante = master.unidadMandante || 'SECPLAN';
    master.empresaSupervision = master.empresaSupervision || 'Praxis Edificaciones';
    master.descripcion = master.descripcion || 'Construcción de 12 viviendas con subsidio habitacional DS10-PHR.';
    const b = [
      ['V-01','Juan Francisco Arévalo Huilipán','Carretera',-37.369289,-73.553276],['V-02','Rigoberto Ancalao Huaique','Carretera',-37.408842,-73.592554],['V-03','María Palmenia Pinto Solar','Carretera',-37.348756,-73.644695],
      ['V-04','Odita Griselda Lincopi Cisterna','Costa',-37.240392,-73.648223],['V-05','Rita Lugardi Alarcón Fernández','Costa',-37.180270,-73.606547],['V-06','Erika del Carmen Sandoval Fuentes','Costa',-37.176455,-73.600096],
      ['V-07','María Mercedes Sáez Urrutia','Carretera',-37.250687,-73.551223],['V-08','Pedro Alejandro Pinto Pérez','Carretera',-37.301010,-73.492143],['V-09','Luis Alberto Lozano Lozano','Carretera',-37.301779,-73.456598],
      ['V-10','Leonor Ibarra Friz','Carretera',-37.335643,-73.481553],['V-11','Ana María Torrez Poque','Carretera',-37.318834,-73.433882],['V-12','Domingo Ignacio Ancalao Lepillán','Carretera',-37.414727,-73.599244]
    ];
    master.frentes = b.map(([id,beneficiario,comite,lat,lng]) => { const old=(master.frentes||[]).find(f=>f.id===id); const idx=Number(id.slice(2)); const base={id,nombre:'Vivienda '+id.slice(2),beneficiario,comite,lat,lng,qr:null,tipoVivienda:tipoViviendaAsignado(idx),tipoViviendaEstado:'Asignación provisional aleatoria — sin antecedente individual'}; return Object.assign(base,old||{}, { beneficiario, comite, lat, lng, nombre: old?.nombre || base.nombre, tipoVivienda: (old?.tipoVivienda && old.tipoVivienda !== 'Por definir') ? old.tipoVivienda : base.tipoVivienda, tipoViviendaEstado: old?.tipoViviendaEstado || base.tipoViviendaEstado }); });
  }
  // Migración: los proyectos demo guardados con una empresa real como contratista pasan a un valor neutral
  const DEMO_IDS = ['1735-48-LR26', '2210-15-LR26', '1802-09-LR26'];
  let migrado = false;
  DB.projects.forEach(p => { if (DEMO_IDS.includes(p.id) && p.contratista === 'Constructiva Sur S.A.') { p.contratista = 'Contratista de demostración'; migrado = true; } });
  if (migrado) save();
}
const emptyDB = () => ({ projects: [], records: [], inspections: [], evidences: [], lessons: [], dis: [], trainings: [], recurrenceReviews: [], holdPoints: [], toolChecks: [], toolboxTalks: [], enhancedControls: [], inventoryItems: [], inventoryMovements: [], riskMatrix: [] });
const TIPO_ASIGNACION = ['B','C','A','C','A','B','C','A','B','A','C','B']; // distribución 4/4/4, provisional y aleatoria; no corresponde a un antecedente individual
const tipoViviendaAsignado = idx => TIPO_ASIGNACION[Math.max(0, idx - 1) % TIPO_ASIGNACION.length];

function defaultNcr1Solution() {
  return { activa: true, estado: 'Propuesta seleccionada', producto: 'SikaRep AR', problema: 'Nido de piedra de aproximadamente 2 L en radier.', precioSaco: 13990, presentacionKg: 25, densidadKgL: 1.9, cantidadSacos: 8, totalCompra: 111920, rendimientoSacoL: 13.16, consumoNidoKg: 3.8, consumo12NidosKg: 45.6, alternativas: [
    { producto: 'SikaRep AR', precio: 13990, evaluacion: 'Seleccionado', nota: 'Adecuado para reparación localizada y escala proporcional al defecto.' },
    { producto: 'Weber Mortero Reparación Estructural', precio: 12290, evaluacion: 'Alternativa', nota: 'Técnicamente válido, pero excluido por disponibilidad local utilizada en el análisis.' },
    { producto: 'Mapegrout Tixotrópico E', precio: 25072, evaluacion: 'Alternativa', nota: 'Técnicamente válido, pero de mayor costo.' }
  ], justificacion: 'Se selecciona SikaRep AR por su adecuación a una reparación localizada, su escala apropiada para el defecto y la posibilidad de mantener un stock preventivo en el frente piloto.', logistica: 'Almacenar en bodega/caseta del frente piloto, protegido de lluvia y humedad, en envase original cerrado y con control de vencimiento.', prevencion: 'Relacionar la reparación con el checklist previo al hormigonado: accesibilidad, disponibilidad y operatividad del vibrador, diámetro, operador, plan de vibrado y control de segregación.', observacion: 'Los 8 sacos corresponden a stock preventivo planificado, no al consumo exacto de un solo nido.' };
}

const demoImg = (t, c) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="${c}"/><text x="200" y="125" font-family="Arial" font-size="20" fill="#ffffff" text-anchor="middle">${t}</text></svg>`);

function demoData() {
  const db = emptyDB();
  const frentes = [];
  for (let i = 1; i <= 12; i++) frentes.push({ id: 'V-' + pad(i), nombre: 'Vivienda ' + pad(i), lat: null, lng: null, qr: null });
  const PID = '1735-48-LR26';
  const beneficiaries = [
    ['V-01','Juan Francisco Arévalo Huilipán','Carretera',-37.369289,-73.553276],
    ['V-02','Rigoberto Ancalao Huaique','Carretera',-37.408842,-73.592554],
    ['V-03','María Palmenia Pinto Solar','Carretera',-37.348756,-73.644695],
    ['V-04','Odita Griselda Lincopi Cisterna','Costa',-37.240392,-73.648223],
    ['V-05','Rita Lugardi Alarcón Fernández','Costa',-37.180270,-73.606547],
    ['V-06','Erika del Carmen Sandoval Fuentes','Costa',-37.176455,-73.600096],
    ['V-07','María Mercedes Sáez Urrutia','Carretera',-37.250687,-73.551223],
    ['V-08','Pedro Alejandro Pinto Pérez','Carretera',-37.301010,-73.492143],
    ['V-09','Luis Alberto Lozano Lozano','Carretera',-37.301779,-73.456598],
    ['V-10','Leonor Ibarra Friz','Carretera',-37.335643,-73.481553],
    ['V-11','Ana María Torrez Poque','Carretera',-37.318834,-73.433882],
    ['V-12','Domingo Ignacio Ancalao Lepillán','Carretera',-37.414727,-73.599244]
  ];
  const frentesReal = beneficiaries.map(([id,beneficiario,comite,lat,lng], idx) => ({ id, nombre:'Vivienda '+id.slice(2), beneficiario, comite, lat, lng, qr:null, tipoVivienda:TIPO_ASIGNACION[idx], tipoViviendaEstado:'Asignación provisional aleatoria — sin antecedente individual' }));
  db.projects.push({
    id: PID, nombre: 'Construcción de 12 Viviendas con Subsidio', mandante: 'I. Municipalidad de Arauco', contratista: 'Contratista de demostración', empresaSupervision: 'Praxis Edificaciones', ubicacion: 'Arauco, Biobío', estado: 'En ejecución',
    inicio: addDays(-90), termino: addDays(180), responsable: 'Supervisor de Calidad',
    descripcion: 'Construcción de 12 viviendas con subsidio habitacional DS10-PHR, modalidad Construcción en Sitio Residente.',
    programa:'DS10-PHR', modalidad:'Construcción en Sitio Residente', financiamiento:'SERVIU Biobío', unidadMandante:'SECPLAN',
    publicacion:'20-08-2026', cierreLicitacion:'30-09-2026 16:30', adjudicacionIndicada:'16-10-2026 15:30',
    contextoSocial:'Ámbito social: proyecto con presencia indígena documentada en su contexto. La pertenencia individual debe acreditarse únicamente cuando exista antecedente específico.',
    memoriaEstructural:'Memoria de cálculo – Construcción vivienda DS 10 Costa-Carretera, comuna de Arauco (Municipalidad de Arauco, SECPLAN, 2025).',
    tipologias:[{tipo:'A',superficie:'67,86 m²'},{tipo:'B',superficie:'72,54 m²'},{tipo:'C',superficie:'93,03 m²'}],
    frentes: frentesReal, lat:null, lng:null
  });
  const mk = (o) => Object.assign({ verificaciones: [], fechaCierre: '', requisito: '', timeline: [] }, o);
  db.records.push(
    mk({ uid: 'r-ncr1', code: 'NCR-001', tipo: 'NCR', projectId: PID, frenteId: 'V-04', titulo: 'Nido de piedra en radier', fecha: addDays(-3), sector: 'Radier', partida: 'Radier de hormigón', especialidad: 'Hormigón', criticidad: 'Mayor', categoriaCausa: 'Método / procedimiento',
      descripcion: 'Posterior al retiro del moldaje se detectó un nido de piedra en el radier, evidenciando segregación y presencia de vacíos.',
      requisito: 'Especificaciones técnicas: hormigón compacto, sin segregación ni vacíos.',
      causaInmediata: 'Deficiente compactación/vibración.', causaSistemica: 'Insuficiente control durante el proceso de colocación y compactación.',
      accionCorrectiva: 'Retiro del material suelto y reparación mediante procedimiento aprobado.', accionPreventiva: 'Reforzar el control del proceso de vibrado y accesibilidad del vibrador.',
      condicionesContribuyentes: 'Congestión de armaduras y dificultad de acceso del vibrador en el sector revisado.',
      solucionInnovadora: { activa: true, estado: 'Propuesta seleccionada', producto: 'SikaRep AR', problema: 'Nido de piedra de aproximadamente 2 L en radier.', precioSaco: 13990, presentacionKg: 25, densidadKgL: 1.9, cantidadSacos: 8, totalCompra: 111920, rendimientoSacoL: 13.16, consumoNidoKg: 3.8, consumo12NidosKg: 45.6, alternativas: [
        { producto: 'SikaRep AR', precio: 13990, evaluacion: 'Seleccionado', nota: 'Adecuado para reparación localizada y escala proporcional al defecto.' },
        { producto: 'Weber Mortero Reparación Estructural', precio: 12290, evaluacion: 'Alternativa', nota: 'Técnicamente válido, pero excluido por disponibilidad local utilizada en el análisis.' },
        { producto: 'Mapegrout Tixotrópico E', precio: 25072, evaluacion: 'Alternativa', nota: 'Técnicamente válido, pero de mayor costo.' }
      ], justificacion: 'Se selecciona SikaRep AR por su adecuación a una reparación localizada, su escala apropiada para el defecto y la posibilidad de mantener un stock preventivo en el frente piloto.', logistica: 'Almacenar en bodega/caseta del frente piloto, protegido de lluvia y humedad, en envase original cerrado y con control de vencimiento.', prevencion: 'Relacionar la reparación con el checklist previo al hormigonado: accesibilidad, disponibilidad y operatividad del vibrador, diámetro, operador, plan de vibrado y control de segregación.', observacion: 'Los 8 sacos corresponden a stock preventivo planificado, no al consumo exacto de un solo nido.' },
      responsable: 'Jefe de Obra', fechaCompromiso: addDays(2), estado: 'En corrección',
      timeline: [{ fecha: addDays(-3), estado: 'Detectado', nota: 'Detectado al retirar moldaje' }, { fecha: addDays(-2), estado: 'En evaluación', nota: 'Evaluación de extensión y causa' }, { fecha: addDays(-1), estado: 'En corrección', nota: 'Inicio de reparación' }] }),
    mk({ uid: 'r-ncr2', code: 'NCR-002', tipo: 'NCR', projectId: PID, frenteId: 'V-02', titulo: 'Segregación en pilar de hormigón', fecha: addDays(-20), sector: 'Pilar eje B', partida: 'Hormigón estructural', especialidad: 'Estructura', criticidad: 'Menor', categoriaCausa: 'Equipos',
      descripcion: 'Segregación superficial en pilar, sin exposición de armadura.',
      requisito: 'Superficie de hormigón sin segregación (EETT).',
      causaInmediata: 'Vibrador sin potencia suficiente.', causaSistemica: 'No se verifica estado del equipo antes del hormigonado.',
      accionCorrectiva: 'Reparación con mortero de reparación estructural.', accionPreventiva: 'Verificar operatividad del vibrador en el checklist previo.',
      responsable: 'Jefe de Obra', fechaCompromiso: addDays(-14), estado: 'Cerrado', fechaCierre: addDays(-12),
      verificaciones: [{ resultado: 'Conforme', fecha: addDays(-12), responsable: 'Supervisor de Calidad', obs: 'Reparación terminada y aceptada.' }],
      timeline: [{ fecha: addDays(-20), estado: 'Detectado', nota: '' }, { fecha: addDays(-19), estado: 'En evaluación', nota: '' }, { fecha: addDays(-17), estado: 'En corrección', nota: '' }, { fecha: addDays(-13), estado: 'Pendiente de verificación', nota: '' }, { fecha: addDays(-12), estado: 'Verificación', nota: 'Resultado: Conforme' }, { fecha: addDays(-12), estado: 'Cerrado', nota: '' }] }),
    mk({ uid: 'r-dh1', code: 'DH-001', tipo: 'DH', projectId: PID, frenteId: 'V-03', titulo: 'Recubrimiento irregular en armadura de radier', fecha: addDays(-2), sector: 'Radier', partida: 'Enfierradura', especialidad: 'Hormigón', criticidad: 'Menor', categoriaCausa: 'Control / supervisión',
      descripcion: 'Se observan separadores insuficientes que podrían afectar el recubrimiento.', requisito: 'Recubrimiento mínimo según planos de estructura.',
      causaInmediata: 'Separadores insuficientes.', causaSistemica: '', accionCorrectiva: '', accionPreventiva: '', responsable: 'Capataz Enfierradura', fechaCompromiso: addDays(5), estado: 'Detectado',
      timeline: [{ fecha: addDays(-2), estado: 'Detectado', nota: '' }] }),
    mk({ uid: 'r-dh2', code: 'DH-002', tipo: 'DH', projectId: PID, frenteId: 'V-01', titulo: 'Fisuras en estuco exterior', fecha: addDays(-6), sector: 'Fachada', partida: 'Estuco exterior', especialidad: 'Terminaciones', criticidad: 'Menor', categoriaCausa: 'Materiales',
      descripcion: 'Fisuras finas en estuco, posible retracción por curado deficiente.', requisito: 'Terminación sin fisuras visibles (EETT).',
      causaInmediata: 'Curado insuficiente.', causaSistemica: '', accionCorrectiva: 'Sellado y re-estucado local.', accionPreventiva: '', responsable: 'Jefe de Terminaciones', fechaCompromiso: addDays(8), estado: 'En evaluación',
      timeline: [{ fecha: addDays(-6), estado: 'Detectado', nota: '' }, { fecha: addDays(-5), estado: 'En evaluación', nota: '' }] }),
    mk({ uid: 'r-dh3', code: 'DH-003', tipo: 'DH', projectId: PID, frenteId: 'V-05', titulo: 'Prueba de presión sanitaria sin registro', fecha: addDays(-9), sector: 'Red sanitaria', partida: 'Agua potable', especialidad: 'Instalaciones', criticidad: 'Mayor', categoriaCausa: 'Método / procedimiento',
      descripcion: 'No se encontró el registro de la prueba de presión previa al cubrimiento de cañerías.', requisito: 'Protocolo de prueba de presión de agua potable.',
      causaInmediata: 'Prueba realizada sin protocolo.', causaSistemica: 'Protocolos no disponibles en terreno.', accionCorrectiva: 'Repetir prueba y registrar protocolo.', accionPreventiva: 'Disponer protocolos impresos en bodega.', responsable: 'Instalador sanitario', fechaCompromiso: addDays(-1), estado: 'En corrección',
      timeline: [{ fecha: addDays(-9), estado: 'Detectado', nota: '' }, { fecha: addDays(-8), estado: 'En evaluación', nota: '' }, { fecha: addDays(-4), estado: 'En corrección', nota: '' }] })
  );
  // Inspecciones: una realizada con riesgo ALTO (genera alerta) y una pendiente
  const resp = {};
  TODAS_CLAVES.forEach(k => resp[k] = 'si');
  resp.accesoV = 'no'; resp.interf = 'no'; resp.accesoA = 'no'; resp.plan = 'no';
  db.inspections.push(
    { id: 'i-1', projectId: PID, fecha: addDays(-1), tipo: TIPO_INSP, sector: 'Radier vivienda 05', responsable: 'Supervisor de Calidad', estado: 'Realizada', metodo: 'Camión mixer directo (chute)', respuestas: resp, riesgo: calcRiesgo(resp, 'Camión mixer directo (chute)'), observaciones: 'Armadura congestionada en encuentro de cadenas; vibrador no entra.', resultado: 'No conforme', atendida: false },
    { id: 'i-2', projectId: PID, fecha: addDays(2), tipo: TIPO_INSP, sector: 'Radier vivienda 06', responsable: 'Supervisor de Calidad', estado: 'Pendiente', metodo: '', respuestas: {}, riesgo: null, observaciones: '', resultado: '', atendida: false }
  );
  // Evidencias
  db.evidences.push(
    { id: 'e-1', recId: 'r-ncr1', projectId: PID, momento: 'ANTES', tipo: 'Fotografía', descripcion: 'Foto del nido de piedra', fecha: addDays(-3), img: demoImg('Foto del nido', '#7a6a5a'), archivo: '' },
    { id: 'e-2', recId: 'r-ncr1', projectId: PID, momento: 'DURANTE', tipo: 'Fotografía', descripcion: 'Retiro del material suelto', fecha: addDays(-1), img: demoImg('Retiro del material', '#5d6d7e'), archivo: '' },
    { id: 'e-3', recId: 'r-ncr2', projectId: PID, momento: 'ANTES', tipo: 'Fotografía', descripcion: 'Segregación en pilar', fecha: addDays(-20), img: demoImg('Segregación en pilar', '#7a6a5a'), archivo: '' },
    { id: 'e-4', recId: 'r-ncr2', projectId: PID, momento: 'DESPUÉS', tipo: 'Fotografía', descripcion: 'Reparación terminada', fecha: addDays(-13), img: demoImg('Reparación terminada', '#3e7d52'), archivo: '' }
  );
  db.lessons.push({ id: 'l-1', recId: 'r-ncr2', projectId: PID, fecha: addDays(-12), problema: 'Segregación en pilar de hormigón', causa: 'Vibrador sin potencia suficiente; no se verificó el equipo antes de hormigonar.', solucion: 'Reparación con mortero estructural.', medida: 'Verificar disponibilidad y operatividad del vibrador en el checklist previo.', recomendacion: 'Contar con un vibrador de respaldo en cada hormigonado.' });
  return db;
}

/* ============ 4. LÓGICA DE NEGOCIO ============ */
const getProj = id => DB.projects.find(p => p.id === id);
const getRec = id => DB.records.find(r => r.uid === id);
const isOpen = r => r.estado !== 'Cerrado';

function nextCode(tipo) {
  const nums = DB.records.filter(r => r.tipo === tipo).map(r => parseInt(r.code.split('-')[1], 10) || 0);
  return tipo + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

/* Riesgo de nido de piedra a partir de las respuestas del checklist */
function calcRiesgo(resp, metodo) {
  let score = 0, nneg = 0; const neg = [];
  Object.keys(resp).forEach(k => { if (resp[k] === 'no') nneg++; });
  Object.keys(PESOS).forEach(k => { if (resp[k] === 'no') { score += PESOS[k]; neg.push(k); } });
  const mensajes = neg.sort((a, b) => PESOS[b] - PESOS[a]).map(k => MSG_RIESGO[k]);
  if (metodo === 'Carretilla' || metodo === 'Camión mixer directo (chute)') {
    score += 1; mensajes.push('Método de colocación con mayor riesgo de segregación (' + metodo + ').');
  }
  const acceso = resp.accesoV === 'no' || resp.accesoA === 'no';
  let nivel = 'BAJO';
  if (acceso || score >= 5 || nneg >= 4) nivel = 'ALTO';
  else if (score >= 2 || nneg >= 2) nivel = 'MEDIO';
  const recomendacion = {
    ALTO: 'Riesgo de formación de nidos de piedra. Se recomienda revisar la accesibilidad del vibrador y el método de compactación antes de continuar con el hormigonado.',
    MEDIO: 'Riesgo moderado de nidos de piedra. Corregir las condiciones observadas y reforzar la supervisión durante la compactación.',
    BAJO: 'Condiciones favorables para una compactación adecuada. Mantener el control durante el hormigonado.'
  }[nivel];
  const sinResponder = TODAS_CLAVES.filter(k => !resp[k]).length;
  return { nivel, score, mensajes, recomendacion, sinResponder };
}

/* Alertas preventivas calculadas (se pueden filtrar por proyecto) */
function getAlerts(pid) {
  const out = []; const t = hoy(); const lim = addDays(3);
  DB.inspections.filter(i => !pid || i.projectId === pid).forEach(i => {
    const link = '#/inspecciones';
    if (i.estado === 'Pendiente') {
      out.push({ nivel: i.fecha < t ? 'red' : 'yel', texto: 'Inspección pendiente: ' + i.tipo + ' (' + i.sector + ')', sub: (i.fecha < t ? 'Atrasada desde ' : 'Programada para ') + fmtFecha(i.fecha), projectId: i.projectId, inspId: i.id, link });
    } else if (i.riesgo && !i.atendida) {
      const ctx = i.sector + ' · ' + fmtFecha(i.fecha);
      if (i.riesgo.nivel === 'ALTO') out.push({ nivel: 'red', texto: 'Riesgo ALTO de nido de piedra en ' + i.sector, sub: ctx, projectId: i.projectId, inspId: i.id, link });
      else if (i.riesgo.nivel === 'MEDIO') out.push({ nivel: 'yel', texto: 'Riesgo MEDIO de nido de piedra en ' + i.sector, sub: ctx, projectId: i.projectId, inspId: i.id, link });
      ['accesoV', 'accesoA', 'vdisp', 'voper'].forEach(k => { if (i.respuestas[k] === 'no') out.push({ nivel: 'yel', texto: MSG_RIESGO[k], sub: ctx, projectId: i.projectId, inspId: i.id, link }); });
    }
  });
  DB.records.filter(r => (!pid || r.projectId === pid) && isOpen(r)).forEach(r => {
    const link = '#/registro/' + enc(r.uid);
    if (r.tipo === 'NCR' && !String(r.accionCorrectiva || '').trim()) {
      if (r.criticidad === 'Crítica') out.push({ nivel: 'red', texto: r.code + ' crítica sin acción correctiva', sub: r.titulo, projectId: r.projectId, recId: r.uid, link });
      else if (r.criticidad === 'Mayor') out.push({ nivel: 'yel', texto: r.code + ' mayor sin acción correctiva', sub: r.titulo, projectId: r.projectId, recId: r.uid, link });
    }
    if (r.fechaCompromiso) {
      if (r.fechaCompromiso < t) out.push({ nivel: r.tipo === 'NCR' ? 'red' : 'yel', texto: r.code + ' vencida', sub: r.titulo + ' · compromiso ' + fmtFecha(r.fechaCompromiso), projectId: r.projectId, recId: r.uid, link });
      else if (r.fechaCompromiso <= lim) out.push({ nivel: 'yel', texto: r.code + ' próxima a vencer', sub: r.titulo + ' · compromiso ' + fmtFecha(r.fechaCompromiso), projectId: r.projectId, recId: r.uid, link });
    }
  });
  if (typeof recurrenceGroups === 'function') recurrenceGroups().filter(g => (!pid || g.projectId === pid)).forEach(g => out.push({nivel:g.confirmed?'red':'yel',texto:g.confirmed?'Capacitación obligatoria por reincidencia':'Posible reincidencia: revisar NCR similares',sub:g.elemento+' · '+g.records.length+' ocurrencias · '+g.familia,projectId:g.projectId,link:'#/academy/reincidencia'}));
  (DB.holdPoints||[]).filter(h => (!pid || h.projectId===pid) && h.estado!=='Autorizado').forEach(h=>out.push({nivel:'red',texto:'Punto de detención sin autorización',sub:h.elemento+' · '+h.partida,projectId:h.projectId,link:'#/prevent/hold'}));
  (DB.toolChecks||[]).filter(t=>(!pid||t.projectId===pid)&&t.estado==='Fuera de servicio').forEach(t=>out.push({nivel:'red',texto:'Equipo fuera de servicio: '+t.herramienta,sub:t.identificador||t.elemento||'Aislar e identificar según procedimiento',projectId:t.projectId,link:'#/prevent/tools'}));
  (DB.inventoryItems||[]).filter(x=>(!pid||x.projectId===pid)&&['Bloqueado','Fuera de servicio'].includes(x.estado)).forEach(x=>out.push({nivel:'red',texto:'Activo bloqueado: '+x.codigo,sub:x.nombre+' · no asignar hasta liberación documentada',projectId:x.projectId,link:'#/prevent/inventory'}));
  (DB.inventoryItems||[]).filter(x=>(!pid||x.projectId===pid)&&x.proximaInspeccion&&x.proximaInspeccion<hoy()&&!['Fuera de servicio','Retirado'].includes(x.estado)).forEach(x=>out.push({nivel:'yel',texto:'Inspección de activo vencida: '+x.codigo,sub:x.nombre+' · última revisión '+(x.ultimaInspeccion||'no registrada'),projectId:x.projectId,link:'#/prevent/inventory'}));
  (DB.riskMatrix||[]).filter(x=>(!pid||x.projectId===pid)&&riskScore(x)>=10&&x.estado!=='Cerrado').forEach(x=>out.push({nivel:'red',texto:'Riesgo alto sin cierre: '+x.actividad,sub:x.peligro+' · '+riskScore(x)+'/25 · responsable '+(x.responsable||'sin asignar'),projectId:x.projectId,link:'#/prevent/risk'}));
  (DB.enhancedControls||[]).filter(x=>(!pid||x.projectId===pid)&&x.estado!=='Completado').forEach(x=>out.push({nivel:x.estado==='Requiere revisión'?'red':'yel',texto:x.estado==='Requiere revisión'?'Seguimiento preventivo requiere revisión':'Seguimiento reforzado pendiente',sub:x.elemento+' · '+(x.resultados||[]).length+'/'+x.cantidad+' controles',projectId:x.projectId,link:'#/prevent/followup'}));
  (DB.trainings||[]).filter(t => (!pid || t.projectId === pid) && t.estado !== 'Verificado en terreno').forEach(t => out.push({nivel:t.estado==='Pendiente'?'red':'yel',texto:'Capacitación preventiva pendiente: '+t.nombre,sub:(ACADEMY_MANUALS.find(m=>m.id===t.manualId)?.titulo||t.manualId)+' · '+t.elemento,projectId:t.projectId,link:'#/academy/asignaciones'}));
  return out.sort((a, b) => (a.nivel === 'red' ? 0 : 1) - (b.nivel === 'red' ? 0 : 1));
}

/* Semáforo de calidad del proyecto: g=conforme, y=atención, r=crítico */
function projSem(p) {
  const al = getAlerts(p.id); const open = DB.records.filter(r => r.projectId === p.id && isOpen(r));
  if (al.some(a => a.nivel === 'red') || open.some(r => r.criticidad === 'Crítica')) return 'r';
  if (al.length || open.length) return 'y';
  return 'g';
}
const SEM_LABEL = { g: 'Conforme', y: 'Atención', r: 'Crítico' };

function countBy(list, fn) {
  const m = {}; list.forEach(x => { const k = fn(x) || 'Sin dato'; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function relatedLessons() {
  return DB.lessons.filter(l => /nido|segreg|compact|vibr/i.test(l.problema + ' ' + l.causa + ' ' + l.medida));
}

/* ============ 5. COMPONENTES ============ */
function badgeEstado(e) {
  const c = { 'Detectado': 'b-gray', 'En evaluación': 'b-blue', 'En corrección': 'b-yel', 'Pendiente de verificación': 'b-yel', 'Cerrado': 'b-grn' }[e] || 'b-gray';
  const ic = { 'Detectado': '⚪', 'En evaluación': '🔵', 'En corrección': '🟡', 'Pendiente de verificación': '🟠', 'Cerrado': '🟢' }[e] || '';
  return `<span class="badge ${c}">${ic} ${esc(e)}</span>`;
}
function badgeCrit(c) {
  const m = { 'Menor': ['b-yel', '🟡'], 'Mayor': ['b-red', '🔴'], 'Crítica': ['b-crit', '🔴'] }[c] || ['b-gray', ''];
  return `<span class="badge ${m[0]}">${m[1]} ${esc(c)}</span>`;
}
const semBadge = s => `<span class="sem"><span class="dot ${s}"></span>${SEM_LABEL[s]}</span>`;
function vencBadge(r) {
  if (!isOpen(r) || !r.fechaCompromiso) return '';
  if (r.fechaCompromiso < hoy()) return ' <span class="badge b-red">Vencida</span>';
  if (r.fechaCompromiso <= addDays(3)) return ' <span class="badge b-yel">Por vencer</span>';
  return '';
}
function alertHTML(a) {
  return `<div class="alert ${a.nivel} ${a.link ? 'link' : ''}" ${a.link ? `data-go="${a.link}"` : ''}><span>${a.nivel === 'red' ? '🔴' : '⚠️'}</span><div>${esc(a.texto)}${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</div></div>`;
}
const alertsBlock = (list, vacio) => list.length ? list.map(alertHTML).join('') : `<div class="muted small">${vacio || 'Sin alertas.'}</div>`;
function opts(list, sel, placeholder) {
  return (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '') + list.map(o => {
    const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('');
}
const projOpts = (sel, ph) => opts(DB.projects.map(p => [p.id, p.id + ' · ' + p.nombre]), sel, ph);
const fv = k => esc(UI.f[k] || '');
const stat = (lbl, num, cls = '') => `<div class="stat ${cls}"><div class="lbl">${lbl}</div><div class="num">${num}</div></div>`;
const kv = (k, v) => `<div><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
const blockTxt = (t, v) => `<div class="block"><h4>${t}</h4><div>${v ? esc(v) : '<span class="muted">Sin información</span>'}</div></div>`;

function bars(entries) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.length ? entries.map(([k, v]) => `<div class="bar-row"><span class="lb">${esc(k)}</span><span class="bar"><i style="width:${v / max * 100}%"></i></span><span class="ct">${v}</span></div>`).join('') : '<div class="muted small">Sin datos.</div>';
}

function recTable(list, showProj = true) {
  if (!list.length) return '<div class="empty">No hay registros.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Título</th>${showProj ? '<th>Proyecto</th>' : ''}<th>Criticidad</th><th>Estado</th><th>Compromiso</th></tr></thead><tbody>${list.map(r =>
    `<tr class="click" data-go="#/registro/${enc(r.uid)}"><td><b>${esc(r.code)}</b></td><td>${esc(r.titulo)}<div class="small muted">${esc(r.sector)} · ${esc(r.especialidad)}</div></td>${showProj ? `<td>${esc(r.projectId)}</td>` : ''}<td>${badgeCrit(r.criticidad)}</td><td>${badgeEstado(r.estado)}</td><td>${fmtFecha(r.fechaCompromiso)}${vencBadge(r)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* Modal y avisos */
function openModal(title, body, wide) {
  $('#modal').style.maxWidth = wide ? '860px' : '720px';
  $('#modal').innerHTML = `<div class="modal-head"><h3>${title}</h3><button class="btn btn-sec btn-sm" data-act="close">✕</button></div>${body}`;
  $('#modal-wrap').classList.add('open');
}
const closeModal = () => { $('#modal-wrap').classList.remove('open'); $('#modal').innerHTML = ''; };
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
}
let confirmCb = null;
function confirmDlg(msg, cb, label = 'Eliminar') {
  confirmCb = cb;
  openModal('Confirmar', `<p>${esc(msg)}</p><div class="modal-foot"><button class="btn btn-sec" data-act="close">Cancelar</button><button class="btn btn-danger" data-act="confirm-yes">${label}</button></div>`);
}

/* ============ 6. VISTAS ============ */


/* ---- PRAXIS QUALITY HUB ---- */
function praxisStats(pid){
  const recs=DB.records.filter(r=>!pid||r.projectId===pid), ncr=recs.filter(r=>r.tipo==='NCR'), dh=recs.filter(r=>r.tipo==='DH');
  const insp=DB.inspections.filter(i=>!pid||i.projectId===pid), p=pid?getProj(pid):DB.projects[0];
  const fronts=p?(p.frentes||[]):[];
  const openN=ncr.filter(isOpen).length, openD=dh.filter(isOpen).length;
  const closed=ncr.filter(r=>!isOpen(r)).length, compliance=ncr.length?Math.round(closed/ncr.length*100):null;
  const high=insp.filter(i=>i.riesgo&&i.riesgo.nivel==='ALTO').length;
  const att=insp.filter(i=>i.riesgo&&i.riesgo.nivel==='MEDIO').length;
  return {recs,ncr,dh,insp,fronts,openN,openD,closed,compliance,high,att,p};
}
function riskRadarHTML(pid){
  const x=praxisStats(pid), risks=[];
  const add=(name,count,level,note)=>{ if(count) risks.push({name,count,level,note}); };
  add('Acceso del vibrador',x.insp.filter(i=>i.respuestas&&['accesoV','accesoA'].some(k=>i.respuestas[k]==='no')).length,'ALTO','Verificar accesibilidad entre armaduras antes del hormigonado.');
  add('Compactación / vibración',x.insp.filter(i=>i.respuestas&&['vdisp','voper','opdisp','plan'].some(k=>i.respuestas[k]==='no')).length,'ALTO','Reforzar control de equipos, operador y plan de vibrado.');
  add('Segregación',x.insp.filter(i=>i.respuestas&&i.respuestas.segreg==='no').length,'ALTO','Revisar recepción, colocación y compactación.');
  add('Interferencias de armadura',x.insp.filter(i=>i.respuestas&&i.respuestas.interf==='no').length,'MEDIO','Revisar interferencias y acceso del vibrador.');
  add('NCR abiertas',x.openN,x.openN>=3?'ALTO':x.openN?'MEDIO':'BAJO','Priorizar cierre y verificación de no conformidades.');
  if(!risks.length) return '<div class="empty">🟢 Sin riesgos prioritarios detectados con los datos actuales.</div>';
  const rank={ALTO:0,MEDIO:1,BAJO:2}; risks.sort((a,b)=>rank[a.level]-rank[b.level]||b.count-a.count);
  return `<div class="risk-radar">${risks.slice(0,6).map((r,i)=>`<div class="risk-radar-row"><div class="risk-index">${String(i+1).padStart(2,'0')}</div><div class="risk-main"><b>${esc(r.name)}</b><span>${esc(r.note)}</span></div><div class="risk-count">${r.count}</div><span class="risk-level ${r.level.toLowerCase()}">${r.level}</span></div>`).join('')}</div>`;
}
function solutionLibraryHTML(pid){
  const recs=DB.records.filter(r=>(!pid||r.projectId===pid)&&String(r.solucionPropuesta||r.accionCorrectiva||'').trim());
  const lessons=DB.lessons.filter(l=>!pid||l.projectId===pid);
  const all=[];
  recs.forEach(r=>all.push({type:'NCR',title:r.titulo,problem:r.descripcion,solution:r.solucionPropuesta||r.accionCorrectiva,material:r.materialSolucion,prevent:r.accionPreventiva,code:r.code,id:r.uid}));
  lessons.forEach(l=>all.push({type:'LECCIÓN',title:l.problema,problem:l.problema,solution:l.solucion,material:'',prevent:l.medida,code:'Lección',id:l.id}));
  if(!all.length) return '<div class="empty">Aún no hay soluciones registradas para alimentar la biblioteca.</div>';
  return `<div class="solution-library">${all.slice(0,8).map(x=>`<article class="solution-entry"><div class="solution-entry-top"><span class="badge b-blue">${esc(x.type)}</span><b>${esc(x.code)}</b></div><h4>${esc(x.title)}</h4><div class="small muted">Problema</div><p>${esc(x.problem||'—')}</p><div class="small muted">Solución</div><p>${esc(x.solution||'—')}</p>${x.material?`<div class="pill-line"><span>🧱 ${esc(x.material)}</span></div>`:''}${x.prevent?`<div class="small"><b>Prevención:</b> ${esc(x.prevent)}</div>`:''}</article>`).join('')}</div>`;
}
function vPraxisHub(){
  const p=DB.projects.find(x=>x.id==='1735-48-LR26'), x=praxisStats(p&&p.id), fronts=x.fronts;
  const ok=fronts.filter(f=>{const rs=x.recs.filter(r=>r.frenteId===f.id&&r.tipo==='NCR');return !rs.some(isOpen)}).length;
  const attention=fronts.filter(f=>{const rs=x.recs.filter(r=>r.frenteId===f.id&&r.tipo==='NCR');return rs.some(r=>isOpen(r)&&r.criticidad!=='Crítica')}).length;
  const critical=fronts.length-ok-attention;
  return `<div class="praxis-cover"><div><div class="praxis-eyebrow">PRAXIS EDIFICACIONES · CONTROL DE CALIDAD</div><h1>PRAXIS<br><span>QUALITY HUB</span></h1><p>Centro de supervisión, prevención y trazabilidad del proyecto 1735-48-LR26.</p><div class="row"><a class="btn btn-light" href="#/proyecto/${enc(p.id)}/viviendas">🏠 Ver las 12 viviendas</a><a class="btn btn-outline-light" href="#/terreno">📱 Modo terreno</a></div></div><div class="praxis-mark"><strong>12</strong><span>VIVIENDAS</span></div></div>
  <div class="grid stats praxis-stats">${stat('Conformidad',x.compliance===null?'Sin datos':x.compliance+'%','grn')}${stat('NCR abiertas',x.openN,'red')}${stat('NCR cerradas',x.closed,'grn')}${stat('Inspecciones',x.insp.filter(i=>i.estado==='Realizada').length)}${stat('Riesgos altos',x.high,x.high?'red':'grn')}${stat('Viviendas conformes',ok,'grn')}</div>
  <div class="grid two" style="margin-top:1rem"><div class="card praxis-card"><div class="section-kicker">LECTURA EJECUTIVA</div><h2>Radar de riesgo</h2>${riskRadarHTML(p.id)}</div><div class="card praxis-card"><div class="section-kicker">INNOVACIÓN</div><h2>Soluciones Praxis</h2>${solutionLibraryHTML(p.id)}</div></div>
  <div class="card praxis-card" style="margin-top:1rem"><div class="page-head"><div><div class="section-kicker">CONTROL VISUAL</div><h2 style="margin:.1rem 0">Mapa de estado de viviendas</h2><div class="muted small">🟢 ${ok} conformes · 🟡 ${attention} atención · 🔴 ${critical} críticas</div></div><a class="btn btn-sec" href="#/proyecto/${enc(p.id)}/viviendas">Abrir panel completo</a></div><div class="mini-housing-grid">${fronts.map(f=>{const rs=x.recs.filter(r=>r.frenteId===f.id&&r.tipo==='NCR'&&isOpen(r));const cls=rs.some(r=>r.criticidad==='Crítica')?'critical':rs.length?'attention':'ok';return `<a class="mini-house ${cls}" href="#/frente/${enc(p.id)}/${enc(f.id)}"><span>V-${f.id.slice(2)}</span><strong>⌂</strong><b>${rs.length?rs.length+' NCR abierta'+(rs.length>1?'s':''):'CONFORME'}</b></a>`}).join('')}</div></div>`;
}
function vModoTerreno(){
  const p=DB.projects.find(x=>x.id==='1735-48-LR26'), fs=p?(p.frentes||[]):[];
  return `<div class="terrain-head"><div><div class="section-kicker">PRAXIS EDIFICACIONES</div><h1>📱 MODO TERRENO</h1><p>Flujo rápido para inspeccionar una vivienda directamente desde el celular.</p></div><a class="btn btn-light" href="#/praxis">← Quality Hub</a></div>
  <div class="terrain-grid"><div class="terrain-main"><div class="terrain-step"><span>01</span><div><b>Selecciona la vivienda</b><select id="terrain-front">${fs.map(f=>`<option value="${esc(f.id)}">${esc(f.nombre)} · ${esc(f.beneficiario)}</option>`).join('')}</select></div></div><div class="terrain-step"><span>02</span><div><b>Inicia el control</b><p class="muted small">El sistema abre la inspección preventiva con la vivienda ya asociada.</p><button class="btn btn-primary" data-act="terrain-start">📋 Nueva inspección preventiva</button></div></div><div class="terrain-step"><span>03</span><div><b>Si no cumple → NCR automática</b><p class="muted small">Cada incumplimiento puede convertirse directamente en una NCR trazable.</p></div></div></div><div class="terrain-side"><div class="terrain-phone"><div class="phone-top">PRAXIS · OBRA CONTROL</div><div class="phone-screen"><div class="phone-chip">VIVIENDA ACTIVA</div><h2>🏠</h2><b id="terrain-name">${esc(fs[0]?.nombre||'Sin vivienda')}</b><p>${esc(fs[0]?.beneficiario||'')}</p><div class="phone-action">⚡ INSPECCIONAR</div><div class="phone-action">⚠️ NCR</div><div class="phone-action">📸 EVIDENCIA</div></div></div></div></div>`;
}


/* ---- Centro de control, alertas, calendario, costos y presentación ---- */
function roleCanClose(){ return ['Administrador Praxis','Supervisor / ITO','Encargado de Calidad','Jefe de Obra','Gerente de Proyecto','Jefe de oficina técnica'].includes(CURRENT_ROLE); }
function roleBar(){ return `<div class="role-bar"><div><b>👤 Sesión de ${esc(CURRENT_USER?.nombre||'Usuario')}</b><span class="muted small">Perfil: ${esc(CURRENT_USER?.rol||CURRENT_ROLE)} · acceso local de esta instalación.</span></div><span class="user-role-chip">${esc(CURRENT_USER?.rol||CURRENT_ROLE)}</span></div>`; }
function timelineProjectHTML(p){
  const events=[
    ['20-08-2026','Publicación de licitación','Inicio del proceso de contratación'],
    ['30-09-2026','Cierre de ofertas','Recepción de propuestas'],
    ['16-10-2026','Adjudicación indicada','Fecha indicada en antecedentes del proyecto'],
    [p.inicio||'','Inicio / ejecución','Control y seguimiento de obra'],
    [hoy(),'Control de calidad','Inspecciones, hallazgos y NCR']
  ];
  return `<div class="project-timeline">${events.map((e,i)=>`<div class="pt-item"><div class="pt-dot">${i+1}</div><div><b>${esc(e[1])}</b><span>${esc(e[0] ? (e[0].includes('-')&&e[0].length===10?fmtFecha(e[0]):e[0]) : 'Fecha por definir')}</span><p>${esc(e[2])}</p></div></div>`).join('')}</div>`;
}
function vControlCenter(){
  const p=DB.projects[0], alerts=getAlerts(p&&p.id), ncr=DB.records.filter(r=>r.tipo==='NCR'), open=ncr.filter(isOpen), verified=ncr.filter(r=>r.verificaciones&&r.verificaciones.length).length;
  const costs=ncr.reduce((a,r)=>a+(Number(r.costoNoCalidad)||0),0), comp=p?praxisStats(p.id).compliance:0;
  return `<div class="page-head"><div><div class="section-kicker">PRAXIS EDIFICACIONES</div><h2>Centro de control</h2><span class="muted small">Una vista ejecutiva para decidir qué atender primero.</span></div></div>${roleBar()}
  <div class="grid stats">${stat('Conformidad',comp+'%','grn')}${stat('Alertas',alerts.length,alerts.length?'red':'grn')}${stat('NCR abiertas',open.length,open.length?'red':'grn')}${stat('NCR verificadas',verified,'grn')}${stat('Costo no calidad','$'+costs.toLocaleString('es-CL'))}</div>
  <div class="grid two" style="margin-top:1rem"><div class="card"><div class="section-kicker">🚨 PRIORIDAD</div><h3>Centro de alertas</h3>${alertsBlock(alerts)||'<div class="empty">Sin alertas activas.</div>'}</div><div class="card"><div class="section-kicker">📉 TENDENCIA</div><h3>Evolución de NCR</h3>${trendHTML(ncr)}</div></div>
  <div class="grid two"><div class="card"><div class="section-kicker">💰 COSTO DE NO CALIDAD</div><h3>Impacto económico</h3>${costHTML(ncr)}</div><div class="card"><div class="section-kicker">📅 PLANIFICACIÓN</div><h3>Próximos controles</h3>${calendarMiniHTML(p)}</div></div>
  <div class="card"><div class="section-kicker">🧭 TRAZABILIDAD</div><h3>Línea de tiempo del proyecto</h3>${timelineProjectHTML(p)}</div>`;
}
function trendHTML(recs){
  const buckets={}; recs.forEach(r=>{const d=new Date(r.fecha||hoy()); const k=ymd(new Date(d.getFullYear(),d.getMonth(),1)); buckets[k]=(buckets[k]||0)+1;});
  const arr=Object.entries(buckets).sort().slice(-6); const max=Math.max(1,...arr.map(x=>x[1]));
  if(!arr.length) return '<div class="empty">Aún no hay NCR para calcular tendencia.</div>';
  return `<div class="trend-chart">${arr.map(([k,v])=>`<div class="trend-col"><b>${v}</b><div class="trend-bar" style="height:${Math.max(12,Math.round(v/max*110))}px"></div><span>${MESES[+k.split('-')[1]-1]}</span></div>`).join('')}</div><div class="notice">La tendencia es descriptiva; una disminución sostenida de NCR puede indicar mejora del control preventivo.</div>`;
}
function costHTML(recs){
  const total=recs.reduce((a,r)=>a+(Number(r.costoNoCalidad)||0),0); const items=recs.filter(r=>Number(r.costoNoCalidad)>0);
  return `<div class="cost-total">$${total.toLocaleString('es-CL')}<span>costo estimado registrado</span></div>${items.length?items.slice(0,5).map(r=>`<div class="cost-row"><span>${esc(r.code)} · ${esc(r.titulo)}</span><b>$${Number(r.costoNoCalidad).toLocaleString('es-CL')}</b></div>`).join(''):'<div class="muted small">Agrega costos en las NCR para construir el indicador económico.</div>'}`;
}
function calendarMiniHTML(p){
  const ins=(DB.inspections||[]).filter(i=>i.projectId===p?.id).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')).slice(0,6);
  return ins.length?ins.map(i=>`<div class="cal-row"><span>${fmtFecha(i.fecha)}</span><b>${esc(i.sector||'Control')}</b><span class="badge ${i.estado==='Realizada'?'b-grn':'b-yel'}">${esc(i.estado)}</span></div>`).join(''):'<div class="empty">No hay inspecciones planificadas.</div>';
}
function vAlertas(){ const p=DB.projects[0]; const a=getAlerts(p&&p.id); return `<div class="page-head"><div><h2>🔔 Centro de alertas</h2><span class="muted small">Pendientes que requieren atención de Praxis.</span></div></div>${roleBar()}<div class="alert-hero"><strong>${a.length}</strong><span>alertas activas</span></div><div class="card">${alertsBlock(a)||'<div class="empty">🎉 No hay alertas activas.</div>'}</div>`; }
function vCalendario(){ const p=DB.projects[0]; const ins=(DB.inspections||[]).filter(i=>i.projectId===p?.id); const groups={}; ins.forEach(i=>{const k=(i.fecha||'Sin fecha');(groups[k] ||= []).push(i)}); return `<div class="page-head"><div><h2>📅 Calendario de inspecciones</h2><span class="muted small">Agenda y seguimiento de controles de terreno.</span></div></div>${roleBar()}<div class="calendar-grid">${Object.entries(groups).sort().map(([d,l])=>`<div class="calendar-day"><div class="calendar-date">${fmtFecha(d)}</div>${l.map(i=>`<div class="calendar-event"><b>${esc(i.sector||'Control')}</b><span>${esc(i.frenteId||'Proyecto')}</span><small>${esc(i.estado)}</small></div>`).join('')}</div>`).join('') || '<div class="empty">No hay inspecciones registradas.</div>'}</div>`; }
function vPresentacion(){ const p=DB.projects[0], x=praxisStats(p.id), ncr=DB.records.filter(r=>r.tipo==='NCR'), open=ncr.filter(isOpen).length; return `<div class="presentation-shell"><div class="presentation-top"><div class="presentation-brand">PRAXIS EDIFICACIONES</div><button class="btn btn-light no-print" data-act="rep-print">🖨 Presentar / imprimir</button></div><div class="presentation-title"><span>OBRA CONTROL</span><h1>Supervisión, Calidad<br>y Prevención</h1><p>${esc(p.nombre)} · ${esc(p.ubicacion)}</p></div><div class="presentation-kpis"><div><strong>12</strong><span>VIVIENDAS</span></div><div><strong>${x.insp.filter(i=>i.estado==='Realizada').length}</strong><span>INSPECCIONES</span></div><div><strong>${ncr.length}</strong><span>NCR</span></div><div><strong>${x.compliance===null?'—':x.compliance+'%'}</strong><span>CONFORMIDAD</span></div></div><div class="presentation-status"><div><span>ESTADO GENERAL</span><strong>${open?'🟡 EN ATENCIÓN':'🟢 CONTROLADO'}</strong></div><div><span>EMPRESA DE SUPERVISIÓN</span><strong>PRAXIS EDIFICACIONES</strong></div></div><h3>Las 12 viviendas</h3><div class="presentation-houses">${(p.frentes||[]).map(f=>`<a href="#/frente/${enc(p.id)}/${enc(f.id)}"><b>${esc(f.id)}</b><span>⌂</span><small>${esc(f.beneficiario)}</small></a>`).join('')}</div><div class="presentation-foot">Proyecto ${esc(p.id)} · Sistema de control de calidad</div></div>`; }

/* ---- Dashboard ---- */
function vDashboard() {
  const recs = DB.records, al = getAlerts();
  const sems = DB.projects.map(projSem);
  const dhA = recs.filter(r => r.tipo === 'DH' && isOpen(r)).length;
  const ncrA = recs.filter(r => r.tipo === 'NCR' && isOpen(r)).length;
  const ncrC = recs.filter(r => r.tipo === 'NCR' && !isOpen(r)).length;
  const pend = DB.inspections.filter(i => i.estado === 'Pendiente').length;
  const ord = { 'Crítica': 0, 'Mayor': 1, 'Menor': 2 };
  const prio = recs.filter(isOpen).sort((a, b) => ord[a.criticidad] - ord[b.criticidad] || (a.fechaCompromiso || '9').localeCompare(b.fechaCompromiso || '9')).slice(0, 6);
  return `
  <div class="page-head"><div><h2>Dashboard</h2><span class="muted small">Resumen general de la empresa</span></div><div class="row no-print"><a class="btn btn-primary btn-sm" href="#/control">🎛️ Centro de control</a><a class="btn btn-sec btn-sm" href="#/presentacion">✨ Modo presentación</a></div></div>
  <div class="grid stats">
    ${stat('Proyectos activos', DB.projects.filter(p => p.estado === 'En ejecución').length)}
    ${stat('Proyectos con problemas', sems.filter(s => s !== 'g').length, 'yel')}
    ${stat('DH abiertos', dhA, 'yel')}
    ${stat('NCR abiertas', ncrA, 'red')}
    ${stat('NCR cerradas', ncrC, 'grn')}
    ${stat('Alertas preventivas', al.length, al.length ? 'red' : '')}
    ${stat('Inspecciones pendientes', pend)}
  </div>
  <div class="card" style="margin-top:1rem"><h3>Estado de calidad por proyecto</h3>
    <div class="semaforo"><span class="sem"><span class="dot g"></span>🟢 Conforme: ${sems.filter(s => s === 'g').length}</span><span class="sem"><span class="dot y"></span>🟡 Atención: ${sems.filter(s => s === 'y').length}</span><span class="sem"><span class="dot r"></span>🔴 Crítico: ${sems.filter(s => s === 'r').length}</span></div>
  </div>
  <div class="grid two">
    <div class="card"><h3>Problemas que requieren atención</h3>${prio.length ? recTable(prio) : '<div class="empty">Sin problemas abiertos 🎉</div>'}</div>
    <div class="card"><h3>Alertas preventivas</h3>${alertsBlock(al.slice(0, 8), 'Sin alertas activas.')}${al.length > 8 ? `<div class="muted small">… y ${al.length - 8} más</div>` : ''}</div>
  </div>`;
}

/* ---- Proyectos ---- */
function vProyectos() {
  UI.list = () => {
    const q = (UI.f.pq || '').toLowerCase(), e = UI.f.pe || '';
    const list = DB.projects.filter(p => p.id === '1735-48-LR26' && (!e || p.estado === e) && (!q || (p.id + p.nombre + p.mandante + p.ubicacion + p.responsable).toLowerCase().includes(q)));
    $('#list').innerHTML = list.length ? `<div class="table-wrap"><table><thead><tr><th>Calidad</th><th>ID</th><th>Proyecto</th><th>Mandante</th><th>Estado</th><th>DH / NCR abiertos</th></tr></thead><tbody>${list.map(p => {
      const rs = DB.records.filter(r => r.projectId === p.id && isOpen(r));
      return `<tr class="click" data-go="#/proyecto/${enc(p.id)}"><td><span class="dot ${projSem(p)}"></span></td><td><b>${esc(p.id)}</b></td><td>${esc(p.nombre)}<div class="small muted">${esc(p.ubicacion)}</div></td><td>${esc(p.mandante)}</td><td><span class="badge b-blue">${esc(p.estado)}</span></td><td>${rs.filter(r => r.tipo === 'DH').length} / ${rs.filter(r => r.tipo === 'NCR').length}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">No se encontraron proyectos.</div>';
  };
  return `<div class="page-head"><div><h2>Proyectos</h2><div class="muted">Proyecto maestro de Arauco</div></div></div>
  <div class="toolbar"><input type="search" placeholder="Buscar dentro del proyecto…" data-filter="pq" value="${fv('pq')}"><select data-filter="pe">${opts(ESTADOS_PROY, UI.f.pe, 'Todos los estados')}</select></div>
  <div class="card" id="list"></div>`;
}

/* ---- Ficha de proyecto ---- */
const PTABS = [['resumen', 'Resumen'], ['proyecto', 'Proyecto'], ['beneficiarios', 'Beneficiarios'], ['viviendas', 'Viviendas'], ['inspecciones', 'Inspecciones'], ['dh', 'DH'], ['ncr', 'NCR'], ['evidencias', 'Evidencias'], ['acciones', 'Acciones'], ['historial', 'Historial'], ['indicadores', 'Indicadores']];

function vProyecto(id, tab) {
  const p = getProj(id); if (!p) return notFound('Proyecto no encontrado');
  const recs = DB.records.filter(r => r.projectId === id), al = getAlerts(id);
  const s = projSem(p);
  const count = { inspecciones: DB.inspections.filter(i => i.projectId === id).length, dh: recs.filter(r => r.tipo === 'DH').length, ncr: recs.filter(r => r.tipo === 'NCR').length, evidencias: DB.evidences.filter(e => e.projectId === id).length };
  const tabs = PTABS.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="#/proyecto/${enc(id)}/${k}">${l}${count[k] != null ? ` (${count[k]})` : ''}</a>`).join('');
  let body = '';
  if (tab === 'resumen') body = tResumen(p, recs, al);
  else if (tab === 'proyecto') body = tProyectoInfo(p);
  else if (tab === 'beneficiarios') body = tBeneficiarios(p);
  else if (tab === 'viviendas') body = tViviendas(p);
  else if (tab === 'inspecciones') body = tInspProy(p);
  else if (tab === 'dh') body = tRegs(p, 'DH');
  else if (tab === 'ncr') body = tRegs(p, 'NCR');
  else if (tab === 'evidencias') body = tEvidProy(p);
  else if (tab === 'acciones') body = tAcciones(recs);
  else if (tab === 'historial') body = tHistorial(p);
  else if (tab === 'indicadores') body = indicadoresHTML(id);
  return `<div class="page-head"><div><div class="muted small"><a href="#/proyectos">← Proyectos</a></div><h2>PROYECTO ${esc(p.id)}</h2><div>${esc(p.nombre)}</div></div>
    <div class="row"><span class="badge b-blue">${esc(p.estado)}</span> ${semBadge(s)}<button class="btn btn-sec btn-sm" data-act="proj-edit" data-id="${esc(p.id)}">Editar</button></div></div>
  <div class="tabs">${tabs}</div>${body}`;
}

function tProyectoInfo(p) {
  return `<div class="grid two"><div class="card"><h3>Identificación administrativa</h3><div class="kv">${kv('ID / Licitación',esc(p.id))}${kv('Mandante',esc(p.mandante))}${kv('Unidad',esc(p.unidadMandante||'SECPLAN'))}${kv('Programa',esc(p.programa||'DS10-PHR'))}${kv('Modalidad',esc(p.modalidad||'Construcción en Sitio Residente'))}${kv('Financiamiento',esc(p.financiamiento||'SERVIU Biobío'))}${kv('Empresa de supervisión',esc(p.empresaSupervision||'Praxis Edificaciones'))}</div></div><div class="card"><h3>Hitos</h3><div class="kv">${kv('Publicación',esc(p.publicacion||'20-08-2026'))}${kv('Cierre',esc(p.cierreLicitacion||'30-09-2026 16:30'))}${kv('Adjudicación indicada',esc(p.adjudicacionIndicada||'16-10-2026 15:30'))}</div></div></div>
  <div class="card"><h3>Contexto social</h3><p>${esc(p.contextoSocial||'Sin información registrada.')}</p></div>
  <div class="card"><h3>Antecedentes técnicos</h3><p>${esc(p.memoriaEstructural||'Sin información registrada.')}</p><div class="grid three"><div class="block"><b>Estructura</b><br>Vivienda de un piso · madera</div><div class="block"><b>Tabiques</b><br>2”x3” @40 cm</div><div class="block"><b>Cerchas</b><br>1”x4” bruta @80 cm</div></div><div class="grid three" style="margin-top:.6rem"><div class="block"><b>Hormigón</b><br>G20</div><div class="block"><b>Refuerzo</b><br>Acma C188</div><div class="block"><b>Radier EETT</b><br>10 cm</div></div></div>
  <div class="card"><h3>Tipologías</h3><div class="grid three">${(p.tipologias||[]).map(t=>`<div class="block"><b>Tipo ${esc(t.tipo)}</b><br>${esc(t.superficie)}</div>`).join('')||'<div class="muted">Sin información registrada.</div>'}</div></div>`;
}
function tBeneficiarios(p) {
  const fr=p.frentes||[]; return `<div class="grid two"><div class="card"><h3>Costa</h3><p class="muted">${fr.filter(f=>f.comite==='Costa').length} beneficiarios</p>${fr.filter(f=>f.comite==='Costa').map(f=>`<div class="list-row"><b>${esc(f.beneficiario)}</b><span class="badge b-blue">${esc(f.nombre)}</span></div>`).join('')}</div><div class="card"><h3>Carretera</h3><p class="muted">${fr.filter(f=>f.comite==='Carretera').length} beneficiarios</p>${fr.filter(f=>f.comite==='Carretera').map(f=>`<div class="list-row"><b>${esc(f.beneficiario)}</b><span class="badge b-blue">${esc(f.nombre)}</span></div>`).join('')}</div></div>`;
}
function viviendaStats(p, f) {
  const recs = DB.records.filter(r => r.projectId === p.id && r.frenteId === f.id);
  const dh = recs.filter(r => r.tipo === 'DH');
  const ncr = recs.filter(r => r.tipo === 'NCR');
  const abiertos = recs.filter(isOpen);
  const insps = DB.inspections.filter(i => i.projectId === p.id && (i.frenteId === f.id || String(i.sector||'').toLowerCase().includes(String(f.nombre||'').toLowerCase())));
  const ev = DB.evidences.filter(e => recs.some(r => r.uid === e.recId));
  const di = (DB.dis || []).filter(d => d.projectId === p.id && d.frenteId === f.id);
  return { recs, dh, ncr, abiertos, insps, ev, di };
}
function tipoViviendaBadge(f) {
  const t = f.tipoVivienda && f.tipoVivienda !== 'Por definir' ? f.tipoVivienda : '—';
  return `<span class="badge b-blue">Tipo ${esc(t)}</span>`;
}
function tViviendas(p) {
  const fr=p.frentes||[];
  const counts=['A','B','C'].map(t=>[t,fr.filter(f=>f.tipoVivienda===t).length]);
  const totalNcr=fr.reduce((n,f)=>n+viviendaStats(p,f).ncr.filter(isOpen).length,0);
  const totalDh=fr.reduce((n,f)=>n+viviendaStats(p,f).dh.filter(isOpen).length,0);
  const stateCount={g:0,y:0,r:0};
  fr.forEach(f=>stateCount[viviendaStats(p,f).abiertos.some(r=>r.criticidad==='Crítica')?'r':viviendaStats(p,f).abiertos.length?'y':'g']++);
  return `<div class="housing-dashboard-hero"><div><div class="eyebrow">PANEL VISUAL DE OBRA</div><h2 style="color:#fff;margin:.15rem 0">🏠 Las 12 viviendas</h2><p>Vista rápida del estado de calidad del proyecto. Haz clic en cualquier vivienda para abrir su expediente.</p></div><div class="hero-orbit"><span>12</span><small>VIVIENDAS</small></div></div>
  <div class="grid stats housing-kpis">${stat('🟢 Conformes',stateCount.g,'grn')}${stat('🟡 Atención',stateCount.y,'yel')}${stat('🔴 Críticas',stateCount.r,'red')}${stat('NCR abiertas',totalNcr,'red')}${stat('DH abiertos',totalDh,'yel')}</div>
  <div class="card housing-visual-card"><div class="page-head"><div><h3 style="margin:0">Mapa visual de viviendas</h3><div class="muted small">El color representa el nivel de atención requerido.</div></div><div class="semaforo"><span class="sem"><span class="dot g"></span>Conforme</span><span class="sem"><span class="dot y"></span>Atención</span><span class="sem"><span class="dot r"></span>Crítico</span></div></div>
    <div class="housing-visual-grid">${fr.map((f,i)=>{const st=viviendaStats(p,f), critical=st.abiertos.some(r=>r.criticidad==='Crítica'), open=st.abiertos.length, cls=critical?'critical':open?'attention':'ok'; return `<article class="housing-tile ${cls}" data-go="#/frente/${enc(p.id)}/${enc(f.id)}" tabindex="0"><div class="tile-number">${String(i+1).padStart(2,'0')}</div><div class="tile-house">⌂</div><div class="tile-name">${esc(f.nombre.replace('Vivienda ','Casa '))}</div><div class="tile-benef">${esc((f.beneficiario||'Sin beneficiario').split(' ').slice(0,3).join(' '))}</div><div class="tile-status">${critical?'🔴 Crítico':open?'🟡 Atención':'🟢 Conforme'}</div><div class="tile-counts"><span>NCR ${st.ncr.filter(isOpen).length}</span><span>DH ${st.dh.filter(isOpen).length}</span></div></article>`;}).join('')}</div>
  </div>
  <div class="card"><div class="page-head" style="margin-bottom:.6rem"><div><h3 style="margin:0">Distribución por tipología</h3><div class="muted small">Asignación provisional aleatoria.</div></div></div><div class="grid three">${counts.map(([t,n])=>`<div class="block housing-type-card"><div class="type-letter">${t}</div><div><b>Tipo ${t}</b><br><span class="small">${n} viviendas asignadas</span></div></div>`).join('')}</div></div>
  <div class="notice"><b>Importante:</b> la tipología A/B/C mostrada es una <b>asignación provisional aleatoria</b> de 4 viviendas por tipo, porque no existe información que relacione individualmente cada beneficiario con una tipología.</div>`;
}

function tResumen(p, recs, al) {
  const fr = p.frentes || [];
  return `<div class="grid stats">${stat('DH abiertos', recs.filter(r => r.tipo === 'DH' && isOpen(r)).length, 'yel')}${stat('NCR abiertas', recs.filter(r => r.tipo === 'NCR' && isOpen(r)).length, 'red')}${stat('NCR cerradas', recs.filter(r => r.tipo === 'NCR' && !isOpen(r)).length, 'grn')}${stat('Alertas', al.length, al.length ? 'red' : '')}</div>
  <div class="card" style="margin-top:1rem"><h3>Información general</h3><div class="kv">${kv('Mandante', esc(p.mandante))}${kv('Empresa de supervisión', esc(p.empresaSupervision||'Praxis Edificaciones'))}${kv('Contratista', esc(p.contratista))}${kv('Ubicación', esc(p.ubicacion))}${kv('Responsable', esc(p.responsable))}${kv('Inicio', fmtFecha(p.inicio))}${kv('Término', fmtFecha(p.termino))}</div><div class="block" style="margin-top:.8rem"><h4>Descripción</h4>${esc(p.descripcion) || '—'}</div></div>
  <div class="card"><h3>Alertas del proyecto</h3>${alertsBlock(al)}</div>
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">Viviendas / frentes de trabajo</h3><button class="btn btn-sec btn-sm" data-act="frente-add" data-id="${esc(p.id)}">+ Agregar</button></div>
    <p class="muted small">Estructura preparada para mapa (coordenadas) y códigos QR: cada frente tendrá su ficha directa.</p>
    ${fr.length ? `<div class="table-wrap"><table><thead><tr><th>Frente</th><th>Abiertos</th><th>Coordenadas</th><th></th></tr></thead><tbody>${fr.map(f => {
      const ab = DB.records.filter(r => r.projectId === p.id && r.frenteId === f.id && isOpen(r)).length;
      return `<tr class="click" data-go="#/frente/${enc(p.id)}/${enc(f.id)}"><td><b>${esc(f.nombre)}</b></td><td>${ab ? `<span class="badge b-yel">${ab}</span>` : '<span class="badge b-grn">0</span>'}</td><td>${f.lat != null ? esc(f.lat + ', ' + f.lng) : '<span class="muted">—</span>'}</td><td><button class="btn btn-sec btn-sm" data-act="frente-del" data-id="${esc(p.id)}" data-fid="${esc(f.id)}">Quitar</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="muted small">Sin frentes registrados.</div>'}</div>`;
}

function vFrente(pid, fid) {
  const p = getProj(pid); const f = p && (p.frentes || []).find(x => x.id === fid);
  if (!f) return notFound('Vivienda no encontrada');
  const st=viviendaStats(p,f), ab=st.abiertos;
  const s = ab.some(r => r.criticidad === 'Crítica') ? 'r' : ab.length ? 'y' : 'g';
  const tipo=f.tipoVivienda && f.tipoVivienda !== 'Por definir' ? f.tipoVivienda : 'Sin asignar';
  const diFuture=st.di;
  const location=f.lat!=null ? `${f.lat}, ${f.lng}` : 'Sin coordenadas registradas';
  const routeHash = `#/frente/${enc(pid)}/${enc(fid)}`;
  const webPublished = ['http:','https:'].includes(window.location.protocol) && window.location.origin !== 'null';
  const appUrl = webPublished ? `${window.location.origin}${window.location.pathname}${routeHash}` : '';
  const qrUrl = appUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(appUrl)}` : ''; 
  return `<div class="page-head"><div><div class="muted small"><a href="#/proyecto/${enc(pid)}/viviendas">← Viviendas</a></div><div class="eyebrow">FICHA INDIVIDUAL</div><h2>${esc(f.nombre.toUpperCase())}</h2><div style="font-weight:600">${esc(f.beneficiario||'Beneficiario sin registrar')}</div></div>${semBadge(s)}</div>
  <div class="housing-detail-hero"><div><span class="badge b-blue">Tipo ${esc(tipo)}</span><span class="badge b-blue" style="margin-left:.35rem">${esc(f.comite||'Sin comité')}</span><p class="muted small" style="margin:.55rem 0 0">${esc(f.tipoViviendaEstado||'Tipología registrada como dato provisional')}</p></div><div class="small"><b>Ubicación</b><br>${esc(location)}</div></div>
  <div class="grid stats">${stat('DH abiertos',st.dh.filter(isOpen).length,st.dh.filter(isOpen).length?'yel':'grn')}${stat('NCR abiertos',st.ncr.filter(isOpen).length,st.ncr.filter(isOpen).length?'red':'grn')}${stat('Inspecciones',st.insps.length)}${stat('Evidencias',st.ev.length)}</div>
  <div class="grid two" style="margin-top:1rem">
    <div class="card"><h3>Datos de la vivienda</h3><div class="kv">${kv('Beneficiario',esc(f.beneficiario||'—'))}${kv('Comité',esc(f.comite||'—'))}${kv('Tipo de vivienda',`Tipo ${esc(tipo)}`)}${kv('Coordenadas',esc(location))}${kv('Código de frente',esc(f.id))}</div><div class="qr-box" style="margin-top:1rem">${qrUrl?`<img src="${qrUrl}" alt="QR ${esc(f.nombre)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.insertAdjacentHTML('afterbegin','<div class=\'notice\'>No se pudo cargar el generador QR. Verifica conexión a internet.</div>')">`:'<div class="qr-placeholder">QR disponible al publicar</div>'}<div><b>Acceso rápido</b><div class="qr-caption">El QR contiene la URL completa de esta vivienda. Para usarlo desde otro teléfono, publique primero la aplicación en una URL HTTPS accesible; una ruta local file:// no sirve para acceso externo.</div><div class="small muted" style="margin-top:.35rem;word-break:break-all">${esc(appUrl||'Publica la aplicación en HTTPS para generar un enlace accesible desde otros dispositivos.')}</div><div style="margin-top:.55rem;display:flex;gap:.4rem;flex-wrap:wrap">${appUrl?`<button class="btn btn-sec btn-sm" data-act="qr-copy" data-url="${enc(appUrl)}">📋 Copiar enlace</button><button class="btn btn-sec btn-sm" data-act="qr-open" data-url="${enc(appUrl)}">↗ Abrir ficha</button>`:''}</div></div></div></div>
    <div class="card"><h3>Estado de calidad</h3><div class="kv">${kv('Registros abiertos',openBadge(ab.length))}${kv('DH',`${st.dh.length} total · ${st.dh.filter(isOpen).length} abiertos`)}${kv('NCR',`${st.ncr.length} total · ${st.ncr.filter(isOpen).length} abiertos`)}${kv('DI',diFuture.length?`${diFuture.length} registrados`:'Preparado para futura implementación')}</div></div>
  </div>
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">DH</h3><span class="badge b-blue">${st.dh.length} registros</span></div>${st.dh.length?recTable(st.dh,false):'<div class="empty">No hay DH asociados a esta vivienda.</div>'}</div>
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">NCR</h3><span class="badge b-blue">${st.ncr.length} registros</span></div>${st.ncr.length?recTable(st.ncr,false):'<div class="empty">No hay NCR asociados a esta vivienda.</div>'}</div>
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">Inspecciones</h3><span class="badge b-blue">${st.insps.length}</span></div>${st.insps.length?inspTable(st.insps,false):'<div class="empty">No hay inspecciones asociadas.</div>'}</div>
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">Evidencias</h3><span class="badge b-blue">${st.ev.length}</span></div>${st.ev.length?evColumnsForList(st.ev):'<div class="empty">No hay evidencias asociadas a esta vivienda.</div>'}</div>
  <div class="card future-di"><h3>DI — Deficiencias / información</h3><p class="muted small">Este espacio queda preparado para la futura implementación de DI. Permitirá registrar información faltante, consultas, respuestas y documentos asociados.</p>${diFuture.length?'<div class="small">Hay '+diFuture.length+' DI registrados.</div>':'<span class="badge b-blue">Módulo futuro</span>'}</div>`;
}
function openBadge(n){ return n ? `<span class="badge b-yel">${n}</span>` : '<span class="badge b-grn">0</span>'; }
function evColumnsForList(list) {
  return `<div class="ev-cols">${MOMENTOS.map(m=>`<div class="ev-col"><h4>${m}</h4>${list.filter(e=>e.momento===m).map(e=>e.img?`<div class="ev evidence-card"><img src="${e.img}" alt="${esc(e.descripcion)}" data-act="ev-view" data-id="${esc(e.id)}"><div><span class="badge b-blue">${esc(e.tipo)}</span> <b>${esc(e.descripcion)}</b><div class="muted small">${fmtFecha(e.fecha)}${e.archivo?' · '+esc(e.archivo):''}</div></div></div>`:`<div class="ev evidence-card"><div class="ph">📎</div><div><span class="badge b-blue">${esc(e.tipo)}</span> <b>${esc(e.descripcion)}</b><div class="muted small">${fmtFecha(e.fecha)}</div></div></div>`).join('')||'<div class="muted small">Sin evidencias</div>'}</div>`).join('')}</div>`;
}

function tInspProy(p) {
  return `<div class="card"><div class="row no-print" style="margin-bottom:.6rem"><button class="btn" data-act="insp-new" data-id="${esc(p.id)}">+ Control preventivo</button><button class="btn btn-sec" data-act="insp-sched" data-id="${esc(p.id)}">Programar inspección</button></div>${inspTable(DB.inspections.filter(i => i.projectId === p.id), false)}</div>`;
}
function tRegs(p, tipo) {
  return `<div class="card"><div class="row" style="margin-bottom:.6rem"><button class="btn" data-act="rec-new" data-id="${esc(p.id)}" data-tipo="${tipo}">+ Nuevo ${tipo}</button></div>${recTable(DB.records.filter(r => r.projectId === p.id && r.tipo === tipo), false)}</div>`;
}
function tEvidProy(p) {
  const recs = DB.records.filter(r => r.projectId === p.id);
  const list = recs.filter(r => DB.evidences.some(e => e.recId === r.uid));
  return list.length ? list.map(r => `<div class="card"><h3><a href="#/registro/${enc(r.uid)}">${esc(r.code)}</a> · ${esc(r.titulo)}</h3>${evColumns(r.uid)}</div>`).join('') : '<div class="card empty">Aún no hay evidencias. Agréguelas desde la ficha de cada DH/NCR.</div>';
}
function tAcciones(recs) {
  if (!recs.length) return '<div class="card empty">Sin acciones registradas.</div>';
  return `<div class="card"><div class="table-wrap"><table><thead><tr><th>Registro</th><th>Acción correctiva</th><th>Acción preventiva</th><th>Responsable</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>${recs.map(r => `<tr class="click" data-go="#/registro/${enc(r.uid)}"><td><b>${esc(r.code)}</b></td><td>${esc(r.accionCorrectiva) || '<span class="badge b-red">Sin definir</span>'}</td><td>${esc(r.accionPreventiva) || '—'}</td><td>${esc(r.responsable)}</td><td>${fmtFecha(r.fechaCompromiso)}${vencBadge(r)}</td><td>${badgeEstado(r.estado)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function tHistorial(p) {
  const ev = [];
  DB.records.filter(r => r.projectId === p.id).forEach(r => r.timeline.forEach(t => ev.push({ fecha: t.fecha, txt: `${r.code} · ${t.estado}`, nota: t.nota || r.titulo, link: '#/registro/' + enc(r.uid) })));
  DB.inspections.filter(i => i.projectId === p.id && i.estado === 'Realizada').forEach(i => ev.push({ fecha: i.fecha, txt: `Inspección realizada · ${i.sector}`, nota: 'Riesgo de nido de piedra: ' + (i.riesgo ? i.riesgo.nivel : '—'), link: '#/inspecciones' }));
  ev.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `<div class="card"><h3>Historial del proyecto</h3>${ev.length ? `<div class="timeline">${ev.map(e => `<div class="tl"><div class="d">${fmtCorta(e.fecha)} ${e.fecha.slice(0, 4)}</div><div class="t"><a href="${e.link}">${esc(e.txt)}</a></div><div class="n">${esc(e.nota)}</div></div>`).join('')}</div>` : '<div class="empty">Sin eventos.</div>'}</div>`;
}

/* ---- DH / NCR ---- */
function vDhncr(sub) {
  const tabs = `<div class="tabs"><a class="tab ${!['lecciones','rdi'].includes(sub) ? 'active' : ''}" href="#/dhncr">Registros DH / NCR</a><a class="tab ${sub === 'rdi' ? 'active' : ''}" href="#/dhncr/rdi">RDI (${(DB.dis||[]).length})</a><a class="tab ${sub === 'lecciones' ? 'active' : ''}" href="#/dhncr/lecciones">Lecciones aprendidas (${DB.lessons.length})</a></div>`;
  if (sub === 'rdi') { const rows=(DB.dis||[]).slice().sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); return `<div class="page-head"><div><h2>Registro de Solicitud de Información (RDI)</h2><p class="muted">Consulta técnica formal ante discrepancias, omisiones o información insuficiente de planos, EETT o coordinación.</p></div><button class="btn" data-act="rdi-new">+ Nueva RDI</button></div>${tabs}<div class="toolbar"><input type="search" placeholder="Buscar código, asunto, plano o responsable…" data-filter="rdiq" value="${fv('rdiq')}"></div><div class="card"><div class="table-wrap"><table><thead><tr><th>N° RDI</th><th>Fecha</th><th>Proyecto / vivienda</th><th>Asunto y referencia</th><th>Responsable</th><th>Estado</th><th>Plazo</th></tr></thead><tbody>${rows.filter(x=>!UI.f.rdiq||JSON.stringify(x).toLowerCase().includes(UI.f.rdiq.toLowerCase())).map(x=>`<tr><td><b>${esc(x.code||'RDI')}</b></td><td>${fmtFecha(x.fecha)}</td><td>${esc(x.projectId||'—')} · ${esc(x.frenteId||'—')}</td><td>${esc(x.asunto||x.titulo||'—')}<div class="muted small">${esc(x.plano||'Sin plano asociado')} · ${esc(x.especialidad||'')}</div></td><td>${esc(x.responsable||'—')}</td><td><span class="badge b-blue">${esc(x.estado||'Emitida')}</span></td><td>${fmtFecha(x.fechaRespuestaCompromiso)}</td></tr>`).join('')||'<tr><td colspan="7">No hay RDI registradas. Cree la primera con “Nueva RDI”.</td></tr>'}</tbody></table></div></div>`; }

  if (sub === 'lecciones') {
    return `<div class="page-head"><h2>DH / NCR</h2></div>${tabs}${DB.lessons.length ? DB.lessons.map(l => {
      const r = getRec(l.recId);
      return `<div class="card"><div class="page-head" style="margin-bottom:.4rem"><h3 style="margin:0">${esc(l.problema)}</h3><div class="row">${r ? `<a class="badge b-blue" href="#/registro/${enc(r.uid)}">${esc(r.code)}</a>` : ''}<span class="muted small">${fmtFecha(l.fecha)}</span><button class="btn btn-danger btn-sm" data-act="lesson-del" data-id="${esc(l.id)}">Eliminar</button></div></div>
      <div class="grid two">${blockTxt('Causa', l.causa)}${blockTxt('Solución', l.solucion)}${blockTxt('Medida preventiva', l.medida)}${blockTxt('Recomendación', l.recomendacion)}</div></div>`;
    }).join('') : '<div class="card empty">Aún no hay lecciones aprendidas. Se registran al cerrar un DH/NCR.</div>'}`;
  }
  UI.list = () => {
    const q = (UI.f.rq || '').toLowerCase();
    const list = DB.records.filter(r => (!UI.f.rt || r.tipo === UI.f.rt) && (!UI.f.rp || r.projectId === UI.f.rp) && (!UI.f.re || r.estado === UI.f.re) && (!UI.f.rc || r.criticidad === UI.f.rc) && (!q || (r.code + r.titulo + r.sector + r.partida + r.descripcion).toLowerCase().includes(q)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    $('#list').innerHTML = recTable(list);
  };
  return `<div class="page-head"><h2>DH / NCR</h2><div class="row"><button class="btn btn-sec" data-act="rec-new" data-tipo="DH">+ Nuevo DH</button><button class="btn" data-act="rec-new" data-tipo="NCR">+ Nueva NCR</button><a class="btn btn-sec" href="#/dhncr/rdi">RDI</a></div></div>${tabs}
  <div class="toolbar"><input type="search" placeholder="Buscar código, título, sector…" data-filter="rq" value="${fv('rq')}">
    <select data-filter="rt">${opts(['DH', 'NCR'], UI.f.rt, 'DH y NCR')}</select>
    <select data-filter="rp">${projOpts(UI.f.rp, 'Todos los proyectos')}</select>
    <select data-filter="re">${opts(ESTADOS, UI.f.re, 'Todos los estados')}</select>
    <select data-filter="rc">${opts(CRITICIDADES, UI.f.rc, 'Toda criticidad')}</select></div>
  <div class="card" id="list"></div>`;
}

/* ---- Ficha DH / NCR ---- */
function evColumns(recId) {
  return `<div class="ev-cols">${MOMENTOS.map(m => {
    const list = DB.evidences.filter(e => e.recId === recId && e.momento === m);
    return `<div class="ev-col"><h4>${m} <span class="muted small">(${list.length})</span></h4>${list.map(e => `<div class="ev evidence-card">
      ${e.img ? `<img src="${e.img}" alt="${esc(e.descripcion)}" data-act="ev-view" data-id="${esc(e.id)}">` : `<div class="ph">${e.tipo === 'Fotografía' ? '📷' : '📎'}</div>`}
      <div class="evidence-body"><div><span class="badge b-blue">${esc(e.tipo)}</span></div><b>${esc(e.descripcion)}</b><div class="muted small">${fmtFecha(e.fecha)}${e.archivo ? ' · ' + esc(e.archivo) : ''}</div><button class="btn btn-sec btn-sm no-print" data-act="ev-del" data-id="${esc(e.id)}">Quitar</button></div>
    </div>`).join('') || '<div class="muted small">Sin evidencias registradas.</div>'}</div>`;
  }).join('')}</div>`;
}

function solucionInnovadoraHTML(r) {
  const s = r && r.solucionInnovadora;
  if (!s || !s.activa) return '';
  const money = n => '$' + Number(n || 0).toLocaleString('es-CL');
  const altRows = (s.alternativas || []).map(a => `<tr><td><b>${esc(a.producto)}</b></td><td>${money(a.precio)}</td><td><span class="badge ${a.evaluacion === 'Seleccionado' ? 'b-grn' : 'b-blue'}">${esc(a.evaluacion)}</span></td><td>${esc(a.nota)}</td></tr>`).join('');
  return `<div class="card innovation-card">
    <div class="innovation-head"><div><div class="eyebrow">SOLUCIÓN INNOVADORA</div><h3>💡 ${esc(s.producto || s.titulo || 'Solución innovadora')}</h3><div class="muted small">${esc(s.estado || 'Propuesta')}</div></div><div class="row"><span class="innovation-badge">✓ Asociada</span><button class="btn btn-sec btn-sm no-print" data-act="innov-edit" data-id="${esc(r.uid)}">Editar</button></div></div>
    <div class="innovation-flow"><span>Hallazgo</span><b>→</b><span>Análisis</span><b>→</b><span>Alternativas</span><b>→</b><span>SikaRep AR</span><b>→</b><span>Reparación</span><b>→</b><span>Verificación</span></div>
    <div class="grid two">
      ${blockTxt('Problema abordado', s.problema)}
      ${blockTxt('¿Por qué se seleccionó?', s.justificacion)}
    </div>
    <h4>Comparación de alternativas</h4>
    <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Precio ref.</th><th>Evaluación</th><th>Comentario</th></tr></thead><tbody>${altRows}</tbody></table></div>
    <div class="innovation-metrics">
      <div><span>Nido de referencia</span><b>2 L</b></div>
      <div><span>Densidad aprox.</span><b>${esc(s.densidadKgL)} kg/L</b></div>
      <div><span>Consumo aprox. por nido</span><b>${esc(s.consumoNidoKg)} kg</b></div>
      <div><span>Rendimiento por saco</span><b>~${esc(s.rendimientoSacoL)} L</b></div>
      <div><span>Stock planificado</span><b>${esc(s.cantidadSacos)} sacos</b></div>
      <div><span>Material total</span><b>200 kg</b></div>
      <div><span>Rendimiento stock</span><b>~105,28 L</b></div>
      <div><span>Compra planificada</span><b>${money(s.totalCompra)}</b></div>
    </div>
    <div class="grid two innovation-details">
      ${blockTxt('📦 Plan logístico', s.logistica)}
      ${blockTxt('🛡️ Prevención de recurrencia', s.prevencion)}
    </div>
    <div class="notice"><b>Nota de planificación:</b> ${esc(s.observacion)}</div>
  </div>`;
}

function evidenceStageSummary(recId) {
  const all = DB.evidences.filter(e => e.recId === recId);
  const counts = Object.fromEntries(MOMENTOS.map(m => [m, all.filter(e => e.momento === m).length]));
  const complete = MOMENTOS.every(m => counts[m] > 0);
  return {all, counts, complete};
}
function evidenceStageHTML(recId) {
  const x = evidenceStageSummary(recId);
  return `<div class="evidence-stage-card"><div class="page-head" style="margin-bottom:.6rem"><div><div class="eyebrow">TRAZABILIDAD VISUAL</div><h3 style="margin:0">📸 Evidencia antes · durante · después</h3><div class="muted small">La evidencia queda organizada por etapa de la corrección.</div></div><span class="badge ${x.complete?'b-grn':'b-yel'}">${x.complete?'✓ Completa':'Pendiente'}</span></div><div class="evidence-stage-strip">${MOMENTOS.map((m,idx)=>`<div class="evidence-stage ${x.counts[m]?'has':''}"><div class="stage-icon">${x.counts[m]?'✓':['ANTES','DURANTE','DESPUÉS'][idx]}</div><b>${m}</b><span>${x.counts[m]} archivo${x.counts[m]===1?'':'s'}</span></div>`).join('')}</div></div>`;
}
function reincidenciasHTML(r) {
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g,' ').replace(/\\s+/g,' ').trim();
  const tokens=v=>new Set(norm(v).split(' ').filter(x=>x.length>3));
  const rt=tokens((r.titulo||'')+' '+(r.descripcion||'')+' '+(r.sector||''));
  const related=DB.records.filter(x=>x.uid!==r.uid && x.projectId===r.projectId && x.tipo===r.tipo).map(x=>{
    const xt=tokens((x.titulo||'')+' '+(x.descripcion||'')+' '+(x.sector||''));
    let common=0; rt.forEach(t=>{if(xt.has(t)) common++;});
    if(r.especialidad && x.especialidad===r.especialidad) common+=2;
    if(r.categoriaCausa && x.categoriaCausa===r.categoriaCausa) common+=1;
    if(r.partida && x.partida && r.partida===x.partida) common+=2;
    return {x,score:common};
  }).filter(a=>a.score>=3).sort((a,b)=>b.score-a.score).slice(0,5);
  if(!related.length) return `<div class="card recurrence-card"><div class="page-head" style="margin:0"><div><div class="eyebrow">CONTROL DE RECURRENCIA</div><h3 style="margin:0">🔁 No se detectaron casos similares</h3><div class="muted small">El sistema comparó título, descripción, sector, especialidad, partida y causa dentro del proyecto.</div></div><span class="badge b-grn">Sin coincidencias</span></div></div>`;
  return `<div class="card recurrence-card"><div class="page-head"><div><div class="eyebrow">CONTROL DE RECURRENCIA</div><h3 style="margin:0">🔁 Posibles reincidencias</h3><div class="muted small">Se encontraron registros con características similares. Revise antes de considerar que es una reincidencia real.</div></div><span class="badge b-yel">${related.length} coincidencia${related.length===1?'':'s'}</span></div><div class="recurrence-list">${related.map(a=>`<a class="recurrence-item" href="#/registro/${enc(a.x.uid)}"><div><b>${esc(a.x.code)} · ${esc(a.x.titulo)}</b><div class="small muted">${esc(a.x.sector||'Sin sector')} · ${esc(a.x.especialidad||'Sin especialidad')} · ${esc(a.x.categoriaCausa||'Sin causa')}</div></div><span class="badge ${isOpen(a.x)?'b-red':'b-grn'}">${esc(a.x.estado)}</span></a>`).join('')}</div></div>`;
}

function vRegistro(id) {
  const r = getRec(id); if (!r) return notFound('Registro no encontrado');
  const p = getProj(r.projectId); const fr = p && (p.frentes || []).find(f => f.id === r.frenteId);
  const al = getAlerts(r.projectId).filter(a => a.recId === r.uid);
  const les = DB.lessons.filter(l => l.recId === r.uid);
  const tl = r.timeline.map(t => `<div class="tl ${t.estado === 'Cerrado' ? 'done' : ''}"><div class="d">${fmtCorta(t.fecha)}</div><div class="t">${esc(t.estado)} ${t.hora?`· ${esc(t.hora)}`:''}</div>${t.actor?`<div class="n">👤 ${esc(t.actor)}</div>`:''}${t.nota ? `<div class="n">${esc(t.nota)}</div>` : ''}</div>`).join('');
  const ultV = r.verificaciones[r.verificaciones.length - 1];

  let accion = '';
  if (r.estado === 'Pendiente de verificación') {
    accion += `<div class="card" style="border-left:4px solid var(--yel)"><h3>Verificación requerida</h3><p class="small muted">La ${r.tipo} no puede cerrarse sin verificación del supervisor.</p>
    <form data-form="verif" data-id="${esc(r.uid)}"><div class="form-grid">
      <div><label>Resultado *</label><select name="resultado" required>${opts(['Conforme', 'No conforme'], '', 'Seleccione…')}</select></div>
      <div><label>Fecha *</label><input type="date" name="fecha" value="${hoy()}" required></div>
      <div><label>Responsable *</label><input name="responsable" required placeholder="Nombre del supervisor"></div>
      <div class="full"><div class="solution-form-block"><div class="solution-form-title">🔎 Verificación de la solución</div><div class="small muted">Para cerrar como Conforme se deben comprobar los puntos siguientes.</div><label class="checkline"><input type="checkbox" name="solEjecutada"> Solución ejecutada</label><label class="checkline"><input type="checkbox" name="matConforme"> Material / recurso conforme</label><label class="checkline"><input type="checkbox" name="resultadoConforme"> Resultado final conforme</label><label class="checkline"><input type="checkbox" name="evidenciaCargada"> Evidencia posterior disponible</label></div></div>
      <div class="full"><label>Observación</label><textarea name="obs"></textarea></div><div class="full signature-box"><b>✍️ Firma / aprobación digital</b><p class="muted small">Ingrese el nombre del responsable como constancia de revisión.</p><input name="firma" placeholder="Nombre y firma del responsable"></div></div>
      <div class="modal-foot"><button class="btn" type="submit">Registrar verificación</button></div></form></div>`;
  }
  if (r.estado === 'Cerrado') {
    accion += `<div class="card"><div class="row"><span>✅ Cerrado el ${fmtFecha(r.fechaCierre)}</span><span class="spacer"></span><button class="btn btn-sec btn-sm" data-act="rec-reopen" data-id="${esc(r.uid)}">Reabrir</button></div></div>`;
  } else {
    const permitidos = ESTADOS.filter(e => e !== 'Cerrado' && e !== r.estado);
    accion += `<div class="card"><h3>Cambiar estado</h3><form data-form="estado" data-id="${esc(r.uid)}" class="row"><select name="estado" style="max-width:260px">${opts(permitidos, '')}</select><input name="actor" placeholder="Responsable / inspector" style="max-width:220px"><input name="nota" placeholder="Nota (opcional)" style="flex:1;min-width:160px"><button class="btn" type="submit">Actualizar</button></form><p class="muted small" style="margin:.5rem 0 0">Para cerrar se debe pasar por “Pendiente de verificación” y registrar una verificación conforme.</p></div>`;
  }

  return `<div class="page-head"><div><div class="muted small"><a href="#/dhncr">← DH / NCR</a> · <a href="#/proyecto/${enc(r.projectId)}/${r.tipo.toLowerCase()}">${esc(r.projectId)}</a></div><h2>${esc(r.code)}</h2><div style="font-weight:600">${esc(r.titulo.toUpperCase())}</div></div>
    <div class="row no-print"><button class="btn btn-sec btn-sm" onclick="window.print()">📄 Exportar PDF</button>${badgeEstado(r.estado)}<button class="btn btn-sec btn-sm" data-act="rec-edit" data-id="${esc(r.uid)}">Editar</button><button class="btn btn-danger btn-sm" data-act="rec-del" data-id="${esc(r.uid)}">Eliminar</button></div></div>
  ${al.length ? `<div class="card"><h3>Alertas</h3>${al.map(a => alertHTML(Object.assign({}, a, { link: '' }))).join('')}</div>` : ''}
  <div class="card"><div class="kv">${kv('Tipo', r.tipo)}${kv('Criticidad', badgeCrit(r.criticidad))}${kv('Fecha', fmtFecha(r.fecha))}${kv('Sector', esc(r.sector))}${kv('Partida', esc(r.partida))}${kv('Especialidad', esc(r.especialidad))}${kv('Vivienda / frente', fr ? esc(fr.nombre) : '')}${kv('Categoría de causa', esc(r.categoriaCausa))}${kv('Responsable', esc(r.responsable))}${kv('Fecha compromiso', fmtFecha(r.fechaCompromiso) + vencBadge(r))}${kv('Días adicionales', String(r.diasAdicionales||0))}${kv('Motivo de ampliación', esc(r.motivoAmpliacion||'Sin ampliación'))}${kv('Impacto en programa', esc(r.detalleAmpliacion||'—'))}${kv('Validación de ampliación', esc(r.ampliacionValidada||'Pendiente de validación'))}</div></div>
  <div class="grid two"><div>
    <div class="card"><h3>Descripción del hallazgo</h3>${blockTxt('Descripción', r.descripcion)}${blockTxt('Requisito / antecedente', r.requisito)}</div>
    <div class="card"><h3>Análisis de causa</h3>${blockTxt('Causa inmediata', r.causaInmediata)}${blockTxt('Causa sistémica', r.causaSistemica)}${blockTxt('Condiciones contribuyentes', r.condicionesContribuyentes || '')}</div>
    <div class="card solution-card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">🛠️ Solución propuesta</h3><button class="btn btn-sec btn-sm no-print" data-act="rec-edit" data-id="${esc(r.uid)}">Editar solución</button></div>${blockTxt('¿Qué hacer?', r.solucionPropuesta || r.accionCorrectiva)}${blockTxt('Material / recurso', r.materialSolucion)}${blockTxt('Cómo se realizará', r.procedimientoSolucion)}${blockTxt('Observación', r.observacionSolucion)}</div>
    <div class="card preventive-plan-card"><h3>🛡️ Plan de acción y prevención</h3>${blockTxt('Acción correctiva', r.accionCorrectiva)}${blockTxt('Acción preventiva', r.accionPreventiva)}${blockTxt('Medida preventiva obligatoria', r.medidaPreventiva || 'Pendiente de completar')}${blockTxt('Elemento para análisis de reincidencia', r.elementoConstructivo || r.partida || r.sector)}${blockTxt('Familia del problema', r.familiaProblema || r.titulo)}${r.manualAcademyId?`<p><a class="btn btn-sec btn-sm" href="#/academy/manual/${enc(r.manualAcademyId)}">Abrir manual preventivo asociado</a></p>`:''}${kv('Responsable', esc(r.responsable))}${kv('Fecha compromiso', fmtFecha(r.fechaCompromiso) + vencBadge(r))}</div>
    ${ultV ? `<div class="card"><h3>Verificación</h3><div class="kv">${kv('Resultado', `<span class="badge ${ultV.resultado === 'Conforme' ? 'b-grn' : 'b-red'}">${esc(ultV.resultado)}</span>`)}${kv('Fecha', fmtFecha(ultV.fecha))}${kv('Responsable', esc(ultV.responsable))}${kv('Observación', esc(ultV.obs))}${kv('Firma / aprobación', esc(ultV.firma||ultV.responsable||'—'))}${ultV.checks ? kv('Checklist de verificación', Object.entries(ultV.checks).map(([k,v])=>`<span class="badge ${v?'b-grn':'b-red'}">${v?'✓':'✕'} ${k}</span>`).join(' ')) : ''}</div></div>` : ''}
  </div><div>
    ${accion}
    <div class="card"><h3>Línea de tiempo</h3><div class="timeline">${tl}</div></div>
  </div></div>
  <div class="card praxis-analysis"><div class="section-kicker">🧠 ANÁLISIS PRAXIS</div><h3>Lectura del hallazgo</h3><div class="analysis-grid"><div><span>Riesgo</span><b>${esc(r.criticidad||'Sin definir')}</b></div><div><span>Especialidad</span><b>${esc(r.especialidad||'—')}</b></div><div><span>Causa</span><b>${esc(r.categoriaCausa||'—')}</b></div></div><p class="small" style="margin:.7rem 0 0"><b>Orientación:</b> ${esc(r.causaInmediata||'Analizar causa inmediata y condiciones contribuyentes antes de cerrar.')}</p><p class="small muted" style="margin:.3rem 0 0">Sugerencia Praxis: registrar la causa, ejecutar la solución, documentar evidencia y verificar antes del cierre.</p></div>
    ${solucionInnovadoraHTML(r) || `<div class="card innovation-add-card no-print"><div class="page-head" style="margin:0"><div><h3 style="margin:0">💡 Solución innovadora</h3><div class="muted small">Puede asociar una solución adicional cuando el caso tenga una propuesta innovadora distinta de la solución estándar.</div></div><button class="btn btn-sec btn-sm" data-act="innov-new" data-id="${esc(r.uid)}">+ Agregar solución innovadora</button></div></div>`}
  ${evidenceStageHTML(r.uid)}
  ${r.tipo === 'NCR' ? reincidenciasHTML(r) : ''}
  <div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">Evidencias</h3><button class="btn btn-sec btn-sm" data-act="ev-new" data-id="${esc(r.uid)}">+ Agregar evidencia</button></div>${evColumns(r.uid)}</div>
  ${r.estado === 'Cerrado' ? `<div class="card"><div class="page-head" style="margin-bottom:.5rem"><h3 style="margin:0">Lecciones aprendidas</h3><button class="btn btn-sec btn-sm" data-act="lesson-new" data-id="${esc(r.uid)}">+ Registrar lección</button></div>${les.length ? les.map(l => `<div class="grid two">${blockTxt('Problema', l.problema)}${blockTxt('Causa', l.causa)}${blockTxt('Solución', l.solucion)}${blockTxt('Medida preventiva', l.medida)}</div>${blockTxt('Recomendación', l.recomendacion)}`).join('') : '<div class="muted small">Aún no se registra una lección aprendida para este cierre.</div>'}</div>` : ''}`;
}

/* ---- Inspecciones / Control preventivo ---- */
function riskHTML(r) {
  const ic = { BAJO: '🟢', MEDIO: '🟡', ALTO: '🔴' }[r.nivel];
  return `<div class="risk ${r.nivel.toLowerCase()}"><div class="lvl">RIESGO DE NIDO DE PIEDRA: ${ic} ${r.nivel}</div><p style="margin:.4rem 0">${esc(r.recomendacion)}</p>${r.mensajes.length ? `<ul class="small" style="margin:.3rem 0 0 1rem;padding:0">${r.mensajes.map(m => `<li>⚠️ ${esc(m)}</li>`).join('')}</ul>` : ''}${r.sinResponder ? `<div class="small muted" style="margin-top:.4rem">${r.sinResponder} ítem(s) sin responder.</div>` : ''}</div>`;
}
function lessonsHint() {
  const l = relatedLessons(); if (!l.length) return '';
  return `<div class="block"><h4>Lecciones aprendidas relacionadas</h4>${l.slice(0, 3).map(x => `<div class="small">📘 <b>${esc(x.problema)}</b> — ${esc(x.medida)}</div>`).join('')}</div>`;
}
function inspTable(list, showProj = true) {
  if (!list.length) return '<div class="empty">No hay inspecciones.</div>';
  list = list.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th>${showProj ? '<th>Proyecto</th>' : ''}<th>Inspección</th><th>Estado</th><th>Riesgo</th><th></th></tr></thead><tbody>${list.map(i => {
    const rb = i.riesgo ? `<span class="badge ${{ BAJO: 'b-grn', MEDIO: 'b-yel', ALTO: 'b-red' }[i.riesgo.nivel]}">${i.riesgo.nivel}</span>` : '—';
    const acts = i.estado === 'Pendiente' ? `<button class="btn btn-sm" data-act="insp-do" data-id="${esc(i.id)}">Realizar</button>` : `<button class="btn btn-sec btn-sm" data-act="insp-view" data-id="${esc(i.id)}">Ver</button>${i.riesgo && i.riesgo.nivel !== 'BAJO' && !i.atendida ? ` <button class="btn btn-sec btn-sm" data-act="insp-ok" data-id="${esc(i.id)}">Alerta atendida</button>` : ''}`;
    return `<tr><td>${fmtFecha(i.fecha)}</td>${showProj ? `<td>${esc(i.projectId)}</td>` : ''}<td><b>${esc(i.tipo)}</b><div class="small muted">${esc(i.sector)} · ${esc(i.responsable)}</div></td><td>${i.estado === 'Pendiente' ? '<span class="badge b-yel">Pendiente</span>' : '<span class="badge b-grn">Realizada</span>'}</td><td>${rb}</td><td>${acts} <button class="btn btn-danger btn-sm" data-act="insp-del" data-id="${esc(i.id)}">✕</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function vInspecciones() {
  UI.list = () => {
    const list = DB.inspections.filter(i => (!UI.f.ip || i.projectId === UI.f.ip) && (!UI.f.ie || i.estado === UI.f.ie));
    $('#list').innerHTML = inspTable(list);
  };
  return `<div class="page-head"><h2>Inspecciones · Control preventivo</h2><div class="row"><button class="btn btn-sec" data-act="insp-sched">Programar inspección</button><button class="btn" data-act="insp-new">+ Control preventivo de hormigonado</button></div></div>
  <div class="card"><p class="muted small" style="margin:0">El checklist previo al hormigonado calcula automáticamente el <b>riesgo de nido de piedra</b> y genera alertas preventivas antes de hormigonar.</p></div>
  <div class="toolbar"><select data-filter="ip">${projOpts(UI.f.ip, 'Todos los proyectos')}</select><select data-filter="ie">${opts(['Pendiente', 'Realizada'], UI.f.ie, 'Todos los estados')}</select></div>
  <div class="card" id="list"></div>`;
}

/* ---- Evidencias ---- */
function vEvidencias() {
  UI.list = () => {
    const q = (UI.f.eq || '').toLowerCase();
    const recs = DB.records.filter(r => (!UI.f.ep || r.projectId === UI.f.ep));
    let html = '';
    recs.forEach(r => {
      const ev = DB.evidences.filter(e => e.recId === r.uid && (!UI.f.em || e.momento === UI.f.em) && (!q || (e.descripcion + r.code + r.titulo + e.archivo).toLowerCase().includes(q)));
      if (!ev.length) return;
      html += `<div class="card evidence-record"><div class="page-head" style="margin-bottom:.6rem"><div><div class="eyebrow">${esc(r.tipo)}</div><h3 style="margin:0"><a href="#/registro/${enc(r.uid)}">${esc(r.code)}</a> · ${esc(r.titulo)}</h3><div class="muted small">${esc(r.projectId)} · ${esc(r.sector||'Sin sector')}</div></div><span class="badge b-blue">${ev.length} evidencia${ev.length===1?'':'s'}</span></div><div class="ev-gallery">${ev.map(e=>`<article class="evidence-gallery-item"><div class="evidence-image-wrap">${e.img?`<img src="${e.img}" alt="${esc(e.descripcion)}" data-act="ev-view" data-id="${esc(e.id)}">`:`<div class="ph">${e.tipo==='Fotografía'?'📷':'📎'}</div>`}</div><div class="evidence-gallery-meta"><span class="badge b-blue">${esc(e.momento)}</span><b>${esc(e.descripcion)}</b><div class="muted small">${esc(e.tipo)} · ${fmtFecha(e.fecha)}${e.archivo?' · '+esc(e.archivo):''}</div><div class="row no-print"><button class="btn btn-sec btn-sm" data-act="ev-view" data-id="${esc(e.id)}">Ver</button><button class="btn btn-danger btn-sm" data-act="ev-del" data-id="${esc(e.id)}">Quitar</button></div></div></article>`).join('')}</div></div>`;
    });
    $('#list').innerHTML = html || '<div class="card empty">No hay evidencias que coincidan con los filtros.</div>';
  };
  return `<div class="page-head"><div><h2>Evidencias</h2><p class="muted small">Repositorio visual de DH, NCR y futuras DI. Cada evidencia mantiene su registro, momento y descripción.</p></div></div>
  <div class="toolbar"><input type="search" placeholder="Buscar evidencia…" data-filter="eq" value="${fv('eq')}"><select data-filter="ep">${projOpts(UI.f.ep, 'Todos los proyectos')}</select><select data-filter="em">${opts(MOMENTOS, UI.f.em, 'Todos los momentos')}</select></div><div id="list"></div>`;
}

/* ---- Indicadores ---- */
function indicadoresHTML(pid) {
  const recs = DB.records.filter(r => !pid || r.projectId === pid);
  const ncr = recs.filter(r => r.tipo === 'NCR'), dh = recs.filter(r => r.tipo === 'DH');
  const cerr = recs.filter(r => !isOpen(r) && r.fechaCierre);
  const prom = cerr.length ? (cerr.reduce((s, r) => s + daysBetween(r.fecha, r.fechaCierre), 0) / cerr.length).toFixed(1) + ' días' : '—';
  const insp = DB.inspections.filter(i => !pid || i.projectId === pid);
  const total=ncr.length, cerradas=ncr.filter(r=>!isOpen(r)).length, conSol=ncr.filter(r=>String(r.solucionPropuesta||r.accionCorrectiva||'').trim()).length;
  const verificadas=ncr.filter(r=>r.verificaciones&&r.verificaciones.length).length;
  const conformes=ncr.filter(r=>{const v=r.verificaciones&&r.verificaciones[r.verificaciones.length-1]; return v&&v.resultado==='Conforme';}).length;
  const tasa=total?Math.round(cerradas/total*100)+'%':'—';
  return `<div class="grid stats">${stat('DH abiertos', dh.filter(isOpen).length, 'yel')}${stat('DH cerrados', dh.filter(r => !isOpen(r)).length, 'grn')}${stat('NCR abiertas', ncr.filter(isOpen).length, 'red')}${stat('NCR cerradas', cerradas, 'grn')}${stat('Tasa cierre NCR', tasa, 'grn')}${stat('NCR con solución', conSol+'/'+total)}${stat('NCR verificadas', verificadas+'/'+total)}${stat('Tiempo prom. de cierre', prom)}${stat('Alertas preventivas', getAlerts(pid).length)}${stat('Inspecciones realizadas', insp.filter(i => i.estado === 'Realizada').length)}</div>
  <div class="grid two" style="margin-top:1rem">
    ${pid ? '' : `<div class="card"><h3>NCR por proyecto</h3>${bars(countBy(ncr, r => r.projectId))}</div>`}
    <div class="card"><h3>NCR por estado</h3>${bars(countBy(ncr, r => r.estado))}</div>
    <div class="card"><h3>NCR por especialidad</h3>${bars(countBy(ncr, r => r.especialidad))}</div>
    <div class="card"><h3>NCR por partida</h3>${bars(countBy(ncr, r => r.partida || 'Sin partida'))}</div>
    <div class="card"><h3>NCR por causa</h3>${bars(countBy(ncr, r => r.categoriaCausa || 'Sin definir'))}</div>
    <div class="card"><h3>DH por especialidad</h3>${bars(countBy(dh, r => r.especialidad))}</div>
    <div class="card"><h3>Resultado de verificaciones</h3>${bars([['Conforme',conformes],['Pendiente / sin verificar',total-conformes]])}</div>
    <div class="card"><h3>Riesgo de nido de piedra (inspecciones)</h3>${bars(countBy(insp.filter(i => i.riesgo), i => i.riesgo.nivel))}</div>
  </div>`;
}
function vIndicadores() {
  return `<div class="page-head"><h2>Indicadores</h2></div><div class="toolbar"><select id="ind-p">${projOpts(UI.f.ind, 'Todos los proyectos')}</select></div><div id="ind-out">${indicadoresHTML(UI.f.ind || '')}</div>`;
}

/* ---- Reportes ---- */
function vReportes() {
  return `<div class="page-head"><h2>Reportes</h2></div>
  <div class="card no-print"><div class="form-grid">
    <div><label>Tipo de informe</label><select id="rep-t">${opts([['proyecto', 'Informe de proyecto'], ['dh', 'Informe de DH'], ['ncr', 'Informe de NCR'], ['ncr-detalle', 'Ficha individual de NCR'], ['inspecciones', 'Informe de inspecciones'], ['indicadores', 'Informe de indicadores']], UI.f.rept || 'proyecto')}</select></div>
    <div><label>Proyecto</label><select id="rep-p">${projOpts(UI.f.repp, 'Todos los proyectos')}</select></div>
    <div id="rep-ncr-box" class="full" style="display:${(UI.f.rept||'proyecto')==='ncr-detalle'?'block':'none'}"><label>NCR específica</label><select id="rep-ncr"><option value="">Seleccione una NCR…</option>${DB.records.filter(r=>r.tipo==='NCR').map(r=>`<option value="${esc(r.uid)}" ${UI.f.repn===r.uid?'selected':''}>${esc(r.code)} · ${esc(r.titulo)}</option>`).join('')}</select></div></div>
    <div class="modal-foot"><button class="btn" data-act="rep-gen">Generar vista</button><button class="btn btn-sec" data-act="rep-print">🖨 Imprimir / Guardar PDF</button></div>
    <p class="muted small" style="margin:0">Primera versión: vista imprimible desde el navegador (luego se incorporará PDF directo).</p></div>
  <div id="rep-out"></div>`;
}
function repHTML(tipo, pid) {
  const p = pid ? getProj(pid) : null;
  const recs = DB.records.filter(r => !pid || r.projectId === pid);
  const head = (t) => `<div class="card"><div class="page-head" style="margin:0"><div><h2 style="margin:0">OBRA CONTROL · ${t}</h2><div class="muted small">${p ? esc(p.id + ' · ' + p.nombre) : 'Todos los proyectos'}</div></div><div class="muted small">Emitido: ${fmtFecha(hoy())}</div></div></div>`;
  if (tipo === 'proyecto') {
    if (!p) return '<div class="card empty">Seleccione un proyecto para el informe de proyecto.</div>';
    return head('Informe de proyecto') + `<div class="card"><h3>Datos generales</h3><div class="kv">${kv('Mandante', esc(p.mandante))}${kv('Empresa de supervisión', esc(p.empresaSupervision||'Praxis Edificaciones'))}${kv('Contratista', esc(p.contratista))}${kv('Ubicación', esc(p.ubicacion))}${kv('Estado', esc(p.estado))}${kv('Responsable', esc(p.responsable))}${kv('Plazo', fmtFecha(p.inicio) + ' → ' + fmtFecha(p.termino))}${kv('Calidad', semBadge(projSem(p)))}</div></div>
    <div class="card"><h3>DH / NCR</h3>${recTable(recs, false)}</div><div class="card"><h3>Alertas vigentes</h3>${alertsBlock(getAlerts(p.id))}</div><div class="card"><h3>Inspecciones</h3>${inspTable(DB.inspections.filter(i => i.projectId === p.id), false).replace(/<button[^>]*>.*?<\/button>/g, '')}</div>${indicadoresHTML(p.id)}`;
  }
  if (tipo === 'dh' || tipo === 'ncr') {
    const l = recs.filter(r => r.tipo === tipo.toUpperCase());
    return head('Informe de ' + tipo.toUpperCase()) + (l.length ? l.map(r => `<div class="card"><h3>${esc(r.code)} · ${esc(r.titulo)}</h3><div class="kv">${kv('Estado', esc(r.estado))}${kv('Criticidad', esc(r.criticidad))}${kv('Fecha', fmtFecha(r.fecha))}${kv('Sector', esc(r.sector))}${kv('Especialidad', esc(r.especialidad))}${kv('Responsable', esc(r.responsable))}${kv('Compromiso', fmtFecha(r.fechaCompromiso))}${kv('Cierre', fmtFecha(r.fechaCierre))}</div>${blockTxt('Descripción', r.descripcion)}${blockTxt('Causa inmediata', r.causaInmediata)}${blockTxt('Causa sistémica', r.causaSistemica)}${blockTxt('Acción correctiva', r.accionCorrectiva)}${blockTxt('Acción preventiva', r.accionPreventiva)}</div>`).join('') : '<div class="card empty">Sin registros.</div>');
  }
  if (tipo === 'ncr-detalle') {
    const r=DB.records.find(x=>x.uid===UI.f.repn && x.tipo==='NCR');
    if(!r) return '<div class="card empty">Seleccione una NCR específica.</div>';
    const reportProject=getProj(r.projectId);
    const fr=reportProject && (reportProject.frentes||[]).find(f=>f.id===r.frenteId);
    const ev=DB.evidences.filter(e=>e.recId===r.uid);
    const lastVerification=(r.verificaciones||[]).slice(-1)[0];
    const evStages=['ANTES','DURANTE','DESPUÉS'].map(stage=>({stage,items:ev.filter(e=>e.momento===stage)}));
    const tl=r.timeline||[];
    return head('Ficha individual de NCR') + `<div class="card"><h2>${esc(r.code)} · ${esc(r.titulo)}</h2><div class="kv">${kv('Proyecto',esc(reportProject?reportProject.id+' · '+reportProject.nombre:r.projectId))}${kv('Proyecto',esc(reportProject?reportProject.id+' · '+reportProject.nombre:r.projectId))}${kv('Estado',badgeEstado(r.estado))}${kv('Criticidad',badgeCrit(r.criticidad))}${kv('Fecha',fmtFecha(r.fecha))}${kv('Vivienda / frente',fr?esc(fr.nombre):'—')}${kv('Sector',esc(r.sector))}${kv('Especialidad',esc(r.especialidad))}${kv('Responsable',esc(r.responsable))}${kv('Compromiso',fmtFecha(r.fechaCompromiso))}${kv('Cierre',fmtFecha(r.fechaCierre))}${kv('Costo no calidad','$'+Number(r.costoNoCalidad||0).toLocaleString('es-CL'))}${kv('Horas improductivas',String(r.horasNoCalidad||0))}</div></div>
    <div class="grid two"><div class="card">${blockTxt('Descripción',r.descripcion)}${blockTxt('Requisito',r.requisito)}${blockTxt('Causa inmediata',r.causaInmediata)}${blockTxt('Causa sistémica',r.causaSistemica)}</div><div class="card">${blockTxt('Solución propuesta',r.solucionPropuesta||r.accionCorrectiva)}${blockTxt('Material / recurso',r.materialSolucion)}${blockTxt('Procedimiento',r.procedimientoSolucion)}${blockTxt('Acción preventiva',r.accionPreventiva)}${r.solucionInnovadora?blockTxt('Solución innovadora',r.solucionInnovadora.producto||r.solucionInnovadora.titulo||'Registrada'):''}${r.solucionInnovadora?blockTxt('Solución innovadora',r.solucionInnovadora.producto||r.solucionInnovadora.titulo||'Registrada'):''}</div></div>
    <div class="card"><h3>Verificación</h3>${r.verificaciones&&r.verificaciones.length?r.verificaciones.map(v=>`<div class="block"><b>${esc(v.resultado)}</b> · ${fmtFecha(v.fecha)} · ${esc(v.responsable)}${v.firma?`<div>Firma/aprobación: ${esc(v.firma)}</div>`:''}${v.obs?`<div>${esc(v.obs)}</div>`:''}</div>`).join(''):'<span class="muted">Sin verificación registrada.</span>'}</div>
    <div class="card"><h3>Línea de tiempo</h3><div class="timeline">${tl.map(t=>`<div class="tl"><div class="d">${fmtCorta(t.fecha)} ${t.hora||''}</div><div class="t">${esc(t.estado)}</div>${t.actor?`<div class="n">👤 ${esc(t.actor)}</div>`:''}${t.nota?`<div class="n">${esc(t.nota)}</div>`:''}</div>`).join('')}</div></div>
    <div class="card"><h3>Evidencias (${ev.length})</h3>${ev.length?evStages.map(st=>`<div class="evidence-report-stage"><h4>${st.stage} · ${st.items.length}</h4>${st.items.length?`<div class="photo-grid">${st.items.map(e=>e.img?`<figure><img src="${e.img}" alt="${esc(e.descripcion)}"><figcaption>${esc(e.descripcion)} · ${fmtFecha(e.fecha)}</figcaption></figure>`:`<div class="ph">📎 ${esc(e.descripcion)}</div>`).join('')}</div>`:'<span class="muted small">Sin evidencia en esta etapa.</span>'}</div>`).join(''):'<span class="muted">Sin evidencias.</span>'}</div><div class="card"><h3>Estado de verificación</h3>${lastVerification?`<div class="kv">${kv('Resultado',esc(lastVerification.resultado))}${kv('Responsable',esc(lastVerification.responsable))}${kv('Firma / aprobación',esc(lastVerification.firma||'No registrada'))}${kv('Fecha',fmtFecha(lastVerification.fecha))}</div>`:'Sin verificación registrada.'}</div>`;
  }
  if (tipo === 'inspecciones') return head('Informe de inspecciones') + `<div class="card">${inspTable(DB.inspections.filter(i => !pid || i.projectId === pid)).replace(/<button[^>]*>.*?<\/button>/g, '')}</div>`;
  return head('Informe de indicadores') + indicadoresHTML(pid);
}

function notFound(msg) { return `<div class="card empty"><h3>${esc(msg)}</h3><a href="#/dashboard">Volver al dashboard</a></div>`; }

/* ============ 7. FORMULARIOS Y ACCIONES ============ */
const F = (id, label, inner, cls = '') => `<div class="${cls}"><label for="${id}">${label}</label>${inner}</div>`;

function projForm(p) {
  const e = !!p; p = p || { estado: 'En ejecución' };
  openModal(e ? 'Editar proyecto' : 'Nuevo proyecto', `<form data-form="proj" data-edit="${e ? esc(p.id) : ''}"><div class="form-grid">
    ${F('pid', 'ID del proyecto *', `<input id="pid" name="id" required value="${esc(p.id)}" ${e ? 'readonly' : ''} placeholder="Ej: 1735-48-LR26">`)}
    ${F('pn', 'Nombre *', `<input id="pn" name="nombre" required value="${esc(p.nombre)}">`)}
    ${F('pm', 'Mandante', `<input id="pm" name="mandante" value="${esc(p.mandante)}">`)}
    ${F('pc', 'Contratista', `<input id="pc" name="contratista" value="${esc(p.contratista)}">`)}
    ${F('pes', 'Empresa de supervisión', `<input id="pes" name="empresaSupervision" value="${esc(p.empresaSupervision||'Praxis Edificaciones')}">`)}
    ${F('pu', 'Ubicación', `<input id="pu" name="ubicacion" value="${esc(p.ubicacion)}">`)}
    ${F('pe', 'Estado', `<select id="pe" name="estado">${opts(ESTADOS_PROY, p.estado)}</select>`)}
    ${F('pi', 'Fecha de inicio', `<input id="pi" type="date" name="inicio" value="${esc(p.inicio)}">`)}
    ${F('pt', 'Fecha de término', `<input id="pt" type="date" name="termino" value="${esc(p.termino)}">`)}
    ${F('pr', 'Responsable', `<input id="pr" name="responsable" value="${esc(p.responsable)}">`)}
    ${F('pd', 'Descripción', `<textarea id="pd" name="descripcion">${esc(p.descripcion)}</textarea>`, 'full')}
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
}

function frentesOpts(pid, sel) {
  const p = getProj(pid);
  return opts(((p && p.frentes) || []).map(f => [f.id, f.nombre]), sel, 'Sin asignar');
}
function recForm(r, pid, tipo) {
  const e=!!r; r=r||{tipo:tipo||'NCR',projectId:pid||'',fecha:hoy(),criticidad:'Menor',especialidad:'Hormigón'};
  if(!DB.projects.length)return toast('Primero cree un proyecto.','err');
  const field=(name,label,value,placeholder='',full=false)=>F(name,label,`<textarea name="${name}" ${placeholder?'placeholder="'+placeholder+'"':''}>${esc(value||'')}</textarea>`,full?'full':undefined);
  openModal(e?'Editar '+r.code:'Nuevo '+(r.tipo==='DH'?'DH · Hallazgo técnico':'NCR · No conformidad'),`<form data-form="rec" data-edit="${e?esc(r.uid):''}">
  <div class="record-form-intro"><b>${r.tipo==='DH'?'DH · Detectar y comunicar un hallazgo':'NCR · Registrar un incumplimiento que debe corregirse'}</b><p>Complete los datos básicos en orden. Escriba qué observó, dónde ocurrió y qué se debe hacer. Los antecedentes técnicos adicionales están al final.</p><div class="record-form-steps"><span>1 · Identificar</span><span>2 · Describir</span><span>3 · Corregir</span></div></div>
  <div class="solution-form-block full"><div class="solution-form-title">1. Identificación del registro</div><div class="muted small">¿Dónde ocurrió y quién debe hacerse cargo?</div></div>
  <div class="form-grid">
  ${F('rt','Tipo de registro',`<select name="tipo" ${e?'disabled':''}>${opts(['DH','NCR'],r.tipo)}</select>`)}
  ${F('rp','Proyecto *',`<select name="projectId" required>${projOpts(r.projectId,'Seleccione proyecto')}</select>`)}
  ${F('rti','Título breve *',`<input name="titulo" required value="${esc(r.titulo||'')}" placeholder="Ej. Nido de piedra en radier">`,'full')}
  ${F('rf','Fecha de detección *',`<input type="date" name="fecha" required value="${esc(r.fecha||hoy())}">`)}
  ${F('rfr','Vivienda / frente',`<select name="frenteId">${frentesOpts(r.projectId,r.frenteId)}</select>`)}
  ${F('rs','Ubicación / sector',`<input name="sector" value="${esc(r.sector||'')}" placeholder="Ej. Casa 4, baño, eje A-2">`)}
  ${F('rpa','Partida / actividad',`<input name="partida" value="${esc(r.partida||'')}" placeholder="Ej. Hormigonado de radier">`)}
  ${F('res','Especialidad',`<select name="especialidad">${opts(ESPECIALIDADES,r.especialidad)}</select>`)}
  ${F('rcr','Gravedad / criticidad',`<select name="criticidad">${opts(CRITICIDADES,r.criticidad)}</select>`)}
  ${F('rre','Responsable de resolver *',`<input name="responsable" required value="${esc(r.responsable||'')}" placeholder="Nombre del responsable">`)}
  ${F('rfc','Fecha comprometida',`<input type="date" name="fechaCompromiso" value="${esc(r.fechaCompromiso||'')}">`)}
  <div class="solution-form-block full"><div class="solution-form-title">2. ¿Qué ocurrió?</div><div class="muted small">Describa el hecho observado con palabras simples. Evite suposiciones; indique lo que realmente se vio o midió.</div></div>
  ${F('rd','Descripción del hallazgo *',`<textarea name="descripcion" required placeholder="Qué se observó, en qué elemento, dónde y en qué condición…">${esc(r.descripcion||'')}</textarea>`,'full')}
  ${F('robj','Evidencia / dato observado',`<textarea name="evidenciaObjetiva" placeholder="Medida, cantidad, fotografía, fecha, eje o referencia que permita comprobarlo…">${esc(r.evidenciaObjetiva||'')}</textarea>`,'full')}
  ${F('rrq','Plano, EETT o requisito relacionado',`<textarea name="requisito" placeholder="Indique el plano, especificación o condición que debía cumplirse…">${esc(r.requisito||'')}</textarea>`,'full')}
  <div class="solution-form-block full"><div class="solution-form-title">3. ¿Cómo se corregirá?</div><div class="muted small">Indique la medida inmediata y la solución propuesta. No ejecute una reparación que requiera autorización sin aprobación técnica.</div></div>
  ${F('rac','Acción inmediata / qué se hará ahora',`<textarea name="accionCorrectiva" placeholder="Ej. Aislar el sector, detener la partida y avisar al supervisor…">${esc(r.accionCorrectiva||'')}</textarea>`,'full')}
  ${F('rsp','Solución propuesta',`<textarea name="solucionPropuesta" placeholder="Describa cómo se dejará el elemento conforme…">${esc(r.solucionPropuesta||r.accionCorrectiva||'')}</textarea>`,'full')}
  ${F('rpr','Cómo se realizará la reparación',`<textarea name="procedimientoSolucion" placeholder="Pasos principales, preparación, ejecución y control…">${esc(r.procedimientoSolucion||'')}</textarea>`,'full')}
  ${F('rms','Materiales / recursos',`<input name="materialSolucion" value="${esc(r.materialSolucion||'')}" placeholder="Materiales y herramientas requeridas">`)}
  ${F('rmp','Medida para evitar que vuelva a ocurrir'+(r.tipo==='NCR'?' *':''),`<textarea name="medidaPreventiva" placeholder="Qué control se incorporará para prevenir la repetición…">${esc(r.medidaPreventiva||r.accionPreventiva||'')}</textarea>`,'full')}
  <details class="record-advanced full"><summary>Antecedentes técnicos y seguimiento (opcional)</summary><div class="form-grid">
  ${F('rdetector','Detectado por',`<input name="nombreDetector" value="${esc(r.nombreDetector||'')}" placeholder="Nombre y apellido">`)}
  ${F('rcargo','Cargo de quien informa',`<input name="cargoDetector" value="${esc(r.cargoDetector||'')}">`)}
  ${F('rplano','Plano / revisión',`<input name="plano" value="${esc(r.plano||'')}" placeholder="Código y revisión">`)}
  ${F('rel','Elemento constructivo',`<input name="elementoConstructivo" value="${esc(r.elementoConstructivo||r.partida||r.sector||'')}">`)}
  ${F('rfam','Familia del problema',`<input name="familiaProblema" value="${esc(r.familiaProblema||'')}">`)}
  ${F('rcc','Categoría de causa',`<select name="categoriaCausa">${opts(CAUSAS,r.categoriaCausa,'Sin definir')}</select>`)}
  ${F('rcausa1','Causa raíz 1',`<input name="causalRaiz1" value="${esc(r.causalRaiz1||'')}">`)}
  ${F('rcausa2','Causa raíz 2',`<input name="causalRaiz2" value="${esc(r.causalRaiz2||'')}">`)}
  ${F('rci','Causa inmediata',`<textarea name="causaInmediata">${esc(r.causaInmediata||'')}</textarea>`)}
  ${F('rcs','Causa sistémica',`<textarea name="causaSistemica">${esc(r.causaSistemica||'')}</textarea>`)}
  ${F('rccn','Condiciones que contribuyeron',`<textarea name="condicionesContribuyentes">${esc(r.condicionesContribuyentes||'')}</textarea>`,'full')}
  ${F('rtecnica','Corrección técnica',`<textarea name="correccionTecnica">${esc(r.correccionTecnica||'')}</textarea>`)}
  ${F('rmano','Mano de obra',`<input name="manoObra" value="${esc(r.manoObra||'')}">`)}
  ${F('requipo','Equipos',`<input name="equiposCorreccion" value="${esc(r.equiposCorreccion||'')}">`)}
  ${F('rmaterial','Materiales',`<input name="materialesCorreccion" value="${esc(r.materialesCorreccion||'')}">`)}
  ${F('rotros','Otros recursos / restricciones',`<input name="otrosRecursos" value="${esc(r.otrosRecursos||'')}">`)}
  ${F('rautoriza','Autorización técnica',`<select name="autorizacionCorreccion">${opts(['Pendiente','Procede','No procede'],r.autorizacionCorreccion||'Pendiente')}</select>`)}
  ${F('rap','Acción preventiva adicional',`<textarea name="accionPreventiva">${esc(r.accionPreventiva||'')}</textarea>`,'full')}
  ${F('rman','Manual PRAXIS ACADEMY',`<select name="manualAcademyId">${academyManualOptions(r.manualAcademyId||'')}</select>`,'full')}
  ${F('rmotdias','Motivo de extensión de plazo',`<select name="motivoAmpliacion">${opts(['Sin ampliación','NCR / no conformidad','DH / hallazgo técnico','Clima','Siniestro / accidente','Falta de material','Equipo fuera de servicio','Cambio de diseño / RDI','Interferencia de otra cuadrilla','Otro'],r.motivoAmpliacion||'Sin ampliación')}</select>`)}
  ${F('rdias','Días adicionales solicitados',`<input type="number" min="0" step="1" name="diasAdicionales" value="${esc(r.diasAdicionales||0)}">`)}
  ${F('rdiasnota','Tarea afectada y justificación',`<textarea name="detalleAmpliacion" placeholder="Tarea afectada, motivo y respaldo…">${esc(r.detalleAmpliacion||'')}</textarea>`,'full')}
  ${F('rvalidias','Validación de extensión',`<select name="ampliacionValidada">${opts(['Pendiente de validación','Validada por supervisor','Rechazada'],r.ampliacionValidada||'Pendiente de validación')}</select>`)}
  ${F('rco','Costo de no calidad ($)',`<input type="number" min="0" step="1" name="costoNoCalidad" value="${esc(r.costoNoCalidad||0)}">`)}
  ${F('rhh','Horas improductivas',`<input type="number" min="0" step="0.5" name="horasNoCalidad" value="${esc(r.horasNoCalidad||0)}">`)}
  </div></details>
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar registro</button></div></form>`,true);
}

function rdiForm(){
  if(!DB.projects.length)return toast('Primero cree un proyecto.','err');
  openModal('Nueva Solicitud de Información (RDI)', `<form data-form="rdi"><div class="form-grid">
  <div class="solution-form-block full"><div class="solution-form-title">1. Identificación de la solicitud</div><div class="muted small">Completar una RDI por cada consulta técnica claramente delimitada.</div></div>
  ${F('rdp','Proyecto *',`<select name="projectId" required>${projOpts(DB.projects[0].id,'Seleccione proyecto')}</select>`)}
  ${F('rdf','Fecha de emisión *',`<input name="fecha" type="date" required value="${hoy()}">`)}
  ${F('rdfront','Vivienda / frente',`<select name="frenteId">${frentesOpts(DB.projects[0].id,'')}</select>`)}
  ${F('rdresp','Solicitante / responsable *',`<input name="responsable" required value="${esc(CURRENT_ROLE)}">`)}
  ${F('rdarea','Área / especialidad *',`<select name="especialidad" required>${opts(ESPECIALIDADES,'Hormigón')}</select>`)}
  ${F('rdasunto','Asunto *',`<input name="asunto" required placeholder="Ej. Discrepancia de armadura en encuentro de fundación">`,'full')}
  <div class="solution-form-block full"><div class="solution-form-title">2. Referencias documentales</div></div>
  ${F('rdplano','Plano N° / código y revisión',`<input name="plano" placeholder="Código, lámina y revisión vigente">`)}
  ${F('rdeett','EETT / especificación / numeral',`<input name="eett" placeholder="Documento, capítulo o numeral">`)}
  ${F('rdelem','Elemento y ubicación exacta *',`<input name="ubicacion" required placeholder="Eje, nivel, recinto, vivienda o partida">`,'full')}
  <div class="solution-form-block full"><div class="solution-form-title">3. Descripción y consulta técnica</div></div>
  ${F('rddesc','Antecedentes / condición observada *',`<textarea name="descripcion" required placeholder="Describa el hecho verificable, omisión, interferencia o discrepancia sin proponer una solución como si estuviera aprobada."></textarea>`,'full')}
  ${F('rdpreg','Consulta específica *',`<textarea name="consulta" required placeholder="Formule la pregunta que debe responder el proyectista / ITO / responsable técnico."></textarea>`,'full')}
  ${F('rdimpact','Impacto si no se responde',`<textarea name="impacto" placeholder="Efecto en calidad, seguridad, costo, secuencia o plazo."></textarea>`,'full')}
  ${F('rdpropuesta','Propuesta del equipo (si aplica)',`<textarea name="propuesta" placeholder="Alternativa para evaluación; no ejecutar sin aprobación cuando corresponda."></textarea>`,'full')}
  <div class="solution-form-block full"><div class="solution-form-title">4. Respuesta y cierre</div></div>
  ${F('rdprior','Prioridad *',`<select name="prioridad"><option>Normal</option><option>Alta</option><option>Crítica</option></select>`)}
  ${F('rdplazo','Fecha compromiso de respuesta',`<input name="fechaRespuestaCompromiso" type="date">`)}
  ${F('rdestado','Estado',`<select name="estado"><option>En preparación</option><option selected>Emitida</option><option>En revisión</option><option>Respondida</option><option>Cerrada</option><option>Anulada</option></select>`)}
  ${F('rdto','Dirigida a / responsable de respuesta',`<input name="dirigidaA" placeholder="Proyectista, ITO, calculista, arquitectura…">`)}
  ${F('rdrespuesta','Respuesta oficial / instrucción recibida',`<textarea name="respuesta" placeholder="Registrar respuesta textual o resumida y referencia del documento que la formaliza."></textarea>`,'full')}
  ${F('rdresfecha','Fecha de respuesta',`<input name="fechaRespuesta" type="date">`)}
  ${F('rdverif','Verificación de implementación / observaciones de cierre',`<textarea name="verificacion" placeholder="Indicar plano revisado, cambio incorporado, comunicación a terreno y responsable de verificar."></textarea>`,'full')}
  <div class="notice full">Una RDI registra una consulta y su respuesta formal. No reemplaza una revisión de proyecto ni autoriza por sí sola cambios de diseño o ejecución.</div>
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar RDI</button></div></form>`,true);
}

function innovForm(recId) {
  const r=getRec(recId); const s=r.solucionInnovadora || {};
  openModal(s.activa ? 'Editar solución innovadora' : 'Agregar solución innovadora', `<form data-form="innov" data-id="${esc(recId)}"><div class="form-grid">
    ${F('invt','Nombre / solución *',`<input id="invt" name="titulo" required value="${esc(s.producto || s.titulo || '')}" placeholder="Ej: SikaRep AR">`,'full')}
    ${F('invd','Descripción',`<textarea id="invd" name="descripcion">${esc(s.problema || s.descripcion || '')}</textarea>`,'full')}
    ${F('invm','Material / recurso',`<input id="invm" name="material" value="${esc(s.material || s.producto || '')}">`)}
    ${F('invp','Qué hacer / aplicación',`<textarea id="invp" name="procedimiento">${esc(s.procedimiento || '')}</textarea>`)}
    ${F('invj','Justificación',`<textarea id="invj" name="justificacion">${esc(s.justificacion || '')}</textarea>`,'full')}
    ${F('invb','Beneficio / prevención',`<textarea id="invb" name="beneficio">${esc(s.beneficio || s.prevencion || '')}</textarea>`,'full')}
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar solución</button></div></form>`);
}

function evForm(recId) {
  openModal('Agregar evidencia', `<form data-form="ev" data-id="${esc(recId)}"><div class="form-grid">
    ${F('em', 'Momento *', `<select id="em" name="momento">${opts(MOMENTOS, 'ANTES')}</select>`)}
    ${F('et', 'Tipo de evidencia', `<select id="et" name="tipo">${opts(TIPOS_EV, 'Fotografía')}</select>`)}
    ${F('ed', 'Descripción *', `<textarea id="ed" name="descripcion" required></textarea>`, 'full')}
    ${F('ef', 'Fecha', `<input id="ef" type="date" name="fecha" value="${hoy()}">`)}
    ${F('ea', 'Archivo o fotografías', `<input id="ea" type="file" name="archivo" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple data-ev-files><div id="ev-file-preview" class="photo-preview"></div>`)}
  </div><p class="muted small">Puede seleccionar varias fotografías. En esta versión se guardan localmente en este navegador; para compartirlas entre usuarios será necesario conectar almacenamiento/servidor.</p>
  <div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
}

function getItemData(i,k){ const old=i.items&&i.items[k]||{}; return {resultado:old.resultado||i.respuestas[k]||'', observacion:old.observacion||'', fotografias:old.fotografias||[]}; }
function inspForm(pid, existing) {
  if (!DB.projects.length) return toast('Primero cree un proyecto.', 'err');
  const i = existing || { projectId: pid || '', fecha: hoy(), sector: '', responsable: '', metodo: 'Bomba', respuestas: {}, items:{} };
  const grupos = CHECKLIST.map(g => `<div class="chk-group"><h4 class="chk-group-title">${g.g.toUpperCase()}</h4>${g.items.map(([k, t]) => {
    const d=getItemData(i,k), v=d.resultado;
    const obsOpen=!!String(d.observacion||'').trim() || d.fotografias.length>0 || v==='no';
    const savedPhotos=d.fotografias||[];
    return `<div class="chk-card ${obsOpen?'has-observation':''}" data-check-card="${k}">
      <div class="chk-main">
        <div class="chk-item-title"><span class="chk-number">${TODAS_CLAVES.indexOf(k)+1}</span><b>${esc(t)}</b></div>
        <div class="seg">${[['si','Sí'],['no','No'],['na','N/A']].map(([val,l])=>`<label><input type="radio" name="r_${k}" value="${val}" ${v===val?'checked':''}><span>${l}</span></label>`).join('')}</div>
      </div>
      <label class="obs-toggle"><input type="checkbox" name="obs_toggle_${k}" data-obs-toggle="${k}" ${obsOpen?'checked':''}><span>📝 Agregar observación</span></label>
      <div class="chk-detail ${obsOpen?'is-open':''}" id="chk-detail-${k}" ${obsOpen?'':'hidden'}>
        <textarea name="obs_${k}" rows="3" placeholder="Escriba aquí la observación de este ítem…">${esc(d.observacion)}</textarea>
        <div class="photo-field">
          <div class="photo-label">📷 Evidencia fotográfica <span class="muted">(recomendada si No cumple)</span></div>
          <input type="file" name="photo_${k}" accept="image/*" multiple data-check-photo="${k}">
          <div class="photo-preview" id="photo-preview-${k}">${savedPhotos.length?savedPhotos.map(x=>`<div class="photo-thumb"><img src="${esc(x.data||x.img||'')}" alt="${esc(x.nombre||'Fotografía')}"><span>${esc(x.nombre||'Fotografía')}</span></div>`).join(''):'<span class="muted small">Sin fotografías nuevas</span>'}</div>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`).join('');
  openModal('Control preventivo de hormigonado', `<form data-form="insp" data-edit="${existing ? esc(existing.id) : ''}"><div class="form-grid">
    ${F('ip', 'Proyecto *', `<select id="ip" name="projectId" required>${projOpts(i.projectId, 'Seleccione…')}</select>`)}
    ${F('if', 'Fecha *', `<input id="if" type="date" name="fecha" required value="${esc(i.fecha)}">`)}
    ${F('is', 'Sector / elemento *', `<input id="is" name="sector" required value="${esc(i.sector)}" placeholder="Ej: Radier vivienda 04">`)}
    ${F('ifront', 'Vivienda / frente', `<select id="ifront" name="frenteId">${frentesOpts(i.projectId, i.frenteId || '')}</select>`, 'full')}
    ${F('ir', 'Responsable *', `<input id="ir" name="responsable" required value="${esc(i.responsable)}">`)}
    ${F('im', 'Método de colocación', `<select id="im" name="metodo">${opts(METODOS, i.metodo)}</select>`, 'full')}
  </div><div style="margin-top:1rem">${grupos}</div>
  <div id="risk-panel">${riskHTML(calcRiesgo(i.respuestas, i.metodo))}${lessonsHint()}</div>
  ${F('io', 'Observaciones generales', `<textarea id="io" name="observaciones">${esc(i.observaciones)}</textarea>`, 'full')}
  <div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar inspección</button></div></form>`, true);
}
function readResp(form) {
  const fd = new FormData(form), resp = {};
  TODAS_CLAVES.forEach(k => { const v = fd.get('r_' + k); if (v) resp[k] = v; });
  return { resp, metodo: fd.get('metodo') };
}
async function readChecklistItems(form, previous={}) {
  const fd=new FormData(form), items={}, resp={};
  for (const k of TODAS_CLAVES) {
    const resultado=fd.get('r_'+k)||''; resp[k]=resultado;
    const prev=previous[k]||{}; const fotos=Array.isArray(prev.fotografias)?prev.fotografias.slice():[];
    const files=fd.getAll('photo_'+k).filter(f=>f&&f.size);
    for(const file of files){ if(!file.type.startsWith('image/')) continue; try{ const img=await fileToDataURL(file); fotos.push({id:uid(),nombre:file.name,type:file.type,data:img}); }catch(e){} }
    items[k]={resultado,observacion:(fd.get('obs_'+k)||'').trim(),fotografias:fotos};
  }
  return {items,resp};
}

function schedForm(pid) {
  if (!DB.projects.length) return toast('Primero cree un proyecto.', 'err');
  openModal('Programar inspección', `<form data-form="sched"><div class="form-grid">
    ${F('sp', 'Proyecto *', `<select id="sp" name="projectId" required>${projOpts(pid, 'Seleccione…')}</select>`)}
    ${F('sf', 'Fecha programada *', `<input id="sf" type="date" name="fecha" required value="${addDays(1)}">`)}
    ${F('st', 'Tipo', `<input id="st" name="tipo" value="${TIPO_INSP}">`)}
    ${F('ss', 'Sector / elemento *', `<input id="ss" name="sector" required>`)}
    ${F('sfront', 'Vivienda / frente', `<select id="sfront" name="frenteId">${frentesOpts(pid || '', '')}</select>`, 'full')}
    ${F('sr', 'Responsable *', `<input id="sr" name="responsable" required>`, 'full')}
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Programar</button></div></form>`);
}

function lessonForm(recId) {
  const r = getRec(recId);
  openModal('Registrar lección aprendida', `<form data-form="lesson" data-id="${esc(recId)}"><div class="form-grid">
    ${F('lp', 'Problema *', `<input id="lp" name="problema" required value="${esc(r.titulo)}">`, 'full')}
    ${F('lc', 'Causa', `<textarea id="lc" name="causa">${esc(r.causaInmediata)}</textarea>`)}
    ${F('ls', 'Solución', `<textarea id="ls" name="solucion">${esc(r.accionCorrectiva)}</textarea>`)}
    ${F('lm', 'Medida preventiva', `<textarea id="lm" name="medida">${esc(r.accionPreventiva)}</textarea>`)}
    ${F('lr', 'Recomendación', `<textarea id="lr" name="recomendacion"></textarea>`)}
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
}

function frenteForm(pid) {
  openModal('Agregar vivienda / frente', `<form data-form="frente" data-id="${esc(pid)}"><div class="form-grid">
    ${F('fn', 'Nombre *', `<input id="fn" name="nombre" required placeholder="Ej: Vivienda 13">`, 'full')}
    ${F('fla', 'Latitud (opcional)', `<input id="fla" name="lat" type="number" step="any">`)}
    ${F('flo', 'Longitud (opcional)', `<input id="flo" name="lng" type="number" step="any">`)}
  </div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Agregar</button></div></form>`);
}

/* Imagen → DataURL reducido (máx. 800 px) para ahorrar espacio en localStorage */
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onerror = rej;
    rd.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const s = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}

function setEstado(r, estado, nota) {
  r.estado = estado; r.timeline.push({ fecha: hoy(), hora: new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}), estado, actor: '', nota: nota || '' });
}

/* Manejadores de envío de formularios */
const FORMS = {
  async 'cloud-login'(fd){ try{ await startCloudLogin(fd); }catch(err){ authScreen(err?.message||'No se pudo conectar con Supabase.'); } },
  async 'auth-setup'(fd){
    if(AUTH_USERS.length) return authScreen('La configuración inicial ya fue completada. Inicie sesión.');
    const nombre=(fd.get('nombre')||'').trim(), usuario=(fd.get('usuario')||'').trim().toLowerCase(), pin=String(fd.get('pin')||''), pin2=String(fd.get('pin2')||'');
    if(!nombre||!/^[a-z0-9._-]{3,30}$/.test(usuario)) return authScreen('Ingrese nombre y un usuario de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
    if(!/^\d{4,8}$/.test(pin)) return authScreen('El PIN debe contener entre 4 y 8 dígitos numéricos.');
    if(pin!==pin2) return authScreen('Los PIN no coinciden.');
    const salt=randomSalt(), user={id:uid(),nombre,usuario,rol:'Administrador',salt,pinHash:await pinHash(pin,salt),activo:true,creado:hoy()};
    AUTH_USERS=[user]; if(!saveUsers()) return authScreen('No se pudo guardar la cuenta en este navegador.');
    toast('Administrador creado.','ok'); setLoggedIn(user);
  },
  async 'auth-login'(fd){
    const usuario=(fd.get('usuario')||'').trim().toLowerCase(), pin=String(fd.get('pin')||'');
    const user=AUTH_USERS.find(u=>u.usuario.toLowerCase()===usuario);
    if(!user || user.activo===false || !(await verifyPin(user,pin))) return authScreen('Usuario o contraseña incorrectos, o cuenta desactivada.');
    setLoggedIn(user);
  },
  'crew-create'(fd){
    if(!isCrewManager())return toast('No tiene permiso para crear cuadrillas.','err');
    const nombre=String(fd.get('nombre')||'').trim(), responsable=String(fd.get('responsable')||'').trim(), miembros=fd.getAll('miembros');
    if(!nombre||!miembros.length)return toast('Ingrese nombre y seleccione al menos un trabajador.','err');
    if(CREWS.some(c=>c.nombre.toLowerCase()===nombre.toLowerCase()))return toast('Ya existe una cuadrilla con ese nombre.','err');
    CREWS.push({id:uid(),nombre,responsable,miembros,creada:hoy(),creadaPor:CURRENT_USER.usuario});
    if(!saveCrews())return;closeModal();toast('Cuadrilla creada.','ok');location.hash='#/cuadrillas';render();
  },
  async 'user-create'(fd){
    if(!canManageUsers())return toast('Solo el Administrador puede registrar usuarios.','err');
    const nombre=(fd.get('nombre')||'').trim(), usuario=(fd.get('usuario')||'').trim().toLowerCase(), rol=fd.get('rol'), pin=String(fd.get('pin')||''), pin2=String(fd.get('pin2')||'');
    if(!nombre||!/^[a-z0-9._-]{3,30}$/.test(usuario))return toast('Revise el nombre y el formato del usuario.','err');
    if(AUTH_USERS.some(u=>u.usuario.toLowerCase()===usuario))return toast('Ese nombre de usuario ya existe.','err');
    if(!USER_ROLES.includes(rol))return toast('Seleccione una categoría válida.','err');
    if(!/^\d{4,8}$/.test(pin)||pin!==pin2)return toast('Los PIN deben tener 4 a 8 dígitos y coincidir.','err');
    const salt=randomSalt(); AUTH_USERS.push({id:uid(),nombre,usuario,rol,salt,pinHash:await pinHash(pin,salt),activo:true,creado:hoy(),creadoPor:CURRENT_USER.usuario});
    if(!saveUsers())return; closeModal();toast('Usuario registrado correctamente.','ok');location.hash='#/usuarios';render();
  },
  async 'user-reset-pin'(fd,form){
    if(!canManageUsers())return toast('Solo el Administrador puede restablecer PIN.','err');
    const pin=String(fd.get('pin')||''), pin2=String(fd.get('pin2')||''), user=AUTH_USERS.find(u=>u.id===form.dataset.id);
    if(!user)return toast('No se encontró el usuario.','err'); if(!/^\d{4,8}$/.test(pin)||pin!==pin2)return toast('Los PIN deben tener 4 a 8 dígitos y coincidir.','err');
    user.salt=randomSalt();user.pinHash=await pinHash(pin,user.salt);saveUsers();closeModal();toast('PIN actualizado. Comuníquelo de forma privada al usuario.','ok');render();
  },
  'academy-assign'(fd){ if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const g=k=>(fd.get(k)||'').trim();if(!g('nombre')||!g('cargo')||!g('projectId')||!g('elemento')||!g('manualId')||!g('responsable'))return toast('Complete los datos obligatorios.','err');const t={id:uid(),nombre:g('nombre'),cargo:g('cargo'),empresa:g('empresa'),projectId:g('projectId'),elemento:g('elemento'),manualId:g('manualId'),ncrId:g('ncrId'),destinatarioTipo:g('destinatarioTipo'),responsable:g('responsable'),fechaAsignacion:hoy(),estado:'Pendiente',nota:null,intentos:0,resultado:null};DB.trainings.push(t);save();closeModal();toast('Capacitación asignada a '+t.nombre+'.','ok');location.hash='#/academy/asignaciones';},
  'academy-confirm'(fd,form){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const key=decodeURIComponent(form.dataset.key);const g=recurrenceGroups().find(x=>x.key===key);if(!g)return toast('No se encontró el grupo de reincidencia.','err');const review={key,fecha:hoy(),actor:(fd.get('actor')||'').trim(),nota:(fd.get('nota')||'').trim(),manualId:fd.get('manualId')||'m02',recordIds:g.records.map(r=>r.uid)};const ix=DB.recurrenceReviews.findIndex(x=>x.key===key);if(ix>=0)DB.recurrenceReviews[ix]=review;else DB.recurrenceReviews.push(review);g.records.forEach(r=>{r.reincidenciaConfirmada=true;r.manualAcademyId=review.manualId;r.timeline=r.timeline||[];r.timeline.push({fecha:hoy(),estado:r.estado,nota:'Reincidencia confirmada; capacitación preventiva obligatoria activada.',actor:review.actor});});save();closeModal();toast('Reincidencia confirmada. Asigne capacitación a los ejecutores involucrados y futuros trabajadores de la partida.','ok');render();},
  'academy-verify'(fd,form){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const t=DB.trainings.find(x=>x.id===form.dataset.id);if(!t)return;const obs=(fd.get('observacion')||'').trim();if(!obs)return toast('La observación de terreno es obligatoria.','err');t.estado='Verificado en terreno';t.verificacion={por:(fd.get('verificadoPor')||'').trim(),fecha:fd.get('fechaVerificacion'),observacion:obs};save();closeModal();toast('Verificación en terreno registrada.','ok');location.hash='#/academy/asignaciones';},
  'academy-quiz'(fd,form){const t=DB.trainings.find(x=>x.id===form.dataset.id);if(!t)return;const correct=[(ACADEMY_FIRST_Q[t.manualId]||ACADEMY_FIRST_Q.m09).c,1,2,0,2];let score=0;for(let i=0;i<correct.length;i++){if(Number(fd.get('q'+i))===correct[i])score++;}t.intentos=(t.intentos||0)+1;t.nota=Math.round(score/correct.length*100);t.resultado={fecha:hoy(),correctas:score,total:correct.length};t.estado=t.nota>=80?'Aprobado teóricamente':'Requiere refuerzo';t.timeline=t.timeline||[];t.timeline.push({fecha:hoy(),nota:t.nota,estado:t.estado});save();toast('Resultado: '+t.nota+'%. '+(t.nota>=80?'Aprobación teórica registrada.':'Debe revisar el manual y volver a intentarlo.'),t.nota>=80?'ok':'err');location.hash='#/academy/asignaciones';},
  'prevent-hold'(fd){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const g=k=>(fd.get(k)||'').trim();DB.holdPoints.push({id:uid(),projectId:g('projectId'),elemento:g('elemento'),partida:g('partida'),responsable:g('responsable'),observacion:g('observacion'),fecha:hoy(),estado:'Pendiente',checks:{},historial:[{fecha:hoy(),estado:'Pendiente',actor:g('responsable')}]});save();closeModal();toast('Punto de detención creado. La partida queda pendiente de revisión en este registro.','ok');location.hash='#/prevent/hold';},
  'prevent-resolve-hold'(fd,form){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const h=DB.holdPoints.find(x=>x.id===form.dataset.id);if(!h)return;const checks={};HOLD_CHECKS.forEach(([k])=>checks[k]=fd.get(k)==='on');const result=fd.get('resultado');const all=Object.values(checks).every(Boolean);if(result==='Conforme'&&!all)return toast('No se puede autorizar: debe verificar todos los controles previos.','err');h.checks=checks;h.revision={autorizador:(fd.get('autorizador')||'').trim(),observacion:(fd.get('observacion')||'').trim(),fecha:hoy(),resultado:result};h.estado=result==='Conforme'?'Autorizado':'Bloqueado';h.historial=h.historial||[];h.historial.push({fecha:hoy(),estado:h.estado,actor:h.revision.autorizador,nota:h.revision.observacion});save();closeModal();toast(h.estado==='Autorizado'?'Punto revisado y autorización registrada.':'La partida continúa bloqueada hasta corregir las condiciones.',h.estado==='Autorizado'?'ok':'err');location.hash='#/prevent/hold';},
  'prevent-tool'(fd){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const g=k=>(fd.get(k)||'').trim();const result=g('resultado');const checks=['integridad','proteccion','cableado','accesorios','manual','competencia'].reduce((o,k)=>(o[k]=fd.get(k)==='on',o),{});if(result==='Apto'&&!Object.values(checks).every(Boolean))return toast('No se puede marcar Apto: completa todos los controles aplicables. Si un control no aplica, justifica y documenta según procedimiento.','err');const record={id:uid(),projectId:g('projectId'),inventoryItemId:g('inventoryItemId'),herramienta:g('herramienta'),marca:g('marca'),modelo:g('modelo'),identificador:g('identificador'),elemento:g('elemento'),ubicacionEstado:g('ubicacionEstado'),ticketCompra:g('ticketCompra'),proveedor:g('proveedor'),montoCompra:g('montoCompra')===''?null:Number(g('montoCompra')),fechaCompra:g('fechaCompra'),inspector:g('inspector'),resultado:result,estado:result==='Apto'?'Apto':result==='Fuera de servicio'?'Fuera de servicio':'Observado',checks,observacion:g('observacion'),fecha:hoy()};DB.toolChecks.push(record);const asset=DB.inventoryItems.find(x=>x.id===record.inventoryItemId);if(asset){asset.ultimaInspeccion=hoy();asset.condicion=g('observacion');if(result!=='Apto'){asset.estado=result==='Fuera de servicio'?'Fuera de servicio':'Bloqueado';asset.condicion='Bloqueado por inspección: '+g('observacion');}else if(!['Fuera de servicio','Retirado'].includes(asset.estado)){asset.estado=asset.ubicacion&&asset.ubicacion.toLowerCase().includes('almacén')?'Disponible':'Asignado';}asset.historialEstado=asset.historialEstado||[];asset.historialEstado.push({fecha:hoy(),estado:asset.estado,actor:g('inspector'),nota:'Inspección '+result+' · registro '+record.id});}save();closeModal();toast(result==='Apto'?'Inspección registrada; controles verificados.':result==='Fuera de servicio'?'ALERTA: equipo FUERA DE SERVICIO. Aíslelo e identifíquelo según procedimiento.':'Equipo observado y bloqueado en inventario; no asignar hasta verificar.',result==='Apto'?'ok':'err');location.hash='#/prevent/tools';},
  'prevent-inventory-new'(fd){if(!preventCanManage())return toast('Acceso restringido.','err');const g=k=>(fd.get(k)||'').trim();const code=g('codigo');if((DB.inventoryItems||[]).some(x=>x.codigo.toLowerCase()===code.toLowerCase()))return toast('El código de activo ya existe. Usa un identificador único.','err');DB.inventoryItems.push({id:uid(),projectId:g('projectId'),codigo,nombre:g('nombre'),categoria:g('categoria'),marca:g('marca'),modelo:g('modelo'),serie:g('serie'),estado:g('estado'),condicion:g('condicion')||'Pendiente de inspección inicial',ubicacion:g('ubicacion'),cuadrilla:g('cuadrilla')||'Sin asignar',responsable:g('responsable'),documentoCompra:g('documentoCompra'),proveedor:g('proveedor'),monto:g('monto')===''?null:Number(g('monto')),fechaCompra:g('fechaCompra'),ultimaInspeccion:g('ultimaInspeccion'),proximaInspeccion:g('proximaInspeccion'),mantencionProxima:g('mantencionProxima'),notas:g('notas'),historialEstado:[{fecha:hoy(),estado:g('estado'),actor:CURRENT_USER?.nombre||CURRENT_ROLE,nota:g('condicion')}]});save();closeModal();toast('Activo registrado. Completa inspección y documentación antes de asignarlo.','ok');location.hash='#/prevent/inventory';},
  'prevent-inventory-move'(fd,form){if(!preventCanManage())return toast('Acceso restringido.','err');const g=k=>(fd.get(k)||'').trim();const item=DB.inventoryItems.find(x=>x.id===g('itemId'));if(!item)return toast('Activo no encontrado.','err');if(['Bloqueado','Fuera de servicio','Retirado'].includes(item.estado)&&['Asignación','Traslado'].includes(g('tipo')))return toast('No se puede asignar ni trasladar un activo bloqueado, fuera de servicio o retirado.','err');const old=item.ubicacion||'Sin ubicación';const movement={id:uid(),itemId:item.id,codigo:item.codigo,fecha:g('fecha'),tipo:g('tipo'),origen:g('origen')||old,destino:g('destino'),responsable:g('responsable'),recibe:g('recibe'),motivo:g('motivo'),observacion:g('observacion')};DB.inventoryMovements.push(movement);item.ubicacion=g('destino');item.responsable=g('recibe')||g('responsable');if(g('tipo')==='Asignación'){item.estado='Asignado';item.cuadrilla=g('destino');}if(g('tipo')==='Devolución'){item.estado='Disponible';item.cuadrilla='Sin asignar';}if(g('tipo')==='Envío a mantenimiento'){item.estado='En mantenimiento';}if(g('tipo')==='Retiro de servicio'){item.estado='Fuera de servicio';item.condicion=g('motivo');}item.historialEstado=item.historialEstado||[];item.historialEstado.push({fecha:g('fecha'),estado:item.estado,actor:g('responsable'),nota:g('motivo')});save();closeModal();toast('Movimiento registrado con trazabilidad.','ok');location.hash='#/prevent/inventory';},
  'prevent-inventory-status'(fd,form){if(!preventCanManage())return toast('Acceso restringido.','err');const g=k=>(fd.get(k)||'').trim();const item=DB.inventoryItems.find(x=>x.id===form.dataset.id);if(!item)return;const old=item.estado,newStatus=g('estado');if(['Bloqueado','Fuera de servicio'].includes(old)&&newStatus==='Disponible'&&g('condicion').length<12)return toast('Para liberar un equipo, documenta verificación y autorización suficiente.','err');item.estado=newStatus;item.condicion=g('condicion');item.historialEstado=item.historialEstado||[];item.historialEstado.push({fecha:hoy(),estado:newStatus,actor:g('actor'),nota:item.condicion,estadoAnterior:old});save();closeModal();toast('Estado actualizado y registrado en historial.','ok');location.hash='#/prevent/inventory';},
  'integration-link'(fd){if(!preventCanManage())return toast('Acceso restringido.','err');const g=k=>(fd.get(k)||'').trim();const entityType=g('entityType'),entityId=g('entityId'),taskId=g('taskId');if(!entityType||!entityId||!taskId)return toast('Selecciona el registro y la tarea de Gantt.','err');if(!(DB.integrationLinks||[]).some(x=>x.entityType===entityType&&x.entityId===entityId&&x.taskId===taskId)){DB.integrationLinks.push({id:uid(),entityType,entityId,taskId,houseId:g('houseId'),projectId:DB.projects[0]?.id||'',relacion:g('relacion'),creadoPor:CURRENT_USER?.nombre||CURRENT_ROLE,creadoEn:new Date().toISOString()});save();}closeModal();toast('Vínculo trazable guardado. Verifica el estado de cada módulo por separado.','ok');location.hash='#/prevent/integracion';},
  'prevent-risk'(fd,form){if(!preventCanManage())return toast('Acceso restringido.','err');const g=k=>(fd.get(k)||'').trim();const id=form.dataset.id;const data={projectId:g('projectId'),actividad:g('actividad'),peligro:g('peligro'),consecuencia:g('consecuencia'),probabilidad:Number(g('probabilidad')),severidad:Number(g('severidad')),controles:g('controles'),jerarquia:g('jerarquia'),medida:g('medida'),responsable:g('responsable'),plazo:g('plazo'),residualProbabilidad:Number(g('residualProbabilidad')),residualSeveridad:Number(g('residualSeveridad')),estado:g('estado')};if(id){const item=DB.riskMatrix.find(x=>x.id===id);if(!item)return;Object.assign(item,data,{actualizadoEn:new Date().toISOString(),actualizadoPor:CURRENT_USER?.nombre||CURRENT_ROLE});}else DB.riskMatrix.push({id:uid(),...data,creadoEn:new Date().toISOString(),creadoPor:CURRENT_USER?.nombre||CURRENT_ROLE});save();closeModal();toast('Matriz de riesgo guardada. Verifica en terreno que las medidas se implementen.','ok');location.hash='#/prevent/risk';},
   async 'prevent-talk'(fd){if(!preventCanManage())return toast('No tiene permiso para registrar charlas.','err');const g=k=>(fd.get(k)||'').trim();const code=String(Math.floor(100000+Math.random()*900000));const talk={id:uid(),projectId:g('projectId'),tarea:g('tarea'),relator:g('relator'),participantes:g('participantes'),riesgos:g('riesgos'),controles:g('controles'),comprension:g('comprension'),observacion:g('observacion'),fecha:hoy(),fechaHoraCreacion:new Date().toISOString(),estado:'Registrada',codigoAsistencia:code,asistenciaAbierta:true,firmas:[],ubicacionCharla:null};const persist=()=>{DB.toolboxTalks.push(talk);save();closeModal();openModal('Charla registrada · código presencial',`<div class="notice">Entrega este código únicamente a quienes estén físicamente presentes. No lo publiques en grupos ni lo envíes a personas ausentes.</div><div style="text-align:center;padding:1.2rem"><div class="muted small">CÓDIGO DE ASISTENCIA</div><div style="font-size:2.5rem;font-weight:800;letter-spacing:.25em">${code}</div><div class="muted small">${esc(g('tarea'))}</div></div><p>Al terminar la charla, entra en Asistencia y pulsa “Cerrar firmas”. Revisa las firmas, horas y ubicación disponible.</p><div class="modal-foot"><button class="btn" data-act="close">Entendido</button></div>`);location.hash='#/prevent/talks';};if(fd.get('capturarUbicacionCharla')==='on'&&navigator.geolocation){navigator.geolocation.getCurrentPosition(pos=>{talk.ubicacionCharla={lat:Math.round(pos.coords.latitude*10000)/10000,lon:Math.round(pos.coords.longitude*10000)/10000,precisionM:Math.round(pos.coords.accuracy),capturadaEn:new Date().toISOString()};persist();},()=>persist(),{enableHighAccuracy:true,timeout:7000,maximumAge:0});}else persist();},
  async 'prevent-talk-sign'(fd,form){const t=DB.toolboxTalks.find(x=>x.id===form.dataset.id);if(!t||t.asistenciaAbierta===false)return toast('La asistencia de esta charla está cerrada.','err');if(!CURRENT_USER||!['Trabajador de obra','Trabajador común'].includes(CURRENT_USER.rol))return toast('Solo una cuenta de trabajador puede firmar.','err');if(String(fd.get('codigo')||'').trim()!==String(t.codigoAsistencia||''))return toast('Código incorrecto. Solicita el código presencial al relator.','err');if((t.firmas||[]).some(x=>x.userId===CURRENT_USER.id))return toast('Tu cuenta ya firmó esta charla.','err');const firma=(fd.get('firma')||'').trim();if(!firma||fd.get('declaracion')!=='on')return toast('Debes escribir tu nombre y confirmar la declaración de asistencia.','err');const sign={userId:CURRENT_USER.id,usuario:CURRENT_USER.usuario,nombre:CURRENT_USER.nombre,firma,fechaHora:new Date().toISOString(),fecha:hoy(),ubicacion:null,estado:'Pendiente de corroboración presencial'};const finish=()=>{t.firmas=t.firmas||[];t.firmas.push(sign);save();closeModal();toast('Firma registrada. La jefatura debe corroborar la presencia antes de validarla.','ok');location.hash='#/prevent/firmar';};if(fd.get('capturarUbicacion')==='on'&&navigator.geolocation){navigator.geolocation.getCurrentPosition(pos=>{sign.ubicacion={lat:Math.round(pos.coords.latitude*10000)/10000,lon:Math.round(pos.coords.longitude*10000)/10000,precisionM:Math.round(pos.coords.accuracy),capturadaEn:new Date().toISOString()};sign.estado='Firmada · ubicación capturada, pendiente de revisión';finish();},()=>finish(),{enableHighAccuracy:true,timeout:7000,maximumAge:0});}else finish();},
  'prevent-followup'(fd){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const g=k=>(fd.get(k)||'').trim();DB.enhancedControls.push({id:uid(),projectId:g('projectId'),elemento:g('elemento'),ncrId:g('ncrId'),cantidad:Number(g('cantidad')||3),responsable:g('responsable'),fechaObjetivo:g('fechaObjetivo'),criterio:g('criterio'),fechaCreacion:hoy(),resultados:[],estado:'Activo'});save();closeModal();toast('Plan de seguimiento reforzado creado.','ok');location.hash='#/prevent/followup';},
  'prevent-followup-result'(fd,form){if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');const x=DB.enhancedControls.find(z=>z.id===form.dataset.id);if(!x)return;const result={fecha:fd.get('fecha'),resultado:fd.get('resultado'),inspector:(fd.get('inspector')||'').trim(),observacion:(fd.get('observacion')||'').trim()};x.resultados=x.resultados||[];x.resultados.push(result);if(result.resultado==='No conforme'){x.estado='Requiere revisión';x.ultimaAlerta='Resultado no conforme: revisar causa y medidas preventivas.';}else if(x.resultados.length>=x.cantidad&&x.resultados.every(r=>r.resultado==='Conforme'))x.estado='Completado';else x.estado='Activo';save();closeModal();toast(result.resultado==='No conforme'?'Control no conforme: revisar causa y reforzar acciones.':x.estado==='Completado'?'Seguimiento completado con resultados conformes.':'Control conforme registrado; seguimiento continúa. ',result.resultado==='No conforme'?'err':'ok');location.hash='#/prevent/followup';},
  proj(fd, form) {
    const edit = form.dataset.edit; const id = fd.get('id').trim();
    if (!id || !fd.get('nombre').trim()) return toast('ID y nombre son obligatorios.', 'err');
    if (!edit && getProj(id)) return toast('Ya existe un proyecto con ese ID.', 'err');
    const data = { nombre: fd.get('nombre').trim(), mandante: fd.get('mandante'), contratista: fd.get('contratista'), empresaSupervision: fd.get('empresaSupervision') || 'Praxis Edificaciones', ubicacion: fd.get('ubicacion'), estado: fd.get('estado'), inicio: fd.get('inicio'), termino: fd.get('termino'), responsable: fd.get('responsable'), descripcion: fd.get('descripcion') };
    if (data.inicio && data.termino && data.termino < data.inicio) return toast('La fecha de término no puede ser anterior al inicio.', 'err');
    if (edit) Object.assign(getProj(edit), data);
    else DB.projects.push(Object.assign({ id, frentes: [], lat: null, lng: null }, data));
    save(); closeModal(); toast(edit ? 'Proyecto actualizado.' : 'Proyecto creado.', 'ok');
    if (!edit) location.hash = '#/proyecto/' + enc(id); else render();
  },
  rdi(fd){
    if(CURRENT_ROLE==='Consulta')return toast('El perfil Consulta es de solo lectura.','err');
    const g=k=>String(fd.get(k)||'').trim();
    if(!g('projectId')||!g('fecha')||!g('responsable')||!g('asunto')||!g('ubicacion')||!g('descripcion')||!g('consulta'))return toast('Complete los campos obligatorios de la RDI.','err');
    if(!DB.dis)DB.dis=[]; const code='RDI-'+String(DB.dis.reduce((m,x)=>Math.max(m,Number(String(x.code||'').match(/(\d+)$/)?.[1]||0)),0)+1).padStart(3,'0');
    const d={id:uid(),code,projectId:g('projectId'),fecha:g('fecha'),frenteId:g('frenteId'),responsable:g('responsable'),especialidad:g('especialidad'),asunto:g('asunto'),plano:g('plano'),eett:g('eett'),ubicacion:g('ubicacion'),descripcion:g('descripcion'),consulta:g('consulta'),impacto:g('impacto'),propuesta:g('propuesta'),prioridad:g('prioridad')||'Normal',fechaRespuestaCompromiso:g('fechaRespuestaCompromiso'),estado:g('estado')||'Emitida',dirigidaA:g('dirigidaA'),respuesta:g('respuesta'),fechaRespuesta:g('fechaRespuesta'),verificacion:g('verificacion'),creadoPor:CURRENT_USER?.nombre||CURRENT_ROLE,creadoEn:new Date().toISOString()};
    DB.dis.push(d);save();closeModal();toast(code+' creada correctamente.','ok');location.hash='#/dhncr/rdi';
  },
  rec(fd, form) {
    const edit = form.dataset.edit; const g = k => (fd.get(k) || '').trim();
    if (!g('projectId') || !g('titulo') || !g('descripcion') || !g('responsable') || !g('fecha')) return toast('Complete los campos obligatorios (*).', 'err');
    const savingTipo = fd.get('tipo') || (edit ? getRec(edit).tipo : 'NCR');
    if (savingTipo === 'NCR' && !g('medidaPreventiva')) return toast('La medida preventiva es obligatoria para guardar una NCR.', 'err');
    const data = { projectId: g('projectId'), frenteId: g('frenteId'), titulo: g('titulo'), fecha: g('fecha'), sector: g('sector'), partida: g('partida'), especialidad: g('especialidad'), criticidad: g('criticidad'), categoriaCausa: g('categoriaCausa'), nombreDetector:g('nombreDetector'), cargoDetector:g('cargoDetector'), plano:g('plano'), descripcion: g('descripcion'), evidenciaObjetiva:g('evidenciaObjetiva'), correccionTecnica:g('correccionTecnica'), manoObra:g('manoObra'), equiposCorreccion:g('equiposCorreccion'), materialesCorreccion:g('materialesCorreccion'), otrosRecursos:g('otrosRecursos'), autorizacionCorreccion:g('autorizacionCorreccion')||'Pendiente', causalRaiz1:g('causalRaiz1'), causalRaiz2:g('causalRaiz2'), requisito: g('requisito'), causaInmediata: g('causaInmediata'), causaSistemica: g('causaSistemica'), condicionesContribuyentes: g('condicionesContribuyentes'), accionCorrectiva: g('accionCorrectiva'), accionPreventiva: g('accionPreventiva'), medidaPreventiva: g('medidaPreventiva'), elementoConstructivo: g('elementoConstructivo') || g('partida') || g('sector'), familiaProblema: g('familiaProblema'), manualAcademyId: g('manualAcademyId'), solucionPropuesta: g('solucionPropuesta'), materialSolucion: g('materialSolucion'), procedimientoSolucion: g('procedimientoSolucion'), observacionSolucion: g('observacionSolucion'), responsable: g('responsable'), fechaCompromiso: g('fechaCompromiso'), diasAdicionales: Math.max(0, Number(g('diasAdicionales')||0)), motivoAmpliacion: g('motivoAmpliacion') || 'Sin ampliación', detalleAmpliacion: g('detalleAmpliacion'), ampliacionValidada: g('ampliacionValidada') || 'Pendiente de validación', costoNoCalidad: Number(g('costoNoCalidad')||0), horasNoCalidad: Number(g('horasNoCalidad')||0) };
    if (edit) {
      const rr = getRec(edit);
      if (rr.projectId !== data.projectId) { // mantener coherentes evidencias y lecciones del registro
        DB.evidences.forEach(ev => { if (ev.recId === rr.uid) ev.projectId = data.projectId; });
        DB.lessons.forEach(l => { if (l.recId === rr.uid) l.projectId = data.projectId; });
      }
      Object.assign(rr, data); save(); closeModal(); toast('Registro actualizado.', 'ok'); render(); return; }
    const tipo = fd.get('tipo');
    const r = Object.assign({ uid: uid(), code: nextCode(tipo), tipo, estado: 'Detectado', verificaciones: [], fechaCierre: '', timeline: [{ fecha: data.fecha, estado: 'Detectado', nota: 'Registro creado' }] }, data);
    DB.records.push(r); save(); closeModal(); toast(r.code + ' creado.', 'ok');
    location.hash = '#/registro/' + enc(r.uid);
  },
  estado(fd, form) {
    if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err');
    const r = getRec(form.dataset.id); const e = fd.get('estado');
    if (!e) return;
    if (e === 'Cerrado') return toast('Un registro solo se cierra mediante una verificación conforme.', 'err');
    if (e === 'Pendiente de verificación' && !String(r.accionCorrectiva || '').trim()) return toast('Defina la acción correctiva antes de pasar a verificación.', 'err');
    setEstado(r, e, (fd.get('nota') || '').trim()); const last=r.timeline[r.timeline.length-1]; last.actor=(fd.get('actor')||'').trim(); save(); toast('Estado actualizado a “' + e + '”.', 'ok'); render();
  },
  verif(fd, form) {
    const r = getRec(form.dataset.id); const res = fd.get('resultado');
    if (!roleCanClose()) return toast('El perfil de consulta no puede registrar verificaciones de cierre. Cambie a Supervisor / ITO o Encargado de Calidad.', 'err');
    if (!res || !fd.get('fecha') || !fd.get('responsable').trim()) return toast('Complete resultado, fecha y responsable.', 'err');
    const hasAfterEvidence = DB.evidences.some(e => e.recId === r.uid && e.momento === 'DESPUÉS');
    const checks = { solucionEjecutada: fd.get('solEjecutada') === 'on', materialConforme: fd.get('matConforme') === 'on', resultadoConforme: fd.get('resultadoConforme') === 'on', evidenciaCargada: fd.get('evidenciaCargada') === 'on' && hasAfterEvidence };
    const v = { resultado: res, fecha: fd.get('fecha'), responsable: fd.get('responsable').trim(), firma: (fd.get('firma')||'').trim(), obs: fd.get('obs'), checks };
    if (res === 'Conforme' && Object.values(checks).some(x => !x)) return toast(hasAfterEvidence ? 'Para cerrar como Conforme debe completar los 4 puntos de verificación.' : 'Para cerrar como Conforme primero cargue una evidencia en la etapa DESPUÉS y complete los 4 puntos de verificación.', 'err');
    if (res === 'Conforme' && !(fd.get('firma')||'').trim()) return toast('Ingrese el nombre en Firma / aprobación para dejar constancia del cierre.', 'err');
    r.verificaciones.push(v);
    r.timeline.push({ fecha: v.fecha, hora: new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}), estado: 'Verificación', actor: v.responsable, nota: 'Resultado: ' + res + (v.obs ? ' · ' + v.obs : '') });
    if (res === 'Conforme') { r.estado = 'Cerrado'; r.fechaCierre = v.fecha; r.timeline.push({ fecha: v.fecha, estado: 'Cerrado', nota: '' }); toast(r.code + ' cerrado. Puede registrar una lección aprendida.', 'ok'); }
    else { setEstado(r, 'En corrección', 'Verificación no conforme: requiere nueva corrección'); toast('Verificación no conforme: vuelve a corrección.', 'err'); }
    save(); render();
  },
  async ev(fd, form) {
    const files = fd.getAll('archivo').filter(f => f && f.size);
    const descripcion = (fd.get('descripcion') || '').trim();
    if (!descripcion) return toast('Ingrese una descripción.', 'err');
    if (!files.length) return toast('Seleccione al menos una fotografía o archivo.', 'err');
    const r = getRec(form.dataset.id);
    const created=[];
    for (const f of files) {
      let img=null;
      if (f.type.startsWith('image/')) { try { img=await fileToDataURL(f); } catch(e) { continue; } }
      created.push({ id:uid(), recId:r.uid, projectId:r.projectId, momento:fd.get('momento'), tipo:f.type.startsWith('image/')?'Fotografía':(fd.get('tipo')||'Otro'), descripcion, fecha:fd.get('fecha')||hoy(), img, archivo:f.name });
    }
    if (!created.length) return toast('No se pudo leer ningún archivo seleccionado.', 'err');
    DB.evidences.push(...created);
    if (!save()) { DB.evidences.splice(-created.length,created.length); return; }
    closeModal(); toast(created.length===1?'Evidencia agregada.':created.length+' evidencias agregadas.', 'ok'); render();
  },
  async insp(fd, form) {
    const g = k => (fd.get(k) || '').trim();
    if (!g('projectId') || !g('sector') || !g('responsable') || !g('fecha')) return toast('Complete los campos obligatorios (*).', 'err');
    const old= form.dataset.edit ? (DB.inspections.find(x=>x.id===form.dataset.edit)||{}) : {};
    const {items,resp}=await readChecklistItems(form,old.items||{}); const metodo=fd.get('metodo')||''; const riesgo = calcRiesgo(resp, metodo);
    const data = { projectId: g('projectId'), frenteId: g('frenteId'), fecha: g('fecha'), sector: g('sector'), responsable: g('responsable'), metodo, respuestas: resp, items, riesgo, observaciones: g('observaciones'), estado: 'Realizada', atendida: false, resultado: riesgo.nivel === 'BAJO' ? 'Conforme' : riesgo.nivel === 'MEDIO' ? 'Con observaciones' : 'No conforme' };
    const edit = form.dataset.edit;
    if (edit) Object.assign(DB.inspections.find(i => i.id === edit), data);
    else DB.inspections.push(Object.assign({ id: uid(), tipo: TIPO_INSP }, data));
    save(); closeModal();
    if (riesgo.nivel === 'ALTO') toast('Riesgo ALTO de nido de piedra. Revise acceso del vibrador y método de compactación antes de hormigonar.', 'err');
    else toast('Inspección registrada. Riesgo ' + riesgo.nivel + '.', 'ok');
    render();
  },
  sched(fd) {
    const g = k => (fd.get(k) || '').trim();
    if (!g('projectId') || !g('sector') || !g('responsable')) return toast('Complete los campos obligatorios (*).', 'err');
    DB.inspections.push({ id: uid(), projectId: g('projectId'), frenteId: g('frenteId'), fecha: g('fecha'), tipo: g('tipo') || TIPO_INSP, sector: g('sector'), responsable: g('responsable'), estado: 'Pendiente', metodo: '', respuestas: {}, riesgo: null, observaciones: '', resultado: '', atendida: false });
    save(); closeModal(); toast('Inspección programada.', 'ok'); render();
  },
  lesson(fd, form) {
    const r = getRec(form.dataset.id);
    if (!fd.get('problema').trim()) return toast('Ingrese el problema.', 'err');
    DB.lessons.push({ id: uid(), recId: r.uid, projectId: r.projectId, fecha: hoy(), problema: fd.get('problema').trim(), causa: fd.get('causa'), solucion: fd.get('solucion'), medida: fd.get('medida'), recomendacion: fd.get('recomendacion') });
    save(); closeModal(); toast('Lección aprendida registrada.', 'ok'); render();
  },
  frente(fd, form) {
    const p = getProj(form.dataset.id); const n = fd.get('nombre').trim(); if (!n) return;
    const lat = fd.get('lat'), lng = fd.get('lng');
    p.frentes = p.frentes || [];
    p.frentes.push({ id: 'F-' + uid(), nombre: n, lat: lat !== '' ? +lat : null, lng: lng !== '' ? +lng : null, qr: null });
    save(); closeModal(); toast('Frente agregado.', 'ok'); render();
  }
};

/* Acciones por clic (data-act) */
function createNcrFromChecklist(i, itemKey) {
  const item=getItemData(i,itemKey);
  const r=Object.assign({uid:uid(), code:nextCode('NCR'), tipo:'NCR', estado:'Detectado', verificaciones:[], fechaCierre:'', timeline:[{fecha:hoy(),estado:'Detectado',nota:'Creado desde checklist: '+TEXTO_ITEM[itemKey]}]}, {projectId:i.projectId, frenteId:i.frenteId||'', sourceInspectionId:i.id, sourceItem:itemKey, titulo:'Incumplimiento: '+TEXTO_ITEM[itemKey], fecha:i.fecha, sector:i.sector, partida:'', especialidad:'Hormigón', criticidad:'Mayor', categoriaCausa:'Control / supervisión', descripcion:item.observacion||('Ítem de checklist no conforme: '+TEXTO_ITEM[itemKey]), requisito:'Checklist de control preventivo de hormigonado', causaInmediata:'', causaSistemica:'', condicionesContribuyentes:'', accionCorrectiva:'', accionPreventiva:'', solucionPropuesta:'', materialSolucion:'', procedimientoSolucion:'', observacionSolucion:'', responsable:i.responsable, fechaCompromiso:addDays(3)});
  DB.records.push(r);
  (item.fotografias||[]).forEach(f=>DB.evidences.push({id:uid(),recId:r.uid,projectId:r.projectId,momento:'ANTES',tipo:'Fotografía',descripcion:'Evidencia proveniente del checklist: '+TEXTO_ITEM[itemKey],fecha:i.fecha,img:f.data||f.img||'',archivo:f.nombre||''}));
  return r;
}

const ACADEMY_MANUALS = [
  {id:'m01',titulo:'Recepción del hormigón',area:'Hormigón',contenido:'Verificar guía, tipo/resistencia especificada, hora de carga y llegada, consistencia según procedimiento, condiciones de descarga y rechazo/escalamiento de cualquier discrepancia. No agregar agua sin autorización.',keywords:'Hormigón; recepción; mixer',fuente:'ACHS: prevención en construcción; EETT y especificación del proyecto.'},
  {id:'m02',titulo:'Vaciado, colocación y vibrado del hormigón',area:'Hormigón',contenido:'Planificar secuencia, confirmar acceso y operación del vibrador, colocar evitando segregación, vibrar de forma sistemática sin usar el equipo para desplazar hormigón y observar continuidad. Detener y consultar ante interferencias.',keywords:'Hormigón; vibrado; nido de piedra; segregación',fuente:'EETT, plan de hormigonado y orientación del fabricante del equipo.'},
  {id:'m03',titulo:'Inspección de enfierradura',area:'Estructura',contenido:'Contrastar diámetros, separación, ubicación, recubrimiento, anclajes, fijación e interferencias con planos aprobados. No cortar ni modificar armaduras sin autorización del profesional responsable.',keywords:'Enfierradura; acero; armadura',fuente:'Planos estructurales, EETT y normas aplicables al proyecto.'},
  {id:'m04',titulo:'Moldajes y preparación previa',area:'Hormigón',contenido:'Revisar estabilidad, apuntalamiento, estanqueidad, cotas, limpieza, desmoldante y accesos. Corregir observaciones antes de autorizar el vaciado.',keywords:'Moldaje; preparación; hormigonado',fuente:'Procedimiento de obra, planos y EETT.'},
  {id:'m05',titulo:'Excavaciones y seguridad',area:'Prevención',contenido:'Identificar servicios enterrados, delimitar el área, revisar estabilidad del terreno, accesos y agua acumulada. No ingresar a excavaciones inseguras ni trabajar bajo cargas suspendidas; solicitar evaluación competente ante cambios.',keywords:'Excavación; zanja; terreno',fuente:'ACHS y procedimiento de trabajo seguro aprobado para la obra.'},
  {id:'m06',titulo:'Reparación de hormigón y nidos de piedra',area:'Hormigón',contenido:'Delimitar y evaluar el defecto; retirar material suelto con método autorizado; no ocultar daños; validar producto, preparación del sustrato, espesores, curado y aceptación con supervisión/proyectista cuando corresponda.',keywords:'Reparación; nido; mortero; SikaRep',fuente:'Ficha técnica vigente del producto, EETT y procedimiento aprobado.'},
  {id:'m07',titulo:'Curado y protección del hormigón',area:'Hormigón',contenido:'Aplicar el método de curado especificado, proteger frente a pérdida rápida de humedad, lluvia, impactos y cargas prematuras; registrar inicio y controles.',keywords:'Curado; protección; fisuras',fuente:'EETT, especificación de hormigón y procedimiento aprobado.'},
  {id:'m08',titulo:'Inspecciones, NCR y medidas preventivas',area:'Calidad',contenido:'Describir hechos observables, ubicar elemento, registrar evidencia, identificar requisito verificable, separar corrección de causa y prevención, asignar responsable y comprobar eficacia.',keywords:'NCR; inspección; reincidencia',fuente:'Procedimiento de calidad de la obra.'},
  {id:'m09',titulo:'Prevención de riesgos en obra',area:'Seguridad',contenido:'Reconocer peligros, aplicar controles antes del EPP cuando corresponda, usar protección definida, mantener orden, señalizar, reportar incidentes y detener tareas ante riesgo grave e inminente según procedimiento.',keywords:'Prevención; EPP; seguridad',fuente:'ACHS, normativa vigente y matriz de riesgos de la obra.'},
  {id:'m10',titulo:'Uso seguro de herramientas manuales y eléctricas',area:'Seguridad',contenido:'Inspeccionar herramienta, guardas, cable y accesorios; usar herramienta adecuada y EPP; aislar energía antes de ajustar; no retirar protecciones ni operar equipo defectuoso. Solo personal autorizado para equipos que lo requieran.',keywords:'Herramientas; esmeril; taladro; sierra',fuente:'ACHS, manual del fabricante y procedimiento de la obra.'},
  {id:'m11',titulo:'Uso seguro de equipos para hormigonado',area:'Seguridad',contenido:'Revisar vibrador, cables, conexiones y condiciones de uso; mantener cables fuera de agua y tránsito cuando sea posible; desconectar antes de intervenir; coordinar operador y señalización.',keywords:'Vibrador; hormigonado; equipo',fuente:'Fabricante, procedimiento de hormigonado y prevención de riesgos.'},
  {id:'m12',titulo:'Trabajos críticos: altura, cargas y riesgo eléctrico',area:'Seguridad',contenido:'Aplicar permiso/procedimiento requerido, controlar bordes y caída de objetos, inspeccionar sistemas anticaídas cuando proceda, delimitar izajes y evitar aproximación a instalaciones energizadas. No improvisar accesos ni protecciones.',keywords:'Altura; izaje; electricidad; maquinaria',fuente:'ACHS, normativa vigente, procedimientos y evaluación del prevencionista.'},
  {"id":"m13","titulo":"Montaje de paneles SIP","area":"Envolvente","contenido":"Preparar la plataforma, comprobar replanteo y detalles del fabricante, verificar paneles, sellos y fijaciones, y coordinar montaje seguro. La secuencia exacta depende del sistema aprobado.","keywords":"SIP; panel; envolvente; montaje","fuente":"Planos aprobados, manual del fabricante SIP y EETT."},
  {"id":"m14","titulo":"Trazado y montaje de tabiquería","area":"Estructura","contenido":"Verificar ejes y cotas, revisar soleras y montantes, controlar aplome y vanos, y confirmar anclajes y refuerzos según planos antes de cerrar.","keywords":"Tabiquería; trazado; montantes","fuente":"Planos de arquitectura/estructura, EETT y manual del sistema."},
  {"id":"m15","titulo":"Instalaciones eléctricas domiciliarias seguras","area":"Instalaciones","contenido":"Trabajar solo con personal autorizado y proyecto vigente. Aislar energía, comprobar ausencia de tensión y respetar canalizaciones, protecciones y pruebas exigidas.","keywords":"Electricidad; canalización; tablero","fuente":"Proyecto eléctrico aprobado, normativa SEC vigente y procedimiento autorizado."},
  {"id":"m16","titulo":"Instalaciones sanitarias: agua potable","area":"Instalaciones","contenido":"Revisar trazado, material y diámetros del proyecto, soportes, uniones, protección de tuberías y pruebas antes de ocultar.","keywords":"Agua potable; tuberías; pruebas","fuente":"Proyecto sanitario, EETT y manual del fabricante."},
  {"id":"m17","titulo":"Instalaciones de alcantarillado","area":"Instalaciones","contenido":"Controlar pendientes, diámetros, ventilación, registros, soportación y estanqueidad según proyecto. Proteger las tuberías durante el resto de la obra.","keywords":"Alcantarillado; pendiente; ventilación","fuente":"Proyecto sanitario aprobado, EETT y normativa aplicable."},
  {"id":"m18","titulo":"Aislación térmica y puentes térmicos","area":"Envolvente","contenido":"Comprobar continuidad, espesor, ajuste y compatibilidad de aislantes. Evitar vacíos, compresión no prevista y exposición a humedad antes de revestir.","keywords":"Aislación; envolvente; humedad","fuente":"Detalles térmicos del proyecto, EETT y ficha del producto."},
  {"id":"m19","titulo":"Barreras de humedad, vapor y sellos","area":"Envolvente","contenido":"Identificar función y posición de cada membrana, respetar traslapos y sellos del fabricante y revisar encuentros en vanos, cubierta y penetraciones.","keywords":"Barrera; vapor; humedad; sellado","fuente":"Detalles constructivos aprobados y ficha técnica del sistema."},
  {"id":"m20","titulo":"Instalación de puertas y ventanas","area":"Terminaciones","contenido":"Verificar medidas de vano, plomo, nivel, fijaciones, sellado perimetral y funcionamiento. Respetar holguras y anclajes del fabricante.","keywords":"Puertas; ventanas; vanos","fuente":"Planos, EETT y manual del fabricante."},
  {"id":"m21","titulo":"Revestimientos interiores y placas","area":"Terminaciones","contenido":"Revisar soporte, modulación, separación de fijaciones y tratamiento de juntas. No cubrir instalaciones que aún no hayan sido inspeccionadas.","keywords":"Placas; yeso-cartón; revestimiento","fuente":"Ficha del fabricante, planos y EETT."},
  {"id":"m22","titulo":"Pavimentos, cerámicos y nivelación","area":"Terminaciones","contenido":"Comprobar planeidad, humedad y preparación del sustrato, seleccionar adhesivo compatible, respetar juntas y curado y revisar antes de habilitar.","keywords":"Pavimento; cerámica; nivelación","fuente":"Ficha del adhesivo, fabricante del revestimiento y EETT."},
  {"id":"m23","titulo":"Pinturas y preparación de superficies","area":"Terminaciones","contenido":"Verificar sustrato seco, limpio y firme, reparar defectos, aplicar imprimante si corresponde y respetar dilución, ventilación y tiempos entre manos.","keywords":"Pintura; preparación; terminaciones","fuente":"Ficha técnica y especificación del proyecto."},
  {"id":"m24","titulo":"Techumbre, cubierta y evacuación de aguas","area":"Envolvente","contenido":"Comprobar geometría, fijaciones, traslapos, remates y encuentros. Aplicar controles de altura y proteger el frente ante lluvia o viento.","keywords":"Techumbre; cubierta; canaletas","fuente":"Planos de techumbre, fabricante y procedimiento de trabajo en altura."},
  {"id":"m25","titulo":"Control de calidad del hormigón y probetas","area":"Calidad","contenido":"Verificar plan de inspección, identificar suministro y elemento, tomar y manipular muestras según procedimiento y relacionar resultados con la ubicación ejecutada.","keywords":"Hormigón; probetas; trazabilidad","fuente":"Plan de calidad, especificaciones y normativa aplicable."},
  {"id":"m26","titulo":"Lectura de planos y control de versiones","area":"Gestión técnica","contenido":"Confirmar código, revisión y aprobación del plano antes de ejecutar. Resolver discrepancias mediante RDI y retirar copias obsoletas.","keywords":"Planos; revisiones; RDI","fuente":"Procedimiento documental, planos y EETT vigentes."},
  {"id":"m27","titulo":"Gestión de DH, NCR y RDI","area":"Calidad","contenido":"Distinguir hallazgo, incumplimiento y solicitud de información. Registrar ubicación, requisito, evidencia, responsable, plazo, decisión y verificación de cierre.","keywords":"DH; NCR; RDI; calidad","fuente":"Procedimiento de calidad y contratos de la obra."},
  {"id":"m28","titulo":"Recepción de materiales e inventario","area":"Logística","contenido":"Comprobar cantidad, identificación, estado, lote y documentos; registrar ubicación y responsable. Separar material no conforme y trazar movimientos de herramientas.","keywords":"Bodega; inventario; recepción","fuente":"Procedimiento de bodega, órdenes de compra y fichas técnicas."},
  {"id":"m29","titulo":"Orden, aseo, residuos y almacenamiento","area":"Prevención","contenido":"Mantener rutas despejadas, separar residuos, apilar materiales de forma estable, proteger productos sensibles y retirar elementos peligrosos.","keywords":"Orden; aseo; residuos; almacenamiento","fuente":"Plan de manejo de residuos y procedimiento preventivo."},
  {"id":"m30","titulo":"Planificación diaria, cuadrillas y detenciones","area":"Gestión de obra","contenido":"Definir frente, tarea, responsable, recursos y prerrequisitos; registrar avances reales, restricciones y detenciones con evidencia. Reprogramar solo tras validar impactos.","keywords":"Carta Gantt; cuadrillas; detenciones","fuente":"Programa de obra, procedimientos de control y registro de restricciones."}
];
const academyManualOptions = selected => '<option value="">Sin asignar</option>' + ACADEMY_MANUALS.map(m=>`<option value="${m.id}" ${selected===m.id?'selected':''}>${esc(m.id.toUpperCase())} · ${esc(m.titulo)}</option>`).join('');
function normElement(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/vivienda\s*\d+/g,'').replace(/eje\s*[a-z0-9-]+/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function inferProblemFamily(r){if(String(r.familiaProblema||'').trim())return r.familiaProblema;const txt=normElement([r.titulo,r.descripcion,r.causaInmediata].join(' '));if(/nido|piedra|segregacion|vacíos|vacios/.test(txt))return 'Nido de piedra / segregación';if(/fisura|grieta|agrietamiento/.test(txt))return 'Fisuras / grietas';if(/recubrimiento|armadura expuesta|acero expuesto/.test(txt))return 'Recubrimiento / acero expuesto';if(/dimensiones|cota|medida fuera/.test(txt))return 'Dimensiones / cotas';if(/filtracion|filtración|humedad/.test(txt))return 'Filtración / humedad';return r.titulo||'Problema por clasificar';}
function recurrenceGroups(){const rows=DB.records.filter(r=>r.tipo==='NCR');const map={};rows.forEach(r=>{const element=normElement(r.elementoConstructivo||r.partida||r.sector);const family=inferProblemFamily(r);const fam=normElement(family);if(!element||!fam)return;const key=[r.projectId,r.especialidad,element,fam].join('|');(map[key]||(map[key]={key,projectId:r.projectId,especialidad:r.especialidad,elemento:r.elementoConstructivo||r.partida||r.sector,familia:family,records:[]})).records.push(r);});return Object.values(map).filter(g=>g.records.length>=2).map(g=>({...g,confirmed:DB.recurrenceReviews.some(x=>x.key===g.key),review:DB.recurrenceReviews.find(x=>x.key===g.key)}));}
/* ===== MEJORA 09.1 · PRAXIS PREVENT ===== */
const HOLD_CHECKS = [
  ['docs','Planos, EETT y procedimiento vigentes disponibles'],
  ['rebar','Enfierradura y recubrimientos revisados según proyecto'],
  ['formwork','Moldaje, cotas, estabilidad y cierres revisados'],
  ['clean','Elemento y moldaje limpios; sin residuos incompatibles'],
  ['equipment','Equipos requeridos disponibles y operativos'],
  ['access','Accesos para colocación y vibrado confirmados'],
  ['safety','Área, accesos, personal y controles de seguridad verificados']
];
function preventCanManage(){return ['Administrador','Supervisor','Jefe de obra','Jefe de terreno','Jefe de oficina técnica','Encargado de Calidad','Gerente de obra','Gerente de proyecto'].includes(CURRENT_USER?.rol);}
function geoDistanceM(a,b){if(!a||!b)return null;const rad=x=>x*Math.PI/180,R=6371000,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),v=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(v)));}
function preventStats(){return {hold:DB.holdPoints.filter(x=>x.estado!=='Autorizado').length,unsafe:DB.toolChecks.filter(x=>x.estado==='Fuera de servicio').length+(DB.inventoryItems||[]).filter(x=>['Bloqueado','Fuera de servicio'].includes(x.estado)).length,talks:DB.toolboxTalks.length,active:DB.enhancedControls.filter(x=>x.estado!=='Completado').length};}
function preventTabs(active){return `<div class="tabs prevent-tabs"><a class="tab ${active==='panel'?'active':''}" href="#/prevent">🛡️ Panel</a><a class="tab ${active==='risk'?'active':''}" href="#/prevent/risk">⚠️ Matriz de riesgos</a><a class="tab ${active==='hold'?'active':''}" href="#/prevent/hold">⛔ Puntos de detención</a><a class="tab ${active==='tools'?'active':''}" href="#/prevent/tools">🧰 Inspecciones</a><a class="tab ${active==='inventory'?'active':''}" href="#/prevent/inventory">📦 Inventario</a><a class="tab ${active==='integration'?'active':''}" href="#/prevent/integracion">🔗 Integración</a><a class="tab ${active==='talks'?'active':''}" href="#/prevent/talks">🗣️ Charlas</a><a class="tab ${active==='followup'?'active':''}" href="#/prevent/followup">🔎 Seguimiento</a></div>`;}
function vPrevent(sub){const st=preventStats();
 if(sub==='firmar') return vPreventSignAttendance();
 if(!preventCanManage()) return notFound('Acceso restringido: Prevención está disponible para Administración, Supervisión, Jefatura y Gerencia de obra. Los trabajadores solo pueden firmar asistencia a charlas abiertas.');
 if(sub==='inventory') return vPreventInventory();
 if(sub==='integracion') return vPreventIntegration();
 if(sub==='risk') return vPreventRiskMatrix();
 if(sub==='hold') return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT</div><h2>Puntos de detención obligatorios</h2><p class="muted">Controles previos a partidas que no deben avanzar sin revisión y autorización responsable.</p></div><button class="btn" data-act="prevent-new-hold">+ Crear punto de detención</button></div>${preventTabs('hold')}<div class="notice">La aplicación registra el control y su autorización. No reemplaza la autoridad técnica, permisos ni procedimientos de la obra.</div>${preventTable(DB.holdPoints,'hold')}`;
 if(sub==='tools') return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT</div><h2>Inspección preuso de equipos y herramientas</h2><p class="muted">Registra resultado de inspección. La disponibilidad física, asignación y trazabilidad de activos se gestionan en Inventario.</p></div><button class="btn" data-act="prevent-new-tool">+ Inspeccionar equipo</button></div>${preventTabs('tools')}${preventTable(DB.toolChecks,'tools')}`;
 if(sub==='talks') return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT</div><h2>Charlas preventivas y control de asistencia</h2><p class="muted">Cada charla tiene un código presencial, firma individual, hora de firma y evidencia de ubicación cuando el dispositivo lo permite.</p></div><button class="btn" data-act="prevent-new-talk">+ Registrar charla</button></div>${preventTabs('talks')}<div class="notice"><b>Cómo corroborar:</b> el relator entrega el código solo a quienes están presentes; cada trabajador firma con su propia cuenta. Revisa la hora, ubicación capturada y confirma visualmente la identidad/lista. La firma digital local por sí sola no garantiza presencia física.</div>${preventTable(DB.toolboxTalks,'talks')}`;
 if(sub==='followup') return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT</div><h2>Seguimiento reforzado por reincidencia</h2><p class="muted">Planifica inspecciones adicionales en partidas posteriores y registra su resultado.</p></div><button class="btn" data-act="prevent-new-followup">+ Crear plan de seguimiento</button></div>${preventTabs('followup')}${preventTable(DB.enhancedControls,'followup')}`;
 return `<div class="page-head"><div><div class="section-kicker">MEJORA 09.1 · PRAXIS EDIFICACIONES</div><h2>PRAXIS PREVENT</h2><p class="muted">Controles antes, durante y después de la ejecución para reducir errores y riesgos.</p></div></div>${preventTabs('panel')}<div class="grid stats">${stat('Puntos pendientes',st.hold,st.hold?'red':'grn')}${stat('Equipos fuera de servicio',st.unsafe,st.unsafe?'red':'grn')}${stat('Charlas registradas',st.talks,'grn')}${stat('Planes reforzados activos',st.active,st.active?'yel':'grn')}</div><div class="grid two" style="margin-top:1rem"><div class="card"><h3>⚠️ Matriz de riesgos</h3><p class="muted small">Identifica peligros por actividad, estima el riesgo inicial, define controles por jerarquía y asigna responsables y plazos.</p><a class="btn btn-sec" href="#/prevent/risk">Abrir matriz de riesgos</a></div><div class="card"><h3>📦 Inventario preventivo</h3><p class="muted small">Control de activos, ubicación, cuadrilla, revisión, mantenimiento y movimientos de entrega/devolución.</p><a class="btn btn-sec" href="#/prevent/inventory">Abrir inventario</a></div><div class="card"><h3>🔗 Trazabilidad entre módulos</h3><p class="muted small">Vincula riesgos, inspecciones, activos, DH/NCR y cursos con tareas reales de la Carta Gantt.</p><a class="btn btn-sec" href="#/prevent/integracion">Abrir centro de integración</a></div><div class="card"><h3>⛔ Puntos de detención</h3><p class="muted small">No avanzar a la siguiente etapa sin revisión y autorización aplicable.</p><button class="btn btn-sec" data-act="prevent-new-hold">Crear punto de detención</button>${preventTable(DB.holdPoints.slice(-4).reverse(),'hold',true)}</div><div class="card"><h3>🧰 Equipos y herramientas</h3><p class="muted small">Inspección previa y registro de equipos no aptos.</p><button class="btn btn-sec" data-act="prevent-new-tool">Inspeccionar equipo</button>${preventTable(DB.toolChecks.slice(-4).reverse(),'tools',true)}</div><div class="card"><h3>🗣️ Charlas preventivas</h3><p class="muted small">Riesgos de la tarea y controles comunicados al equipo.</p><button class="btn btn-sec" data-act="prevent-new-talk">Registrar charla</button>${preventTable(DB.toolboxTalks.slice(-3).reverse(),'talks',true)}</div><div class="card"><h3>🔎 Seguimiento reforzado</h3><p class="muted small">Verifica las próximas ejecuciones tras una reincidencia.</p><button class="btn btn-sec" data-act="prevent-new-followup">Crear plan</button>${preventTable(DB.enhancedControls.slice(-4).reverse(),'followup',true)}</div></div><div class="notice">Regla preventiva: ante peligro grave, condición insegura o discrepancia técnica relevante, detener o asegurar el área según el procedimiento de la obra y avisar al responsable. La interfaz no sustituye la evaluación profesional ni los requisitos legales.</div>`;
}
function riskScore(r){return Math.max(1,Number(r.probabilidad)||1)*Math.max(1,Number(r.severidad)||1);}
function riskLevel(score){return score>=15?'Crítico':score>=10?'Alto':score>=5?'Moderado':'Bajo';}
function vPreventRiskMatrix(){const rows=DB.riskMatrix||[];return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT · PLANIFICACIÓN</div><h2>Matriz de identificación de peligros y evaluación de riesgos</h2><p class="muted">Registro operativo por actividad. Escala ilustrativa 1–5 para priorización; la evaluación final debe ajustarse a la metodología validada de la organización y a los requisitos aplicables.</p></div><button class="btn" data-act="prevent-new-risk">+ Identificar riesgo</button></div>${preventTabs('risk')}<div class="notice"><b>Jerarquía de control:</b> eliminar el peligro; sustituir o reducir en la fuente mediante ingeniería; aplicar controles organizacionales/procedimientos; y utilizar EPP para el riesgo residual. El EPP no debe ser la única medida cuando se pueden aplicar controles superiores. La matriz de ejemplo no reemplaza la MIPER oficial ni la evaluación del profesional competente.</div><div class="table-wrap"><table><thead><tr><th>Actividad / peligro</th><th>Riesgo inicial</th><th>Controles / medida</th><th>Responsable y plazo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(r=>{const score=riskScore(r),level=riskLevel(score);return `<tr><td><b>${esc(r.actividad)}</b><div class="small muted">${esc(r.peligro)}</div><div class="small">Consecuencia: ${esc(r.consecuencia)}</div></td><td><span class="badge ${level==='Crítico'?'b-red':level==='Alto'?'b-red':level==='Moderado'?'b-yel':'b-grn'}">${level} · ${score}/25</span><div class="small muted">P ${r.probabilidad} × S ${r.severidad}</div><div class="small">Residual objetivo: ${Number(r.residualProbabilidad||r.probabilidad)*Number(r.residualSeveridad||r.severidad)}/25</div></td><td><div class="small"><b>Existentes:</b> ${esc(r.controles||'Pendiente')}</div><div class="small"><b>Jerarquía:</b> ${esc(r.jerarquia||'Por definir')}</div><div class="small"><b>Acción:</b> ${esc(r.medida||'Pendiente')}</div></td><td>${esc(r.responsable||'Sin asignar')}<div class="small muted">${esc(r.plazo||'Sin fecha')}</div></td><td><span class="badge ${r.estado==='Cerrado'?'b-grn':r.estado==='Acción pendiente'?'b-red':'b-yel'}">${esc(r.estado||'Pendiente')}</span></td><td><button class="btn btn-sec btn-sm" data-act="prevent-risk-edit" data-id="${esc(r.id)}">Actualizar</button></td></tr>`}).join('')||'<tr><td colspan="6">No hay riesgos registrados.</td></tr>'}</tbody></table></div><div class="notice">Complemento con ACADEMY: asigna el curso correspondiente a la cuadrilla y verifica comprensión; para trabajos críticos, agrega instrucción práctica y autorización aplicable. <a href="#/academy">Abrir PRAXIS ACADEMY</a>.</div><p class="muted small">Los niveles mostrados son una ayuda interna para priorizar, no una clasificación legal universal. Validar criterios y tolerabilidad con la metodología de la empresa.</p>`;}
function integrationEntityLabel(type,id){
 const maps={record:DB.records||[],risk:DB.riskMatrix||[],inspection:DB.inspections||[],asset:DB.inventoryItems||[],training:DB.trainings||[],hold:DB.holdPoints||[],rdi:DB.dis||[]};
 const x=(maps[type]||[]).find(v=>String(v.uid||v.id)===String(id)); if(!x)return 'Registro no encontrado';
 if(type==='record')return `${x.code||x.tipo} · ${x.titulo||x.descripcion||''}`;
 if(type==='risk')return `Riesgo · ${x.actividad}`;
 if(type==='inspection')return `Inspección · ${x.sector||x.tipo||x.id}`;
 if(type==='asset')return `Activo ${x.codigo} · ${x.nombre}`;
 if(type==='training')return `ACADEMY · ${x.nombre} · ${ACADEMY_MANUALS.find(m=>m.id===x.manualId)?.titulo||x.manualId}`;
 if(type==='hold')return `Punto de detención · ${x.elemento||x.partida}`;
 if(type==='rdi')return `RDI · ${x.code||x.titulo||x.asunto||x.id}`;
 return x.titulo||x.nombre||x.id;
}
function ganttTaskOptions(selected=''){
 try{const g=JSON.parse(localStorage.getItem('obracontrol_gantt_piloto_v1')||'{}');return (g.tasks||[]).map(t=>`<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.houseId||'V-04')} · ${esc(t.name)} (${esc(t.id)})</option>`).join('')}
 catch(e){return ''}
}
function vPreventIntegration(){
 const links=DB.integrationLinks||[];const types=[['record','DH / NCR / RDI',DB.records||[]],['risk','Riesgo MIPER',DB.riskMatrix||[]],['inspection','Inspección',DB.inspections||[]],['asset','Activo de inventario',DB.inventoryItems||[]],['training','Asignación ACADEMY',DB.trainings||[]],['hold','Punto de detención',DB.holdPoints||[]],['rdi','RDI / solicitud de información',DB.dis||[]]];
 const rows=links.map(l=>{const taskLabel=(()=>{try{const g=JSON.parse(localStorage.getItem('obracontrol_gantt_piloto_v1')||'{}');const t=(g.tasks||[]).find(x=>x.id===l.taskId);return t?`${t.houseId||l.houseId} · ${t.name}`:`Tarea no encontrada (${l.taskId})`}catch(e){return 'Carta Gantt no disponible'}})();return `<tr><td><span class="badge b-blue">${esc((types.find(x=>x[0]===l.entityType)||[l.entityType])[1])}</span><div class="small">${esc(integrationEntityLabel(l.entityType,l.entityId))}</div></td><td>${esc(taskLabel)}</td><td>${esc(l.relacion||'—')}<div class="muted small">${esc(l.creadoPor||'')} · ${esc((l.creadoEn||'').slice(0,10))}</div></td><td><button class="btn btn-sec" data-act="integration-del" data-id="${esc(l.id)}">Quitar vínculo</button></td></tr>`}).join('');
 return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT · TRAZABILIDAD</div><h2>Integración verificable entre módulos</h2><p class="muted">Relaciona cada riesgo, inspección, activo, registro DH/NCR/RDI o capacitación con la tarea de la Carta Gantt que le corresponde.</p></div><a class="btn btn-sec" href="gantt/index.html" target="_blank" rel="noopener">Abrir Carta Gantt</a></div>${preventTabs('integration')}<div class="notice"><b>Regla:</b> un vínculo documenta trazabilidad, pero no cierra una NCR, libera un punto de detención ni certifica que un riesgo esté controlado. La verificación y autorización siguen siendo responsabilidad de personas competentes.</div><div class="card"><h3>Crear vínculo</h3><form data-form="integration-link"><div class="form-grid"><label>Tipo de registro<select name="entityType" required>${types.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></label><label>Registro específico<select name="entityId" required><option value="">Selecciona registro</option>${types.map(([type,label,arr])=>arr.map(x=>`<option data-type="${type}" value="${esc(x.uid||x.id)}">${esc(label)} · ${esc(integrationEntityLabel(type,x.uid||x.id))}</option>`).join('')).join('')}</select></label><label>Tarea de la Carta Gantt<select name="taskId" required><option value="">Selecciona tarea</option>${ganttTaskOptions()}</select></label><label>Vivienda<select name="houseId"><option>V-04</option>${Array.from({length:12},(_,i)=>`V-${String(i+1).padStart(2,'0')}`).filter(x=>x!=='V-04').map(x=>`<option>${x}</option>`).join('')}</select></label><label class="full">Motivo del vínculo<input name="relacion" required maxlength="180" placeholder="Ej. La capacitación debe completarse antes del hormigonado"></label></div><div class="modal-foot"><button class="btn" type="submit">Guardar vínculo</button></div></form><p class="muted small">Si no aparecen tareas, abre primero la Carta Gantt en este mismo navegador y vuelve a esta sección. Los archivos locales deben compartir el mismo origen de almacenamiento.</p></div><div class="card" style="margin-top:1rem"><h3>Vínculos registrados (${links.length})</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Registro preventivo / calidad</th><th>Tarea Gantt vinculada</th><th>Justificación y trazabilidad</th><th>Acción</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Todavía no hay vínculos registrados.</td></tr>'}</tbody></table></div></div><div class="grid two" style="margin-top:1rem"><div class="card"><h3>Validaciones preventivas</h3><ul><li>Los activos bloqueados no deben asignarse.</li><li>Los puntos de detención pendientes no autorizan avanzar.</li><li>Los riesgos altos abiertos deben mantenerse visibles.</li><li>Una capacitación aprobada teóricamente no sustituye la verificación práctica cuando corresponda.</li></ul></div><div class="card"><h3>Qué significa “verificado”</h3><p>La integración guarda quién creó el vínculo, cuándo se creó y qué tarea se relacionó. No afirma que la actividad esté ejecutada; ese estado debe registrarse en el módulo correspondiente con evidencia y autorización.</p></div></div>`;
}

function vPreventInventory(){const items=DB.inventoryItems||[],movs=(DB.inventoryMovements||[]).slice().reverse();const blocked=items.filter(x=>x.estado==='Bloqueado'||x.estado==='Fuera de servicio').length;return `<div class="page-head"><div><div class="section-kicker">PRAXIS PREVENT · CONTROL DE ACTIVOS</div><h2>Inventario preventivo de equipos y herramientas</h2><p class="muted">Cada activo debe tener código, ubicación y responsable; los equipos bloqueados no deben asignarse hasta que una persona competente documente su liberación.</p></div><div class="row wrap"><button class="btn btn-sec" data-act="prevent-new-movement">Registrar movimiento</button><button class="btn" data-act="prevent-new-inventory">+ Nuevo activo</button></div></div>${preventTabs('inventory')}<div class="grid stats">${stat('Activos registrados',items.length,'grn')}${stat('Bloqueados / fuera de servicio',blocked,blocked?'red':'grn')}${stat('En almacén',items.filter(x=>String(x.ubicacion||'').toLowerCase().includes('almacén')).length,'yel')}${stat('Próximas inspecciones vencidas',items.filter(x=>x.proximaInspeccion&&x.proximaInspeccion<hoy()&&x.estado!=='Fuera de servicio').length,'red')}</div><div class="notice">Ticket, proveedor y montos marcados como simulación son ficticios. Para inventario real, adjuntar el documento original y verificar serial, garantía, mantenimiento, manual y requisitos de inspección del fabricante.</div><div class="table-wrap"><table><thead><tr><th>Activo</th><th>Ubicación / asignación</th><th>Estado</th><th>Compra / inspección</th><th>Acciones</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.codigo)} · ${esc(x.nombre)}</b><div class="small muted">${esc(x.marca||'Marca pendiente')} ${esc(x.modelo||'')} · Serie ${esc(x.serie||'—')}</div><div class="small muted">${esc(x.categoria||'Equipo')} · ${esc(x.projectId||'')}</div></td><td>${esc(x.ubicacion||'Sin ubicación')}<div class="small muted">Cuadrilla: ${esc(x.cuadrilla||'Sin asignar')}</div><div class="small muted">Responsable: ${esc(x.responsable||'—')}</div></td><td><span class="badge ${['Bloqueado','Fuera de servicio'].includes(x.estado)?'b-red':x.estado==='Disponible'?'b-grn':'b-yel'}">${esc(x.estado||'Por revisar')}</span><div class="small">${esc(x.condicion||'Condición sin registrar')}</div></td><td><div class="small">${esc(x.documentoCompra||'Compra no registrada')} · ${x.monto!=null?'$'+Number(x.monto).toLocaleString('es-CL'):'—'}</div><div class="small muted">Última inspección: ${esc(x.ultimaInspeccion||'Pendiente')} · Próxima: ${esc(x.proximaInspeccion||'Por programar')}</div><div class="small muted">Mantención: ${esc(x.mantencionProxima||'Por programar')}</div>${x.demoTag?'<span class="badge b-yel">Ejemplo ficticio</span>':''}</td><td><div class="row wrap"><button class="btn btn-sec btn-sm" data-act="prevent-inventory-move" data-id="${esc(x.id)}">Mover / asignar</button><button class="btn btn-sec btn-sm" data-act="prevent-inventory-status" data-id="${esc(x.id)}">Estado</button></div></td></tr>`).join('')||'<tr><td colspan="5">No hay activos registrados.</td></tr>'}</tbody></table></div><h3 style="margin-top:1.2rem">Últimos movimientos</h3><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Activo</th><th>Movimiento</th><th>Origen → destino</th><th>Responsable / recibe</th></tr></thead><tbody>${movs.slice(0,12).map(m=>`<tr><td>${esc(m.fecha||'—')}</td><td>${esc(m.codigo||m.itemId)}</td><td>${esc(m.tipo)}</td><td>${esc(m.origen||'—')} → ${esc(m.destino||'—')}</td><td>${esc(m.responsable||'—')} / ${esc(m.recibe||'—')}<div class="small muted">${esc(m.motivo||m.observacion||'')}</div></td></tr>`).join('')||'<tr><td colspan="5">Sin movimientos.</td></tr>'}</tbody></table></div>`;}
function preventInventoryForm(){openModal('Registrar activo de inventario',`<form data-form="prevent-inventory-new"><div class="form-grid">${F('ip','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('ic','Código único *',`<input name="codigo" required placeholder="EQ-HOR-005">`)}${F('in','Nombre del equipo *',`<input name="nombre" required placeholder="Ej. Taladro percutor">`)}${F('icat','Categoría',`<select name="categoria"><option>Herramienta manual</option><option>Herramienta eléctrica</option><option>Equipo eléctrico</option><option>Equipo de medición</option><option>Equipo de protección colectiva</option><option>Otro</option></select>`)}${F('im','Marca',`<input name="marca">`)}${F('imo','Modelo',`<input name="modelo">`)}${F('is','N° serie / identificación',`<input name="serie">`)}${F('ist','Estado inicial *',`<select name="estado" required><option>Disponible</option><option>Bloqueado</option><option>Fuera de servicio</option><option>En mantenimiento</option></select>`)}${F('iloc','Ubicación actual *',`<input name="ubicacion" required placeholder="Almacén, estante o vivienda">`)}${F('icrew','Cuadrilla asignada',`<input name="cuadrilla" placeholder="Sin asignar">`)}${F('iresp','Responsable custodio *',`<input name="responsable" required>`) }${F('icond','Condición / motivo de bloqueo',`<input name="condicion">`)}${F('ibuy','Boleta / factura',`<input name="documentoCompra">`)}${F('iprov','Proveedor',`<input name="proveedor">`)}${F('iamt','Monto CLP',`<input name="monto" type="number" min="0">`)}${F('idate','Fecha compra',`<input name="fechaCompra" type="date">`)}${F('ilast','Última inspección',`<input name="ultimaInspeccion" type="date">`)}${F('inext','Próxima inspección',`<input name="proximaInspeccion" type="date">`)}${F('imnext','Próxima mantención',`<input name="mantencionProxima" type="date">`)}${F('inotes','Observaciones',`<textarea name="notas"></textarea>`,'full')}</div><div class="notice">No registres datos comerciales inventados como reales. Si es demostración, marca claramente la simulación.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar activo</button></div></form>`);}
function preventInventoryMoveForm(id=''){const item=(DB.inventoryItems||[]).find(x=>x.id===id);if(item&&['Bloqueado','Fuera de servicio'].includes(item.estado))return toast('Este activo está bloqueado. No puede asignarse hasta que una persona competente registre su liberación.','err');openModal('Movimiento de inventario',`<form data-form="prevent-inventory-move" data-id="${esc(id)}"><div class="form-grid">${F('mi','Activo *',`<select name="itemId" required>${(DB.inventoryItems||[]).map(x=>`<option value="${esc(x.id)}" ${x.id===id?'selected':''} ${['Bloqueado','Fuera de servicio'].includes(x.estado)?'disabled':''}>${esc(x.codigo)} · ${esc(x.nombre)} (${esc(x.estado)})</option>`).join('')}</select>`)}${F('mt','Tipo de movimiento *',`<select name="tipo" required><option>Asignación</option><option>Devolución</option><option>Traslado</option><option>Envío a mantenimiento</option><option>Retiro de servicio</option></select>`)}${F('mo','Origen *',`<input name="origen" required placeholder="Almacén">`)}${F('md','Destino *',`<input name="destino" required placeholder="V-04 / estación de trabajo">`)}${F('mr','Entrega / responsable *',`<input name="responsable" required>`)}${F('mrec','Recibe',`<input name="recibe">`)}${F('mdate','Fecha *',`<input name="fecha" type="date" required value="${hoy()}">`)}${F('mmot','Motivo *',`<input name="motivo" required placeholder="Tarea y ubicación de uso">`)}${F('mobs','Observación',`<textarea name="observacion"></textarea>`,'full')}</div><div class="notice">Registra entrega y devolución con custodio. No entregar equipos bloqueados o fuera de servicio.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Registrar movimiento</button></div></form>`);}
function preventInventoryStatusForm(id){const x=(DB.inventoryItems||[]).find(i=>i.id===id);if(!x)return;openModal('Actualizar estado del activo · '+esc(x.codigo),`<form data-form="prevent-inventory-status" data-id="${esc(id)}"><div class="form-grid">${F('st','Nuevo estado *',`<select name="estado" required><option ${x.estado==='Disponible'?'selected':''}>Disponible</option><option ${x.estado==='Asignado'?'selected':''}>Asignado</option><option ${x.estado==='Bloqueado'?'selected':''}>Bloqueado</option><option ${x.estado==='Fuera de servicio'?'selected':''}>Fuera de servicio</option><option ${x.estado==='En mantenimiento'?'selected':''}>En mantenimiento</option><option ${x.estado==='Retirado'?'selected':''}>Retirado</option></select>`)}${F('sc','Condición y motivo *',`<textarea name="condicion" required>${esc(x.condicion||'')}</textarea>`,'full')}${F('sa','Actualizado por *',`<input name="actor" required value="${esc(CURRENT_USER?.nombre||CURRENT_ROLE)}">`)}</div><div class="notice">Para cambiar desde Bloqueado/Fuera de servicio a Disponible, documenta qué se verificó y quién autorizó. La aplicación conserva un historial de estado.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar estado</button></div></form>`);}
function preventRiskForm(id=''){const r=(DB.riskMatrix||[]).find(x=>x.id===id)||{};openModal(id?'Actualizar riesgo':'Identificar peligro y evaluar riesgo',`<form data-form="prevent-risk" data-id="${esc(id)}"><div class="form-grid">${F('rp','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('ra','Actividad / tarea *',`<input name="actividad" required value="${esc(r.actividad||'')}">`)}${F('rh','Peligro *',`<textarea name="peligro" required>${esc(r.peligro||'')}</textarea>`)}${F('rc','Consecuencia posible *',`<textarea name="consecuencia" required>${esc(r.consecuencia||'')}</textarea>`)}${F('rprob','Probabilidad inicial (1–5) *',`<select name="probabilidad" required>${[1,2,3,4,5].map(n=>`<option ${Number(r.probabilidad||3)===n?'selected':''}>${n}</option>`).join('')}</select>`)}${F('rsev','Severidad inicial (1–5) *',`<select name="severidad" required>${[1,2,3,4,5].map(n=>`<option ${Number(r.severidad||3)===n?'selected':''}>${n}</option>`).join('')}</select>`)}${F('rctrl','Controles existentes',`<textarea name="controles">${esc(r.controles||'')}</textarea>`)}${F('rjer','Nivel de jerarquía de control *',`<select name="jerarquia" required>${['Eliminación','Sustitución','Ingeniería / técnica','Organizacional / método seguro','EPP para riesgo residual'].map(v=>`<option ${r.jerarquia===v?'selected':''}>${v}</option>`).join('')}</select>`)}${F('rmed','Medida adicional prioritaria *',`<textarea name="medida" required>${esc(r.medida||'')}</textarea>`,'full')}${F('rresp','Responsable *',`<input name="responsable" required value="${esc(r.responsable||'')}">`)}${F('rdate','Plazo *',`<input name="plazo" type="date" required value="${esc(r.plazo||hoy())}">`)}${F('rresprob','Probabilidad residual objetivo (1–5)',`<select name="residualProbabilidad">${[1,2,3,4,5].map(n=>`<option ${Number(r.residualProbabilidad||2)===n?'selected':''}>${n}</option>`).join('')}</select>`)}${F('rressev','Severidad residual objetivo (1–5)',`<select name="residualSeveridad">${[1,2,3,4,5].map(n=>`<option ${Number(r.residualSeveridad||3)===n?'selected':''}>${n}</option>`).join('')}</select>`)}${F('rstatus','Estado *',`<select name="estado" required>${['Acción pendiente','En control','Requiere revisión','Cerrado'].map(v=>`<option ${r.estado===v?'selected':''}>${v}</option>`).join('')}</select>`)}</div><div class="notice">No marcar riesgo como controlado solo porque se planificó una medida. Verificar implementación y eficacia en terreno; la evaluación residual debe confirmarse tras aplicar los controles.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar evaluación</button></div></form>`);}
function vPreventSignAttendance(){
 const open=DB.toolboxTalks.filter(t=>t.asistenciaAbierta!==false);
 return `<div class="page-head"><div><div class="section-kicker">ASISTENCIA DE TERRENO</div><h2>Firmar asistencia a charla preventiva</h2><p class="muted">Solo aparecen charlas abiertas. Firma únicamente si participaste presencialmente en la charla.</p></div></div><div class="notice">Para firmar necesitas tu propia cuenta de trabajador y el código que el relator entrega en persona. El sistema registra hora, firma escrita y, si autorizas al navegador, ubicación del dispositivo.</div>${open.length?open.map(t=>`<div class="card"><div class="page-head"><div><span class="badge b-grn">Asistencia abierta</span><h3>${esc(t.tarea)}</h3><p class="muted small">${esc(t.projectId)} · Relator: ${esc(t.relator)} · ${fmtFecha(t.fecha)}</p></div><button class="btn" data-act="prevent-sign-talk" data-id="${esc(t.id)}">Firmar asistencia</button></div><p><b>Riesgos:</b> ${esc(t.riesgos||'—')}</p><p><b>Controles comunicados:</b> ${esc(t.controles||'—')}</p></div>`).join(''):'<div class="card empty">No hay charlas abiertas para firmar. Pide al relator que habilite una charla vigente.</div>'}`;
}
function preventTalkAttendanceForm(id){const t=DB.toolboxTalks.find(x=>x.id===id);if(!t||t.asistenciaAbierta===false)return toast('Esta charla ya no está abierta para firmas.','err');if(!CURRENT_USER||!['Trabajador de obra','Trabajador común'].includes(CURRENT_USER.rol))return toast('Esta firma está habilitada para cuentas de trabajador.','err');if((t.firmas||[]).some(x=>x.userId===CURRENT_USER.id))return toast('Tu cuenta ya firmó la asistencia a esta charla.','err');openModal('Firmar asistencia · '+esc(t.tarea),`<form data-form="prevent-talk-sign" data-id="${esc(t.id)}"><div class="notice">Firma solo si estuviste presente. No compartas el código con personas ausentes.</div><div class="form-grid">${F('sc','Código entregado presencialmente *',`<input name="codigo" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 dígitos">`)}${F('sf','Nombre completo como firma *',`<input name="firma" required maxlength="100" value="${esc(CURRENT_USER.nombre)}" placeholder="Nombre y apellido">`,'full')}<label class="hold-check full"><input type="checkbox" name="declaracion" required><span>Declaro que estuve presente durante esta charla y recibí la explicación de riesgos y controles.</span></label><label class="hold-check full"><input type="checkbox" name="capturarUbicacion" checked><span>Intentar registrar la ubicación del dispositivo para apoyar la verificación (el navegador pedirá permiso).</span></label></div><div class="notice">Si no se obtiene ubicación, la firma queda registrada como “pendiente de corroboración presencial”. Un supervisor debe revisar la asistencia antes de darla por validada.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Firmar y registrar asistencia</button></div></form>`);}
function preventTable(rows,type,compact=false){if(!rows.length)return '<div class="empty">No hay registros todavía.</div>';let list=rows.slice().reverse();if(compact)list=list.slice(0,4);return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Registro</th><th>Estado / resultado</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>${list.map(x=>{let title=type==='hold'?(x.elemento+' · '+x.partida):type==='tools'?(x.herramienta+' · '+x.identificador):type==='talks'?(x.tarea+' · '+x.participantes):x.elemento+' · '+x.partida;let status=x.estado||x.resultado||'Registrado';let badge=status==='Autorizado'||status==='Apto'||status==='Conforme'||status==='Completado'?'b-grn':status==='Fuera de servicio'||status==='Bloqueado'||status==='No conforme'?'b-red':'b-yel';let act=type==='hold'&&x.estado!=='Autorizado'?`<button class="btn btn-sec btn-sm" data-act="prevent-resolve-hold" data-id="${esc(x.id)}">Revisar / autorizar</button>`:type==='followup'&&x.estado!=='Completado'?`<button class="btn btn-sec btn-sm" data-act="prevent-followup-result" data-id="${esc(x.id)}">Registrar control</button>`:type==='talks'?`<div class="row wrap"><button class="btn btn-sec btn-sm" data-act="prevent-talk-attendance" data-id="${esc(x.id)}">Asistencia (${(x.firmas||[]).length})</button>${x.asistenciaAbierta===false?'<span class="badge b-yel">Cerrada</span>':`<button class="btn btn-sec btn-sm" data-act="prevent-talk-close" data-id="${esc(x.id)}">Cerrar firmas</button>`}</div>`:'—';return `<tr><td>${fmtFecha(x.fecha||x.fechaCreacion||hoy())}</td><td><b>${esc(title||'Registro preventivo')}</b><div class="muted small">${esc(x.projectId||'')}</div>${type==='tools'?`<div class="muted small"><b>Marca/modelo:</b> ${esc(x.marca||'Pendiente de registrar')} · ${esc(x.modelo||'')}</div><div class="muted small"><b>Ubicación:</b> ${esc(x.ubicacionEstado||x.elemento||'Sin ubicación')}</div><div class="muted small"><b>Ticket:</b> ${esc(x.ticketCompra||'No registrado')} · ${x.montoCompra!=null?'$'+Number(x.montoCompra).toLocaleString('es-CL'):'—'} ${x.demoTag?'<b>· EJEMPLO FICTICIO</b>':''}</div>`:''}${x.observacion?`<div class="muted small">${esc(x.observacion)}</div>`:''}${type==='talks'?`<div class="muted small">Código: <b>${x.asistenciaAbierta===false?'cerrado':'activo (entrega presencial)'}</b> · Firmas: ${(x.firmas||[]).length} · ${x.asistenciaAbierta===false?'Asistencia cerrada':'Firmas abiertas'}</div>`:''}</td><td><span class="badge ${badge}">${esc(status)}</span>${type==='followup'?`<div class="small muted">${(x.resultados||[]).length}/${x.cantidad||3} controles</div>`:''}</td><td>${esc(x.responsable||x.inspector||x.relator||'—')}</td><td>${act}</td></tr>`}).join('')}</tbody></table></div>`;}
function preventProjectOptions(){return projOpts(DB.projects[0]?.id,'Seleccione proyecto');}
function preventHoldForm(){openModal('Crear punto de detención',`<form data-form="prevent-hold"><div class="form-grid">${F('hp','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('he','Elemento / vivienda *',`<input name="elemento" required placeholder="Ej: V-03 · radier">`)}${F('hpart','Partida crítica *',`<select name="partida" required><option value="">Seleccione</option><option>Antes de hormigonar</option><option>Antes de cerrar moldaje</option><option>Antes de cubrir instalaciones</option><option>Antes de iniciar excavación</option><option>Antes de retirar protección</option><option>Otro control crítico</option></select>`)}${F('hresp','Responsable de revisión *',`<input name="responsable" required value="${esc(CURRENT_ROLE)}">`)}${F('hobs','Observación / condición especial',`<textarea name="observacion" placeholder="Qué debe revisarse antes de avanzar"></textarea>`,'full')}</div><div class="notice">Se crea inicialmente como PENDIENTE. La autorización requiere completar todos los controles y registrar quién revisó.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Crear punto de detención</button></div></form>`);}
function preventResolveHoldForm(id){const h=DB.holdPoints.find(x=>x.id===id);if(!h)return;openModal('Revisión del punto de detención',`<form data-form="prevent-resolve-hold" data-id="${esc(id)}"><p><b>${esc(h.elemento)}</b> · ${esc(h.partida)}. Marque cada control únicamente después de verificarlo en terreno.</p><div class="form-grid">${HOLD_CHECKS.map(([k,t])=>`<label class="hold-check"><input type="checkbox" name="${k}"><span>${esc(t)}</span></label>`).join('')}${F('hr','Nombre de quien autoriza *',`<input name="autorizador" required>`)}${F('hresu','Resultado *',`<select name="resultado" required><option value="Conforme">Conforme: autorizar avance</option><option value="No conforme">No conforme: mantener detenido</option></select>`)}${F('hrobs','Observación de revisión *',`<textarea name="observacion" required></textarea>`,'full')}</div><div class="notice">Si un control no cumple, no autorice el avance. Resuelva la condición y repita la revisión.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar revisión</button></div></form>`);}
function preventToolForm(){openModal('Inspección previa de herramienta / equipo',`<form data-form="prevent-tool"><div class="form-grid">${F('tp','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('tasset','Activo inventariado (opcional)',`<select name="inventoryItemId"><option value="">Inspección sin vincular a inventario</option>${(DB.inventoryItems||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.codigo)} · ${esc(x.nombre)}</option>`).join('')}</select>`)}${F('th','Herramienta / equipo *',`<input name="herramienta" required placeholder="Ej: vibrador de inmersión, esmeril">`)}${F('tm','Marca',`<input name="marca" placeholder="Ej: Bosch, Makita, ENAR">`)}${F('tmodel','Modelo',`<input name="modelo" placeholder="Modelo del fabricante">`)}${F('ti','Código / identificación',`<input name="identificador" placeholder="N° equipo o etiqueta">`)}${F('te','Elemento / ubicación',`<input name="elemento" placeholder="Ej: V-04, sector radier">`)}${F('tloc','Ubicación actual *',`<select name="ubicacionEstado" required><option>En estación de trabajo</option><option>En almacén</option><option>Prestado a cuadrilla</option><option>En mantenimiento</option><option>Retirado de servicio</option></select>`)}${F('tticket','Ticket / boleta de compra',`<input name="ticketCompra" placeholder="N° documento de compra">`)}${F('tprovider','Proveedor',`<input name="proveedor" placeholder="Nombre del proveedor">`)}${F('tamount','Monto de compra (CLP)',`<input name="montoCompra" type="number" min="0" step="1" placeholder="0">`)}${F('tdate','Fecha de compra',`<input name="fechaCompra" type="date">`)}${F('tr','Inspector *',`<input name="inspector" required value="${esc(CURRENT_ROLE)}">`)}${F('ts','Resultado de inspección *',`<select name="resultado" required><option value="Apto">Apto para uso</option><option value="Observado">Observado: corregir antes de usar</option><option value="Fuera de servicio">Fuera de servicio</option></select>`)}<div class="notice full">Para cada punto, confirma que fue verificado o justifica documentalmente por qué no aplica. Completa todos los controles pertinentes antes de marcar Apto; adapta la lista al equipo y manual del fabricante.</div>${[['integridad','Carcasa, estructura y empuñaduras íntegras'],['proteccion','Guardas y dispositivos de seguridad instalados'],['cableado','Cable, enchufe, conexión y protección sin daños visibles'],['accesorios','Accesorio correcto, compatible y en buen estado'],['manual','Manual, inspección/mantención y requisitos identificados'],['competencia','Operador instruido/autorizado cuando corresponda']].map(([k,t])=>`<label class="hold-check full"><input type="checkbox" name="${k}"><span>${t}</span></label>`).join('')}${F('to','Observación / defecto detectado *',`<textarea name="observacion" required placeholder="Registre estado de cables, guardas, interruptor, accesorios y otros controles aplicables"></textarea>`,'full')}</div><div class="notice">No realice reparaciones improvisadas. Equipos defectuosos deben aislarse, identificarse y ser revisados por personal competente.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar inspección</button></div></form>`);}
function preventTalkForm(){if(!preventCanManage())return toast('Solo Administración, Supervisión, Jefatura o Gerencia puede registrar charlas.','err');openModal('Charla preventiva de cinco minutos',`<form data-form="prevent-talk"><div class="notice">Al guardar se generará un código de 6 dígitos. Muéstralo solo a las personas presentes y cierra la asistencia al terminar.</div><div class="form-grid">${F('bp','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('bt','Tarea / partida del día *',`<input name="tarea" required placeholder="Ej: recepción y vaciado de hormigón">`)}${F('br','Relator responsable *',`<input name="relator" required value="${esc(CURRENT_ROLE)}">`)}${F('bpart','Participantes / cuadrilla *',`<textarea name="participantes" required placeholder="Nombres o nómina de asistentes"></textarea>`,'full')}${F('brisk','Riesgos principales *',`<textarea name="riesgos" required></textarea>`)}${F('bctrl','Controles y EPP comunicados *',`<textarea name="controles" required></textarea>`)}${F('bunder','Confirmación de comprensión',`<select name="comprension"><option>Confirmación verbal registrada</option><option>Requiere aclaración</option></select>`)}${F('bobs','Observaciones',`<textarea name="observacion"></textarea>`,'full')}<label class="hold-check full"><input type="checkbox" name="capturarUbicacionCharla" checked><span>Intentar guardar la ubicación del lugar donde se imparte la charla (requiere permiso del navegador).</span></label></div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar charla</button></div></form>`);}
function preventFollowupForm(){openModal('Plan de seguimiento reforzado',`<form data-form="prevent-followup"><div class="form-grid">${F('fp','Proyecto *',`<select name="projectId" required>${preventProjectOptions()}</select>`)}${F('fe','Elemento / partida a controlar *',`<input name="elemento" required placeholder="Ej: radier / vibrado del hormigón">`)}${F('fncr','NCR de referencia',`<select name="ncrId"><option value="">Sin NCR asociada</option>${DB.records.filter(r=>r.tipo==='NCR').map(r=>`<option value="${esc(r.uid)}">${esc(r.code)} · ${esc(r.titulo)}</option>`).join('')}</select>`)}${F('fc','Cantidad de controles requeridos *',`<select name="cantidad"><option value="3">3 próximas ejecuciones</option><option value="2">2 próximas ejecuciones</option><option value="5">5 próximas ejecuciones</option></select>`)}${F('fr','Responsable del seguimiento *',`<input name="responsable" required value="${esc(CURRENT_ROLE)}">`)}${F('fdate','Fecha de revisión objetivo',`<input type="date" name="fechaObjetivo" value="${addDays(7)}">`)}${F('fplan','Medida / criterio a verificar *',`<textarea name="criterio" required placeholder="Ej: acceso del vibrador, operador asignado y control de segregación"></textarea>`,'full')}</div><div class="notice">El plan permanece activo hasta completar todos los controles requeridos con resultado conforme. Un resultado no conforme obliga a revisar las medidas y mantener el seguimiento.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Crear plan</button></div></form>`);}
function preventFollowupResultForm(id){const x=DB.enhancedControls.find(z=>z.id===id);if(!x)return;openModal('Registrar control de seguimiento',`<form data-form="prevent-followup-result" data-id="${esc(id)}"><p>${esc(x.elemento)} · Control ${(x.resultados||[]).length+1} de ${x.cantidad}</p><div class="form-grid">${F('frdate','Fecha *',`<input type="date" name="fecha" required value="${hoy()}">`)}${F('frres','Resultado *',`<select name="resultado"><option>Conforme</option><option>No conforme</option></select>`)}${F('frby','Inspeccionado por *',`<input name="inspector" required value="${esc(CURRENT_ROLE)}">`)}${F('frob','Evidencia / observación *',`<textarea name="observacion" required placeholder="Qué se verificó y qué evidencia queda"></textarea>`,'full')}</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar control</button></div></form>`);}

function academyStats(){const groups=recurrenceGroups();return {groups,trainings:DB.trainings,required:DB.trainings.filter(t=>t.estado!=='Verificado en terreno').length,passed:DB.trainings.filter(t=>t.estado==='Aprobado teóricamente'||t.estado==='Verificado en terreno').length};}
function academyShellTab(active){return `<div class="tabs"><a class="tab ${active==='biblioteca'?'active':''}" href="#/academy">📚 Biblioteca</a><a class="tab ${active==='asignaciones'?'active':''}" href="#/academy/asignaciones">🧑‍🏭 Capacitaciones</a><a class="tab ${active==='reincidencia'?'active':''}" href="#/academy/reincidencia">🔁 Reincidencia</a><a class="tab ${active==='historial'?'active':''}" href="#/academy/historial">🗂 Historial</a></div>`;}
const ACADEMY_GUIDES={
 m01:{steps:['Comparar la guía de despacho con el pedido, la clase/resistencia y los requisitos del proyecto.','Registrar hora de carga/llegada y revisar el tiempo transcurrido conforme al procedimiento.','Realizar los controles de recepción definidos por la obra y personal competente.','Ante discrepancia, detener la descarga si corresponde y consultar al responsable; no modificar la mezcla por iniciativa propia.'],errors:['Aceptar una entrega sin revisar la documentación.','Agregar agua u otros productos sin autorización.','Omitir hora, observaciones o resultado de recepción.'],checks:['Guía y pedido coinciden.','Control de recepción documentado.','Discrepancias resueltas antes de continuar.'],warning:'La aceptación y los ensayos deben seguir la especificación del proyecto y el procedimiento vigente.'},
 m02:{steps:['Antes de la llegada, confirmar secuencia, accesos, personal, vibrador operativo y respaldo previsto.','Revisar que el vibrador pueda pasar entre armaduras sin alterar el acero ni el recubrimiento.','Colocar el hormigón de forma continua y controlada, evitando caída/descarga que provoque segregación.','Aplicar el patrón de vibrado definido por el procedimiento y el fabricante; observar el resultado y coordinar al equipo.','Si no hay acceso, el equipo falla o aparece segregación, detener y resolver antes de seguir.'],errors:['Usar el vibrador para desplazar el hormigón.','Vibrar de forma improvisada o sin operador designado.','Continuar aunque el cabezal no acceda a la zona.'],checks:['Equipo probado y operador asignado.','Acceso entre armaduras confirmado.','Plan de colocación y vibrado comunicado.','Sin segregación visible sin tratar.'],warning:'No existe un tiempo universal de vibrado aplicable a todas las mezclas y elementos; seguir el procedimiento aprobado.'},
 m03:{steps:['Tener a mano la última versión aprobada de planos y especificaciones.','Verificar diámetro, cantidad, separación, posición, anclajes, traslapos y recubrimiento según documentación.','Revisar fijación, separadores e interferencias con instalaciones y moldajes.','Registrar y corregir observaciones antes del hormigonado.','No cortar, doblar de forma no prevista ni sustituir acero sin autorización técnica.'],errors:['Medir “a ojo” o aceptar cambios verbales.','Mover armaduras y no reponer recubrimientos/separadores.','Modificar barras para facilitar el paso del vibrador.'],checks:['Planos vigentes disponibles.','Diámetros y disposición revisados.','Recubrimiento y fijación verificados.','Interferencias resueltas.'],warning:'Cualquier modificación estructural debe ser resuelta por el profesional competente y quedar documentada.'},
 m04:{steps:['Verificar apoyo, alineación, dimensiones, cotas y estabilidad del moldaje.','Inspeccionar apuntalamientos, uniones, cierres y posibles pérdidas.','Retirar residuos, alambres sueltos y elementos que puedan contaminar el hormigón.','Comprobar accesos de colocación y vibrado antes de autorizar el vaciado.','Registrar las correcciones y solicitar revisión cuando corresponda.'],errors:['Hormigonar con moldaje inestable o sucio.','Ignorar fugas, deformaciones o cotas incorrectas.','Retirar o modificar puntales sin autorización.'],checks:['Estabilidad y fijaciones revisadas.','Cotas y geometría verificadas.','Limpieza y estanqueidad aceptables.','Acceso seguro para la faena.'],warning:'La estabilidad del moldaje y sus apuntalamientos debe evaluarse según diseño/procedimiento; no improvisar apoyos.'},
 m05:{steps:['Revisar permiso/procedimiento, antecedentes de servicios enterrados y condiciones del entorno.','Delimitar el área, definir accesos y mantener maquinaria/personas fuera de zonas incompatibles.','Inspeccionar terreno, bordes, agua acumulada y señales de inestabilidad por personal competente.','Aplicar protección de taludes/entibación u otras medidas establecidas antes del ingreso.','Detener y evacuar si cambian las condiciones o aparecen grietas, desprendimientos o ingreso de agua.'],errors:['Entrar a una zanja sin protección evaluada.','Acopiar material o estacionar maquinaria al borde sin control.','Trabajar bajo cargas suspendidas o con acceso bloqueado.'],checks:['Servicios identificados.','Perímetro y accesos seguros.','Protección definida e inspeccionada.','Plan de emergencia/comunicación conocido.'],warning:'No ingresar a una excavación insegura. La solución depende del suelo, profundidad, entorno y evaluación competente.'},
 m06:{steps:['Acordonar y documentar el defecto; evaluar alcance y posible afectación del elemento.','Solicitar aprobación del método de reparación y del producto compatible con el sustrato/uso.','Retirar material suelto y preparar el soporte según ficha técnica y procedimiento autorizado.','Aplicar dentro de espesores, mezcla, tiempo abierto y condiciones ambientales del fabricante.','Ejecutar curado/protección y registrar producto, lote, preparación, aplicación y aceptación.'],errors:['Tapar el defecto sin retirar material suelto.','Usar mortero no aprobado o fuera de su vida útil.','Reparar sin determinar si requiere evaluación estructural.'],checks:['Defecto evaluado y procedimiento aprobado.','Sustrato preparado.','Producto vigente y ficha disponible.','Aplicación/curado documentados.','Aceptación del responsable.'],warning:'Una reparación superficial no sustituye la evaluación del calculista/profesional cuando pueda existir daño estructural.'},
 m07:{steps:['Identificar el método, duración y momento de inicio del curado definidos en EETT/procedimiento.','Proteger el elemento frente a pérdida rápida de humedad, lluvia, viento, golpes y tránsito prematuro.','Mantener el método de curado durante el periodo requerido y revisar su continuidad.','Retirar protecciones solo cuando corresponda y con autorización.','Registrar fecha/hora de inicio, controles y observaciones.'],errors:['Dejar secar la superficie sin protección.','Interrumpir el curado sin evaluar el requisito.','Cargar o golpear el elemento antes de lo permitido.'],checks:['Método aprobado disponible.','Protección continua.','Periodo y controles registrados.','Cargas/tránsito controlados.'],warning:'El método y duración dependen de la especificación, condiciones ambientales y tipo de hormigón.'},
 m08:{steps:['Describir lo observado con fecha, ubicación, elemento y evidencia objetiva.','Indicar el requisito verificable: plano, EETT, procedimiento o checklist vigente.','Separar corrección inmediata, causa, acción correctiva y medida preventiva.','Asignar responsable, plazo y manual asociado cuando corresponda.','Verificar ejecución, evidencia y eficacia en trabajos posteriores antes del cierre.'],errors:['Redactar culpas en vez de hechos.','Cerrar solo porque se reparó el defecto, sin comprobar eficacia.','Usar una medida genérica que no controla la causa.'],checks:['Ubicación y elemento identificados.','Evidencia legible y trazable.','Responsable/plazo asignados.','Prevención y verificación de eficacia registradas.'],warning:'La repetición de un defecto requiere revisar el sistema de trabajo, no solo volver a reparar el resultado.'},
 m09:{steps:['Antes de iniciar, revisar charla/inducción, matriz de riesgos y procedimiento de la tarea.','Identificar peligros y aplicar controles en la fuente, ingeniería y organización antes de depender del EPP.','Verificar EPP adecuado, herramientas, orden, señalización y vías de circulación.','Mantener comunicación, reportar incidentes/casi incidentes y detener ante riesgo grave e inminente según protocolo.','Conocer rutas de evacuación, primeros auxilios y contactos de emergencia de la obra.'],errors:['Usar EPP como único control cuando se requiere una barrera adicional.','Bloquear extintores, salidas o rutas de tránsito.','No reportar una condición peligrosa.'],checks:['Riesgos revisados antes de ejecutar.','Controles y EPP correctos.','Área señalizada y ordenada.','Emergencia y comunicación conocidas.'],warning:'Adaptar el contenido a la matriz de riesgos y plan de emergencia específicos de la obra.'},
 m10:{steps:['Confirmar que la herramienta es adecuada para la tarea y que la persona sabe usarla.','Inspeccionar carcasa, cable/enchufe, guarda, interruptor, accesorios y fecha/estado de inspección cuando aplique.','Usar los resguardos y EPP definidos; asegurar la pieza y mantener a terceros fuera de la zona de proyección.','Desconectar/aislar antes de cambiar disco, broca, hoja o hacer ajustes.','Retirar de servicio, identificar y reportar cualquier herramienta defectuosa.'],errors:['Retirar guardas o usar accesorios incompatibles.','Trabajar con cables dañados o manos en zona de corte.','Dejar una herramienta conectada durante ajustes.'],checks:['Inspección previa satisfactoria.','Accesorio correcto y bien instalado.','Guardas y EPP en uso.','Zona de trabajo controlada.'],warning:'Seguir siempre el manual del fabricante. Algunas herramientas requieren capacitación, autorización y controles específicos.'},
 m11:{steps:['Inspeccionar equipo, enchufe, cable, aislación y accesorios antes de usar.','Verificar alimentación protegida y condiciones del lugar de acuerdo con procedimiento eléctrico.','Mantener conexiones y extensiones protegidas de agua, tránsito y daño mecánico.','Desconectar antes de limpiar, desatascar, cambiar accesorios o intervenir.','Retirar de servicio y reportar fallas; no improvisar reparaciones eléctricas.'],errors:['Tirar del cable para mover el equipo.','Manipular conexiones con manos mojadas o en condiciones no seguras.','Reparar el equipo energizado.'],checks:['Equipo y cables en buen estado.','Conexión y protección adecuadas.','Operador conoce el procedimiento.','Equipo desconectado antes de intervenir.'],warning:'La instalación y protección eléctrica deben cumplir el procedimiento de la obra y ser revisadas por personal autorizado.'},
 m12:{steps:['Planificar tarea, permisos y controles según altura, izaje, electricidad o maquinaria involucrada.','Inspeccionar protecciones colectivas, accesos, equipos y zona de exclusión antes de comenzar.','Coordinar roles, señales, comunicación y condiciones climáticas/operacionales.','No trabajar bajo cargas suspendidas ni acercarse a fuentes energizadas sin control autorizado.','Detener la actividad si falla un control crítico o cambia el entorno.'],errors:['Improvisar plataformas o anclajes.','Pasar bajo cargas suspendidas.','Aproximarse a líneas eléctricas sin distancias/controles establecidos.'],checks:['Procedimiento/permiso disponible.','Protecciones y equipos inspeccionados.','Zona delimitada y roles claros.','Plan de rescate/emergencia cuando corresponda.'],warning:'La capacitación general no habilita automáticamente para trabajos en altura, izaje, electricidad o manejo de maquinaria.'}
};
Object.assign(ACADEMY_GUIDES,{ m13:{steps:["Revisar plano, modulación, apoyos y detalles aprobados del sistema SIP.","Verificar base nivelada, escuadra, anclajes y paneles correctos.","Confirmar orientación, cortes permitidos y uniones del fabricante.","Montar con apoyo suficiente, fijar según detalle y sellar encuentros.","Comprobar aplome y continuidad de sellos antes de cubrir."],errors:["Modificar paneles estructurales sin aprobación.","Dejar juntas o fijaciones incompletas."],checks:["Plano y panel correctos.","Base y fijaciones conformes.","Juntas y penetraciones revisadas."],warning:"No improvisar cortes ni modificaciones estructurales; seguir el sistema aprobado y las instrucciones del fabricante."},
 m14:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m15:{steps:["Confirmar proyecto, permisos y personal autorizado.","Desenergizar y aplicar bloqueo/identificación cuando corresponda.","Verificar ausencia de tensión con equipo apropiado.","Instalar canalizaciones y conductores según proyecto.","Realizar pruebas y revisión autorizada antes de energizar."],errors:["Trabajar energizado sin procedimiento autorizado.","Elegir protecciones o secciones por intuición."],checks:["Circuitos identificados.","Canalizaciones protegidas.","Pruebas documentadas."],warning:"Solo personal habilitado según normativa SEC y procedimientos vigentes debe ejecutar y certificar trabajos eléctricos."},
 m16:{steps:["Contrastar trazado, cotas, diámetros y materiales con el plano.","Preparar soportes y superficies de unión.","Montar sin esfuerzos y proteger extremos.","Ejecutar la prueba especificada para el sistema.","Registrar resultado e inspeccionar antes de ocultar."],errors:["Usar materiales incompatibles.","Cerrar tabiques antes de probar."],checks:["Material y diámetros correctos.","Soportes y uniones revisados.","Prueba registrada."],warning:"Los parámetros de prueba deben provenir del proyecto, normativa aplicable y fabricante."},
 m17:{steps:["Contrastar trazado, cotas, diámetros y materiales con el plano.","Preparar soportes y superficies de unión.","Montar sin esfuerzos y proteger extremos.","Ejecutar la prueba especificada para el sistema.","Registrar resultado e inspeccionar antes de ocultar."],errors:["Usar materiales incompatibles.","Cerrar tabiques antes de probar."],checks:["Material y diámetros correctos.","Soportes y uniones revisados.","Prueba registrada."],warning:"Los parámetros de prueba deben provenir del proyecto, normativa aplicable y fabricante."},
 m18:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m19:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m20:{steps:["Verificar que el sustrato esté liberado, limpio y apto.","Confirmar material, lote y ficha técnica.","Replantear modulación y resolver encuentros.","Ejecutar fijaciones/aplicación respetando secuencia y tiempos.","Revisar terminación y registrar observaciones antes de habilitar."],errors:["Trabajar sobre superficies húmedas o inestables.","Omitir juntas, holguras o tiempos de curado."],checks:["Sustrato conforme.","Material y fijaciones correctos.","Terminación revisada."],warning:"Respetar fichas técnicas, ventilación, EPP y tiempos del fabricante."},
 m21:{steps:["Verificar que el sustrato esté liberado, limpio y apto.","Confirmar material, lote y ficha técnica.","Replantear modulación y resolver encuentros.","Ejecutar fijaciones/aplicación respetando secuencia y tiempos.","Revisar terminación y registrar observaciones antes de habilitar."],errors:["Trabajar sobre superficies húmedas o inestables.","Omitir juntas, holguras o tiempos de curado."],checks:["Sustrato conforme.","Material y fijaciones correctos.","Terminación revisada."],warning:"Respetar fichas técnicas, ventilación, EPP y tiempos del fabricante."},
 m22:{steps:["Verificar que el sustrato esté liberado, limpio y apto.","Confirmar material, lote y ficha técnica.","Replantear modulación y resolver encuentros.","Ejecutar fijaciones/aplicación respetando secuencia y tiempos.","Revisar terminación y registrar observaciones antes de habilitar."],errors:["Trabajar sobre superficies húmedas o inestables.","Omitir juntas, holguras o tiempos de curado."],checks:["Sustrato conforme.","Material y fijaciones correctos.","Terminación revisada."],warning:"Respetar fichas técnicas, ventilación, EPP y tiempos del fabricante."},
 m23:{steps:["Verificar que el sustrato esté liberado, limpio y apto.","Confirmar material, lote y ficha técnica.","Replantear modulación y resolver encuentros.","Ejecutar fijaciones/aplicación respetando secuencia y tiempos.","Revisar terminación y registrar observaciones antes de habilitar."],errors:["Trabajar sobre superficies húmedas o inestables.","Omitir juntas, holguras o tiempos de curado."],checks:["Sustrato conforme.","Material y fijaciones correctos.","Terminación revisada."],warning:"Respetar fichas técnicas, ventilación, EPP y tiempos del fabricante."},
 m24:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m25:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m26:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m27:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m28:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m29:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."},
 m30:{steps:["Revisar plano vigente, procedimiento y requisitos de aceptación.","Preparar frente, recursos, materiales y controles previos.","Ejecutar la actividad en la secuencia autorizada.","Registrar mediciones, inspecciones y evidencia trazable.","Corregir observaciones y solicitar verificación antes de cerrar/liberar."],errors:["Usar documentación obsoleta o improvisar una solución.","Cerrar el registro sin evidencia o autorización."],checks:["Documentación vigente.","Responsable y recursos asignados.","Controles y evidencia completos."],warning:"El manual es introductorio; validar requisitos con profesional competente, normativa, planos y EETT vigentes."}});
function academyGuideList(m,field){const g=ACADEMY_GUIDES[m.id]||{};const arr=g[field]||[];return `<ul>${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
function vAcademy(sub,id){const st=academyStats();if(sub==='manual'){const m=ACADEMY_MANUALS.find(x=>x.id===id);if(!m)return notFound('Manual no encontrado');return `<div class="page-head"><div><div class="section-kicker">PRAXIS ACADEMY · ${m.id.toUpperCase()}</div><h2>${esc(m.titulo)}</h2><p class="muted">Manual ilustrado de apoyo · Área: ${esc(m.area)}</p></div><button class="btn btn-sec" onclick="window.print()">Imprimir manual</button></div>${academyShellTab('biblioteca')}<div class="academy-hero"><div class="academy-illustration"><span>🦺</span><span>🛠️</span><span>📋</span></div><div><h3>Objetivo preventivo</h3><p>${esc(m.contenido)}</p></div></div><div class="grid two"><div class="card"><h3>Secuencia de trabajo</h3><ol>${(ACADEMY_GUIDES[m.id]?.steps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div class="card"><h3>Errores que deben evitarse</h3>${academyGuideList(m,'errors')}</div><div class="card"><h3>Puntos de control</h3>${academyGuideList(m,'checks')}</div><div class="card"><h3>Advertencia técnica</h3><p>${esc(ACADEMY_GUIDES[m.id]?.warning||'Aplicar el procedimiento aprobado.')}</p><p><b>Fuentes de consulta:</b> ${esc(m.fuente)}</p><p class="muted small">Contenido introductorio de PRAXIS. Debe contrastarse con planos, EETT, fichas técnicas, normativa vigente y procedimientos aprobados. No reemplaza inducción práctica ni capacitación formal.</p></div></div><div class="card"><h3>Evaluación del módulo</h3><p>Cuestionario de 5 preguntas; aprobación interna propuesta: 80% (4 de 5 respuestas correctas).</p><button class="btn" data-act="academy-assign-manual" data-id="${m.id}">Asignar este manual a una persona</button></div>`;}if(sub==='quiz')return academyQuiz(id);if(sub==='asignaciones'){return `<div class="page-head"><div><h2>Capacitaciones asignadas</h2><p class="muted">Registro individual de formación teórica y verificación en terreno.</p></div><button class="btn" data-act="academy-new">+ Asignar capacitación</button></div>${academyShellTab('asignaciones')}<div class="card">${academyTrainingTable(DB.trainings)}</div>`;}if(sub==='historial'){return `<div class="page-head"><h2>Historial de formación</h2></div>${academyShellTab('historial')}<div class="card">${academyTrainingTable(DB.trainings.slice().sort((a,b)=>(b.fechaAsignacion||'').localeCompare(a.fechaAsignacion||'')))}</div>`;}if(sub==='reincidencia'){return `<div class="page-head"><div><h2>Reincidencia de no conformidades</h2><p class="muted">Se agrupan NCR por proyecto, especialidad, elemento constructivo y familia del problema. La coincidencia debe confirmarla un supervisor.</p></div></div>${academyShellTab('reincidencia')}<div class="notice">Desde la segunda ocurrencia candidata, revisar y confirmar si existe reincidencia. Al confirmar, asignar formación a quienes ejecutaron el trabajo afectado y a quienes ejecutarán esa partida a futuro.</div>${st.groups.length?st.groups.map(g=>`<div class="card recurrence-card"><div class="page-head"><div><span class="badge ${g.confirmed?'b-red':'b-blue'}">${g.confirmed?'Reincidencia confirmada':'Revisión requerida'}</span><h3>${esc(g.elemento)} · ${esc(g.familia)}</h3><div class="muted small">${esc(g.especialidad)} · ${g.records.length} ocurrencias candidatas</div></div>${g.confirmed?'<span class="badge b-red">Capacitación obligatoria</span>':`<button class="btn btn-danger" data-act="academy-confirm-recurrence" data-key="${esc(encodeURIComponent(g.key))}">Confirmar reincidencia</button>`}</div><div class="row wrap">${g.records.map(r=>`<a class="badge b-blue" href="#/registro/${enc(r.uid)}">${esc(r.code)} · ${esc(r.frenteId||'Sin frente')}</a>`).join('')}</div>${g.confirmed?`<p class="small">Confirmada por ${esc(g.review.actor||'supervisor')} el ${fmtFecha(g.review.fecha)}. Manual sugerido: ${esc(ACADEMY_MANUALS.find(m=>m.id===g.review.manualId)?.titulo||'Por definir')}.</p><button class="btn btn-sec btn-sm" data-act="academy-assign-group" data-key="${esc(encodeURIComponent(g.key))}">Asignar capacitación a trabajadores</button>`:''}</div>`).join(''):'<div class="card empty">Aún no hay grupos con dos NCR candidatas. Para mejorar la detección, completa el elemento constructivo y la familia del problema en cada NCR.</div>'}`;}return `<div class="page-head"><div><div class="section-kicker">MEJORA 09 · PRAXIS EDIFICACIONES</div><h2>PRAXIS ACADEMY</h2><p class="muted">Capacitación, prevención y aprendizaje a partir de reincidencias.</p></div><button class="btn btn-sec" data-act="academy-new">+ Registrar trabajador</button></div>${academyShellTab('biblioteca')}<div class="grid stats">${stat('Módulos',ACADEMY_MANUALS.length,'grn')}${stat('Asignaciones',DB.trainings.length)}${stat('Pendientes',st.required,st.required?'red':'grn')}${stat('Reincidencias candidatas',st.groups.length,st.groups.length?'red':'grn')}</div><div class="academy-grid">${ACADEMY_MANUALS.map((m,i)=>`<a class="academy-manual-card" href="#/academy/manual/${m.id}"><div class="academy-card-visual"><span>${(['🧾','🪣','🔩','🧱','⛏️','🩹','💧','📝','🦺','🛠️','⚙️','🏗️','🧩','📐','⚡','🚰','🚽','🌡️','💨','🚪','🪚','🧱','🎨','🏠','🧪','📏','📋','📦','♻️','📆'][i]||'📘')}</span><small>${m.id.toUpperCase()}</small></div><div class="academy-card-body"><span class="badge ${m.area==='Seguridad'?'b-red':'b-blue'}">${esc(m.area)}</span><h3>${esc(m.titulo)}</h3><p>${esc(m.contenido.slice(0,135))}…</p><span class="academy-open">Abrir manual →</span></div></a>`).join('')}</div><div class="card academy-sources"><h3>Fuentes de consulta para validación</h3><p>Utilice estas fuentes junto con las EETT, planos aprobados y procedimientos específicos de la obra.</p><div class="row wrap"><a class="btn btn-sec btn-sm" href="https://www.achs.cl/" target="_blank" rel="noopener">ACHS · Prevención de riesgos ↗</a><a class="btn btn-sec btn-sm" href="https://www.mutual.cl/" target="_blank" rel="noopener">Mutual de Seguridad ↗</a></div></div><div class="notice">Los manuales son material introductorio de PRAXIS. Antes de utilizarlos como instrucción oficial, deben ser revisados por el profesional competente y adaptados a la obra, normativa vigente, fabricante y procedimientos aprobados.</div>`;}
function academyTrainingTable(rows){if(!rows.length)return '<div class="empty">Sin capacitaciones registradas. Asigne una desde PRAXIS ACADEMY.</div>';return `<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Cargo</th><th>Elemento / obra</th><th>Manual</th><th>Estado</th><th>Nota</th><th>Acciones</th></tr></thead><tbody>${rows.map(t=>`<tr><td><b>${esc(t.nombre)}</b><div class="muted small">${esc(t.empresa||'')}</div></td><td>${esc(t.cargo)}</td><td>${esc(t.elemento||t.projectId)}<div class="muted small">${esc(t.projectId||'')}</div></td><td>${esc(ACADEMY_MANUALS.find(m=>m.id===t.manualId)?.titulo||t.manualId)}</td><td><span class="badge ${t.estado==='Verificado en terreno'?'b-grn':t.estado==='Aprobado teóricamente'?'b-blue':'b-red'}">${esc(t.estado)}</span></td><td>${t.nota==null?'—':t.nota+'%'}</td><td><div class="row wrap"><a class="btn btn-sec btn-sm" href="#/academy/quiz/${enc(t.id)}">Evaluar</a>${t.estado!=='Verificado en terreno'?`<button class="btn btn-sec btn-sm" data-act="academy-verify" data-id="${esc(t.id)}">Verificar terreno</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`;}
function academyAssignForm(defaults={}){const p=DB.projects[0]||{};openModal('Asignar capacitación obligatoria',`<form data-form="academy-assign"><div class="form-grid">${F('an','Nombre completo *',`<input name="nombre" required>`)}${F('ac','Cargo / rol en obra *',`<input name="cargo" required placeholder="Ej: enfierrador, concretero, capataz">`)}${F('ae','Empresa / cuadrilla',`<input name="empresa">`)}${F('ap','Proyecto *',`<select name="projectId" required>${projOpts(p.id,'Seleccione proyecto')}</select>`)}${F('af','Vivienda / elemento *',`<input name="elemento" required value="${esc(defaults.elemento||'')}" placeholder="Ej: radier viviendas futuras">`)}${F('am','Manual *',`<select name="manualId" required>${academyManualOptions(defaults.manualId||'m02')}</select>`)}${F('ancr','NCR de origen',`<select name="ncrId"><option value="">Sin NCR</option>${DB.records.filter(r=>r.tipo==='NCR').map(r=>`<option value="${esc(r.uid)}">${esc(r.code)} · ${esc(r.titulo)}</option>`).join('')}</select>`)}${F('atr','Tipo de destinatario',`<select name="destinatarioTipo"><option>Ejecutor involucrado</option><option>Trabajador futuro de la partida</option><option>Supervisor</option><option>Otro</option></select>`)}${F('ares','Responsable de capacitación',`<input name="responsable" value="${esc(CURRENT_ROLE)}" required>`,'full')}</div><div class="notice">La evaluación es teórica. Para trabajos críticos se requiere además la instrucción práctica y la habilitación que corresponda.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar asignación</button></div></form>`);}
const ACADEMY_FIRST_Q={
 m01:{q:'En la recepción del hormigón, ¿qué se hace si la entrega no coincide con la especificación del proyecto?',a:['Se acepta para no retrasar la obra','Se registra la discrepancia y se consulta al responsable antes de continuar','Se agrega agua hasta lograr la consistencia deseada'],c:1},
 m02:{q:'Antes del vaciado, ¿qué control es clave para evitar nidos de piedra?',a:['Confirmar acceso y operación del vibrador y planificar el vibrado','Vibrar solo la superficie al final','Usar el vibrador para desplazar el hormigón lateralmente'],c:0},
 m03:{q:'Si una armadura no coincide con el plano estructural, ¿qué corresponde?',a:['Cortarla para facilitar el hormigonado','Cambiar el diámetro por uno disponible','Detener y solicitar revisión/autorización del responsable competente'],c:2},
 m04:{q:'¿Cuándo debe resolverse una observación del moldaje?',a:['Antes de autorizar el vaciado','Después de retirar el moldaje','Solo si ocurre una filtración'],c:0},
 m05:{q:'¿Qué hacer si se observa inestabilidad en una excavación?',a:['Ingresar rápidamente','Detener el ingreso, asegurar el área y avisar al responsable','Continuar si el trabajo demora poco'],c:1},
 m06:{q:'Antes de aplicar mortero de reparación, ¿qué es esencial?',a:['Cubrir el defecto sin retirar material suelto','Usar cualquier mortero disponible','Evaluar el daño y seguir el procedimiento/producto aprobado'],c:2},
 m07:{q:'¿Cómo se define el curado del hormigón?',a:['Según EETT y procedimiento aprobado','Solo según el clima del día','Cuando la superficie parece seca'],c:0},
 m08:{q:'¿Qué debe contener una NCR útil?',a:['Solo la opinión del responsable','Hechos, ubicación, requisito, evidencia y acciones trazables','Únicamente una fotografía sin descripción'],c:1},
 m09:{q:'¿Qué debe hacerse al identificar un riesgo grave e inminente?',a:['Continuar usando más EPP','Esperar al fin del turno','Detener/asegurar la tarea y comunicar según procedimiento'],c:2},
 m10:{q:'Antes de ajustar o cambiar accesorios de una herramienta eléctrica, ¿qué corresponde?',a:['Desconectar/aislar la energía según fabricante','Retirar la guarda para trabajar mejor','Sujetar el gatillo para evitar pérdida de tiempo'],c:0},
 m11:{q:'Antes de intervenir un vibrador o equipo eléctrico de hormigonado, ¿qué corresponde?',a:['Enjuagarlo conectado','Desconectarlo y seguir el procedimiento del fabricante','Tirar del cable para moverlo'],c:1},
 m12:{q:'Ante un borde sin protección o una carga suspendida en zona de paso, ¿qué corresponde?',a:['Pasar rápidamente','Continuar si se usa casco','No exponerse, delimitar/avisar y aplicar el control establecido'],c:2}
};
function academyQuiz(id){const t=DB.trainings.find(x=>x.id===id);if(!t)return notFound('Asignación no encontrada');const m=ACADEMY_MANUALS.find(x=>x.id===t.manualId);const first=ACADEMY_FIRST_Q[t.manualId]||ACADEMY_FIRST_Q.m09;const qs=[[first.q,first.a,first.c],['Antes de ejecutar una tarea, ¿qué corresponde hacer?',['Comenzar para ahorrar tiempo','Revisar procedimiento, riesgos, equipos y controles','Preguntar solo al terminar'],1],['Si se detecta una condición insegura o discrepancia importante, ¿qué debe hacerse?',['Continuar con cuidado','Ocultarla si parece menor','Detener/asegurar el área y avisar al responsable según procedimiento'],2],['¿Qué evidencia ayuda a demostrar que se realizó un control?',['Registro verificable y trazable','Comentario verbal sin fecha','Ninguna si el trabajo se ve bien'],0],['¿Aprobar este cuestionario certifica por sí solo competencia práctica?',['Sí, para cualquier equipo','Solo si se responde rápido','No; puede requerirse instrucción y evaluación práctica'],2]];return `<div class="page-head"><div><div class="section-kicker">EVALUACIÓN TEÓRICA</div><h2>${esc(m?.titulo||'Capacitación')}</h2><p class="muted">${esc(t.nombre)} · ${esc(t.cargo)} · Aprobación interna propuesta: 80%</p></div><a class="btn btn-sec" href="#/academy/asignaciones">Volver</a></div><div class="notice">Este cuestionario es una evaluación interna de conocimiento general. Debe complementarse con el manual específico y, cuando corresponda, evaluación práctica.</div><form data-form="academy-quiz" data-id="${esc(t.id)}">${qs.map((q,i)=>`<div class="card quiz-question"><h3>${i+1}. ${esc(q[0])}</h3>${q[1].map((a,j)=>`<label class="quiz-option"><input type="radio" name="q${i}" value="${j}" required><span>${esc(a)}</span></label>`).join('')}</div>`).join('')}<button class="btn" type="submit">Enviar evaluación</button></form>`;}

const ACTIONS = {
  'demo-login': () => enterDemoMode(),
  'logout':()=>{confirmDlg('¿Desea cerrar la sesión actual?',logout,'Cerrar sesión');},
  'ux-guide-hide':()=>{const g=document.querySelector('.ux-guide');if(g)g.remove();},
  'user-new':()=>userCreateForm(),
  'workers-seed':()=>createBaseWorkers(),
  'crew-new':()=>crewForm(),
  'crew-delete':d=>{if(!isCrewManager())return toast('Solo administración y jefaturas pueden gestionar cuadrillas.','err');const c=CREWS.find(x=>x.id===d.id);if(!c)return;confirmDlg('¿Eliminar la cuadrilla '+c.nombre+'?',()=>{CREWS=CREWS.filter(x=>x.id!==c.id);saveCrews();render();toast('Cuadrilla eliminada.','ok');});},
  'user-reset-pin':d=>userResetPinForm(d.id),
  'user-toggle':d=>{if(!canManageUsers())return toast('Solo el Administrador puede modificar usuarios.','err');const u=AUTH_USERS.find(x=>x.id===d.id);if(!u)return;if(u.rol==='Administrador'&&u.activo!==false&&AUTH_USERS.filter(x=>x.rol==='Administrador'&&x.activo!==false).length<=1)return toast('Debe quedar al menos un administrador activo.','err');u.activo=u.activo===false;saveUsers();toast(u.activo?'Cuenta activada.':'Cuenta desactivada.','ok');render();},
  'integration-del': d => { if(!preventCanManage())return toast('Acceso restringido.','err'); confirmDlg('¿Quitar este vínculo de trazabilidad?',()=>{DB.integrationLinks=(DB.integrationLinks||[]).filter(x=>x.id!==d.id);save();toast('Vínculo eliminado; los registros originales se mantienen.','ok');render();},'Quitar vínculo'); },
  'prevent-new-hold':()=>{if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');preventHoldForm();},
  'prevent-resolve-hold':d=>{if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');preventResolveHoldForm(d.id);},
  'prevent-new-tool':()=>{if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');preventToolForm();},
  'prevent-new-inventory':()=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventInventoryForm();},
  'prevent-new-movement':()=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventInventoryMoveForm();},
  'prevent-inventory-move':d=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventInventoryMoveForm(d.id);},
  'prevent-inventory-status':d=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventInventoryStatusForm(d.id);},
  'prevent-new-risk':()=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventRiskForm();},
  'prevent-risk-edit':d=>{if(!preventCanManage())return toast('Acceso restringido.','err');preventRiskForm(d.id);},
  'prevent-new-talk':()=>{if(!preventCanManage())return toast('Solo Administración, Supervisión, Jefatura o Gerencia puede registrar charlas.','err');preventTalkForm();},
  'prevent-sign-talk':d=>preventTalkAttendanceForm(d.id),
  'prevent-talk-attendance':d=>{if(!preventCanManage())return toast('Acceso restringido.','err');const t=DB.toolboxTalks.find(x=>x.id===d.id);if(!t)return;openModal('Control de asistencia · '+esc(t.tarea),`<p><b>Estado:</b> ${t.asistenciaAbierta===false?'Cerrada':'Abierta'} · <b>Firmas:</b> ${(t.firmas||[]).length}</p><p><b>Ubicación de la charla:</b> ${t.ubicacionCharla?`${t.ubicacionCharla.lat}, ${t.ubicacionCharla.lon} (precisión aprox. ${t.ubicacionCharla.precisionM} m)`:'No capturada; validar la presencia visualmente.'}</p><div class="table-wrap"><table><thead><tr><th>Trabajador</th><th>Fecha y hora</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>${(t.firmas||[]).map((f,i)=>`<tr><td>${esc(f.nombre)}<div class="muted small">${esc(f.usuario)}</div><div class="small">Firma: ${esc(f.firma)}</div></td><td>${esc(new Date(f.fechaHora).toLocaleString())}</td><td>${f.ubicacion?`${f.ubicacion.lat}, ${f.ubicacion.lon}<div class="muted small">Precisión aprox. ${f.ubicacion.precisionM} m</div>${t.ubicacionCharla?`<div class="small">Distancia estimada al lugar: ${geoDistanceM(t.ubicacionCharla,f.ubicacion)} m</div>`:''}`:'No disponible'}</td><td><span class="badge ${f.estado==='Validada por jefatura'?'b-grn':'b-yel'}">${esc(f.estado)}</span>${f.estado!=='Validada por jefatura'?`<button class="btn btn-sec btn-sm" data-act="prevent-talk-validate" data-id="${esc(t.id)}" data-index="${i}">Validar presencialmente</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">Aún no hay firmas.</td></tr>'}</tbody></table></div><div class="modal-foot"><button class="btn btn-sec" data-act="close">Cerrar</button></div>`);},
  'prevent-talk-validate':d=>{if(!preventCanManage())return toast('Solo jefatura o supervisión puede validar firmas.','err');const t=DB.toolboxTalks.find(x=>x.id===d.id),f=t?.firmas?.[Number(d.index)];if(!f)return;confirmDlg('¿Confirmas que verificaste la identidad y presencia física de '+f.nombre+'?',()=>{f.estado='Validada por jefatura';f.validadaPor=CURRENT_USER.nombre;f.validadaEn=new Date().toISOString();save();closeModal();toast('Asistencia validada tras revisión presencial.','ok');render();},'Validar presencia');},
  'prevent-talk-close':d=>{if(!preventCanManage())return toast('No tiene permiso para cerrar asistencia.','err');const t=DB.toolboxTalks.find(x=>x.id===d.id);if(!t)return;confirmDlg('¿Cerrar las firmas de esta charla? Los trabajadores ya no podrán firmar.',()=>{t.asistenciaAbierta=false;t.cerradaEn=new Date().toISOString();t.cerradaPor=CURRENT_USER.nombre;save();render();toast('Firmas cerradas. Revisa y valida las asistencias pendientes.','ok');},'Cerrar firmas');},
  'prevent-new-followup':()=>{if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');preventFollowupForm();},
  'prevent-followup-result':d=>{if(CURRENT_ROLE==='Consulta')return toast('Perfil Consulta: solo lectura.','err');preventFollowupResultForm(d.id);},
  'academy-new': () => academyAssignForm(),
  'academy-assign-manual': d => academyAssignForm({manualId:d.id}),
  'academy-confirm-recurrence': d => { if(CURRENT_ROLE==='Consulta') return toast('Perfil Consulta: solo lectura.','err'); const key=decodeURIComponent(d.key); const g=recurrenceGroups().find(x=>x.key===key); if(!g) return toast('El grupo ya no está disponible.','err'); openModal('Confirmar reincidencia',`<form data-form="academy-confirm" data-key="${esc(encodeURIComponent(key))}"><p>Confirme que estas NCR representan el mismo problema en el mismo elemento constructivo. La confirmación activará la capacitación obligatoria.</p><div class="form-grid">${F('cm','Manual preventivo sugerido',`<select name="manualId">${academyManualOptions(g.especialidad==='Hormigón'?'m02':'m09')}</select>`)}${F('ca','Confirmado por *',`<input name="actor" required value="${esc(CURRENT_ROLE)}">`)}${F('cn','Observación de revisión',`<textarea name="nota"></textarea>`,'full')}</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn btn-danger" type="submit">Confirmar y activar</button></div></form>`); },
  'academy-assign-group': d => { const key=decodeURIComponent(d.key); const g=recurrenceGroups().find(x=>x.key===key); if(g) academyAssignForm({elemento:g.elemento,manualId:g.review?.manualId||'m02'}); },
  'academy-verify': d => { if(CURRENT_ROLE==='Consulta') return toast('Perfil Consulta: solo lectura.','err'); const t=DB.trainings.find(x=>x.id===d.id); if(!t)return; openModal('Verificación práctica en terreno',`<form data-form="academy-verify" data-id="${esc(t.id)}"><p>Registre una observación real de aplicación del procedimiento. Esta acción no equivale a una certificación externa.</p><div class="form-grid">${F('vn','Verificado por *',`<input name="verificadoPor" required value="${esc(CURRENT_ROLE)}">`)}${F('vf','Fecha *',`<input type="date" name="fechaVerificacion" required value="${hoy()}">`)}${F('vo','Resultado / observación *',`<textarea name="observacion" required placeholder="Indique qué se observó en terreno…"></textarea>`,'full')}</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar verificación</button></div></form>`); },
  'role-change': d => { CURRENT_ROLE=d.value||CURRENT_ROLE; try { localStorage.setItem('obracontrol_role',CURRENT_ROLE); } catch(e) {} toast('Perfil cambiado a '+CURRENT_ROLE+'.','ok'); render(); },
  close: closeModal,
  'confirm-yes': () => { const cb = confirmCb; confirmCb = null; closeModal(); cb && cb(); },
  'terrain-start': () => { const fid=$('#terrain-front')?.value; const p=DB.projects.find(x=>x.id==='1735-48-LR26'); const i={id:uid(),projectId:p.id,frenteId:fid,fecha:hoy(),tipo:TIPO_INSP,sector:'Radier',responsable:'Supervisor Praxis',estado:'Pendiente',metodo:'',respuestas:{},riesgo:null,observaciones:'',resultado:'',atendida:false}; DB.inspections.push(i); save(); toast('Inspección de terreno preparada. Complete el checklist.', 'ok'); location.hash='#/inspecciones'; },
  'proj-new': () => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); projForm(); },
  'proj-edit': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); projForm(getProj(d.id)); },
  'proj-del': d => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede eliminar proyectos.','err'); confirmDlg('¿Eliminar el proyecto ' + d.id + ' y todos sus registros, inspecciones y evidencias?', () => {
    const ids = DB.records.filter(r => r.projectId === d.id).map(r => r.uid);
    DB.projects = DB.projects.filter(p => p.id !== d.id);
    DB.records = DB.records.filter(r => r.projectId !== d.id);
    DB.inspections = DB.inspections.filter(i => i.projectId !== d.id);
    DB.evidences = DB.evidences.filter(e => !ids.includes(e.recId));
    DB.lessons = DB.lessons.filter(l => !ids.includes(l.recId));
    save(); toast('Proyecto eliminado.', 'ok'); location.hash = '#/proyectos';
  }); },
  'frente-add': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); frenteForm(d.id); },
  'frente-del': d => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede quitar viviendas/frentes.','err'); confirmDlg('¿Quitar este frente de trabajo?', () => { const p = getProj(d.id); p.frentes = p.frentes.filter(f => f.id !== d.fid); DB.records.forEach(r => { if (r.projectId === d.id && r.frenteId === d.fid) r.frenteId = ''; }); save(); render(); }, 'Quitar'); },
  'rdi-new': () => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); rdiForm(); },
  'rec-new': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); recForm(null, d.id, d.tipo); },
  'rec-edit': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); recForm(getRec(d.id)); },
  'rec-del': d => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede eliminar registros.','err'); confirmDlg('¿Eliminar este registro con sus evidencias y lecciones?', () => {
    DB.records = DB.records.filter(r => r.uid !== d.id); DB.evidences = DB.evidences.filter(e => e.recId !== d.id); DB.lessons = DB.lessons.filter(l => l.recId !== d.id);
    save(); toast('Registro eliminado.', 'ok'); location.hash = '#/dhncr';
  }); },
  'rec-reopen': d => { if(!roleCanClose()) return toast('El perfil actual no puede reabrir registros.','err'); confirmDlg('¿Reabrir este registro? Volverá a “En corrección”.', () => { const r = getRec(d.id); r.fechaCierre = ''; setEstado(r, 'En corrección', 'Registro reabierto'); save(); toast('Registro reabierto.', 'ok'); render(); }, 'Reabrir'); },
  'innov-new': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); innovForm(d.id); },
  'innov-edit': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); innovForm(d.id); },
  'ev-new': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); evForm(d.id); },
  'qr-copy': async d => { const u=decodeURIComponent(d.url||''); try { await navigator.clipboard.writeText(u); toast('Enlace de la vivienda copiado.','ok'); } catch(e) { openModal('Enlace QR', `<p>Copie este enlace para compartir la ficha:</p><div class="block" style="word-break:break-all">${esc(u)}</div><div class="modal-foot"><button class="btn btn-sec" data-act="close">Cerrar</button></div>`, true); } },
  'qr-open': d => { const u=decodeURIComponent(d.url||''); if(u) window.open(u,'_blank'); },
  'ev-view': d => { const e=DB.evidences.find(x=>x.id===d.id); if(!e) return; const r=e.recId?getRec(e.recId):null; openModal('Evidencia · '+esc(r?r.code:'Registro'), `<div class="evidence-viewer">${e.img?`<img src="${e.img}" alt="${esc(e.descripcion)}">`:'<div class="ph">📎</div>'}<div class="kv">${kv('Registro',r?esc(r.code):'—')}${kv('Momento',esc(e.momento))}${kv('Tipo',esc(e.tipo))}${kv('Fecha',fmtFecha(e.fecha))}${kv('Descripción',esc(e.descripcion))}${kv('Archivo',esc(e.archivo||'—'))}</div></div><div class="modal-foot"><button class="btn btn-sec" data-act="close">Cerrar</button></div>`, true); },
  'ev-del': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); confirmDlg('¿Quitar esta evidencia?', () => { DB.evidences = DB.evidences.filter(e => e.id !== d.id); save(); render(); }, 'Quitar'); },
  'insp-new': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); inspForm(d.id); },
  'insp-sched': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); schedForm(d.id); },
  'insp-do': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); inspForm(null, DB.inspections.find(i => i.id === d.id)); },
  'insp-view': d => {
    const i=DB.inspections.find(x=>x.id===d.id); if(!i) return;
    const noItems=TODAS_CLAVES.filter(k=>getItemData(i,k).resultado==='no');
    const pending=noItems.filter(k=>!DB.records.some(r=>r.sourceInspectionId===i.id&&r.sourceItem===k));
    const p=getProj(i.projectId), fr=p&&(p.frentes||[]).find(f=>f.id===i.frenteId);
    openModal('Inspección · '+esc(i.sector), `<div class="kv">${kv('Proyecto',esc(i.projectId))}${kv('Vivienda / frente',esc(fr?fr.nombre:'Sin asignar'))}${kv('Fecha',fmtFecha(i.fecha))}${kv('Responsable',esc(i.responsable))}${kv('Método',esc(i.metodo))}</div>
    ${noItems.length?`<div class="card" style="margin:1rem 0;border-left:4px solid var(--red);background:#fff8f8"><div class="page-head" style="margin:0"><div><h3 style="margin:0">⚠️ Incumplimientos detectados</h3><div class="small muted">${noItems.length} ítem(s) marcado(s) como <b>No cumple</b>. ${pending.length?`<b>${pending.length}</b> pendiente(s) de generar.`:'Todos ya tienen NCR asociado.'}</div></div>${pending.length?`<button class="btn btn-danger" data-act="insp-create-all" data-id="${esc(i.id)}">⚡ Crear ${pending.length>1?'NCR automáticas':'NCR automática'}</button>`:''}</div></div>`:`<div class="card" style="margin:1rem 0"><div class="small">✅ No hay incumplimientos marcados como “No cumple”.</div></div>`}
    ${CHECKLIST.map(g=>`<h4 style="margin-top:.8rem">${g.g.toUpperCase()}</h4>${g.items.map(([k,t])=>{const d=getItemData(i,k),v=d.resultado,exists=DB.records.some(r=>r.sourceInspectionId===i.id&&r.sourceItem===k);return `<div class="chk-item chk-view"><div><b>${esc(t)}</b><div>${v==='si'?'✅ Sí':v==='no'?'❌ No':v==='na'?'⚪ N/A':'—'}</div></div><div>${d.observacion?`<div class="small"><b>Observación:</b> ${esc(d.observacion)}</div>`:''}${d.fotografias&&d.fotografias.length?`<div class="photo-grid">${d.fotografias.map(x=>`<img src="${x.data||x.img}" alt="${esc(x.nombre||'Fotografía')}">`).join('')}</div>`:''}${v==='no'?`<div class="no-print" style="margin-top:.5rem">${exists?'<span class="badge b-red">NCR ya creado</span>':`<button class="btn btn-danger btn-sm" data-act="insp-create-record" data-id="${esc(i.id)}" data-item="${esc(k)}">+ Crear NCR de este incumplimiento</button>`}</div>`:''}</div></div>`;}).join('')}`).join('')}
    ${i.observaciones?blockTxt('Observaciones generales',i.observaciones):''}<div class="modal-foot"><button class="btn btn-sec" data-act="close">Cerrar</button></div>`,true);
  },
  'insp-create-all': d => {
    const i=DB.inspections.find(x=>x.id===d.id); if(!i) return;
    const keys=TODAS_CLAVES.filter(k=>getItemData(i,k).resultado==='no'&&!DB.records.some(r=>r.sourceInspectionId===i.id&&r.sourceItem===k));
    if(!keys.length) return toast('No hay incumplimientos pendientes para generar NCR.','ok');
    keys.forEach(k=>createNcrFromChecklist(i,k)); save(); closeModal(); toast(keys.length+' NCR '+(keys.length===1?'creada':'creadas')+' automáticamente desde el checklist.','ok'); location.hash='#/dhncr';
  },
  'insp-create-record': d => {
    const i=DB.inspections.find(x=>x.id===d.id); if(!i) return; const item=getItemData(i,d.item);
    if(item.resultado!=='no') return toast('Solo se puede crear un registro desde un ítem marcado como No cumple.','err');
    if(DB.records.some(r=>r.sourceInspectionId===i.id&&r.sourceItem===d.item)) return toast('Este incumplimiento ya tiene un NCR asociado.','err');
    const r=createNcrFromChecklist(i,d.item); save(); toast(r.code+' creado desde el checklist.','ok'); location.hash='#/registro/'+enc(r.uid);
  },
  'insp-ok': d => { DB.inspections.find(i => i.id === d.id).atendida = true; save(); toast('Alerta marcada como atendida.', 'ok'); render(); },
  'insp-del': d => confirmDlg('¿Eliminar esta inspección?', () => { DB.inspections = DB.inspections.filter(i => i.id !== d.id); save(); render(); }),
  'lesson-new': d => { if(CURRENT_ROLE==='Consulta') return toast('El perfil Consulta es de solo lectura.','err'); lessonForm(d.id); },
  'lesson-del': d => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede eliminar lecciones.','err'); confirmDlg('¿Eliminar esta lección aprendida?', () => { DB.lessons = DB.lessons.filter(l => l.id !== d.id); save(); render(); }); },
  'rep-gen': () => { UI.f.rept = $('#rep-t').value; UI.f.repp = $('#rep-p').value; UI.f.repn = ($('#rep-ncr')||{}).value || UI.f.repn || ''; $('#rep-out').innerHTML = repHTML(UI.f.rept, UI.f.repp); },
  'rep-print': () => { ACTIONS['rep-gen'](); window.print(); }
};

/* ============ v10 · AUTENTICACIÓN LOCAL Y USUARIOS ============ */
function loadUsers(){ try { const x=JSON.parse(localStorage.getItem(USER_KEY)||'[]'); AUTH_USERS=Array.isArray(x)?x:[]; } catch(e){ AUTH_USERS=[]; } }
function loadCrews(){ try { const x=JSON.parse(localStorage.getItem(CREW_KEY)||'[]'); CREWS=Array.isArray(x)?x:[]; } catch(e){ CREWS=[]; } }
function saveCrews(){ try { localStorage.setItem(CREW_KEY,JSON.stringify(CREWS)); return true; } catch(e) { toast('No se pudieron guardar las cuadrillas en este navegador.','err'); return false; } }
function saveUsers(){ try { localStorage.setItem(USER_KEY,JSON.stringify(AUTH_USERS)); return true; } catch(e){ toast('No se pudieron guardar los usuarios en este navegador.','err'); return false; } }

// Modo de demostración sin límite funcional: datos editables y locales, sin cuenta externa.
function ensureDemoWorkspace(){
  let changedUsers=false, changedCrews=false;
  if(!AUTH_USERS.some(u=>u.usuario==='demo.praxis')){
    const salt='OBRA-CONTROL-DEMO-SALT-2026';
    AUTH_USERS.unshift({id:'demo-admin-praxis',nombre:'Administrador de demostración',usuario:'demo.praxis',rol:'Administrador',salt,pinHash:'local:'+fallbackHash(salt+':1234'),activo:true,creado:hoy(),creadoPor:'Sistema demo',esDemo:true});
    changedUsers=true;
  }
  const demoWorkers=[
    ['demo-worker-01','Camila Rojas','trabajador01'],
    ['demo-worker-02','Matías Fuentes','trabajador02'],
    ['demo-worker-03','Valentina Soto','trabajador03'],
    ['demo-worker-04','Diego Contreras','trabajador04'],
    ['demo-worker-05','Antonia Morales','trabajador05']
  ];
  const workerIds=[];
  for(const [id,nombre,usuario] of demoWorkers){
    let u=AUTH_USERS.find(x=>x.id===id)||AUTH_USERS.find(x=>x.usuario===usuario);
    if(!u){const salt='DEMO-'+id+'-SALT';u={id,nombre,usuario,rol:'Trabajador de obra',salt,pinHash:'local:'+fallbackHash(salt+':1234'),activo:true,creado:hoy(),creadoPor:'Sistema demo',esDemo:true};AUTH_USERS.push(u);changedUsers=true;}
    workerIds.push(u.id);
  }
  if(!CREWS.some(c=>c.id==='demo-crew-hormigonado')){
    CREWS.push({id:'demo-crew-hormigonado',nombre:'Cuadrilla piloto · Hormigonado',responsable:'Matías Fuentes · Jefe de cuadrilla (demo)',miembros:workerIds,creada:hoy(),esDemo:true,observacion:'Cuadrilla ficticia para explorar asignaciones, inspecciones y seguimiento.'});
    changedCrews=true;
  } else {
    const crew=CREWS.find(c=>c.id==='demo-crew-hormigonado');
    if(crew && (!crew.miembros || crew.miembros.length<5)){crew.miembros=workerIds;changedCrews=true;}
  }
  const staffUsers=[
    ['staff-joaquin','joaquin','joaquin','Gerente de proyecto'],
    ['staff-cristobal','cristobal','cristobal','Jefe de oficina técnica'],
    ['staff-marcelo','marcelo','marcelo','Encargado de Calidad'],
    ['staff-juan-jara','Juan Jara','juan.jara','Jefe de terreno'],
    ['staff-juan-sala','Juan Sala','juan.sala','Administrador']
  ];
  for(const [id,nombre,usuario,rol] of staffUsers){
    let u=AUTH_USERS.find(x=>x.id===id)||AUTH_USERS.find(x=>x.usuario===usuario);
    if(!u){
      const salt='OBRA-CONTROL-V14-'+id+'-SALT';
      u={id,nombre,usuario,rol,salt,pinHash:'local:'+fallbackHash(salt+':1234'),activo:true,creado:hoy(),creadoPor:'Sistema · equipo inicial',esDemo:false};
      AUTH_USERS.push(u); changedUsers=true;
    }else{
      u.nombre=nombre;u.usuario=usuario;u.rol=rol;u.activo=true;
      if(!u.salt || !u.pinHash){const salt='OBRA-CONTROL-V14-'+id+'-SALT';u.salt=salt;u.pinHash='local:'+fallbackHash(salt+':1234');changedUsers=true;}
    }
  }
  if(changedUsers)saveUsers(); if(changedCrews)saveCrews();
}
function enterDemoMode(){
  // Entrada directa compatible con toque móvil y apertura local (file://).
  try { ensureDemoWorkspace(); } catch (err) { console.error('Preparación demo:', err); }
  let user=AUTH_USERS.find(u=>u.usuario==='demo.praxis'&&u.activo!==false);
  if(!user){ensureDemoWorkspace();user=AUTH_USERS.find(u=>u.usuario==='demo.praxis');}
  if(!user)return authScreen('No se pudo preparar el acceso de demostración.');
  CURRENT_USER=user; CURRENT_ROLE=legacyRole(user.rol);
  try{sessionStorage.setItem(SESSION_KEY,user.id);}catch(e){}
  document.body.classList.remove('auth-locked');
  const top=$('#topbar-user');if(top)top.textContent='Modo demostración · datos locales';
  const n=$('#nav-users');if(n)n.hidden=false;const np=$('#nav-prevent');if(np)np.hidden=false;const ns=$('#nav-talk-sign');if(ns)ns.hidden=true;const nc=$('#nav-crews');if(nc)nc.hidden=false;
  toast('Modo demostración activo: puedes explorar y editar todos los módulos.','ok');
  location.hash='#/dashboard';render();
}
function legacyRole(role){ return ({'Administrador':'Administrador Praxis','Supervisor':'Supervisor / ITO','Encargado de Calidad':'Encargado de Calidad','Jefe de obra':'Jefe de Obra','Jefe de terreno':'Jefe de Obra','Jefe de oficina técnica':'Jefe de oficina técnica','Gerente de obra':'Gerente de Obra','Gerente de proyecto':'Gerente de Proyecto','Trabajador de obra':'Trabajador de obra','Trabajador común':'Trabajador común','Consulta':'Consulta'})[role]||'Trabajador de obra'; }
function canManageUsers(){ return ['Administrador','Gerente de proyecto','Jefe de oficina técnica'].includes(CURRENT_USER?.rol); }
function randomSalt(){ return uid()+Math.random().toString(36).slice(2,10); }
function fallbackHash(s){ let h1=2166136261; for(let i=0;i<s.length;i++){h1^=s.charCodeAt(i);h1=Math.imul(h1,16777619);} return (h1>>>0).toString(16).padStart(8,'0'); }
async function pinHash(pin,salt,forceAlgo){
  const source=salt+':'+pin;
  if(forceAlgo==='local') return 'local:'+fallbackHash(source);
  if(forceAlgo==='sha256') { if(!window.crypto?.subtle) return 'local:'+fallbackHash(source); const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)); return 'sha256:'+Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
  if(window.crypto&&window.crypto.subtle){ const bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)); return 'sha256:'+Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
  return 'local:'+fallbackHash(source);
}
async function verifyPin(user,pin){ const algo=(user.pinHash||'').split(':')[0]; const hash=await pinHash(pin,user.salt,algo==='sha256'?'sha256':'local'); return hash===user.pinHash; }
function authScreen(error=''){
  AUTH_ERROR=error; document.body.classList.add('auth-locked');
  const screen=$('#auth-screen'); if(!screen)return;
  const first=!AUTH_USERS.length;
  screen.innerHTML=`<div class="auth-layout"><section class="auth-brand-panel"><div><div class="auth-mark"><div class="auth-mark-logo">OC</div><div><strong>OBRA CONTROL</strong><span>PRAXIS EDIFICACIONES</span></div></div><h1>Control de obra.<br><span>Información clara.</span></h1><p>Plataforma para registrar, revisar y dar seguimiento a la información de obra.</p></div><div class="auth-feature-list"><div><b>✓</b><span>Control de calidad y seguimiento DH / NCR</span></div><div><b>✓</b><span>PRAXIS ACADEMY · manuales y evaluaciones</span></div><div><b>✓</b><span>Inspecciones, evidencias y seguimiento de obra</span></div><div><b>✓</b><span>Acceso según el perfil de cada usuario</span></div></div><div style="font-size:.75rem;color:#b9c9d9">OBRA CONTROL · acceso v14</div></section><section class="auth-form-panel">${first?`<span class="auth-setup-chip">CONFIGURACIÓN INICIAL</span><h2>Crear administrador principal</h2><p class="muted">No existen usuarios registrados. Cree la primera cuenta administradora para comenzar.</p>`:`<h2>Iniciar sesión</h2><p class="muted">Ingrese su nombre de usuario y contraseña numérica.</p>`}${AUTH_ERROR?`<div class="auth-error" role="alert">${esc(AUTH_ERROR)}</div>`:''}${first?`<form data-form="auth-setup"><div><label for="setup-name">Nombre completo</label><input id="setup-name" name="nombre" required maxlength="90" autocomplete="name" placeholder="Nombre y apellido"></div><div><label for="setup-user">Nombre de usuario</label><input id="setup-user" name="usuario" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]{3,30}" autocomplete="username" placeholder="Ej. admin.praxis"></div><div><label for="setup-pin">Contraseña numérica (4 a 8 dígitos)</label><input id="setup-pin" name="pin" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="••••••"></div><div><label for="setup-pin2">Confirmar contraseña numérica</label><input id="setup-pin2" name="pin2" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Repita la contraseña"></div><button class="btn" type="submit">Crear administrador y entrar</button></form>`:`<form data-form="auth-login"><div><label for="login-user">Nombre de usuario</label><input id="login-user" name="usuario" required autocomplete="username" maxlength="30" placeholder="Su usuario"></div><div><label for="login-pin">Contraseña numérica</label><input id="login-pin" name="pin" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="current-password" placeholder="PIN de 4 a 8 dígitos"></div><button class="btn" type="submit">Entrar a OBRA CONTROL</button></form><div class="auth-footnote">¿No tiene cuenta o olvidó su PIN? Solicite al administrador de esta instalación que cree su usuario o restablezca su contraseña.</div>`}<div class="demo-access-panel"><div><b>¿Solo quieres explorar la aplicación?</b><p>Entra con un clic al modo demostración, con acceso a todos los módulos y datos de ejemplo editables.</p></div><button type="button" id="btn-demo-entry" class="btn demo-entry-button" data-act="demo-login" onclick="enterDemoMode()">Entrar en modo demostración</button><div class="muted small">Acceso local sin límite funcional. Los cambios quedan en este navegador.</div></div><section class="auth-cloud-panel"><h3>☁ Acceso en la nube</h3><p class="muted small">Inicia sesión con tu cuenta de Supabase para sincronizar los datos de esta cuenta entre dispositivos.</p><form data-form="cloud-login"><div><label for="cloud-email">Correo electrónico</label><input id="cloud-email" name="email" type="email" required autocomplete="username" placeholder="usuario@empresa.cl"></div><div><label for="cloud-password">Contraseña</label><input id="cloud-password" name="password" type="password" required autocomplete="current-password" placeholder="Contraseña de Supabase"></div><button class="btn" type="submit">Conectar y sincronizar</button></form><div class="muted small">La cuenta debe existir en Supabase Auth y tener un perfil activo en OBRA CONTROL.</div></section><div class="auth-footnote">El acceso local/demo se conserva para explorar la interfaz. El acceso en la nube usa Supabase Auth; los datos sincronizados se guardan con políticas RLS por cuenta.</div></section></div>`;
}

function scheduleCloudSave(){
  if(!CLOUD_USER || !CLOUD_SYNC_READY || !window.OBRA_CLOUD) return;
  clearTimeout(CLOUD_SAVE_TIMER);
  CLOUD_SAVE_TIMER=setTimeout(async()=>{
    try{
      await window.OBRA_CLOUD.put('main',DB);
      CLOUD_LAST_ERROR='';
      const top=$('#topbar-user');
      if(top && CURRENT_USER?.cloud) top.textContent=`${CURRENT_USER.nombre} · ${CURRENT_USER.rol} · ☁ Sincronizado`;
    }catch(err){
      console.error('Supabase sync:',err);
      if(CLOUD_LAST_ERROR!=='main'){
        CLOUD_LAST_ERROR='main';
        toast('No se pudo sincronizar con Supabase. Los cambios siguen guardados localmente.','err');
      }
    }
  },650);
}
function cloudRole(role){
  return ({
    administrador:'Administrador',
    supervisor:'Supervisor',
    jefe_obra:'Jefe de obra',
    gerente_proyecto:'Gerente de proyecto',
    gerente_obra:'Gerente de obra',
    calidad_iso:'Encargado de Calidad',
    trabajador_obra:'Trabajador de obra',
    trabajador_comun:'Trabajador común',
    trabajador:'Trabajador común'
  })[role]||'Trabajador común';
}
async function startCloudLogin(fd){
  const email=String(fd.get('email')||'').trim();
  const password=String(fd.get('password')||'');
  if(!email || !password) return authScreen('Escribe el correo y la contraseña de Supabase.');
  try{
    const authUser=await window.OBRA_CLOUD.signIn(email,password);
    await enterCloudUser(authUser,true);
  }catch(err){
    console.error('Cloud login:',err);
    authScreen(err?.message==='Invalid login credentials'
      ? 'El correo o la contraseña de Supabase no son correctos.'
      : `No se pudo iniciar sesión en la nube: ${err?.message||'revisa la conexión e inténtalo de nuevo'}`);
  }
}
async function enterCloudUser(authUser,restoreState){
  if(!authUser?.id) throw new Error('No se recibió una sesión válida de Supabase.');
  const profile=await window.OBRA_CLOUD.getProfile(authUser.id);
  if(!profile) throw new Error('La cuenta autenticó, pero no tiene un perfil de OBRA CONTROL.');
  if(profile.active===false) throw new Error('La cuenta está desactivada. Contacta al administrador.');
  const user={
    id:profile.id,nombre:profile.full_name||authUser.email||'Usuario',
    usuario:profile.username||authUser.email||'usuario',
    rol:cloudRole(profile.role),activo:true,cloud:true
  };
  CLOUD_USER=user;
  CLOUD_SYNC_READY=false;
  if(restoreState){
    const remote=await window.OBRA_CLOUD.get('main');
    if(remote && Array.isArray(remote.projects) && Array.isArray(remote.records)){
      DB=remote;
      try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){}
      CLOUD_SYNC_READY=true;
    }else{
      // First cloud login for this account: seed only this account's private state.
      CLOUD_SYNC_READY=true;
      await window.OBRA_CLOUD.put('main',DB);
    }
  }else{
    CLOUD_SYNC_READY=true;
  }
  setLoggedIn(user);
  const top=$('#topbar-user');
  if(top) top.textContent=`${user.nombre} · ${user.rol} · ☁ Supabase`;
  toast('Sesión de Supabase activa. La información de esta cuenta se sincroniza en la nube.','ok');
}
async function restoreCloudSession(){
  try{
    const session=await window.OBRA_CLOUD.getSession();
    if(session?.user){ await enterCloudUser(session.user,true); return true; }
  }catch(err){
    console.warn('No se pudo restaurar la sesión cloud:',err);
  }
  return false;
}
function setLoggedIn(user){ CURRENT_USER=user; CURRENT_ROLE=legacyRole(user.rol); try{sessionStorage.setItem(SESSION_KEY,user.id);}catch(e){} document.body.classList.remove('auth-locked'); const n=$('#nav-users'); if(n)n.hidden=!['Administrador','Gerente de proyecto','Jefe de oficina técnica'].includes(user.rol); const np=$('#nav-prevent'); if(np)np.hidden=!preventCanManage(); const ns=$('#nav-talk-sign'); if(ns)ns.hidden=!['Trabajador de obra','Trabajador común'].includes(user.rol); const nc=$('#nav-crews'); if(nc)nc.hidden=!isCrewManager(); const top=$('#topbar-user'); if(top)top.textContent=`${user.nombre} · ${user.rol}${user.cloud?' · ☁ Supabase':''}`; const pf=$('#nav-prevent-folder'); if(pf && ['prevent','academy'].includes((location.hash.split('/')[1]||'')))pf.open=true; render(); }
async function logout(){ const wasCloud=!!CLOUD_USER; CLOUD_USER=null; CLOUD_SYNC_READY=false; clearTimeout(CLOUD_SAVE_TIMER); if(wasCloud){try{await window.OBRA_CLOUD.signOut()}catch(e){console.warn('Supabase sign out:',e)}} CURRENT_USER=null; try{sessionStorage.removeItem(SESSION_KEY);}catch(e){} location.hash='#/dashboard'; authScreen(''); }
function isCrewManager(){ return ['Administrador','Supervisor','Jefe de obra','Jefe de terreno','Jefe de oficina técnica','Encargado de Calidad','Gerente de obra','Gerente de proyecto'].includes(CURRENT_USER?.rol); }
function vCrews(){
 if(!isCrewManager()) return notFound('Acceso restringido: las cuadrillas las gestionan Administración y jefaturas.');
 const workers=AUTH_USERS.filter(u=>u.activo!==false && ['Trabajador de obra','Trabajador común'].includes(u.rol));
 return `<div class="page-head"><div><div class="section-kicker">ORGANIZACIÓN DE TERRENO</div><h2>👷 Cuadrillas de obra</h2><p class="muted">Agrupe trabajadores registrados en equipos de trabajo. Los miembros deben tener una cuenta activa con categoría Trabajador de obra.</p></div><button class="btn" data-act="crew-new">+ Crear cuadrilla</button></div><div class="grid stats">${stat('Cuadrillas',CREWS.length)}${stat('Trabajadores activos',workers.length,'grn')}${stat('Trabajadores asignados',new Set(CREWS.flatMap(c=>c.miembros||[])).size)}</div>${workers.length===0?'<div class="notice">Todavía no hay trabajadores. En Gestión de usuarios puede crear 20 cuentas base o registrar trabajadores individualmente.</div>':''}<div class="grid two">${CREWS.map(c=>`<div class="card"><div class="page-head"><div><h3 style="margin:0">${esc(c.nombre)}</h3><div class="muted small">Responsable: ${esc(c.responsable||'Sin asignar')}</div></div><button class="btn btn-danger btn-sm" data-act="crew-delete" data-id="${esc(c.id)}">Eliminar</button></div><div class="section-kicker">INTEGRANTES (${(c.miembros||[]).length})</div><ul>${(c.miembros||[]).map(id=>{const u=AUTH_USERS.find(x=>x.id===id);return u?`<li>${esc(u.nombre)} <span class="muted small">(@${esc(u.usuario)})</span></li>`:''}).join('')||'<li class="muted">Sin integrantes asignados.</li>'}</ul><div class="muted small">Creada: ${esc(c.creada||'—')}</div></div>`).join('')||'<div class="card empty">No hay cuadrillas registradas. Use “Crear cuadrilla” para organizar el equipo.</div>'}</div>`;
}
function crewForm(){
 if(!isCrewManager()) return toast('No tiene permiso para crear cuadrillas.','err');
 const workers=AUTH_USERS.filter(u=>u.activo!==false && ['Trabajador de obra','Trabajador común'].includes(u.rol));
 if(!workers.length) return toast('Primero registre trabajadores de obra desde Gestión de usuarios.','err');
 openModal('Crear cuadrilla',`<form data-form="crew-create"><div class="form-grid">${F('cn','Nombre de la cuadrilla *',`<input name="nombre" required maxlength="70" placeholder="Ej. Cuadrilla de hormigonado">`)}${F('cr','Responsable / jefe de cuadrilla',`<input name="responsable" maxlength="90" placeholder="Nombre del responsable">`,'full')}${F('cm','Integrantes *',`<select name="miembros" multiple required size="8">${workers.map(u=>`<option value="${esc(u.id)}">${esc(u.nombre)} · @${esc(u.usuario)}</option>`).join('')}</select><div class="muted small">En computador mantenga Ctrl/Cmd para seleccionar varios trabajadores.</div>`,'full')}</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button class="btn" type="submit">Guardar cuadrilla</button></div></form>`);
}
function createBaseWorkers(){
 if(!canManageUsers())return toast('Solo el Administrador puede crear las cuentas base.','err');
 const existing=new Set(AUTH_USERS.map(u=>u.usuario.toLowerCase()));
 const credentials=[];
 for(let i=1;i<=20;i++){
   const usuario='trabajador'+String(i).padStart(2,'0'); if(existing.has(usuario)) continue;
   const pin=String(4100+i), salt=randomSalt();
   AUTH_USERS.push({id:uid(),nombre:'Trabajador de obra '+String(i).padStart(2,'0'),usuario,rol:'Trabajador de obra',salt,pinHash:'',activo:true,creado:hoy(),creadoPor:CURRENT_USER.usuario});
   credentials.push({usuario,pin,salt,user:AUTH_USERS[AUTH_USERS.length-1]});
 }
 if(!credentials.length)return toast('Las 20 cuentas base ya existen. Puede restablecer sus PIN desde la tabla.','ok');
 Promise.all(credentials.map(async x=>{x.user.pinHash=await pinHash(x.pin,x.salt);})).then(()=>{
   if(!saveUsers())return;
   const rows=credentials.map(x=>`<tr><td>${esc(x.user.nombre)}</td><td><b>${esc(x.usuario)}</b></td><td><code>${esc(x.pin)}</code></td></tr>`).join('');
   openModal('Credenciales iniciales · trabajadores',`<div class="notice">Guarde esta tabla ahora. Por seguridad, los PIN no se almacenan en texto visible y no volverán a mostrarse después de cerrar esta ventana. Puede restablecerlos desde Gestión de usuarios.</div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>PIN inicial</th></tr></thead><tbody>${rows}</tbody></table></div><div class="modal-foot"><button class="btn btn-sec" data-act="close">Cerrar</button></div>`);
   render();
 });
}

function vUsers(){
 if(!canManageUsers()) return notFound('Acceso restringido: solo el Administrador puede gestionar usuarios.');
 return `<div class="page-head"><div><div class="section-kicker">ADMINISTRACIÓN DE ACCESOS</div><h2>👥 Gestión de usuarios</h2><p class="muted">Registre cuentas y asigne una categoría de trabajo.</p></div><div class="row wrap"><button class="btn btn-sec" data-act="workers-seed">Crear 20 trabajadores base</button><button class="btn" data-act="user-new">+ Registrar usuario</button></div></div><div class="notice">Los usuarios se guardan en este navegador. Para compartir cuentas de forma segura entre dispositivos se requiere autenticación y base de datos en servidor.</div><div class="grid stats">${stat('Usuarios registrados',AUTH_USERS.length)}${stat('Cuentas activas',AUTH_USERS.filter(u=>u.activo!==false).length,'grn')}${stat('Administradores',AUTH_USERS.filter(u=>u.rol==='Administrador'&&u.activo!==false).length)}</div><div class="card"><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Categoría</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>${AUTH_USERS.map(u=>`<tr><td><b>${esc(u.nombre)}</b></td><td>${esc(u.usuario)}</td><td><span class="user-role-chip">${esc(u.rol)}</span></td><td><span class="badge ${u.activo===false?'b-red':'b-grn'}">${u.activo===false?'Inactivo':'Activo'}</span></td><td>${esc(u.creado||'—')}</td><td><div class="row wrap"><button class="btn btn-sec btn-sm" data-act="user-reset-pin" data-id="${esc(u.id)}">Restablecer PIN</button>${u.id!==CURRENT_USER.id?`<button class="btn ${u.activo===false?'btn-sec':'btn-danger'} btn-sm" data-act="user-toggle" data-id="${esc(u.id)}">${u.activo===false?'Activar':'Desactivar'}</button>`:'<span class="muted small">Sesión actual</span>'}</div></td></tr>`).join('')}</tbody></table></div></div>`;
}
function userCreateForm(){
 if(!canManageUsers()) return toast('Solo el Administrador puede registrar usuarios.','err');
 openModal('Registrar nuevo usuario',`<form data-form="user-create"><div class="form-grid">${F('un','Nombre completo *',`<input name="nombre" required maxlength="90">`)}${F('uu','Nombre de usuario *',`<input name="usuario" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]{3,30}" placeholder="Sin espacios">`)}${F('ur','Categoría de trabajador *',`<select name="rol" required>${USER_ROLES.map(r=>`<option>${esc(r)}</option>`).join('')}</select>`)}${F('up','Contraseña numérica *',`<input name="pin" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8">`)}${F('up2','Confirmar contraseña *',`<input name="pin2" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8">`)}</div><div class="notice">El usuario podrá entrar con su nombre de usuario y PIN numérico. Comparta sus credenciales de forma privada.</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button type="submit" class="btn">Guardar usuario</button></div></form>`);
}
function userResetPinForm(id){ if(!canManageUsers())return toast('Solo el Administrador puede restablecer PIN.','err'); const u=AUTH_USERS.find(x=>x.id===id); if(!u)return; openModal('Restablecer PIN · '+esc(u.usuario),`<form data-form="user-reset-pin" data-id="${esc(u.id)}"><div class="form-grid">${F('rp','Nuevo PIN numérico *',`<input name="pin" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8">`)}${F('rp2','Confirmar nuevo PIN *',`<input name="pin2" type="password" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8">`)}</div><div class="modal-foot"><button type="button" class="btn btn-sec" data-act="close">Cancelar</button><button type="submit" class="btn">Actualizar PIN</button></div></form>`); }

/* ============ 8. ENRUTADOR Y ARRANQUE ============ */
const TITLES = { cuadrillas: 'Cuadrillas de obra', prevent: 'PRAXIS PREVENT', academy: 'PRAXIS ACADEMY', control: 'Centro de control', alertas: 'Centro de alertas', calendario: 'Calendario', presentacion: 'Modo presentación', praxis: 'Praxis Quality Hub', terreno: 'Modo Terreno', dashboard: 'Dashboard', proyectos: 'Proyectos', proyecto: 'Ficha de proyecto', frente: 'Frente de trabajo', inspecciones: 'Inspecciones', dhncr: 'DH / NCR', registro: 'Ficha DH / NCR', evidencias: 'Evidencias', indicadores: 'Indicadores', reportes: 'Reportes', usuarios: 'Gestión de usuarios' };
const NAVMAP = { prevent: 'prevent', academy: 'academy', control: 'control', alertas: 'alertas', calendario: 'calendario', presentacion: 'presentacion', proyecto: 'proyectos', frente: 'proyectos', registro: 'dhncr', terreno: 'terreno', praxis: 'dashboard' };

// Ayudas breves y operativas: explican qué hacer, en qué orden y qué revisar.

// Ayudas breves y operativas: explican qué hacer, en qué orden y qué revisar.
const UX_GUIDES = {
  praxis: ['Vista general de calidad', 'Consulta el estado de la obra, las viviendas y las no conformidades prioritarias.', ['Revisa los indicadores y las viviendas en atención o estado crítico.', 'Abre el proyecto o la vivienda que necesite seguimiento.', 'Registra o actualiza la acción correspondiente.'], 'Usa esta pantalla para orientarte; los cambios se realizan en la ficha de cada registro.'],
  control: ['Centro de control', 'Reúne los principales indicadores para decidir qué requiere atención primero.', ['Revisa los indicadores y alertas.', 'Prioriza los casos críticos o vencidos.', 'Abre el registro para asignar una acción y hacer seguimiento.'], 'Un indicador resume el estado; no sustituye la revisión del registro original.'],
  alertas: ['Qué hacer con las alertas', 'Aquí se muestran asuntos que requieren revisión o seguimiento.', ['Lee el motivo y el proyecto relacionado.', 'Abre el registro vinculado.', 'Actualiza el estado desde la ficha correspondiente cuando la acción esté realizada.'], 'No marques una alerta como resuelta sin comprobar la evidencia o el registro asociado.'],
  calendario: ['Cómo usar el calendario', 'Consulta fechas y actividades programadas para organizar el trabajo.', ['Selecciona la fecha o actividad.', 'Comprueba proyecto, responsable y estado.', 'Actualiza la programación desde la función correspondiente.'], 'Si una actividad cambia, actualiza también el registro de origen para mantener la información coherente.'],
  presentacion: ['Modo presentación', 'Vista resumida para revisar el estado general con otras personas.', ['Selecciona o revisa el proyecto mostrado.', 'Explica los indicadores y los casos destacados.', 'Abre las fichas de detalle si necesitas verificar un dato.'], 'Esta vista es principalmente informativa; realiza cambios desde el módulo correspondiente.'],
  terreno: ['Tu trabajo en terreno', 'Registra lo que observas en la obra y deja evidencia clara para el seguimiento.', ['Selecciona el proyecto o vivienda correcta.', 'Realiza la inspección o abre el registro que debes actualizar.', 'Describe el hallazgo con ubicación concreta y adjunta evidencia.', 'Guarda y comprueba que el registro aparezca en la lista.'], 'Registra hechos observables. Si existe un riesgo inmediato, informa al responsable de obra según el procedimiento vigente.'],
  dashboard: ['Resumen de la obra', 'Usa los indicadores para identificar dónde revisar primero.', ['Revisa los indicadores principales.', 'Identifica viviendas, inspecciones o NCR pendientes.', 'Entra al módulo correspondiente para ver el detalle.'], 'Los totales son un resumen; confirma la información en el registro original antes de tomar decisiones.'],
  proyectos: ['Administrar proyectos', 'Crea un proyecto o abre uno existente para gestionar sus frentes, viviendas y controles.', ['Usa “Nuevo proyecto” para registrar una obra.', 'Completa el ID y los datos básicos sin abreviaturas ambiguas.', 'Abre el proyecto para agregar frentes y consultar sus registros.'], 'Evita crear un segundo proyecto para la misma obra; primero busca por ID o nombre.'],
  inspecciones: ['Registrar y revisar inspecciones', 'Las inspecciones dejan constancia de controles realizados y de sus resultados.', ['Abre una inspección pendiente o selecciona “Nueva inspección”.', 'Identifica proyecto, vivienda o sector y responsable.', 'Responde cada punto según lo observado y registra comentarios claros.', 'Guarda; si hay incumplimientos, sigue el procedimiento de DH / NCR.'], 'No marques un control como conforme si no fue verificado en terreno.'],
  dhncr: ['Gestionar DH / NCR', 'Registra desviaciones o no conformidades y sigue su corrección hasta verificar el cierre.', ['Busca primero si el caso ya está registrado.', 'Crea DH o NCR con ubicación, descripción y responsable precisos.', 'Registra acción correctiva, responsable y fecha de compromiso.', 'Adjunta evidencia y solicita verificación antes de cerrar.'], 'Cerrar significa que la corrección fue verificada; no basta con indicar que el trabajo está terminado.'],
  evidencias: ['Consultar y adjuntar evidencias', 'Relaciona fotografías y documentos con el registro de obra al que pertenecen.', ['Busca el registro asociado.', 'Añade archivos con una descripción concreta.', 'Indica el momento o etapa que muestra la evidencia.', 'Abre el archivo para comprobar que se cargó correctamente.'], 'Evita subir archivos sin contexto; la descripción debe indicar qué se ve y dónde.'],
  academy: ['Capacitación y manuales', 'Consulta los manuales y completa las capacitaciones que te hayan asignado.', ['Abre el manual relacionado con tu trabajo.', 'Lee la secuencia, los puntos de control y las advertencias.', 'Completa la evaluación asignada y revisa su resultado.'], 'El material de apoyo no reemplaza planos, especificaciones, instrucciones aprobadas ni capacitación práctica.'],
  indicadores: ['Interpretar indicadores', 'Resume tendencias y resultados de calidad para orientar la supervisión.', ['Selecciona el proyecto que quieres analizar.', 'Revisa los indicadores y los periodos disponibles.', 'Abre los casos asociados para comprobar las causas.'], 'Un indicador aislado no explica la causa; verifica los registros antes de definir medidas.'],
  reportes: ['Generar un informe', 'Selecciona el tipo de informe y el alcance antes de imprimirlo o guardarlo.', ['Elige el tipo de informe.', 'Selecciona el proyecto o registro cuando corresponda.', 'Pulsa “Generar vista” y revisa los datos.', 'Usa “Imprimir / Guardar PDF” para exportarlo.'], 'Revisa fechas, proyecto y contenido antes de compartir el informe.'],
  usuarios: ['Gestionar usuarios', 'Crea cuentas individuales y asigna el perfil que corresponde a las funciones de cada persona.', ['Registra nombre, usuario y PIN.', 'Asigna el rol con el menor acceso necesario.', 'Entrega las credenciales en privado.', 'Si se olvida el PIN, restablécelo desde esta sección.'], 'No compartas una cuenta entre trabajadores. Los datos de esta versión se guardan en este navegador.'],
  cuadrillas: ['Crear y organizar cuadrillas', 'Agrupa a los trabajadores por equipo y asigna un responsable para coordinar el trabajo.', ['Crea la cuadrilla con un nombre identificable.', 'Selecciona responsable e integrantes.', 'Guarda y revisa la lista final antes de asignar tareas.'], 'Comprueba que cada integrante tenga su propia cuenta activa.']
};
function uxGuide(route){
  const g=UX_GUIDES[route]; if(!g) return '';
  return `<section class="ux-guide" aria-label="Instrucciones para esta sección"><div class="ux-guide-icon" aria-hidden="true">i</div><div class="ux-guide-main"><div class="ux-guide-kicker">GUÍA RÁPIDA · ${esc(TITLES[route]||route).toUpperCase()}</div><h2>${esc(g[0])}</h2><p>${esc(g[1])}</p><ol>${g[2].map(step=>`<li>${esc(step)}</li>`).join('')}</ol><div class="ux-guide-rule"><strong>Importante:</strong> ${esc(g[3])}</div></div><button type="button" class="ux-guide-close" aria-label="Ocultar guía" data-act="ux-guide-hide">Ocultar guía</button></section>`;
}

function render() {
  const parts = (location.hash || '#/proyectos').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const r = parts[0] || 'dashboard';
  if (['Trabajador de obra','Trabajador común'].includes(CURRENT_USER?.rol) && !['dashboard','terreno','inspecciones','evidencias','academy'].includes(r) && !(r==='prevent'&&parts[1]==='firmar')) { location.hash = '#/terreno'; return; }
  UI.list = null;
  let html;
  switch (r) {
    case 'control': html = vControlCenter(); break;
    case 'alertas': html = vAlertas(); break;
    case 'calendario': html = vCalendario(); break;
    case 'presentacion': html = vPresentacion(); break;
    case 'praxis': html = vPraxisHub(); break;
    case 'terreno': html = vModoTerreno(); break;
    case 'dashboard': html = vDashboard(); break;
    case 'proyectos': html = vProyectos(); break;
    case 'proyecto': html = vProyecto(parts[1], parts[2] || 'resumen'); break;
    case 'frente': html = vFrente(parts[1], parts[2]); break;
    case 'inspecciones': html = vInspecciones(); break;
    case 'dhncr': html = vDhncr(parts[1]); break;
    case 'registro': html = vRegistro(parts[1]); break;
    case 'evidencias': html = vEvidencias(); break;
    case 'indicadores': html = vIndicadores(); break;
    case 'reportes': html = vReportes(); break;
    case 'academy': html = vAcademy(parts[1], parts[2]); break;
    case 'prevent': html = vPrevent(parts[1]); break;
    case 'usuarios': html = vUsers(); break;
    case 'cuadrillas': html = vCrews(); break;
    default: html = notFound('Página no encontrada');
  }
  if (r === 'usuarios' && !canManageUsers()) html = notFound('Acceso restringido: solo el Administrador puede gestionar usuarios.');
  if (r === 'cuadrillas' && !isCrewManager()) html = notFound('Acceso restringido: las cuadrillas las gestionan Administración y jefaturas.');
  $('#view').innerHTML = uxGuide(r) + html;
  if (UI.list) UI.list();
  $('#topbar-title').textContent = TITLES[r] || 'OBRA CONTROL';
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === location.hash || (!a.closest('.nav-submenu') && a.dataset.route === (NAVMAP[r] || r)));
    if (a.id !== 'nav-users' && a.id !== 'nav-crews') a.hidden = CURRENT_USER?.rol === 'Trabajador de obra' && !['terreno','inspecciones','evidencias','academy'].includes(a.dataset.route);
  });
  const pf=$('#nav-prevent-folder'); if(pf && ['prevent','academy'].includes(r)) pf.open=true;
  const nu=$('#nav-users'); if(nu) nu.hidden=!canManageUsers();
  const nc=$('#nav-crews'); if(nc) nc.hidden=!isCrewManager();
  const tu=$('#topbar-user'); if(tu && CURRENT_USER) tu.textContent=`${CURRENT_USER.nombre} · ${CURRENT_USER.rol}`;
  $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('open');
  window.scrollTo(0, 0);
}

/* Eventos globales (delegación) */
document.addEventListener('keydown', e => {
  const go=e.target.closest && e.target.closest('[data-go][role=\"link\"]');
  if(go && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); location.hash=go.dataset.go; }
});
document.addEventListener('click', e => {
  if (e.target.closest('#nav a')) { $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('open'); }
  const act = e.target.closest('[data-act]');
  if (act) { const fn = ACTIONS[act.dataset.act]; if (fn) fn(act.dataset); return; }
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('button,a,input,select')) location.hash = go.dataset.go;
});
document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault(); const fn = FORMS[form.dataset.form]; if (fn) fn(new FormData(form), form);
});
document.addEventListener('input', e => {
  const f = e.target.dataset && e.target.dataset.filter;
  if (f) { UI.f[f] = e.target.value; UI.list && UI.list(); }
});
document.addEventListener('change', e => {
  const t = e.target, form = t.closest && t.closest('form[data-form]');
  if (t.id === 'role-select') { render(); return; }
  if (t.id === 'ind-p') { UI.f.ind = t.value; $('#ind-out').innerHTML = indicadoresHTML(t.value); }
  if (t.id === 'rep-t') { UI.f.rept=t.value; const box=$('#rep-ncr-box'); if(box) box.style.display=t.value==='ncr-detalle'?'block':'none'; }
  if (t.id === 'rep-p') { UI.f.repp=t.value; }
  if (t.id === 'rep-ncr') { UI.f.repn=t.value; }
  if (form && form.dataset.form === 'integration-link' && t.name === 'entityType') { const sel=form.elements.entityId; if(sel){ Array.from(sel.options).forEach(o=>{ if(!o.value){o.hidden=false;return;} o.hidden=o.dataset.type!==t.value; }); sel.value=''; } }
  if (!form) return;
  if (form.dataset.form === 'insp') { // recalcular riesgo en vivo
    const { resp, metodo } = readResp(form);
    $('#risk-panel').innerHTML = riskHTML(calcRiesgo(resp, metodo)) + lessonsHint();
    if (t.matches('input[type=radio][value=no]')) {
      const k=t.name.replace(/^r_/,'');
      const toggle=form.querySelector(`input[data-obs-toggle="${k}"]`);
      const detail=form.querySelector(`#chk-detail-${k}`);
      const card=form.querySelector(`[data-check-card="${k}"]`);
      if(toggle) toggle.checked=true;
      if(detail){detail.hidden=false;detail.classList.add('is-open');}
      if(card) card.classList.add('has-observation');
    }
  }
  if (form.dataset.form === 'ev' && t.matches('input[type=file][data-ev-files]')) {
    const box=$('#ev-file-preview'); if(box){ box.innerHTML=''; Array.from(t.files).forEach(file=>{ const div=document.createElement('div'); div.className='photo-thumb'; if(file.type.startsWith('image/')){ const url=URL.createObjectURL(file); div.innerHTML=`<img src="${url}" alt="${esc(file.name)}"><span>${esc(file.name)}</span>`; } else { div.innerHTML=`<div class="ph">📎</div><span>${esc(file.name)}</span>`; } box.appendChild(div); }); }
  }
  if (form.dataset.form === 'insp' && t.matches('input[type=file][data-check-photo]')) {
    const k=t.dataset.checkPhoto; const box=$('#photo-preview-'+k); if(!box) return;
    box.innerHTML='';
    if(!t.files.length){ box.innerHTML='<span class="muted small">Sin fotografías nuevas</span>'; return; }
    Array.from(t.files).forEach(file=>{
      if(!file.type.startsWith('image/')) return;
      const url=URL.createObjectURL(file);
      const div=document.createElement('div'); div.className='photo-thumb';
      div.innerHTML=`<img src="${url}" alt="${esc(file.name)}"><span>${esc(file.name)}</span>`;
      box.appendChild(div);
    });
  }
  if (form.dataset.form === 'insp' && t.matches('input[data-obs-toggle]')) {
    const k=t.dataset.obsToggle; const detail=$('#chk-detail-'+k); const card=t.closest('[data-check-card]');
    if(detail){ detail.hidden=!t.checked; detail.classList.toggle('is-open',t.checked); }
    if(card) card.classList.toggle('has-observation',t.checked);
  }
  if (form.dataset.form === 'rec' && t.name === 'projectId') $('#rfr').innerHTML = frentesOpts(t.value, '');
});
$('#modal-wrap').addEventListener('mousedown', e => { if (e.target.id === 'modal-wrap') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#btn-menu').addEventListener('click', () => { $('#sidebar').classList.toggle('open'); $('#overlay').classList.toggle('open'); });
$('#overlay').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('open'); });
$('#btn-backup').addEventListener('click', () => {
  try {
    const payload = { app: 'OBRA CONTROL', version: 8, exportedAt: new Date().toISOString(), data: DB };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'OBRA_CONTROL_respaldo_' + hoy() + '.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Copia de seguridad JSON exportada.', 'ok');
  } catch (e) { toast('No se pudo exportar la copia de seguridad.', 'err'); }
});
$('#btn-import').addEventListener('click', () => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede importar una copia.','err'); $('#backup-file').click(); });
$('#backup-file').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()); const candidate = parsed.data || parsed;
    const required = ['projects','records','inspections','evidences','lessons','dis'];
    if (!Array.isArray(candidate.trainings)) candidate.trainings=[]; if (!Array.isArray(candidate.recurrenceReviews)) candidate.recurrenceReviews=[];
    if (!candidate || !required.every(k => Array.isArray(candidate[k]))) throw new Error('Estructura no válida');
    confirmDlg('La importación reemplazará los datos actuales. Se recomienda exportar una copia antes de continuar. ¿Desea importar este respaldo?', () => {
      const old = DB; DB = candidate;
      if (!save()) { DB = old; return; }
      toast('Respaldo importado correctamente.', 'ok'); render();
    }, 'Importar respaldo');
  } catch (err) { toast('El archivo no parece ser una copia válida de OBRA CONTROL.', 'err'); }
  e.target.value = '';
});
$('#btn-reset').addEventListener('click', () => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede restaurar los datos demo.','err'); confirmDlg('¿Restaurar los datos de demostración? Se reemplazarán todos los datos actuales.', () => { DB = demoData(); save(); toast('Datos demo restaurados.', 'ok'); render(); }, 'Restaurar'); });
$('#btn-clear').addEventListener('click', () => { if(CURRENT_ROLE!=='Administrador Praxis') return toast('Solo Administrador Praxis puede borrar todos los datos.','err'); confirmDlg('¿Borrar TODOS los datos (incluida la demo)? Esta acción no se puede deshacer.', () => { DB = emptyDB(); save(); toast('Datos eliminados.', 'ok'); location.hash = '#/proyectos'; render(); }, 'Borrar todo'); });
window.addEventListener('hashchange', render);

load();
loadUsers();
loadCrews();
ensureDemoWorkspace();
(async function bootAuth(){
  if(await restoreCloudSession()) return;
  let sid=''; try{sid=sessionStorage.getItem(SESSION_KEY)||'';}catch(e){}
  const user=AUTH_USERS.find(u=>u.id===sid&&u.activo!==false);
  if(user){setLoggedIn(user);} else {authScreen('');}
})();
