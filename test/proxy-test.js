
//import express from 'express';
import http from 'http';
import fs from 'fs';
import util from 'util';
import { expect } from 'chai';
import nock from 'nock';
import events from 'events';
import { Writable } from 'stream';

import httpMocks from 'node-mocks-http';

import { loadConfig } from '../src/conf.js';
import Logger from '../src/logger.js';
import createResponseCache from '../src/response-cache.js';
import { setUpProxy, clientError } from '../src/proxy.js';

const serverHttpPort  = 9996;
const serverHttpsPort = 9997;
const targetHttpPort  = 9998;
const targetHttpsPort = 9999;

let conf = loadConfig('./config/config.json', {
  "cacheEnabled": true,
  "cacheSkip": ["do-not-cache-if-url-contains"],
  "proxiedHosts": {
    "localhost": true,
    "127.0.0.1": true,
    "spo.hawaii.gov": true
  },
  "translationSelectors": ["#header", "#main", "#footer"],
  "maxTextPerRequest": 12000,
  "domBreakdownThreshold": 250,
  "keyPath": "/path/to/key.json",
  "gcloudPath": "/path/to/google-cloud-sdk/bin/gcloud",
  "serverHttpPort": serverHttpPort,
  "serverHttpsPort": serverHttpsPort,
  "targetHttpPort": targetHttpPort,
  "targetHttpsPort": targetHttpsPort,
  "sslCert": "./certs/test.pem",
  "sslKey": "./certs/test.key",
  "reidsPort": 6379,
  "enableLog": true,
  "logLevel": "debug",
  "logDir": "./logs"
});
//const conf = {
//  "cacheEnabled": true,
//  "cacheSkip": ["do-not-cache-if-url-contains"],
//  "proxiedHosts": ["loccalhost"],
//  "translationSelectors": ["#header", "#main", "#footer"],
//  "maxTextPerRequest": 12000,
//  "domBreakdownThreshold": 250,
//  "keyPath": "/path/to/key.json",
//  "gcloudPath": "/path/to/google-cloud-sdk/bin/gcloud",
//  "serverHttpPort": serverHttpPort,
//  "serverHttpsPort": serverHttpsPort,
//  "targetHttpPort": targetHttpPort,
//  "targetHttpsPort": targetHttpsPort,
//  "sslCert": "./certs/test.pem",
//  "sslKey": "./certs/test.key",
//  "reidsPort": 6379,
//  "enableLog": true,
//  "logLevel": "debug",
//  "logDir": "./logs"
//};
//Logger.initialize(conf);

const doc = `
  <html>
    <head>
      <title>Test</title>
    </head>
    <body>
      <div>Hello, World!</div>
    </body>
  </html>
`;

const translatedDoc = `
  <html>
    <head>
      <title>Tanslated</title>
    </head>
    <body>
      <div>Konnichiwa, Sekai!</div>
    </body>
  </html>
`;

const buffer = Buffer.from(doc);
const resHeader = {
  statusCode: 200,
  statusMessage: 'OK',
  lang: null,
  href: 'http://localhost/path/to',
  encoding: 'gzip',
  headers: {
    'content-encoding': 'gzip',
    'content-type': 'text/thml'
  }
};
const reqObj1 = {
  id: 1,
  href: 'http://localhost/path/to',
  protocol: 'http:',
  method: 'GET',
  //host: 'localhost',
  hostname: 'localhost',
  port: serverHttpPort,
  path: '/path/to',
};

const reqObj2 = {
  id: 2,
  href: 'http://localhost/path/to',
  protocol: 'http:',
  method: 'GET',
  host: 'localhost',
  //port: serverHttpPort,
  port: targetHttpPort,
  path: '/path/to',
};

const reqObj3 = {
  id: 3,
  href: 'http://localhost',
  protocol: 'http:',
  method: 'GET',
  //host: 'localhost',
  hostname: 'localhost',
  port: serverHttpPort,
  path: '/',
};

