You are adding the new SWGDE Compliance page to WRL's site navigation and LLMs index.

## Files to modify

### 1. site/_data/site.js

Add a new entry to the "Security & Compliance" nav section. Place it as the LAST item in the children array, after "Data Retention":

```js
{ title: "SWGDE Compliance", url: "/security/swgde-compliance/" },
```

### 2. site/content/llms.njk

Add a new line to the "## Docs" section, after the "Data Retention" entry:

```
- [SWGDE Compliance](https://docs.webresourceledger.com/security/swgde-compliance/): SWGDE 21-F-001 v1.1 alignment mapping for forensic web capture
```

Note: Include the version number (v1.1) in the description per SEO review advisory.

## What NOT to do

- Do not modify any other files
- Do not change the nav section name or reorder existing entries
