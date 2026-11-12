// Release configuration must contain only the known empty credential literals.
export function assertEmptyCredentials(config){
 for(const field of ['host','name','user','password','installation_key']){
  const matches=[...config.matchAll(new RegExp("'"+field+"'\\s*=>\\s*([^\\n,]+)",'g'))];
  if(matches.length!==1||matches[0][1].trim()!=="''")throw Error('Private credential or unexpected configuration: '+field);
 }
 for(const field of ['client_id','client_secret','base_url']){
  const matches=[...config.matchAll(new RegExp("'" + field + "'\\s*=>\\s*([^,\\]\\n]+)",'g'))];
  if(matches.length&&(matches.length!==1||matches[0][1].trim()!=="''"))throw Error('Unexpected Strava configuration: '+field);
 }
}
