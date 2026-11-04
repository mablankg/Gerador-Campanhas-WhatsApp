const { authorize, upstream, method, safeError } = require("../lib/whatsapp");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store"); if (!method(req,res,"GET")) return;
  const config=authorize(req,res); if(!config)return; const id=String(req.query?.id||"");
  if(!/^[0-9-]+@g\.us$/.test(id)) return res.status(400).json({error:"invalid_group_id"});
  try { const result=await upstream(config,`/v1/groups/${encodeURIComponent(id)}/messages`); res.status(result.status).json(result.body); }
  catch(error){ safeError(res,error); }
};

