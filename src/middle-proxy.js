
import Logger from './logger.js';
import { serverError, serviceUnavailable } from './error-handler.js';

const genReqOpts = (reqObj) => {
  const {id,  href, requestedHost, requestedPort, remoteIp, lang, scheme, rawHeaders, ...opts } = reqObj;

  if (reqObj.scheme === 'https') {
    opts.rejectUnauthorized = false;
    opts.requestCert = true;
    opts.agent = false;
  }

  return opts;
};

const logProxyRequest = (opts) => {
  let uri = opts.method + ' ' + opts.protocol + '://' + opts.host;
  if (opts.port) uri += ':' + opts.port;
  uri += opts.path;
  Logger.info(opts.id + ' PROXY REQUEST SEND: ' + uri);
  Logger.debug(opts);
};

const logProxyResponse = (res, opts) => {
  const encoding = res.headers['content-encoding'];
  const type = res.headers['content-type'];
  const transfer = res.headers['transfer-encoding'];
  const len = res.headers['content-length'] || '';

  let msg = opts.href + ' ' + res.statusCode + ' ' + res.statusMessage + ' LEN: ' + len;
  if (type) msg += ' CONTENT TYPE: "' + type + '"';
  if (encoding) msg += ' ENCODING: "' + encoding + '"';
  if (transfer) msg += ' TRANSFER: "' + transfer + '"';

  //console.log(opts.id + ' PROXY RESPONSE RCEIV: ' + msg);
  Logger.info(opts.id + ' PROXY RESPONSE RCEIV: ' + msg);
  Logger.debug(res.headers);
};

export const setUpMiddleProxy = (responseHandler, agentSelector, cacheHandler, callback) => {
  const ResponseHandler = responseHandler;
  const AgentSelector = agentSelector;
  const ResponseCache = cacheHandler;

  return (req, res, next) => {
    const reqObj = res.locals.reqObj;
    let reqOpts = genReqOpts(reqObj);
    const agent = AgentSelector.select(req);
    logProxyRequest(reqObj);

    res.on('error', (e) => {
      Logger.error(reqObj.id + ' SERVER RESPONSE ERROR');
      serverError(e, res);
    });

    res.on('end', () => {
      Logger.info(reqObj.id + ' SERVER RESPONSE END');
      if (callback) callback();
    })

    req.on('error', (e) => {
      Logger.error(reqObj.id + ' CLIENT REQUEST ERROR');
      serverError(e, res);
    });

    const getCookie = (name) => {
      // Split cookie string and get all individual name=value pairs in an array
      Logger.info('COOKIE=',req.headers['cookie']);
      if(req.headers['cookie']){
        var cookieArr = req.headers['cookie'].split(";");
        
        // Loop through the array elements
        for(var i = 0; i < cookieArr.length; i++) {
            var cookiePair = cookieArr[i].split("=");
            
            /* Removing whitespace at the beginning of the cookie name
            and compare it with the given string */
            if(name == cookiePair[0].trim()) {
                // Decode the cookie value and return
                return decodeURIComponent(cookiePair[1]);
            }
        }
    }
    }
    Logger.info(`-----reqOpts ${JSON.stringify(reqOpts)}`);
    //const thost = "savewater.ca.gov";
    const thost = "apache.org";

    let jopt = JSON.stringify(reqOpts);
    jopt = jopt.replace(reqOpts.host, thost);
   // reqOpts = JSON.parse(jopt);
    
    Logger.info(`-----reqOpts2 ${JSON.stringify(reqOpts)}`);
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    const proxyReq = agent.request(reqOpts, (proxyRes) => {
      const encoding = proxyRes.headers['content-encoding'];
      const isHtml = /text\/html/.test(proxyRes.headers['content-type']);
      /// SELECTEDLANG COOKIE STUFF
      const cookieLang = getCookie('SELECTEDLANG');
      const lang =  reqObj.lang ||cookieLang;
       reqObj.lang = lang;
      const needTranslation = isHtml && reqObj.lang && reqObj.lang != 'en';
      const logPrefix = reqObj.id + ' ' + 'PROXY RESPONSE ';
      Logger.info(`needTranslation=${needTranslation}  isHtml=${isHtml} reqObj.lang=${reqObj.lang}`)
      let body = [];

      logProxyResponse(proxyRes, reqObj);

      let headers = Object.assign({}, proxyRes.headers);
      if (needTranslation) {
        headers['access-control-allow-origin'] = reqObj.host;
        delete headers['transfer-encoding'];
      }

      const savedRes = {
        statusCode: proxyRes.statusCode,
        statusMessage: proxyRes.statusMessage,
        lang: reqObj.lang,
        href: reqObj.href,
        encoding,
        headers
      };
      Logger.debug('SAVED PROXY RES');
      Logger.debug(savedRes);
      if (!(needTranslation)) {
        if(isHtml){
          //clear cookie since we don't need translation
          const cookies = headers['set-cookie'] || [];
          cookies.push(`SELECTEDLANG=${lang};path=/;max-age=0`);
          headers['set-cookie'] = cookies;
        }
        res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, headers)
      }
      //proxyRes.setEncoding('utf8');

      proxyRes.on('error', (e) => {
        Logger.error(logPrefix + 'ERROR');
        serviceUnavailable(e, res);
      });

      proxyRes.on('data', (chunk) => {
        Logger.debug(logPrefix + 'DATA');
        body.push(chunk);
        if (!needTranslation) res.write(chunk);
      });

      proxyRes.on('end', () => {
        if (!needTranslation) {
          Logger.info(logPrefix + 'END WITHOUT PROCESSING');
          res.end();
        }
        const buffer = Buffer.concat(body);
        savedRes.headers['content-length'] = buffer.length;
        ResponseCache.save(reqObj, null, savedRes, buffer);
        if (needTranslation) {
          ResponseHandler.sendTranslation(res, buffer, reqObj, savedRes, logPrefix);
        }
      });
    });

    proxyReq.on('error', (e) => {
      Logger.error(reqObj.id + ' PROXY REQUEST ERROR');
      serverError(e, res);
    });

    req.on('data', (chunk) => {
      Logger.debug(reqObj.id + ' CLIENT REQUEST DATA');
      proxyReq.write(chunk);
    });

    req.on('end', () => {
      Logger.info(reqObj.id + ' CLIENT REQUEST END');
      proxyReq.end();
    });
  };
};
