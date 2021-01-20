
import http from 'http';
import https from 'https';

const AgentSelector = {};

AgentSelector.select = (req, conf) => {
  // for 
  if(conf.httpOnly){
    return https;
  }
  return (req.connection.encrypted) ? https : http;
}

export default AgentSelector;
