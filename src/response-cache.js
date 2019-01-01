
import crypto from 'crypto';

import { loadConfig } from './conf.js';
import Logger from './logger.js';
import createCache from './cache.js';

/**
 * opts: options for http request 
 * lang: google cloud translate language code
 */
const getFullUrl = (opts, lang) => {
  let url = opts.protocol + '//' + opts.host;
  if (opts.port) url += ':' + opts.port;
  url += opts.path;
  if (lang) {
    if (url.includes('?')) {
      url += '&lang=' + lang;
    } else {
      url += '?lang=' + lang;
    }
  }
  return url;
};

/**
 * opts: options for http request 
 * lang: google cloud translate language code
 */
const getKey = (prefix, opts, lang) => {
  const reqStr = opts.method + '+' + getFullUrl(opts, lang);
  let key = prefix + crypto.createHash('md5').update(reqStr).digest('hex');
  return key;
};

const getCache = async (opts, lang) => {
  return await cache.getAsync(getKey('PAGE-', opts, lang));
}

const setCache = async (opts, lang, val) => {
  return await cache.setAsync(getKey('PAGE-', opts, lang), val);
}

const createResponseCache = (conf) => {
  const cache = createCache(conf);

  const ResponseCache = {
    get: async (opts, lang) => {
      const headKey = getKey('HEAD-', opts, lang)
      const pageKey = getKey('PAGE-', opts, lang)
      Logger.info(opts.id + ' CACHE GET: ' + headKey);
      Logger.info(opts.id + ' CACHE GET: ' + pageKey);
      const head = await cache.getAsync(getKey('HEAD-', opts, lang));
      const body = await cache.getAsync(getKey('PAGE-', opts, lang));
      if (!head || !body) return null;
      return {
        res: JSON.parse(head.toString()),
        buffer: body
      };
    },

    save: async (opts, lang, header, body) => {
      const headKey = getKey('HEAD-', opts, lang)
      const pageKey = getKey('PAGE-', opts, lang)
      Logger.info(opts.id + ' CACHE SAVE: ' + headKey);
      Logger.info(opts.id + ' CACHE SAVE: ' + pageKey);
      await cache.setAsync(headKey, JSON.stringify(header));
      await cache.setAsync(pageKey, body);
      return true;
    }
  };

  return ResponseCache;
};

export default createResponseCache;