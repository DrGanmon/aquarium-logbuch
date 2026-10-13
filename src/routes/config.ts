import { asError } from '../utils/app-error';
import type { Request, Response } from 'express';
'use strict';
import express = require('express');
import cfg = require('../../config');
import authModule = require('../middleware/auth');
const { auth } = authModule;
import db = require('../db');
import helpersModule = require('../utils/helpers');
const { wrap, str } = helpersModule;
import legal_config_serviceModule = require('../services/legal-config-service');
const { legalConfigService } = legal_config_serviceModule;
import testInventory = require('../services/test-inventory-service');

const router = express.Router();

// Öffentlich zugängliche Informationen für Impressum, Kontakt und Lizenz
router.get(['/legal-info', '/legal/config', '/public-info'], (req: Request, res: Response) => {
  res.json(legalConfigService.getConfig());
});

router.get(
  '/config',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = req.user?.id ? await db.users.findById(req.user.id) : null;
    const lang = String(req.query.lang || req.headers['x-language'] || user?.language || 'de');
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
      parameters: (Array.isArray(userSelectedTests) && userSelectedTests.some((test: unknown) => typeof test === 'string' && test.includes(':'))
        ? cfg.suiteService.resolveSelection(userSelectedTests, selectedSuiteId, lang) : suite?.tests || []).map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }: any) => ({
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
      allParameters: cfg.suiteService.getAllKnownParameters(lang).map(({ key, name, unit, decimals, step, min, max, wait, verified, hint }: any) => ({
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
      profiles: Object.fromEntries(Object.entries(cfg.PROFILES).map(([k, v]: any) => [k, v.label])),
      species: cfg.speciesService.getAllSpecies(lang).map((s: any) => ({
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

router.get('/species', auth, (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  let list = cfg.speciesService.getAllSpecies(lang);
  const waterType = req.query.water_type || req.query.waterType;
  const category = req.query.category;
  const q = req.query.q ? String(req.query.q).toLowerCase().trim() : null;

  if (waterType) {
    list = list.filter((s: any) => s.waterType === waterType);
  }
  if (category) {
    list = list.filter((s: any) =>
      s.category.toLowerCase() === String(category).toLowerCase() ||
      s.category_de?.toLowerCase() === String(category).toLowerCase() ||
      s.category_en?.toLowerCase() === String(category).toLowerCase()
    );
  }
  if (q) {
    list = list.filter((s: any) =>
      s.name.toLowerCase().includes(q) ||
      s.name_de?.toLowerCase().includes(q) ||
      s.name_en?.toLowerCase().includes(q) ||
      s.scientificName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.tags.some((t: any) => t.includes(q))
    );
  }
  res.json({
    species: list,
    categories: cfg.speciesService.getCategories(lang),
  });
});

router.get('/species/categories', auth, (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  res.json({
    categories: cfg.speciesService.getCategories(lang),
  });
});

router.get('/species/:id', auth, (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  const sp = cfg.speciesService.getSpeciesById(req.params.id, lang) || cfg.speciesService.findSpeciesByName(req.params.id, lang);
  if (!sp) {
    return res.status(404).json({ error: 'Art nicht gefunden.' });
  }
  res.json({ species: sp });
});

router.get('/suites', auth, (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  res.json({
    suites: cfg.suiteService.getSuites(lang),
    defaultSuite: cfg.suiteService.getDefaultSuite(lang),
  });
});

router.get('/suites/:id', auth, (req: Request, res: Response) => {
  const lang = String(req.query.lang || req.headers['x-language'] || req.user?.language || 'de');
  const suite = cfg.suiteService.getSuite(String(req.params.id), lang);
  if (!suite) {
    return res.status(404).json({ error: 'Testsuite nicht gefunden.' });
  }
  res.json({ suite });
});

router.get('/me/test-inventory', auth, wrap(async (req: Request, res: Response) => {
  const user = await db.users.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
  const suiteId = String(req.query.suiteId || user.selected_suite || cfg.suiteService.getDefaultSuite()?.id || 'jbl-pro');
  const lang = String(req.headers['x-language'] || user.language || 'de');
  const items = testInventory.inventoryItems(user, suiteId, lang);
  if (!items) return res.status(400).json({ error: 'Unbekannte Testsuite.' });
  res.json({ suiteId, items });
}));

router.put('/me/test-inventory/:key', auth, wrap(async (req: Request, res: Response) => {
  const user = await db.users.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
  const suiteId = req.body.suiteId || user.selected_suite || cfg.suiteService.getDefaultSuite()?.id || 'jbl-pro';
  try {
    await testInventory.updateInventory(db, user.id, String(suiteId), String(req.params.key), req.body);
  } catch (caught: unknown) {
    const error = asError(caught);
    if (error.status === 400) return res.status(400).json({ error: error.message });
    throw error;
  }
  const updated = await db.users.findById(user.id);
  if (!updated) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
  res.json({ suiteId, items: testInventory.inventoryItems(updated, String(suiteId), String(req.headers['x-language'] || user.language || 'de')) });
}));

router.put(
  '/me/tests',
  auth,
  wrap(async (req: Request, res: Response) => {
    const user = await db.users.findById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    let selectedSuite = req.body.suiteId || req.body.selectedSuite || null;
    let selectedTests = req.body.tests || req.body.selectedTests;

    if (selectedSuite != null) selectedSuite = str(selectedSuite, 50);
    if (selectedSuite && !cfg.suiteService.getSuite(selectedSuite)) return res.status(400).json({ error: 'Unbekannte Testsuite.' });
    const fallbackSuite = selectedSuite || user.selected_suite;
    let testsJson = user.selected_tests;
    if (selectedTests !== undefined && selectedTests !== null) {
      if (!cfg.suiteService.validateSelection(selectedTests, fallbackSuite)) {
        return res.status(400).json({ error: 'Ungültige Testauswahl. Pro Wasserparameter ist eine Testmethode erlaubt.' });
      }
      testsJson = JSON.stringify(selectedTests);
    } else if (selectedTests === null) {
      testsJson = null;
    }

    const updateFields: Record<string, any> = { selected_tests: testsJson };
    if (selectedSuite) updateFields.selected_suite = selectedSuite;

    await db.users.update(req.user.id, updateFields);

    const updated = await db.users.findById(req.user.id);
    if (!updated) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
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

export = router;
