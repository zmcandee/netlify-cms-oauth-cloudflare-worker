addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

// Secrets
const gh_scope = encodeURIComponent(GH_SCOPE || "repo,read:user");
const gh_client_id = encodeURIComponent(GH_CLIENT_ID);
const gh_client_secret = GH_CLIENT_SECRET;
const gh_repo = encodeURIComponent(GH_REPO);
const state_secret = STATE_SECRET || "random_string";
const extra_writable_json = JSON.parse(EXTRA_WRITABLE_JSON);

// Urls
const authUrl = `https://github.com/login/oauth/authorize?response_type=code&client_id=${gh_client_id}&scope=${gh_scope}`;
const tokenUrl = "https://github.com/login/oauth/access_token";
const apiBaseUrl = "https://api.github.com"

/**
 * A quick 64b hash of a secret salted with time to create a semi-unique but verifiable number while avoiding the 
 * need to keep state
 */
const stateString = (s, t=Date.now()) => {
  const h1 = quickHash(s+t)
  return h1+quickHash(h1+s+t)+t.toString(16)
}

/**
 * Verifies that the hash is recreateable and from the recent past (defaults to 5min) 
 */
const verifyState = (state,secret,ttl=5*60*1000) => {
  if(typeof state == "undefined")
    return false
  const now = Date.now() 
  const time = parseInt(state.substr(16),16)
  const hash = stateString(secret,time)
  const delta = (now-time)

  return (delta < ttl) && (delta >= 0) && (hash === state)
}

/**
 * A quick 32b FNV-1a hash from (https://stackoverflow.com/a/22429679)
 */
const quickHash = (s) => {
  let i, hval = 0x811c9dc5    
  for(i=0; i<s.length; i++) {
    hval ^= s.charCodeAt(i)
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24)
  }
  return  ("0000000" + (hval >>> 0).toString(16)).substr(-8)
}

async function githubUser( token ) {
  const githubUser = await fetch(`${apiBaseUrl}/user`, 
    { method: "GET",
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/json",
        "user-agent": "netlify-cms-oauth-cloudflare-worker"
      }
    }).then(res => res.status > 200 ? res.status : res.json())
  return githubUser
}

async function githubRepoAccess(user, repo, token) {
  const url = `${apiBaseUrl}/repos/${repo}/collaborators/${user}/permission`
  console.log(url)
  const githubRepo = await fetch(url, 
    { method: 'GET',
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/json",
        "user-agent": "netlify-cms-oauth-cloudflare-worker"
      }
    }).then(res => res.status == 200 ? res.json() : "none")
  return githubRepo
}

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
  const requestURL = new URL(request.url)
  const path = requestURL.pathname
  
  if(path === "/auth") {
    const state = stateString(state_secret)
    return Response.redirect(authUrl+`&state=${state}`)
  }
  
  if(path === "/callback") {
    const params = {}
    const queryStr = requestURL.search.slice(1).split("&")
    queryStr.forEach(item => {
      const kv = item.split("=")
      if (kv[0])
        params[kv[0]] = kv[1] || true
    })
    console.log(params)
    const data = {
      code: params.code,
      state: params.state,
      client_id: gh_client_id,
      client_secret: gh_client_secret
    };

    // Return 401 on a ttl state violation,
    if (!verifyState(params.state,state_secret))
      return new Response("Session expired", {status: 401 })

    try {
      const results = await fetch(
        tokenUrl,
        { method: "POST",
        body: JSON.stringify(data), 
        headers: {
          // GitHub returns a string by default, ask for JSON to make the reponse easier to parse.
          "Accept": "application/json",
          "content-type": "application/json"
        } 
      }).then(res => res.json())
      
      const token = results.access_token
      const ghuser = (await githubUser(token)).login
      const ghrepoaccess = (await githubRepoAccess(ghuser, gh_repo, token)).permission
      console.log("ghuser: "+ghuser)
      let postMsgStatus = ""
      let postMsgContent = {}

      if ("error" in results) {
        postMsgStatus = "error"
        postMsgContent = {
          error: results.error,
          provider: "github"
        }
      } else {
        postMsgStatus = "success"
        postMsgContent = {
          token: results.access_token,
          scope: results.scope,
          provider: "github",
          user: ghuser,
          permission: ghrepoaccess
        }
        // Send extra json if user has write or access to gh_repo
        if (ghrepoaccess === "admin" || ghrepoaccess === "write") {
          console.log("Providing extra JSON")
          postMsgContent = Object.assign(postMsgContent, extra_writable_json);
        }
      }
      // This is what talks to the NetlifyCMS page. Using window.postMessage we give it the
      // token details in a format it's expecting
      const script = `<html><head></head><body>
      <script>
      (function() {
        function recieveMessage(e) {
          console.log("recieveMessage %o", e);
          // send message to main window with the app
          window.opener.postMessage('authorization:github:${postMsgStatus}:${JSON.stringify(postMsgContent)}', e.origin);
        }
        window.addEventListener("message", recieveMessage, false);
        window.opener.postMessage("authorizing:github", "*");
      })()
      </script></body></html>`;

      return new Response(script, {headers:{'content-type': 'text/html'}});

    } catch (err) {
      // If we hit an error we'll handle that here
      console.log(err);
      return new Response(err.stack || err, { status: 500 });
    }
  }
  
  return new Response("<a href=\""+authUrl+"\">Login with Github</a>", {status: 200,headers:{'content-type': 'text/html'}})
}
