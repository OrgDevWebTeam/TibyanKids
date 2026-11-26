import config from "../config/env.js";
import { createCache } from "./cache.js";

const options = { ttlMs: config.cacheTtlSeconds * 1000, maxEntries: 500 };

// Only data that is the same for everyone who may see it. Each one is cleared when it changes.
export const competencyCache = createCache(options);
export const publishedContentCache = createCache(options);