const reqObj4 = {
  id: 4,
  href: 'http://spo.hawaii.gov',
  protocol: 'http:',
  method: 'GET',
  //host: 'localhost',
  hostname: 'spo.hawaii.gov',
  port: serverHttpPort,
  path: '/',
};

const translator = {
  translatePage: (html, lang, callback) => {
    callback(null, translatedDoc);
  }
};

const proxyFunc = (res, agent, reqObj) => {
  console.log('FAKE PROXY WAS CALLED');
  res.writeHead(200, 'OK', {
    //'content-encoding': 'gzip',
    'content-length': buffer.length,
    'content-type': 'text/thml'
  });
  //res.end(buffer);
  res.write(doc);
  res.end();
  res.emit('end');
  res.emit('finish');
  return httpMocks.createRequest({
      method: 'GET',
      url: 'http://localhost:9998/path/to',
      headers: {
        host: 'localhost:9998',
      },
      connection: { encrypted: false }
    });
};


nock('http://localhost:9998').get('/path/to').reply(200, doc);
//nock('http://localhost:9998').get('/path/to').reply(404);

const reqObj = reqObj1;

const createFakeAgent = () => {
  return {
    request: (opts) => {
      console.log('FAKE AGENT REQUEST CALLED');
      console.log(opts);
      //const res = httpMocks.createResponse({
      //  writableStream: Writable,
      //  eventEmitter: events.EventEmitter
      //});
      const res = new http.IncomingMessage();
      res.emit('data', doc);
      res.emit('end');
      return res;
    }
  }
}

describe('proxy#startProxyRequest', () => {
  const proxy = setUpProxy(conf, translator);
  let req;
  let res;

  before((done) => {
    req = httpMocks.createRequest({
      method: 'GET',
      url: 'http://localhost:9998/path/to',
      //host: 'localhost:9996',
      //hostname: 'localhost',
      headers: {
        host: 'localhost:9998',
      },
    });
    res = httpMocks.createResponse({
      writableStream: Writable,
      eventEmitter: events.EventEmitter
    });
    done();
    //ResponseCache.save(reqObj, null, resHeader, buffer).then(done());
    //ResponseCache.del(reqObj, null).then(done());
  });

  context('With cache', () => {
    it('sends a request to the specified web server', (done) => {
      res.on('end', () => {
        console.log('XXX RES END');
        expect(res.statusCode).to.be.equal(200);
        expect(res.statusMessage).to.be.equal('OK');
        const data = res._getData();
        console.log('--------------------------------------------');
        console.log(data);
        console.log('--------------------------------------------');
        done();
      });
      const agent = createFakeAgent();
      proxy.startProxyRequest(res, agent, reqObj2);
    });
  });
});

//    const url = 'http://localhost:' + serverHttpPort;

//describe('proxy#serve', () => {
//  const ResponseCache = createResponseCache(conf);
//  let req;
//  let res;
//  let cache;
//
//  before((done) => {
//    req = httpMocks.createRequest({
//      method: 'GET',
//      url: 'http://localhost:9996/path/to',
//      //host: 'localhost:9996',
//      //hostname: 'localhost',
//      headers: {
//        host: 'localhost:9996',
//      },
//      connection: { encrypted: false }
//    });
//    res = httpMocks.createResponse({
//      //writableStream: true,
//      //eventEmitter: events.EventEmitter
//    });
//    //ResponseCache.save(reqObj, null, resHeader, buffer).then(done());
//    ResponseCache.del(reqObj, null).then(done());
//  });
//
//  after((done) => {
//    ResponseCache.del(reqObj, null).then(done());
//  });
//
//  context('With cache', () => {
//    it('sends a request to the specified web server', (done) => {
//      const proxy = setUpProxy(conf, translator, proxyFunc, () => {
//        expect(res.statusCode).to.be.equal(200);
//        expect(res.statusMessage).to.be.equal('OK');
//        const data = res._getData();
//        console.log('--------------------------------------------');
//        console.log(data);
//        console.log('--------------------------------------------');
//        done();
//      });
//      proxy.serve(req, res);
//    });
//  });
//});
