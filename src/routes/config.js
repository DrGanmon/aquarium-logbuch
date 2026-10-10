'use strict';
const express = require('express');
const cfg = require('../../config');
const { auth } = require('../middleware/auth');
const db = require('../db');
const { wrap, str } = require('../utils/helpers');

const router = express.Router();

router.get('/config', auth, (req, res) => {
  const user = req.user?.id ? db.prepare('SELECT selected_suite, selected_tests FROM users WHERE id = ?').get(req.user.id) : null;
  const suites = cfg.suiteService.getSuites();
  const defaultSuite = cfg.suiteService.getDefaultSuite();
  const selectedSuiteId = user?.selected_suite || defaultSuite?.id || 'jbl-pro';
  const suite = cfg.suiteService.getSuite(selectedSuiteId) || defaultSuite;

  let userSelectedTests = null;
  if (user?.selected_tests) {
    try {
      userSelectedTests = JSON.parse(user.selected_tests);
    } catch (e) {
      userSelectedTests = null;
    }
  }

  res.json({
    suites,
    defaultSuiteId: defaultSuite?.id || 'jbl-pro',
    currentSuite: suite,
    parameters: suite.tests.map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }) => ({
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
    allParameters: cfg.suiteService.getAllKnownParameters().map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }) => ({
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
    userPreferences: {
      selectedSuite: selectedSuiteId,
      selectedTests: userSelectedTests,
    },
    profiles: Object.fromEntries(Object.entries(cfg.PROFILES).map(([k, v]) => [k, v.label])),
    species: cfg.speciesService.getAllSpecies().map((s) => ({
      id: s.id,
      name: s.name,
      scientificName: s.scientificName,
      category: s.category,
      profile: s.profile,
      waterType: s.waterType,
      minVolumeL: s.minVolumeL,
      socialType: s.socialType,
      minGroupCount: s.minGroupCount,
      territorial: s.territorial,
    })),
    speciesCategories: cfg.speciesService.getCategories(),
    waterTypes: cfg.WATER_TYPES,
    maintenanceTypes: cfg.maintenanceService.MAINTENANCE_TYPES,
  });
});

router.get('/species', auth, (req, res) => {
  let list = cfg.speciesService.getAllSpecies();
  const waterType = req.query.water_type || req.query.waterType;
  const category = req.query.category;
  const q = req.query.q ? String(req.query.q).toLowerCase().trim() : null;

  if (waterType) {
    list = list.filter((s) => s.waterType === waterType);
  }
  if (category) {
    list = list.filter((s) => s.category.toLowerCase() === String(category).toLowerCase());
  }
  if (q) {
    list = list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.scientificName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q))
    );
  }
  res.json({
    species: list,
    categories: cfg.speciesService.getCategories(),
  });
});

router.get('/species/categories', auth, (req, res) => {
  res.json({
    categories: cfg.speciesService.getCategories(),
  });
});

router.get('/species/:id', auth, (req, res) => {
  const sp = cfg.speciesService.getSpeciesById(req.params.id) || cfg.speciesService.findSpeciesByName(req.params.id);
  if (!sp) {
    return res.status(404).json({ error: 'Art nicht gefunden.' });
  }
  res.json({ species: sp });
});

router.get('/suites', auth, (req, res) => {
  res.json({
    suites: cfg.suiteService.getSuites(),
    defaultSuite: cfg.suiteService.getDefaultSuite(),
  });
});

router.get('/suites/:id', auth, (req, res) => {
  const suite = cfg.suiteService.getSuite(req.params.id);
  if (!suite) {
    return res.status(404).json({ error: 'Testsuite nicht gefunden.' });
  }
  res.json({ suite });
});

router.put(
  '/me/tests',
  auth,
  wrap((req, res) => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    let selectedSuite = req.body.suiteId || req.body.selectedSuite || null;
    let selectedTests = req.body.tests || req.body.selectedTests;

    if (selectedSuite != null) selectedSuite = str(selectedSuite, 50);
    let testsJson = null;
    if (Array.isArray(selectedTests)) {
      testsJson = JSON.stringify(selectedTests.map((t) => str(t, 40).toLowerCase()).filter(Boolean));
    } else if (selectedTests === null) {
      testsJson = null;
    }

    db.prepare('UPDATE users SET selected_suite = coalesce(?, selected_suite), selected_tests = ? WHERE id = ?').run(
      selectedSuite,
      testsJson,
      req.user.id
    );

    const updated = db.prepare('SELECT selected_suite, selected_tests FROM users WHERE id = ?').get(req.user.id);
    let parsed = null;
    if (updated.selected_tests) {
      try {
        parsed = JSON.parse(updated.selected_tests);
      } catch (e) {
        parsed = null;
      }
    }
    res.json({ ok: true, selectedSuite: updated.selected_suite, selectedTests: parsed });
  })
);

module.exports = router;
