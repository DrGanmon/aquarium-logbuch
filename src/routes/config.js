'use strict';
const express = require('express');
const cfg = require('../../config');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/config', auth, (req, res) => {
  res.json({
    parameters: cfg.PARAMETERS.map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }) => ({
      key,
      name,
      unit,
      decimals,
      step,
      min,
      max,
      wait,
      verified,
      hint,
    })),
    profiles: Object.fromEntries(Object.entries(cfg.PROFILES).map(([k, v]) => [k, v.label])),
    species: cfg.SPECIES.map(([name, profile]) => ({ name, profile })),
    waterTypes: cfg.WATER_TYPES,
  });
});

module.exports = router;
