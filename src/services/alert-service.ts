'use strict';
import cfg = require('../../config');
import helpersModule = require('../utils/helpers');
const { fmt } = helpersModule;

const ADVICE: Record<string, any> = {
  nh4: 'Ammonium/Ammoniak ist giftig: 30–50 % Wasser wechseln, Fütterung aussetzen, Filter prüfen.',
  no2: 'Nitrit ist ein Fischgift: Teilwasserwechsel, Fütterung reduzieren, Filterbakterien schonen.',
  no3: 'Teilwasserwechsel durchführen, Besatz und Fütterung überprüfen.',
  po4: 'Teilwasserwechsel, Fütterung prüfen, Algenwachstum beobachten.',
  cu: 'Kupfer ist für Wirbellose und Fische giftig: Wasserwechsel, Quelle suchen (Leitungen, Medikamente).',
  o2: 'Wasseroberfläche stärker bewegen oder belüften, Temperatur prüfen.',
  co2: 'CO2-Zufuhr drosseln und für Belüftung sorgen.',
  temp: 'Heizung bzw. Kühlung prüfen.',
  ph: 'Ursache prüfen (KH, CO2, Dekoration). Änderungen nur langsam vornehmen.',
};

function buildMessage(p?: any, range?: any, level?: any, value?: any) {
  const dir = (range.critMin != null && value < range.critMin) || (level === 'warn' && range.okMin != null && value < range.okMin) ? 'low' : 'high';
  const limit = level === 'crit' ? (dir === 'low' ? range.critMin : range.critMax) : (dir === 'low' ? range.okMin : range.okMax);
  const word = level === 'crit' ? 'kritisch' : 'auffällig';
  let msg = `${p.name} ist mit ${fmt(p, value)} ${word} (${dir === 'low' ? 'unter' : 'über'} ${fmt(p, limit)}).`;
  if (level === 'crit' && ADVICE[p.key]) msg += ' ' + ADVICE[p.key];
  return msg;
}

async function thresholdsOfAquarium(aq?: any, db?: any, stockRows: any = null) {
  const stock = stockRows || (await db.stock.listForAquarium(aq.id));
  const profiles = Array.from(new Set(stock.map((r: any) => r.profile)));
  const compatibility = cfg.speciesService.analyzeStockCompatibility(aq, stock);
  return { profiles, compatibility, ...cfg.thresholdsFor(aq.water_type, profiles) };
}

export = {
  ADVICE,
  buildMessage,
  thresholdsOfAquarium,
};
