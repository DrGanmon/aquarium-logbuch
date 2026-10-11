'use strict';
const express = require('express');
const cfg = require('../../config');
const { auth } = require('../middleware/auth');
const db = require('../db');
const { wrap, str } = require('../utils/helpers');
const { legalConfigService } = require('../services/legal-config-service');

const router = express.Router();

// Öffentlich zugängliche Informationen für Impressum, Kontakt und Lizenz
router.get(['/legal-info', '/legal/config', '/public-info'], (req, res) => {
  res.json(legalConfigService.getConfig());
});

router.get(
  '/config',
  auth,
  wrap(async (req, res) => {
    const user = req.user?.id ? await db.users.findById(req.user.id) : null;
    const lang = req.query.lang || req.headers['x-language'] || user?.language || 'de';
    const suites = cfg.suiteService.getSuites(lang);
    const defaultSuite = cfg.suiteService.getDefaultSuite(lang);
    const selectedSuiteId = user?.selected_suite || defaultSuite?.id || 'jbl-pro';
    const suite = cfg.suiteService.getSuite(selectedSuiteId, lang) || defaultSuite;

    let userSelectedTests = null;
    if (user?.selected_tests) {
      try {
        userSelectedTests = typeof user.selected_tests === 'string' ? JSON.parse(user.selected_tests) : user.selected_tests;
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
      allParameters: cfg.suiteService.getAllKnownParameters(lang).map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }) => ({
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
      species: cfg.speciesService.getAllSpecies(lang).map((s) => ({
        id: s.id,
        name: s.name,
        name_de: s.name_de,
        name_en: s.name_en,
        scientificName: s.scientificName,
        category: s.category,
        category_de: s.category_de,
        category_en: s.category_en,
        profile: s.profile,
        waterType: s.waterType,
        minVolumeL: s.minVolumeL,
        socialType: s.socialType,
        minGroupCount: s.minGroupCount,
        territorial: s.territorial,
        decorHints: s.decorHints,
        behaviorNotes: s.behaviorNotes,
        description: s.description,
      })),
      speciesCategories: cfg.speciesService.getCategories(lang),
      waterTypes: cfg.WATER_TYPES,
      maintenanceTypes: cfg.maintenanceService.MAINTENANCE_TYPES,
    });
  })
);

router.get('/species', auth, (req, res) => {
  const lang = req.query.lang || req.headers['x-language'] || req.user?.language || 'de';
  let list = cfg.speciesService.getAllSpecies(lang);
  const waterType = req.query.water_type || req.query.waterType;
  const category = req.query.category;
  const q = req.query.q ? String(req.query.q).toLowerCase().trim() : null;

  if (waterType) {
    list = list.filter((s) => s.waterType === waterType);
  }
  if (category) {
    list = list.filter((s) =>
      s.category.toLowerCase() === String(category).toLowerCase() ||
      s.category_de?.toLowerCase() === String(category).toLowerCase() ||
      s.category_en?.toLowerCase() === String(category).toLowerCase()
    );
  }
  if (q) {
    list = list.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.name_de?.toLowerCase().includes(q) ||
      s.name_en?.toLowerCase().includes(q) ||
      s.scientificName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q))
    );
  }
  res.json({
    species: list,
    categories: cfg.speciesService.getCategories(lang),
  });
});

router.get('/species/categories', auth, (req, res) => {
  const lang = req.query.lang || req.headers['x-language'] || req.user?.language || 'de';
  res.json({
    categories: cfg.speciesService.getCategories(lang),
  });
});

router.get('/species/:id', auth, (req, res) => {
  const lang = req.query.lang || req.headers['x-language'] || req.user?.language || 'de';
  const sp = cfg.speciesService.getSpeciesById(req.params.id, lang) || cfg.speciesService.findSpeciesByName(req.params.id, lang);
  if (!sp) {
    return res.status(404).json({ error: 'Art nicht gefunden.' });
  }
  res.json({ species: sp });
});

router.get('/suites', auth, (req, res) => {
  const lang = req.query.lang || req.headers['x-language'] || req.user?.language || 'de';
  res.json({
    suites: cfg.suiteService.getSuites(lang),
    defaultSuite: cfg.suiteService.getDefaultSuite(lang),
  });
});

router.get('/suites/:id', auth, (req, res) => {
  const lang = req.query.lang || req.headers['x-language'] || req.user?.language || 'de';
  const suite = cfg.suiteService.getSuite(req.params.id, lang);
  if (!suite) {
    return res.status(404).json({ error: 'Testsuite nicht gefunden.' });
  }
  res.json({ suite });
});

router.put(
  '/me/tests',
  auth,
  wrap(async (req, res) => {
    const user = await db.users.findById(req.user.id);
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

    const updateFields = { selected_tests: testsJson };
    if (selectedSuite) updateFields.selected_suite = selectedSuite;

    await db.users.update(req.user.id, updateFields);

    const updated = await db.users.findById(req.user.id);
    let parsed = null;
    if (updated.selected_tests) {
      try {
        parsed = typeof updated.selected_tests === 'string' ? JSON.parse(updated.selected_tests) : updated.selected_tests;
      } catch (e) {
        parsed = null;
      }
    }
    res.json({ ok: true, selectedSuite: updated.selected_suite, selectedTests: parsed });
  })
);

module.exports = router;
