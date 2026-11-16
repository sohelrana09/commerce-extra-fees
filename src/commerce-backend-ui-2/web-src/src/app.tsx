import { createExtensionApp } from "@adobe/aio-commerce-lib-admin-ui/web";
import "@react-spectrum/s2/page.css";

import config from "#app.commerce.config";

import { ExtraFeesPage } from "./pages/extra-fees-page.tsx";

createExtensionApp({
  menu: <ExtraFeesPage />,
  metadata: {
    extensionId: config.metadata.id,
  },
});
