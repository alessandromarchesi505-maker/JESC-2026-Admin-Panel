// Private JESC 2026 admin website (separate workers.dev address).
// No separate database: both Workers connect to the SAME Durable Object.
// The ADMIN_PASSWORD secret is set on the public Voting Worker only.
const ALLOWED_ASSETS = new Set(['/static/styles.css','/static/admin.js','/static/favicon.svg']);
const ADMIN_ENDPOINTS = new Set(['/admin/login','/admin/logout']);
const SECURITY = {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Cache-Control':'no-store',
};
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const path=url.pathname;
    const method=request.method;
    if(path==='/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
    // Only serve the administrative interface. No public vote routes here.
    const permitted=(method==='GET' && (path==='/'||path==='/admin'||ALLOWED_ASSETS.has(path)||path==='/api/admin/dashboard'||path==='/api/admin/export.csv'))
      || (method==='POST' && (ADMIN_ENDPOINTS.has(path)||path.startsWith('/api/admin/')));
    if(!permitted) return new Response('Nicht gefunden.',{status:404,headers:SECURITY});
    // / is the private admin homepage; in the backing Durable Object this is /admin.
    if(path==='/') url.pathname='/admin';
    const source=new Request(url.toString(),request);
    // This external DO binding points to VotingRoom in jesc-2026-televote.
    // It is NOT an HTTP request to the public voting site and bypasses the
    // voting site's public-route filter, while sharing the exact same database.
    const response=await env.VOTING.getByName('jesc-2026-main-vote').fetch(source);
    if(method==='GET'&&(path==='/'||path==='/admin')&&response.ok) {
      let html=await response.text();
      // Hide dead links back to / (which is admin on this dedicated domain).
      // If you set PUBLIC_SITE_URL as an optional variable on this admin worker,
      // links to the audience-facing website are displayed and functional.
      let publicUrl='';
      if(typeof env.PUBLIC_SITE_URL==='string'){
        try {
          const parsed=new URL(env.PUBLIC_SITE_URL);
          if(parsed.protocol==='https:' && !parsed.username && !parsed.password){
            publicUrl=parsed.origin+'/';
          }
        } catch {}
      }
      if(publicUrl) {
        html=html.replaceAll('href="/" class="back-link"',`href="${publicUrl}" class="back-link"`)
          .replaceAll('href="/" class="side-open-link"',`href="${publicUrl}" class="side-open-link"`);
      } else {
        html=html.replace(/<a href="\/" class="back-link">[^<]*<\/a>/g,'')
          .replace(/<a href="\/" class="side-open-link">[^<]*<\/a>/g,'');
      }
      const headers=new Headers(response.headers);
      for(const [k,v] of Object.entries(SECURITY))headers.set(k,v);
      return new Response(html,{status:response.status,headers});
    }
    return response;
  }
};
