import "../style.css";
import { createApp } from "vue";
import App from "./App.vue";
import { serverImage } from './server-image';

createApp(App).directive('server-image', serverImage).mount("#vue-root");
