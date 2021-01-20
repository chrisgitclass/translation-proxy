
import fs from 'fs';
import dotenv from 'dotenv';
import { loadConfig } from './conf.js';
import Logger from './logger.js';
import { createProxyServer } from './proxy.js';

dotenv.config();

const usage = () => {
  console.log('');
  console.log('USAGE: npm run exec -- [CONFIGFILE]');
  console.log('USAGE: node dist/server.js [CONFIGFILE]');
  console.log('');
  console.log('CONFIGFILE:     default ./config/config.json');
  console.log('');
};

const DEFAULT_CONF = './config/config.json';
let filename = DEFAULT_CONF;

if (process.argv.length > 3) {
  usage();
  process.exit();
}

if (process.argv.length == 3) {
  filename = process.argv[2];
}
if (!fs.existsSync(filename)) {
  console.log('Config File Not Found: ' + filename + "\n");
  usage();
  process.exit();
}

const updates = {
  serverHostName: process.env['APP_SERVER_HOSTNAME'],
  serverHttpPort: process.env['PORT'] || process.env['APP_SERVER_HTTPPORT'],
  serverHttpsPort: process.env['APP_SERVER_HTTPSPORT'],
  targetHostName: process.env['APP_TARGET_HOSTNAME'],
  targetHttpPort: process.env['APP_TARGET_HTTPPORT'],
  targetHttpsPort: process.env['APP_TARGET_HTTPSPORT'],
  googlePrivateKey: process.env['APP_GOOGLE_PRIVATE_KEY'],
  googlePrivateKeyId: process.env['APP_GOOGLE_PRIVATE_KEY_ID'],
  googleIssuer: process.env['APP_GOOGLE_ISSUER'],
  googleAudience: process.env['APP_GOOGLE_AUDIENCE'],
  googleSubject: process.env['APP_GOOGLE_SUBJECT'],
  googleScope: process.env['APP_GOOGLE_SCOPE'],
  enableLog: process.env['APP_ENABLE_FILE_LOG'] === 'true' ? true : false,
  logLevel: process.env['APP_LOG_LEVEL'],
  logDir: process.env['APP_LOG_DIR'],
  proxiedHosts: process.env['APP_PROXIED_HOSTS'].split(','),
  translationSelectors: process.env['APP_TRANSLATION_SELECTORS'].split(','),
  purgeAllowedIps: process.env['APP_PURGE_ALLOWED_IPS'].split(','),
  cacheEnabled: process.env['APP_CACHE_ENABLED'] === 'true' ? true : false,
  redisHost: process.env['APP_REDIS_HOST'],
  redisPort: process.env['APP_REDIS_PORT'],
  httpOnly: process.env['APP_HTTP_ONLY'] === 'true' ? true : false,
}
const conf = loadConfig(filename, updates);

Logger.initialize(conf);

const server = createProxyServer(conf);
server.start();

