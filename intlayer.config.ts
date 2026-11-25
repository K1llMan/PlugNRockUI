import { Locales, type IntlayerConfig } from "intlayer";
import { syncJSON } from "@intlayer/sync-json-plugin";

const config: IntlayerConfig = {
  internationalization: {
    locales: [Locales.RUSSIAN, Locales.ENGLISH],
    defaultLocale: Locales.RUSSIAN,
  },
  plugins: [
    syncJSON({
      source: ({ key, locale }) => `./locales/${locale}/${key}.json`,
      format: 'icu'
    }),
  ],  
};

export default config;