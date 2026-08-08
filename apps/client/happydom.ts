import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Registers window/document/etc. globally so React Testing Library works under `bun test`.
GlobalRegistrator.register();
