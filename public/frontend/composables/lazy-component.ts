import { defineAsyncComponent, type Component } from 'vue';
import LoadingContent from '../components/LoadingContent.vue';
import AsyncLoadError from '../components/AsyncLoadError.vue';

export function lazyComponent<T extends Component>(loader: () => Promise<{ default: T }>) {
  return defineAsyncComponent({
    loader, loadingComponent: LoadingContent, errorComponent: AsyncLoadError, delay: 120,
    onError(_error, retry, fail, attempts) { if (attempts < 2) retry();else fail(); },
  });
}
