
import Logger from './logger.js';
import { serverError, serviceUnavailable } from './error-handler.js';
import { getCookie } from './cookie.js'
import cheerio from 'cheerio';
import { compressAsync, uncompressAsync } from './compress.js';
import { config } from 'chai';

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
  if(opts.path.includes("fontawe")){
    Logger.info("doing fontawesome");
  }
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

const convertHttpToHttps = (reqOpts, conf) => {
  const re = /http/gi;
  Object.keys(reqOpts).forEach(key => {
    if (typeof(reqOpts[key]) === 'string' && reqOpts[key].indexOf('https') < 0 && reqOpts[key].indexOf('http') >= 0 ) {
      reqOpts[key] = reqOpts[key].replace(re, 'https');
    }
    if (typeof(reqOpts[key]) === 'string' && reqOpts[key].indexOf('https') < 0 && reqOpts[key].indexOf('http') >= 0 ) {
      reqOpts[key] = reqOpts[key].replace(re, 'https');
    }
    if (typeof(reqOpts[key]) === 'string' ) {
      reqOpts[key] = reqOpts[key].replace(conf.serverHostName, conf.serverTargetName);
    }
    if ( reqOpts[key] == 80 ) {
      reqOpts[key] = 443;
    }
    else if (typeof(reqOpts[key]) === 'object'){
      Object.keys(reqOpts[key]).forEach(key2 => {
        if (typeof(reqOpts[key][key2]) === 'string' && reqOpts[key][key2].indexOf('https') < 0 && reqOpts[key][key2].indexOf('http') >= 0 ) {
          console.log(reqOpts[key][key2]);
          reqOpts[key][key2] = reqOpts[key][key2].replace(re, 'https');
          console.log(reqOpts[key][key2]);
        }
        if (typeof(reqOpts[key][key2]) === 'string' ) {
          reqOpts[key][key2] = reqOpts[key][key2].replace(conf.serverHostName, conf.serverTargetName);
        }
        if ( reqOpts[key][key2] == 80 ) {
          reqOpts[key][key2] = 443;
        }
      });            
    }
  });
}

const RemoveScriptsAndStyles = ($,scripts, styles) => {
  // temporarily remove all script and styles before translation...., translation will readd them.
  if($('body > script').length > 0){
    $('body > script').each((i,e) => {
      console.log(`${i}=${JSON.stringify(e.attribs['src'])}`);
      if(!e.attribs['src']){
        scripts.push(e);
      }
    });
    $('body > script').each(function(){ 
      if(!$(this).attr("src")){
          $(this).remove();  
      } 
    });
  }
  if($('body > style').length > 0){
    $('body > style').each((i,e) => {
      console.log(`${i}=${JSON.stringify(e.attribs['src'])}`);
        styles.push(e);
    });
    $('body > style').each(function(){ 
      $(this).remove();  
    });
  }
}

export const setUpMiddleProxy = (responseHandler, agentSelector, cacheHandler, callback, conf) => {
  const ResponseHandler = responseHandler;
  const AgentSelector = agentSelector;
  const ResponseCache = cacheHandler;

  return (req, res, next) => {
    const reqObj = res.locals.reqObj;
    let reqOpts = genReqOpts(reqObj);
    const agent = AgentSelector.select(req, conf);
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

   
    Logger.info(`-----reqOpts ${JSON.stringify(reqOpts)}`);

    // Do remote call?
    const thost = conf.targetHostName;    
    if(thost){
      // if separate hostname for target then replace
      // all host with the targetname
      let jopt = JSON.stringify(reqOpts);
      const regExp = new RegExp(reqOpts.host, 'g');
      jopt = jopt.replace(regExp, thost);
      reqOpts = JSON.parse(jopt);
    }
    
    Logger.info(`-----reqOpts2 ${JSON.stringify(reqOpts)}`);
    convertHttpToHttps(reqOpts, conf);
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    const proxyReq = agent.request(reqOpts, (proxyRes) => {
      const encoding = proxyRes.headers['content-encoding'];
      const isHtml = /text\/html/.test(proxyRes.headers['content-type']);
      /// SELECTEDLANG COOKIE STUFF
      const cookieLang = getCookie('SELECTEDLANG', req);
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
      if(isHtml){
        console.log('----------------------HTML-----------------');
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

      proxyRes.on('end', async () => {
        if (!needTranslation) {
          Logger.info(logPrefix + 'END WITHOUT PROCESSING');
          res.end();
          return;
        }
        let buffer = Buffer.concat(body);


        const shost = conf.serverHostName;
        const scripts = [];
        const styles = [];
        if(shost){
          // replace hrefs in header to target serverhost
          let doc = await uncompressAsync(buffer, savedRes.encoding);
          const $ = cheerio.load(doc);
          const reg = new RegExp(reqOpts.host, "g");
          $('head')[0].children.forEach(c =>{
            if(c.attribs && c.attribs.href) {
              c.attribs.href = c.attribs.href.replace(reg, shost);
            }
          });
          RemoveScriptsAndStyles($, scripts, styles);
          doc = $.html();
          buffer = await compressAsync(doc, savedRes.encoding);
        }

        savedRes.headers['content-length'] = buffer.length;
        ResponseCache.save(reqObj, null, savedRes, buffer);
        if (needTranslation) {
          ResponseHandler.sendTranslation(res, buffer, reqObj, savedRes, logPrefix, scripts, styles);
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
