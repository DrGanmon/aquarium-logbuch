import type { AppConfig, Parameter, Suite } from "../types";

export function initialTestSelection(config: AppConfig | null): string[] {
  if (!config) return [];
  const suiteId = config.userPreferences.selectedSuite || config.currentSuite.id;
  const selected = config.userPreferences.selectedTests;
  return (selected ?? config.suites.find(suite => suite.id === suiteId)?.tests?.map(test => test.key) ?? [])
    .map(reference => reference.includes(":") ? reference : `${suiteId}:${reference}`);
}

export function resolveTests(suites: Suite[], selection: string[]): (Parameter & { suiteId: string; reference: string })[] {
  return selection.flatMap(reference => {
    const separator = reference.indexOf(":");
    const suiteId = reference.slice(0, separator), key = reference.slice(separator + 1);
    const test = suites.find(suite => suite.id === suiteId)?.tests?.find(test => test.key === key);
    return test ? [{ ...test, suiteId, reference }] : [];
  });
}

export function selectTest(selection: string[], reference: string, enabled: boolean): string[] {
  const key = reference.slice(reference.indexOf(":") + 1);
  const remaining = selection.filter(item => item.slice(item.indexOf(":") + 1) !== key);
  return enabled ? [...remaining, reference] : selection.filter(item => item !== reference);
}
