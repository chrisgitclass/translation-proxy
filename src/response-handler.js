
import cheerio from 'cheerio';

import Logger from './logger.js';
import { compressAsync, uncompressAsync } from './compress.js';

export const TranslationNotAvailable =
`<script>
  function displayAlert() { alert('Translation service is currently not available. Please try again later.') };
  setTimeout(displayAlert, 1000);
</script>`;

export const TooLargePage =
`<script>
  function displayAlert() { alert('The requested page is too large to translate.') };
  setTimeout(displayAlert, 1000);
</script>`;

const injectAlert = (html, err) => {
  try {
    const $ = cheerio.load(html);
    if (err.error && err.error === 'Too Large Page') {
      $(TooLargePage).appendTo('body');
    } else {
      $(TranslationNotAvailable).appendTo('body');
    }
    return $.html();
  }
  catch (err) {
    Logger.error('INJECTALERT ERROR');
    Logger.error(err);
    return html;
  }
}

export const setUpResponseHandler = (translateFunc, cacheHandler) => {
  const ResponseHandler = {};

  const translator = translateFunc;
  const ResponseCache = cacheHandler;

  ResponseHandler.sendNotModified = (res, proxyResObj, logPrefix) => {
    Logger.info(logPrefix + 'END: RETURNING 304');
    res.writeHead(304, 'Not Modified', proxyResObj.headers)
    res.end();
  }

  ResponseHandler.sendBuffer = (res, buffer, proxyResObj, logPrefix) => {
    //console.log(logPrefix + ': ' + buffer.length + ' == ' + proxyResObj.headers['content-length']);
    Logger.info(`${logPrefix}: ${buffer.length} == ${proxyResObj.headers['content-length']}   cookies=${proxyResObj.headers['set-cookie']}`);
    res.writeHead(proxyResObj.statusCode, proxyResObj.statusMessage, proxyResObj.headers)
    res.end(buffer);
  }

  ResponseHandler.sendTranslation = async (res, buffer, reqObj, proxyResObj, logPrefix, scripts, styles) => {
    const doc = await uncompressAsync(buffer, proxyResObj.encoding);
    let gzipped;
    let pageType = 'TRANSLATED PAGE';

    translator.translatePage(doc, proxyResObj.lang, async (err, translatedHtml) => {
      if (err) {
        Logger.error(logPrefix + 'TRANSLATION FAILED');
        Logger.error(err);
        pageType = 'ERROR INJECTED PAGE';
        gzipped = await compressAsync(injectAlert(doc, err), proxyResObj.encoding);
        proxyResObj.headers['content-length'] = gzipped.length;
      } else {
        //now add back in scripts....
        if(scripts && scripts.length > 0){
          console.log(`translatedHtml length pre is ${translatedHtml.length}`);
          const $ = cheerio.load(translatedHtml);
          scripts.forEach((v,i) => {
            const scriptAdd = `<script>${v.children[0].data}</script>`;
            console.log(`ADDING ${scriptAdd.length}`);
            $('body').append(scriptAdd);
          });
          translatedHtml = $.html();
          console.log(`translatedHtml length post is ${translatedHtml.length}`);
        }
        //now add back in styles....
        if(styles && styles.length > 0){
          console.log(`translatedHtml no style length pre is ${translatedHtml.length}`);
          const $ = cheerio.load(translatedHtml);
          styles.forEach((v,i) => {
            const styleAdd = `<style type="text/css" id="${v.attribs.id}">${v.children[0].data}</style>`;
            console.log(`ADDING style ${styleAdd}`);
            $('body').append(styleAdd);
          });
          translatedHtml = $.html();
          console.log(`translatedHtml with style length post is ${translatedHtml.length}`);
        }



        gzipped = await compressAsync(translatedHtml, proxyResObj.encoding);
        proxyResObj.headers['content-length'] = gzipped.length;
        ResponseCache.save(reqObj, proxyResObj.lang, proxyResObj, gzipped);
      }
      const cookies = proxyResObj.headers['set-cookie'] || [];
      cookies.push(`SELECTEDLANG=${proxyResObj.lang};path=/;`);
      proxyResObj.headers['set-cookie'] = cookies;
     //console.log(logPrefix + 'END: RETURNING ' + pageType + ': ' + proxyResObj.headers['content-length']);
      Logger.info(logPrefix + 'END: RETURNING ' + pageType + ': ' + proxyResObj.headers['content-length']);
      res.writeHead(proxyResObj.statusCode, proxyResObj.statusMessage, proxyResObj.headers);
      res.end(gzipped);
    });
  };

  return ResponseHandler;
};
