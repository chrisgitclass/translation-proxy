
import { serverError } from './error-handler.js';
import Logger from './logger.js';

export const setUpMiddleCache = (responseHandler, cacheHandler) => {
  const ResponseHandler = responseHandler;
  const ResponseCache = cacheHandler;

  return async (req, res, next) => {
    if (!res.locals || !res.locals.reqObj) {
      serverError('REQOBJ NOT PROVIDED', res);
      return;
    }
    const obj = res.locals.reqObj;
    const logPrefix = obj.id + ' SERVER RESPONSE ';

    //FIXME CALL NEXT IF CACHE IS DISABLED

    if (obj.lang) {
      const translated = await ResponseCache.get(obj, obj.lang);
      if (translated) {
        const savedRes = translated.res
        let cookies = savedRes.headers['set-cookie'] || [];
        cookies.push(`SELECTEDLANG=${obj.lang};path=/;`);
        savedRes.headers['set-cookie'] = cookies;

        if (ResponseCache.validate(obj, savedRes)) {
          ResponseHandler.sendNotModified(res, savedRes, logPrefix);
        } else {
          ResponseHandler.sendBuffer(res, translated.buffer, savedRes, logPrefix + 'END: RETURNING CACHED TRANSLATED');
        }
        return;
      }
    }

    const original = await ResponseCache.get(obj, null);
    if (original) {
      const savedRes = original.res
      if (obj.lang) {
        savedRes.lang = obj.lang;
        savedRes.href = obj.href;
        ResponseHandler.sendTranslation(res, original.buffer, obj, savedRes, logPrefix);
      } else {
        if (ResponseCache.validate(obj, savedRes)) {
          ResponseHandler.sendNotModified(res, savedRes, logPrefix);
        } else {
          // delete set-cookie to use currently set cookie value, not whats in redis
          delete savedRes.headers['set-cookie'];
          ResponseHandler.sendBuffer(res, original.buffer, savedRes, logPrefix + 'END: RETURNING CACHED ORIGINAL');
        }
      }
    } else {
      next();
    }
  };

};
