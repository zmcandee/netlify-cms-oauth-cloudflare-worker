# Netlify-cms-oauth-cloudflare-worker

This repo mimics the [netlify](https://www.netlify.com/) github oauth client using [Cloudflare Workers](https://workers.dev) to enable github logins to [netlify-cms](https://www.netlifycms.org/) sites.

The code was drived from the plethora of other implementations in other languages: [Netlify-CMS External OAuth Clients](https://www.netlifycms.org/docs/external-oauth-clients/).

## Create Oauth App
Information is available on the [Github Developer Documentation](https://developer.github.com/apps/building-integrations/setting-up-and-registering-oauth-apps/registering-oauth-apps/),  Fill out the fields however you like, except for **authorization callback URL**. This is where Github or Gitlab will send your callback after a user has authenticated, and should be `https://netlify-cms-oauth-cloudflare-worker.[subdomain].workers.dev/callback` for use with this repo.

## Install Locally

### 1) Pre-Requisites

- git
- [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update)

### 2) Clone Repo Locally

```bash
git clone https://github.com/zmcandee/netlify-cms-oauth-cloudflare-worker
cd netlify-cms-oauth-cloudflare-worker
```

### 3) Config

- Set `account_id` in `wrangler.toml`
- Set `CF_API_TOKEN` in [github secrets](https://docs.github.com/en/actions/reference/encrypted-secrets)
- Set subdomain in Cloudflare using wrangler CLI: 
```bash
wrangler subdomain [SUBDOMAIN]
```
- Set [Cloudflare secrets](#Cloudflare_Secrets) in Cloudflare using wrangler CLI: 
```bash
wrangler secret put [VAR]
```

### 4) Publish

Publish to Cloudflare from wrangler CLI: 
```bash
wrangler publish
```

## Install Remotely

### 1) Fork Repo

### 2) Set Secrets

- Set [secrets](#Cloudflare Secrets) in [github secrets](https://docs.github.com/en/actions/reference/encrypted-secrets)
- Add secrets to `.github/workflows/deploy.yml`:
```yaml
jobs:
  deploy:
    steps:
      uses: cloudflare/wrangler-action@1.2.0
      with:
        apiToken: ${{ secrets.CF_API_TOKEN }}
        secrets: |
            GH_CLIENT_ID
            GH_CLIENT_SECRET
            GH_SCOPE
            STATE_SECRET
            EXTRA_WRITABLE_JSON
            GH_REPO
      env:
        GH_CLIENT_ID: ${{ secrets.GH_CLIENT_ID }}
        GH_CLIENT_SECRET: ${{ secrets.GH_CLIENT_SECRET }}
        GH_SCOPE: ${{ secrets.GH_SCOPE }}
        STATE_SECRET: ${{ secrets.STATE_SECRET }}
        EXTRA_WRITABLE_JSON: ${{ secrets.EXTRA_WRITABLE_JSON }}
        GH_REPO: ${{ secrets.GH_REPO }}
```
- Setup subdomain at [Cloudflare Workers](https://workers.dev)

### 3) Publish Worker

- Run the deploy workflow from github to deploy to Cloudflare


## Cloudflare Secrets

|VAR|Description|Value (Example)|
|---|-----------|---------------|
|GH_CLIENT_ID|Github OAuth app client ID.|`dabbaabbadeadbeef`|	
|GH_CLIENT_SECRET|Github OAuth app client Secret.|`decafc0ffeebeeffeed`|	
|GH_SCOPE|Github client authorization scope.|`public_repo,read:user`|	
|STATE_SECRET|[*Optional*]Random secret string used for hashing the state passed during authorization.|`superrandomlongstringforsecretstate`|
|EXTRA_WRITABLE_JSON|[*Optional*]Extra JSON to pass along when `GH_REPO` is writable by the user.|`{"S3_TOKEN":"abbadabbadabbad00d00"}`|	
|GH_REPO|[*Optional*]Repo to verify writability of before passing `EXTRA_WRITABLE_JSON`|`[user]/[repo]`|	

