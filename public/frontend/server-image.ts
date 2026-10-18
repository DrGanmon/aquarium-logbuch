import type { ObjectDirective, VNode } from 'vue';

interface ImageBinding {
  source: unknown;
  generation: number;
  dispose?: () => void;
}
const bindings = new WeakMap<HTMLImageElement, ImageBinding>();
function update(element: HTMLImageElement, vnode: VNode) {
  if (document.documentElement.dataset.mobile !== 'true') return;
  const source = vnode.props?.src;
  const previous = bindings.get(element);
  if (previous?.source === source) return;
  previous?.dispose?.();
  const binding: ImageBinding = { source, generation: (previous?.generation || 0) + 1 };
  bindings.set(element, binding);
  if (typeof source === 'string' && /^(?:data:|blob:)/.test(source)) { element.src = source;return; }
  // Prevent a request to the local WebView origin before the native loader is
  // available. The web client keeps its ordinary img and service worker path.
  element.removeAttribute('src');
  if (typeof source !== 'string' || !source) return;
  void import('./mobile-images').then(({ attachMobileImage }) => {
    if (bindings.get(element) !== binding) return;
    binding.dispose = attachMobileImage(element, source);
  }).catch(() => {
    if (bindings.get(element) === binding) element.dispatchEvent(new Event('error'));
  });
}
export const serverImage: ObjectDirective<HTMLImageElement> = {
  beforeMount(element, _binding, vnode) { update(element, vnode); },
  updated(element, _binding, vnode) { update(element, vnode); },
  beforeUnmount(element) {
    bindings.get(element)?.dispose?.();
    bindings.delete(element);
  },
};
