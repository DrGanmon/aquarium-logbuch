'use strict';
const { str } = require('../utils/helpers');

function validateDosingPumpInput(body) {
  const name = str(body.name, 100);
  if (!name) {
    return { error: 'Bitte einen Namen oder Kanal für die Dosierpumpe angeben.' };
  }

  const fertilizerName = str(body.fertilizer_name || body.fertilizerName || body.fertilizer, 100);
  if (!fertilizerName) {
    return { error: 'Bitte den Namen des Düngers oder der dosierten Flüssigkeit angeben.' };
  }

  let amountMl = Number(typeof body.amount_ml === 'string' ? body.amount_ml.replace(',', '.') : body.amount_ml);
  if (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 1000) {
    return { error: 'Bitte eine gültige Dosiermenge in Millilitern angeben (z. B. 2.5 ml).' };
  }
  amountMl = Math.round(amountMl * 100) / 100;

  let intervalDays = Number(body.interval_days != null ? body.interval_days : 1);
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return { error: 'Bitte ein gültiges Dosierintervall in Tagen angeben (z. B. 1 für täglich).' };
  }

  let timeOfDay = str(body.time_of_day, 10);
  if (timeOfDay && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(timeOfDay)) {
    timeOfDay = null;
  }

  const isActive = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
  const note = str(body.note, 500);

  return {
    value: {
      name,
      fertilizer_name: fertilizerName,
      amount_ml: amountMl,
      interval_days: intervalDays,
      time_of_day: timeOfDay || null,
      is_active: isActive,
      note: note || null,
    },
  };
}

module.exports = {
  validateDosingPumpInput,
};
